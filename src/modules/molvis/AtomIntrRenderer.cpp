// -*-Mode: C++;-*-
//
//  Interaction line renderer class
//
// $Id: AtomIntrRenderer.cpp,v 1.20 2011/05/02 14:51:29 rishitani Exp $

#include <common.h>
#include "AtomIntrRenderer.hpp"

//#include <molstr/MolCoord.hpp>
//#include <molstr/MolChain.hpp>
//#include <molstr/MolResidue.hpp>
#include <modules/molstr/MolAtom.hpp>
#include <modules/molstr/AtomIterator.hpp>
#include <modules/molstr/SelCommand.hpp>

#include <gfx/DisplayContext.hpp>
#include <gfx/PixelBuffer.hpp>
#include <gfx/TextRenderManager.hpp>

#include <qsys/SceneManager.hpp>

namespace {

using namespace molvis;
using namespace molstr;

////////////////////////////////////////////////////////////////
///
///  Undo/Redoable edit-information for structure-transformation
///

class AtomIntrEditInfo : public qsys::EditInfo
{
private:
  /// Target AtomIntrRenderer ID
  qlib::uid_t m_nTgtUID;

  /// Interaction obj ID
  int m_nIntrID;

  /// interaction data added
  AtomIntrData m_data;

  /// remove or append
  bool m_bRemove;

public:
  AtomIntrEditInfo()
  {
  }
  
  virtual ~AtomIntrEditInfo()
  {
  }      

  /////////////////////////////////////////////////////
  // Implementation

  void setup(qlib::uid_t rend_id, int id, const AtomIntrData &data) {
    m_nTgtUID = rend_id;
    m_nIntrID = id;
    m_data = data;
    m_bRemove = false;
  }

  void setupRemove(qlib::uid_t rend_id, int id, const AtomIntrData &data) {
    m_nTgtUID = rend_id;
    m_nIntrID = id;
    m_data = data;
    m_bRemove = true;
  }

  /////////////////////////////////////////////////////

  /// perform undo
  virtual bool undo()
  {
    AtomIntrRenderer *pRend =
      qlib::ObjectManager::sGetObj<AtomIntrRenderer>(m_nTgtUID);
    if (pRend==NULL)
      return false;
    if (!m_bRemove)
      pRend->remove(m_nIntrID);
    else
      pRend->setAt(m_nIntrID, m_data);
    return true;
  }
  
  /// perform redo
  virtual bool redo()
  {
    AtomIntrRenderer *pRend =
      qlib::ObjectManager::sGetObj<AtomIntrRenderer>(m_nTgtUID);
    if (pRend==NULL)
      return false;
    if (!m_bRemove)
      pRend->setAt(m_nIntrID, m_data);
    else
      pRend->remove(m_nIntrID);
    return true;
  }
  
  virtual bool isUndoable() const
  {
    return true;
  }

  virtual bool isRedoable() const
  {
    return true;
  }
  
};

}

//////////////////////////////////////////////////////////////////////////

using namespace molvis;
using namespace molstr;

AtomIntrRenderer::AtomIntrRenderer()
     : super_t()
{
  // m_pdata = MB_NEW AtomIntrData;

  m_bShowLabel = false;
  m_nMode = AIR_FANCY;
  m_linew=0.3;
  m_nEndType = END_SPHERE;

  m_stipple[0] = -1.0;
  m_stipple[1] = -1.0;
  m_stipple[2] = -1.0;
  m_stipple[3] = -1.0;
  m_stipple[4] = -1.0;
  m_stipple[5] = -1.0;
  m_nTopStipple = 0;

  m_dArrowWidth = 2.0;
  m_dArrowHeight = 1.2;
}

AtomIntrRenderer::~AtomIntrRenderer()
{
  // delete m_pdata;
  m_pixCache.invalidateAll();
}

//////////////////////////////////////////////////////////////////////////

MolCoordPtr AtomIntrRenderer::getClientMol() const
{
  qsys::ObjectPtr robj = qsys::SceneManager::getObjectS(getClientObjID());
  if (robj.isnull()) return MolCoordPtr();
  return MolCoordPtr(robj);
}

bool AtomIntrRenderer::isCompatibleObj(qsys::ObjectPtr pobj) const
{
  MolCoord *ptest = dynamic_cast<MolCoord *>(pobj.get());
  return ptest!=NULL;
}

LString AtomIntrRenderer::toString() const
{
  return LString::format("AtomIntrRenderer %p", this);
}

Vector4D AtomIntrRenderer::getCenter() const
{
  return Vector4D();
}

bool AtomIntrRenderer::isHitTestSupported() const
{
  return false;
}

const char *AtomIntrRenderer::getTypeName() const
{
  return "atomintr";
}

//////////////////////////////////////////////////////////////////////////

