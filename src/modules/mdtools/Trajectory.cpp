// -*-Mode: C++;-*-
//
// MD trajectory object
//

#include <common.h>

#include "Trajectory.hpp"
#include <modules/molstr/MolCoord.hpp>

using namespace mdtools;
using molstr::MolAtom;
using molstr::MolAtomPtr;
using molstr::MolCoord;
using molstr::MolCoordPtr;

Trajectory::Trajectory()
{
  m_bInit = false;
  m_nBlkInd = -1;
  m_nFrmInd = -1;
  m_nTotalFrms = 0;
  m_nCurFrm = 0;

  m_bLoop = true;
  // m_pAllMol = MolCoordPtr(MB_NEW MolCoord());
}

Trajectory::~Trajectory()
{
  m_pAllMol = MolCoordPtr();
}

/// Append a new atom.
int Trajectory::appendAtom(MolAtomPtr pAtom)
{
  if (super_t::getAtomSize()!=0) {
    // already constructed --> cannot append new atoms
    MB_THROW(qlib::RuntimeException, "Trajectory: appendAtom to created traj not supported");
    return -1;
  }
  
  if (m_pAllMol.isnull()) {
    m_pAllMol = MolCoordPtr(MB_NEW MolCoord());
    m_pAllMol->setSceneID(getSceneID());
  }
  return m_pAllMol->appendAtom(pAtom);
}

/// Remove an atom by atom ID
bool Trajectory::removeAtom(int atomid)
{
  MB_THROW(qlib::RuntimeException, "Trajectory: removeAtom not supported");
  return false;
}

void Trajectory::createMol(SelectionPtr pSel)
{
  if (super_t::getAtomSize()!=0) {
    // already constructed --> cannot append new atoms
    MB_THROW(qlib::RuntimeException, "Trajectory: appendAtom to created traj not supported");
    return;
  }

  m_pAllMol->applyTopology(false);
  
  std::deque<int> aidmap;
  AtomIter aiter = m_pAllMol->beginAtom();
  AtomIter eiter = m_pAllMol->endAtom();

  int i=0, j=0;
  for (; aiter!=eiter; ++aiter, ++i) {
    MolAtomPtr pAtom = aiter->second;
    int aid = aiter->first;
    MB_ASSERT(aid==i);

    if (pSel.isnull() || pSel->isSelected(pAtom)) {
      // add the copy of the original atom
      MolAtomPtr pNewAtom(static_cast<MolAtom *>(pAtom->clone()));
      int aid2 = super_t::appendAtom(pNewAtom);
      MB_ASSERT(aid2==j);
      aidmap.push_back(aid);
      ++j;
    }
  }
  
  // m_pReadSel = pSel;

  m_selIndArray.resize( aidmap.size() );
  m_selIndArray.assign( aidmap.begin(), aidmap.end() );

  m_nAllAtomSize = m_pAllMol->getAtomSize();
  m_pAllMol = MolCoordPtr();
}


//////////

qfloat32 *Trajectory::getCrdArrayImpl()
{
  if (m_nBlkInd==-1 || m_nFrmInd==-1) {
    MB_THROW(qlib::RuntimeException, "getCrdArrayImpl: no data in the trajectory");
    return NULL;
  }
  TrajBlockPtr pBlk = m_blocks[m_nBlkInd];
  return pBlk->getCrdArray(m_nFrmInd);
}

void Trajectory::invalidateCrdArray()
{
}

void Trajectory::createIndexMapImpl(CrdIndexMap &indmap, AidIndexMap &aidmap)
{
  // make index mapping
  indmap.clear();

  const int natoms = getAtomSize();
  aidmap.resize(natoms);

  AtomIter aiter = beginAtom();
  AtomIter eiter = endAtom();
  quint32 ind = 0;
  for (; aiter!=eiter; ++aiter, ++ind) {
    int aid = aiter->first;
    MolAtomPtr pAtom = aiter->second;
    indmap.insert(CrdIndexMap::value_type(aid, ind));
    aidmap[ind] = aid;
  }
}


//////////////////////////////////////////

void Trajectory::append(TrajBlockPtr pBlk)
{
  int nAtoms = getAtomSize();
  if (nAtoms*3 != pBlk->getCrdSize()) {
    // non-compatible trajectory block
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
    update(0);
    updateCrdArray();
    //createLinearMap();
    applyTopology();
    m_bInit = true;
  }

  LOG_DPRINTLN("Traj> append blk start=%d, size=%d", nnext, pBlk->getSize());
}

