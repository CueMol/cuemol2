// -*-Mode: C++;-*-
//
//    simple molecular renderer (stick model) using GLSL
//

#include <common.h>

#include "SimpleRendGLSL.hpp"

#include "MolCoord.hpp"
#include "AnimMol.hpp"
#include "MolChain.hpp"
#include "MolResidue.hpp"
#include "ResiToppar.hpp"

#include "BondIterator.hpp"
#include "AtomIterator.hpp"

#include <gfx/Texture.hpp>
#include <sysdep/OglDisplayContext.hpp>
#include <sysdep/OglProgramObject.hpp>
#include <qsys/Scene.hpp>

#ifdef WIN32
//#define USE_TBO 1
#else
#endif

#define TEX2D_WIDTH 1024

using namespace molstr;
using qlib::Vector4D;
using qlib::Vector3F;
using gfx::ColorPtr;

SimpleRendGLSL::SimpleRendGLSL()
{
  // will be called by RendererFactory
  //resetAllProps();

  m_pPO = NULL;
  m_pAttrAry = NULL;
  m_pCoordTex = NULL;

  // m_bUseGLSL = false;
  // m_bUseGLSL = true;

  // m_bChkShaderDone = false;
}

SimpleRendGLSL::~SimpleRendGLSL()
{
  // VBO/Texture have been cleaned up in invalidateDisplayCache()
  //  in unloading() method of DispCacheRend impl,
  // and so they must be NULL when the destructor is called.
  MB_ASSERT(m_pAttrAry==NULL);
  MB_ASSERT(m_pCoordTex==NULL);

  MB_DPRINTLN("SimpleRendGLSL destructed %p", this);
}

bool SimpleRendGLSL::isCacheAvail() const
{
  if (isShaderAvail() && isShaderEnabled()) {
    // GLSL mode
    return m_pAttrAry!=NULL;
  }
  else {
    // VBO mode
    return super_t::isCacheAvail();
  }
}

bool SimpleRendGLSL::init(DisplayContext *pdc)
{
  // m_bChkShaderDone = true;

  sysdep::ShaderSetupHelper<SimpleRendGLSL> ssh(this);

  if (!ssh.checkEnvVS()) {
    LOG_DPRINTLN("SimpleRendGLSL> ERROR: GLSL not supported.");
    //MB_THROW(qlib::RuntimeException, "OpenGL GPU shading not supported");
    setShaderAvail(false);
    return false;
  }

  if (m_pPO==NULL)
    m_pPO = ssh.createProgObj("gpu_simplerend",
                              "%%CONFDIR%%/data/shaders/simple_vertex.glsl",
                              "%%CONFDIR%%/data/shaders/simple_frag.glsl");
  
  if (m_pPO==NULL) {
    LOG_DPRINTLN("SimpleRendGLSL> ERROR: cannot create progobj.");
    setShaderAvail(false);
    return false;
  }

  m_pPO->enable();

  // setup uniforms
  m_pPO->setUniform("coordTex", 0);

  // setup attributes
  m_nInd12Loc = m_pPO->getAttribLocation("a_ind12");
  m_nColLoc = m_pPO->getAttribLocation("a_color");

  m_pPO->disable();
  setShaderAvail(true);
  return true;
}

