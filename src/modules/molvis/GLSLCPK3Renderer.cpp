// -*-Mode: C++;-*-
//

//

#include <common.h>

#include "GLSLCPK3Renderer.hpp"

#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/AnimMol.hpp>
#include <modules/molstr/MolChain.hpp>
#include <modules/molstr/MolResidue.hpp>
#include <modules/molstr/AtomIterator.hpp>

#include <gfx/Texture.hpp>
#include <sysdep/OglShaderSetupHelper.hpp>
#include <qsys/Scene.hpp>

#ifdef WIN32
#define USE_TBO 1
#else
#endif

#define TEX2D_WIDTH 1024

using namespace molvis;
using qlib::Vector4D;
using qlib::Vector3F;
using gfx::ColorPtr;

GLSLCPK3Renderer::GLSLCPK3Renderer()
{
  m_pPO = NULL;
  m_pAttrAry = NULL;
  m_pCoordTex = NULL;
  m_pColorTex = NULL;
}

GLSLCPK3Renderer::~GLSLCPK3Renderer()
{
  // VBO/Texture have been cleaned up in invalidateDisplayCache()
  //  in unloading() method of DispCacheRend impl,
  // and so they must be NULL when the destructor is called.
  MB_ASSERT(m_pAttrAry==NULL);
  MB_ASSERT(m_pCoordTex==NULL);
  MB_ASSERT(m_pColorTex==NULL);

  MB_DPRINTLN("GLSLCPK3Renderer destructed %p", this);
}

bool GLSLCPK3Renderer::isCacheAvail() const
{
  if (isShaderAvail() && isShaderEnabled()) {
    // GLSL mode
    //return m_pAttrAry!=NULL && m_pCoordTex!=NULL && m_pColorTex!=NULL;
    return m_pAttrAry!=NULL;
  }
  else {
    // VBO mode
    return super_t::isCacheAvail();
  }
}

bool GLSLCPK3Renderer::init(DisplayContext *pdc)
{
  sysdep::OglShaderSetupHelper<GLSLCPK3Renderer> ssh(this);

  if (!ssh.checkEnvVS()) {
    LOG_DPRINTLN("GLSLCPK3Renderer> ERROR: GLSL not supported.");
    //MB_THROW(qlib::RuntimeException, "OpenGL GPU shading not supported");
    setShaderAvail(false);
    return false;
  }

  if (m_pPO==NULL) {
    ssh.setUseInclude(true);
#ifdef USE_TBO
    ssh.defineMacro("USE_TBO", "1");
#else
    ssh.defineMacro("TEX2D_WIDTH", LString::format("%d",TEX2D_WIDTH).c_str());
#endif
    m_pPO = ssh.createProgObj("gpu_sphere2",
                              "%%CONFDIR%%/data/shaders/sphere2_vertex.glsl",
                              "%%CONFDIR%%/data/shaders/sphere2_frag.glsl");
  }
  
  if (m_pPO==NULL) {
    LOG_DPRINTLN("GLSLCPK3Renderer> ERROR: cannot create progobj.");
    setShaderAvail(false);
    return false;
  }

  m_pPO->enable();

  // setup attribute locations
  m_nRadLoc = m_pPO->getAttribLocation("a_radius");

  m_pPO->disable();

  setShaderAvail(true);

  return true;
}

