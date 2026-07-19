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

    XdrInStream xdr(ins);

    bool inited = false;
    int frameno = 0;
    std::vector<qfloat32> filecrd;
    qfloat32 cell[6];

    for (;;) {
        // Frame boundary: read the magic, or stop at a clean end of stream.
        qint32 magic = 0;
        if (!xdr.readI32opt(magic)) break;
        if (magic != XTC_MAGIC && magic != XTC_NEW_MAGIC) {
            MB_THROW(qlib::FileFormatException, "XTC: invalid frame magic");
            return false;
        }
        const bool bLong = (magic == XTC_NEW_MAGIC);

        const int natom = xdr.readI32();
        xdr.readI32();  // step
        xdr.readF32();  // time

        // Simulation box (single precision) -> 6-value cell.
        xdr.readGmxBox(false, cell);

        const int natom2 = xdr.readI32();
        if (natom2 != natom) {
            MB_THROW(qlib::FileFormatException, "XTC: contradictory atom count in frame");
            return false;
        }

        if (!inited) {
            m_natom = natom;
            const int topoN = static_cast<int>(pTraj->getAllAtomSize());
            if (topoN > 0 && natom != topoN) {
                LString msg = LString::format("XTC: inconsistent NATOM with topology %d!=%d",
                                              natom, topoN);
                MB_THROW(qlib::FileFormatException, msg);
                return false;
            }
            const int nReadAtoms = (topoN > 0) ? static_cast<int>(pTraj->getAtomSize()) : natom;
            pTB->initFrames(nReadAtoms);
            LOG_DPRINTLN("XtcTraj> NATOM=%d", natom);
            inited = true;
        } else if (natom != m_natom) {
            MB_THROW(qlib::FileFormatException, "XTC: varying atom count not supported");
            return false;
        }

        // Coordinates (file order, nm). GROMACS stores <=9 atoms uncompressed.
        filecrd.resize(static_cast<size_t>(natom) * 3);
        if (natom <= XTC_MAX_NATOMS_UNCOMPRESSED) {
            xdr.readF32Array(filecrd.data(), natom * 3);
        } else {
            xdr.readCompressedCoords(filecrd, bLong);
        }

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
    return true;
}

void XtcTrajReader::loadFrm(int ifrm, TrajBlock *pTB)
{
    // Unreachable: read() reads all frames eagerly. Seek-based lazy loading is
    // deferred until develop exposes a portable seekable-stream interface.
    MB_THROW(qlib::RuntimeException, "XtcTrajReader: lazy frame load not implemented");
}