void SimpleRendGLSL::createGLSL()
{
  quint32 i, j;
  quint32 nbons = 0, natoms = 0, nva = 0;
  MolCoordPtr pCMol = getClientMol();

  AnimMol *pAMol = NULL;
  if (isUseAnim())
    pAMol = static_cast<AnimMol *>(pCMol.get());

  //
  // Create CoordTex and atom selection array for coordtex
  //

  if (m_pCoordTex!=NULL)
    delete m_pCoordTex;

  m_pCoordTex = MB_NEW gfx::Texture(); //pdc->createTexture();

#ifdef USE_TBO
  m_pCoordTex->setup(1, gfx::Texture::FMT_R,
                     gfx::Texture::TYPE_FLOAT32);
#else
  m_pCoordTex->setup(2, gfx::Texture::FMT_RGB,
                     gfx::Texture::TYPE_FLOAT32);
#endif

  std::map<quint32, quint32> aidmap;
  AtomIterator aiter(pCMol, getSelection());
  // AtomIterator aiter(pCMol);
  for (i=0, aiter.first(); aiter.hasMore(); aiter.next()) {
    int aid = aiter.getID();
    MolAtomPtr pAtom = pCMol->getAtom(aid);

    if (pAtom.isnull())
      continue; // ignore errors

    aidmap.insert(std::pair<quint32, quint32>(aid, i));
    ++i;
  }

  natoms = i;
  int ncrds = i*3;

  m_sels.resize(natoms);
  
#ifdef USE_TBO
  m_coordbuf.resize(ncrds);
  LOG_DPRINTLN("SimpleGLSL> Coord Texture (TBO) size=%d", ncrds);
#else
  int h=0;
  if (natoms%TEX2D_WIDTH==0)
    h =  natoms/TEX2D_WIDTH;
  else
    h = natoms/TEX2D_WIDTH + 1;
  m_coordbuf.resize(h*TEX2D_WIDTH*3);

  m_nTexW = TEX2D_WIDTH;
  m_nTexH = h;
  LOG_DPRINTLN("SimpleGLSL> Coord Texture2D size=%d,%d", m_nTexW, m_nTexH);
#endif

  m_bUseSels = false;

  for (i=0, aiter.first(); aiter.hasMore(); aiter.next()) {
    int aid = aiter.getID();
    MolAtomPtr pAtom = pCMol->getAtom(aid);

    if (pAtom.isnull())
      continue; // ignore errors

    if (pAMol!=NULL)
      m_sels[i] = pAMol->getCrdArrayInd(aid);
    else
      m_sels[i] = aid;

    if (m_sels[i]!=i)
      m_bUseSels = true;

    ++i;
  }

  if (m_bUseSels)
    LOG_DPRINTLN("SimpleRend> Use indirect CoordTex");
  else
    LOG_DPRINTLN("SimpleRend> Use direct CoordTex");

  // initialize the coloring scheme
  startColorCalc(pCMol);

  //
  // estimate bond data structure size
  //
  
  std::set<int> bonded_atoms;
  BondIterator biter(pCMol, getSelection());
  
  for (biter.first(); biter.hasMore(); biter.next()) {
    MolBond *pMB = biter.getBond();
    int aid1 = pMB->getAtom1();
    int aid2 = pMB->getAtom2();
    
    bonded_atoms.insert(aid1);
    bonded_atoms.insert(aid2);
    
    MolAtomPtr pA1 = pCMol->getAtom(aid1);
    MolAtomPtr pA2 = pCMol->getAtom(aid2);
    
    if (pA1.isnull() || pA2.isnull())
      continue; // skip invalid bonds
    
    ++nbons;
  }
  
  nva = nbons * 4;

  //if (nva>32768)
  //nva = 32768;

  //
  // Create VBO
  //
  
  if (m_pAttrAry!=NULL)
    delete m_pAttrAry;

  m_pAttrAry = MB_NEW AttrArray();
  AttrArray &attra = *m_pAttrAry;
  attra.setAttrSize(2);
  attra.setAttrInfo(0, m_nInd12Loc, 2, qlib::type_consts::QTC_FLOAT32,
		    offsetof(AttrElem, ind1));
  // attra.setAttrInfo(0, m_nInd12Loc, 2, qlib::type_consts::QTC_INT32,
  // offsetof(AttrElem, ind1));
  attra.setAttrInfo(1, m_nColLoc, 4, qlib::type_consts::QTC_UINT8, offsetof(AttrElem, r));

  attra.alloc(nva);
  attra.setDrawMode(gfx::AbstDrawElem::DRAW_LINES);

  qlib::uid_t nSceneID = getSceneID();
  quint32 dcc1, dcc2;

  i = 0;
  for (biter.first(); biter.hasMore(); biter.next()) {
    MolBond *pMB = biter.getBond();
    int aid1 = pMB->getAtom1();
    int aid2 = pMB->getAtom2();
    
    MolAtomPtr pA1 = pCMol->getAtom(aid1);
    MolAtomPtr pA2 = pCMol->getAtom(aid2);
    
    if (pA1.isnull() || pA2.isnull())
      continue; // skip invalid bonds
    
    quint32 ind1 = aidmap[aid1];
    quint32 ind2 = aidmap[aid2];

    ColorPtr pcol1 = ColSchmHolder::getColor(pA1);
    ColorPtr pcol2 = ColSchmHolder::getColor(pA2);
    dcc1 = pcol1->getDevCode(nSceneID);
    dcc2 = pcol2->getDevCode(nSceneID);
    
    // int nBondType = pMB->getType();
    // bool bSameCol = (pcol1->equals(*pcol2.get()))?true:false;
    
    // single bond / valbond disabled
    /*
    attra.at(i*2+0).ind1 = ind1;
    attra.at(i*2+0).ind2 = ind1;
    attra.at(i*2+1).ind1 = ind2;
    attra.at(i*2+1).ind2 = ind2;
    ++i;*/
    
    attra.at(i*4+0).ind1 = ind1;
    attra.at(i*4+0).ind2 = ind1;
    attra.at(i*4+0).r = (qbyte) gfx::getRCode(dcc1);
    attra.at(i*4+0).g = (qbyte) gfx::getGCode(dcc1);
    attra.at(i*4+0).b = (qbyte) gfx::getBCode(dcc1);
    attra.at(i*4+0).a = (qbyte) gfx::getACode(dcc1);

    attra.at(i*4+1).ind1 = ind1;
    attra.at(i*4+1).ind2 = ind2;
    attra.at(i*4+1).r = (qbyte) gfx::getRCode(dcc1);
    attra.at(i*4+1).g = (qbyte) gfx::getGCode(dcc1);
    attra.at(i*4+1).b = (qbyte) gfx::getBCode(dcc1);
    attra.at(i*4+1).a = (qbyte) gfx::getACode(dcc1);

    attra.at(i*4+2).ind1 = ind2;
    attra.at(i*4+2).ind2 = ind1;
    attra.at(i*4+2).r = (qbyte) gfx::getRCode(dcc2);
    attra.at(i*4+2).g = (qbyte) gfx::getGCode(dcc2);
    attra.at(i*4+2).b = (qbyte) gfx::getBCode(dcc2);
    attra.at(i*4+2).a = (qbyte) gfx::getACode(dcc2);

    attra.at(i*4+3).ind1 = ind2;
    attra.at(i*4+3).ind2 = ind2;
    attra.at(i*4+3).r = (qbyte) gfx::getRCode(dcc2);
    attra.at(i*4+3).g = (qbyte) gfx::getGCode(dcc2);
    attra.at(i*4+3).b = (qbyte) gfx::getBCode(dcc2);
    attra.at(i*4+3).a = (qbyte) gfx::getACode(dcc2);

    i++;
    if (i*4+3>nva) {
      break;
    }
  }

  LOG_DPRINTLN("SimpleRend> %d Attr VBO created", nva);

  // finalize the coloring scheme
  endColorCalc(pCMol);
}

