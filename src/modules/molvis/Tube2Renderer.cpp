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

  m_nAxialDetail = 20;
  // m_dLineWidth = 1.2;

  m_bUseGLSL = true;
  //m_bUseGLSL = false;

  m_bChkShaderDone = false;
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

void Tube2Renderer::startColorCalc()
{
  MolCoordPtr pCMol = getClientMol();

  // initialize the coloring scheme
  getColSchm()->start(pCMol, this);
  pCMol->getColSchm()->start(pCMol, this);

}
void Tube2Renderer::endColorCalc()
{
  MolCoordPtr pCMol = getClientMol();

  // finalize the coloring scheme
  getColSchm()->end();
  pCMol->getColSchm()->end();
}

void Tube2Renderer::display(DisplayContext *pdc)
{
  if (m_bUseGLSL) {
    // new rendering routine using GLSL/VBO
    if (!m_bChkShaderDone)
      initShader(pdc);
  }

  // Always use VBO (DrawElem)
  if (m_seglist.empty()) {
    createSegList(pdc);

    startColorCalc();

    BOOST_FOREACH (Tube2Seg &elem, m_seglist) {
      if (elem.getSize()>0) {
        // elem.updateColor(this);

        if (m_bUseGLSL) {
          updateColorGLSL(&elem, pdc);
        }
        else {
          updateColorVBO(&elem, pdc);
        }

        if (isUseAnim())
          updateDynamic(&elem);
        else
          updateStatic(&elem);
      }
    }

    endColorCalc();
  }

  preRender(pdc);
  BOOST_FOREACH (Tube2Seg &elem, m_seglist) {
    if (elem.getSize()>0) {
      //elem.draw(this, pdc);
      if (m_bUseGLSL) {
        drawGLSL(&elem, pdc);
      }
      else {
        drawVBO(&elem, pdc);
      }
    }
  }
  postRender(pdc);

}

void Tube2Renderer::invalidateDisplayCache()
{
  if (!m_seglist.empty()) {
    m_seglist.clear();
  }

  super_t::invalidateDisplayCache();
}

void Tube2Renderer::propChanged(qlib::LPropEvent &ev)
{
  if (ev.getParentName().equals("section")||
      ev.getParentName().startsWith("section.")) {
    //if (m_bUseGLSL)
    //updateSectGLSL();
    //    else
    invalidateDisplayCache();
  }
  else if (ev.getParentName().equals("coloring")||
      ev.getParentName().startsWith("coloring.")) {
    invalidateDisplayCache();
  }
  else if (ev.getName().equals("axialdetail")) {
    invalidateDisplayCache();
  }

  super_t::propChanged(ev);
}

void Tube2Renderer::objectChanged(qsys::ObjectEvent &ev)
{
  if (ev.getType()==qsys::ObjectEvent::OBE_CHANGED &&
      ev.getDescr().equals("atomsMoved")) {

    // OBE_CHANGED && descr=="atomsMoved"

    if (isUseAnim()) {
      BOOST_FOREACH (Tube2Seg &elem, m_seglist) {
        if (elem.getSize()>0) {
          // only update positions
          updateDynamic(&elem);
        }
      }
      return;
    }

  }

  super_t::objectChanged(ev);
}


void Tube2Renderer::createSegList(DisplayContext *pdc)
{
  if (!m_pts->isValid())
    m_pts->setupSectionTable();

  MolCoordPtr pCMol = getClientMol();

  // visit all residues
  ResidIterator iter(pCMol);
  
  MolResiduePtr pPrevResid;
  for (iter.first(); iter.hasMore(); iter.next()) {
    MolResiduePtr pRes = iter.get();
    MB_ASSERT(!pRes.isnull());
    
    MolAtomPtr pPiv = getPivotAtom(pRes);
    if (pPiv.isnull()) {
      // This resid doesn't has pivot, so we cannot draw backbone!!
      if (!pPrevResid.isnull()) {
        setup(&m_seglist.back(), pdc);
      }
      pPrevResid = MolResiduePtr();
      continue;
    }
    
    if (isNewSegment(pRes, pPrevResid)) {
      if (!pPrevResid.isnull()) {
        setup(&m_seglist.back(), pdc);
      }
      m_seglist.push_back(Tube2Seg());
    }
    
    m_seglist.back().append(pPiv);
    //append(pPiv);
    pPrevResid = pRes;
  }

  if (!pPrevResid.isnull()) {
    setup(&m_seglist.back(), pdc);
  }

  // create tube section texture
  if (m_bUseGLSL) {
    setupSectGLSL(pdc);
  }

}

