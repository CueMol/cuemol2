// -*-Mode: C++;-*-
//
//  CPK molecular renderer class
//
// $Id: CPKRenderer.cpp,v 1.6 2011/03/29 11:03:44 rishitani Exp $

#include <common.h>
#include "molvis.hpp"

#include "CPK3Renderer.hpp"

#include <gfx/SphereSet.hpp>
#include <gfx/DrawAttrArray.hpp>

#include <modules/molstr/AtomIterator.hpp>
#include <modules/molstr/AnimMol.hpp>

using namespace molvis;
using namespace molstr;

CPK3Renderer::CPK3Renderer()
{
  m_pVBO = NULL;
  m_pTmpl = NULL;
}

CPK3Renderer::~CPK3Renderer()
{
}

const char *CPK3Renderer::getTypeName() const
{
  return "cpk";
}

bool CPK3Renderer::isUseVer2Iface() const
{
  return true;
}

/////////

bool CPK3Renderer::isRendBond() const
{
  return false;
}

// void CPK3Renderer::rendBond(DisplayContext *pdl, MolAtomPtr pAtom1, MolAtomPtr pAtom2, MolBond *pMB)
// {
// }

void CPK3Renderer::beginRend(DisplayContext *pdl)
{
  pdl->setDetail(m_nDetail);
}

// void CPK3Renderer::endRend(DisplayContext *pdl)
// {
// }

void CPK3Renderer::rendAtom(DisplayContext *pdl, MolAtomPtr pAtom, bool)
{
  pdl->color(ColSchmHolder::getColor(pAtom));
  pdl->sphere(getVdWRadius(pAtom), pAtom->getPos());
}

double CPK3Renderer::getVdWRadius(MolAtomPtr pAtom) const
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

void CPK3Renderer::propChanged(qlib::LPropEvent &ev)
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

///////////////////////////////////////////////////////////

namespace {

  class SingleTrait
  {
  private:
    
    typedef gfx::SphereTess<SingleTrait> outer_t;

    /// output vertex array
    gfx::DrawElemVNCI32 *m_pVary;

  public:
    SingleTrait() : m_pVary(NULL)
    {
    }
    
    ~SingleTrait()
    {
    }

    /////////////////////////////

    void setColor(const ColorPtr &col)
    {
    }

    void normal(quint32 ind, const Vector4D &v)
    {
      m_pVary->normal(ind, v);
    }

    void vertex(quint32 ind, const Vector4D &v)
    {
      m_pVary->vertex(ind, v);
    }

    void face(quint32 ifc, quint32 n1, quint32 n2, quint32 n3)
    {
      m_pVary->setIndex3(ifc, n1, n2, n3);
    }

    Vector4D getVertex(quint32 ind) const {
      Vector4D rv;
      m_pVary->getVertex(ind, rv);
      return rv;
    }

    /// build draw elem objects
    gfx::DrawElemVNCI32 *buildDrawElem(outer_t *pOuter)
    {
      int nverts, nfaces;
      pOuter->estimateMeshSize(nverts, nfaces);
      
      // Create DrawElemVNCI (or VNI?) object
      m_pVary = MB_NEW gfx::DrawElemVNCI32();
	  m_pVary->startIndexTriangles(nverts, nfaces);
      
      int ivt = 0, ifc = 0;
      pOuter->buildSphere(0, ivt, ifc);

      return m_pVary;
    }

  };
}

