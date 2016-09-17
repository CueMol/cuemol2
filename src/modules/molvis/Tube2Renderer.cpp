// -*-Mode: C++;-*-
//
//  Tube renderer class ver2
//

#include <common.h>
#include "molvis.hpp"

#include "Tube2Renderer.hpp"

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

Tube2Renderer::Tube2Renderer()
     : super_t(), m_pts(MB_NEW TubeSection())
{
  m_nAxialDetail = 6;
  m_dLineWidth = 1.2;

  // m_bUseGLSL = true;
  m_bUseGLSL = false;

  m_bChkShaderDone = false;
  m_pPO = NULL;
}

Tube2Renderer::~Tube2Renderer()
{
}

const char *Tube2Renderer::getTypeName() const
{
  return "tube2";
}

void Tube2Renderer::preRender(DisplayContext *pdc)
{
  pdc->setLighting(true);
}

void Tube2Renderer::startColorCalc()
{
  MolCoordPtr pCMol = getClientMol();

  // initialize the coloring scheme
  getColSchm()->start(pCMol, this);
  pCMol->getColSchm()->start(pCMol, this);

}
void Tube2Renderer::endColorCalc()
{
  MolCoordPtr pCMol = getClientMol();

  // finalize the coloring scheme
  getColSchm()->end();
  pCMol->getColSchm()->end();
}

void Tube2Renderer::display(DisplayContext *pdc)
{
  if (m_bUseGLSL) {
    // new rendering routine using GLSL/VBO
    if (!m_bChkShaderDone)
      initShader(pdc);
  }

  // Always use VBO (DrawElem)
  if (m_seglist.empty()) {
    createSegList(pdc);

    startColorCalc();

    BOOST_FOREACH (Tube2Seg &elem, m_seglist) {
      if (elem.getSize()>0) {
        elem.updateColor(this);
        if (isUseAnim())
          elem.updateDynamic(this);
        else
          elem.updateStatic(this);
      }
    }

    endColorCalc();
  }

  preRender(pdc);
  BOOST_FOREACH (Tube2Seg &elem, m_seglist) {
    if (elem.getSize()>0)
      elem.draw(this, pdc);
  }
  postRender(pdc);

}

void Tube2Renderer::invalidateDisplayCache()
{
  if (!m_seglist.empty()) {
    m_seglist.clear();
  }

  super_t::invalidateDisplayCache();
}

void Tube2Renderer::propChanged(qlib::LPropEvent &ev)
{
  if (ev.getParentName().equals("coloring")||
      ev.getParentName().startsWith("coloring.")) {
    invalidateDisplayCache();
  }
  else if (ev.getParentName().equals("axialdetail")) {
    invalidateDisplayCache();
  }

  super_t::propChanged(ev);
}

void Tube2Renderer::objectChanged(qsys::ObjectEvent &ev)
{
  if (ev.getType()==qsys::ObjectEvent::OBE_CHANGED &&
      ev.getDescr().equals("atomsMoved")) {

    // OBE_CHANGED && descr=="atomsMoved"

    if (isUseAnim()) {
      BOOST_FOREACH (Tube2Seg &elem, m_seglist) {
        if (elem.getSize()>0) {
          // only update positions
          elem.updateDynamic(this);
        }
      }
      return;
    }

  }

  super_t::objectChanged(ev);
}

void Tube2Renderer::createSegList(DisplayContext *pdc)
{
  if (!m_pts->isValid())
    m_pts->setupSectionTable();

  MolCoordPtr pCMol = getClientMol();

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
        m_seglist.back().generate(this, pdc);
      }
      pPrevResid = MolResiduePtr();
      continue;
    }
    
    if (isNewSegment(pRes, pPrevResid)) {
      if (!pPrevResid.isnull()) {
        m_seglist.back().generate(this, pdc);
      }
      m_seglist.push_back(Tube2Seg());
    }

    m_seglist.back().append(pPiv);
    pPrevResid = pRes;
  }

  if (!pPrevResid.isnull()) {
    m_seglist.back().generate(this, pdc);
  }
}

//////////////////////////////////////////////////////////////

Tube2Seg::Tube2Seg()
{
  m_pCoefTex = NULL;
}

Tube2Seg::~Tube2Seg()
{
  if (m_pCoefTex!=NULL)
    delete m_pCoefTex;
}

void Tube2Seg::generate(Tube2Renderer *pthis, DisplayContext *pdc)
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
  m_bnormInt.setSize(m_nCtlPts);

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
    m_draws.push_back(Tub2DrawSeg(iter->nstart, iter->nend-1));
  }

  if (pthis->m_bUseGLSL)
    setupGLSL(pthis, pdc);
  else
    setupVBO(pthis);
}

