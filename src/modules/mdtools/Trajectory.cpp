// -*-Mode: C++;-*-
//
// MD trajectory object
//

#include <common.h>

#include "Trajectory.hpp"

#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/MolAtom.hpp>

#include <qsys/SceneManager.hpp>
#include <qlib/Utils.hpp>
#include <qlib/LDOM2Tree.hpp>

using namespace mdtools;
using molstr::MolAtom;
using molstr::MolAtomPtr;
using molstr::MolCoord;
using molstr::MolCoordPtr;
using qlib::Vector4D;

//////////
// TrajBlockReader::getTargTraj (defined here where the Trajectory type is
// complete; declared in TrajBlock.hpp).

TrajectoryPtr TrajBlockReader::getTargTraj() const
{
    TrajectoryPtr pTraj;
    qlib::uid_t ttuid = getTargTrajUID();
    if (ttuid != qlib::invalid_uid) {
        pTraj = qsys::SceneManager::getObjectS(ttuid);
    } else {
        TrajBlockPtr pTrajBlk(getTarget<TrajBlock>());
        if (pTrajBlk.isnull()) {
            MB_THROW(qlib::NullPointerException,
                     "TrajBlockReader not attached to TrajBlock");
            return pTraj;
        }
        qlib::uid_t nTrajUID = pTrajBlk->getTrajUID();
        pTraj = qsys::SceneManager::getObjectS(nTrajUID);
    }
    return pTraj;
}

Trajectory::Trajectory()
{
    m_bInit = false;
    m_nBlkInd = -1;
    m_nFrmInd = -1;
    m_nTotalFrms = 0;
    m_nCurFrm = 0;
    m_nAver = 0;
    m_bAverBufValid = false;
    m_nAllAtomSize = 0;
    m_bSetupDone = false;
}

Trajectory::~Trajectory() {}

bool Trajectory::removeAtom(int atomid)
{
    MB_THROW(qlib::RuntimeException, "Trajectory: removeAtom not supported");
    return false;
}

//////////

void Trajectory::setup()
{
    m_nAllAtomSize = getAtomSize();
    m_loadSelAry.resize(m_nAllAtomSize);

    // Load-all: the i-th trajectory atom (beginAtom / array-index order) reads
    // the i-th atom from the data file (file order). getSelIndexArray() holds
    // 0-based file indices, so this is the identity map. (Partial loads via
    // setupSel() supply an explicit file-index array.)
    for (int i = 0; i < m_nAllAtomSize; ++i) {
        m_loadSelAry[i] = static_cast<quint32>(i);
    }
    m_pLoadSel = SelectionPtr();
    m_bSetupDone = true;
}

void Trajectory::setupSel(int nAll, const SelectionPtr &pLoadSel,
                          const std::deque<int> &aidmap)
{
    m_loadSelAry.resize(aidmap.size());
    m_loadSelAry.assign(aidmap.begin(), aidmap.end());
    m_nAllAtomSize = nAll;
    m_pLoadSel = pLoadSel;
    m_bSetupDone = true;
}

void Trajectory::ensureSetup()
{
    if (m_bSetupDone) return;
    if (getAtomSize() == 0) return;  // topology not loaded yet; retry later
    setup();
}

quint32 Trajectory::getAllAtomSize() const
{
    const_cast<Trajectory *>(this)->ensureSetup();
    return m_nAllAtomSize;
}

const quint32 *Trajectory::getSelIndexArray() const
{
    const_cast<Trajectory *>(this)->ensureSetup();
    return m_loadSelAry.empty() ? NULL : &m_loadSelAry[0];
}

//////////

