// -*-Mode: C++;-*-
//
// GROMACS XTC binary trajectory file reader
//

#include <common.h>

#include "XtcTrajReader.hpp"

#include <qlib/FileStream.hpp>
#include "TrajBlock.hpp"
#include "Trajectory.hpp"
#include "XdrInStream.hpp"

#include <qlib/LExceptions.hpp>

#include <memory>
#include <mutex>
#include <utility>
#include <vector>

using namespace mdtools;
using qlib::LString;

namespace {
// GROMACS XTC magic numbers (big-endian XDR). XTC_NEW_MAGIC (2023) uses a
// 64-bit length for the compressed data block ("long" format).
const qint32 XTC_MAGIC = 1995;
const qint32 XTC_NEW_MAGIC = 2023;

// GROMACS stores <= 9 atoms uncompressed.
const int XTC_MAX_NATOMS_UNCOMPRESSED = 9;

// Fixed part of a frame, in bytes, used to walk the file without decoding it.
//
//   magic, natoms, step (3 x i32) + time (f32) + box (9 x f32) + natoms again
const qint64 XTC_SMALL_HEADER_SIZE = 56;
//   .. + precision (f32) + minint[3] + maxint[3] (6 x i32) + smallidx (i32)
const qint64 XTC_HEADER_SIZE = XTC_SMALL_HEADER_SIZE + 32;
// The compressed-block length follows the header: i32, or i64 in "long" format.
const qint64 XTC_NBYTES_SIZE = 4;
const qint64 XTC_NBYTES_SIZE_LONG = 8;
// Uncompressed coordinates (natoms <= 9): 3 floats per atom, no length field.
const qint64 XTC_SMALL_COORDS_SIZE = 12;

/// XDR pads opaque data to a multiple of 4 bytes.
qint64 pad4(qint64 n)
{
    return (n + 3) & ~static_cast<qint64>(3);
}
}  // namespace

namespace mdtools {

/// The buffers one frame decode works through. Each is sized by the atom
/// count (about 100 MB together at 3.9M atoms), which is why they are reused
/// rather than allocated per frame.
struct XtcDecodeScratch
{
    std::vector<qfloat32> filecrd;
    std::vector<char> compressed;
    std::vector<qint32> intbuf;
};

/// Decode buffers lent to background decodes, one set per decode in progress.
///
/// They used to be thread_local, which kept a set alive on every worker thread
/// that had ever run a decode. The prefetch keeps only a few decodes going,
/// but the pool hands each to whichever thread is free, so over a playback
/// every thread ended up holding a set: about 2.5 GB of buffers at 3.9M atoms
/// on a 32-thread machine, for no speed. Lending them out bounds the sets by
/// how many decodes run at once instead.
class XtcScratchPool
{
public:
    /// A set borrowed for the lifetime of the lease, handed back after, also
    /// when the decode throws.
    class Lease
    {
    public:
        explicit Lease(XtcScratchPool &pool) : m_pool(pool), m_p(pool.acquire()) {}
        ~Lease() { m_pool.release(std::move(m_p)); }
        Lease(const Lease &) = delete;
        Lease &operator=(const Lease &) = delete;
        XtcDecodeScratch &get() { return *m_p; }

    private:
        XtcScratchPool &m_pool;
        std::unique_ptr<XtcDecodeScratch> m_p;
    };

    int createdCount() const
    {
        std::lock_guard<std::mutex> lk(m_mtx);
        return m_nCreated;
    }

private:
    std::unique_ptr<XtcDecodeScratch> acquire()
    {
        std::lock_guard<std::mutex> lk(m_mtx);
        if (m_free.empty()) {
            ++m_nCreated;
            return std::make_unique<XtcDecodeScratch>();
        }
        std::unique_ptr<XtcDecodeScratch> p = std::move(m_free.back());
        m_free.pop_back();
        return p;
    }

    void release(std::unique_ptr<XtcDecodeScratch> p)
    {
        std::lock_guard<std::mutex> lk(m_mtx);
        m_free.push_back(std::move(p));
    }

    mutable std::mutex m_mtx;
    std::vector<std::unique_ptr<XtcDecodeScratch>> m_free;
    int m_nCreated = 0;
};

}  // namespace mdtools

XtcTrajReader::XtcTrajReader() : super_t()
{
    m_nSkip = 1;
    m_natom = 0;
}

XtcTrajReader::~XtcTrajReader() {}

///////////////////////////////////////////

const char *XtcTrajReader::getName() const
{
    return "xtctraj";
}