void Trajectory::update(int iframe, bool bDyn)
{
  int ind1 = 0;
  int ind2 = -1;

  TrajBlockPtr pBlk;
  BOOST_FOREACH (TrajBlockPtr pelem, m_blocks) {
    int istart = pelem->getStartIndex();
    int iend = istart + pelem->getSize() -1;
    if (istart<=iframe && iframe<=iend) {
      ind2 = iframe - istart;
      pBlk = pelem;
      break;
    }
    ++ind1;
  }

  if (ind2<0) {
    // ERROR: iframe out of range
    MB_THROW(qlib::RuntimeException, "update(): iframe out of range");
    return;
  }

  //qfloat32 *pcrd = pBlk->getCrdArray(ind2);
  m_nCurFrm = iframe;
  m_nBlkInd = ind1;
  m_nFrmInd = ind2;

  crdArrayChanged();
  
  if (bDyn) {
    // broadcast modification event (dynamic update)
    fireAtomsMovedDynamic();
  }
  else {
    // broadcast modification event
    fireAtomsMoved();
  }
}

int Trajectory::getFrame() const
{
  return m_nCurFrm;
}

void Trajectory::setFrame(int ifrm)
{
  update(ifrm);
}

void Trajectory::setDynFrame(int ifrm)
{
  update(ifrm, true);
}

int Trajectory::getFrameSize() const
{
  return m_nTotalFrms;
}

///////////////////////////////////////////////////////

using qlib::LDom2Node;

void Trajectory::writeTo2(qlib::LDom2Node *pNode) const
{
  super_t::writeTo2(pNode);

  LDom2Node *pFSNode = pNode->appendChild("trajfiles");

  int nblks = m_blocks.size();
  for (int i=0; i<nblks; ++i) {
    TrajBlockPtr pBlk = m_blocks[i];
    
    LDom2Node *pCCNode = pFSNode->appendChild("trajfile");
    pBlk->writeTo2(pCCNode);
  }
}

void Trajectory::readFrom2(qlib::LDom2Node *pNode)
{
  super_t::readFrom2(pNode);

  LDom2Node *pFSNode = pNode->findChild("trajfiles");
  if (pFSNode==NULL)
    return;

  for (pFSNode->firstChild(); pFSNode->hasMoreChild(); pFSNode->nextChild()) {
    LDom2Node *pChNode = pFSNode->getCurChild();
    LString tag = pChNode->getTagName();

    if (tag.equals("trajfile")) {
      TrajBlockPtr pBlk(MB_NEW TrajBlock());
      pBlk->readFrom2(pChNode);

      // start index should be initialized later
      pBlk->setStartIndex(-1);
      //pBlk->setSceneID(getSceneID());
      pBlk->setTrajUID(getUID());
      m_blocks.push_back(pBlk);

    }
    else {
      // Unknown tag --> ignore??
      MB_DPRINTLN("Unknown tag: %s", tag.c_str());
    }
  }

}

/*void Trajectory::readFromStream(qlib::InStream &ins)
{
}*/

void Trajectory::sceneChanged(qsys::SceneEvent &ev)
{
  if (ev.getType()==qsys::SceneEvent::SCE_SCENE_ONLOADED &&
      ev.getTarget()==getSceneID()) {
    // update trajblock data
    updateTrajBlockDataImpl();
  }
  // super_t::sceneChanged(ev);
}

void Trajectory::updateTrajBlockDataImpl()
{
  // should not be initialized here
  MB_ASSERT(!m_bInit);

  const int nblks = m_blocks.size();
  int nnext = 0;

  for (int i=0; i<nblks; ++i) {
    TrajBlockPtr pBlk = m_blocks[i];
    
    pBlk->setSceneID(getSceneID());
    pBlk->setStartIndex(nnext);
    nnext += pBlk->getSize();
  }

  m_nTotalFrms = nnext;

  update(0);
  updateCrdArray();

  applyTopology();
  m_bInit = true;
}

bool Trajectory::onTimer(double t, qlib::time_value curr, bool bLast)
{
  int ifrm = m_nCurFrm + 1;
  bool bend = false;

  MB_DPRINTLN("Traj> onTimer ifrm=%d, nTotal=%d", ifrm, m_nTotalFrms);

  if (ifrm<m_nTotalFrms) {
  //if (ifrm<10) {
    // update current frame
    update(ifrm, true);
  }
  else {
    update(0, true);
    bend = true;
  }

  if (bend) {
    if (m_bLoop) {
      if (bLast)
	startSelfAnim();
    }
    else {
      //stopSelfAnim();
      
      // send Fix object change event (to fix changes after the dynamic changes)
      {
	qsys::ObjectEvent obe;
	obe.setType(qsys::ObjectEvent::OBE_CHANGED_FIXDYN);
	obe.setTarget(getUID());
	obe.setDescr("atomsMoved");
	fireObjectEvent(obe);
      }
      m_bSelfAnim = false;
      
      // prevent the next event invocation
      return false;
    }
  }

  return true;
}