quint32 Tube2Seg::calcColor(Tube2Renderer *pthis, MolCoordPtr pMol, float par) const
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

void Tube2Seg::updateColor(Tube2Renderer *pthis)
{
  if (pthis->m_bUseGLSL)
    updateGLSLColor(pthis);
  else
    updateVBOColor(pthis);
}

void Tube2Seg::updateDynamic(Tube2Renderer *pthis) {
  if (pthis->m_bUseGLSL)
    updateDynamicGLSL(pthis);
  else
    updateDynamicVBO(pthis);
}

void Tube2Seg::updateStatic(Tube2Renderer *pthis) {
  if (pthis->m_bUseGLSL)
    updateStaticGLSL(pthis);
  else
    updateStaticVBO(pthis);
}

void Tube2Seg::draw(Tube2Renderer *pthis, DisplayContext *pdc) {
  if (pthis->m_bUseGLSL)
    drawGLSL(pthis, pdc);
  else
    drawVBO(pthis, pdc);
}

void Tube2Seg::updateScoeffDynamic(Tube2Renderer *pthis)
{
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

  updateBinormIntpol(pCMol);
}

void Tube2Seg::updateScoeffStatic(Tube2Renderer *pthis)
{
  MolCoordPtr pCMol = pthis->getClientMol();
  MolAtomPtr pAtom;
  Vector4D pos4d;
  int i;

  for (i=0; i<m_nCtlPts; ++i) {
    pAtom = pCMol->getAtom(m_aids[i]);
    pos4d = pAtom->getPos();
    m_scoeff.setPoint(i, Vector3F(float(pos4d.x()), float(pos4d.y()), float(pos4d.z())));
  }

  m_scoeff.generate();

  updateBinormIntpol(pCMol);
}

void Tube2Seg::updateBinormIntpol(MolCoordPtr pCMol)
{
  int i;
  Vector3F curpos, dv, binorm;

  // calculate binomal vector interpolator
  for (i=0; i<m_nCtlPts; ++i) {

    m_scoeff.interpolate(i, &curpos, &dv);

    binorm = calcBinormVec(pCMol, i);

    m_bnormInt.setPoint(i, curpos + binorm);
  }

  m_bnormInt.generate();
}

Vector3F Tube2Seg::calcBinormVec(MolCoordPtr pMol, int nres)
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

//////////////////
// VBO implementation

void Tube2Seg::setupVBO(Tube2Renderer *pthis)
{

  BOOST_FOREACH (Tub2DrawSeg &elem, m_draws) {
    elem.setupVBO(pthis);
  }
}

void Tube2Seg::updateVBO(Tube2Renderer *pthis)
{
  BOOST_FOREACH (Tub2DrawSeg &elem, m_draws) {
    elem.updateVBO(pthis, this);
  }
}

void Tube2Seg::updateDynamicVBO(Tube2Renderer *pthis)
{
  updateScoeffDynamic(pthis);
  updateVBO(pthis);
}

void Tube2Seg::updateStaticVBO(Tube2Renderer *pthis)
{
  updateScoeffStatic(pthis);
  updateVBO(pthis);
}

void Tube2Seg::updateVBOColor(Tube2Renderer *pthis)
{
  BOOST_FOREACH (Tub2DrawSeg &elem, m_draws) {
    elem.updateVBOColor(pthis, this);
  }
}

void Tube2Seg::drawVBO(Tube2Renderer *pthis, DisplayContext *pdc)
{
  BOOST_FOREACH (Tub2DrawSeg &elem, m_draws) {
    elem.drawVBO(pthis, pdc);
  }
}

///////////////////////////////////////////////
// GLSL implementation

void Tube2Renderer::initShader(DisplayContext *pdc)
{
  m_bChkShaderDone = true;

  sysdep::ShaderSetupHelper<Tube2Renderer> ssh(this);
  
  if (!ssh.checkEnvVS()) {
    LOG_DPRINTLN("SimpleRendGLSL> ERROR: GLSL not supported.");
    MB_THROW(qlib::RuntimeException, "OpenGL GPU shading not supported");
    return;
  }

  if (m_pPO==NULL)
    m_pPO = ssh.createProgObj("gpu_tube2",
                              "%%CONFDIR%%/data/shaders/tube2_vert.glsl",
                              "%%CONFDIR%%/data/shaders/tube2_frag.glsl");
  
  if (m_pPO==NULL) {
    LOG_DPRINTLN("Tube2RendGLSL> ERROR: cannot create progobj.");
    return;
  }

  m_pPO->enable();

  // setup uniforms
  m_pPO->setUniform("coefTex", 0);

  // setup attributes
  m_nRhoLoc = m_pPO->getAttribLocation("a_rho");
  m_nColLoc = m_pPO->getAttribLocation("a_color");

  m_pPO->disable();
}

