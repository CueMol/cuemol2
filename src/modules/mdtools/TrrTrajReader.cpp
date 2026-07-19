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

    XdrInStream xdr(ins);

    bool inited = false;
    int nReadAtoms = 0;
    int frameno = 0;
    std::vector<qfloat32> filecrd;
    qfloat32 cell[6];

    for (;;) {
        // Frame boundary: read the magic, or stop at a clean end of stream.
        qint32 magic = 0;
        if (!xdr.readI32opt(magic)) break;
        if (magic != TRR_MAGIC) {
            MB_THROW(qlib::FileFormatException, "TRR: invalid frame magic");
            return false;
        }

        // Version string (e.g. "GMX_trn_file"), consumed but not enforced.
        xdr.readGmxString();

        // Ten block-size fields, then natoms/step/nre.
        const int ir_size = xdr.readI32();
        const int e_size = xdr.readI32();
        const int box_size = xdr.readI32();
        const int vir_size = xdr.readI32();
        const int pres_size = xdr.readI32();
        const int top_size = xdr.readI32();
        const int sym_size = xdr.readI32();
        const int x_size = xdr.readI32();
        const int v_size = xdr.readI32();
        const int f_size = xdr.readI32();
        (void)ir_size;
        (void)e_size;
        (void)top_size;
        (void)sym_size;

        const int natom = xdr.readI32();
        xdr.readI32();  // step
        xdr.readI32();  // nre

        // TRR stores no precision flag: infer float vs double from a byte size.
        int nflsize = 0;
        if (box_size > 0) {
            nflsize = box_size / 9;
        } else if (natom > 0) {
            if (x_size > 0)
                nflsize = x_size / (natom * 3);
            else if (v_size > 0)
                nflsize = v_size / (natom * 3);
            else if (f_size > 0)
                nflsize = f_size / (natom * 3);
        }
        if (nflsize != static_cast<int>(sizeof(float)) &&
            nflsize != static_cast<int>(sizeof(double))) {
            MB_THROW(qlib::FileFormatException, "TRR: cannot determine precision");
            return false;
        }
        const bool bDouble = (nflsize == static_cast<int>(sizeof(double)));

        // Time and lambda (real precision).
        if (bDouble) {
            xdr.readF64();
            xdr.readF64();
        } else {
            xdr.readF32();
            xdr.readF32();
        }

        if (!inited) {
            m_natom = natom;
            // Validate against the topology only when it is already loaded
            // (during .qsc load the block is read before the topology).
            const int topoN = static_cast<int>(pTraj->getAllAtomSize());
            if (topoN > 0 && natom != topoN) {
                LString msg = LString::format("TRR: inconsistent NATOM with topology %d!=%d",
                                              natom, topoN);
                MB_THROW(qlib::FileFormatException, msg);
                return false;
            }
            nReadAtoms = (topoN > 0) ? static_cast<int>(pTraj->getAtomSize()) : natom;
            pTB->initFrames(nReadAtoms);
            filecrd.resize(static_cast<size_t>(natom) * 3);
            LOG_DPRINTLN("TrrTraj> NATOM=%d, double=%d", natom, bDouble ? 1 : 0);
            inited = true;
        } else if (natom != m_natom) {
            MB_THROW(qlib::FileFormatException, "TRR: varying atom count not supported");
            return false;
        }

        // Simulation box -> 6-value cell (Angstrom / degrees).
        if (box_size > 0)
            xdr.readGmxBox(bDouble, cell);
        else
            std::memset(cell, 0, sizeof(cell));

        // Skip virial/pressure tensors (legacy, unused).
        const qint64 legacy = static_cast<qint64>(vir_size) + pres_size;
        if (legacy > 0) xdr.skipBytes(legacy);

        // Positions (file order, nm).
        const bool hasX = (x_size > 0);
        if (hasX) {
            if (bDouble) {
                const int ncoord = natom * 3;
                for (int i = 0; i < ncoord; ++i)
                    filecrd[i] = static_cast<qfloat32>(xdr.readF64());
            } else {
                xdr.readF32Array(filecrd.data(), natom * 3);
            }
        }

        // Skip velocities and forces (not stored by TrajBlock).
        const qint64 vfbytes = static_cast<qint64>(v_size) + f_size;
        if (vfbytes > 0) xdr.skipBytes(vfbytes);

        // Keep every m_nSkip-th frame that has coordinates.
        if (hasX && (frameno % m_nSkip == 0)) {
            qfloat32 *pcoord = pTB->appendFrame();
            qfloat32 *pcell = pTB->getCellArray(pTB->getSize() - 1);
            for (int i = 0; i < 6; ++i) pcell[i] = cell[i];
            scatterCoords(pTraj, filecrd, natom, pcoord, 10.0f);
            pTB->setLoaded(pTB->getSize() - 1, true);
        }
        ++frameno;
    }

    LOG_DPRINTLN("TrrTraj> read %d frames (skip=%d)", pTB->getSize(), m_nSkip);
    return true;
}

void TrrTrajReader::loadFrm(int ifrm, TrajBlock *pTB)
{
    // Unreachable: read() reads all frames eagerly. Seek-based lazy loading is
    // deferred until develop exposes a portable seekable-stream interface.
    MB_THROW(qlib::RuntimeException, "TrrTrajReader: lazy frame load not implemented");
}
