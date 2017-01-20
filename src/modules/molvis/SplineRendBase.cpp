// -*-Mode: C++;-*-
//
//  Backbone spline-trace renderer class
//

#include <common.h>
#include "molvis.hpp"

#include "SplineRendBase.hpp"

#include <qsys/SceneManager.hpp>
#include <gfx/Texture.hpp>

#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/MolChain.hpp>
#include <modules/molstr/MolResidue.hpp>
#include <modules/molstr/ResidIterator.hpp>
#include <modules/molstr/AnimMol.hpp>

#include <sysdep/OglProgramObject.hpp>

using namespace molvis;
using namespace molstr;
using namespace molvis::detail;
using qlib::Matrix3D;

SplineSegment::~SplineSegment()
{
  std::for_each(m_draws.begin(), m_draws.end(), qlib::delete_ptr<DrawSegment*>());
}

void SplineSegment::generate(MainChainRenderer *pthis)
{
  // convert aidtmp (deque) to liner aids (vector)
  quint32 nsz = m_aidtmp.size();
  if (nsz<2) {
    m_aidtmp.clear();
    return;
  }

  m_aids.resize(nsz);
  m_aids.assign(m_aidtmp.begin(), m_aidtmp.end());
  m_aidtmp.clear();

  m_scoeff.setSize(nsz);
  m_nCtlPts = nsz;

  // ADDED: initialize binorm vec interpolator
  // m_bnormInt.setSize(m_nCtlPts);
  m_linBnInt.resize(m_nCtlPts);

  MolCoordPtr pCMol = pthis->getClientMol();

  if (pthis->isUseAnim()) {
    AnimMol *pAMol = static_cast<AnimMol *>(pCMol.get());
    m_inds.resize(m_nCtlPts);
    quint32 i;
    for (i=0; i<m_nCtlPts; ++i) {
      m_inds[i] = pAMol->getCrdArrayInd(m_aids[i]) * 3;
    }
  }

  SelectionPtr pSel = pthis->getSelection();
  int i;
  qlib::RangeSet<int> resrng;

  for (i=0; i<m_nCtlPts; ++i) {
    MolResiduePtr pRes = getResid(pCMol, i);
    if (pSel->isSelectedResid(pRes)) {
      resrng.append(i, i+1);
    }
  }

  qlib::RangeSet<int>::const_iterator iter = resrng.begin();
  qlib::RangeSet<int>::const_iterator eiter = resrng.end();
  for (; iter!=eiter; ++iter) {
    MB_DPRINTLN("resid range %d:%d", iter->nstart, iter->nend);
    DrawSegment *pDS = createDrawSeg(iter->nstart, iter->nend-1);
    m_draws.push_back(pDS);
  }
}

quint32 SplineSegment::calcColor(MainChainRenderer *pthis, MolCoordPtr pMol, float par) const
{
  qlib::uid_t nSceneID = pthis->getSceneID();
  
  int nprev = int(::floor(par));
  int nnext = int(::ceil(par));
  float rho = par - float(nprev);
  
  nprev = qlib::clamp<int>(nprev, 0, m_aids.size()-1);
  nnext = qlib::clamp<int>(nnext, 0, m_aids.size() - 1);
  
  MolResiduePtr pNext = getResid(pMol, nnext);
  MolResiduePtr pPrev = getResid(pMol, nprev);
  
  ColorPtr pcol = pthis->calcColor(rho, true, pPrev, pNext, false, false);
  return pcol->getDevCode(nSceneID);
}

void SplineSegment::updateBinormIntpol(MolCoordPtr pCMol)
{
  int i;
  Vector3F curpos, dv, binorm;
  Vector3F prev_dv, prev_bn;

  // calculate binomal vector interpolator
  for (i=0; i<m_nCtlPts; ++i) {

    m_scoeff.interpolate(i, &curpos, &dv);
    dv = dv.normalize();

    binorm = calcBinormVec(pCMol, i);

    bool bflip = checkBinormFlip(dv, binorm, prev_dv, prev_bn);

    if (bflip) {
      binorm = -binorm;
    }
      
    // m_bnormInt.setPoint(i, curpos + binorm);
    m_linBnInt[i] = binorm;
    prev_dv = dv;
    prev_bn = binorm;
  }

  // m_bnormInt.generate();
}

