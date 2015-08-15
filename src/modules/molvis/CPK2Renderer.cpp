// -*-Mode: C++;-*-
//
//  CPK molecular renderer class (version 2)
//

#include <common.h>
#include "molvis.hpp"
#include <gfx/SphereSet.hpp>
#include <qsys/View.hpp>
#include <qsys/Scene.hpp>
#include <modules/molstr/AtomIterator.hpp>

#include "CPK2Renderer.hpp"

using namespace molvis;
using namespace molstr;

CPK2Renderer::CPK2Renderer()
{
  m_pDrawElem = NULL;
  m_pPO = NULL;
  m_bUseShader = false;

  m_nVBO = 0;
  m_nVBO_ind = 0;
}

CPK2Renderer::~CPK2Renderer()
{
}

const char *CPK2Renderer::getTypeName() const
{
  return "cpk2";
}

/////////

void CPK2Renderer::display(DisplayContext *pdc)
{
  if (m_bUseShader) {
    if (m_nVBO==0) {
      renderShaderImpl();
      if (m_nVBO==0)
	return; // Error, Cannot draw anything (ignore)
    }
    
    preRender(pdc);
    m_pPO->enable();
    drawShaderImpl();
    m_pPO->disable();
    postRender(pdc);
  }
  else if (pdc->isDrawElemSupported()) {
    if (m_pDrawElem==NULL) {
      renderVBOImpl();
      if (m_pDrawElem==NULL)
	return; // Error, Cannot draw anything (ignore)
    }
    
    preRender(pdc);
    pdc->drawElem(*m_pDrawElem);
    postRender(pdc);
  }
  else {
    // old version (uses DisplayContext::sphere)
    super_t::display(pdc);
  }
}

void CPK2Renderer::invalidateDisplayCache()
{
  if (m_pDrawElem!=NULL) {
    delete m_pDrawElem;
    m_pDrawElem = NULL;
  }
}

/////////

void CPK2Renderer::renderVBOImpl()
{
  MolCoordPtr pMol = getClientMol();
  if (pMol.isnull()) {
    MB_DPRINTLN("CPK2Renderer::render> Client mol is null");
    return;
  }

  // estimate the size of drawing elements
  int nsphs=0;
  {
    AtomIterator iter(pMol, getSelection());
    for (iter.first(); iter.hasMore(); iter.next()) {
      int aid = iter.getID();
      MolAtomPtr pAtom = pMol->getAtom(aid);
      if (pAtom.isnull()) continue; // ignore errors
      ++nsphs;
    }
  }
  
  if (nsphs==0)
    return; // nothing to draw
  
  gfx::SphereSet sphs;
  sphs.create(nsphs, m_nDetail);

  // build meshes / DrawElemVNCI
  {
    AtomIterator iter(pMol, getSelection());
    int i=0;
    for (iter.first(); iter.hasMore(); iter.next()) {
      int aid = iter.getID();
      MolAtomPtr pAtom = pMol->getAtom(aid);
      if (pAtom.isnull()) continue; // ignore errors

      sphs.sphere(i, pAtom->getPos(),
                  getVdWRadius(pAtom),
                  ColSchmHolder::getColor(pAtom));
      ++i;
    }
  }

  m_pDrawElem = sphs.buildDrawElem();
}

/////////

bool CPK2Renderer::isRendBond() const
{
  return false;
}

void CPK2Renderer::rendBond(DisplayContext *pdl, MolAtomPtr pAtom1, MolAtomPtr pAtom2, MolBond *pMB)
{
}

void CPK2Renderer::beginRend(DisplayContext *pdl)
{
  m_nDetailOld = pdl->getDetail();
  setupDetail(pdl, m_nDetail);
}

void CPK2Renderer::endRend(DisplayContext *pdl)
{
  pdl->setDetail(m_nDetailOld);
}

void CPK2Renderer::rendAtom(DisplayContext *pdl, MolAtomPtr pAtom, bool)
{
  pdl->color(ColSchmHolder::getColor(pAtom));
  pdl->sphere(getVdWRadius(pAtom), pAtom->getPos());
}

