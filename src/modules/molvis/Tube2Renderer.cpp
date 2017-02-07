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

Tube2DS::~Tube2DS()
{
  if (m_pVBO!=NULL)
    delete m_pVBO;

  if (m_ptess!=NULL)
    delete static_cast<Tube2Renderer::Tess *>(m_ptess);
}

//////////

detail::DrawSegment *Tube2SS::createDrawSeg(int nstart, int nend)
{
  return (MB_NEW Tube2DS(nstart, nend));
}

Tube2SS::~Tube2SS()
{
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

void Tube2Renderer::createDisplayCache()
{
  if (!getPuttyMode()==TBR_PUTTY_OFF)
    initPuttyData();

  super_t::createDisplayCache();
}

void Tube2Renderer::setupVBO(detail::SplineSegment *pASeg)
{
  Tube2SS *pSeg = static_cast<Tube2SS *>(pASeg);
  //const int nDetail = getAxialDetail();
  //const int nSecDiv = getTubeSection()->getSize();

  // for spherical capping
  //const int nSphr = nSecDiv/2;//getAxialDetail();

  BOOST_FOREACH (DrawSegment *pelem, pSeg->m_draws) {
    Tube2DS &elem = *static_cast<Tube2DS*>(pelem);

    //const int nsplseg = elem.m_nEnd - elem.m_nStart;
    //const int nAxPts = nDetail * nsplseg + 1;
    //elem.m_nAxPts = nAxPts;
    
    int nVerts=0, nFaces=0;
    if (elem.m_ptess==NULL)
      elem.m_ptess = MB_NEW Tess();
    Tess *ptess = static_cast<Tess *>(elem.m_ptess);

    ptess->calcSize(this, pSeg, &elem, nVerts, nFaces);
    //ptess->calcSize(nAxPts, nSecDiv, getStartCapType(), getEndCapType(), isSmoothColor(),
    //nVerts, nFaces);

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

void Tube2Renderer::updateCrdVBO(detail::SplineSegment *pASeg)
{
  Tube2SS *pSeg = static_cast<Tube2SS *>(pASeg);
  TubeSectionPtr pTS = getTubeSection();
  const int nSecDiv = pTS->getSize();

  const float fDetail = float(getAxialDetail());

  BOOST_FOREACH (DrawSegment *pelem, pSeg->m_draws) {
    Tube2DS &elem = *static_cast<Tube2DS*>(pelem);

    Tess *ptess = static_cast<Tess *>(elem.m_ptess);
    ptess->setTarget(elem.m_pVBO);
    ptess->setVerts(this, pSeg, &elem, pTS.get());
    elem.m_pVBO->setUpdated(true);
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

/*
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
*/

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
        
        int nVerts, nFaces;
        //tess.calcSize(nAxPts, nSecDiv, getStartCapType(), getEndCapType(),isSmoothColor(),
        //nVerts, nFaces);
        tess.calcSize(this, pSeg, &elem, nVerts, nFaces);

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

void Tube2Renderer::initPuttyData()
{
  SelectionPtr pSel;
  MolCoordPtr pMol = getClientMol();

  pSel = getSelection();

  double dmin = 1.0e100, dmax = -1.0e100, val, dsum = 0.0;
  int nadd=0;
  ResidIterator iter(pMol, pSel);
  for (iter.first(); iter.hasMore(); iter.next()) {
    MolResiduePtr pRes = iter.get();
    MolAtomPtr pAtom = getPivotAtom(pRes);

    if (pAtom.isnull()) continue;
    
    if (m_nPuttyTgt==TBR_PUTTY_OCC)
      val = pAtom->getOcc();
    else
      val = pAtom->getBfac();
    
    dsum += val;
    dmin = qlib::min(dmin, val);
    dmax = qlib::max(dmax, val);
    ++nadd;
  }
  
  m_dParHi = dmax;
  m_dParLo = dmin;
  m_dParAver = dsum/double(nadd);

  MB_DPRINTLN("Tube> init high=%f, low=%f, aver=%f OK.", dmax, dmin, m_dParAver);
}

Vector2D Tube2Renderer::getEScl(const MolCoordPtr &pMol, Tube2SS *pSeg, float par) const
{
  const int npm = getPuttyMode();
  if (npm==TBR_PUTTY_OFF)
    return Vector2D(1,1);

  const float prod = 1.0f;
  const float plus = 0.0f;
  
  int nprev = int(floorf(par));
  int nnext = int(ceilf(par));
  float rho = par - float(nprev);
  
  MolAtomPtr pAtom1(pSeg->getAtom(pMol, nprev));
  MolAtomPtr pAtom2(pSeg->getAtom(pMol, nnext));

  float par1 = 1.0, par2 = 1.0;

  if (!pAtom1.isnull()) {
    if (m_nPuttyTgt==TBR_PUTTY_OCC)
      par1 = pAtom1->getOcc();
    else
      par1 = pAtom1->getBfac();

  }
  if (!pAtom2.isnull()) {
    if (m_nPuttyTgt==TBR_PUTTY_OCC)
      par2 = pAtom2->getOcc();
    else
      par2 = pAtom2->getBfac();
  }
      
  // linear interpolation between two residues (if exists)
  float val;
  if (rho<F_EPS4)
    val = par1;
  else if (1.0-F_EPS4<rho)
    val = par2;
  else
    val = par1 * (1.0-rho) + par2 * rho;

  // convert val to scaling factor
  if (npm==TBR_PUTTY_LINEAR1) {
    // linear conversion
    val = (val-m_dParLo)/(m_dParHi-m_dParLo);
    val = (m_dPuttyScl-1.0/m_dPuttyLoScl)*val + 1.0/m_dPuttyLoScl;
  }
  else if (npm==TBR_PUTTY_SCALE1) {
    // multiplication conversion 1
    // scale val to (1/Nlo -- 1.0 -- Nhi) for (min -- aver -- max)
    if (val<m_dParAver) {
      val = (val-m_dParLo)/(m_dParAver-m_dParLo);
      // val = ::pow(m_dPuttyLoScl, val-1.0);
      val = ((m_dPuttyLoScl-1)*val+1.0)/m_dPuttyLoScl;
    }
    else {
      val = (val-m_dParAver)/(m_dParHi-m_dParAver);
      // val = ::pow(m_dPuttyScl, val);
      val = (m_dPuttyScl-1.0)*val + 1.0;
    }
  }
  else {
    // ERROR
    MB_ASSERT(false);
  }
  
  return Vector2D(val, val);
}


int Tube2Renderer::getCapTypeImpl(detail::SplineSegment *pSeg, detail::DrawSegment *pDS, bool bStart)
{
  int nCap = super_t::getCapTypeImpl(pSeg, pDS, bStart);
  if (nCap==CAP_FLAT) {
    if (m_pts->getType()==TubeSection::TS_MOLSCR)
      return XCAP_MSFLAT;
  }

  return nCap;
}

