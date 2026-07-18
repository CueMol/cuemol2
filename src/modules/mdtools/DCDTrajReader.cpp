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
    m_maxBlockBytes = qint64(256) * 1024 * 1024;
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
    // A DCD needs pre-existing topology; a standalone default is an empty
    // Trajectory (readHeader's NATOM check then rejects it).
    return qsys::ObjectPtr(MB_NEW Trajectory());
}

///////////////////////////////////////////

bool DCDTrajReader::read(qlib::InStream &ins)
{
    TrajectoryPtr pTraj(getTarget<Trajectory>());
    if (pTraj.isnull()) pTraj = getTargTraj();
    if (pTraj.isnull()) {
        MB_THROW(qlib::RuntimeException, "DCDTrajReader: no target Trajectory");
        return false;
    }

    // Record the target trajectory UID for lazy loadFrm().
    if (getTargTrajUID() == qlib::invalid_uid) setTargTrajUID(pTraj->getUID());

    readHeader(ins, pTraj);
    readBody(ins, pTraj);

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
    phdr += 9;            // skip NFILE..(9 int fields incl. NPRIV/NSAVC/NSTEP + 5)

    // phdr now at DT (float), then FCELL (int)
    phdr++;               // skip DT
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

    if (natom != static_cast<int>(pTraj->getAllAtomSize())) {
        LString msg = LString::format("DCD: Inconsistent NATOM with topology %d!=%d",
                                      natom, pTraj->getAllAtomSize());
        MB_THROW(qlib::FileFormatException, msg);
        return;
    }
}

int DCDTrajReader::framesPerBlock(int nReadAtoms) const
{
    qint64 bytesPerFrame = static_cast<qint64>(nReadAtoms) * 3 * sizeof(qfloat32);
    if (bytesPerFrame <= 0) return 1;
    qint64 fpb = m_maxBlockBytes / bytesPerFrame;
    if (fpb < 1) fpb = 1;
    return static_cast<int>(fpb);
}

void DCDTrajReader::readFrameRecords(FortBinInStream &fbis, std::vector<float> &tmpv,
                                     qfloat32 *pcoord, qfloat32 *pcell,
                                     const TrajectoryPtr &pTraj)
{
    int nrlen;

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
        const int nReadAtoms = static_cast<int>(pTraj->getAtomSize());
        const quint32 *psia = pTraj->getSelIndexArray();
        for (int jj = 0; jj < nReadAtoms; ++jj) {
            const int k = static_cast<int>(psia[jj]);
            pcoord[jj * 3 + 0] = tmpv[k + m_natom * 0];
            pcoord[jj * 3 + 1] = tmpv[k + m_natom * 1];
            pcoord[jj * 3 + 2] = tmpv[k + m_natom * 2];
        }
    }
}

void DCDTrajReader::readBody(qlib::InStream &ins, const TrajectoryPtr &pTraj)
{
    const int nread = m_nfile / m_nSkip;  // total frames to keep
    if (nread <= 0) return;

    const int nReadAtoms = static_cast<int>(pTraj->getAtomSize());
    const int fpb = framesPerBlock(nReadAtoms);

    // Pre-create the bounded blocks (option A: allocate all frames upfront, in
    // per-frame chunks -- no single allocation exceeds one frame).
    std::vector<TrajBlockPtr> blocks;
    for (int startFrm = 0; startFrm < nread; startFrm += fpb) {
        int nInBlk = qlib::min(fpb, nread - startFrm);
        TrajBlockPtr pBlk(MB_NEW TrajBlock());
        pBlk->setTrajUID(pTraj->getUID());
        pBlk->allocate(nReadAtoms, nInBlk);
        blocks.push_back(pBlk);
    }
    LOG_DPRINTLN("DCDTraj> %d frames in %d block(s), <=%d frames/block",
                 nread, static_cast<int>(blocks.size()), fpb);

    // Eager: read the file sequentially, scattering each kept frame into its
    // block. Skipped frames (m_nSkip>1) are still read to advance the stream.
    // (Seek-based lazy loading is deferred; see loadFrm().)
    FortBinInStream fbis(ins);
    std::vector<float> tmpv(m_natom * 3);
    int nInd = 0;  // kept-frame index
    for (int istep = 0; istep < m_nfile; ++istep) {
        qfloat32 *pcoord = NULL;
        qfloat32 *pcell = NULL;
        if (istep % m_nSkip == 0) {
            TrajBlockPtr &pBlk = blocks[nInd / fpb];
            const int inBlk = nInd % fpb;
            pcoord = pBlk->getCrdArray(inBlk);
            pcell = pBlk->getCellArray(inBlk);
        }
        readFrameRecords(fbis, tmpv, pcoord, pcell, pTraj);
        if (pcoord != NULL) {
            blocks[nInd / fpb]->setLoaded(nInd % fpb, true);
            ++nInd;
        }
    }

    for (const TrajBlockPtr &pBlk : blocks) pTraj->append(pBlk);
}

void DCDTrajReader::loadFrm(int ifrm, TrajBlock *pTB)
{
    // Unreachable: readBody() reads all frames eagerly and never registers a
    // block loader, so TrajBlock::load() is not called. Seek-based lazy loading
    // is deferred until develop exposes a portable seekable-stream interface.
    MB_THROW(qlib::RuntimeException, "DCDTrajReader: lazy frame load not implemented");
}