int AtomIntrRenderer::appendBySelStr(const LString &sstr1, const LString &sstr2)
{
  SelCommand *pSel1 = MB_NEW SelCommand();
  SelectionPtr rSel1(pSel1);
  if (!pSel1->compile(sstr1)) {
    return -1;
  }

  SelCommand *pSel2 = MB_NEW SelCommand();
  SelectionPtr rSel2(pSel2);
  if (!pSel2->compile(sstr2)) {
    return -1;
  }

  qlib::uid_t nMolID = getClientObjID();
  return appendImpl(AtomIntrData(nMolID, rSel1, nMolID, rSel2));
}

int AtomIntrRenderer::appendById(int nAid1, qlib::uid_t nMolID2, int nAid2, bool bShowMsg)
{
  qlib::uid_t nMolID1 = getClientObjID();

  // check atom identity
  if (nMolID1==nMolID2) {
    if (nAid1==nAid2) {
      LString msg = LString::format("Cannot append degenerated distlabel for %d:%d", nMolID1, nAid1);
      LOG_DPRINTLN("ERROR: %s", msg.c_str());
      MB_THROW(qlib::RuntimeException, msg);
      return 0;
    }
  }


  int nlast = appendImpl(AtomIntrData(nMolID1, nAid1, nMolID2, nAid2));

  //
  // Display distance message to the logwindow
  //

  MolCoordPtr pMol1 = getClientMol();
  MolCoordPtr pMol2 = pMol1;
  if (nMolID1!=nMolID2)
    pMol2 = ensureNotNull(getScene())->getObject(nMolID2);
  ensureNotNull(pMol2);

  MolAtomPtr pAtom1 = pMol1->getAtom(nAid1);
  ensureNotNull(pAtom1);

  MolAtomPtr pAtom2 = pMol2->getAtom(nAid2);
  ensureNotNull(pAtom2);

  if (bShowMsg) {
    double dist = (pAtom1->getPos()-pAtom2->getPos()).length();
    
    LOG_DPRINTLN("Distance [%s] %s <--> [%s] %s: %f angstrom",
                 pMol1->getName().c_str(),
                 pAtom1->formatMsg().c_str(),
                 pMol2->getName().c_str(),
                 pAtom2->formatMsg().c_str(),
                 dist);
  }
  
  return nlast;
}

int AtomIntrRenderer::appendAngleById(int nAid1,
                                      qlib::uid_t nMolID2, int nAid2,
                                      qlib::uid_t nMolID3, int nAid3)
{
  qlib::uid_t nMolID1 = getClientObjID();
  int rval = appendImpl(AtomIntrData(nMolID1, nAid1, nMolID2, nAid2, nMolID3, nAid3));

  //
  // Display angle message to the logwindow
  //

  MolCoordPtr pMol1 = getClientMol();
  MolCoordPtr pMol2 = pMol1;
  if (nMolID1!=nMolID2)
    pMol2 = ensureNotNull(getScene())->getObject(nMolID2);
  ensureNotNull(pMol2);
  MolCoordPtr pMol3 = pMol1;
  if (nMolID1!=nMolID3)
    pMol3 = ensureNotNull(getScene())->getObject(nMolID3);
  ensureNotNull(pMol3);

  MolAtomPtr pAtom1 = pMol1->getAtom(nAid1);
  ensureNotNull(pAtom1);

  MolAtomPtr pAtom2 = pMol2->getAtom(nAid2);
  ensureNotNull(pAtom2);

  MolAtomPtr pAtom3 = pMol3->getAtom(nAid3);
  ensureNotNull(pAtom3);

  Vector4D pos0 = pAtom1->getPos();
  Vector4D pos1 = pAtom2->getPos();
  Vector4D pos2 = pAtom3->getPos();
  double angl = qlib::toDegree(Vector4D::angle((pos0-pos1), (pos2-pos1)));
  
  LOG_DPRINTLN("Angle [%s] %s, [%s] %s, [%s] %s: %f degree",
               pMol1->getName().c_str(),
               pAtom1->formatMsg().c_str(),
               pMol2->getName().c_str(),
               pAtom2->formatMsg().c_str(),
               pMol3->getName().c_str(),
               pAtom3->formatMsg().c_str(),
               angl);

  return rval;
}

