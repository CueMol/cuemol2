// -*-Mode: C++;-*-
//
// GROMACS TRR binary trajectory file reader
//

#include <common.h>

#include "TrrTrajReader.hpp"
#include "TrajBlock.hpp"
#include "Trajectory.hpp"
#include "XdrInStream.hpp"

#include <qlib/LExceptions.hpp>

#include <cstring>
#include <memory>
#include <utility>
#include <vector>

using namespace mdtools;
using qlib::LString;

namespace {
// GROMACS TRR magic number (big-endian XDR).
const qint32 TRR_MAGIC = 1993;
}  // namespace

TrrTrajReader::TrrTrajReader() : super_t()
{
    m_nSkip = 1;
    m_natom = 0;
}

TrrTrajReader::~TrrTrajReader() {}

///////////////////////////////////////////

const char *TrrTrajReader::getName() const
{
    return "trrtraj";
}

const char *TrrTrajReader::getTypeDescr() const
{
    return "GROMACS TRR trajectory (*.trr)";
}

const char *TrrTrajReader::getFileExt() const
{
    return "*.trr";
}

int TrrTrajReader::canHandleContent(qlib::InStream &ins) const
{
    // TRR begins with a big-endian int32 magic (1993).
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
    return (magic == TRR_MAGIC) ? CONTENT_YES : CONTENT_UNKNOWN;
}

qsys::ObjectPtr TrrTrajReader::createDefaultObj() const
{
    return qsys::ObjectPtr(MB_NEW TrajBlock());
}

///////////////////////////////////////////

bool TrrTrajReader::read(qlib::InStream &ins)
{
    TrajBlockPtr pTB(getTarget<TrajBlock>());
    if (pTB.isnull()) {
        MB_THROW(qlib::RuntimeException, "TrrTrajReader: not attached to a TrajBlock");
        return false;
    }
    TrajectoryPtr pTraj = getTargTraj();
    if (pTraj.isnull()) {
        MB_THROW(qlib::RuntimeException, "TrrTrajReader: target Trajectory not found");
        return false;
    }

    if (canLazyLoad(ins)) {
        indexFrames(ins, pTB, pTraj);
    } else {
        readAllFrames(ins, pTB, pTraj);
    }

    return true;
}

bool TrrTrajReader::readFrameHeader(XdrInStream &xdr, FrameHeader &hdr)
{
    // Frame boundary: read the magic, or stop at a clean end of stream.
    qint32 magic = 0;
    if (!xdr.readI32opt(magic)) return false;
    if (magic != TRR_MAGIC) {
        MB_THROW(qlib::FileFormatException, "TRR: invalid frame magic");
        return false;
    }

    // Version string (e.g. "GMX_trn_file"), consumed but not enforced.
    xdr.readGmxString();

    // Ten block-size fields, then natoms/step/nre.
    const int ir_size = xdr.readI32();
    const int e_size = xdr.readI32();
    hdr.box_size = xdr.readI32();
    hdr.vir_size = xdr.readI32();
    hdr.pres_size = xdr.readI32();
    const int top_size = xdr.readI32();
    const int sym_size = xdr.readI32();
    hdr.x_size = xdr.readI32();
    hdr.v_size = xdr.readI32();
    hdr.f_size = xdr.readI32();
    (void)ir_size;
    (void)e_size;
    (void)top_size;
    (void)sym_size;

    hdr.natom = xdr.readI32();
    xdr.readI32();  // step
    xdr.readI32();  // nre

    // TRR stores no precision flag: infer float vs double from a byte size.
    int nflsize = 0;
    if (hdr.box_size > 0) {
        nflsize = hdr.box_size / 9;
    } else if (hdr.natom > 0) {
        if (hdr.x_size > 0)
            nflsize = hdr.x_size / (hdr.natom * 3);
        else if (hdr.v_size > 0)
            nflsize = hdr.v_size / (hdr.natom * 3);
        else if (hdr.f_size > 0)
            nflsize = hdr.f_size / (hdr.natom * 3);
    }
    if (nflsize != static_cast<int>(sizeof(float)) &&
        nflsize != static_cast<int>(sizeof(double))) {
        MB_THROW(qlib::FileFormatException, "TRR: cannot determine precision");
        return false;
    }
    hdr.bDouble = (nflsize == static_cast<int>(sizeof(double)));

    // Time and lambda (real precision).
    if (hdr.bDouble) {
        xdr.readF64();
        xdr.readF64();
    } else {
        xdr.readF32();
        xdr.readF32();
    }
    return true;
}

void TrrTrajReader::readFrameBody(XdrInStream &xdr, const FrameHeader &hdr,
                                  std::vector<qfloat32> &filecrd, qfloat32 cell[6])
{
    // Simulation box -> 6-value cell (Angstrom / degrees).
    if (hdr.box_size > 0)
        xdr.readGmxBox(hdr.bDouble, cell);
    else
        std::memset(cell, 0, sizeof(qfloat32) * 6);

    // Skip virial/pressure tensors (legacy, unused).
    const qint64 legacy = static_cast<qint64>(hdr.vir_size) + hdr.pres_size;
    if (legacy > 0) xdr.skipBytes(legacy);

    // Positions (file order, nm).
    if (hdr.hasCoords()) {
        filecrd.resize(static_cast<size_t>(hdr.natom) * 3);
        if (hdr.bDouble) {
            const int ncoord = hdr.natom * 3;
            for (int i = 0; i < ncoord; ++i)
                filecrd[i] = static_cast<qfloat32>(xdr.readF64());
        } else {
            xdr.readF32Array(filecrd.data(), hdr.natom * 3);
        }
    }

    // Skip velocities and forces (not stored by TrajBlock).
    const qint64 vfbytes = static_cast<qint64>(hdr.v_size) + hdr.f_size;
    if (vfbytes > 0) xdr.skipBytes(vfbytes);
}