void Tube2Seg::setupGLSL(Tube2Renderer *pthis, DisplayContext *pdc)
{
  if (m_pCoefTex!=NULL)
    delete m_pCoefTex;
  //m_pCoefTex = pdc->createTexture2D();
  m_pCoefTex = pdc->createTexture1D();
  //m_pCoefTex->setup(gfx::AbstTexture::FMT_RGB,
  //gfx::AbstTexture::TYPE_FLOAT32);
  m_pCoefTex->setup(gfx::AbstTexture::FMT_R,
                     gfx::AbstTexture::TYPE_FLOAT32);

  BOOST_FOREACH (Tub2DrawSeg &elem, m_draws) {
    elem.setupGLSL(pthis);
  }
}

void Tube2Seg::updateCoefTex()
{
  m_pCoefTex->setData(m_scoeff.getPoints() * 12, m_scoeff.getCoefArray());
}

/// update coord texture for GLSL rendering
void Tube2Seg::updateDynamicGLSL(Tube2Renderer *pthis)
{
  updateScoeffDynamic(pthis);
  updateCoefTex();
}

void Tube2Seg::updateStaticGLSL(Tube2Renderer *pthis)
{
  updateScoeffStatic(pthis);
  updateCoefTex();
}

/// Initialize shaders/texture
void Tube2Seg::updateGLSLColor(Tube2Renderer *pthis)
{
  BOOST_FOREACH (Tub2DrawSeg &elem, m_draws) {
    elem.updateGLSLColor(pthis, this);
  }
}

/// display() for GLSL version
void Tube2Seg::drawGLSL(Tube2Renderer *pthis, DisplayContext *pdc)
{
  const double lw = pthis->getLineWidth();

  pdc->setLineWidth(lw);

  m_pCoefTex->use(0);

  pthis->m_pPO->enable();

  // Setup uniforms
  pthis->m_pPO->setUniformF("frag_alpha", pdc->getAlpha());
  pthis->m_pPO->setUniform("coefTex", 0);
  pthis->m_pPO->setUniform("u_npoints", m_scoeff.getSize());

  BOOST_FOREACH (Tub2DrawSeg &elem, m_draws) {
    elem.drawGLSL(pdc);
  }

  pthis->m_pPO->disable();
  m_pCoefTex->unuse();
}


//////////////////////////////////////////////////

void Tub2DrawSeg::setupVBO(Tube2Renderer *pthis)
{
  int nsplseg = m_nEnd - m_nStart;
  m_nDetail = pthis->getAxialDetail();
  m_nAxPts = m_nDetail * nsplseg + 1;
  m_nSecDiv = pthis->getTubeSection()->getSize();

  // TO DO: multiple vertex generation for discontinuous color point

  m_nVA = m_nAxPts * m_nSecDiv;
  
  if (m_pVBO!=NULL)
    delete m_pVBO;
    
  m_pVBO = MB_NEW gfx::DrawElemVNCI32();
  m_pVBO->alloc(m_nVA);

  // generate indices
  int nfaces = m_nSecDiv * (m_nAxPts-1) * 2;
  m_pVBO->allocIndex(nfaces*3);
  int i, j, ind=0;
  int ij, ijp, ipj, ipjp;
  for (i=0; i<m_nAxPts-1; ++i) {
    int irow = i*m_nSecDiv;
    for (j=0; j<m_nSecDiv; ++j) {
      ij = irow + j;
      ipj = ij+m_nSecDiv;
      ijp = irow + (j+1)%m_nSecDiv;
      ipjp = irow + m_nSecDiv + (j+1)%m_nSecDiv;
      m_pVBO->setIndex3(ind, ij, ijp, ipjp);
      ++ind;
      m_pVBO->setIndex3(ind, ipjp, ipj, ij);
      ++ind;
    }
  }

  m_pVBO->setDrawMode(gfx::DrawElem::DRAW_TRIANGLES);
  LOG_DPRINTLN("Tub2DrawSeg> %d elems VBO created", m_nVA);
}