int AtomIntrRenderer::appendTorsionById(int nAid1,
                                        qlib::uid_t nMolID2, int nAid2,
                                        qlib::uid_t nMolID3, int nAid3,
                                        qlib::uid_t nMolID4, int nAid4)
{
  qlib::uid_t nMolID1 = getClientObjID();
  int rval = appendImpl(AtomIntrData(nMolID1, nAid1,
                                 nMolID2, nAid2,
                                 nMolID3, nAid3,
                                 nMolID4, nAid4));

  //
  // Display torsion angle message to the logwindow
  //

  MolCoordPtr pMol1 = getClientMol();
  MolCoordPtr pMol2 = pMol1;
  if (nMolID1!=nMolID2)
    pMol2 = ensureNotNull(getScene())->getObject(nMolID2);
  ensureNotNull(pMol2);
  MolCoordPtr pMol3 = pMol1;
  if (nMolID1!=nMolID3)
    pMol3 = ensureNotNull(getScene())->getObject(nMolID3);
  ensureNotNull(pMol3);
  MolCoordPtr pMol4 = pMol1;
  if (nMolID1!=nMolID4)
    pMol4 = ensureNotNull(getScene())->getObject(nMolID4);
  ensureNotNull(pMol4);

  MolAtomPtr pAtom1 = pMol1->getAtom(nAid1);
  ensureNotNull(pAtom1);

  MolAtomPtr pAtom2 = pMol2->getAtom(nAid2);
  ensureNotNull(pAtom2);

  MolAtomPtr pAtom3 = pMol3->getAtom(nAid3);
  ensureNotNull(pAtom3);

  MolAtomPtr pAtom4 = pMol4->getAtom(nAid4);
  ensureNotNull(pAtom4);
  
  Vector4D pos0 = pAtom1->getPos();
  Vector4D pos1 = pAtom2->getPos();
  Vector4D pos2 = pAtom3->getPos();
  Vector4D pos3 = pAtom4->getPos();
  double dihe = qlib::toDegree(Vector4D::torsion(pos0, pos1, pos2, pos3));
  
  LOG_DPRINTLN("Torsion [%s] %s, [%s] %s, [%s] %s, [%s] %s: %f degree",
               pMol1->getName().c_str(),
               pAtom1->formatMsg().c_str(),
               pMol2->getName().c_str(),
               pAtom2->formatMsg().c_str(),
               pMol3->getName().c_str(),
               pAtom3->formatMsg().c_str(),
               pMol4->getName().c_str(),
               pAtom4->formatMsg().c_str(),
               dihe);

  return rval;
}

int AtomIntrRenderer::appendByVecs(const std::vector<Vector4D> &vecs)
{
  qlib::uid_t nMolID1 = getClientObjID();

  AtomIntrData aidat;
  int nvecs = vecs.size();
  if (nvecs==2) {
    aidat.nmode = 1;
    aidat.elem0.nMode= AtomIntrElem::AI_POS;
    aidat.elem0.nMolID = nMolID1;
    aidat.elem0.pos = vecs[0];
    aidat.elem1.nMode= AtomIntrElem::AI_POS;
    aidat.elem1.nMolID = nMolID1;
    aidat.elem1.pos = vecs[1];
  }
  if (nvecs==3) {
    aidat.nmode = 2;
    aidat.elem0.nMode= AtomIntrElem::AI_POS;
    aidat.elem0.nMolID = nMolID1;
    aidat.elem0.pos = vecs[0];
    aidat.elem1.nMode= AtomIntrElem::AI_POS;
    aidat.elem1.nMolID = nMolID1;
    aidat.elem1.pos = vecs[1];
    aidat.elem2.nMode= AtomIntrElem::AI_POS;
    aidat.elem2.nMolID = nMolID1;
    aidat.elem2.pos = vecs[2];
  }
  if (nvecs==4) {
    aidat.nmode = 3;
    aidat.elem0.nMode= AtomIntrElem::AI_POS;
    aidat.elem0.nMolID = nMolID1;
    aidat.elem0.pos = vecs[0];
    aidat.elem1.nMode= AtomIntrElem::AI_POS;
    aidat.elem1.nMolID = nMolID1;
    aidat.elem1.pos = vecs[1];
    aidat.elem2.nMode= AtomIntrElem::AI_POS;
    aidat.elem2.nMolID = nMolID1;
    aidat.elem2.pos = vecs[2];
    aidat.elem3.nMode= AtomIntrElem::AI_POS;
    aidat.elem3.nMolID = nMolID1;
    aidat.elem3.pos = vecs[3];
  }

  int rval = appendImpl(aidat);

  return rval;
}

void AtomIntrRenderer::invalidateAllLabels()
{
  m_pixCache.invalidateAll();
  BOOST_FOREACH(AtomIntrData &value, m_data) {
    value.nLabelCacheID = -1;
  }
}

int AtomIntrRenderer::appendImpl(const AtomIntrData &dat)
{
  int nlast = m_data.size();
  m_data.push_back(dat);
  invalidateDisplayCache();
  //m_pixCache.invalidateAll();

  qsys::ScenePtr pScene = getScene();
  if (pScene.isnull()) return nlast;

  // Record undoinfo if required
  qsys::UndoManager *pUM = pScene->getUndoMgr();
  if (!pUM->isOK())
    return nlast;
  
  AtomIntrEditInfo *pEI = MB_NEW AtomIntrEditInfo();
  pEI->setup(getUID(), nlast, dat);
  pUM->addEditInfo(pEI);
  
  return nlast;
}

