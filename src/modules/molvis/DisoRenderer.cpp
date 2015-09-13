// -*-Mode: C++;-*-
//
//  Disorder line (dot) renderer class
//

#include <common.h>
#include "DisoRenderer.hpp"

#include <modules/molstr/MolAtom.hpp>
#include <modules/molstr/ResidIterator.hpp>

#include <gfx/DisplayContext.hpp>
#include <gfx/GradientColor.hpp>
#include <qsys/SceneManager.hpp>
#include <qsys/qsys.hpp>

using namespace molvis;
using namespace molstr;

DisoRenderer::DisoRenderer()
     : super_t()
{
  m_nDetail = 4;

  m_linew=0.3;
  m_dDotSep = 1.0;
  m_dStrength = 2.0;
  m_dStrength2 = -1.0;

  m_nTgtRendID = qlib::invalid_uid;
}

DisoRenderer::~DisoRenderer()
{
  setupEvent(qlib::invalid_uid);
}

//////////////////////////////////////////////////////////////////////////

bool DisoRenderer::isDispLater() const
{
  return true;
}

LString DisoRenderer::toString() const
{
  return LString::format("DisoRenderer %p", this);
}

const char *DisoRenderer::getTypeName() const
{
  return "disorder";
}

//////////////////////////////////////////////////////////////////////////

MainChainRenderer *DisoRenderer::getTgtRend()
{
  if (m_strTgtRendName.isEmpty())
    return NULL;
  
  MolCoordPtr pMol = getClientMol();
  if (pMol.isnull()) return NULL;

  qsys::RendererPtr pRend = pMol->getRendByName(m_strTgtRendName);
  if (pRend.isnull())
    return NULL;

  MainChainRenderer *pRes = dynamic_cast<MainChainRenderer *>(pRend.get());

  if (pRes==NULL) {
    //MB_THROW(qlib::RuntimeException, msg);
    return NULL;
  }

  qlib::uid_t uid = pRend->getUID();
  if (m_nTgtRendID!=uid)
    setupEvent(uid);

  return dynamic_cast<MainChainRenderer *>(pRend.get());
}

double calcDiffBezierLen(double rho,
                         const Vector4D &pos1,
                         const Vector4D &pos2,
                         const Vector4D &pos3,
                         const Vector4D &pos4)
{
  double irho = 1.0 - rho;
  double rhosq = rho * rho;
  double irhosq = irho * irho;
  
  Vector4D dv =
    (pos4-pos3).scale(3.0*rhosq) +
      (pos3-pos2).scale(6.0*rho*irho) +
        (pos2-pos1).scale(3.0*irhosq);
  
  return dv.length();
}

double calcBezierLen(double rho, int ndiv,
		     const Vector4D &pos1,
		     const Vector4D &pos2,
		     const Vector4D &pos3,
                     const Vector4D &pos4)
{
  double delt = 1.0/double(ndiv);
  
  double res = 0.0;
  double t = 0.0;
  for (int i=1; i<=ndiv && t<=rho; ++i) {
    t = double(i)/double(ndiv);
    double dl = calcDiffBezierLen(t, pos1, pos2, pos3, pos4);
    res += dl * delt;
  }

  return res;
}

void DisoRenderer::renderBezierDots(DisplayContext *pdl,
                                    const Vector4D &pos1,
                                    const Vector4D &pos2,
                                    const Vector4D &pos3,
                                    const Vector4D &pos4,
                                    const ColorPtr &c1,
                                    const ColorPtr &c2)
{
  double estlen = (pos1-pos2).length() + (pos2-pos3).length() + (pos3-pos4).length();
  int ndiv = int(::floor(estlen)) * 10;
  if (ndiv<100) ndiv = 100;
  MB_DPRINTLN("renderBzDot ndiv=%d", ndiv);

  int i;
  double totlen = calcBezierLen(1.0, ndiv, pos1, pos2, pos3, pos4);
  int ndot = int( ::ceil(totlen/m_dDotSep) );

  double dotsep = totlen/double(ndot);
  int idot=0;

  MB_DPRINTLN("Loop totlen=%f, ndot=%d, act dsep=%f", totlen, ndot, dotsep);

  bool bGrad = false;
  if (!c1->equals(*c2.get()))
    bGrad = true;
  pdl->color(c1);

  double delt = 1.0/double(ndiv);
  double thres = dotsep;
  double len = 0.0;
  for (i=1; i<ndiv; ++i) {
    double t = double(i)/double(ndiv);
    double dl = calcDiffBezierLen(t, pos1, pos2, pos3, pos4);
    len += dl * delt;
    if (len>thres) {
      thres += dotsep;

      double rho = t;
      double irho = 1.0 - rho;
      double rhosq = rho * rho;
      double irhosq = irho * irho;
      
      Vector4D v = pos1.scale(irho*irhosq) +
        pos2.scale(3.0 * rho*irhosq) +
          pos3.scale(3.0 * rhosq*irho) +
            pos4.scale(rho*rhosq);
      
      if (bGrad) {
        ColorPtr pGradCol = ColorPtr(MB_NEW gfx::GradientColor(c1, c2, irho));
        pdl->color(pGradCol);
      }
      pdl->sphere(m_linew, v);
    }
  }

}

////////////////////////////////////////////////////////////////////////////////

