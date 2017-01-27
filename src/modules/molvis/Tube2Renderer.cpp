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

  if (m_ptess!=NULL)
    delete static_cast<Tube2Renderer::Tess *>(m_ptess);
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
  pdc->setPolygonMode(DisplayContext::POLY_FILL_NORGLN);
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

  // for spherical capping
  const int nSphr = nSecDiv/2;//getAxialDetail();

  BOOST_FOREACH (DrawSegment *pelem, pSeg->m_draws) {
    Tube2DS &elem = *static_cast<Tube2DS*>(pelem);

    const int nsplseg = elem.m_nEnd - elem.m_nStart;
    const int nAxPts = nDetail * nsplseg + 1;
    elem.m_nAxPts = nAxPts;
    
    int nVerts=0, nFaces=0;
    if (elem.m_ptess==NULL)
      elem.m_ptess = MB_NEW Tess();
    Tess *ptess = static_cast<Tess *>(elem.m_ptess);
    ptess->calcSize(nAxPts, nSecDiv, getStartCapType(), getEndCapType(),
                    nVerts, nFaces);

    Tube2DS::VertArray *pVBO = elem.m_pVBO;
    if (pVBO!=NULL)
      delete pVBO;
    
    elem.m_pVBO = pVBO = MB_NEW Tube2DS::VertArray();
    pVBO->setDrawMode(gfx::DrawElem::DRAW_TRIANGLES);
    pVBO->alloc(nVerts);
    pVBO->allocIndex((nFaces)*3);
    LOG_DPRINTLN("Tube2Rend> %d/%d elems VBO created", nVerts, nFaces);

    ptess->setTarget(pVBO);
    ptess->makeIndex(this, pSeg, &elem);

  }
}

void Tube2Renderer::updateCrdVBO(detail::SplineSegment *pASeg)
{
  Tube2SS *pSeg = static_cast<Tube2SS *>(pASeg);
  TubeSectionPtr pTS = getTubeSection();
  const int nSecDiv = pTS->getSize();
  // CubicSpline *pAxInt = pSeg->getAxisIntpol();
  // CubicSpline *pBnInt = pseg->getBinormIntpol();

  const float fDetail = float(getAxialDetail());

  Vector3F pos, binorm, bpos;
  Vector3F v0, e0, v1, e1, v2, e2;
  Vector3F g, dg;
//  Tube2DS::VertArray *pVBO;

  BOOST_FOREACH (DrawSegment *pelem, pSeg->m_draws) {
    Tube2DS &elem = *static_cast<Tube2DS*>(pelem);

    Tess *ptess = static_cast<Tess *>(elem.m_ptess);
    ptess->setTarget(elem.m_pVBO);
    ptess->setVerts(this, pSeg, &elem, pTS.get());
    elem.m_pVBO->setUpdated(true);

  }
}

void Tube2Renderer::updateColorVBO(detail::SplineSegment *pASeg)
{
  Tube2SS *pSeg = static_cast<Tube2SS *>(pASeg);
  MolCoordPtr pCMol = getClientMol();

  int nSecDiv = getTubeSection()->getSize();

  float fdetail = float(getAxialDetail());


  BOOST_FOREACH (DrawSegment *pelem, pSeg->m_draws) {
    Tube2DS &elem = *static_cast<Tube2DS*>(pelem);

    Tess *ptess = static_cast<Tess *>(elem.m_ptess);
    ptess->setTarget(elem.m_pVBO);
    ptess->setColors(pCMol, this, pSeg, &elem);

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

void Tube2Renderer::renderFile(DisplayContext *pdc)
{
  TubeSectionPtr pTS = getTubeSection();
  MolCoordPtr pCMol = getClientMol();

  const int nDetail = getAxialDetail();
  const int nSecDiv = pTS->getSize();

  BOOST_FOREACH (SplineSegment *pelem, m_seglist) {
    if (pelem->getSize()>0) {
      Tube2SS *pSeg = static_cast<Tube2SS *>(pelem);
      
      BOOST_FOREACH (DrawSegment *pDS, pSeg->m_draws) {
        Tube2DS &elem = *static_cast<Tube2DS*>(pDS);

        TubeTess<Tube2Renderer,Tube2Renderer::SplSeg,Tube2Renderer::DrawSeg,gfx::DrawFileVNCI> tess;
        
        const int nsplseg = elem.m_nEnd - elem.m_nStart;
        const int nAxPts = nDetail * nsplseg + 1;
        elem.m_nAxPts = nAxPts;

        int nVerts, nFaces;
        tess.calcSize(nAxPts, nSecDiv, getStartCapType(), getEndCapType(),
                      nVerts, nFaces);

        gfx::DrawFileVNCI vbo;
        vbo.setDrawMode(gfx::DrawElem::DRAW_TRIANGLES);
        vbo.alloc(nVerts);
        vbo.allocIndex((nFaces)*3);
        LOG_DPRINTLN("Tube2Rend> %d/%d elems file VBO created", nVerts, nFaces);

        tess.setTarget(&vbo);
        tess.makeIndex(this, pSeg, &elem);
        tess.setVerts(this, pSeg, &elem, pTS.get());
        tess.setColors(pCMol, this, pSeg, &elem);

        //pdc->drawElem(vbo);
        pdc->drawMesh(*vbo.getMesh());
      }
    }
  }

}