void SimpleRendGLSL::updateDynamicGLSL()
{
  quint32 j = 0;
  quint32 i;
  
  MolCoordPtr pCMol = getClientMol();
  AnimMol *pAMol = static_cast<AnimMol *>(pCMol.get());
  
  qfloat32 *crd = pAMol->getAtomCrdArray();
  quint32 natoms = m_sels.size();

#ifdef USE_TBO
  if (!m_bUseSels) {
    m_pCoordTex->setData(natoms*3, 1, 1, crd);
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
    /*for (i=0; i<natoms*3; ++i) {
      m_coordbuf[i] = crd[i];
    }*/
    memcpy(&m_coordbuf[0], &crd[0], natoms*3*sizeof(qfloat32));
  }
  
#ifdef USE_TBO
  m_pCoordTex->setData(natoms*3, 1, 1, &m_coordbuf[0]);
#else
  MB_DPRINTLN("tex size %d x %d x 3 = %d x 3", m_nTexW, m_nTexH, m_nTexW*m_nTexH);
  MB_DPRINTLN("buf size %d", m_coordbuf.size());
  MB_DPRINTLN("crd size %d", natoms*3);
  m_pCoordTex->setData(m_nTexW, m_nTexH, 1, &m_coordbuf[0]);
#endif

}