void AtomIntrRenderer::setAt(int index, const AtomIntrData &dat)
{
  m_data.at(index) = dat;
  invalidateDisplayCache();
  // m_pixCache.invalidateAll();
}

bool AtomIntrRenderer::remove(int nid)
{
  if (m_data.size()<=nid)
    return false;

  AtomIntrData dat = m_data[nid];

  // invalidate the cache data of the removing elem
  m_pixCache.remove(dat.nLabelCacheID);
  dat.nLabelCacheID = -1;

  // invalidate the removing element;
  m_data[nid] = AtomIntrData();
  invalidateDisplayCache();

  // m_pixCache.invalidateAll();

  qsys::ScenePtr pScene = getScene();
  if (pScene.isnull()) return true;

  // Record undoinfo if required
  qsys::UndoManager *pUM = pScene->getUndoMgr();
  if (!pUM->isOK())
    return true;
  
  AtomIntrEditInfo *pEI = MB_NEW AtomIntrEditInfo();
  pEI->setupRemove(getUID(), nid, dat);
  pUM->addEditInfo(pEI);

  return true;
}

void AtomIntrRenderer::setDetail(int nID)
{
  m_nDetail = nID;
  invalidateDisplayCache();
}

void AtomIntrRenderer::setStipple0(double d)
{
  m_stipple[0] = d;
  checkStipple();
  invalidateDisplayCache();
}

void AtomIntrRenderer::setStipple1(double d)
{
  m_stipple[1] = d;
  checkStipple();
  invalidateDisplayCache();
}

void AtomIntrRenderer::setStipple2(double d)
{
  m_stipple[2] = d;
  checkStipple();
  invalidateDisplayCache();
}

void AtomIntrRenderer::setStipple3(double d)
{
  m_stipple[3] = d;
  checkStipple();
  invalidateDisplayCache();
}

void AtomIntrRenderer::setStipple4(double d)
{
  m_stipple[4] = d;
  checkStipple();
  invalidateDisplayCache();
}

void AtomIntrRenderer::setStipple5(double d)
{
  m_stipple[5] = d;
  checkStipple();
  invalidateDisplayCache();
}


//////////

void AtomIntrRenderer::preRender(DisplayContext *pdc)
{
  if (m_nMode==AIR_FANCY)
    pdc->setLighting(true);
  else
    pdc->setLighting(false);
}

void AtomIntrRenderer::postRender(DisplayContext *pdc)
{
}

void AtomIntrRenderer::render(DisplayContext *pdl)
{
  //qlib::uid_t nMolID = getClientObjID();
  m_pMol = getClientMol();
  if (m_pMol.isnull()) {
    LOG_DPRINTLN("AtomIntrRenderer> Cannot display, client mol is null");
    return;
  }

  if (m_nMode==AIR_FANCY) {
    pdl->setDetail(m_nDetail);
  }
  else {
    if (getStipple0()<0)
      pdl->setLineStipple(0xFFFF);
    else
      pdl->setLineStipple(0x00FF);
    pdl->setLineWidth(m_linew);
  }

  pdl->color(m_pcolor);

  try {

    BOOST_FOREACH(AtomIntrData &value, m_data) {
      switch (value.nmode) {
      case 1:
        // distance label
        renderDistLabel(value, pdl);
        break;

      case 2:
        // angle label
        renderAngleLabel(value, pdl);
        break;

      case 3:
        // distance label
        renderTorsionLabel(value, pdl);
        break;

      default:
        // invalid/none
        break;
      }

    }

  }
  catch (qlib::LException &e) {
    MB_DPRINTLN("AtomIntr> Exception is occured in rendering.");
    m_pMol = MolCoordPtr();
  }

  if (m_nMode==AIR_FANCY) {
    pdl->setLighting(false);
  }
  else {
    pdl->setLineStipple(0xFFFF);
    pdl->setLineWidth(1.0);
  }
}

void AtomIntrRenderer::renderDistLabel(AtomIntrData &value, DisplayContext *pdl)
{
  Vector4D pos0, pos1;
  if (!evalPos(value.elem0, pos0))
    return;
  if (!evalPos(value.elem1, pos1))
    return;

  if (m_nMode==AIR_FANCY)
    cylImpl(pdl, pos0, pos1);
  else {
    pdl->startLines();
    pdl->vertex(pos0);
    pdl->vertex(pos1);
    pdl->end();
  }

  if (m_bShowLabel) {
    Vector4D pos = (pos0+pos1).divide(2.0);
    LString msg = LString::format("%.2f", (pos0-pos1).length());
    if (value.nLabelCacheID<0)
      value.nLabelCacheID = m_pixCache.addString(pos, msg);
  }

}