void Tub2DrawSeg::updateVBO(Tube2Renderer *pthis, Tube2Seg *pseg)
{
  TubeSectionPtr pTS = pthis->getTubeSection();

  CubicSpline *pAxInt = pseg->getAxisIntpol();
  CubicSpline *pBnInt = pseg->getBinormIntpol();

  int i, j;
  float par;
  Vector3F pos, binorm, bpos;
  Vector3F v0, e0, v1, e1, v2, e2;
  Vector3F g, dg;
  
  for (i=0; i<m_nAxPts; ++i) {
    par = float(i)/float(m_nDetail) + float(m_nStart);
    pAxInt->interpolate(par, &pos, &v0);
    pBnInt->interpolate(par, &bpos);
    
    float v0len = v0.length();
    e0 = v0.divide(v0len);

    binorm = bpos - pos;
    v2 = binorm - e0.scale(e0.dot(binorm));
    e2 = v2.normalize();
    e1 = e2.cross(e0);

    for (j=0; j<m_nSecDiv; ++j) {
      const Vector4D &stab = pTS->getSectTab(j);
      g = e1.scale( stab.x() ) + e2.scale( stab.y() );
      dg = e1.scale( stab.z() ) + e2.scale( stab.w() );
      int ind = i*m_nSecDiv + j;
      m_pVBO->vertex3f(ind, pos + g);
      m_pVBO->normal3f(ind, dg);
    }
  }

  m_pVBO->setUpdated(true);
}

void Tub2DrawSeg::updateVBOColor(Tube2Renderer *pthis, Tube2Seg *pseg)
{
  int i, j;
  float par;
  quint32 dcc;

  MolCoordPtr pCMol = pthis->getClientMol();

  for (i=0; i<m_nAxPts; ++i) {
    par = float(i)/float(m_nDetail) + float(m_nStart);
    dcc = pseg->calcColor(pthis, pCMol, par);
    for (j=0; j<m_nSecDiv; ++j) {
      int ind = i*m_nSecDiv + j;
      m_pVBO->color(ind, dcc);
    }
  }
}

void Tub2DrawSeg::drawVBO(Tube2Renderer *pthis, DisplayContext *pdc)
{
  const double lw = pthis->getLineWidth();
  m_pVBO->setLineWidth(lw);
  pdc->drawElem(*m_pVBO);
}

Tub2DrawSeg::~Tub2DrawSeg()
{
  if (m_pVBO!=NULL)
    delete m_pVBO;

  if (m_pAttrAry!=NULL)
    delete m_pAttrAry;
}

//////////

/// Initialize shaders/texture
void Tub2DrawSeg::setupGLSL(Tube2Renderer *pthis)
{
  int nsplseg = m_nEnd - m_nStart;
  m_nDetail = pthis->getAxialDetail();
  m_nVA = m_nDetail * nsplseg + 1;

  if (m_pAttrAry!=NULL)
    delete m_pAttrAry;
    
  m_pAttrAry = MB_NEW AttrArray();

  AttrArray &attra = *m_pAttrAry;
  attra.setAttrSize(2);
  attra.setAttrInfo(0, pthis->m_nRhoLoc, 1, qlib::type_consts::QTC_FLOAT32,  offsetof(AttrElem, rho));
  attra.setAttrInfo(1, pthis->m_nColLoc, 4, qlib::type_consts::QTC_UINT8, offsetof(AttrElem, r));

  attra.alloc(m_nVA);
  attra.setDrawMode(gfx::AbstDrawElem::DRAW_LINE_STRIP);

  float par;
  int i;
  for (i=0; i<m_nVA; ++i) {
    par = float(i)/float(m_nDetail) + float(m_nStart);
    attra.at(i).rho = par;
  }

  LOG_DPRINTLN("Tub2DrawSeg> %d elems AttrArray created", m_nVA);
}

void Tub2DrawSeg::updateGLSLColor(Tube2Renderer *pthis, Tube2Seg *pSeg)
{
  quint32 dcc;
  int i;
  float par;

  MolCoordPtr pCMol = pthis->getClientMol();

  AttrArray &attra = *m_pAttrAry;

  for (i=0; i<m_nVA; ++i) {
    par = float(i)/float(m_nDetail) + float(m_nStart);
    dcc = pSeg->calcColor(pthis, pCMol, par);

    attra.at(i).r = (qbyte) gfx::getRCode(dcc);
    attra.at(i).g = (qbyte) gfx::getGCode(dcc);
    attra.at(i).b = (qbyte) gfx::getBCode(dcc);
    attra.at(i).a = (qbyte) gfx::getACode(dcc);
  }
}

/// display() for GLSL version
void Tub2DrawSeg::drawGLSL(DisplayContext *pdc)
{
  pdc->drawElem(*m_pAttrAry);
}

