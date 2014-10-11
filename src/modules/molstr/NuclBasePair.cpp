// -*-Mode: C++;-*-
//
// DNA/RNA base pair calculation
//

#include <common.h>

#include <qlib/LExceptions.hpp>
#include <qlib/LQuat.hpp>
#include <qlib/Vector4D.hpp>
#include <qlib/BSPTree.hpp>

// #include <qsys/UndoManager.hpp>

#include "MolCoord.hpp"
#include "MolChain.hpp"
#include "MolResidue.hpp"
#include "MolAtom.hpp"
#include "AtomIterator.hpp"
#include "ResidIterator.hpp"

#include "NuclBasePair.hpp"

#define PEPDIST_MAX  3.0

using namespace molstr;

/*
NuclBasePair::NuclBasePair()
{
}

/// Create from mol
void NuclBasePair::create(MolCoordPtr pMol)
{
}

/// Apply to mol
void NuclBasePair::applyTo(MolCoordPtr pMol)
{
}
*/

namespace {
  typedef qlib::BSPTree< int > BPTree;

  Vector4D getBaseNormImpl(MolResiduePtr pRes, const LString &anam1, const LString &anam2, const LString &anam3)
  {
    MolAtomPtr pa1 = pRes->getAtom(anam1);
    MolAtomPtr pa2 = pRes->getAtom(anam2);
    MolAtomPtr pa3 = pRes->getAtom(anam3);

    if (pa1.isnull() || pa2.isnull() || pa3.isnull())
      return Vector4D();

    Vector4D v1 = pa1->getPos();
    Vector4D v2 = pa2->getPos();
    Vector4D v3 = pa3->getPos();

    Vector4D tmp = (v2-v1).cross(v3-v1);
    return tmp.normalize();
  }

  Vector4D getBaseNorm(MolResiduePtr pRes)
  {
    LString btype;
    if (!pRes->getPropStr("basetype", btype))
      return Vector4D();

    if (btype.equals("pur"))
      return getBaseNormImpl(pRes, "C4", "C5", "C8");
    else if (btype.equals("pyr"))
      return getBaseNormImpl(pRes, "C2", "C4", "C6");
    return Vector4D();
  }

  /// Check the geometry of hbond in the base pair
  bool checkHbonGeom(const Vector4D &basenorm, const Vector4D &dv, double tilt)
  {
    const double GEOM_TOL = tilt;

    double dvlen = dv.length();
    double costh = basenorm.dot(dv) / dvlen;
    if (costh<-GEOM_TOL ||
        costh>GEOM_TOL)
      return false;

    return true;
  }

  bool checkAtomNames(const LString &name1,
                      const LString &name2,
                      const char *tgt1,
                      const char *tgt2)
  {
    if (name1.equals(tgt1) && name2.equals(tgt2))
      return true;
    if (name1.equals(tgt2) && name2.equals(tgt1))
      return true;
    return false;
  }
                      

  bool isWCHbonPair(MolAtomPtr pAtom, MolAtomPtr pAtom2)
  {
    const LString &name1 = pAtom->getName();
    const LString &name2 = pAtom2->getName();

    // G-C pair
    if (checkAtomNames(name1, name2, "N4", "O6"))
      return true;
    if (checkAtomNames(name1, name2, "N3", "N1"))
      return true;
    if (checkAtomNames(name1, name2, "O2", "N2"))
      return true;

    // A-U pair
    if (checkAtomNames(name1, name2, "O4", "N6"))
      return true;
    // if (checkAtomNames(name1, name2, "N3", "N1"))
    // return true;

    // G-U pair
    if (checkAtomNames(name1, name2, "N3", "O6"))
      return true;
    if (checkAtomNames(name1, name2, "O2", "N1"))
      return true;

    return false;
  }

}

