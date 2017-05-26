// -*-Mode: C++;-*-
//
//  Ball stick renderer implementation using GLSL (ver.2)
//

#include <common.h>

#include "GLSLBallStick2Renderer.hpp"

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

GLSLBallStick2Renderer::GLSLBallStick2Renderer()
{
  m_pSphPO = NULL;
  m_pSphAttrAry = NULL;
  m_pCoordTex = NULL;
  m_pColorTex = NULL;

  m_pCylPO = NULL;
  m_pCylAttrAry = NULL;

  m_pRingVBO = NULL;
}

GLSLBallStick2Renderer::~GLSLBallStick2Renderer()
{
  // VBO/Texture have been cleaned up in invalidateDisplayCache()
  //  in unloading() method of DispCacheRend impl,
  // and so they must be NULL when the destructor is called.
  MB_ASSERT(m_pSphAttrAry==NULL);
  MB_ASSERT(m_pCylAttrAry==NULL);
  MB_ASSERT(m_pCoordTex==NULL);
  MB_ASSERT(m_pColorTex==NULL);

  MB_DPRINTLN("GLSLBallStick2Renderer destructed %p", this);
}

bool GLSLBallStick2Renderer::isCacheAvail() const
{
  if (isShaderAvail() && isShaderEnabled()) {
    // GLSL mode
    //return m_pSphAttrAry!=NULL && m_pCoordTex!=NULL && m_pColorTex!=NULL;

    return m_pSphAttrAry!=NULL && m_pCylAttrAry!=NULL;
  }
  else {
    // VBO mode
    return super_t::isCacheAvail();
  }
}

bool GLSLBallStick2Renderer::init(DisplayContext *pdc)
{
  sysdep::OglShaderSetupHelper<GLSLBallStick2Renderer> ssh(this);

  if (!ssh.checkEnvVS()) {
    LOG_DPRINTLN("GLSLBallStick2Renderer> ERROR: GLSL not supported.");
    setShaderAvail(false);
    return false;
  }

  // Load sphere shader
  if (m_pSphPO==NULL) {
    ssh.setUseInclude(true);
#ifdef USE_TBO
    ssh.defineMacro("USE_TBO", "1");
#else
    ssh.defineMacro("TEX2D_WIDTH", LString::format("%d",TEX2D_WIDTH).c_str());
#endif
    m_pSphPO = ssh.createProgObj("gpu_sphere2",
                              "%%CONFDIR%%/data/shaders/sphere2_vertex.glsl",
                              "%%CONFDIR%%/data/shaders/sphere2_frag.glsl");
  }
  
  if (m_pSphPO==NULL) {
    LOG_DPRINTLN("GLSLBallStick2Renderer> ERROR: cannot create progobj.");
    setShaderAvail(false);
    return false;
  }

  m_pSphPO->enable();

  // setup attribute locations
  m_nRadLoc = m_pSphPO->getAttribLocation("a_radius");

  m_pSphPO->disable();

  // Load cylinder shader
  if (m_pCylPO==NULL) {
    ssh.setUseInclude(true);
#ifdef USE_TBO
    ssh.defineMacro("USE_TBO", "1");
#else
    ssh.defineMacro("TEX2D_WIDTH", LString::format("%d",TEX2D_WIDTH).c_str());
#endif
    m_pCylPO = ssh.createProgObj("gpu_cylinder2",
                              "%%CONFDIR%%/data/shaders/cylinder2_vert.glsl",
                              "%%CONFDIR%%/data/shaders/cylinder2_frag.glsl");
  }
  
  if (m_pCylPO==NULL) {
    LOG_DPRINTLN("GLSLBallStick2Renderer> ERROR: cannot create progobj.");
    setShaderAvail(false);
    return false;
  }

  m_pCylPO->enable();

  // setup attribute locations
  m_nInd12Loc = m_pCylPO->getAttribLocation("a_ind12");

  m_pCylPO->disable();

  setShaderAvail(true);

  return true;
}

