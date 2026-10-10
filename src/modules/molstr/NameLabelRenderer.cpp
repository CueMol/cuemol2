// -*-Mode: C++;-*-
//
//  Name label renderer class
//
// $Id: NameLabelRenderer.cpp,v 1.15 2011/05/02 14:51:29 rishitani Exp $

#include <common.h>
#include "NameLabelRenderer.hpp"

#include "MolCoord.hpp"
#include "MolChain.hpp"
#include "MolResidue.hpp"
#include "LabelFormat.hpp"

#include <gfx/PixelBuffer.hpp>
//#include <gfx/TextRenderManager.hpp>
#include <gfx/DisplayContext.hpp>
#include <qsys/SceneManager.hpp>

namespace molstr {

  struct NameLabel
  {
  public:

    NameLabel(): m_nCacheID(-1)
    {
    }

    NameLabel(const NameLabel &arg)
         : aid(arg.aid), strAid(arg.strAid), str(arg.str), fmt(arg.fmt), m_nCacheID(arg.m_nCacheID)
    {
    }

    /// Target atom ID
    int aid;

    /// Target atom in string representation
    LString strAid;

    /// Custom label string, shown as is (set by the PSE importer)
    LString str;

    /// Label format (LabelFormat); empty for the renderer's format
    LString fmt;

    /// cache entry ID
    int m_nCacheID;

    inline bool equals(const NameLabel &a) const {
      return aid==a.aid;
    }
  };

  //typedef std::list<NameLabel> NameLabelList;
  struct NameLabelList : public std::deque<NameLabel> {};

}

//////////////////////////////////////////////////////////////////////////

using namespace molstr;

NameLabelRenderer::NameLabelRenderer()
     : super_t()
{
  m_pdata = MB_NEW NameLabelList;

  //m_nMax = 5;
  //m_xdispl = 0.0;
  //m_ydispl = 0.0;

  m_strFontStyle = "normal";
  m_strFontWgt = "normal";
  m_bLabelOnTop = false;
  m_nHAlign = HALIGN_LEFT;
  m_nVAlign = VALIGN_BOTTOM;

  // will be called by RendererFactory
  //resetAllProps();
}

NameLabelRenderer::~NameLabelRenderer()
{
  delete m_pdata;
}

//////////////////////////////////////////////////////////////////////////

MolCoordPtr NameLabelRenderer::getClientMol() const
{
  qsys::ObjectPtr robj = qsys::SceneManager::getObjectS(getClientObjID());
  if (robj.isnull()) return MolCoordPtr();
  return MolCoordPtr(robj);
}

bool NameLabelRenderer::isCompatibleObj(qsys::ObjectPtr pobj) const
{
  MolCoord *ptest = dynamic_cast<MolCoord *>(pobj.get());
  return ptest!=NULL;
}

LString NameLabelRenderer::toString() const
{
  return LString::format("NameLabelRenderer %p", this);
}

//////////////////////////////////////////////////////////////////////////

void NameLabelRenderer::display(DisplayContext *pdc)
{
  // if pdc target is file, label should be rendered here
  //  (displayLabels() won't be called...)
  if (pdc->isFile()) {
    preRender(pdc);
    render(pdc);
    postRender(pdc);
  }
}

void NameLabelRenderer::displayLabels(DisplayContext *pdc)
{
  MB_DPRINTLN("NameLabelRenderer::displayLabels> called");
  if (!pdc->isFile()) {
    preRender(pdc);
    render(pdc);
    postRender(pdc);
  }
}

void NameLabelRenderer::preRender(DisplayContext *pdc)
{
  Vector4D dv;
  qsys::View *pview = pdc->getTargetView();
  if (pview!=NULL)
    pview->convXYTrans(m_xdispl, m_ydispl, dv);

  pdc->enableDepthTest(false);
  if (m_bLabelOnTop)
    pdc->setDepthTestEnabled(false);

  pdc->pushMatrix();
  pdc->translate(dv);

//  pdc->color(m_color);
  pdc->setLighting(false);
}