Vector3F SplineSegment::calcBinormVec(MolCoordPtr pMol, int nres)
{
  MolAtomPtr pAtom, pPrevAtom, pNextAtom;

  if (nres==0) {
    // Start point
    pPrevAtom = getAtom(pMol, nres);
    pAtom = getAtom(pMol, nres+1);
    pNextAtom = getAtom(pMol, nres+2);
  }
  else if (nres==m_scoeff.getSize()-1) {
    // End point
    pPrevAtom = getAtom(pMol, nres-2);
    pAtom = getAtom(pMol, nres-1);
    pNextAtom = getAtom(pMol, nres);
  }
  else {
    pPrevAtom = getAtom(pMol, nres-1);
    pAtom = getAtom(pMol, nres);
    pNextAtom = getAtom(pMol, nres+1);
  }

  if (pAtom.isnull()||pPrevAtom.isnull()||pNextAtom.isnull()) {
    MB_DPRINTLN("SplineCoeff::calcBnormVec(): Error, atom is null at %d.", nres);
    return Vector3F(1, 0, 0);
  }

  // calc binormal vector
  Vector4D v1 = pAtom->getPos() - pPrevAtom->getPos();
  Vector4D v2 = pNextAtom->getPos() - pAtom->getPos();
  Vector4D drval = v1.cross(v2);

  Vector3F rval(float(drval.x()), float(drval.y()), float(drval.z()));

  // normalization
  float len = rval.length();
  if (len>=F_EPS4)
    rval = rval.divide(len);
  else
    // singularity case: cannot determine binomal vec.
    rval = Vector3F(1, 0, 0);

  return rval;
}

bool SplineSegment::checkBinormFlip(const Vector3F &ndv, const Vector3F &binorm, const Vector3F &npdv, const Vector3F &prev_bn)
{
  // preserve consistency of binormal vector directions in beta strands
  if (prev_bn.isZero() || npdv.isZero())
    return false;

  // Vector3F ndv = dv.normalize();
  // Vector3F npdv = prev_dv.normalize();
  Vector3F rot_prev_bn = prev_bn;

  Vector3F ax = ndv.cross(npdv);
  const float axlen = ax.length();
  if (axlen>F_EPS4) {
    // align the previous binorm vectors based on the dv (tangential vector)
    ax = ax.divide(axlen);
    //MB_DPRINTLN("ax=(%f,%f,%f)", ax.x(), ax.y(), ax.z());
    //double ph = prev_dv.angle(dv);
    //double cosph = cos(ph);
    //double sinph = sin(ph);
    const float cosph = npdv.dot(ndv);
    const float sinph = sqrt(1.0f-cosph*cosph);
    //MB_DPRINTLN("ph=%f", qlib::toDegree(ph));
    //MB_DPRINTLN("cosph = %f, %f", cosph, cosph2);
    //MB_DPRINTLN("sinph = %f, %f", sinph, sinph2);
    Vector4D dax(ax.x(), ax.y(), ax.z());
    Matrix3D rotmat = Matrix3D::makeRotMat(dax, double(cosph), double(sinph));
    //MB_DPRINTLN("dv=(%f,%f,%f)", dv.x(), dv.y(), dv.z());
    //MB_DPRINTLN("prev_dv=(%f,%f,%f)", prev_dv.x(), prev_dv.y(), prev_dv.z());
    //Vector4D dum = rotmat.mulvec(prev_dv);
    //Vector4D dum2 = rotmat.mulvec(dv);
    //MB_DPRINTLN("mat.prev_dv=(%f,%f,%f)", dum.x(), dum.y(), dum.z());
    //MB_DPRINTLN("mat.dv=(%f,%f,%f)", dum2.x(), dum2.y(), dum2.z());

    // XXX
    Vector4D x(prev_bn.x(), prev_bn.y(), prev_bn.z());
    Vector4D y = rotmat.mulvec(x);
    rot_prev_bn = Vector3F(float(y.x()), float(y.y()), float(y.z()));
  }

  const float costh = binorm.dot(prev_bn);
  if (costh<0) {
    return true;
  }

  return false;
}

