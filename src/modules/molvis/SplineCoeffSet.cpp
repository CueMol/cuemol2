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

#include <qlib/Matrix3D.hpp>
#include <qlib/parallel.hpp>

using namespace molvis;
using namespace molstr;
using qlib::Matrix3D;

SplineCoeffSet::SplineCoeffSet()
     : m_pCurCoeff(NULL), m_bTopoValid(false), m_bGeomValid(false), m_nTopoGen(0)
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
  m_shortResids.clear();
  m_residMap.clear();
  m_bTopoValid = false;
  m_bGeomValid = false;

  //if (m_pSmoothEval!=NULL)
  //delete m_pSmoothEval;
  //m_pSmoothEval = NULL;
}

bool SplineCoeffSet::isValid() const
{
  return m_bTopoValid && m_bGeomValid;
}

/**
  Generate spline coefficient set for the pmol.
  Coefficients are generated for the entire molecule,
  irrespective of the current selection.
 */
bool SplineCoeffSet::generate(MolCoordPtr pmol)
{
  if (!m_bTopoValid)
    buildTopology(pmol);

  if (!m_bGeomValid) {
    // Only the positions changed (or the topology was just built): recompute
    // the spline coeffs from the kept topology. The segments are independent
    // (each writes its own splines and only reads the atom positions).
    std::vector<SplineCoeff *> coeffs(m_list.begin(), m_list.end());
    qlib::parallel_for(0, coeffs.size(), [&coeffs](std::size_t i) {
      coeffs[i]->updateGeometry();
    });
    m_bGeomValid = true;
  }
  return true;
}

void SplineCoeffSet::buildTopology(MolCoordPtr pmol)
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

  m_bTopoValid = true;
  m_bGeomValid = false;
  ++m_nTopoGen;
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
  if (!m_pCurCoeff->setupTopology()) {
    // 1 or 2 residues: no spline (see SplineCoeff::setupTopology()); remember them
    // so that the renderer skips the segment quietly
    if (m_pCurCoeff->getResidCount()<=2) {
      for (int i=0; i<m_pCurCoeff->getResidCount(); ++i)
        m_shortResids.insert(m_pCurCoeff->getResidue(i));
    }
    delete m_pCurCoeff;
    m_pCurCoeff = NULL;
    return;
  }
  m_list.push_back(m_pCurCoeff);
  for (int i=0; i<m_pCurCoeff->getResidCount(); ++i)
    m_residMap[m_pCurCoeff->getResidue(i)] = m_pCurCoeff;
  m_pCurCoeff = NULL;
}

SplineCoeff *SplineCoeffSet::createSplineCoeff()
{
  return MB_NEW SplineCoeff(this);
}

SplineCoeff *SplineCoeffSet::searchCoeff(MolResiduePtr pres)
{
  auto iter = m_residMap.find(pres.get());
  if (iter==m_residMap.end())
    return NULL;
  // a segment whose spline could not be computed is not drawn
  if (!iter->second->isGeomOK())
    return NULL;
  return iter->second;
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

bool SplineCoeff::setupTopology()
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
  m_chainname = m_resid_array[0]->getChainName();

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
  //
  // per-residue data that does not depend on the positions: the pivot atom,
  // the smoothing weight and, for the protein beta strands, the C and O
  // atoms the binormal vector is computed from (see calcProtBnormVec())
  //
  int nres;
  m_cache.resize(m_nResids);
  m_residIndex.clear();
  for (nres=0; nres<m_nResids; ++nres) {
    MolResidue *pres = m_resid_array[nres];
    ResidCache &rc = m_cache[nres];
    rc.pPiv = getPivotAtom(MolResiduePtr(pres)).get();
    MB_ASSERT(rc.pPiv!=NULL);
    rc.smooth = m_pParent->getSmoothByRes(pres);

    rc.bSheetCO = false;
    rc.pC = NULL;
    rc.pO = NULL;
    LString sec;
    pres->getPropStr("secondary", sec);
    if (sec.equals("sheet")) {
      MolAtomPtr pAC = pres->getAtom("C");
      MolAtomPtr pAO = pres->getAtom("O");
      if (!pAC.isnull() && !pAO.isnull()) {
        rc.bSheetCO = true;
        rc.pC = pAC.get();
        rc.pO = pAO.get();
      }
    }

    pres->getPropStr("secondary2", rc.sec2);

    m_residIndex.insert(std::make_pair(pres, nres));

    // setup paramTab (depends on the residue number only)
    const double cpar = double(nres);
    const double centpar = cpar;
    const double startpar = (nres==0) ? 0.0 : cpar-0.5;
    const double endpar = (nres<m_nResids-1) ? cpar+0.5 : cpar;
    MB_ASSERT(nres+1<m_nParamTabSz);
    m_pParamTab[nres] = startpar;
    m_pParamTab[nres+1] = endpar;
    m_pParamCentTab[nres] = centpar;
  }
  // the last parameter is the number of interpolation intervals
  m_pParamTab[nres+1] = double( m_nResids-1 );

  m_bGeomOK = false;
  return true;
}

