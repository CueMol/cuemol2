// -*-Mode: C++;-*-
//
//

#include "common.h"

#include "MolBond.hpp"
#include "MolCoord.hpp"
#include "MolResidue.hpp"
#include "MolChain.hpp"

using namespace molstr;

namespace {
  Vector4D getNormalVec(MolAtomPtr pAtom1, MolAtomPtr pAtom2, const MolBond *pBond, MolCoordPtr pMol, int &nbonds, bool &bOK)
  {
    int aid1 = pAtom1->getID();
    int aid2 = pAtom2->getID();

    Vector4D nv1;

    std::deque<Vector4D> atoms1;
    atoms1.push_back(pAtom1->getPos());
    atoms1.push_back(pAtom2->getPos());

    int nbon1 = pAtom1->getBondCount();
    if (nbon1<2) {
      bOK = false;
      return Vector4D();
    }

    MolAtom::BondIter biter = pAtom1->bondBegin();
    MolAtom::BondIter bend = pAtom1->bondEnd();
    for (; biter!=bend; ++biter) {
      MolBond *pb = *biter;
      if (pb==pBond)
        continue;

      MolAtomPtr pBonAtm1 = pMol->getAtom(pb->getAtom1());
      MolAtomPtr pBonAtm2 = pMol->getAtom(pb->getAtom2());
      //MB_DPRINTLN("Bond %s <--> %s",
      //pBonAtm1->toString().c_str(),
      //pBonAtm2->toString().c_str());
      if (pb->getAtom1()==aid1)
        atoms1.push_back(pBonAtm2->getPos());
      else if (pb->getAtom2()==aid1)
        atoms1.push_back(pBonAtm1->getPos());
    }
    
    nbonds = atoms1.size();
    MB_ASSERT(nbonds>=3);

    // v2 should be the distal bond
    // (bonds are stored from proximal to distal order,
    //  so it is probably better to use the last bond in the bondlist as v2 ...)
    Vector4D v1 = atoms1[1] - atoms1[0];
    Vector4D v2 = atoms1[nbonds-1] - atoms1[0];

    //nv1 = v1.cross(v2);
    //nv1 = nv1.normalize();
    Vector4D ev1 = v1.normalize();
    nv1 = v2 - ev1.scale( ev1.dot(v2) );
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

  if (nb1==3&&nb2>3)
    return nv1;

  if (nb1>3&&nb2==3)
    return nv2;

  // Topology is branched at the both sides of the bond
  // --> cannot determine whether nv1 or nv2 is the best choice...
  return nv1;
}