Vector3F SplineSegment::intpolLinBn(float par)
{
  // check parameter value f
  int ncoeff = (int)::floor(par);
  ncoeff = qlib::clamp<int>(ncoeff, 0, m_nCtlPts-2);
  
  float f = par - float(ncoeff);
  
  const Vector3F &cp0 = m_linBnInt[ncoeff];
  const Vector3F &cp1 = m_linBnInt[ncoeff+1];

  return cp0.scale(1.0f - f) + cp1.scale(f);
}

void SplineSegment::updateStatic(MainChainRenderer *pthis)
{
  // update axial intpol coef
  MolCoordPtr pCMol = pthis->getClientMol();
  MolAtomPtr pAtom;
  Vector4D pos4d;
  int i;

  for (i=0; i<m_nCtlPts; ++i) {
    pAtom = getAtom(pCMol, i);
    pos4d = pAtom->getPos();
    m_scoeff.setPoint(i, Vector3F(float(pos4d.x()), float(pos4d.y()), float(pos4d.z())));
  }

  m_scoeff.generate();

  // update binorm coeff
  updateBinormIntpol(pCMol);
}

void SplineSegment::updateDynamic(MainChainRenderer *pthis)
{
  // update axial intpol coef
  MolCoordPtr pCMol = pthis->getClientMol();
  AnimMol *pAMol = static_cast<AnimMol *>(pCMol.get());

  qfloat32 *crd = pAMol->getAtomCrdArray();

  MolAtomPtr pAtom;
  Vector4D pos4d;
  int i;

  for (i=0; i<m_nCtlPts; ++i) {
    m_scoeff.setPoint(i, Vector3F(&crd[m_inds[i]]));
  }
  m_scoeff.generate();

  // update binorm coeff
  updateBinormIntpol(pCMol);
}

//////////

SplineRendBase::SplineRendBase()
  : super_t()
{
  m_nAxialDetail = 20;
  // m_dLineWidth = 1.2;

  //m_bUseGLSL = true;
  m_bUseGLSL = false;

  m_bChkShaderDone = false;
}
    
SplineRendBase::~SplineRendBase()
{
  MB_ASSERT(m_seglist.empty());
  //clearSegList();
}

void SplineRendBase::propChanged(qlib::LPropEvent &ev)
{
  if (ev.getParentName().equals("coloring")||
      ev.getParentName().startsWith("coloring.")) {
    invalidateDisplayCache();
  }
  else if (ev.getName().equals("axialdetail")) {
    invalidateDisplayCache();
  }
  
  super_t::propChanged(ev);
}

void SplineRendBase::objectChanged(qsys::ObjectEvent &ev)
{
  if (ev.getType()==qsys::ObjectEvent::OBE_CHANGED &&
      ev.getDescr().equals("atomsMoved")) {

    // OBE_CHANGED && descr=="atomsMoved"

    if (isUseAnim()) {
      updateCrdDynamic();
      return;
    }

  }

  super_t::objectChanged(ev);
}

//////////

void SplineRendBase::display(DisplayContext *pdc)
{
  if (!isShaderCheckDone()) {
    bool bOK = false;
    try {
      bOK = initShader(pdc);
    }
    catch (...) {
    }
    m_bChkShaderDone = true;
    if (bOK) {
      m_bShaderAvail = true;
    }
    else {
      // cannot initialize GLSL
      // --> fall through VBO impl
      m_bShaderAvail = false;
    }
  }

  if (!isCacheAvail()) {
    createCacheData();
  }

  preRender(pdc);
  render2(pdc);
  postRender(pdc);

}

bool SplineRendBase::initShader(DisplayContext *pdc)
{
  return false;
}

void SplineRendBase::render2(DisplayContext *pdc)
{
  BOOST_FOREACH (SplineSegment *pelem, m_seglist) {
    if (pelem->getSize()>0) {
      if (isUseGLSL())
        drawGLSL(pelem, pdc);
      else
        drawVBO(pelem, pdc);
    }
  }
}

bool SplineRendBase::isCacheAvail() const
{
  if (m_seglist.empty())
    return false;
  else
    return true;
}