bool SplineCoeff::updateGeometry()
{
  m_bGeomOK = false;

  //
  // calculate spline coeffs
  //
  int nres;
  m_axisInt.setSize(m_nResids);

  for (nres=0; nres<m_nResids; ++nres) {
    // Get atoms (cur/prev/next)
    MolAtom *pAtom = getSafeAtom(nres);
    MB_ASSERT(pAtom!=NULL);

    // calculate axial point
    // Get current position curpos
    Vector4D curpos = pAtom->getPos();

    double smooth = m_cache[nres].smooth;
    if (!qlib::isNear4(smooth, 0.0)) {
      smooth = qlib::trunc(smooth, 0.0, 1.0);

      MolAtom *pPrevAtom = getSafeAtom(nres-1);
      MolAtom *pNextAtom = getSafeAtom(nres+1);
      if ( pPrevAtom==NULL ||
           pNextAtom==NULL ) {
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
    m_axisInt.setPoint(nres, curpos);
  }

  // Generate spline coeffs
  m_axisInt.generate();
  MB_ASSERT(m_axisInt.getPoints()-1==m_nResids-1);

  //
  // calculate spline coeffs (binormal vector)
  //

  Vector4D prev_dv, prev_bnorm;

  m_normInt.setSize(m_nResids);
  m_bnormDirs.resize(m_nResids);

  for (nres=0; nres<m_nResids; ++nres) {

    Vector4D curpos, dv;
    if (!m_axisInt.interpolate(nres, &curpos, &dv)) {
      LOG_DPRINTLN("SplineCoeffSet> fatal error: cannot interpolate");
      return false;
    }
    
    // Calc (bi)normal vector

    m_bnormDirs[nres] = false;
    Vector4D bnorm = calcBnormVec(nres);

    // preserve consistency of binormal vector directions in beta strands
    if (!prev_bnorm.isZero() && !prev_dv.isZero()) {
      dv = dv.normalize();
      prev_dv = prev_dv.normalize();
      Vector4D ax = dv.cross(prev_dv);
      double axlen = ax.length();
      if (axlen>F_EPS4) {
        // align the previous binorm vectors based on the dv (tangential vector)
        ax = ax.scale(1.0/axlen);
        //MB_DPRINTLN("ax=(%f,%f,%f)", ax.x(), ax.y(), ax.z());
        //double ph = prev_dv.angle(dv);
        //double cosph = cos(ph);
        //double sinph = sin(ph);
        double cosph = prev_dv.dot(dv)/(prev_dv.length()*dv.length());
        double sinph = sqrt(1.0-cosph*cosph);
        //MB_DPRINTLN("ph=%f", qlib::toDegree(ph));
        //MB_DPRINTLN("cosph = %f, %f", cosph, cosph2);
        //MB_DPRINTLN("sinph = %f, %f", sinph, sinph2);
        Matrix3D rotmat = Matrix3D::makeRotMat(ax, cosph, sinph);
        //MB_DPRINTLN("dv=(%f,%f,%f)", dv.x(), dv.y(), dv.z());
        //MB_DPRINTLN("prev_dv=(%f,%f,%f)", prev_dv.x(), prev_dv.y(), prev_dv.z());
        //Vector4D dum = rotmat.mulvec(prev_dv);
        //Vector4D dum2 = rotmat.mulvec(dv);
        //MB_DPRINTLN("mat.prev_dv=(%f,%f,%f)", dum.x(), dum.y(), dum.z());
        //MB_DPRINTLN("mat.dv=(%f,%f,%f)", dum2.x(), dum2.y(), dum2.z());
        prev_bnorm = rotmat.mulvec(prev_bnorm);
      }

      double costh = bnorm.dot(prev_bnorm);
      if (costh<0) {
        bnorm = -bnorm;
        m_bnormDirs[nres] = true;
      }
    }

    m_normInt.setPoint(nres, bnorm+curpos);

    prev_bnorm = bnorm;
    prev_dv = dv;
  }
  m_normInt.generate();

  m_bGeomOK = true;
  return true;
}

Vector4D SplineCoeff::calcBnormVec(int nres)
{
  Vector4D rval(1.0, 0.0, 0.0);
  
  MolAtom *pAtom, *pPrevAtom, *pNextAtom;

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
  
  if (pAtom==NULL||pPrevAtom==NULL||pNextAtom==NULL) {
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
  // In the protein beta strands,
  // the binormal vector is calculated
  // based on the direction of the main chain >C=O group
  // (the sheet test and the atoms are in the topology part, see setupTopology())
  const ResidCache &rc = m_cache[nres];
  if (!rc.bSheetCO)
    return false;

  Vector4D v1 = rc.pO->getPos() - rc.pC->getPos();
  
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
  return m_residIndex.find(pres)!=m_residIndex.end();
}

int SplineCoeff::getIndex(MolResiduePtr pRes) const
{
  auto iter = m_residIndex.find(pRes.get());
  if (iter==m_residIndex.end())
    return -1;
  return iter->second;
}
