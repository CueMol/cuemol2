// -*-Mode: C++;-*-
//
//    simple molecular renderer (stick model) using GLSL
//

#include <common.h>

#include "SimpleRenderer.hpp"

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

using namespace molstr;
using qlib::Vector4D;
using qlib::Vector3F;
using gfx::ColorPtr;

void SimpleRenderer::initShader(DisplayContext *pdc)
{
  m_bChkShaderDone = true;

  sysdep::ShaderSetupHelper<SimpleRenderer> ssh(this);

  if (!ssh.checkEnvVS()) {
    LOG_DPRINTLN("SimpleRendGLSL> ERROR: GLSL not supported.");
    MB_THROW(qlib::RuntimeException, "OpenGL GPU shading not supported");
    return;
  }

  if (m_pPO==NULL)
    m_pPO = ssh.createProgObj("gpu_simplerend",
                              "%%CONFDIR%%/data/shaders/simple_vertex.glsl",
                              "%%CONFDIR%%/data/shaders/simple_frag.glsl");
  
  if (m_pPO==NULL) {
    LOG_DPRINTLN("SimpleRendGLSL> ERROR: cannot create progobj.");
    return;
  }

  m_pCoordTex = pdc->createTexture2D();
  //m_pCoordTex = pdc->createTexture1D();
  m_pCoordTex->setup(gfx::AbstTexture::FMT_RGB,
                     gfx::AbstTexture::TYPE_FLOAT32);


  m_pPO->enable();

  // setup uniforms
  m_pPO->setUniform("coordTex", 0);

  // setup attributes
  m_nInd12Loc = m_pPO->getAttribLocation("a_ind12");
  m_nColLoc = m_pPO->getAttribLocation("a_color");

  m_pPO->disable();
}

void SimpleRenderer::createGLSL()
{
  quint32 i, j;
  quint32 nbons = 0, natoms = 0, nva = 0;
  MolCoordPtr pCMol = getClientMol();

  AnimMol *pAMol = NULL;
  if (isUseAnim())
    pAMol = static_cast<AnimMol *>(pCMol.get());

  //
  // Create atom selection array for coordtex
  //
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
  m_coordbuf.resize(i*3);
  m_sels.resize(i);
  
  for (i=0, aiter.first(); aiter.hasMore(); aiter.next()) {
    int aid = aiter.getID();
    MolAtomPtr pAtom = pCMol->getAtom(aid);

    if (pAtom.isnull())
      continue; // ignore errors

    if (pAMol!=NULL)
      m_sels[i] = pAMol->getCrdArrayInd(aid) * 3;
    else
      m_sels[i] = aid;
    ++i;
  }

  // initialize the coloring scheme
  getColSchm()->start(pCMol, this);
  pCMol->getColSchm()->start(pCMol, this);

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

  //
  // Create VBO
  //
  
  if (m_pAttrAry!=NULL)
    delete m_pAttrAry;

  m_pAttrAry = MB_NEW AttrArray();
  AttrArray &attra = *m_pAttrAry;
  attra.setAttrSize(2);
  attra.setAttrInfo(0, m_nInd12Loc, 2, qlib::type_consts::QTC_FLOAT32,  offsetof(AttrElem, ind1));
  // attra.setAttrInfo(0, m_nInd12Loc, 2, qlib::type_consts::QTC_INT32,  offsetof(AttrElem, ind1));
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
  }

  LOG_DPRINTLN("SimpleRend> %d Attr VBO created", nva);
#if 0

    


    i++;

    /*
    m_sbonds[i].aid1 = aid1;
    m_sbonds[i].aid2 = aid2;
    if (pAMol!=NULL) {
      m_sbonds[i].ind1 = pAMol->getCrdArrayInd(aid1) * 3;
      m_sbonds[i].ind2 = pAMol->getCrdArrayInd(aid2) * 3;
    }
    else {
      m_sbonds[i].ind1 = 0;
      m_sbonds[i].ind2 = 0;
    }
    m_sbonds[i].vaind = iva;
    */
  }
#endif

  // finalize the coloring scheme
  getColSchm()->end();
  pCMol->getColSchm()->end();
}

void SimpleRenderer::updateDynamicGLSL()
{
  quint32 j = 0;
  quint32 i;
  
  MolCoordPtr pCMol = getClientMol();
  AnimMol *pAMol = static_cast<AnimMol *>(pCMol.get());
  
  qfloat32 *crd = pAMol->getAtomCrdArray();

  quint32 natoms = m_coordbuf.size()/3;
  quint32 ind;
  for (i=0; i<natoms; ++i) {
    ind = m_sels[i];
    for (j=0; j<3; ++j)
      m_coordbuf[i*3+j] = crd[ind+j];
  }

  //  m_pCoordTex->setData(natoms, &m_coordbuf[0]);

  int w, h;
  if (natoms<=1024) {
    w = natoms;
    h = 1;
  }
  else {
    w = 1024;
    h = natoms/1024 + 1;
  }

  m_pCoordTex->setData(w, h, &m_coordbuf[0]);

}

void SimpleRenderer::updateStaticGLSL()
{
  quint32 j = 0;
  quint32 i;
  
  MolCoordPtr pCMol = getClientMol();

  quint32 natoms = m_coordbuf.size()/3;
  for (i=0; i<natoms; ++i) {
    quint32 aid = m_sels[i];
    MolAtomPtr pAtom = pCMol->getAtom(aid);
    Vector4D pos = pAtom->getPos();

    m_coordbuf[i*3+0] = pos.x();
    m_coordbuf[i*3+1] = pos.y();
    m_coordbuf[i*3+2] = pos.z();
  }

  //m_pCoordTex->setData(natoms, &m_coordbuf[0]);

  int w, h;
  if (natoms<=1024) {
    w = natoms;
    h = 1;
  }
  else {
    w = 1024;
    h = natoms/1024 + 1;
  }
  m_pCoordTex->setData(w, h, &m_coordbuf[0]);
  MB_DPRINTLN("updateStaticGLSL texture(%d,%d)=%p OK", w, h, m_pCoordTex);
}

void SimpleRenderer::displayGLSL(DisplayContext *pdc)
{
  // new rendering routine using GLSL/VBO
  if (!m_bChkShaderDone)
    initShader(pdc);
  
  if (m_pAttrAry==NULL) {
    createGLSL();
    if (isUseAnim())
      updateDynamicGLSL();
    else
      updateStaticGLSL();
    
    if (m_pAttrAry==NULL)
      return; // Error, Cannot draw anything (ignore)
  }


  preRender(pdc);
  pdc->setLineWidth(m_lw);

  m_pCoordTex->use(0);
  m_pPO->enable();
  m_pPO->setUniformF("frag_alpha", pdc->getAlpha());
  pdc->drawElem(*m_pAttrAry);

  m_pPO->disable();
  m_pCoordTex->unuse();

  postRender(pdc);
}
