// -*-Mode: C++;-*-
//
//  Backbone spline-trace renderer class
//

#include <common.h>
#include "molvis.hpp"

#include "Spline2Renderer.hpp"

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

Spline2Renderer::Spline2Renderer()
{
  m_nAxialDetail = 6;
  m_dLineWidth = 1.2;

  m_bUseGLSL = true;
  //m_bUseGLSL = false;

  m_bChkShaderDone = false;
  m_pPO = NULL;
}

Spline2Renderer::~Spline2Renderer()
{
}

const char *Spline2Renderer::getTypeName() const
{
  return "spline2";
}

void Spline2Renderer::preRender(DisplayContext *pdc)
{
  pdc->setLighting(false);
}

void Spline2Renderer::startColorCalc()
{
  MolCoordPtr pCMol = getClientMol();

  // initialize the coloring scheme
  getColSchm()->start(pCMol, this);
  pCMol->getColSchm()->start(pCMol, this);

}
void Spline2Renderer::endColorCalc()
{
  MolCoordPtr pCMol = getClientMol();

  // finalize the coloring scheme
  getColSchm()->end();
  pCMol->getColSchm()->end();
}

void Spline2Renderer::display(DisplayContext *pdc)
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

    BOOST_FOREACH (Spline2Seg &elem, m_seglist) {
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
  BOOST_FOREACH (Spline2Seg &elem, m_seglist) {
    if (elem.getSize()>0)
      elem.draw(this, pdc);
  }
  postRender(pdc);

}

void Spline2Renderer::invalidateDisplayCache()
{
  if (!m_seglist.empty()) {
    m_seglist.clear();
  }

  super_t::invalidateDisplayCache();
}

void Spline2Renderer::propChanged(qlib::LPropEvent &ev)
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

