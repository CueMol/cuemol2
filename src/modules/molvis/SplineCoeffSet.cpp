// -*-Mode: C++;-*-
//
//  Set of spline coefficients
//
//  $Id: SplineCoeffSet.cpp,v 1.7 2009/11/08 16:42:14 rishitani Exp $

#include <common.h>
#include "molvis.hpp"

#include "SplineCoeffSet.hpp"

#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/MolChain.hpp>
#include <modules/molstr/MolResidue.hpp>
#include <modules/molstr/MolAtom.hpp>
#include <modules/molstr/ResidIterator.hpp>
#include <modules/molstr/MainChainRenderer.hpp>

using namespace molvis;
using namespace molstr;

SplineCoeffSet::SplineCoeffSet()
     : m_pCurCoeff(NULL)
{
  m_dsmooth = 0.0;
  m_pSmoothEval = NULL;
}

SplineCoeffSet::~SplineCoeffSet()
{
  cleanup();
}

void SplineCoeffSet::setSmoothEval(RealNumEvaluator *pEval)
{
  //if (m_pSmoothEval!=NULL)
  //delete m_pSmoothEval;
  m_pSmoothEval = pEval;
}

void SplineCoeffSet::cleanup()
{
  // remove all coefficients
  std::list<SplineCoeff *>::const_iterator iter = m_list.begin();
  for ( ; iter!=m_list.end(); iter++) {
    SplineCoeff *p = *iter;
    delete p;
  }
  m_list.erase(m_list.begin(), m_list.end());

  //if (m_pSmoothEval!=NULL)
  //delete m_pSmoothEval;
  //m_pSmoothEval = NULL;
}

bool SplineCoeffSet::isValid() const
{
  if (m_list.size()<=0)
    return false;
  return true;
}

/**
  Generate spline coefficient set for the pmol.
  Coefficients are generated for the entire molecule,
  irrespective of the current selection.
 */
bool SplineCoeffSet::generate(MolCoordPtr pmol)
{
  // remove all previous data
  cleanup();

  // visit all residues
  ResidIterator iter(pmol);
  
  MolResiduePtr pPrevResid;
  for (iter.first(); iter.hasMore(); iter.next()) {
    MolResiduePtr pRes = iter.get();
    MB_ASSERT(!pRes.isnull());
    MolAtomPtr pPiv = getPivotAtom(pRes);
    if (pPiv.isnull()) {
      // this resid doesn't has pivot, so we skip it (and make seg brk)
      if (!pPrevResid.isnull())
        endSegment(pPrevResid.get());
      pPrevResid = MolResiduePtr();
      continue;
    }
    
    // check segment breakage
    if (m_pParent->isNewSegment(pRes, pPrevResid)) {
      if (!pPrevResid.isnull())
        endSegment(pPrevResid.get());
      beginSegment(pRes.get());
    }
    
    rendResid(pRes.get());
    pPrevResid = pRes;
  }
  
  if (!pPrevResid.isnull())
    endSegment(pPrevResid.get());
  
  return true;
  // MB_DPRINTLN("SplineCoeffSet::display() end OK.");
}

void SplineCoeffSet::beginSegment(MolResidue *pres)
{
  MB_ASSERT(m_pCurCoeff==NULL);
  SplineCoeff *pcoeff = createSplineCoeff();
  m_pCurCoeff = pcoeff;
}

void SplineCoeffSet::rendResid(MolResidue *pRes)
{
  MB_ASSERT(m_pCurCoeff!=NULL);
  m_pCurCoeff->addResid(pRes);
}

void SplineCoeffSet::endSegment(MolResidue *pres)
{
  MB_ASSERT(m_pCurCoeff!=NULL);
  if (!m_pCurCoeff->generate()) {
    delete m_pCurCoeff;
    m_pCurCoeff = NULL;
    return;
  }
  m_list.push_back(m_pCurCoeff);
  m_pCurCoeff = NULL;
}

SplineCoeff *SplineCoeffSet::createSplineCoeff()
{
  return MB_NEW SplineCoeff(this);
}

SplineCoeff *SplineCoeffSet::searchCoeff(MolResiduePtr pres)
{
  std::list<SplineCoeff *>::const_iterator iter = m_list.begin();
  for ( ; iter!=m_list.end(); iter++) {
    SplineCoeff *pcoeff = (*iter);
    if (pcoeff->contains(pres.get()))
      return pcoeff;
  }
  return NULL;
}