double CPK2Renderer::getVdWRadius(MolAtomPtr pAtom)
{

  switch (pAtom->getElement()) {
  case ElemSym::H:
    return m_vdwr_H;

  case ElemSym::C:
    return m_vdwr_C;

  case ElemSym::N:
    return m_vdwr_N;
    
  case ElemSym::O:
    return m_vdwr_O;
    
  case ElemSym::S:
    return m_vdwr_S;
    
  case ElemSym::P:
    return m_vdwr_P;
    
  default:
    return m_vdwr_X;
  }
}

void CPK2Renderer::propChanged(qlib::LPropEvent &ev)
{
  if (ev.getName().equals("detail")) {
    invalidateDisplayCache();
  }
  else if (ev.getName().startsWith("vdwr_")) {
    invalidateDisplayCache();
  }
  else if (ev.getParentName().equals("coloring")||
      ev.getParentName().startsWith("coloring.")) {
    invalidateDisplayCache();
  }

  MolAtomRenderer::propChanged(ev);
}

///////////////////

void CPK2Renderer::setSceneID(qlib::uid_t nid)
{
  super_t::setSceneID(nid);
  if (nid==qlib::invalid_uid)
    return;

  initShader();
}

void CPK2Renderer::initShader()
{
  MB_DPRINTLN("CPK2Renderer::initShader");
  if (!qsys::View::hasVBO() || !qsys::View::hasVS()) {
    MB_DPRINTLN("GLShader not supported");
    m_bUseShader = false;
    return;
  }

  // get GL context
  sysdep::OglDisplayContext *pOglDC = NULL;
  qsys::ScenePtr pScene = getScene();
  qsys::Scene::ViewIter vi = pScene->beginView();
  qsys::Scene::ViewIter vie = pScene->endView();
  for (; vi!=vie; ++vi) {
    qsys::ViewPtr pView = vi->second;
    gfx::DisplayContext *pDC = pView->getDisplayContext();
    pDC->setCurrent();
    pOglDC = dynamic_cast<sysdep::OglDisplayContext *>(pDC);
    if (pOglDC!=NULL)
      break;
  }

  if (pOglDC==NULL) {
    m_bUseShader = false;
    return;
  }

  // setup shaders
  bool res;
  if (m_pPO==NULL) {
    m_pPO = pOglDC->getProgramObject("gpu_sphere");

    if (m_pPO==NULL) {
      m_pPO = pOglDC->createProgramObject("gpu_sphere");
      if (m_pPO==NULL) {
        LOG_DPRINTLN("GPUSphere> ERROR: cannot create progobj.");
	m_bUseShader = false;
        return;
      }

      try {
	m_pPO->loadShader("vert",
			  "%%CONFDIR%%/data/shaders/sphere_vertex.glsl",
			  GL_VERTEX_SHADER);
	m_pPO->loadShader("frag",
			  "%%CONFDIR%%/data/shaders/sphere_frag.glsl",
			  GL_FRAGMENT_SHADER);
	m_pPO->link();
      }
      catch (...) {
	LOG_DPRINTLN("FATAL ERROR: loadShader failed!!");
	m_pPO = NULL;
	m_bUseShader = false;
	return;
      }

      //m_pPO->enable();
      //m_pPO->disable();
    }
  }
  
  // setup attributes
  m_nVertexLoc = glGetAttribLocation(m_pPO->getHandle(), "a_vertex");
  m_nImposLoc = glGetAttribLocation(m_pPO->getHandle(), "a_impos");
  m_nRadLoc = glGetAttribLocation(m_pPO->getHandle(), "a_radius");
  m_nColLoc = glGetAttribLocation(m_pPO->getHandle(), "a_color");

  MB_DPRINTLN("CPK2 sphere shader OK");
  m_bUseShader = true;
}

namespace {
  struct SphElem {
    qfloat32 cenx, ceny, cenz;
    qfloat32 dspx, dspy;
    qfloat32 rad;
    qbyte r, g, b, a;
  };
}

