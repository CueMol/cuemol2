// -*-Mode: C++;-*-
//
//

#include "common.h"

#include "MolBond.hpp"
#include "MolCoord.hpp"
#include "MolResidue.hpp"
#include "MolChain.hpp"

using namespace molstr;

int MolBond::getDistalAtomID(MolCoordPtr pMol, int &nbonds) const
{
  int aid1 = id1;
  int aid2 = id2;
  
  Vector4D nv1;
  
  std::deque<int> atoms1;
  // atoms1.push_back(aid1);
  // atoms1.push_back(aid2);
  
  MolAtomPtr pAtom1 = pMol->getAtom( id1 );
  //MolAtomPtr pAtom2 = pMol->getAtom( id2 );

  int nbon1 = pAtom1->getBondCount();
  if (nbon1<2) {
    return -1;
  }
  
  MolAtom::BondIter biter = pAtom1->bondBegin();
  MolAtom::BondIter bend = pAtom1->bondEnd();
  for (; biter!=bend; ++biter) {
    const MolBond *pb = *biter;
    if (pb==this)
      continue;
    
    int iBonAtm1 = pb->getAtom1();
    int iBonAtm2 = pb->getAtom2();
    MolAtomPtr pBonAtm1 = pMol->getAtom(iBonAtm1);
    MolAtomPtr pBonAtm2 = pMol->getAtom(iBonAtm2);
    
    if (pBonAtm1->getElement()==ElemSym::H ||
	pBonAtm2->getElement()==ElemSym::H)
      continue;
    
    // MB_DPRINTLN("Bond %s <--> %s",
    // pBonAtm1->toString().c_str(),
    // pBonAtm2->toString().c_str());
    
    if (iBonAtm1==aid1)
      atoms1.push_back(iBonAtm2);
    else if (iBonAtm2==aid1)
      atoms1.push_back(iBonAtm1);
  }
  
  nbonds = atoms1.size();
  //MB_ASSERT(nbonds>=1);
  if (nbonds<1) {
    return -1;
  }

  // v2 should be the distal bond
  // (bonds are stored from proximal to distal order,
  //  so it is probably better to use the last bond in the bondlist as v2 ...)
  return atoms1[nbonds-1];
}

namespace {
  Vector4D getNormalVec(MolAtomPtr pAtom1, MolAtomPtr pAtom2,
			const MolBond *pBond, MolCoordPtr pMol, int &nbonds, bool &bOK)
  {
    int aid_dist = pBond->getDistalAtomID(pMol, nbonds);
    if (aid_dist<0) {
      bOK = false;
      return Vector4D();
    }

    MolAtomPtr pDistAtm = pMol->getAtom(aid_dist);
    Vector4D vdist = pDistAtm->getPos();

    Vector4D v1 = pAtom2->getPos() - pAtom1->getPos();
    Vector4D v2 = vdist - pAtom1->getPos();

    Vector4D ev1 = v1.normalize();
    Vector4D nv1 = v2 - ev1.scale( ev1.dot(v2) );
    nv1 = nv1.normalize();

    bOK = true;

    //MB_DPRINTLN("DblBon nbon=%d, nv=%s", nbon1, nv1.toString().c_str());
    return nv1;
  }
}

Vector4D MolBond::getDblBondDir(MolCoordPtr pMol) const
{
  MolAtomPtr pAtom1 = pMol->getAtom( id1 );
  MolAtomPtr pAtom2 = pMol->getAtom( id2 );

  bool bOK1, bOK2;
  int nb1, nb2;
  Vector4D nv1, nv2;

  nv1 = getNormalVec(pAtom1, pAtom2, this, pMol, nb1, bOK1);
  nv2 = getNormalVec(pAtom2, pAtom1, this, pMol, nb2, bOK2);

  if (bOK1 && !bOK2)
    return nv1;

  if (!bOK1 && bOK2)
    return nv2;
  
  // isolated double bond --> cannot determine the dblbon direction
  if (!bOK1 && !bOK2)
    return Vector4D(1,0,0);

  if (nb1==1 && nb2>1)
    return nv1;

  if (nb1>1 && nb2==1)
    return nv2;

  // Topology is branched at the both sides of the bond
  // --> cannot determine whether nv1 or nv2 is the best choice...
  return nv1;
}

