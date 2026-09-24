// -*-Mode: C++;-*-
//
// MD trajectory object
//

#include <common.h>

#include "Trajectory.hpp"
#include "TrajBlockEditInfo.hpp"

#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/MolAtom.hpp>
#include <modules/molstr/SelCommand.hpp>

#include <qsys/SceneManager.hpp>
#include <qsys/Scene.hpp>
#include <qsys/UndoManager.hpp>
#include <qsys/ObjectEvent.hpp>
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

TrajectoryPtr TrajBlockReader::getTargTrajOf(TrajBlock *pTB) const
{
    // getTargTraj() can fall back to the attached block, but a lazy frame load
    // happens long after detach(), so the block is passed in explicitly and
    // carries the UID itself (setupLazyBlock puts it there).
    qlib::uid_t uid = getTargTrajUID();
    if (uid == qlib::invalid_uid && pTB != NULL) uid = pTB->getTrajUID();
    if (uid == qlib::invalid_uid) {
        MB_THROW(qlib::NullPointerException,
                 "Trajectory frame load: parent trajectory is unknown");
        return TrajectoryPtr();
    }
    TrajectoryPtr pTraj = qsys::SceneManager::getObjectS(uid);
    if (pTraj.isnull()) {
        MB_THROW(qlib::RuntimeException,
                 "Trajectory frame load: parent trajectory is gone");
    }
    return pTraj;
}

void TrajBlockReader::setupLazyBlock(const TrajBlockPtr &pTB, const TrajectoryPtr &pTraj,
                                     int nAtoms, int nkept)
{
    // Every frame starts unloaded and without storage; a frame's coordinates
    // are allocated when it is first decoded and may be released again under
    // TrajBlock's cache limit.
    pTB->allocateOnDemand(nAtoms, nkept);

    // Trajectory::append() assigns the start index and scene, but not this --
    // only .qsc restore does -- and loadFrm() needs it to find its way back
    // to the trajectory once the reader has been detached.
    if (!pTraj.isnull()) pTB->setTrajUID(pTraj->getUID());

    // The block co-owns the reader from here on; canLazyLoad() has already
    // established that sharing ownership of `this` is sound.
    pTB->setTrajLoader(TrajBlockReaderPtr(this));
}

void TrajBlockReader::scatterCoords(const TrajectoryPtr &pTraj,
                                    const std::vector<qfloat32> &filecrd, int natomFile,
                                    qfloat32 *pcoord, float scale)
{
    // The selection index array maps trajectory atom -> file atom. It is NULL
    // when the topology is not loaded yet (.qsc order); fall back to the
    // identity map over the file's atoms (load-all).
    const quint32 *psia = pTraj->getSelIndexArray();
    const int nReadAtoms = (psia != NULL) ? static_cast<int>(pTraj->getAtomSize()) : natomFile;
    for (int jj = 0; jj < nReadAtoms; ++jj) {
        const int k = (psia != NULL) ? static_cast<int>(psia[jj]) : jj;
        pcoord[jj * 3 + 0] = filecrd[k * 3 + 0] * scale;
        pcoord[jj * 3 + 1] = filecrd[k * 3 + 1] * scale;
        pcoord[jj * 3 + 2] = filecrd[k * 3 + 2] * scale;
    }
}