void SplineRendBase::createCacheData()
{
  createSegList();
  
  startColorCalc();
  
  //if (isUseGLSL()) {
  if (isShaderAvail()) {
    BOOST_FOREACH (SplineSegment *pelem, m_seglist) {
      if (pelem->getSize()>0) {
        updateColorGLSL(pelem);
      }
    }
  }
  //else {
    BOOST_FOREACH (SplineSegment *pelem, m_seglist) {
      if (pelem->getSize()>0) {
        updateColorVBO(pelem);
      }
    }
  //}
  
  if (isUseAnim())
    updateCrdDynamic();
  else
    updateCrdStatic();

  endColorCalc();
}

void SplineRendBase::invalidateDisplayCache()
{
  clearSegList();
  super_t::invalidateDisplayCache();
}

void SplineRendBase::createSegList()
{
  MolCoordPtr pCMol = getClientMol();

  if (!m_seglist.empty())
    return;

  // visit all residues
  ResidIterator iter(pCMol);
  
  MolResiduePtr pPrevResid;
  for (iter.first(); iter.hasMore(); iter.next()) {
    MolResiduePtr pRes = iter.get();
    MB_ASSERT(!pRes.isnull());
    
    MolAtomPtr pPiv = getPivotAtom(pRes);
    if (pPiv.isnull()) {
      // This resid doesn't has pivot, so we cannot draw backbone!!
      if (!pPrevResid.isnull()) {
        setup(m_seglist.back());
      }
      pPrevResid = MolResiduePtr();
      continue;
    }
    
    if (isNewSegment(pRes, pPrevResid)) {
      if (!pPrevResid.isnull()) {
        setup(m_seglist.back());
      }
      m_seglist.push_back(createSegment());
    }
    
    m_seglist.back()->append(pPiv);

    pPrevResid = pRes;
  }

  if (!pPrevResid.isnull()) {
    setup(m_seglist.back());
  }

}

void SplineRendBase::setup(SplineSegment *pSeg)
{
  pSeg->generate(this);

  if (isShaderAvail())
    setupGLSL(pSeg);
  
  setupVBO(pSeg);

  /*
  if (isUseGLSL())
    setupGLSL(pSeg);
  else
    setupVBO(pSeg);
   */
}

void SplineRendBase::startColorCalc()
{
  MolCoordPtr pCMol = getClientMol();

  // initialize the coloring scheme
  getColSchm()->start(pCMol, this);
  pCMol->getColSchm()->start(pCMol, this);

}
void SplineRendBase::endColorCalc()
{
  MolCoordPtr pCMol = getClientMol();

  // finalize the coloring scheme
  getColSchm()->end();
  pCMol->getColSchm()->end();
}

void SplineRendBase::updateCrdDynamic()
{
  if (isUseGLSL()) {
    BOOST_FOREACH (SplineSegment *pelem, m_seglist) {
      if (pelem->getSize()>0) {
        // update spline coefficients (from CrdArray)
        pelem->updateDynamic(this);
        
        // update VBO/Texture, etc
        updateCrdGLSL(pelem);
      }
    }
  }
  else {
    BOOST_FOREACH (SplineSegment *pelem, m_seglist) {
      if (pelem->getSize()>0) {
        // update spline coefficients (from CrdArray)
        pelem->updateDynamic(this);
        
        // update VBO
        updateCrdVBO(pelem);
      }
    }
  }
}

void SplineRendBase::updateCrdStatic()
{

  if (isUseGLSL()) {
    BOOST_FOREACH (SplineSegment *pelem, m_seglist) {
      if (pelem->getSize()>0) {
        // update spline coefficients (from MolAtom)
        pelem->updateStatic(this);
        
        // update VBO/Texture, etc
        updateCrdGLSL(pelem);
      }
    }
  }
  else {
    BOOST_FOREACH (SplineSegment *pelem, m_seglist) {
      if (pelem->getSize()>0) {
        // update spline coefficients (from MolAtom)
        pelem->updateStatic(this);
        
        // update VBO
        updateCrdVBO(pelem);
      }
    }
  }
}

/*
void SplineRendBase::updateCrdStatic(SplineSegment *pSeg)
{
  // update spline coefficients (from MolAtom)
  pSeg->updateStatic(this);

  // update VBO/Texture, etc
  if (isUseGLSL()) {
    updateCrdGLSL(pSeg);
  }
  else {
    updateCrdVBO(pSeg);
  }
}
*/
/*
void SplineRendBase::updateCrdDynamic(SplineSegment *pSeg)
{
}
*/