void AtomIntrRenderer::renderAngleLabel(AtomIntrData &value, DisplayContext *pdl)
{
  Vector4D pos0, pos1, pos2;
  if (!evalPos(value.elem0, pos0))
    return;
  if (!evalPos(value.elem1, pos1))
    return;
  if (!evalPos(value.elem2, pos2))
    return;

  if (m_nMode==AIR_FANCY) {
    cylImpl(pdl, pos1, pos0);
    cylImpl(pdl, pos1, pos2);
  }
  else {
    pdl->startLines();
    pdl->vertex(pos0);
    pdl->vertex(pos1);
    pdl->vertex(pos1);
    pdl->vertex(pos2);
    pdl->end();
  }

  if (m_bShowLabel) {
    double angl = qlib::toDegree(Vector4D::angle((pos0-pos1), (pos2-pos1)));

    double sep = ((pos0-pos1).length() + (pos2-pos1).length())*0.5;
    Vector4D labpos = (pos0+pos2).scale(0.5) - pos1;
    labpos = labpos.normalize().scale(sep*0.2);
    labpos += pos1;

    if (value.nLabelCacheID<0)
      value.nLabelCacheID = m_pixCache.addString(labpos, LString::format("%.2f", angl));
  }
}

void AtomIntrRenderer::renderTorsionLabel(AtomIntrData &value, DisplayContext *pdl)
{
  Vector4D pos0, pos1, pos2, pos3;
  if (!evalPos(value.elem0, pos0))
    return;
  if (!evalPos(value.elem1, pos1))
    return;
  if (!evalPos(value.elem2, pos2))
    return;
  if (!evalPos(value.elem3, pos3))
    return;

  if (m_nMode==AIR_FANCY) {
    cylImpl(pdl, pos1, pos0);
    cylImpl(pdl, pos1, pos2);
    cylImpl(pdl, pos2, pos3);
  }
  else {
    pdl->startLines();
    pdl->vertex(pos0);
    pdl->vertex(pos1);
    pdl->vertex(pos1);
    pdl->vertex(pos2);
    pdl->vertex(pos2);
    pdl->vertex(pos3);
    pdl->end();
  }

  if (m_bShowLabel) {
    double dihe = qlib::toDegree(Vector4D::torsion(pos0, pos1, pos2, pos3));
    //showValue(labpos, dihe, pdl);

    if (value.nLabelCacheID<0)
      value.nLabelCacheID = m_pixCache.addString( (pos1+pos2).divide(2.0),
                                                  LString::format("%.2f", dihe) );
  }
}

/// Evaluate and returns mol ptr of interaction element, elem
/// (Returns null if the interaction element contains invalid/unknown mol name)
MolCoordPtr AtomIntrRenderer::evalMol(const AtomIntrElem &elem) const
{
  if (elem.nMolID==qlib::invalid_uid) {
    if (!elem.molName.isEmpty()) {
      MolCoordPtr pmol = ensureNotNull(getScene())->getObjectByName(elem.molName);

      // if null, elem.molName is already deleted!!
      //ensureNotNull(pmol);
      if (pmol.isnull()) return pmol;

      elem.nMolID = pmol->getUID();
    }
    else
      elem.nMolID = getClientObjID();
  }

  MolCoordPtr pmol = getClientMol();
  if (elem.nMolID!=pmol->getUID())
    pmol = qsys::SceneManager::getObjectS(elem.nMolID);

  return pmol;
}

bool AtomIntrRenderer::evalPos(AtomIntrElem &elem,
                               Vector4D &rval)
{
  if (elem.nMode==AtomIntrElem::AI_POS) {
    rval = elem.pos;
    return true;
  }

  MolCoordPtr pmol = evalMol(elem);
  if (pmol.isnull())
    return false;

  if (elem.nMode == AtomIntrElem::AI_SEL) {
    Vector4D vsum;
    int nsum = 0;
    AtomIterator aiter(pmol, elem.pSel);
    for (aiter.first(); aiter.hasMore(); aiter.next()) {
      MolAtomPtr pA1 = aiter.get();
      if (pA1.isnull()) continue;
      vsum += pA1->getPos();
      nsum ++;
    }
    
    if (nsum==0)
      return false;
    
    rval = vsum.divide(nsum);
  }
  else {
    // case AtomIntrElem::AI_AID
    MolAtomPtr pA1;
    if (elem.nAtomID<0) {
      // atom ID is not cached --> get by string aid
      int aid = pmol->fromStrAID(elem.strAid);
      if (aid<0) return false;
      pA1 = pmol->getAtom(aid);
      //pA1 = pmol->getAtom(elem.sChainName, elem.nResInd,
      //elem.sAtomName, elem.cAltLoc);
      
      if (pA1.isnull())
        return false;
      elem.nAtomID = aid;
    }
    else {
      pA1 = pmol->getAtom(elem.nAtomID);
      if (pA1.isnull())
        return false;
    }
    rval = pA1->getPos();
  }
  
  return true;
}