TrajBlockPtr Trajectory::getTrajBlkImpl(int ifrm, int &rBlkInd, int &rFrmInd) const
{
    int nBlkInd, nFrmInd;

    if (ifrm < 0) {
        nBlkInd = m_nBlkInd;
        nFrmInd = m_nFrmInd;
    } else {
        findBlk(ifrm, nBlkInd, nFrmInd);
    }

    if (nBlkInd == -1 || nFrmInd == -1) {
        LString msg =
            LString::format("getCrdArrayImpl: frame %d not found in the trajectory", ifrm);
        MB_THROW(qlib::RuntimeException, msg);
        return TrajBlockPtr();
    }
    TrajBlockPtr pBlk = m_blocks[nBlkInd];
    if (!pBlk->isLoaded(nFrmInd)) {
        pBlk->load(nFrmInd);
    }

    rBlkInd = nBlkInd;
    rFrmInd = nFrmInd;
    return pBlk;
}

qfloat32 *Trajectory::getCrdArrayImplImpl(int ifrm)
{
    int nBlkInd, nFrmInd;
    TrajBlockPtr pBlk = getTrajBlkImpl(ifrm, nBlkInd, nFrmInd);
    return pBlk->getCrdArray(nFrmInd);
}

qfloat32 *Trajectory::getCrdArrayImpl()
{
    if (m_nAver > 0) {
        if (m_bAverBufValid) return &m_averbuf[0];

        int ncrds = getAtomSize() * 3;
        if (static_cast<int>(m_averbuf.size()) < ncrds) m_averbuf.resize(ncrds);
        for (int i = 0; i < ncrds; ++i) m_averbuf[i] = 0.0f;

        int nStart = qlib::max(0, m_nCurFrm - m_nAver);
        int nEnd = qlib::min(m_nCurFrm + m_nAver, m_nTotalFrms - 1);
        int nsum = 0;
        for (int j = nStart; j <= nEnd; ++j) {
            qfloat32 *pcrd = getCrdArrayImplImpl(j);
            for (int i = 0; i < ncrds; ++i) m_averbuf[i] += pcrd[i];
            ++nsum;
        }
        for (int i = 0; i < ncrds; ++i) m_averbuf[i] /= nsum;
        m_bAverBufValid = true;
        return &m_averbuf[0];
    }

    // no averaging: return the current frame
    return getCrdArrayImplImpl(-1);
}

void Trajectory::invalidateCrdArray()
{
    // Topology is fixed once loaded; nothing to invalidate.
}

void Trajectory::createIndexMapImpl(CrdIndexMap &indmap, AidIndexMap &aidmap)
{
    indmap.clear();

    const int natoms = getAtomSize();
    aidmap.resize(natoms);

    AtomIter aiter = beginAtom();
    AtomIter eiter = endAtom();
    quint32 ind = 0;
    for (; aiter != eiter; ++aiter, ++ind) {
        int aid = aiter->first;
        indmap.insert(CrdIndexMap::value_type(aid, ind));
        aidmap[ind] = aid;
    }
}

//////////

void Trajectory::append(TrajBlockPtr pBlk)
{
    int nAtoms = getAtomSize();
    if (nAtoms * 3 != pBlk->getCrdSize()) {
        MB_THROW(qlib::RuntimeException, "non compatible atom coord size");
        return;
    }

    int nnext = 0;
    if (!m_blocks.empty()) {
        TrajBlockPtr pLast = m_blocks.back();
        nnext = pLast->getStartIndex() + pLast->getSize();
    }
    pBlk->setStartIndex(nnext);
    pBlk->setSceneID(getSceneID());
    m_blocks.push_back(pBlk);

    m_nTotalFrms += pBlk->getSize();

    if (!m_bInit) {
        update(0);          // write frame-0 coords into the atoms
        applyTopology();
        m_bInit = true;
    }

    LOG_DPRINTLN("Traj> append blk start=%d, size=%d", nnext, pBlk->getSize());
}

void Trajectory::findBlk(int iframe, int &nBlkInd, int &nFrmInd) const
{
    int ind1 = 0;
    int ind2 = -1;

    for (const TrajBlockPtr &pelem : m_blocks) {
        int istart = pelem->getStartIndex();
        int iend = istart + pelem->getSize() - 1;
        if (istart <= iframe && iframe <= iend) {
            ind2 = iframe - istart;
            break;
        }
        ++ind1;
    }

    if (ind2 < 0) {
        MB_THROW(qlib::RuntimeException, "findBlk(): iframe out of range");
        return;
    }

    nBlkInd = ind1;
    nFrmInd = ind2;
}

