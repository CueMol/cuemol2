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

  m_pAllMol = MolCoordPtr(MB_NEW MolCoord());
}

Trajectory::~Trajectory()
{
}

/// Append a new atom.
int Trajectory::appendAtom(MolAtomPtr pAtom)
{
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
  m_pAllMol->applyTopology();
  
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
  
  m_pReadSel = pSel;

  m_selIndArray.resize( aidmap.size() );
  m_selIndArray.assign( aidmap.begin(), aidmap.end() );
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

void Trajectory::update(int iframe)
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
  
  // broadcast modification event
  fireAtomsMoved();
}

int Trajectory::getFrame() const
{
  return m_nCurFrm;
}

void Trajectory::setFrame(int ifrm)
{
  update(ifrm);
}

int Trajectory::getFrameSize() const
{
  return m_nTotalFrms;
}

///////////////////////////////////////////////////////

void Trajectory::writeTo2(qlib::LDom2Node *pNode) const
{
}

void Trajectory::readFrom2(qlib::LDom2Node *pNode)
{
}

void Trajectory::readFromStream(qlib::InStream &ins)
{
}