void AtomIntrRenderer::cylImpl(DisplayContext *pdl,
                               const Vector4D &startPos,
                               const Vector4D &endPos)
{
  Vector4D ppos, diff = (endPos-startPos);
  double len = diff.length();
  if (len<0.001)
    return;
  const Vector4D norm = diff.divide(len);

  Vector4D spos = startPos;
  Vector4D epos = endPos;

  if (m_nEndType==END_ARROW) {
    spos += norm.scale(m_dArrowHeight);
    epos -= norm.scale(m_dArrowHeight);
    drawArrow(pdl, startPos, -norm);
    drawArrow(pdl, endPos, norm);
  }

  if (m_nTopStipple==0) {
    pdl->cylinder(m_linew, spos, epos);
    if (m_nEndType==END_SPHERE) {
      pdl->sphere(m_linew, spos);
      pdl->sphere(m_linew, epos);
    }
    return;
  }
  
  double cur = 0.0;
  bool flag = false;

  if (m_nEndType==END_ARROW) {
    //cur  = m_dArrowHeight;
    len -= m_dArrowHeight*2.0;
    if (len<0.001)
      return;
  }

  int i=0;
  for ( ; cur<len; i++) {

    Vector4D pos = spos + norm.scale(cur);
    if (flag) {
      //MB_DPRINTLN("Cyl (%f,%f,%f)-(%f,%f,%f)", pos.x, pos.y, pos.z, ppos.x, ppos.y, ppos.z);
      pdl->cylinder(m_linew, pos, ppos);
    }
    if (m_nEndType==END_SPHERE)
      pdl->sphere(m_linew, pos);
    cur += m_stipple[i%m_nTopStipple];
    flag = !flag;
    ppos = pos;
  }

  if (flag) {
    // draw the last segment
    pdl->cylinder(m_linew, ppos, epos);
    if (m_nEndType==END_SPHERE)
      pdl->sphere(m_linew, epos);
  }
}

void AtomIntrRenderer::drawArrow(DisplayContext *pdl,
                                 const Vector4D &endPos,
                                 const Vector4D &dir)
{
  double w = m_linew * m_dArrowWidth;
  Vector4D endPos2 = endPos - dir.scale(m_dArrowHeight);
  pdl->cone(w, 0.0, endPos2, endPos, true);
}

void AtomIntrRenderer::styleChanged(qsys::StyleEvent &ev)
{
  super_t::styleChanged(ev);
  invalidateAllLabels();
}

void AtomIntrRenderer::propChanged(qlib::LPropEvent &ev)
{
  const LString propnm = ev.getName();
  if (propnm.equals("color")) {
    invalidateDisplayCache();
  }
  else if (propnm.startsWith("font_")) {
    invalidateAllLabels();
    invalidateDisplayCache();
  }
  else if (propnm.equals("showlabel")) {
    invalidateDisplayCache();
  }

  super_t::propChanged(ev);
}

void AtomIntrRenderer::writeTo2ElemHelper(qlib::LDom2Node *pNode, int nOrder,
                                          const AtomIntrElem &elem) const
{
  if (elem.nMode==AtomIntrElem::AI_POS) {
    LString key = LString::format("pos%d", nOrder);
    pNode->appendStrAttr(key, elem.pos.toString());
  }
  else if (elem.nMode==AtomIntrElem::AI_SEL) {
    LString key = LString::format("sel%d", nOrder);
    pNode->appendStrAttr(key, elem.pSel->toString());
  }
  else {
    LString key = LString::format("aid%d", nOrder);
    MolCoordPtr pMol = ensureNotNull( evalMol(elem) );
    // If nAtomID cache is never created, use original strAid for writing
    LString value;
    if (elem.nAtomID<0)
      value = elem.strAid;
    else
      value = pMol->toStrAID(elem.nAtomID);
    if (value.isEmpty()) {
      LOG_DPRINTLN("AtomIntrRenderer.writeTo> FATAL ERROR, cannot serialize AID %d for mol %s !!",
                   elem.nAtomID, pMol->getName().c_str());
    }
    pNode->appendStrAttr(key, value);
  }

  if (elem.nMolID!=getClientObjID()) {
    MolCoordPtr pmol = qsys::SceneManager::getObjectS(elem.nMolID);
    if (!pmol.isnull()) {
      LString name = pmol->getName();
      LString key = LString::format("mol%d", nOrder);
      pNode->appendStrAttr(key, name);
    }
  }
}