void MolCoord::calcBasePair(double cutoff, double tilt)
{
  MolCoordPtr pMol(this);

  ResidIterator riter(pMol);
  MolResiduePtr pRes; // = NULL;
  LString btype, nam;

  // List of WC bp edge atom names
  const char *anames[] = {"N1", "N2", "O6", "N6", "N3", "N4", "O2", "O4", ""};

  // check size & reset basepair prop
  int nsize = 0, j;
  for (riter.first(); riter.hasMore(); riter.next()) {
    pRes = riter.get();
    MB_ASSERT(!pRes.isnull());
    
    if (!pRes->getPropStr("basetype", btype))
      continue;
    if (!btype.equals("pur") && !btype.equals("pyr"))
      continue;

    pRes->removePropStr("basepair");

    for (j=0; ;j++) {
      nam = anames[j];
      if (nam.isEmpty())
        break;
      if (!pRes->getAtom(nam).isnull())
        ++nsize;
    }
  }

  if (nsize==0)
    return; // no base pairs

  //////////

  BPTree tree;
  tree.alloc(nsize);
  MolAtomPtr pAtom;

  int i=0;
  for (riter.first(); riter.hasMore(); riter.next()) {
    pRes = riter.get();
    MB_ASSERT(!pRes.isnull());
    
    if (!pRes->getPropStr("basetype", btype))
      continue;
    if (!btype.equals("pur") && !btype.equals("pyr"))
      continue;

    const ResidIndex &resid = pRes->getIndex();

    for (j=0; ;j++) {
      nam = anames[j];
      if (nam.isEmpty())
        break;
      pAtom = pRes->getAtom(nam);
      if (!pAtom.isnull()) {
        tree.setAt(i, pAtom->getPos(), pAtom->getID());
        ++i;
      }
    }

  }
  
  tree.build();

  //////////
  
  Vector4D v, v2, basenorm1;
  int nfound;
  std::vector<int> resvec;
  MolAtomPtr pAtom2;
  MolResiduePtr pRes2;
  double cos_tilt = cos(qlib::toRadian(90.0-tilt));
  MB_DPRINTLN("BP Tilt tol:%f degree (cos=%f)", tilt, cos_tilt);
  
  for (riter.first(); riter.hasMore(); riter.next()) {
    pRes = riter.get();
    MB_ASSERT(!pRes.isnull());
    
    if (!pRes->getPropStr("basetype", btype))
      continue;
    if (!btype.equals("pur") && !btype.equals("pyr"))
      continue;

    basenorm1 = getBaseNorm(pRes);
    if (basenorm1.isZero())
      continue;
    
    const ResidIndex &resid = pRes->getIndex();
    MB_DPRINTLN("%s", pRes->toString().c_str());
    
    typedef std::map<MolResidue *, int> MapNRes;
    MapNRes mapnres;
    
    for (j=0; ;j++) {
      nam = anames[j];
      if (nam.isEmpty())
        break;
      pAtom = pRes->getAtom(nam);
      MB_DPRINTLN("  ATOM name=%s, ptr=%p", nam.c_str(), pAtom.get());
      if (pAtom.isnull())
        continue;
      
      int iaid = pAtom->getID();
      v = pAtom->getPos();
      v.w() = 0;
      resvec.clear();
      nfound = tree.findAround(v, cutoff, resvec);
      if (nfound==0)
        continue;
      
      double dmin = 1.0e100;
      int imin = -1;

      //BOOST_FOREACH(int aid, resvec) {
      for (int ii = 0; ii<nfound; ++ii) {
        int aid = resvec[ii];
        if (aid==iaid)
          continue;
        pAtom2 = getAtom(aid);
        if (pAtom2.isnull())
          continue;

        pRes2 = pAtom2->getParentResidue();
        if (pRes2==pRes)
          continue;

        MB_DPRINTLN("  Check ATOM name=%s %s", pRes2->toString().c_str(), pAtom2->getName().c_str());

        if (!isWCHbonPair(pAtom, pAtom2))
          continue;

        v2 = pAtom2->getPos();
        v2.w() = 0;
        Vector4D dv = v - v2;
        Vector4D basenorm2 = getBaseNorm(pRes2);

        if (!checkHbonGeom(basenorm1, dv, cos_tilt) || !checkHbonGeom(basenorm2, dv, cos_tilt))
          continue;
        double dsq = dv.sqlen();
        if (dsq<dmin) {
          dmin = dsq;
          imin = aid;
        }
      }
      
      if (imin<0)
        continue;
      pAtom2 = getAtom(imin);
      if (pAtom2.isnull())
        continue;
      pRes2 = pAtom2->getParentResidue();
      if (pRes2.isnull())
        continue;
      if (::sqrt(dmin)>cutoff)
        continue;
      
      MB_DPRINTLN("  %s %s --> %s %s, %f A",
                  resid.toString().c_str(), nam.c_str(),
                  pAtom2->getResIndex().toString().c_str(), pAtom2->getName().c_str(),
                  ::sqrt(dmin) );
      MapNRes::iterator iter = mapnres.find(pRes2.get());
      if (iter==mapnres.end())
        mapnres.insert(MapNRes::value_type(pRes2.get(), 1));
      else
        ++ iter->second;
    } // atoms

    int imax = 0;
    MolResidue *pMaxRes = NULL;
    BOOST_FOREACH (const MapNRes::value_type &elem, mapnres) {
      MB_DPRINTLN("  >> %s %s -- %d",
                  elem.first->getChainName().c_str(), elem.first->getIndex().toString().c_str(),
                  elem.second);
      if (elem.second>imax) {
        imax = elem.second;
        pMaxRes = elem.first;
      }
    }
    if (pMaxRes==NULL)
      continue;
    if (imax<2||imax>3) {
      MB_DPRINTLN("XXX ???");
      continue;
    }

    MB_DPRINTLN("  BASE PAIR: %s <--> %s",
                pRes->toString().c_str(), pMaxRes->toString().c_str());
    
    LString dummy;
    if (pMaxRes->getPropStr("basepair", dummy)) {
      MB_DPRINTLN("NuclBP> Warning: %s is already basepaired with other res %s", pMaxRes->toString().c_str(), dummy.c_str());
      continue;
    }

    LString peerstr = LString::format("%s.%s",
                                      pMaxRes->getChainName().c_str(),
                                      pMaxRes->getIndex().toString().c_str());
    pRes->setPropStr("basepair", peerstr);

    LString mystr = LString::format("%s.%s",
                                    pRes->getChainName().c_str(),
                                    pRes->getIndex().toString().c_str());
    pMaxRes->setPropStr("basepair", mystr);

  } // resid

}