/// Create VBO
void CPK3Renderer::createVBO()
{

  MolCoordPtr pMol = getClientMol();
  if (pMol.isnull()) {
    MB_DPRINTLN("CPK3Renderer::createVBO> Client mol is null");
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
  
  m_aidvec.resize(nsphs);
  m_radvec.resize(nsphs);
  {
    int i=0;
    AtomIterator iter(pMol, getSelection());
    for (iter.first(); iter.hasMore(); iter.next(),i++) {
      int aid = iter.getID();
      MolAtomPtr pAtom = pMol->getAtom(aid);
      if (pAtom.isnull()) continue; // ignore errors
      
      m_radvec[i] = (float) getVdWRadius(pAtom);
      m_aidvec[i] = aid;
    }
  }

  gfx::SphereTess<SingleTrait> sphs;

  sphs.create(1, m_nDetail);

  sphs.getSphrs().sphere(0, Vector4D(0,0,0),
                        1.0, ColorPtr());

  m_pTmpl = sphs.getTrait().buildDrawElem(&sphs);

  int nverts = m_pTmpl->getSize();
  int nfaces = m_pTmpl->getIndSize();

  int nvtot = nverts * nsphs;
  int nftot = nfaces * nsphs;

  m_pVBO = MB_NEW gfx::DrawElemVNCI32();
  m_pVBO->setDrawMode(gfx::DrawElem::DRAW_TRIANGLES);
  m_pVBO->alloc(nvtot);
  m_pVBO->allocIndex(nftot);

  int ind = 0;
  for (int i=0; i<nsphs; ++i) {
    int ivbase = i * nverts;
    for (int j=0; j<nfaces; ++j,++ind) {
      m_pVBO->setIndex(ind, ivbase + m_pTmpl->getIndex(j));
    }
    for (int j=0; j<nverts; ++j) {
      m_pVBO->normal3f(j+ivbase, m_pTmpl->getNormal(j));
    }
  }

  m_nSphs = nsphs;
}

/// update VBO positions (using CrdArray)
void CPK3Renderer::updateDynamicVBO()
{
  MolCoordPtr pCMol = getClientMol();
  AnimMol *pAMol = static_cast<AnimMol *>(pCMol.get());
  
  qfloat32 *crd = pAMol->getAtomCrdArray();

  const int nsphs = m_nSphs;
  const int nverts = m_pTmpl->getSize();
  const int nfaces = m_pTmpl->getIndSize();

  Vector3F pos, del;
  for (int i=0; i<nsphs; ++i) {
    int ivbase = i * nverts;
    int aid = m_aidvec[i];
    float rad = m_radvec[i];
    pos.set(&crd[aid]);
    for (int j=0; j<nverts; ++j) {
      m_pVBO->vertex3f(j+ivbase, pos + m_pTmpl->getVertex(j).scale(rad));
    }
  }
}

/// update VBO positions (using MolAtom)
void CPK3Renderer::updateStaticVBO()
{
  MolCoordPtr pCMol = getClientMol();
  MolAtomPtr pA1;

  const int nsphs = m_nSphs;
  const int nverts = m_pTmpl->getSize();
  const int nfaces = m_pTmpl->getIndSize();

  Vector3F pos, del;
  for (int i=0; i<nsphs; ++i) {
    int ivbase = i * nverts;
    int aid = m_aidvec[i];
    pA1 = pCMol->getAtom(aid);
    pos = Vector3F( pA1->getPos().xyz() );
    float rad = m_radvec[i];
    for (int j=0; j<nverts; ++j) {
      m_pVBO->vertex3f(j+ivbase, pos + m_pTmpl->getVertex(j).scale(rad));
    }
  }
}

/// update VBO colors
void CPK3Renderer::updateVBOColor()
{
  MolCoordPtr pMol = getClientMol();
  qlib::uid_t nSceneID = pMol->getSceneID();
  if (pMol.isnull()) {
    MB_DPRINTLN("CPK3Renderer::createVBO> Client mol is null");
    return;
  }

  const int nsphs = m_nSphs;
  const int nverts = m_pTmpl->getSize();
  const int nfaces = m_pTmpl->getIndSize();

  MolAtomPtr pA1;
  quint32 cc1;

  // initialize the coloring scheme
  startColorCalc(pMol);

  for (int i=0; i<nsphs; ++i) {
    int ivbase = i * nverts;
    int aid = m_aidvec[i];
    pA1 = pMol->getAtom(aid);

    //cc1 = ColSchmHolder::getColor(pA1)->getCode();
    cc1 = ColSchmHolder::getColor(pA1)->getDevCode(nSceneID);

    for (int j=0; j<nverts; ++j) {
      m_pVBO->color(j+ivbase, cc1);
    }
  }

  // finalize the coloring scheme
  endColorCalc(pMol);
}

/// cleanup VBO
void CPK3Renderer::invalidateDisplayCache()
{
  super_t::invalidateDisplayCache();
  
  if (m_pTmpl!=NULL) {
    delete m_pTmpl;
    m_pTmpl = NULL;
  }

  if (m_pVBO!=NULL) {
    delete m_pVBO;
    m_pVBO = NULL;
  }

  //m_aidvec.clear();
}

/// Draw VBO
void CPK3Renderer::renderVBO(DisplayContext *pdc)
{
  pdc->drawElem(*m_pVBO);
}

