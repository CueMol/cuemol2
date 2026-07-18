// -*-Mode: C++;-*-
//
// Xplor/CHARMM/NAMD DCD binary trajectory file reader
//

#include <common.h>

#include "DCDTrajReader.hpp"
#include "TrajBlock.hpp"
#include "Trajectory.hpp"
#include "FortBinStream.hpp"

#include <qlib/LExceptions.hpp>

using namespace mdtools;

DCDTrajReader::DCDTrajReader() : super_t()
{
    m_nSkip = 1;
    m_natom = 0;
    m_nfile = 0;
    m_fcell = false;
}

DCDTrajReader::~DCDTrajReader() {}

///////////////////////////////////////////

const char *DCDTrajReader::getName() const
{
    return "dcdtraj";
}

const char *DCDTrajReader::getTypeDescr() const
{
    return "DCD binary trajectory (*.dcd)";
}

const char *DCDTrajReader::getFileExt() const
{
    return "*.dcd";
}

qsys::ObjectPtr DCDTrajReader::createDefaultObj() const
{
    return qsys::ObjectPtr(MB_NEW TrajBlock());
}

///////////////////////////////////////////

bool DCDTrajReader::read(qlib::InStream &ins)
{
    TrajBlockPtr pTB(getTarget<TrajBlock>());
    if (pTB.isnull()) {
        MB_THROW(qlib::RuntimeException, "DCDTrajReader: not attached to a TrajBlock");
        return false;
    }

    TrajectoryPtr pTraj = getTargTraj();
    if (pTraj.isnull()) {
        MB_THROW(qlib::RuntimeException, "DCDTrajReader: target Trajectory not found");
        return false;
    }

    readHeader(ins, pTraj);
    readBody(ins, pTB, pTraj);

    return true;
}

void DCDTrajReader::readHeader(qlib::InStream &ins, const TrajectoryPtr &pTraj)
{
    FortBinInStream fbis(ins);

    // Read the 84-byte CORD header record.
    int nheader = fbis.getRecordSize_throw();
    if (nheader != 84) {
        LString msg = LString::format("DCD: Invalid header length (%d!=84)", nheader);
        MB_THROW(qlib::FileFormatException, msg);
        return;
    }

    char ptmp[95];
    fbis.readRecord(ptmp, sizeof ptmp);

    LString mark(ptmp, 4);
    if (!mark.equals("CORD")) {
        LString msg = LString::format("DCD: Invalid mark (%s)", mark.c_str());
        MB_THROW(qlib::FileFormatException, msg);
        return;
    }
    int *phdr = (int *)ptmp;
    phdr++;  // skip "CORD"

    int nfile = phdr[0];  // NFILE (number of frames)
    phdr += 9;            // skip NFILE .. (9 int fields)
    phdr++;               // skip DT (float)
    int fcell = phdr[0];  // FCELL

    // Title record (skip).
    fbis.getRecordSize_throw();
    fbis.readRecord(NULL, 1);

    // NATOM record.
    int nrlen = fbis.getRecordSize_throw();
    if (nrlen != 4) {
        LString msg = LString::format("DCD: Invalid NATOM record length (%d!=4)", nrlen);
        MB_THROW(qlib::FileFormatException, msg);
        return;
    }
    int natom;
    fbis.readRecord(&natom, 4);

    m_natom = natom;
    m_nfile = nfile;
    m_fcell = fcell ? true : false;

    LOG_DPRINTLN("DCDTraj> NFILE=%d NATOM=%d FCELL=%d", m_nfile, m_natom, fcell);

    // Validate against the topology only when it is already loaded. During .qsc
    // load the DCD block is read before the Trajectory's own topology (GRO/PSF),
    // so getAllAtomSize() may still be 0 here; Trajectory::append()'s
    // getCrdSize() check re-validates once the topology is present.
    const int topoN = static_cast<int>(pTraj->getAllAtomSize());
    if (topoN > 0 && natom != topoN) {
        LString msg = LString::format("DCD: Inconsistent NATOM with topology %d!=%d",
                                      natom, topoN);
        MB_THROW(qlib::FileFormatException, msg);
        return;
    }
}