Trajectory::Trajectory()
{
    m_bInit = false;
    m_nBlkInd = -1;
    m_nFrmInd = -1;
    m_nTotalFrms = 0;
    m_nCurFrm = 0;
    m_nAver = 0;
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

void Trajectory::applyLoadSel(const SelectionPtr &pSel)
{
    if (m_bInit) {
        MB_THROW(qlib::RuntimeException,
                 "Trajectory: a load selection must be applied before any block is added");
        return;
    }
    m_pLoadSel = pSel;
    if (getAtomSize() == 0) {
        m_bLoadSelPending = true;
        return;
    }
    applyLoadSelImpl();
}

void Trajectory::applyLoadSelImpl()
{
    m_bLoadSelPending = false;
    if (m_pLoadSel.isnull()) {
        setup();
        return;
    }

    // Atoms iterate in ID order, which is file order for every topology
    // reader (setup() relies on the same), so an atom's ordinal here is its
    // position in each frame of the data files.
    const int nAll = getAtomSize();
    std::deque<int> keep;
    std::vector<int> drop;
    int ifile = 0;
    for (AtomIter it = beginAtom(); it != endAtom(); ++it, ++ifile) {
        if (m_pLoadSel->isSelected(it->second))
            keep.push_back(ifile);
        else
            drop.push_back(it->first);
    }

    // In one call: most of a solvated system goes, and removing its residues
    // one at a time from a single long chain (GRO has no chains) is quadratic.
    // Trajectory::removeAtom() refuses (the topology is fixed once frames
    // exist), but no frame is attached yet.
    molstr::MolCoord::removeAtoms(drop);
    // The topology reader already bonded the full system; drop the bonds the
    // removed atoms leave dangling. primeInitialFrame() applies the topology
    // again on the kept atoms.
    if (!drop.empty()) removeNonpersBonds();

    setupSel(nAll, m_pLoadSel, keep);

    // Blocks restored from a .qsc were indexed before the topology, sized for
    // every atom in the file.
    for (const TrajBlockPtr &pBlk : m_blocks) {
        if (pBlk->getCrdSize() == nAll * 3 && !drop.empty())
            pBlk->selectAtoms(&m_loadSelAry[0], static_cast<int>(m_loadSelAry.size()));
    }

    LOG_DPRINTLN("Trajectory> load selection %s keeps %d of %d atoms",
                 m_pLoadSel->toString().c_str(), static_cast<int>(keep.size()), nAll);
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
    // Unconditionally: load() also records the use the cache limit ranks by.
    pBlk->load(nFrmInd);

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

void Trajectory::fillCrdArray()
{
    allocCrdArray();
    qfloat32 *pdst = mutableCrdArray();
    if (pdst == NULL) return;

    const int ncrds = getAtomSize() * 3;

    if (m_nAver > 0) {
        for (int i = 0; i < ncrds; ++i) pdst[i] = 0.0f;

        int nStart = qlib::max(0, m_nCurFrm - m_nAver);
        int nEnd = qlib::min(m_nCurFrm + m_nAver, m_nTotalFrms - 1);
        int nsum = 0;
        for (int j = nStart; j <= nEnd; ++j) {
            const qfloat32 *pcrd = getCrdArrayImplImpl(j);
            for (int i = 0; i < ncrds; ++i) pdst[i] += pcrd[i];
            ++nsum;
        }
        for (int i = 0; i < ncrds; ++i) pdst[i] /= nsum;
        return;
    }

    // no averaging: the current frame as it stands
    const qfloat32 *pcrd = getCrdArrayImplImpl(-1);
    for (int i = 0; i < ncrds; ++i) pdst[i] = pcrd[i];
}

void Trajectory::invalidateCrdArray()
{
    // Topology is fixed once loaded, so the index maps and the atom bindings
    // stay valid; only the base class's array would be dropped, and the next
    // update() would have to build it again for nothing.
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
        m_bInit = true;
        primeInitialFrame();
    }

    // Record undo/redo (only inside an interactive txn; the UndoManager
    // disables recording during undo/redo execution and .qsc load runs
    // outside any txn, so neither re-records here).
    qsys::UndoManager *pUM = nullptr;
    qsys::ScenePtr cursc = getScene();
    if (!cursc.isnull())
        pUM = cursc->getUndoMgr();
    if (pUM != nullptr && pUM->isOK()) {
        TrajBlockEditInfo *pEI = MB_NEW TrajBlockEditInfo;
        pEI->setupAppend(getUID(), pBlk, static_cast<int>(m_blocks.size()) - 1);
        pUM->addEditInfo(pEI);
    }

    // A block append changes the frame structure (nframe/nblock).
    fireTrajBlockChanged();

    LOG_DPRINTLN("Traj> append blk start=%d, size=%d", nnext, pBlk->getSize());
}

void Trajectory::fireTrajBlockChanged()
{
    // Trajectory-specific structural change (frame set changed). Distinct from
    // molecular topologyChanged (bond/atom connectivity), so it uses its own
    // descr; a listener filters on it via the event category (args.method).
    qsys::ObjectEvent obe;
    obe.setType(qsys::ObjectEvent::OBE_CHANGED);
    obe.setTarget(getUID());
    obe.setDescr("trajBlockChanged");
    fireObjectEvent(obe);
}

void Trajectory::removeBlock(int index)
{
    const int nblk = static_cast<int>(m_blocks.size());
    if (index < 0 || index >= nblk) {
        MB_THROW(qlib::RuntimeException, "removeBlock(): index out of range");
        return;
    }

    // Retain the block and record an undo step (interactive txn only; the
    // UndoManager disables recording during undo/redo and .qsc load).
    TrajBlockPtr pBlk = m_blocks[index];
    {
        qsys::UndoManager *pUM = nullptr;
        qsys::ScenePtr cursc = getScene();
        if (!cursc.isnull()) pUM = cursc->getUndoMgr();
        if (pUM != nullptr && pUM->isOK()) {
            TrajBlockEditInfo *pEI = MB_NEW TrajBlockEditInfo;
            pEI->setupRemove(getUID(), pBlk, index);
            pUM->addEditInfo(pEI);
        }
    }

    m_blocks.erase(m_blocks.begin() + index);
    recomputeBlockLayout();

    if (m_blocks.empty()) {
        // Back to the pre-append state; a later append/insert re-primes frame 0.
        m_bInit = false;
        m_nCurFrm = 0;
        // -1 is the "no block" value getTrajBlkImpl() checks for
        m_nBlkInd = -1;
        m_nFrmInd = -1;
    }
    else {
        // Keep the current frame in range and refresh the atom coordinates.
        if (m_nCurFrm >= m_nTotalFrms) m_nCurFrm = m_nTotalFrms - 1;
        if (m_nCurFrm < 0) m_nCurFrm = 0;
        update(m_nCurFrm);
    }

    // A block remove changes the frame structure (nframe/nblock).
    fireTrajBlockChanged();

    LOG_DPRINTLN("Traj> removeBlock idx=%d, nblk=%d, total=%d", index,
                 static_cast<int>(m_blocks.size()), m_nTotalFrms);
}

void Trajectory::insertBlock(int index, TrajBlockPtr pBlk)
{
    const int nblk = static_cast<int>(m_blocks.size());
    if (index < 0 || index > nblk) {
        MB_THROW(qlib::RuntimeException, "insertBlock(): index out of range");
        return;
    }

    pBlk->setSceneID(getSceneID());
    m_blocks.insert(m_blocks.begin() + index, pBlk);
    recomputeBlockLayout();

    if (!m_bInit) {
        // Re-populating a previously-emptied trajectory: re-prime frame 0.
        m_bInit = true;
        primeInitialFrame();
    }
    else {
        if (m_nCurFrm >= m_nTotalFrms) m_nCurFrm = m_nTotalFrms - 1;
        if (m_nCurFrm < 0) m_nCurFrm = 0;
        update(m_nCurFrm);
    }

    fireTrajBlockChanged();

    LOG_DPRINTLN("Traj> insertBlock idx=%d, nblk=%d, total=%d", index,
                 static_cast<int>(m_blocks.size()), m_nTotalFrms);
}

void Trajectory::moveBlock(int from, int to)
{
    const int nblk = static_cast<int>(m_blocks.size());
    if (from < 0 || from >= nblk || to < 0 || to >= nblk) {
        MB_THROW(qlib::RuntimeException, "moveBlock(): index out of range");
        return;
    }
    if (from == to) return;

    // Record an undo step (interactive txn only).
    {
        qsys::UndoManager *pUM = nullptr;
        qsys::ScenePtr cursc = getScene();
        if (!cursc.isnull()) pUM = cursc->getUndoMgr();
        if (pUM != nullptr && pUM->isOK()) {
            TrajBlockEditInfo *pEI = MB_NEW TrajBlockEditInfo;
            pEI->setupMove(getUID(), from, to);
            pUM->addEditInfo(pEI);
        }
    }

    // Reorder: remove at `from`, re-insert so the block ends up at index `to`.
    TrajBlockPtr pBlk = m_blocks[from];
    m_blocks.erase(m_blocks.begin() + from);
    m_blocks.insert(m_blocks.begin() + to, pBlk);
    recomputeBlockLayout();

    // Frame count is unchanged, but the current global frame now maps to
    // different coordinates under the new ordering, so refresh.
    if (!m_blocks.empty()) {
        if (m_nCurFrm >= m_nTotalFrms) m_nCurFrm = m_nTotalFrms - 1;
        if (m_nCurFrm < 0) m_nCurFrm = 0;
        update(m_nCurFrm);
    }

    fireTrajBlockChanged();

    LOG_DPRINTLN("Traj> moveBlock from=%d to=%d, nblk=%d", from, to,
                 static_cast<int>(m_blocks.size()));
}

void Trajectory::recomputeBlockLayout()
{
    int nstart = 0;
    for (const TrajBlockPtr &pblk : m_blocks) {
        pblk->setStartIndex(nstart);
        nstart += pblk->getSize();
    }
    m_nTotalFrms = nstart;
}

TrajBlockPtr Trajectory::getBlock(int index) const
{
    if (index < 0 || index >= static_cast<int>(m_blocks.size())) {
        MB_THROW(qlib::RuntimeException, "getBlock(): index out of range");
        return TrajBlockPtr();
    }
    return m_blocks[index];
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

    // The coordinate array is the source of truth: fill it from the frame data
    // and everything else -- the coordinate-texture renderers by array index,
    // MolAtom::getPos() through the per-atom binding -- reads it from there.
    fillCrdArray();

    // MVP: always fire OBE_CHANGED "atomsMoved". Dynamic-event distinction
    // (bDyn) is deferred to a later optimization sub-phase.
    commitCrdArray();
}

void Trajectory::setFrame(int ifrm)
{
    ensureInit();
    update(ifrm);
}

void Trajectory::setFrmAverSize(int naver)
{
    if (m_nAver == naver) return;
    m_nAver = naver;

    // The array holds the average over the old window, and it is what every
    // consumer reads, so a new window has to be applied now rather than at the
    // next frame change.
    if (m_bInit) update(m_nCurFrm);
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
    // Blocks restored from a scene file were never checked against the
    // topology (append() does this for interactive loads); a block whose
    // frame size does not match the atom count, or that holds no frame,
    // would be read out of bounds by update(). Drop such blocks.
    const int nCrds = getAtomSize() * 3;
    if (nCrds > 0) {
        for (auto it = m_blocks.begin(); it != m_blocks.end();) {
            const TrajBlockPtr &pBlk = *it;
            if (pBlk->getSize() <= 0 || pBlk->getCrdSize() != nCrds) {
                LOG_DPRINTLN("Trajectory> block with %d frames of %d coords does not fit %d atoms (dropped)",
                             pBlk->getSize(), pBlk->getCrdSize(), getAtomSize());
                it = m_blocks.erase(it);
            } else {
                ++it;
            }
        }
    }

    // Assign contiguous start indices and total frame count.
    int nnext = 0;
    for (const TrajBlockPtr &pBlk : m_blocks) {
        pBlk->setSceneID(getSceneID());
        pBlk->setStartIndex(nnext);
        nnext += pBlk->getSize();
    }
    m_nTotalFrms = nnext;

    if (m_blocks.empty()) {
        // nothing left to prime; a later append() starts over
        m_bInit = false;
        m_nCurFrm = 0;
        m_nBlkInd = -1;
        m_nFrmInd = -1;
        return;
    }

    // Mark initialized before priming so the ensureInit() in setFrame() /
    // getFrameSize() does not re-enter.
    m_bInit = true;

    primeInitialFrame();
}

void Trajectory::primeInitialFrame()
{
    // Write frame-0 coordinates into the atoms, then rebuild coordinate-
    // dependent topology (distance bonds via removeNonpersBonds + applyTopology)
    // and secondary structure on those real coordinates. This is what makes a
    // trajectory show (and assign topology from) its own frame 0 rather than
    // the topology file's coordinates -- which for a coordinate-less topology
    // (e.g. prmtop) would otherwise be all-zero.
    update(0);
    applyTopology();
    calcProt2ndry();
}

void Trajectory::readerDetached()
{
    super_t::readerDetached();
    // A load selection read from the .qsc waits for the atoms it selects.
    if (m_bLoadSelPending && getAtomSize() > 0) applyLoadSelImpl();
    // End of a topology/data load. In a .qsc the <trajfiles> blocks are read
    // before the topology src, so by the time the topology reader detaches both
    // the blocks and the atoms exist: prime frame 0 now, before the first
    // render, so the initial display is the trajectory's frame 0. ensureInit()
    // is idempotent and a no-op while no blocks exist (topology-only load, or
    // the live append-first order where append() does the priming).
    ensureInit();
}

//////////
// Serialization (QSC) -- mirrors the dev2016 <trajfiles>/<trajfile> layout.

void Trajectory::writeTo2(qlib::LDom2Node *pNode) const
{
    super_t::writeTo2(pNode);

    if (!m_pLoadSel.isnull()) pNode->appendStrAttr("loadsel", m_pLoadSel->toString());

    qlib::LDom2Node *pFSNode = pNode->appendChild("trajfiles");
    for (const TrajBlockPtr &pBlk : m_blocks) {
        qlib::LDom2Node *pCCNode = pFSNode->appendChild("trajfile");
        pBlk->writeTo2(pCCNode);
    }
}

void Trajectory::readFrom2(qlib::LDom2Node *pNode)
{
    super_t::readFrom2(pNode);

    const LString loadsel = pNode->getStrAttr("loadsel");
    if (!loadsel.isEmpty()) {
        m_pLoadSel = SelectionPtr(MB_NEW molstr::SelCommand(loadsel));
        m_bLoadSelPending = true;
    }

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
