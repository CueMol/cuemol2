// -*-Mode: C++;-*-
//
// Molecular model coordinates class
//

#include <common.h>

#include "AnimMol.hpp"
#include "MolArrayMap.hpp"
#include "MolAtom.hpp"

using namespace molstr;

char AnimMol::getCrdValidFlag() const
{
  return m_nValidFlag;
}

Vector4D AnimMol::getAtomArray(int aid) const
{
  if (m_nValidFlag==CRD_ATOM_VALID ||
      m_indmap.size()==0)
    return Vector4D();

  CrdIndexMap::const_iterator iter = m_indmap.find(aid);
  if (iter==m_indmap.end())
    return Vector4D();

  quint32 ind = iter->second;
  AnimMol *pthis = const_cast<AnimMol *>(this);
  qfloat32 *pcrd = pthis->getCrdArrayImpl();

  return Vector4D(pcrd[ind*3+0],
                  pcrd[ind*3+1],
                  pcrd[ind*3+2]);
  
}

void AnimMol::setAtomArray(int aid, const Vector4D &pos)
{
  if (m_indmap.size()==0) {
    // TO DO: throw exception
    MB_THROW(qlib::RuntimeException, "setAtomArray: crdarray not initialized");
    return;
  }
  
  CrdIndexMap::const_iterator iter = m_indmap.find(aid);
  if (iter==m_indmap.end()) {
    // TO DO: throw exception
    LString msg = LString::format("setAtomArray: setAtomArray AID %d not found in indmap", aid);
    MB_THROW(qlib::RuntimeException, msg);
    return;
  }

  quint32 ind = iter->second;
  qfloat32 *pcrd = getCrdArrayImpl();

  pcrd[ind*3+0] = (float) pos.x();
  pcrd[ind*3+1] = (float) pos.y();
  pcrd[ind*3+2] = (float) pos.z();
}

void AnimMol::createIndexMap()
{
  MolArrayMap mam;
  mam.setup(MolCoordPtr(this));
  
  // make index mapping
  m_indmap.clear();
  MolArrayMap::const_iterator iter = mam.begin();
  MolArrayMap::const_iterator eiter = mam.end();
  for (; iter!=eiter; ++iter) {
    int aid = iter->first.pA->getID();
    quint32 ind = iter->second;
    m_indmap.insert(CrdIndexMap::value_type(aid, ind));
  }
}

void AnimMol::createLinearMap()
{
  // make index mapping
  m_indmap.clear();

  AtomIter aiter = beginAtom();
  AtomIter eiter = endAtom();
  quint32 ind = 0;
  for (; aiter!=eiter; ++aiter, ++ind) {
    int aid = aiter->first;
    MolAtomPtr pAtom = aiter->second;
    m_indmap.insert(CrdIndexMap::value_type(aid, ind));
  }
}

void AnimMol::updateCrdArray()
{
  if (m_nValidFlag==CRD_BOTH_VALID)
    return;
  
  if (m_nValidFlag==CRD_ATOM_VALID) {
    // copy from atom to array
    // (Update crdarray)

    /*
    MolArrayMap mam;
    mam.setup(MolCoordPtr(this));
    
    // make index mapping
    m_indmap.clear();
    MolArrayMap::const_iterator iter = mam.begin();
    MolArrayMap::const_iterator eiter = mam.end();
    for (; iter!=eiter; ++iter) {
      int aid = iter->first.pA->getID();
      quint32 ind = iter->second;
      m_indmap.insert(CrdIndexMap::value_type(aid, ind));
    }
    */
    createIndexMap();
    // make float array
    quint32 natoms = m_indmap.size();
    //m_crdarray.resize( natoms*3 );
    qfloat32 *pcrd = getCrdArrayImpl();
    
    AtomIter aiter = beginAtom();
    AtomIter eiter = endAtom();
    for (; aiter!=eiter; ++aiter) {
      int aid = aiter->first;
      MolAtomPtr pAtom = aiter->second;
      CrdIndexMap::const_iterator iter = m_indmap.find(aid);
      if (iter==m_indmap.end())
        continue; // TO DO: throw exception
      
      quint32 ind = iter->second;
      Vector4D pos = pAtom->getPosCache();
      pcrd[ind*3+0] = (float) pos.x();
      pcrd[ind*3+1] = (float) pos.y();
      pcrd[ind*3+2] = (float) pos.z();
    }

    /*
    iter = mam.begin();
    for (; iter!=eiter; ++iter) {
      MolAtomPtr pA = iter->first.pA;
      int aid = pA->getID();
      quint32 ind = iter->second;
      Vector4D pos = pA->getPosCache();
      pcrd[ind*3+0] = (float) pos.x();
      pcrd[ind*3+1] = (float) pos.y();
      pcrd[ind*3+2] = (float) pos.z();
    }*/
    
    LOG_DPRINTLN("CrdArray/IndMap created: natoms=%d", natoms);
    m_nValidFlag=CRD_BOTH_VALID;
  }
  else if (m_nValidFlag==CRD_ARRAY_VALID) {
    // copy from array to atom
    qfloat32 *pcrd = getCrdArrayImpl();
    AtomIter aiter = beginAtom();
    AtomIter eiter = endAtom();
    for (; aiter!=eiter; ++aiter) {
      int aid = aiter->first;
      MolAtomPtr pAtom = aiter->second;
      CrdIndexMap::const_iterator iter = m_indmap.find(aid);
      if (iter==m_indmap.end())
        continue; // TO DO: throw exception

      quint32 ind = iter->second;
      Vector4D pos(pcrd[ind*3+0],
                   pcrd[ind*3+1],
                   pcrd[ind*3+2]);
      pAtom->setPosCache(pos);
    }
  }
}

float *AnimMol::getAtomArray()
{
  if (m_nValidFlag!=CRD_ATOM_VALID)
    return getCrdArrayImpl(); //&m_crdarray[0];

  updateCrdArray();
  return getCrdArrayImpl(); //&m_crdarray[0];
}


quint32 AnimMol::getCrdArrayInd(int aid) const
{
  if (m_nValidFlag==CRD_ATOM_VALID) {
    AnimMol *pthis = const_cast<AnimMol *>(this);
    pthis->updateCrdArray();
  }

  CrdIndexMap::const_iterator iter = m_indmap.find(aid);
  if (iter==m_indmap.end()) {
    MB_THROW(qlib::RuntimeException, "getCrdArrayInd failed");
    return (quint32) -1;
  }

  return iter->second;
}

void AnimMol::invalidateCrdArray()
{
  m_nValidFlag = CRD_ATOM_VALID;
  m_indmap.clear();
  // m_crdarray.clear();
}


