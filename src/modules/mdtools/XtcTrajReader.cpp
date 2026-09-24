// -*-Mode: C++;-*-
//
// GROMACS XTC binary trajectory file reader
//

#include <common.h>

#include "XtcTrajReader.hpp"
#include "TrajBlock.hpp"
#include "Trajectory.hpp"
#include "XdrInStream.hpp"

#include <qlib/LExceptions.hpp>

#include <memory>
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