void DCDTrajReader::readFrameRecords(FortBinInStream &fbis, std::vector<float> &tmpv,
                                     qfloat32 *pcoord, qfloat32 *pcell,
                                     const TrajectoryPtr &pTraj)
{
    int nrlen;

    // Skipped frame (nevery>1): advance past the records without copying.
    if (pcoord == NULL) {
        const int nrec = m_fcell ? 4 : 3;  // cell + X/Y/Z, or X/Y/Z
        for (int i = 0; i < nrec; ++i) {
            fbis.getRecordSize_throw();
            fbis.readRecord(NULL, 0);
        }
        return;
    }

    // Cell geometry record (optional).
    if (m_fcell) {
        nrlen = fbis.getRecordSize_throw();
        if (nrlen != 48) {
            LString msg = LString::format("DCD: Invalid CELL record length (%d!=48)", nrlen);
            MB_THROW(qlib::FileFormatException, msg);
            return;
        }
        double dcell[6];
        fbis.readRecord(dcell, 48);
        if (pcell != NULL)
            for (int i = 0; i < 6; ++i) pcell[i] = static_cast<qfloat32>(dcell[i]);
    }

    const int nbytes = static_cast<int>(sizeof(float)) * m_natom;

    // X / Y / Z coordinate records.
    for (int axis = 0; axis < 3; ++axis) {
        nrlen = fbis.getRecordSize_throw();
        if (nrlen != nbytes) {
            LString msg = LString::format("DCD: Invalid coord record length (%d!=%d)",
                                          nrlen, nbytes);
            MB_THROW(qlib::FileFormatException, msg);
            return;
        }
        fbis.readRecord(&tmpv[axis * m_natom], nbytes);
    }

    if (pcoord != NULL) {
        // Selection index array maps trajectory atom -> file atom. It is NULL
        // when the topology is not loaded yet (.qsc order); fall back to the
        // identity map over the file's atoms (load-all).
        const quint32 *psia = pTraj->getSelIndexArray();
        const int nReadAtoms =
            (psia != NULL) ? static_cast<int>(pTraj->getAtomSize()) : m_natom;
        for (int jj = 0; jj < nReadAtoms; ++jj) {
            const int k = (psia != NULL) ? static_cast<int>(psia[jj]) : jj;
            pcoord[jj * 3 + 0] = tmpv[k + m_natom * 0];
            pcoord[jj * 3 + 1] = tmpv[k + m_natom * 1];
            pcoord[jj * 3 + 2] = tmpv[k + m_natom * 2];
        }
    }
}

void DCDTrajReader::readBody(qlib::InStream &ins, const TrajBlockPtr &pTB,
                             const TrajectoryPtr &pTraj)
{
    // Number of kept frames: every m_nSkip-th of the m_nfile frames, counting
    // frame 0 (== ceil(m_nfile / m_nSkip)). Using floor would under-allocate
    // the block by one when m_nfile is not a multiple of m_nSkip.
    const int nread = (m_nfile + m_nSkip - 1) / m_nSkip;
    if (nread <= 0) return;

    // Use the topology atom count when available (supports partial loads),
    // otherwise the file's atom count (.qsc loads the DCD before the topology).
    const int topoN = static_cast<int>(pTraj->getAtomSize());
    const int nReadAtoms = (topoN > 0) ? topoN : m_natom;

    // One block for this DCD file, allocated as per-frame chunks (no single
    // whole-file buffer). Frame count bounded by the file's frame count.
    pTB->allocate(nReadAtoms, nread);

    LOG_DPRINTLN("DCDTraj> reading %d frames (skip=%d) into one block", nread, m_nSkip);

    // Eager: read the file sequentially. Skipped frames (m_nSkip>1) are still
    // read to advance the stream.
    FortBinInStream fbis(ins);
    std::vector<float> tmpv(m_natom * 3);
    int nInd = 0;  // kept-frame index
    for (int istep = 0; istep < m_nfile; ++istep) {
        qfloat32 *pcoord = NULL;
        qfloat32 *pcell = NULL;
        if (istep % m_nSkip == 0 && nInd < nread) {
            pcoord = pTB->getCrdArray(nInd);
            pcell = pTB->getCellArray(nInd);
        }
        readFrameRecords(fbis, tmpv, pcoord, pcell, pTraj);
        if (pcoord != NULL) {
            pTB->setLoaded(nInd, true);
            ++nInd;
        }
    }
}

void DCDTrajReader::loadFrm(int ifrm, TrajBlock *pTB)
{
    // Unreachable: read() reads all frames eagerly and never registers a block
    // loader, so TrajBlock::load() is not called. Seek-based lazy loading is
    // deferred until develop exposes a portable seekable-stream interface.
    MB_THROW(qlib::RuntimeException, "DCDTrajReader: lazy frame load not implemented");
}