void NameLabelRenderer::postRender(DisplayContext *pdc)
{
  pdc->popMatrix();
  if (m_bLabelOnTop)
    pdc->setDepthTestEnabled(true);
  pdc->enableDepthTest(true);
}

bool NameLabelRenderer::makeLabelStr(NameLabel &nlab, LString &rstrlab, Vector4D &rpos)
{
  MolCoordPtr pobj = getClientMol();
  MB_ASSERT(!pobj.isnull());
  
  if (nlab.aid<0) {
    nlab.aid = pobj->fromStrAID(nlab.strAid);
    if (nlab.aid<0)
      return false;
  }

  MolAtomPtr pAtom = pobj->getAtom(nlab.aid);
  if (pAtom.isnull())
    return false;

  rpos = pAtom->getPos();

  // The literal text wins, then this label's format, then the renderer's.
  const LString &fmtstr = nlab.fmt.isEmpty() ? m_strFormat : nlab.fmt;
  if (!nlab.str.isEmpty()) {
    rstrlab = nlab.str;
  }
  else if (!fmtstr.isEmpty()) {
    try {
      rstrlab = LabelFormat(fmtstr).apply(pAtom);
    }
    catch (const qlib::LException &e) {
      // Only a format read from a file can be invalid here: the setters
      // check theirs. Show the built-in text rather than nothing.
      LOG_DPRINTLN("NameLabelRenderer> %s", e.getMsg().c_str());
      rstrlab = pAtom->getChainName() + " " + pAtom->getResName() +
                pAtom->getResIndex().toString() + " " + pAtom->getName();
    }
  }
  else {
    LString sbuf = pAtom->getChainName() + " " +
      pAtom->getResName() +
        pAtom->getResIndex().toString() + " " +
          pAtom->getName();
    char confid = pAtom->getConfID();
    if (confid)
      sbuf += LString(":") + LString(confid);
    
    rstrlab = sbuf; //.toUpperCase();
  }
  
  return true;
}

void NameLabelRenderer::render(DisplayContext *pdc)
{
  if (!pdc->isRenderPixmap())
    return;
  
  MolCoordPtr rCliMol = getClientMol();
  if (rCliMol.isnull()) {
    MB_DPRINTLN("NameLabelRenderer::render> Client mol is null");
    return;
  }
  
  /*if (m_pixCache.isEmpty())*/ {
    LString strlab;
    Vector4D pos;
    NameLabelList::iterator iter = m_pdata->begin();
    NameLabelList::iterator eiter = m_pdata->end();
    for (; iter!=eiter; iter++) {
      NameLabel &nlab = *iter;
      if (nlab.m_nCacheID<0) {
        // a label whose atom is gone keeps m_nCacheID<0 instead of
        // reusing the string/position of the previous label
        if (makeLabelStr(nlab, strlab, pos))
          nlab.m_nCacheID = m_pixCache.addString(pos, strlab);
      }
    }
  }
  
  m_pixCache.setFont(m_dFontSize, m_strFontName, m_strFontStyle, m_strFontWgt);
  // HALIGN_* / VALIGN_* run 0, 1, 2 from left / bottom
  m_pixCache.setAnchor(0.5f * m_nHAlign, 0.5f * m_nVAlign);
  pdc->color(m_color);
  m_pixCache.draw(pdc);

  // if (pdc->isFile())
  // m_pixCache.draw(pdc, false); // force to ignore cached data
  //   else
  // m_pixCache.draw(pdc, true); // reuse cached label images
}

Vector4D NameLabelRenderer::getCenter() const
{
  // TO DO: throw NoCenterException
  return Vector4D();
}

bool NameLabelRenderer::isHitTestSupported() const
{
  return false;
}

const char *NameLabelRenderer::getTypeName() const
{
  return "*namelabel";
}

//////////////////////////////////////////////////////////////////////////
// Label operations