const char *XtcTrajReader::getTypeDescr() const
{
    return "GROMACS XTC trajectory (*.xtc)";
}

const char *XtcTrajReader::getFileExt() const
{
    return "*.xtc";
}

int XtcTrajReader::canHandleContent(qlib::InStream &ins) const
{
    // XTC begins with a big-endian int32 magic (1995 or 2023).
    char buf[4];
    int total = 0;
    while (total < 4) {
        int n = ins.read(buf, total, 4 - total);
        if (n <= 0) break;
        total += n;
    }
    if (total < 4) return CONTENT_UNKNOWN;

    const qint32 magic = (static_cast<quint8>(buf[0]) << 24) |
                         (static_cast<quint8>(buf[1]) << 16) |
                         (static_cast<quint8>(buf[2]) << 8) | static_cast<quint8>(buf[3]);
    return (magic == XTC_MAGIC || magic == XTC_NEW_MAGIC) ? CONTENT_YES : CONTENT_UNKNOWN;
}

qsys::ObjectPtr XtcTrajReader::createDefaultObj() const
{
    return qsys::ObjectPtr(MB_NEW TrajBlock());
}

///////////////////////////////////////////

bool XtcTrajReader::read(qlib::InStream &ins)
{
    TrajBlockPtr pTB(getTarget<TrajBlock>());
    if (pTB.isnull()) {
        MB_THROW(qlib::RuntimeException, "XtcTrajReader: not attached to a TrajBlock");
        return false;
    }
    TrajectoryPtr pTraj = getTargTraj();
    if (pTraj.isnull()) {
        MB_THROW(qlib::RuntimeException, "XtcTrajReader: target Trajectory not found");
        return false;
    }

    if (canLazyLoad(ins)) {
        indexFrames(ins, pTB, pTraj);
    } else {
        readAllFrames(ins, pTB, pTraj);
    }

    return true;
}

bool XtcTrajReader::readFrameHeader(XdrInStream &xdr, qfloat32 cell[6], int &natom,
                                    bool &bLong)
{
    // Frame boundary: read the magic, or stop at a clean end of stream.
    qint32 magic = 0;
    if (!xdr.readI32opt(magic)) return false;
    if (magic != XTC_MAGIC && magic != XTC_NEW_MAGIC) {
        MB_THROW(qlib::FileFormatException, "XTC: invalid frame magic");
        return false;
    }
    bLong = (magic == XTC_NEW_MAGIC);

    natom = xdr.readI32();
    xdr.readI32();  // step
    xdr.readF32();  // time

    // Simulation box (single precision) -> 6-value cell.
    xdr.readGmxBox(false, cell);

    const int natom2 = xdr.readI32();
    if (natom2 != natom) {
        MB_THROW(qlib::FileFormatException, "XTC: contradictory atom count in frame");
        return false;
    }
    return true;
}

void XtcTrajReader::readFrameCoords(XdrInStream &xdr, std::vector<qfloat32> &filecrd,
                                    int natom, bool bLong)
{
    // Coordinates (file order, nm). GROMACS stores <=9 atoms uncompressed.
    filecrd.resize(static_cast<size_t>(natom) * 3);
    if (natom <= XTC_MAX_NATOMS_UNCOMPRESSED) {
        xdr.readF32Array(filecrd.data(), natom * 3);
    } else {
        xdr.readCompressedCoords(filecrd, bLong);
    }
}

int XtcTrajReader::checkNatomAgainstTopology(int natom, const TrajectoryPtr &pTraj) const
{
    const int topoN = static_cast<int>(pTraj->getAllAtomSize());
    if (topoN > 0 && natom != topoN) {
        LString msg = LString::format("XTC: inconsistent NATOM with topology %d!=%d", natom,
                                      topoN);
        MB_THROW(qlib::FileFormatException, msg);
        return 0;
    }
    return (topoN > 0) ? static_cast<int>(pTraj->getAtomSize()) : natom;
}