void AtomIntrRenderer::writeTo2(qlib::LDom2Node *pNode) const
{
  // write properties
  super_t::writeTo2(pNode);

  BOOST_FOREACH(const AtomIntrSet::value_type &value, m_data) {

    switch (value.nmode) {
    case 1: {
      // distance label
      qlib::LDom2Node *pChNode = pNode->appendChild("line");
      // always in child element
      pChNode->setAttrFlag(false);

      try {
        writeTo2ElemHelper(pChNode, 1, value.elem0);
        writeTo2ElemHelper(pChNode, 2, value.elem1);
      }
      catch (qlib::LException &e) {
        // intr elem contains invalid data --> ignore serialization
        LOG_DPRINTLN("AtomIntr> Write intr-elem failed: %s", e.getFmtMsg().c_str());
      }

      break;
    }
      
    case 2: {
      // angle label
      qlib::LDom2Node *pChNode = pNode->appendChild("angle");
      // always in child element
      pChNode->setAttrFlag(false);

      try {
        writeTo2ElemHelper(pChNode, 1, value.elem0);
        writeTo2ElemHelper(pChNode, 2, value.elem1);
        writeTo2ElemHelper(pChNode, 3, value.elem2);
      }
      catch (qlib::LException &e) {
        // intr elem contains invalid data --> ignore serialization
        LOG_DPRINTLN("AtomIntr> Write intr-elem failed: %s", e.getFmtMsg().c_str());
      }

      break;
    }

    case 3: {
      // torsion label
      qlib::LDom2Node *pChNode = pNode->appendChild("torsion");
      // always in child element
      pChNode->setAttrFlag(false);

      try {
        writeTo2ElemHelper(pChNode, 1, value.elem0);
        writeTo2ElemHelper(pChNode, 2, value.elem1);
        writeTo2ElemHelper(pChNode, 3, value.elem2);
        writeTo2ElemHelper(pChNode, 4, value.elem3);
      }
      catch (qlib::LException &e) {
        // intr elem contains invalid data --> ignore serialization
        LOG_DPRINTLN("AtomIntr> Write intr-elem failed: %s", e.getFmtMsg().c_str());
      }
      
      break;
    }

    default:
      // invalid/none
      break;
    }
    
  }

}

void AtomIntrRenderer::readFrom2(qlib::LDom2Node *pNode)
{
  super_t::readFrom2(pNode);

  for (pNode->firstChild(); pNode->hasMoreChild(); pNode->nextChild()) {
    qlib::LDom2Node *pChNode = pNode->getCurChild();
    LString tag = pChNode->getTagName();
    //LString type_name = pChNode->getTypeName();

    AtomIntrData data;
    if (tag.equals("line")) {
      data.nmode = 1;
      if (!readFrom2Helper(pChNode, 1, data.elem0)) {
        LOG_DPRINTLN("AtomIntrRenderer::readFrom2> ERROR, Invalid file format 1!!");
        continue;
      }
      if (!readFrom2Helper(pChNode, 2, data.elem1)) {
        LOG_DPRINTLN("AtomIntrRenderer::readFrom2> ERROR, Invalid file format 2!!");
        continue;
      }
    }
    else if (tag.equals("angle")) {
      data.nmode = 2;
      if (!readFrom2Helper(pChNode, 1, data.elem0)) {
        LOG_DPRINTLN("AtomIntrRenderer::readFrom2> ERROR, Invalid file format 1!!");
        continue;
      }
      if (!readFrom2Helper(pChNode, 2, data.elem1)) {
        LOG_DPRINTLN("AtomIntrRenderer::readFrom2> ERROR, Invalid file format 2!!");
        continue;
      }
      if (!readFrom2Helper(pChNode, 3, data.elem2)) {
        LOG_DPRINTLN("AtomIntrRenderer::readFrom2> ERROR, Invalid file format 3!!");
        continue;
      }
    }
    else if (tag.equals("torsion")) {
      data.nmode = 3;
      if (!readFrom2Helper(pChNode, 1, data.elem0)) {
        LOG_DPRINTLN("AtomIntrRenderer::readFrom2> ERROR, Invalid file format 1!!");
        continue;
      }
      if (!readFrom2Helper(pChNode, 2, data.elem1)) {
        LOG_DPRINTLN("AtomIntrRenderer::readFrom2> ERROR, Invalid file format 2!!");
        continue;
      }
      if (!readFrom2Helper(pChNode, 3, data.elem2)) {
        LOG_DPRINTLN("AtomIntrRenderer::readFrom2> ERROR, Invalid file format 3!!");
        continue;
      }
      if (!readFrom2Helper(pChNode, 4, data.elem3)) {
        LOG_DPRINTLN("AtomIntrRenderer::readFrom2> ERROR, Invalid file format 4!!");
        continue;
      }
    }

    m_data.push_back(data);
  }

}