void GLSLCPK3Renderer::createGLSL()
{
  quint32 i, j;
  quint32 natoms = 0;
  MolCoordPtr pCMol = getClientMol();

  AnimMol *pAMol = NULL;
  if (isUseAnim())
    pAMol = static_cast<AnimMol *>(pCMol.get());

  //
  // Count target atoms
  //

  AtomIterator aiter(pCMol, getSelection());
  for (i=0, aiter.first(); aiter.hasMore(); aiter.next()) {
    int aid = aiter.getID();
    MolAtomPtr pAtom = pCMol->getAtom(aid);
    if (pAtom.isnull())
      continue; // ignore errors
    ++i;
  }

  natoms = i;

  //
  // Create CoordTex
  //

  if (m_pCoordTex!=NULL)
    delete m_pCoordTex;

  m_pCoordTex = MB_NEW gfx::Texture();

#ifdef USE_TBO
  m_pCoordTex->setup(1, gfx::Texture::FMT_RGB,
                     gfx::Texture::TYPE_FLOAT32);
#else
  m_pCoordTex->setup(2, gfx::Texture::FMT_RGB,
                     gfx::Texture::TYPE_FLOAT32);
#endif


#ifdef USE_TBO
  m_coordbuf.resize(natoms*3);
  LOG_DPRINTLN("GLSLCPK3Rend> Coord Texture (TBO) size=%d", natoms*3);
#else
  int h=0;
  if (natoms%TEX2D_WIDTH==0)
    h =  natoms/TEX2D_WIDTH;
  else
    h = natoms/TEX2D_WIDTH + 1;
  m_nTexW = TEX2D_WIDTH;
  m_nTexH = h;

  m_coordbuf.resize(m_nTexW*m_nTexH*3);
  LOG_DPRINTLN("GLSLCPK3Rend> Coord Texture2D size=%d,%d", m_nTexW, m_nTexH);
#endif

  //
  // Create ColorTex
  //

  if (m_pColorTex!=NULL)
    delete m_pColorTex;

  m_pColorTex = MB_NEW gfx::Texture();

#ifdef USE_TBO
 m_pColorTex->setup(1, gfx::Texture::FMT_RGBA,
                           gfx::Texture::TYPE_UINT8_COLOR);
  m_colorTexData.resize(natoms*4);
  LOG_DPRINTLN("GLSLCPK3Rend> Color Texture (TBO) size=%d", natoms*4);
#else
  m_pColorTex->setup(2, gfx::Texture::FMT_RGBA,
                           gfx::Texture::TYPE_UINT8_COLOR);
  m_colorTexData.resize(m_nTexW*m_nTexH*4);
  LOG_DPRINTLN("GLSLCPK3Rend> Color Texture2D size=%d,%d", m_nTexW, m_nTexH);
#endif

  //
  //  Create atom selection array/radius table for coordtex
  //
  
  m_sels.resize(natoms);
  std::vector<float> rads(natoms);

  m_bUseSels = false;

  for (i=0, aiter.first(); aiter.hasMore(); aiter.next()) {
    int aid = aiter.getID();
    MolAtomPtr pAtom = pCMol->getAtom(aid);

    if (pAtom.isnull())
      continue; // ignore errors

    rads[i] = getVdWRadius(pAtom);

    if (pAMol!=NULL)
      m_sels[i] = pAMol->getCrdArrayInd(aid);
    else
      m_sels[i] = aid;

    if (m_sels[i]!=i)
      m_bUseSels = true;

    ++i;
  }

  if (m_bUseSels)
    LOG_DPRINTLN("GLSLCPK3Rend> Use indirect CoordTex");
  else
    LOG_DPRINTLN("GLSLCPK3Rend> Use direct CoordTex");

  //
  // Create VBO
  //
  
  if (m_pAttrAry!=NULL)
    delete m_pAttrAry;

  m_pAttrAry = MB_NEW AttrArray();
  AttrArray &attra = *m_pAttrAry;
  attra.setAttrSize(1);
  attra.setAttrInfo(0, m_nRadLoc, 1, qlib::type_consts::QTC_FLOAT32, offsetof(AttrElem, rad));

  attra.alloc(natoms*4);
  attra.allocInd(natoms*6);
  attra.setDrawMode(gfx::AbstDrawElem::DRAW_TRIANGLES);

  qlib::uid_t nSceneID = getSceneID();
  quint32 dcc1, dcc2;

  startColorCalc(pCMol);

  i = 0;
  quint32 aid;
  MolAtomPtr pAtom;
  float rad;
  for (i=0; i<natoms; ++i) {
    const int ive = i*4;
    const int ifc = i*6;
    
    rad = rads[i];

    // vertex data
    for (int j=0; j<4; ++j)
      attra.at(ive+j).rad = rad;

    // face indices
    attra.atind(ifc+0) = ive + 0;
    attra.atind(ifc+1) = ive + 1;
    attra.atind(ifc+2) = ive + 2;
    attra.atind(ifc+3) = ive + 2;
    attra.atind(ifc+4) = ive + 1;
    attra.atind(ifc+5) = ive + 3;
  }

  LOG_DPRINTLN("GLSLCPK3Rend> %d Attr VBO created", natoms*4);
}