void CPK2Renderer::renderShaderImpl()
{
  MolCoordPtr pMol = getClientMol();
  if (pMol.isnull()) {
    MB_DPRINTLN("CPK2Renderer::render> Client mol is null");
    return;
  }

  // estimate the size of drawing elements
  int nsphs=0;
  {
    AtomIterator iter(pMol, getSelection());
    for (iter.first(); iter.hasMore(); iter.next()) {
      int aid = iter.getID();
      MolAtomPtr pAtom = pMol->getAtom(aid);
      if (pAtom.isnull()) continue; // ignore errors
      ++nsphs;
    }
  }
  
  if (nsphs==0)
    return; // nothing to draw
  
  qfloat32 dsps[4][2] = {
    {-1.0f, -1.0f},
    { 1.0f, -1.0f},
    {-1.0f,  1.0f},
    { 1.0f,  1.0f},
  };
  
  SphElem *pdata = MB_NEW SphElem[nsphs*4];
  quint16 *pind = MB_NEW quint16[nsphs*6];

  {
    AtomIterator iter(pMol, getSelection());
    int i=0, j, ifc=0;
    Vector4D pos;
    for (iter.first(); iter.hasMore(); iter.next()) {
      int aid = iter.getID();
      MolAtomPtr pAtom = pMol->getAtom(aid);
      if (pAtom.isnull()) continue; // ignore errors
      ColorPtr &pc = ColSchmHolder::getColor(pAtom);

      SphElem data;
      pos = pAtom->getPos();
      data.cenx = (qfloat32) pos.x();
      data.ceny = (qfloat32) pos.y();
      data.cenz = (qfloat32) pos.z();
      data.rad = (qfloat32) getVdWRadius(pAtom);
      data.r = (qbyte) pc->r();
      data.g = (qbyte) pc->g();
      data.b = (qbyte) pc->b();
      data.a = (qbyte) pc->a();

      pind[ifc] = i + 0; ++ifc;
      pind[ifc] = i + 1; ++ifc;
      pind[ifc] = i + 2; ++ifc;
      pind[ifc] = i + 2; ++ifc;
      pind[ifc] = i + 1; ++ifc;
      pind[ifc] = i + 3; ++ifc;

      for (j=0; j<4; ++j) {
	pdata[i] = data;
	pdata[i].dspx = dsps[j][0];
	pdata[i].dspy = dsps[j][1];
	++i;
      }


    }
  }

  glGenBuffers(1, &m_nVBO);
  glBindBuffer(GL_ARRAY_BUFFER, m_nVBO);
  glBufferData(GL_ARRAY_BUFFER, sizeof(SphElem)*nsphs*4, pdata, GL_STATIC_DRAW);
  glBindBuffer(GL_ARRAY_BUFFER, 0); 
  
  glGenBuffers(1, &m_nVBO_ind);
  glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, m_nVBO_ind);
  glBufferData(GL_ELEMENT_ARRAY_BUFFER, sizeof(quint16)*nsphs*6, pind, GL_STATIC_DRAW);
  glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, 0); 

  delete [] pdata;
  delete [] pind;
  m_nIndSize = nsphs*6;

  MB_DPRINTLN("RenderShader nsphs=%d", nsphs);
  MB_DPRINTLN("RenderShader ninds=%d", m_nIndSize);
}

void CPK2Renderer::drawShaderImpl()
{
  glColor3f(1.0f, 1.0f, 1.0f);

  glBindBuffer(GL_ARRAY_BUFFER, m_nVBO);

  glVertexAttribPointer(m_nVertexLoc, 3, GL_FLOAT, GL_FALSE,
			sizeof(SphElem), 0);
  glVertexAttribPointer(m_nImposLoc, 2, GL_FLOAT, GL_FALSE,
			sizeof(SphElem), (void*)(sizeof(qfloat32)*3));
  glVertexAttribPointer(m_nRadLoc, 1, GL_FLOAT, GL_FALSE,
			sizeof(SphElem), (void*)(sizeof(qfloat32)*(3 + 2)));
  glVertexAttribPointer(m_nColLoc, 4, GL_UNSIGNED_BYTE, GL_TRUE,
                        sizeof(SphElem), (void*)(sizeof(qfloat32)*(3 + 2 + 1)));
  glEnableVertexAttribArray(m_nVertexLoc);
  glEnableVertexAttribArray(m_nImposLoc);
  glEnableVertexAttribArray(m_nRadLoc);
  glEnableVertexAttribArray(m_nColLoc);

  glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, m_nVBO_ind);
  glDrawElements(GL_TRIANGLES, m_nIndSize, GL_UNSIGNED_SHORT, 0);

  glDisableVertexAttribArray(m_nVertexLoc);
  glDisableVertexAttribArray(m_nImposLoc);
  glDisableVertexAttribArray(m_nRadLoc);
  glDisableVertexAttribArray(m_nColLoc);

  glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, 0); 
  glBindBuffer(GL_ARRAY_BUFFER, 0); 
}