bool NameLabelRenderer::addLabel(MolAtomPtr patom, const LString &label /*= LString()*/)
{
  NameLabel newlab;
  newlab.aid = patom->getID();
  if (!label.isEmpty())
    newlab.str = label;

  BOOST_FOREACH(NameLabel &nlab, *m_pdata) {
    if (newlab.equals(nlab))
      return false; // already labeled
  }

  m_pdata->push_back(newlab);
  int nover = m_pdata->size() - m_nMax;

  for (; nover>0; nover--) {
    NameLabel &nlab = m_pdata->front();
    if (nlab.m_nCacheID>=0)
      m_pixCache.remove(nlab.m_nCacheID);
    m_pdata->pop_front();
  }
  
  // makeLabelImg();

  // to be redrawn
  qsys::ScenePtr pScene = getScene();
  if (!pScene.isnull())
    pScene->setUpdateFlag();

  return true;
}

bool NameLabelRenderer::addLabelByID(int aid, const LString &label /*= LString()*/)
{
  MolCoordPtr pobj = getClientMol();
  MB_ASSERT(!pobj.isnull());
  
  MolAtomPtr pAtom = pobj->getAtom(aid);
  if (pAtom.isnull()) {
    LOG_DPRINTLN("NameLabelRenderer> atom %d not found", aid);
    return false;
  }
  return addLabel(pAtom, label);
}

bool NameLabelRenderer::setLabelFormat(int aid, const LString &fmtstr)
{
  // Checked here so a bad format fails the call, not a later draw.
  if (!fmtstr.isEmpty())
    LabelFormat check(fmtstr);

  MolCoordPtr pobj = getClientMol();
  MB_ASSERT(!pobj.isnull());
  MolAtomPtr pAtom = pobj->getAtom(aid);
  if (pAtom.isnull()) {
    LOG_DPRINTLN("NameLabelRenderer> atom %d not found", aid);
    return false;
  }

  BOOST_FOREACH(NameLabel &nlab, *m_pdata) {
    if (nlab.aid != aid)
      continue;
    // Relabel: drop the cached image so render() makes the new text.
    nlab.fmt = fmtstr;
    nlab.str = LString();
    if (nlab.m_nCacheID >= 0) {
      m_pixCache.remove(nlab.m_nCacheID);
      nlab.m_nCacheID = -1;
    }
    qsys::ScenePtr pScene = getScene();
    if (!pScene.isnull())
      pScene->setUpdateFlag();
    return true;
  }

  if (!addLabel(pAtom))
    return false;
  m_pdata->back().fmt = fmtstr;
  return true;
}

void NameLabelRenderer::setFormat(const LString &val)
{
  if (!val.isEmpty())
    LabelFormat check(val);
  if (val.equals(m_strFormat))
    return;
  m_strFormat = val;
  // every label without its own format changes text
  invalidateAll();
}

bool NameLabelRenderer::removeLabelByID(int aid)
{
  MolCoordPtr pobj = getClientMol();
  MB_ASSERT(!pobj.isnull());
  
  MolAtomPtr pAtom = pobj->getAtom(aid);
  // return removeLabel(pAtom);

  NameLabelList::iterator iter = m_pdata->begin();
  NameLabelList::iterator eiter = m_pdata->end();
  for (; iter!=eiter; ++iter) {
    NameLabel &nlab = *iter;
    if (aid==nlab.aid) {
      // already labeled --> remove it
      if (nlab.m_nCacheID>=0)
        m_pixCache.remove(nlab.m_nCacheID);
      m_pdata->erase(iter);

      //makeLabelImg();
      //m_pixCache.invalidate();
      //m_pixCache.render();
      
      // to be redrawn
      qsys::ScenePtr pScene = getScene();
      if (!pScene.isnull())
        pScene->setUpdateFlag();
      
      return true;
    }
  }

  // no label removed
  return false;
}

void NameLabelRenderer::setFontSize(double val)
{
  if (qlib::isNear4(m_dFontSize, val))
    return;

  m_dFontSize = val;

  // font info was changed --> invalidate all cached data
  invalidateAll();
}

void NameLabelRenderer::setFontName(const LString &val)
{
  if (m_strFontName.equals(val))
    return;
  
  m_strFontName = val;

  // font info was changed --> invalidate all cached data
  invalidateAll();
}