MolAtomPtr SplineCoeffSet::getPivotAtom(MolResiduePtr pRes) const
{
  return m_pParent->getPivotAtom(pRes);
}

double SplineCoeffSet::getSmoothByRes(MolResidue *pRes)
{
  double rval;
  if (m_pSmoothEval==NULL||pRes==NULL)
    return m_dsmooth;
  if (m_pSmoothEval->getResidValue(pRes, rval))
    return rval;
  return m_dsmooth;
}

////////////////////////////////////////////////////////////////

inline static
bool getNextResid(std::list<MolResidue *> &lst,
                  std::list<MolResidue *>::const_iterator iter,
                  MolResidue *&pRes)
{
  if (iter==lst.end())
    return false;
  iter++;
  if (iter==lst.end())
    return false;
  pRes = *iter;
  return true;
}

inline static
bool getPrevResid(std::list<MolResidue *> &lst,
                  std::list<MolResidue *>::const_iterator iter,
                  MolResidue *&pRes)
{
  if (iter==lst.begin() || iter==lst.end())
    return false;
  iter--;
  if (iter==lst.end())
    return false;
  pRes = *iter;
  return true;
}

MolAtomPtr SplineCoeff::getSafeAtom(int nind) const
{
  if (nind<0 || nind>=m_nResids)
    return MolAtomPtr();
  MolResidue *pres = m_resid_array[nind];
  return getPivotAtom(MolResiduePtr(pres));
}

bool SplineCoeff::generate()
{
  if (m_resid_array.empty()) {
    // no residue
    return false;
  }

  m_nResids = m_resid_array.size();
  if (m_nResids==1) {
    // degenerated case (point)
    return false;
  }
  else if (m_nResids==2) {
    // degenerated case (line)
    return false;
  }

  // get the chain name of this segment
  m_chainname = m_resid_array[0]->getParentChain()->getName();

  //
  // initialize the parameter tables
  //
  m_nParamTabSz = m_nResids +2;
  m_pParamTab = MB_NEW double[m_nParamTabSz];
  m_pParamCentTab = MB_NEW double[m_nParamTabSz];
  for (int i=0; i<m_nParamTabSz; i++) {
    m_pParamTab[i] = -1.0;
    m_pParamCentTab[i] = -1.0;
  }
  m_pivaid_map.clear();

  //
  // calculate spline coeffs
  //
  int nres;
  m_axisInt.setSize(m_nResids);
  m_normInt.setSize(m_nResids);
  Vector4D prev_bnorm;
  m_bnormDirs.resize(m_nResids);

  for (nres=0; nres<m_nResids; ++nres) {
    // Get atoms (cur/prev/next)
    MolAtomPtr pAtom = getSafeAtom(nres);
    MB_ASSERT(!pAtom.isnull());

    // calculate axial point
    // Get current position curpos
    Vector4D curpos = pAtom->getPos();
    bool res = m_pivaid_map.insert(PivAidMap::value_type(pAtom->getID(), nres)).second;

    double smooth = m_pParent->getSmoothByRes(getResidue(nres));
    if (!qlib::isNear4(smooth, 0.0)) {
      smooth = qlib::trunc(smooth, 0.0, 1.0);

      MolAtomPtr pPrevAtom = getSafeAtom(nres-1);
      MolAtomPtr pNextAtom = getSafeAtom(nres+1);
      if ( pPrevAtom.isnull() ||
           pNextAtom.isnull() ) {
        // ignore errors
      }
      else {
        Vector4D ppos = pPrevAtom->getPos();
        Vector4D npos = pNextAtom->getPos();
        ppos += npos;
        ppos = ppos.scale(0.5);

        ppos = ppos.scale(smooth);
        curpos = curpos.scale(1.0-smooth);
        curpos += ppos;
      }
    }

    // add the curpos to the axial interpolator
    // double cpar = m_axisInt.addPoint(curpos);
    m_axisInt.setPoint(nres, curpos);
    double cpar = double(nres);

    // setup paramTab
    double centpar = cpar;

    double startpar;
    if (nres==0)
      startpar = 0.0;
    else
      startpar = cpar-0.5;

    double endpar;
    if (nres<m_nResids-1)
      endpar = cpar+0.5;
    else
      endpar = cpar;
    //endpar = 0.0f;
    // MB_ASSERT(nres>=0);

    MB_ASSERT(nres+1<m_nParamTabSz);
    m_pParamTab[nres] = startpar;
    m_pParamTab[nres+1] = endpar;
    m_pParamCentTab[nres] = centpar;

    //
    // Calc (bi)normal vector
    //

    //Vector4D bnorm(1.0, 0.0, 0.0);
    Vector4D bnorm = calcBnormVec(nres);

    // preserve consistency of binormal vector directions
    m_bnormDirs[nres] = false;
    if (!prev_bnorm.isZero()) {
      double costh = bnorm.dot(prev_bnorm);
      if (costh<0) {
        bnorm = -bnorm;
        m_bnormDirs[nres] = true;
      }
    }
    
    //int res = m_normInt.addPoint(bnorm+curpos);
    m_normInt.setPoint(nres, bnorm+curpos);
    prev_bnorm = bnorm;
  }

  // Generate spline coeffs
  m_axisInt.generate();
  m_normInt.generate();

  int intrmax = m_axisInt.getPoints() -1;
  MB_ASSERT(intrmax==m_nResids-1);
  MB_DPRINTLN("max parameter: %d", intrmax);

  MB_ASSERT(nres+1<m_nParamTabSz);
  m_pParamTab[nres+1] = double( intrmax );

  return true;
}