void Trajectory::update(int iframe, bool bDyn)
{
    findBlk(iframe, m_nBlkInd, m_nFrmInd);
    m_nCurFrm = iframe;
    m_bAverBufValid = false;

    // Write-both: copy the current frame's coordinates into the MolAtoms so
    // getPos()-based consumers (selection, measurement) and the already
    // migrated coordinate-texture renderers both follow playback.
    qfloat32 *pcrd = getCrdArrayImpl();
    ensureIndexMap();
    const int natoms = getAtomSize();
    for (int i = 0; i < natoms; ++i) {
        int aid = getAtomIDByArrayInd(static_cast<quint32>(i));
        MolAtomPtr pAtom = getAtom(aid);
        if (pAtom.isnull()) continue;
        pAtom->setRawPos(Vector4D(pcrd[i * 3 + 0], pcrd[i * 3 + 1], pcrd[i * 3 + 2]));
    }

    // MVP: always fire OBE_CHANGED "atomsMoved". Dynamic-event distinction
    // (bDyn) is deferred to a later optimization sub-phase.
    fireAtomsMoved();
}

void Trajectory::setFrame(int ifrm)
{
    ensureInit();
    update(ifrm);
}

void Trajectory::setDynFrame(int ifrm)
{
    ensureInit();
    update(ifrm, true);
}

int Trajectory::getFrameSize() const
{
    const_cast<Trajectory *>(this)->ensureInit();
    return m_nTotalFrms;
}

//////////
// Lazy finalization (no SCE_SCENE_ONLOADED hook on develop Objects)

void Trajectory::ensureInit()
{
    if (m_bInit) return;
    if (m_blocks.empty()) return;  // nothing loaded from a .qsc yet
    updateTrajBlockDataImpl();
}

void Trajectory::updateTrajBlockDataImpl()
{
    // Assign contiguous start indices and total frame count.
    int nnext = 0;
    for (const TrajBlockPtr &pBlk : m_blocks) {
        pBlk->setSceneID(getSceneID());
        pBlk->setStartIndex(nnext);
        nnext += pBlk->getSize();
    }
    m_nTotalFrms = nnext;

    // Mark initialized before update(0) so the ensureInit() in setFrame() /
    // getFrameSize() does not re-enter.
    m_bInit = true;

    update(0);          // prime frame 0 (write-both)
    applyTopology();
}

//////////
// Serialization (QSC) -- mirrors the dev2016 <trajfiles>/<trajfile> layout.

void Trajectory::writeTo2(qlib::LDom2Node *pNode) const
{
    super_t::writeTo2(pNode);

    qlib::LDom2Node *pFSNode = pNode->appendChild("trajfiles");
    for (const TrajBlockPtr &pBlk : m_blocks) {
        qlib::LDom2Node *pCCNode = pFSNode->appendChild("trajfile");
        pBlk->writeTo2(pCCNode);
    }
}

void Trajectory::readFrom2(qlib::LDom2Node *pNode)
{
    super_t::readFrom2(pNode);

    qlib::LDom2Node *pFSNode = pNode->findChild("trajfiles");
    if (pFSNode == NULL) return;

    for (pFSNode->firstChild(); pFSNode->hasMoreChild(); pFSNode->nextChild()) {
        qlib::LDom2Node *pChNode = pFSNode->getCurChild();
        if (!pChNode->getTagName().equals("trajfile")) continue;

        TrajBlockPtr pBlk(MB_NEW TrajBlock());
        pBlk->readFrom2(pChNode);
        // Start index is assigned later, once all blocks/frames are known.
        pBlk->setStartIndex(-1);
        pBlk->setTrajUID(getUID());
        m_blocks.push_back(pBlk);
    }
}
