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

  // for spherical capping
  const int nSphr = getAxialDetail();

  BOOST_FOREACH (DrawSegment *pelem, pSeg->m_draws) {
    Tube2DS &elem = *static_cast<Tube2DS*>(pelem);

    const int nsplseg = elem.m_nEnd - elem.m_nStart;
    const int nAxPts = nDetail * nsplseg + 1;
    elem.m_nAxPts = nAxPts;
    const int nVA = nAxPts * nSecDiv;
    const int nfaces = nSecDiv * (nAxPts-1) * 2;
    
    int nStCapVerts;
    int nStCapFaces;

    // Start capping
    if (getStartCapType()==CAP_SPHR) {
      // spherical cap
      nStCapVerts = nSphr*nSecDiv +1;
      nStCapFaces = (nSphr-1)*nSecDiv*2 + nSecDiv;
    }
    else {
      // flat cap
      nStCapVerts = nSecDiv + 1;
      nStCapFaces = nSecDiv;
    }

    int nEnCapVerts;
    int nEnCapFaces;

    // End capping
    if (getEndCapType()==CAP_SPHR) {
      // spherical cap
      nEnCapVerts = nSphr*nSecDiv +1;
      nEnCapFaces = (nSphr-1)*nSecDiv*2 + nSecDiv;
    }
    else {
      // flat cap
      nEnCapVerts = nSecDiv + 1;
      nEnCapFaces = nSecDiv;
    }

    // TO DO: multiple vertex generation for discontinuous color point

    Tube2DS::VertArray *pVBO = elem.m_pVBO;
    if (pVBO!=NULL)
      delete pVBO;
    
    elem.m_pVBO = pVBO = MB_NEW Tube2DS::VertArray();
    pVBO->setDrawMode(gfx::DrawElem::DRAW_TRIANGLES);
    pVBO->alloc(nVA + nStCapVerts + nEnCapVerts);
    pVBO->allocIndex((nfaces + nStCapFaces + nEnCapFaces)*3);

    // generate indices
    int i, j, ind=0;
    int ij, ijp, ipj, ipjp;
    int ibase = 0, irow;

    // body
    for (i=0; i<nAxPts-1; ++i) {
      irow = i*nSecDiv + ibase;
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

    ibase = nVA;
    if (getStartCapType()==CAP_SPHR) {
      // spherical cap (start)
      for (i=0; i<nSphr-1; ++i) {
        irow = i*nSecDiv + ibase;
        for (j=0; j<nSecDiv; ++j) {
          ij = irow + j;
          ipj = ij + nSecDiv;
          ijp = irow + (j+1)%nSecDiv;
          ipjp = irow + nSecDiv + (j+1)%nSecDiv;
          pVBO->setIndex3(ind, ij, ipjp, ijp);
          ++ind;
          pVBO->setIndex3(ind, ipjp, ij, ipj);
          ++ind;
        }
      }
    }
    else {
      // flat cap (start)
      irow = ibase + 1;
      for (j=0; j<nSecDiv; ++j) {
        ij = irow + j;
        ijp = irow + (j+1)%nSecDiv;
        pVBO->setIndex3(ind, ibase, ijp, ij);
        ++ind;
      }
    }
    
    // flat cap (end)
    ibase = nStCapVerts + nVA;
    irow = ibase + 1;
    for (j=0; j<nSecDiv; ++j) {
      ij = irow + j;
      ijp = irow + (j+1)%nSecDiv;
      pVBO->setIndex3(ind, ibase, ij, ijp);
      ++ind;
    }

    LOG_DPRINTLN("Tube2DS> %d elems VBO created", nVA);
  }
}