int TrrTrajReader::checkNatomAgainstTopology(int natom, const TrajectoryPtr &pTraj) const
{
    // Validate against the topology only when it is already loaded (during
    // .qsc load the block is read before the topology).
    const int topoN = static_cast<int>(pTraj->getAllAtomSize());
    if (topoN > 0 && natom != topoN) {
        LString msg = LString::format("TRR: inconsistent NATOM with topology %d!=%d", natom,
                                      topoN);
        MB_THROW(qlib::FileFormatException, msg);
        return 0;
    }
    return (topoN > 0) ? static_cast<int>(pTraj->getAtomSize()) : natom;
}

void TrrTrajReader::readAllFrames(qlib::InStream &ins, const TrajBlockPtr &pTB,
                                  const TrajectoryPtr &pTraj)
{
    XdrInStream xdr(ins);

    bool inited = false;
    int frameno = 0;
    std::vector<qfloat32> filecrd;
    qfloat32 cell[6];

    for (;;) {
        FrameHeader hdr;
        if (!readFrameHeader(xdr, hdr)) break;

        if (!inited) {
            m_natom = hdr.natom;
            pTB->initFrames(checkNatomAgainstTopology(hdr.natom, pTraj));
            filecrd.resize(static_cast<size_t>(hdr.natom) * 3);
            LOG_DPRINTLN("TrrTraj> NATOM=%d, double=%d", hdr.natom, hdr.bDouble ? 1 : 0);
            inited = true;
        } else if (hdr.natom != m_natom) {
            MB_THROW(qlib::FileFormatException, "TRR: varying atom count not supported");
            return;
        }

        readFrameBody(xdr, hdr, filecrd, cell);

        // Keep every m_nSkip-th frame that has coordinates.
        if (hdr.hasCoords() && (frameno % m_nSkip == 0)) {
            qfloat32 *pcoord = pTB->appendFrame();
            qfloat32 *pcell = pTB->getCellArray(pTB->getSize() - 1);
            for (int i = 0; i < 6; ++i) pcell[i] = cell[i];
            scatterCoords(pTraj, filecrd, hdr.natom, pcoord, 10.0f);
            pTB->setLoaded(pTB->getSize() - 1, true);
        }
        ++frameno;
    }

    LOG_DPRINTLN("TrrTraj> read %d frames (skip=%d)", pTB->getSize(), m_nSkip);
}

void TrrTrajReader::indexFrames(qlib::InStream &ins, const TrajBlockPtr &pTB,
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
                     LString::format("TRR: cannot seek to frame %d", frameno));
            return;
        }

        FrameHeader hdr;
        if (!readFrameHeader(xdr, hdr)) break;  // clean end of file

        if (frameno == 0) {
            m_natom = hdr.natom;
            nReadAtoms = checkNatomAgainstTopology(hdr.natom, pTraj);
            LOG_DPRINTLN("TrrTraj> NATOM=%d, double=%d", hdr.natom, hdr.bDouble ? 1 : 0);
        } else if (hdr.natom != m_natom) {
            MB_THROW(qlib::FileFormatException, "TRR: varying atom count not supported");
            return;
        }

        // The header is variable-length (the version string is), so its size
        // comes from where parsing stopped rather than from a constant.
        const qint64 headerEnd = ins.tell();
        if (headerEnd < 0) {
            MB_THROW(qlib::FileFormatException, "TRR: source stopped reporting its position");
            return;
        }

        // Same rule as the eager path: only a frame carrying coordinates can
        // become a block frame, and the stride counts every frame.
        if (hdr.hasCoords() && (frameno % m_nSkip == 0)) offsets.push_back(pos);
        ++frameno;
        pos = headerEnd + hdr.payloadBytes();
    }

    if (offsets.empty()) {
        LOG_DPRINTLN("TrrTraj> no frames with coordinates found");
        return;
    }

    // The walk only parsed headers, so a run killed mid-write would look
    // intact until playback fell off the end. Fail at open instead.
    checkIndexedRange(ins, pos);

    const int nkept = static_cast<int>(offsets.size());
    setFrameOffsets(std::move(offsets));
    setupLazyBlock(pTB, pTraj, nReadAtoms, nkept);

    LOG_DPRINTLN("TrrTraj> indexed %d frames (skip=%d) for on-demand loading", nkept,
                 m_nSkip);
}

void TrrTrajReader::loadFrm(int ifrm, TrajBlock *pTB)
{
    TrajectoryPtr pTraj = getTargTrajOf(pTB);

    std::unique_ptr<qlib::InStream> pIn = openAtFrame(ifrm);
    XdrInStream xdr(*pIn);

    FrameHeader hdr;
    if (!readFrameHeader(xdr, hdr)) {
        MB_THROW(qlib::FileFormatException,
                 LString::format("TRR: frame %d is missing", ifrm));
        return;
    }
    if (hdr.natom != m_natom) {
        MB_THROW(qlib::FileFormatException, "TRR: varying atom count not supported");
        return;
    }

    std::vector<qfloat32> filecrd;
    qfloat32 cell[6];
    readFrameBody(xdr, hdr, filecrd, cell);

    qfloat32 *pcell = pTB->getCellArray(ifrm);
    for (int i = 0; i < 6; ++i) pcell[i] = cell[i];
    scatterCoords(pTraj, filecrd, hdr.natom, pTB->getCrdArray(ifrm), 10.0f);

    pIn->close();
}