void XtcTrajReader::readAllFrames(qlib::InStream &ins, const TrajBlockPtr &pTB,
                                  const TrajectoryPtr &pTraj)
{
    XdrInStream xdr(ins);

    bool inited = false;
    int frameno = 0;
    std::vector<qfloat32> filecrd;
    qfloat32 cell[6];

    for (;;) {
        int natom = 0;
        bool bLong = false;
        if (!readFrameHeader(xdr, cell, natom, bLong)) break;

        if (!inited) {
            m_natom = natom;
            pTB->initFrames(checkNatomAgainstTopology(natom, pTraj));
            LOG_DPRINTLN("XtcTraj> NATOM=%d", natom);
            inited = true;
        } else if (natom != m_natom) {
            MB_THROW(qlib::FileFormatException, "XTC: varying atom count not supported");
            return;
        }

        readFrameCoords(xdr, filecrd, natom, bLong);

        // Keep every m_nSkip-th frame.
        if (frameno % m_nSkip == 0) {
            qfloat32 *pcoord = pTB->appendFrame();
            qfloat32 *pcell = pTB->getCellArray(pTB->getSize() - 1);
            for (int i = 0; i < 6; ++i) pcell[i] = cell[i];
            scatterCoords(pTraj, filecrd, natom, pcoord, 10.0f);
            pTB->setLoaded(pTB->getSize() - 1, true);
        }
        ++frameno;
    }

    LOG_DPRINTLN("XtcTraj> read %d frames (skip=%d)", pTB->getSize(), m_nSkip);
}

void XtcTrajReader::indexFrames(qlib::InStream &ins, const TrajBlockPtr &pTB,
                                const TrajectoryPtr &pTraj)
{
    XdrInStream xdr(ins);

    std::vector<qint64> offsets;
    int frameno = 0;
    qint64 pos = 0;
    int nReadAtoms = 0;

    for (;;) {
        if (!ins.seekTo(pos)) {
            MB_THROW(qlib::FileFormatException,
                     LString::format("XTC: cannot seek to frame %d", frameno));
            return;
        }

        // Only the two fields the walk needs: the magic to know a frame really
        // starts here, and the atom count to size the frame. Everything else
        // is skipped over by arithmetic.
        qint32 magic = 0;
        if (!xdr.readI32opt(magic)) break;  // clean end of file
        if (magic != XTC_MAGIC && magic != XTC_NEW_MAGIC) {
            MB_THROW(qlib::FileFormatException,
                     LString::format("XTC: invalid magic at frame %d", frameno));
            return;
        }
        const bool bLong = (magic == XTC_NEW_MAGIC);
        const int natom = xdr.readI32();

        if (frameno == 0) {
            m_natom = natom;
            nReadAtoms = checkNatomAgainstTopology(natom, pTraj);
            LOG_DPRINTLN("XtcTraj> NATOM=%d", natom);
        } else if (natom != m_natom) {
            MB_THROW(qlib::FileFormatException, "XTC: varying atom count not supported");
            return;
        }

        qint64 framebytes;
        if (natom <= XTC_MAX_NATOMS_UNCOMPRESSED) {
            // Stored as plain floats, with no length field to read.
            framebytes = XTC_SMALL_HEADER_SIZE + natom * XTC_SMALL_COORDS_SIZE;
        } else {
            // The compressed block announces its own length, which is what
            // makes the walk possible at all.
            if (!ins.seekTo(pos + XTC_HEADER_SIZE)) {
                MB_THROW(qlib::FileFormatException,
                         LString::format("XTC: frame %d header is truncated", frameno));
                return;
            }
            qint64 nbytes;
            if (bLong) {
                const quint32 hi = xdr.readU32();
                const quint32 lo = xdr.readU32();
                nbytes = static_cast<qint64>((static_cast<quint64>(hi) << 32) | lo);
            } else {
                nbytes = static_cast<qint64>(xdr.readU32());
            }
            if (nbytes < 0) {
                MB_THROW(qlib::FileFormatException,
                         LString::format("XTC: frame %d declares a bogus size", frameno));
                return;
            }
            framebytes = XTC_HEADER_SIZE +
                         (bLong ? XTC_NBYTES_SIZE_LONG : XTC_NBYTES_SIZE) + pad4(nbytes);
        }

        // Keep every m_nSkip-th frame, so entry i is block frame i.
        if (frameno % m_nSkip == 0) offsets.push_back(pos);
        ++frameno;
        pos += framebytes;
    }

    if (offsets.empty()) {
        LOG_DPRINTLN("XtcTraj> no frames found");
        return;
    }

    // The walk only read headers, so a run killed mid-write would look intact
    // until playback fell off the end of the file. Fail at open instead, the
    // way an eager read does.
    checkIndexedRange(ins, pos);

    const int nkept = static_cast<int>(offsets.size());
    setFrameOffsets(std::move(offsets));
    setupLazyBlock(pTB, pTraj, nReadAtoms, nkept);

    LOG_DPRINTLN("XtcTraj> indexed %d frames (skip=%d) for on-demand loading", nkept,
                 m_nSkip);
}