bool AtomIntrRenderer::readFrom2Helper(qlib::LDom2Node *pNode, int nOrder,
                                       AtomIntrElem &elem)
{
  LString key, value;

  key = LString::format("mol%d", nOrder);
  if (pNode->findChild(key)) {
    value = pNode->getStrAttr(key);
    elem.setMolName(value);
  }
  else {
    elem.setMolName(LString());
  }

  key = LString::format("aid%d", nOrder);
  if (pNode->findChild(key)) {
    value = pNode->getStrAttr(key);
    int aid;
    if (value.toInt(&aid)) {
      // number type aid (obsolete)
      elem.setAtomID(aid);
      return true;
    }

    if (value.isEmpty()) return false;

    // string AID (A.123.CA form)
    elem.setAtomID(-1);
    elem.strAid = value;
    return true;
  }

  key = LString::format("sel%d", nOrder);
  if (pNode->findChild(key)) {
    value = pNode->getStrAttr(key);
    
    if (value.isEmpty()) return false;

    SelCommandPtr pSel1(MB_NEW SelCommand());
    if (!pSel1->compile(value))
      return false;

    elem.setSel(pSel1);
    return true;
  }

  key = LString::format("pos%d", nOrder);
  if (pNode->findChild(key)) {
    value = pNode->getStrAttr(key);
    Vector4D vec;
    if (!Vector4D::fromStringS(value, vec))
      return false;
    elem.setPos(vec);
    return true;
  }

  return false;
}

bool AtomIntrRenderer::isTransp() const
{
  if (isShowLabel())
    return true;
  else
    return super_t::isTransp();
    //return false;
}

LString AtomIntrRenderer::formatAidatJSON(const AtomIntrElem &aie) const
{
  LString rval;
  
  switch (aie.nMode) {
  case AtomIntrElem::AI_SEL:
    rval = aie.pSel->toString();
    break;

  case AtomIntrElem::AI_AID: {
    MolCoordPtr pmol = ensureNotNull( evalMol(aie) );
    MolAtomPtr pA1;
    if (aie.nAtomID<0) {
      int aid = pmol->fromStrAID(aie.strAid);
      pA1 = pmol->getAtom(aid);
    }
    else
      pA1 = pmol->getAtom(aie.nAtomID);

    if (pA1.isnull())
      return rval;

    if (aie.nAtomID<0) {
      // update cache value
      (const_cast<AtomIntrElem &>(aie)).nAtomID = pA1->getID();
    }
    rval = pA1->formatMsg();
    break;
  }
    
  case AtomIntrElem::AI_POS:
    rval = LString::format("(%.2f,%.2f,%.2f)", aie.pos.x(), aie.pos.y(), aie.pos.z());
    break;

  default:
    MB_ASSERT(false);
    break;
  }

  return rval;
}

LString AtomIntrRenderer::getDefsJSON() const
{
  LString rval;

  rval += "[";

  int i=0;
  bool bstart = true;
  BOOST_FOREACH(const AtomIntrData &value, m_data) {
    if (value.nmode>0) {
      if (bstart) {
        rval += "{";
        bstart = false;
      }
      else {
        rval += ",{";
      }

      rval += LString::format("\"id\": %d,", i);
      switch (value.nmode) {
      case 1:
        // distance label
        rval += "\"mode\": 1,";
        rval += "\"a0\": \""+formatAidatJSON(value.elem0)+"\",";
        rval += "\"a1\": \""+formatAidatJSON(value.elem1)+"\"";
        break;
      case 2:
        // angle label
        rval += "\"mode\": 2,";
        rval += "\"a0\": \""+formatAidatJSON(value.elem0)+"\",";
        rval += "\"a1\": \""+formatAidatJSON(value.elem1)+"\",";
        rval += "\"a2\": \""+formatAidatJSON(value.elem2)+"\"";
        break;
      case 3:
        // torsion label
        rval += "\"mode\": 3,";
        rval += "\"a0\": \""+formatAidatJSON(value.elem0)+"\",";
        rval += "\"a1\": \""+formatAidatJSON(value.elem1)+"\",";
        rval += "\"a2\": \""+formatAidatJSON(value.elem2)+"\",";
        rval += "\"a3\": \""+formatAidatJSON(value.elem3)+"\"";
        break;
      }
      rval += "}";
    }
    ++i;
  }

  rval += "]";
  return rval;
}


void AtomIntrRenderer::displayLabels(DisplayContext *pdc)
{
  if (m_bShowLabel) {
    m_pixCache.setFont(m_dFontSize, m_strFontName, m_strFontStyle, m_strFontWgt);
    pdc->color(m_pcolor);
    m_pixCache.draw(pdc);
  }
}