void NameLabelRenderer::setFontStyle(const LString &val)
{
  if (m_strFontStyle.equals(val))
    return;

  m_strFontStyle = val;

  // font info was changed --> invalidate all cached data
  invalidateAll();
}

void NameLabelRenderer::setFontWgt(const LString &val)
{
  if (m_strFontWgt.equals(val))
    return;

  m_strFontWgt = val;

  // font info was changed --> invalidate all cached data
  invalidateAll();
}

/// clear all cached data
void NameLabelRenderer::invalidateAll()
{
  m_pixCache.invalidateAll();
  BOOST_FOREACH(NameLabel &value, *m_pdata) {
    value.m_nCacheID = -1;
  }  
}

///////////////////////

void NameLabelRenderer::propChanged(qlib::LPropEvent &ev)
{
  // Labels are drawn every frame outside any display list, so every
  // property (color, offset, font, label_on_top, ...) only needs a redraw.
  qsys::ScenePtr pScene = getScene();
  if (!pScene.isnull())
    pScene->setUpdateFlag();

  super_t::propChanged(ev);
}

void NameLabelRenderer::styleChanged(qsys::StyleEvent &ev)
{
  super_t::styleChanged(ev);

  // TO DO: ignore non-relevant styleChanged message
  MB_DPRINTLN("style changed");
  invalidateAll();
 
  qsys::ScenePtr pScene = getScene();
  if (!pScene.isnull())
    pScene->setUpdateFlag();

  //makeLabelImg();
  //m_pixCache.render();
}

void NameLabelRenderer::objectChanged(qsys::ObjectEvent &ev)
{
  int ntyp = ev.getType();

  if (ntyp==qsys::ObjectEvent::OBE_CHANGED) {
    invalidateAll();
    return;
  }
  
  if (ntyp==qsys::ObjectEvent::OBE_PROPCHG) {
    qlib::LPropEvent *pPE = ev.getPropEvent();
    if (pPE && pPE->getName().equals("xformMat")) {
      invalidateAll();
      return;
    }
  }

  super_t::objectChanged(ev);
}

///////////////////////

void NameLabelRenderer::writeTo2(qlib::LDom2Node *pNode) const
{
  // write properties
  super_t::writeTo2(pNode);

  MolCoordPtr pobj = getClientMol();
  MB_ASSERT(!pobj.isnull());
  
  BOOST_FOREACH(NameLabel &value, *m_pdata) {

    // A label read from a file keeps its atom as text until it is first
    // drawn (makeLabelStr resolves it); write that text back rather than
    // dropping the label.
    LString said = value.aid >= 0 ? pobj->toStrAID(value.aid) : value.strAid;
    if (said.isEmpty())
      continue;

    qlib::LDom2Node *pChNode = pNode->appendChild("label");
    // always in child element
    pChNode->setAttrFlag(false);

    // add atom attribute
    pChNode->appendStrAttr("aid", said);
    // Written only when set, so a label with the built-in text is stored
    // exactly as before.
    if (!value.str.isEmpty())
      pChNode->appendStrAttr("str", value.str);
    if (!value.fmt.isEmpty())
      pChNode->appendStrAttr("format", value.fmt);
  }
}

void NameLabelRenderer::readFrom2(qlib::LDom2Node *pNode)
{
  super_t::readFrom2(pNode);

  for (pNode->firstChild(); pNode->hasMoreChild(); pNode->nextChild()) {
    qlib::LDom2Node *pChNode = pNode->getCurChild();
    LString tag = pChNode->getTagName();

    if (!tag.equals("label")) {
      // error
      continue;
    }

    if (!pChNode->findChild("aid")) {
      // error
      continue;
    }

    LString value = pChNode->getStrAttr("aid");
    if (value.isEmpty()) {
      // error
      continue;
    }
      
    NameLabel elem;
    elem.aid = -1;
    elem.strAid = value;
    if (pChNode->findChild("str"))
      elem.str = pChNode->getStrAttr("str");
    if (pChNode->findChild("format"))
      elem.fmt = pChNode->getStrAttr("format");

    m_pdata->push_back(elem);
  }
  
}