void GLSLCPK3Renderer::updateStaticGLSL()
{
  quint32 i, j;
  
  MolCoordPtr pCMol = getClientMol();

  quint32 natoms = m_sels.size();
  for (i=0; i<natoms; ++i) {
    quint32 aid = m_sels[i];
    MolAtomPtr pAtom = pCMol->getAtom(aid);

    Vector4D pos = pAtom->getPos();

    m_coordbuf[i*3+0] = pos.x();
    m_coordbuf[i*3+1] = pos.y();
    m_coordbuf[i*3+2] = pos.z();
  }

#ifdef USE_TBO
  m_pCoordTex->setData(natoms, 1, 1, &m_coordbuf[0]);
#else
  MB_DPRINTLN("tex size %d x %d = %d", m_nTexW, m_nTexH, m_nTexW*m_nTexH);
  MB_DPRINTLN("buf size %d", m_coordbuf.size());
  MB_DPRINTLN("crd size %d", natoms*3);
  m_pCoordTex->setData(m_nTexW, m_nTexH, 1, &m_coordbuf[0]);
#endif
}

void GLSLCPK3Renderer::updateDynamicGLSL()
{
  quint32 j = 0;
  quint32 i;
  
  MolCoordPtr pCMol = getClientMol();
  AnimMol *pAMol = static_cast<AnimMol *>(pCMol.get());
  
  qfloat32 *crd = pAMol->getAtomCrdArray();
  quint32 natoms = m_sels.size();

#ifdef USE_TBO
  if (!m_bUseSels) {
    m_pCoordTex->setData(natoms, 1, 1, crd);
    return;
  }
#endif

  quint32 ind;
  if (m_bUseSels) {
    for (i=0; i<natoms; ++i) {
      ind = m_sels[i];
      for (j=0; j<3; ++j) {
        m_coordbuf[i*3+j] = crd[ind*3+j];
      }
    }
  }
  else {
    memcpy(&m_coordbuf[0], &crd[0], natoms*3*sizeof(qfloat32));
  }
  
#ifdef USE_TBO
  m_pCoordTex->setData(natoms, 1, 1, &m_coordbuf[0]);
#else
  MB_DPRINTLN("tex size %d x %d = %d", m_nTexW, m_nTexH, m_nTexW*m_nTexH);
  MB_DPRINTLN("buf size %d", m_coordbuf.size());
  MB_DPRINTLN("crd size %d", natoms*3);
  m_pCoordTex->setData(m_nTexW, m_nTexH, 1, &m_coordbuf[0]);
#endif

}

