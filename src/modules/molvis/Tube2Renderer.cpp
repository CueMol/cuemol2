// -*-Mode: C++;-*-
//
//  Tube renderer class ver2
//

#include <common.h>
#include "molvis.hpp"

#include "Tube2Renderer.hpp"

#include <qsys/SceneManager.hpp>
#include <gfx/Texture.hpp>

#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/MolChain.hpp>
#include <modules/molstr/MolResidue.hpp>
#include <modules/molstr/ResidIterator.hpp>
#include <modules/molstr/AnimMol.hpp>

#include <sysdep/OglProgramObject.hpp>

#ifdef WIN32
#define USE_GL_VBO_INST 1
#else
#endif

using namespace molvis;
using namespace molstr;
using qlib::Matrix3D;

Tube2Renderer::Tube2Renderer()
     : super_t(), m_pts(MB_NEW TubeSection())
{
  super_t::setupParentData("section");

  m_pPO = NULL;
  m_pSectTex = NULL;
}

Tube2Renderer::~Tube2Renderer()
{
  if (m_pSectTex!=NULL)
    delete m_pSectTex;
}

const char *Tube2Renderer::getTypeName() const
{
  return "tube2";
}

void Tube2Renderer::preRender(DisplayContext *pdc)
{
  pdc->setLighting(true);
}

void Tube2Renderer::propChanged(qlib::LPropEvent &ev)
{
  if (ev.getParentName().equals("section")||
      ev.getParentName().startsWith("section.")) {
    //if (isUseGLSL())
    //updateSectGLSL();
    //    else
    invalidateDisplayCache();
  }

  super_t::propChanged(ev);
}

void Tube2Renderer::createSegList(DisplayContext *pdc)
{
  if (!m_pts->isValid())
    m_pts->setupSectionTable();

  super_t::createSegList(pdc);

  // create tube section texture
  if (isUseGLSL()) {
    setupSectGLSL(pdc);
  }
}

SplineSegment *Tube2Renderer::createSegment()
{
  return MB_NEW Tube2Seg();
}

//////////

void Tube2Renderer::setupVBO(detail::SplineSegment *pASeg, DisplayContext *pdc)
{
  Tube2Seg *pSeg = static_cast<Tube2Seg *>(pASeg);
  const int nDetail = getAxialDetail();
  const int nSecDiv = getTubeSection()->getSize();

  BOOST_FOREACH (Tub2DrawSeg &elem, pSeg->m_draws) {
    //elem.setupVBO(pthis);

    const int nsplseg = elem.m_nEnd - elem.m_nStart;
    const int nAxPts = nDetail * nsplseg + 1;
    elem.m_nAxPts = nAxPts;
    const int nVA = nAxPts * nSecDiv;
// elem.m_nVA = nVA;
    
    // TO DO: multiple vertex generation for discontinuous color point

    Tub2DrawSeg::VertArray *pVBO = elem.m_pVBO;
    if (pVBO!=NULL)
      delete pVBO;
    
    elem.m_pVBO = pVBO = MB_NEW Tub2DrawSeg::VertArray();
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
    LOG_DPRINTLN("Tub2DrawSeg> %d elems VBO created", nVA);
  }
}

void Tube2Renderer::updateCrdVBO(detail::SplineSegment *pASeg)
{
  Tube2Seg *pSeg = static_cast<Tube2Seg *>(pASeg);
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
  Tub2DrawSeg::VertArray *pVBO;

  BOOST_FOREACH (Tub2DrawSeg &elem, pSeg->m_draws) {
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

void Tube2Renderer::updateColorVBO(detail::SplineSegment *pASeg, DisplayContext *pdc)
{
  Tube2Seg *pSeg = static_cast<Tube2Seg *>(pASeg);
  MolCoordPtr pCMol = getClientMol();

  int i, j;
  int nSecDiv = getTubeSection()->getSize();

  float par;
  float fdetail = float(getAxialDetail());

  quint32 dcc;

  Tub2DrawSeg::VertArray *pVBO;

  BOOST_FOREACH (Tub2DrawSeg &elem, pSeg->m_draws) {
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
  Tube2Seg *pSeg = static_cast<Tube2Seg *>(pASeg);

  BOOST_FOREACH (Tub2DrawSeg &elem, pSeg->m_draws) {
    pdc->drawElem(*elem.m_pVBO);
  }
}


//////////////////////////////////////////////////////////////

void Tube2Seg::generateImpl(int nstart, int nend)
{
  m_draws.push_back(Tub2DrawSeg(nstart, nend));
}

Tube2Seg::~Tube2Seg()
{
  if (m_pCoefTex!=NULL)
    delete m_pCoefTex;
  if (m_pBinormTex!=NULL)
    delete m_pBinormTex;
  if (m_pColorTex!=NULL)
    delete m_pColorTex;
}

//////////

Tub2DrawSeg::~Tub2DrawSeg()
{
  if (m_pVBO!=NULL)
    delete m_pVBO;

  if (m_pAttrAry!=NULL)
    delete m_pAttrAry;
}