void Spline2Renderer::objectChanged(qsys::ObjectEvent &ev)
{
  if (ev.getType()==qsys::ObjectEvent::OBE_CHANGED &&
      ev.getDescr().equals("atomsMoved")) {

    // OBE_CHANGED && descr=="atomsMoved"

    if (isUseAnim()) {
      BOOST_FOREACH (Spline2Seg &elem, m_seglist) {
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

void Spline2Renderer::createSegList(DisplayContext *pdc)
{
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
        // endSegment(pdl, pPrevResid);
        m_seglist.back().generate(this, pdc);
      }
      pPrevResid = MolResiduePtr();
      continue;
    }
    
    if (isNewSegment(pRes, pPrevResid)) {
      if (!pPrevResid.isnull()) {
        //endSegment(pdl, pPrevResid);
        m_seglist.back().generate(this, pdc);
      }
      //beginSegment(pdl, pRes);
      m_seglist.push_back(Spline2Seg());
    }

    //rendResid(pdl, pRes);
    m_seglist.back().append(pPiv);
    pPrevResid = pRes;
  }

  if (!pPrevResid.isnull()) {
    //endSegment(pdl, pPrevResid);
    m_seglist.back().generate(this, pdc);
  }
}

//////////////////////////////////////////////////////////////

Spline2Seg::Spline2Seg()
{
  m_nDetail = 10;
  m_nVA = 0;

  m_pAttrAry = NULL;
  m_pCoefTex = NULL;
}

Spline2Seg::~Spline2Seg()
{
  //if (m_pVBO!=NULL)
  // delete m_pVBO;

  if (m_pAttrAry!=NULL)
    delete m_pAttrAry;

  if (m_pCoefTex!=NULL)
    delete m_pCoefTex;
}

void Spline2Seg::append(MolAtomPtr pAtom)
{
  m_aidtmp.push_back(pAtom->getID());
}

void Spline2Seg::generate(Spline2Renderer *pthis, DisplayContext *pdc)
{
  quint32 nsz = m_aidtmp.size();
  if (nsz<2) {
    m_aidtmp.clear();
    return;
  }

  m_aids.resize(nsz);
  m_aids.assign(m_aidtmp.begin(), m_aidtmp.end());
  m_aidtmp.clear();
  //m_nPoints = nsz;
  m_scoeff.setSize(nsz);

  MolCoordPtr pCMol = pthis->getClientMol();

  if (pthis->isUseAnim()) {
    AnimMol *pAMol = static_cast<AnimMol *>(pCMol.get());
    m_inds.resize(nsz);
    quint32 i;
    for (i=0; i<nsz; ++i) {
      m_inds[i] = pAMol->getCrdArrayInd(m_aids[i]) * 3;
    }
  }

  m_nDetail = pthis->getAxialDetail();

  SelectionPtr pSel = pthis->getSelection();
  int i;
  qlib::RangeSet<int> resrng;
  
  for (i=0; i<nsz; ++i) {
    MolResiduePtr pRes = getResid(pCMol, i);
    if (pSel->isSelectedResid(pRes)) {
      resrng.append(i, i+1);
    }
  }
  
  qlib::RangeSet<int>::const_iterator iter = resrng.begin();
  qlib::RangeSet<int>::const_iterator eiter = resrng.end();
  for (; iter!=eiter; ++iter) {
    MB_DPRINTLN("resid range %d:%d", iter->nstart, iter->nend);
    m_draws.push_back(Spl2DrawSeg(iter->nstart, iter->nend-1));
  }

  if (pthis->m_bUseGLSL)
    setupGLSL(pthis, pdc);
  else
    setupVBO(pthis);
}

quint32 Spline2Seg::calcColor(Spline2Renderer *pthis, MolCoordPtr pMol, float par) const
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

void Spline2Seg::updateColor(Spline2Renderer *pthis)
{
  if (pthis->m_bUseGLSL)
    updateGLSLColor(pthis);
  else
    updateVBOColor(pthis);
}

void Spline2Seg::updateDynamic(Spline2Renderer *pthis) {
  if (pthis->m_bUseGLSL)
    updateDynamicGLSL(pthis);
  else
    updateDynamicVBO(pthis);
}

void Spline2Seg::updateStatic(Spline2Renderer *pthis) {
  if (pthis->m_bUseGLSL)
    updateStaticGLSL(pthis);
  else
    updateStaticVBO(pthis);
}

void Spline2Seg::draw(Spline2Renderer *pthis, DisplayContext *pdc) {
  if (pthis->m_bUseGLSL)
    drawGLSL(pthis, pdc);
  else
    drawVBO(pthis, pdc);
}

void Spline2Seg::updateScoeffDynamic(Spline2Renderer *pthis)
{
  MolCoordPtr pCMol = pthis->getClientMol();
  AnimMol *pAMol = static_cast<AnimMol *>(pCMol.get());

  qfloat32 *crd = pAMol->getAtomCrdArray();

  MolAtomPtr pAtom;
  Vector4D pos4d;
  int i;
  const int nsz = m_scoeff.getSize();
  for (i=0; i<nsz; ++i) {
    //m_pos[i] = Vector3F(&crd[m_inds[i]]);
	  m_scoeff.setPoint(i, Vector3F(&crd[m_inds[i]]));
  }
  m_scoeff.generate();
}

void Spline2Seg::updateScoeffStatic(Spline2Renderer *pthis)
{
  MolCoordPtr pCMol = pthis->getClientMol();
  MolAtomPtr pAtom;
  Vector4D pos4d;
  int i;
  const int nsz = m_scoeff.getSize();
  for (i=0; i<nsz; ++i) {
    pAtom = pCMol->getAtom(m_aids[i]);
    pos4d = pAtom->getPos();
    //m_pos[i] = Vector3F(pos4d.x(), pos4d.y(), pos4d.z());
    m_scoeff.setPoint(i, Vector3F(float(pos4d.x()), float(pos4d.y()), float(pos4d.z())));
  }

  m_scoeff.generate();
}

//////////////////
// VBO implementation

void Spline2Seg::setupVBO(Spline2Renderer *pthis)
{

  BOOST_FOREACH (Spl2DrawSeg &elem, m_draws) {
    elem.setupVBO(pthis);
  }
  
  /*{
  m_nVA = m_nDetail * (m_scoeff.getSize() - 1) + 1;

  if (m_pVBO!=NULL)
    delete m_pVBO;
    
  m_pVBO = MB_NEW gfx::DrawElemVC();
  m_pVBO->alloc(m_nVA);
  m_pVBO->setDrawMode(gfx::DrawElem::DRAW_LINE_STRIP);
  LOG_DPRINTLN("Spline2Seg> %d elems VBO created", m_nVA);
  }*/
}

void Spline2Seg::updateVBO()
{
  BOOST_FOREACH (Spl2DrawSeg &elem, m_draws) {
    elem.updateVBO(&m_scoeff);
  }

/*
  int i;
  float par;
  Vector3F pos;
  
  for (i=0; i<m_nVA; ++i) {
    par = float(i)/float(m_nDetail);
    m_scoeff.interpolate(par, &pos);
    m_pVBO->vertex3f(i, pos);
  }

  m_pVBO->setUpdated(true);*/
}

void Spline2Seg::updateDynamicVBO(Spline2Renderer *pthis)
{
  updateScoeffDynamic(pthis);
  updateVBO();
}

void Spline2Seg::updateStaticVBO(Spline2Renderer *pthis)
{
  updateScoeffStatic(pthis);
  updateVBO();
}

void Spline2Seg::updateVBOColor(Spline2Renderer *pthis)
{
  BOOST_FOREACH (Spl2DrawSeg &elem, m_draws) {
    elem.updateVBOColor(pthis, this);
  }
}

void Spline2Seg::drawVBO(Spline2Renderer *pthis, DisplayContext *pdc)
{
  BOOST_FOREACH (Spl2DrawSeg &elem, m_draws) {
    elem.drawVBO(pthis, pdc);
  }
/*
  const double lw = pthis->getLineWidth();
  m_pVBO->setLineWidth(lw);
  pdc->drawElem(*m_pVBO);
  */
}

///////////////////////////////////////////////
// GLSL implementation

void Spline2Renderer::initShader(DisplayContext *pdc)
{
  m_bChkShaderDone = true;

  sysdep::ShaderSetupHelper<Spline2Renderer> ssh(this);
  
  if (!ssh.checkEnvVS()) {
    LOG_DPRINTLN("SimpleRendGLSL> ERROR: GLSL not supported.");
    MB_THROW(qlib::RuntimeException, "OpenGL GPU shading not supported");
    return;
  }

  if (m_pPO==NULL)
    m_pPO = ssh.createProgObj("gpu_spline2",
                              "%%CONFDIR%%/data/shaders/spline2_vert.glsl",
                              "%%CONFDIR%%/data/shaders/spline2_frag.glsl");
  
  if (m_pPO==NULL) {
    LOG_DPRINTLN("Spline2RendGLSL> ERROR: cannot create progobj.");
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

void Spline2Seg::setupGLSL(Spline2Renderer *pthis, DisplayContext *pdc)
{
  if (m_pCoefTex!=NULL)
    delete m_pCoefTex;
  //m_pCoefTex = pdc->createTexture2D();
  m_pCoefTex = pdc->createTexture1D();
  //m_pCoefTex->setup(gfx::AbstTexture::FMT_RGB,
  //gfx::AbstTexture::TYPE_FLOAT32);
  m_pCoefTex->setup(gfx::AbstTexture::FMT_R,
                     gfx::AbstTexture::TYPE_FLOAT32);

  // const int nsz = m_scoeff.getSize();
  // m_coefbuf.resize(nsz * 12);

  BOOST_FOREACH (Spl2DrawSeg &elem, m_draws) {
    elem.setupGLSL(pthis);
  }
}

void Spline2Seg::updateCoefTex()
{
  m_pCoefTex->setData(m_scoeff.getPoints() * 12, m_scoeff.getCoefArray());
}

/// update coord texture for GLSL rendering
void Spline2Seg::updateDynamicGLSL(Spline2Renderer *pthis)
{
  updateScoeffDynamic(pthis);
  updateCoefTex();
}

void Spline2Seg::updateStaticGLSL(Spline2Renderer *pthis)
{
  updateScoeffStatic(pthis);
  updateCoefTex();
}

/// Initialize shaders/texture
void Spline2Seg::updateGLSLColor(Spline2Renderer *pthis)
{
  BOOST_FOREACH (Spl2DrawSeg &elem, m_draws) {
    elem.updateGLSLColor(pthis, this);
  }
}

/// display() for GLSL version
void Spline2Seg::drawGLSL(Spline2Renderer *pthis, DisplayContext *pdc)
{
  const double lw = pthis->getLineWidth();
  //m_pVBO->setLineWidth(lw);
  //pdc->drawElem(*m_pVBO);

  pdc->setLineWidth(lw);

  m_pCoefTex->use(0);

  pthis->m_pPO->enable();

  // Setup uniforms
  pthis->m_pPO->setUniformF("frag_alpha", pdc->getAlpha());
  pthis->m_pPO->setUniform("coefTex", 0);
  pthis->m_pPO->setUniform("u_npoints", m_scoeff.getSize());

  // pdc->drawElem(*m_pAttrAry);
  BOOST_FOREACH (Spl2DrawSeg &elem, m_draws) {
    elem.drawGLSL(pdc);
  }

  pthis->m_pPO->disable();
  m_pCoefTex->unuse();
}


//////////////////////////////////////////////////

void Spl2DrawSeg::setupVBO(Spline2Renderer *pthis)
{
  int nsplseg = m_nEnd - m_nStart;
  m_nDetail = pthis->getAxialDetail();
  m_nVA = m_nDetail * nsplseg + 1;

  if (m_pVBO!=NULL)
    delete m_pVBO;
    
  m_pVBO = MB_NEW gfx::DrawElemVC();
  m_pVBO->alloc(m_nVA);
  m_pVBO->setDrawMode(gfx::DrawElem::DRAW_LINE_STRIP);
  LOG_DPRINTLN("Spl2DrawSeg> %d elems VBO created", m_nVA);
}

void Spl2DrawSeg::updateVBO(CubicSpline *pCoeff)
{
  int i;
  float par;
  Vector3F pos;
  
  for (i=0; i<m_nVA; ++i) {
    par = float(i)/float(m_nDetail) + float(m_nStart);
    pCoeff->interpolate(par, &pos);
    m_pVBO->vertex3f(i, pos);
  }

  m_pVBO->setUpdated(true);
}

void Spl2DrawSeg::updateVBOColor(Spline2Renderer *pthis, Spline2Seg *pseg)
{
  int i;
  float par;

  MolCoordPtr pCMol = pthis->getClientMol();

  for (i=0; i<m_nVA; ++i) {
    par = float(i)/float(m_nDetail) + float(m_nStart);
    m_pVBO->color(i, pseg->calcColor(pthis, pCMol, par));
  }
}

void Spl2DrawSeg::drawVBO(Spline2Renderer *pthis, DisplayContext *pdc)
{
  const double lw = pthis->getLineWidth();
  m_pVBO->setLineWidth(lw);
  pdc->drawElem(*m_pVBO);
}

Spl2DrawSeg::~Spl2DrawSeg()
{
  if (m_pVBO!=NULL)
    delete m_pVBO;
}

//////////

/// Initialize shaders/texture
void Spl2DrawSeg::setupGLSL(Spline2Renderer *pthis)
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

  LOG_DPRINTLN("Spl2DrawSeg> %d elems AttrArray created", m_nVA);
}

void Spl2DrawSeg::updateGLSLColor(Spline2Renderer *pthis, Spline2Seg *pSeg)
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
void Spl2DrawSeg::drawGLSL(DisplayContext *pdc)
{
  pdc->drawElem(*m_pAttrAry);
}