void getBasisVecs(Tube2SS *pSeg, float par, Vector3F &pos,
		  Vector3F &e0, Vector3F &e1, Vector3F &e2)
{
  float v0len;
  Vector3F binorm, bpos;
  Vector3F v0, v1, v2;

  CubicSpline *pAxInt = pSeg->getAxisIntpol();
  pAxInt->interpolate(par, &pos, &v0);
  binorm = pSeg->intpolLinBn(par);
  v0len = v0.length();
  e0 = v0.divide(v0len);
  v2 = binorm - e0.scale(e0.dot(binorm));
  e2 = v2.normalize();
  e1 = e2.cross(e0);
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
  float v0len;
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
    int ind = 0;
  
    // body
    for (i=0; i<nAxPts; ++i) {
      getBasisVecs(pSeg, float(i)/fDetail + fStart, pos, e0, e1, e2);
      for (j=0; j<nSecDiv; ++j) {
        const Vector4D &stab = pTS->getSectTab(j);
        g = e1.scale( stab.x() ) + e2.scale( stab.y() );
        dg = e1.scale( stab.z() ) + e2.scale( stab.w() );
        pVBO->vertex3f(ind, pos + g);
        pVBO->normal3f(ind, dg);
	++ind;
      }
    }
    
    if (getStartCapType()==CAP_SPHR) {
      // sphere cap (start)
      getBasisVecs(pSeg, fStart, pos, e0, e1, e2);
      const float sign = -1.0;
      const int nsphr = getAxialDetail();
      const float v0len = pTS->getVec(0, e1, e2).length();
      Vector3F v0 = e0.scale(sign*v0len);

      for (i=0; i<nsphr; i++) {
	const float t = float(i)/float(nsphr);
	float gpar = ::sqrt(1.0-t*t);
	
	Vector3F e10 = pos + v0.scale(t);
	Vector3F e11 = e1.scale(gpar);
	Vector3F e12 = e2.scale(gpar);

	for (j=0; j<nSecDiv; ++j) {
	  const Vector4D &stab = pTS->getSectTab(j);

	  Vector3F g1 = e11.scale(stab.x()) + e12.scale(stab.y());
	  Vector3F dg1 = e11.scale(stab.z()) + e12.scale(stab.w());
	  Vector3F dgp1 = e11.scale(-stab.w()) + e12.scale(stab.z());
	  dg1 = dg1.scale(v0len*gpar) - (dgp1.cross(g1)).scale(t*sign);

	  pVBO->vertex3f(ind, e10 + g1);
	  pVBO->normal3f(ind, dg1);
	  ++ind;
	}
      }      
    }
    else {
      // flat cap (start)
      getBasisVecs(pSeg, fStart, pos, e0, e1, e2);
      pVBO->vertex3f(ind, pos);
      pVBO->normal3f(ind, -e0);
      ++ind;
      for (j=0; j<nSecDiv; ++j) {
	const Vector4D &stab = pTS->getSectTab(j);
	g = e1.scale( stab.x() ) + e2.scale( stab.y() );
	pVBO->vertex3f(ind, pos + g);
	pVBO->normal3f(ind, -e0);
	++ind;
      }
    }

    getBasisVecs(pSeg, float(nAxPts-1)/fDetail + fStart, pos, e0, e1, e2);
    pVBO->vertex3f(ind, pos);
    pVBO->normal3f(ind, e0);
    ++ind;
    for (j=0; j<nSecDiv; ++j) {
      const Vector4D &stab = pTS->getSectTab(j);
      g = e1.scale( stab.x() ) + e2.scale( stab.y() );
      pVBO->vertex3f(ind, pos + g);
      pVBO->normal3f(ind, e0);
      ++ind;
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
    int ind = 0;
    
    // body
    for (i=0; i<nAxPts; ++i) {
      par = float(i)/fdetail + fstart;
      dcc = pSeg->calcColor(this, pCMol, par);
      for (j=0; j<nSecDiv; ++j) {
        //int ind = i*nSecDiv + j;
        pVBO->color(ind, dcc);
	++ind;
      }
    }

    par = fstart;
    dcc = pSeg->calcColor(this, pCMol, par);
    if (getStartCapType()==CAP_SPHR) {
      // sphere cap (start)
      const int nsphr = getAxialDetail();
      for (i=0; i<nsphr; i++) {
	for (j=0; j<nSecDiv; ++j) {
	  pVBO->color(ind, dcc);
	  ++ind;
	}
      }
    }
    else {
      // flat cap (start)
      pVBO->color(ind, dcc);
      ++ind;
      for (j=0; j<nSecDiv; ++j) {
	pVBO->color(ind, dcc);
	++ind;
      }
    }

    // flat cap (end)
    par = float(nAxPts-1)/fdetail + fstart;
    dcc = pSeg->calcColor(this, pCMol, par);
    pVBO->color(ind, dcc);
    ++ind;
    for (j=0; j<nSecDiv; ++j) {
      pVBO->color(ind, dcc);
      ++ind;
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