void SimpleRendGLSL::updateStaticGLSL()
{
  quint32 j = 0;
  quint32 i;
  
  MolCoordPtr pCMol = getClientMol();

  quint32 natoms = m_sels.size();
  for (i=0; i<natoms; ++i) {
    quint32 aid = m_sels[i];
    MolAtomPtr pAtom = pCMol->getAtom(aid);
    //if (pAtom.isnull()) {
    //LOG_DPRINTLN("AID is invalid: %d, i=%d, natoms=%d", aid, i, natoms);
    //}

    Vector4D pos = pAtom->getPos();

    m_coordbuf[i*3+0] = pos.x();
    m_coordbuf[i*3+1] = pos.y();
    m_coordbuf[i*3+2] = pos.z();
  }

#ifdef USE_TBO
  m_pCoordTex->setData(natoms*3, 1, 1, &m_coordbuf[0]);
#else
  MB_DPRINTLN("tex size %d x %d = %d", m_nTexW, m_nTexH, m_nTexW*m_nTexH);
  MB_DPRINTLN("buf size %d", m_coordbuf.size());
  MB_DPRINTLN("crd size %d", natoms*3);
  m_pCoordTex->setData(m_nTexW, m_nTexH, 1, &m_coordbuf[0]);
#endif
  //m_pCoordTex->setData(natoms, &m_coordbuf[0]);
}

void SimpleRendGLSL::invalidateDisplayCache()
{
  if (m_pCoordTex!=NULL) {
    // MB_DPRINTLN("%%%%%%%%%%%%% SimpleRend delete CoordTex");
    delete m_pCoordTex;
    m_pCoordTex = NULL;
  }
  m_sels.clear();
  m_coordbuf.clear();
  if (m_pAttrAry!=NULL) {
    delete m_pAttrAry;
    m_pAttrAry = NULL;
  }

  super_t::invalidateDisplayCache();
}

void SimpleRendGLSL::renderGLSL(DisplayContext *pdc)
{
  // new rendering routine using GLSL
  
  if (m_pPO==NULL)
    return; // Error, Cannot draw anything (ignore)

  pdc->setLineWidth(getLineWidth());

  pdc->useTexture(m_pCoordTex, 0);
  m_pPO->enable();
  m_pPO->setUniformF("frag_alpha", pdc->getAlpha());
  pdc->drawElem(*m_pAttrAry);

  m_pPO->disable();
  pdc->unuseTexture(m_pCoordTex);
}

/*
void SimpleRendGLSL::objectChanged(qsys::ObjectEvent &ev)
{
  if (isVisible() &&
      ev.getType()==qsys::ObjectEvent::OBE_CHANGED_DYNAMIC &&
      ev.getDescr().equals("atomsMoved")) {
    // OBE_CHANGED_DYNAMIC && descr=="atomsMoved"
    if (isUseAnim()) {
      // If shader is available
      // --> Enter the GLSL mode
      if (isShaderAvail() && !isShaderEnabled()) {
        //invalidateDisplayCache();
        setShaderEnable(true);
      }
      //if (!isCacheAvail()) {
      //createCacheData();
      //}
      if (m_pAttrAry==NULL) {
	createGLSL();
	//updateGLSLColor();
      }

      // only update positions
      // updateCrdDynamic();
      updateDynamicGLSL();
      return;
    }
  }
  else if (ev.getType()==qsys::ObjectEvent::OBE_CHANGED_FIXDYN) {
    MB_DPRINTLN("SimpleRend (%p) > OBE_CHANGED_FIXDYN called!!", this);

    if (!isForceGLSL())
      setShaderEnable(false); // reset to VBO mode

    return;
  }

  super_t::objectChanged(ev);
}
*/

