// -*-Mode: C++;-*-
//
//

#include "common.h"

#include "MolBond.hpp"
#include "MolCoord.hpp"
#include "MolResidue.hpp"
#include "MolChain.hpp"

using namespace molstr;

int MolBond::getDistalAtomID(MolCoordPtr pMol, bool bDir, int &nbonds) const
{
  std::deque<int> atoms1;
  MolAtomPtr pAtom;
  int idc;

  if (bDir) {
    pAtom = pMol->getAtom( id1 );
    idc = id1;
  }
  else {
    pAtom = pMol->getAtom( id2 );
    idc = id2;
  }

  int nbon1 = pAtom->getBondCount();
  if (nbon1<2) {
    nbonds = 0;
    return -1;
  }
  
  MolAtom::BondIter biter = pAtom->bondBegin();
  MolAtom::BondIter bend = pAtom->bondEnd();
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
    
    if (iBonAtm1==idc)
      atoms1.push_back(iBonAtm2);
    else if (iBonAtm2==idc)
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
  Vector4D getNormalVec(MolAtomPtr pAtom1, MolAtomPtr pAtom2, MolAtomPtr pDistAtm)
  {
    Vector4D vdist = pDistAtm->getPos();

    Vector4D v1 = pAtom2->getPos() - pAtom1->getPos();
    Vector4D v2 = vdist - pAtom1->getPos();

    Vector4D ev1 = v1.normalize();
    Vector4D nv1 = v2 - ev1.scale( ev1.dot(v2) );
    nv1 = nv1.normalize();

    //MB_DPRINTLN("DblBon nbon=%d, nv=%s", nbon1, nv1.toString().c_str());
    return nv1;
  }
}

int MolBond::getDblBondID(MolCoordPtr pMol) const
{
  //MolAtomPtr pAtom1 = pMol->getAtom( id1 );
  //MolAtomPtr pAtom2 = pMol->getAtom( id2 );

  int nb1, nb2;
  Vector4D nv1, nv2;

  int aid1_dist = getDistalAtomID(pMol, true, nb1);
  int aid2_dist = getDistalAtomID(pMol, false, nb2);

  // isolated bond --> cannot determine the dblbon direction
  if (aid1_dist<0 && aid2_dist<0) {
    return -1;
  }
  
  if (aid1_dist>=0 && aid2_dist<0) {
    return aid1_dist; // Atom2 is dead end
  }

  if (aid2_dist>=0 && aid1_dist<0) {
    return aid2_dist; // Atom1 is dead end
  }

  // both ends have distal atoms

  if (nb1==1 && nb2>1)
    return aid1_dist; // Atom1 is no branch & Atom2 is multi branch

  if (nb1>1 && nb2==1)
    return aid2_dist; // Atom2 is no branch & Atom1 is multi branch

  // Topology is branched at the both sides of the bond
  // --> cannot determine whether nv1 or nv2 is the best choice...
  return aid2_dist;
}

Vector4D MolBond::getDblBondDir(MolCoordPtr pMol) const
{
  MolAtomPtr pAtom1 = pMol->getAtom( id1 );
  MolAtomPtr pAtom2 = pMol->getAtom( id2 );

  int id_d = getDblBondID(pMol);
  if (id_d<0)
    return Vector4D(1,0,0);

  MolAtomPtr pAtomD = pMol->getAtom( id_d );
  return getNormalVec(pAtom1, pAtom2, pAtomD);
  
/*
  int nb1, nb2;
  Vector4D nv1, nv2;

  int aid1_dist = getDistalAtomID(pMol, true, nb1);
  int aid2_dist = getDistalAtomID(pMol, false, nb2);

  // isolated bond --> cannot determine the dblbon direction
  if (aid1_dist<0 && aid2_dist<0) {
    return Vector4D(1,0,0);
  }
  
  if (aid1_dist>=0) {
    MolAtomPtr pDistAtm = pMol->getAtom(aid1_dist);
    nv1 = getNormalVec(pAtom1, pAtom2, pDistAtm);

    if (aid2_dist<0)
      return nv1; // Atom2 is dead end
  }

  if (aid2_dist>=0) {
    MolAtomPtr pDistAtm = pMol->getAtom(aid2_dist);
    nv2 = getNormalVec(pAtom2, pAtom1, pDistAtm);

    if (aid1_dist<0)
      return nv2; // Atom1 is dead end
  }

  if (nb1==1 && nb2>1)
    return nv1; // Atom1 is no branch & Atom2 is multi branch

  if (nb1>1 && nb2==1)
    return nv2; // Atom2 is no branch & Atom1 is multi branch

  // Topology is branched at the both sides of the bond
  // --> cannot determine whether nv1 or nv2 is the best choice...
  return nv2;
*/
}