void DisoRenderer::render(DisplayContext *pdl)
{
  MolCoordPtr pCliMol = getClientMol();
  if (pCliMol.isnull()) {
    MB_DPRINTLN("DisoRenderer::render> Client mol is null");
    return;
  }

  // setup the target renderer
  m_pTgtRend = getTgtRend();
  if (m_pTgtRend==NULL) {
    LOG_DPRINTLN("DisoRenderer> Cannot display, target rend is null");
    return;
  }

  // initialize the coloring scheme
  getColSchm()->start(pCliMol, this);
  pCliMol->getColSchm()->start(pCliMol, this);

  pdl->setDetail(m_nDetail);

  // iterate for all residues
  ResidIterator iter(pCliMol);
  
  MolResiduePtr pPrevRes, pRes;
  for (iter.first(); iter.hasMore(); iter.next()) {
    pRes = iter.get();
    MB_ASSERT(!pRes.isnull());

    /*
    MolAtomPtr pPiv = getPivotAtom(pRes);
    if (pPiv.isnull()) {
      // This resid doesn't has pivot, so we cannot draw backbone!!
      pPrevRes = pRes;
      continue;
    }
*/
    rendDiso(pdl, pRes, pPrevRes);
    
    pPrevRes = pRes;
  }
  
  m_pTgtRend = NULL;

  getColSchm()->end();
  pCliMol->getColSchm()->end();
}

void DisoRenderer::rendDiso(DisplayContext *pdl, MolResiduePtr pRes, MolResiduePtr pPrevRes)
{
  bool res;
  
  if (pPrevRes.isnull() || m_pTgtRend==NULL)
    return;
  
  // pPrevRes and pRes are linked --> not disordered
  if (pPrevRes->isLinkedTo(pRes))
    return;

  MolAtomPtr pAtom1 = m_pTgtRend->getPivotAtom(pPrevRes);
  MolAtomPtr pAtom2 = m_pTgtRend->getPivotAtom(pRes);
  if (pAtom1.isnull() || pAtom2.isnull())
    return;
  
  // Check chains
  MolChainPtr pcurch = pRes->getParentChain();
  MolChainPtr pprevch = pPrevRes->getParentChain();
  MB_ASSERT(!pcurch.isnull());
  MB_ASSERT(!pprevch.isnull());
  if (pcurch.get()!=pprevch.get())
    return;

  // same chain & not linked --> disordered region
  MB_DPRINTLN("Unlinked: %s <--> %s", pRes->toString().c_str(), pPrevRes->toString().c_str());
  
  SelectionPtr pSel = getSelection();
  if (!pSel.isnull()) {
    if (pSel->isSelectedResid(pPrevRes)==Selection::SEL_NONE ||
        pSel->isSelectedResid(pRes)==Selection::SEL_NONE) {
      // both term of diso region are not selected --> not render
      return;
    }
  }

  Vector4D pos1; // = pAtom1->getPos();
  Vector4D pos4; // = pAtom2->getPos();
  
  Vector4D vvec1;
  res = m_pTgtRend->getDiffVec(pPrevRes, pos1, vvec1);
  if (!res)
    return;
  
  Vector4D vvec2;
  res = m_pTgtRend->getDiffVec(pRes, pos4, vvec2);
  if (!res)
    return;

  Vector4D pos2 = pos1 + vvec1.scale(m_dStrength);
  double dstr2 = m_dStrength;
  if (m_dStrength2>0.0)
    dstr2 = m_dStrength2;
  Vector4D pos3 = pos4 - vvec2.scale(dstr2);
  
  renderBezierDots(pdl, pos1, pos2, pos3, pos4,
                   ColSchmHolder::getColor(pPrevRes),
                   ColSchmHolder::getColor(pRes));
}

//////////

void DisoRenderer::setTgtRendName(const LString &s)
{
  // detach from the previous tgt
  setupEvent(qlib::invalid_uid);
  m_strTgtRendName = s;
  invalidateDisplayCache();
}

void DisoRenderer::setupEvent(qlib::uid_t nNewID)
{
  // detach from the previous event target
  if (m_nTgtRendID!=qlib::invalid_uid) {
    qsys::RendererPtr pRend = qsys::SceneManager::getRendererS(m_nTgtRendID);
    if (!pRend.isnull()) {
      pRend->removeListener(this);
    }
  }

  m_nTgtRendID = nNewID;

  // attach to the new target
  if (m_nTgtRendID!=qlib::invalid_uid) {
    qsys::RendererPtr pRend = qsys::SceneManager::getRendererS(m_nTgtRendID);
    if (!pRend.isnull()) {
      pRend->addListener(this);
    }
  }
}

void DisoRenderer::rendererChanged(qsys::RendererEvent &ev)
{
  invalidateDisplayCache();
}

/*
void DisoRenderer::propChanged(qlib::LPropEvent &ev)
{
  const LString propnm = ev.getName();
  if (propnm.equals("detail")) {
    invalidateDisplayCache();
  }
  else if (propnm.equals("width")) {
    invalidateDisplayCache();
  }
  else if (propnm.equals("dotsep")) {
    invalidateDisplayCache();
  }
  else if (propnm.equals("loopsize")) {
    invalidateDisplayCache();
  }

  super_t::propChanged(ev);
}
*/