void GLSLBallStick2Renderer::createGLSL()
{
  createData();

  quint32 i, j;
  quint32 natoms = 0;
  MolCoordPtr pCMol = getClientMol();

  AnimMol *pAMol = NULL;
  if (isUseAnim())
    pAMol = static_cast<AnimMol *>(pCMol.get());

  //
  // Count target atoms
  //

  natoms = m_atomdat.size();

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
  LOG_DPRINTLN("GLSLBallStick2Rend> Coord Texture (TBO) size=%d", natoms*3);
#else
  int h=0;
  if (natoms%TEX2D_WIDTH==0)
    h =  natoms/TEX2D_WIDTH;
  else
    h = natoms/TEX2D_WIDTH + 1;
  m_nTexW = TEX2D_WIDTH;
  m_nTexH = h;

  m_coordbuf.resize(m_nTexW*m_nTexH*3);
  LOG_DPRINTLN("GLSLBallStick2Rend> Coord Texture2D size=%d,%d", m_nTexW, m_nTexH);
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
  LOG_DPRINTLN("GLSLBallStick2Rend> Color Texture (TBO) size=%d", natoms*4);
#else
  m_pColorTex->setup(2, gfx::Texture::FMT_RGBA,
                           gfx::Texture::TYPE_UINT8_COLOR);
  m_colorTexData.resize(m_nTexW*m_nTexH*4);
  LOG_DPRINTLN("GLSLBallStick2Rend> Color Texture2D size=%d,%d", m_nTexW, m_nTexH);
#endif

  //
  // Create Sphere VBO
  //
  
  if (m_pSphAttrAry!=NULL)
    delete m_pSphAttrAry;

  qlib::uid_t nSceneID = getSceneID();
  boost::unordered_map<quint32,quint32> aidmap;
  m_pSphAttrAry = MB_NEW SphAttrArray();
  {
    SphAttrArray &attra = *m_pSphAttrAry;
    attra.setAttrSize(1);
    attra.setAttrInfo(0, m_nRadLoc, 1, qlib::type_consts::QTC_FLOAT32, offsetof(SphAttrElem, rad));

    attra.alloc(natoms*4);
    attra.allocInd(natoms*6);
    attra.setDrawMode(gfx::AbstDrawElem::DRAW_TRIANGLES);

    quint32 dcc1, dcc2;

    i = 0;
    quint32 aid;
    MolAtomPtr pAtom;
    float rad;
    for (i=0; i<natoms; ++i) {
      const int ive = i*4;
      const int ifc = i*6;

      //rad = rads[i];
      rad = m_atomdat[i].rad;
      aidmap.insert(std::pair<quint32,quint32>( m_atomdat[i].aid, quint32(i) ));

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

  }
  
  //LOG_DPRINTLN("GLSLBallStick2Rend> %d Attr VBO created", natoms*4);
  
  if (m_pCylAttrAry!=NULL)
    delete m_pCylAttrAry;
  //int nbonds = m_bonddat.size();
  int nbonds = m_bonddat.size()*2;

  m_pCylAttrAry = MB_NEW CylAttrArray();
  {
    CylAttrArray &attra = *m_pCylAttrAry;
    attra.setAttrSize(1);
    attra.setAttrInfo(0, m_nInd12Loc, 2, qlib::type_consts::QTC_FLOAT32, offsetof(CylAttrElem, ind1));

    attra.alloc(nbonds*4);
    attra.allocInd(nbonds*6);
    attra.setDrawMode(gfx::AbstDrawElem::DRAW_TRIANGLES);

    quint32 ind1, ind2;
    MolAtomPtr pAtom;
    for (i=0; i<nbonds; ++i) {
      const int ive = i*4;
      const int ifc = i*6;
      
      ind1 = aidmap[ m_bonddat[i/2].aid1 ];
      ind2 = aidmap[ m_bonddat[i/2].aid2 ];
      if (i%2==1) {
        std::swap(ind1,ind2);
      }

      //ind1 = aidmap[ m_bonddat[i].aid1 ];
      //ind2 = aidmap[ m_bonddat[i].aid2 ];

      // vertex data
      for (int j=0; j<4; ++j) {
        attra.at(ive+j).ind1 = ind1;
        attra.at(ive+j).ind2 = ind2;
      }
      
      // face indices
      attra.atind(ifc+0) = ive + 0;
      attra.atind(ifc+1) = ive + 1;
      attra.atind(ifc+2) = ive + 2;
      attra.atind(ifc+3) = ive + 2;
      attra.atind(ifc+4) = ive + 1;
      attra.atind(ifc+5) = ive + 3;
    }
  }
  
  //
  // Create Ring VBO
  //

  int rng_nverts=0;
  int rng_nfaces=0;
  estimateRingVBOSize(rng_nverts, rng_nfaces);

  if (rng_nverts>0&&rng_nfaces>0) {
    m_pRingVBO = MB_NEW gfx::DrawElemVNCI32();
    m_pRingVBO->setDrawMode(gfx::DrawElem::DRAW_TRIANGLES);
    m_pRingVBO->alloc(rng_nverts);
    m_pRingVBO->allocIndex(rng_nfaces);

    setupRingVBO(m_pRingVBO, 0, 0);
  }

}

void GLSLBallStick2Renderer::updateStaticGLSL()
{
  quint32 i, j;
  
  MolCoordPtr pCMol = getClientMol();

  quint32 natoms = m_atomdat.size();
  for (i=0; i<natoms; ++i) {
    quint32 aid = m_atomdat[i].aid;
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

  if (m_pRingVBO!=NULL)
    updateStaticRingVBO(m_pRingVBO, 0);
}

void GLSLBallStick2Renderer::updateDynamicGLSL()
{
  quint32 j = 0;
  quint32 i;
  
  MolCoordPtr pCMol = getClientMol();
  AnimMol *pAMol = static_cast<AnimMol *>(pCMol.get());
  
  qfloat32 *crd = pAMol->getAtomCrdArray();
  quint32 natoms = m_atomdat.size();

#ifdef USE_TBO
  if (!m_bUseSels) {
    m_pCoordTex->setData(natoms, 1, 1, crd);
    return;
  }
#endif

  quint32 ind;
  if (m_bUseSels) {
    for (i=0; i<natoms; ++i) {
      ind = m_atomdat[i].aid;
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

  if (m_pRingVBO!=NULL)
    updateDynamicRingVBO(m_pRingVBO, 0);
}

void GLSLBallStick2Renderer::updateGLSLColor()
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
  quint32 natoms = m_atomdat.size();
  for (i=0; i<natoms; ++i) {
    if (pAMol==NULL) {
      // static update mode
      aid = m_atomdat[i].aid;
    }
    else {
      // dynamic update mode
      aid = pAMol->getAtomIDByArrayInd( m_atomdat[i].aid );
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

  LOG_DPRINTLN("GLSLBallStick2Rend> %d color tex updated", natoms);

  if (m_pRingVBO!=NULL)
    setRingCols(m_pRingVBO, 0);

  // finalize the coloring scheme
  endColorCalc(pCMol);

}

void GLSLBallStick2Renderer::invalidateDisplayCache()
{
  if (m_pCoordTex!=NULL) {
    delete m_pCoordTex;
    m_pCoordTex = NULL;
  }
  //m_ls.clear();
  m_coordbuf.clear();
  if (m_pSphAttrAry!=NULL) {
    delete m_pSphAttrAry;
    m_pSphAttrAry = NULL;
  }
  if (m_pColorTex!=NULL) {
    delete m_pColorTex;
    m_pColorTex = NULL;
  }

  if (m_pCylAttrAry!=NULL) {
    delete m_pCylAttrAry;
    m_pCylAttrAry = NULL;
  }

  if (m_pRingVBO!=NULL) {
    delete m_pRingVBO;
    m_pRingVBO = NULL;
  }

  super_t::invalidateDisplayCache();
}

void GLSLBallStick2Renderer::renderGLSL(DisplayContext *pdc)
{
  qlib::uid_t nSceneID = getSceneID();

  pdc->useTexture(m_pCoordTex, COORD_TEX_UNIT);
  pdc->useTexture(m_pColorTex, COLOR_TEX_UNIT);

  if (m_pSphPO!=NULL && m_pSphAttrAry!=NULL) {
    m_pSphPO->enable();
    m_pSphPO->setUniformF("frag_alpha", pdc->getAlpha());
    m_pSphPO->setUniform("coordTex", COORD_TEX_UNIT);
    m_pSphPO->setUniform("colorTex", COLOR_TEX_UNIT);

    // Setup edge/silhouette
    if (pdc->getEdgeLineType()!=DisplayContext::ELT_NONE) {
      m_pSphPO->setUniformF("u_edge", pdc->getEdgeLineWidth());

      double r=.0,g=.0,b=.0;
      ColorPtr pcol = pdc->getEdgeLineColor();
      if (!pcol.isnull()) {
        quint32 dcc = pcol->getDevCode(nSceneID);
        r = gfx::convI2F(gfx::getRCode(dcc));
        g = gfx::convI2F(gfx::getGCode(dcc));
        b = gfx::convI2F(gfx::getBCode(dcc));
      }

      m_pSphPO->setUniformF("u_edgecolor", r,g,b,1);
      if (pdc->getEdgeLineType()==DisplayContext::ELT_SILHOUETTE)
        m_pSphPO->setUniform("u_bsilh", 1);
      else
        m_pSphPO->setUniform("u_bsilh", 0);
    }
    else {
      m_pSphPO->setUniformF("u_edge", 0.0);
      m_pSphPO->setUniformF("u_edgecolor", 0,0,0,1);
      m_pSphPO->setUniform("u_bsilh", 0);
    }

    pdc->drawElem(*m_pSphAttrAry);
    m_pSphPO->disable();
  }
  
  if (m_pCylPO!=NULL && m_pCylAttrAry!=NULL) {
    m_pCylPO->enable();
    m_pCylPO->setUniformF("frag_alpha", pdc->getAlpha());
    m_pCylPO->setUniform("coordTex", COORD_TEX_UNIT);
    m_pCylPO->setUniform("colorTex", COLOR_TEX_UNIT);
    m_pCylPO->setUniformF("u_rad", getBondw());

    // Setup edge/silhouette
    if (pdc->getEdgeLineType()!=DisplayContext::ELT_NONE) {
      m_pCylPO->setUniformF("u_edge", pdc->getEdgeLineWidth());

      double r=.0,g=.0,b=.0;
      ColorPtr pcol = pdc->getEdgeLineColor();
      if (!pcol.isnull()) {
        quint32 dcc = pcol->getDevCode(nSceneID);
        r = gfx::convI2F(gfx::getRCode(dcc));
        g = gfx::convI2F(gfx::getGCode(dcc));
        b = gfx::convI2F(gfx::getBCode(dcc));
      }

      m_pCylPO->setUniformF("u_edgecolor", r,g,b,1);
      if (pdc->getEdgeLineType()==DisplayContext::ELT_SILHOUETTE)
        m_pCylPO->setUniform("u_bsilh", 1);
      else
        m_pCylPO->setUniform("u_bsilh", 0);
    }
    else {
      m_pCylPO->setUniformF("u_edge", 0.0);
      m_pCylPO->setUniformF("u_edgecolor", 0,0,0,1);
      m_pCylPO->setUniform("u_bsilh", 0);
    }

    pdc->drawElem(*m_pCylAttrAry);
    m_pCylPO->disable();
  }


  pdc->unuseTexture(m_pCoordTex);
  pdc->unuseTexture(m_pColorTex);

  if (m_pRingVBO!=NULL)
    pdc->drawElem(*m_pRingVBO);

}