void GLSLCPK3Renderer::updateGLSLColor()
{
  MolCoordPtr pCMol = getClientMol();

  AnimMol *pAMol = NULL;
  if (isUseAnim())
    pAMol = static_cast<AnimMol *>(pCMol.get());

  startColorCalc(pCMol);

  qlib::uid_t nSceneID = getSceneID();
  quint32 dcc;
  quint32 i;
  int aid;
  MolAtomPtr pAtom;
  ColorPtr pcol;
  quint32 natoms = m_sels.size();
  for (i=0; i<natoms; ++i) {
    if (pAMol==NULL) {
      // static update mode
      aid = m_sels[i];
    }
    else {
      // dynamic update mode
      aid = pAMol->getAtomIDByArrayInd( m_sels[i] );
    }
    pAtom = pCMol->getAtom(aid);
    pcol = ColSchmHolder::getColor(pAtom);
    dcc = pcol->getDevCode(nSceneID);

    m_colorTexData[i*4+0] = (qbyte) gfx::getRCode(dcc);
    m_colorTexData[i*4+1] = (qbyte) gfx::getGCode(dcc);
    m_colorTexData[i*4+2] = (qbyte) gfx::getBCode(dcc);
    m_colorTexData[i*4+3] = (qbyte) gfx::getACode(dcc);
  }

#ifdef USE_TBO
  m_pColorTex->setData(natoms, 1, 1, &m_colorTexData[0]);
#else
  MB_DPRINTLN("tex size %d x %d = %d", m_nTexW, m_nTexH, m_nTexW*m_nTexH);
  MB_DPRINTLN("buf size %d", m_colorTexData.size());
  MB_DPRINTLN("crd size %d", natoms*4);
  m_pColorTex->setData(m_nTexW, m_nTexH, 1, &m_colorTexData[0]);
#endif

  LOG_DPRINTLN("GLSLCPK3Rend> %d color tex updated", natoms);

  // finalize the coloring scheme
  endColorCalc(pCMol);

}

void GLSLCPK3Renderer::invalidateDisplayCache()
{
  if (m_pCoordTex!=NULL) {
    delete m_pCoordTex;
    m_pCoordTex = NULL;
  }
  m_sels.clear();
  m_coordbuf.clear();
  if (m_pAttrAry!=NULL) {
    delete m_pAttrAry;
    m_pAttrAry = NULL;
  }
  if (m_pColorTex!=NULL) {
    delete m_pColorTex;
    m_pColorTex = NULL;
  }

  super_t::invalidateDisplayCache();
}

void GLSLCPK3Renderer::renderGLSL(DisplayContext *pdc)
{
  if (m_pPO==NULL)
    return; // Error, Cannot draw anything (ignore)

  qlib::uid_t nSceneID = getSceneID();

  pdc->useTexture(m_pCoordTex, COORD_TEX_UNIT);
  pdc->useTexture(m_pColorTex, COLOR_TEX_UNIT);
  m_pPO->enable();
  m_pPO->setUniformF("frag_alpha", pdc->getAlpha());
  m_pPO->setUniform("coordTex", COORD_TEX_UNIT);
  m_pPO->setUniform("colorTex", COLOR_TEX_UNIT);

  // Setup edge/silhouette
  if (pdc->getEdgeLineType()!=DisplayContext::ELT_NONE) {
    m_pPO->setUniformF("u_edge", pdc->getEdgeLineWidth());

    double r=.0,g=.0,b=.0;
    ColorPtr pcol = pdc->getEdgeLineColor();
    if (!pcol.isnull()) {
      quint32 dcc = pcol->getDevCode(nSceneID);
      r = gfx::convI2F(gfx::getRCode(dcc));
      g = gfx::convI2F(gfx::getGCode(dcc));
      b = gfx::convI2F(gfx::getBCode(dcc));
    }
    
    m_pPO->setUniformF("u_edgecolor", r,g,b,1);
    if (pdc->getEdgeLineType()==DisplayContext::ELT_SILHOUETTE)
      m_pPO->setUniform("u_bsilh", 1);
    else
      m_pPO->setUniform("u_bsilh", 0);
  }
  else {
    m_pPO->setUniformF("u_edge", 0.0);
    m_pPO->setUniformF("u_edgecolor", 0,0,0,1);
    m_pPO->setUniform("u_bsilh", 0);
  }
  
  pdc->drawElem(*m_pAttrAry);
  m_pPO->disable();

  pdc->unuseTexture(m_pCoordTex);
  pdc->unuseTexture(m_pColorTex);
}