//////////

void Tube2Renderer::setup(Tube2Seg *pSeg, DisplayContext *pdc)
{
  pSeg->generate(this);

  if (m_bUseGLSL)
    setupGLSL(pSeg, pdc);
  else
    setupVBO(pSeg, pdc);
}

void Tube2Renderer::setupVBO(Tube2Seg *pSeg, DisplayContext *pdc)
{
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


void Tube2Renderer::updateColorVBO(Tube2Seg *pSeg, DisplayContext *pdc)
{
  MolCoordPtr pCMol = getClientMol();

  int i, j;
  int nSecDiv = getTubeSection()->getSize();

  float par;
  float fdetail = float(getAxialDetail());

  quint32 dcc;

  Tub2DrawSeg::VertArray *pVBO;

  BOOST_FOREACH (Tub2DrawSeg &elem, pSeg->m_draws) {
    //elem.updateVBOColor(pthis, this);
    
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

void Tube2Renderer::updateStatic(Tube2Seg *pSeg)
{
/*
  // update axial intpol coef
  MolCoordPtr pCMol = getClientMol();
  MolAtomPtr pAtom;
  Vector4D pos4d;
  int i;
  const int nCtlPts = pSeg->m_nCtlPts;

  for (i=0; i<nCtlPts; ++i) {
    pAtom = pSeg->getAtom(pCMol, i);
    pos4d = pAtom->getPos();
    pSeg->m_scoeff.setPoint(i, Vector3F(float(pos4d.x()), float(pos4d.y()), float(pos4d.z())));
  }

  pSeg->m_scoeff.generate();

  // update binorm coeff
  pSeg->updateBinormIntpol(pCMol);
*/

  pSeg->updateStatic(this);
  
  if (m_bUseGLSL) {
    updateGLSL(pSeg);
  }
  else {
    updateVBO(pSeg);
  }
}

void Tube2Renderer::updateDynamic(Tube2Seg *pSeg)
{
  /*
  // update axial intpol coef
  MolCoordPtr pCMol = getClientMol();
  AnimMol *pAMol = static_cast<AnimMol *>(pCMol.get());

  qfloat32 *crd = pAMol->getAtomCrdArray();

  MolAtomPtr pAtom;
  Vector4D pos4d;
  int i;
  const int nCtlPts = pSeg->m_nCtlPts;

  for (i=0; i<nCtlPts; ++i) {
    pSeg->m_scoeff.setPoint(i, Vector3F(&crd[pSeg->m_inds[i]]));
  }
  pSeg->m_scoeff.generate();

  // update binorm coeff
  pSeg->updateBinormIntpol(pCMol);
*/

  pSeg->updateDynamic(this);
  
  if (m_bUseGLSL) {
    updateGLSL(pSeg);
  }
  else {
    updateVBO(pSeg);
  }
}

void Tube2Renderer::updateVBO(Tube2Seg *pSeg)
{
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
    //elem.updateVBO(pthis, this);
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


void Tube2Renderer::drawVBO(Tube2Seg *pSeg, DisplayContext *pdc)
{
  // const double lw = getLineWidth();

  BOOST_FOREACH (Tub2DrawSeg &elem, pSeg->m_draws) {
    //elem.drawVBO(pthis, pdc);
    //m_pVBO->setLineWidth(lw);
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