Vector4D SplineCoeff::calcBnormVec(int nres)
{
  Vector4D rval(1.0, 0.0, 0.0);
  
  MolAtomPtr pAtom, pPrevAtom, pNextAtom;

  if (calcProtBnormVec(nres, rval))
    return rval;

  if (nres==0) {
    // Start point
    pPrevAtom = getSafeAtom(nres);
    pAtom = getSafeAtom(nres+1);
    pNextAtom = getSafeAtom(nres+2);
  }
  else if (nres==m_nResids-1) {
    // End point
    pPrevAtom = getSafeAtom(nres-2);
    pAtom = getSafeAtom(nres-1);
    pNextAtom = getSafeAtom(nres);
  }
  else {
    pPrevAtom = getSafeAtom(nres-1);
    pAtom = getSafeAtom(nres);
    pNextAtom = getSafeAtom(nres+1);
  }
  
  if (pAtom.isnull()||pPrevAtom.isnull()||pNextAtom.isnull()) {
    MB_DPRINTLN("SplineCoeff::calcBnormVec(): Error, atom is null at %d.", nres);
    return rval;
  }

  // calc binormal vector
  Vector4D v1 = pAtom->getPos() - pPrevAtom->getPos();
  Vector4D v2 = pNextAtom->getPos() - pAtom->getPos();
  rval = v1.cross(v2);
  //rval = v2.cross(v1);
  
  // normalization
  double len = rval.length();
  if (len>=F_EPS4)
    rval = rval.scale(1.0/len);
  else
    // singularity case: cannot determine binomal vec.
    rval = Vector4D(1.0, 0.0, 0.0);

  return rval;
}

bool SplineCoeff::calcProtBnormVec(int nres, Vector4D &res)
{
  // check protein case
  MolResidue *pres = m_resid_array[nres];
  if (pres==NULL)
    return false;

  LString sec;
  pres->getPropStr("secondary", sec);
  if (!sec.equals("sheet"))
    return false;

  MolAtomPtr pAC = pres->getAtom("C");
  MolAtomPtr pAO = pres->getAtom("O");
  if (pAC.isnull()||pAO.isnull())
    return false;

  Vector4D v1 = pAO->getPos() - pAC->getPos();
  
  // normalization
  double len = v1.length();
  if (len>=F_EPS4)
    res = v1.scale(1.0/len);
  else
    // singularity case: cannot determine binomal vec.
    return false;

  return true;
}

bool SplineCoeff::contains(MolResidue *pres)
{
  MolAtomPtr pAtom = getPivotAtom(MolResiduePtr(pres));  
  int aid = pAtom->getID();
  if (m_pivaid_map.find(aid)==m_pivaid_map.end())
    return false;
  return true;
}

int SplineCoeff::getIndex(MolResiduePtr pRes) const
{
  MolAtomPtr pAtom = getPivotAtom(pRes);  
  int aid = pAtom->getID();
  PivAidMap::const_iterator iter = m_pivaid_map.find(aid);
  if (iter==m_pivaid_map.end())
    return -1;
  return iter->second;
}