DetachedDecode XtcTrajReader::makeDetachedDecode(int ifrm, TrajBlock *pTB)
{
    const std::vector<qint64> &offsets = getFrameOffsets();
    if (ifrm < 0 || ifrm >= static_cast<int>(offsets.size())) return DetachedDecode();
    if (m_natom <= 0 || getPath().isEmpty()) return DetachedDecode();

    TrajectoryPtr pTraj = getTargTrajOf(pTB);
    const quint32 *psia = pTraj->getSelIndexArray();
    const int nread = (psia != NULL) ? static_cast<int>(pTraj->getAtomSize()) : m_natom;
    if (psia != NULL &&
        (m_pDetachedSel == nullptr || static_cast<int>(m_pDetachedSel->size()) != nread)) {
        m_pDetachedSel = std::make_shared<const std::vector<quint32>>(psia, psia + nread);
    }
    std::shared_ptr<const std::vector<quint32>> pSel =
        (psia != NULL) ? m_pDetachedSel : std::shared_ptr<const std::vector<quint32>>();

    const std::string path = getPath().c_str();
    const qint64 offset = offsets[ifrm];
    const int natomFile = m_natom;
    if (!m_pScratchPool) m_pScratchPool = std::make_shared<XtcScratchPool>();
    std::shared_ptr<XtcScratchPool> pPool = m_pScratchPool;

    return [path, offset, natomFile, nread, pSel, pPool](DetachedFrame &out) {
        // Borrowed for this decode only, so a set is reused by the next decode
        // on any thread, as loadFrm() reuses its own on the loading thread.
        XtcScratchPool::Lease lease(*pPool);
        std::vector<qfloat32> &filecrd = lease.get().filecrd;
        std::vector<char> &compressed = lease.get().compressed;
        std::vector<qint32> &intbuf = lease.get().intbuf;

        qlib::FileInStream fis;
        fis.open(LString(path.c_str()));
        fis.seekTo(offset);
        XdrInStream xdr(fis);

        int natom = 0;
        bool bLong = false;
        if (!readFrameHeader(xdr, out.cell, natom, bLong) || natom != natomFile) {
            MB_THROW(qlib::FileFormatException, "XTC: frame header does not match the index");
            return;
        }
        xdr.swapScratch(compressed, intbuf);
        readFrameCoords(xdr, filecrd, natom, bLong);
        xdr.swapScratch(compressed, intbuf);
        fis.close();

        // The same arithmetic as scatterCoords(), from the copied map.
        out.crd.resize(static_cast<size_t>(nread) * 3);
        for (int jj = 0; jj < nread; ++jj) {
            const size_t k = (pSel != nullptr) ? size_t((*pSel)[jj]) : size_t(jj);
            out.crd[jj * 3 + 0] = filecrd[k * 3 + 0] * 10.0f;
            out.crd[jj * 3 + 1] = filecrd[k * 3 + 1] * 10.0f;
            out.crd[jj * 3 + 2] = filecrd[k * 3 + 2] * 10.0f;
        }
    };
}

int XtcTrajReader::getDecodeScratchCount() const
{
    return m_pScratchPool ? m_pScratchPool->createdCount() : 0;
}

void XtcTrajReader::loadFrm(int ifrm, TrajBlock *pTB)
{
    TrajectoryPtr pTraj = getTargTrajOf(pTB);

    std::unique_ptr<qlib::InStream> pIn = openAtFrame(ifrm);
    XdrInStream xdr(*pIn);

    qfloat32 cell[6];
    int natom = 0;
    bool bLong = false;
    if (!readFrameHeader(xdr, cell, natom, bLong)) {
        MB_THROW(qlib::FileFormatException,
                 LString::format("XTC: frame %d is missing", ifrm));
        return;
    }
    if (natom != m_natom) {
        MB_THROW(qlib::FileFormatException, "XTC: varying atom count not supported");
        return;
    }

    xdr.swapScratch(m_lazyCompressed, m_lazyIntbuf);
    readFrameCoords(xdr, m_lazyFilecrd, natom, bLong);
    xdr.swapScratch(m_lazyCompressed, m_lazyIntbuf);

    qfloat32 *pcell = pTB->getCellArray(ifrm);
    for (int i = 0; i < 6; ++i) pcell[i] = cell[i];
    scatterCoords(pTraj, m_lazyFilecrd, natom, pTB->getCrdArray(ifrm), 10.0f);

    pIn->close();
}
