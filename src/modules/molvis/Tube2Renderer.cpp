// -*-Mode: C++;-*-
//
//  Tube renderer class ver2
//

#include <common.h>
#include "molvis.hpp"

#include "Tube2Renderer.hpp"

#include <qsys/SceneManager.hpp>

#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/MolChain.hpp>
#include <modules/molstr/MolResidue.hpp>
#include <modules/molstr/ResidIterator.hpp>
#include <modules/molstr/AnimMol.hpp>

using namespace molvis;
using namespace molstr;
using qlib::Matrix3D;
using detail::DrawSegment;

detail::DrawSegment *Tube2SS::createDrawSeg(int nstart, int nend)
{
  return (MB_NEW Tube2DS(nstart, nend));
}

Tube2SS::~Tube2SS()
{
}

//////////

Tube2DS::~Tube2DS()
{
  if (m_pVBO!=NULL)
    delete m_pVBO;
}

//////////////////////////////////////////////////////////////

Tube2Renderer::Tube2Renderer()
     : super_t(), m_pts(MB_NEW TubeSection())
{
  super_t::setupParentData("section");
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

void Tube2Renderer::createSegList()
{
  if (!m_pts->isValid())
    m_pts->setupSectionTable();

  super_t::createSegList();
}

SplineSegment *Tube2Renderer::createSegment()
{
  return MB_NEW Tube2SS();
}

void Tube2Renderer::setupVBO(detail::SplineSegment *pASeg)
{
  Tube2SS *pSeg = static_cast<Tube2SS *>(pASeg);
  const int nDetail = getAxialDetail();
  const int nSecDiv = getTubeSection()->getSize();

  BOOST_FOREACH (DrawSegment *pelem, pSeg->m_draws) {
    Tube2DS &elem = *static_cast<Tube2DS*>(pelem);

    const int nsplseg = elem.m_nEnd - elem.m_nStart;
    const int nAxPts = nDetail * nsplseg + 1;
    elem.m_nAxPts = nAxPts;
    const int nVA = nAxPts * nSecDiv;
// elem.m_nVA = nVA;
    
    // TO DO: multiple vertex generation for discontinuous color point

    Tube2DS::VertArray *pVBO = elem.m_pVBO;
    if (pVBO!=NULL)
      delete pVBO;
    
    elem.m_pVBO = pVBO = MB_NEW Tube2DS::VertArray();
    pVBO->alloc(nVA);

    // generate indices
    int nfaces = nSecDiv * (nAxPts-1) * 2;
    pVBO->allocIndex(nfaces*3);
    int i, j, ind=0;
    int ij, ijp, ipj, ipjp;
    for (i=0; i<nAxPts-1; ++i) {
      int irow = i*nSecDiv;
      for (j=0; j<nSecDiv; ++j) {
        ij = irow + j;
        ipj = ij + nSecDiv;
        ijp = irow + (j+1)%nSecDiv;
        ipjp = irow + nSecDiv + (j+1)%nSecDiv;
        pVBO->setIndex3(ind, ij, ijp, ipjp);
        ++ind;
        pVBO->setIndex3(ind, ipjp, ipj, ij);
        ++ind;
      }
    }

    pVBO->setDrawMode(gfx::DrawElem::DRAW_TRIANGLES);
    LOG_DPRINTLN("Tube2DS> %d elems VBO created", nVA);
  }
}

void Tube2Renderer::updateCrdVBO(detail::SplineSegment *pASeg)
{
  Tube2SS *pSeg = static_cast<Tube2SS *>(pASeg);
  TubeSectionPtr pTS = getTubeSection();
  const int nSecDiv = pTS->getSize();
  CubicSpline *pAxInt = pSeg->getAxisIntpol();
  // CubicSpline *pBnInt = pseg->getBinormIntpol();

  int i, j;
  float par, fStart;
  const float fDetail = float(getAxialDetail());

  Vector3F pos, binorm, bpos;
  Vector3F v0, e0, v1, e1, v2, e2;
  Vector3F g, dg;
  Tube2DS::VertArray *pVBO;

  BOOST_FOREACH (DrawSegment *pelem, pSeg->m_draws) {
    Tube2DS &elem = *static_cast<Tube2DS*>(pelem);

    pVBO = elem.m_pVBO;
    fStart = float(elem.m_nStart);
    const int nAxPts = elem.m_nAxPts;
  
    for (i=0; i<nAxPts; ++i) {
      par = float(i)/fDetail + fStart;
      pAxInt->interpolate(par, &pos, &v0);
      binorm = pSeg->intpolLinBn(par);
      
      float v0len = v0.length();
      e0 = v0.divide(v0len);
      
      v2 = binorm - e0.scale(e0.dot(binorm));
      e2 = v2.normalize();
      e1 = e2.cross(e0);
      
      for (j=0; j<nSecDiv; ++j) {
        const Vector4D &stab = pTS->getSectTab(j);
        g = e1.scale( stab.x() ) + e2.scale( stab.y() );
        dg = e1.scale( stab.z() ) + e2.scale( stab.w() );
        int ind = i*nSecDiv + j;
        pVBO->vertex3f(ind, pos + g);
        pVBO->normal3f(ind, dg);
      }
    }
    
    pVBO->setUpdated(true);
  }
}

void Tube2Renderer::updateColorVBO(detail::SplineSegment *pASeg)
{
  Tube2SS *pSeg = static_cast<Tube2SS *>(pASeg);
  MolCoordPtr pCMol = getClientMol();

  int i, j;
  int nSecDiv = getTubeSection()->getSize();

  float par;
  float fdetail = float(getAxialDetail());

  quint32 dcc;

  Tube2DS::VertArray *pVBO;

  BOOST_FOREACH (DrawSegment *pelem, pSeg->m_draws) {
    Tube2DS &elem = *static_cast<Tube2DS*>(pelem);

    pVBO = elem.m_pVBO;
    float fstart = float(elem.m_nStart);
    int nAxPts = elem.m_nAxPts;
    
    for (i=0; i<nAxPts; ++i) {
      par = float(i)/fdetail + fstart;
      dcc = pSeg->calcColor(this, pCMol, par);
      for (j=0; j<nSecDiv; ++j) {
        int ind = i*nSecDiv + j;
        pVBO->color(ind, dcc);
      }
    }
  }
}

void Tube2Renderer::drawVBO(detail::SplineSegment *pASeg, DisplayContext *pdc)
{
  Tube2SS *pSeg = static_cast<Tube2SS *>(pASeg);

  BOOST_FOREACH (DrawSegment *pelem, pSeg->m_draws) {
    Tube2DS &elem = *static_cast<Tube2DS*>(pelem);
    pdc->drawElem(*elem.m_pVBO);
  }
}

//////////

void Tube2Renderer::propChanged(qlib::LPropEvent &ev)
{
  if (ev.getParentName().equals("section")||
      ev.getParentName().startsWith("section.")) {
    invalidateDisplayCache();
  }

  super_t::propChanged(ev);
}

void Tube2Renderer::objectChanged(qsys::ObjectEvent &ev)
{
  if (isVisible() &&
      (ev.getType()==qsys::ObjectEvent::OBE_CHANGED_DYNAMIC||
       ev.getType()==qsys::ObjectEvent::OBE_CHANGED) &&
      ev.getDescr().equals("atomsMoved")) {
    // OBE_CHANGED_DYNAMIC && descr=="atomsMoved"
    if (isUseAnim()) {
      // only update positions
      updateCrdDynamic();
      return;
    }
  }

  super_t::objectChanged(ev);
}

