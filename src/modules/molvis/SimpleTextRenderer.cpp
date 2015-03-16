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

#include <gfx/PixelBuffer.hpp>
//#include <gfx/TextRenderManager.hpp>
#include <gfx/DisplayContext.hpp>
#include <qsys/SceneManager.hpp>

namespace molstr {

  struct NameLabel
  {
  public:
    NameLabel() {}
    NameLabel(const NameLabel &arg) : aid(arg.aid), strAid(arg.strAid), str(arg.str) {}

    /// Target atom ID
    int aid;

    /// Target atom in string representation
    LString strAid;

    /// Custom label string
    LString str;

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
  if (pdc->isFile()) {
    preRender(pdc);
    render(pdc);
    postRender(pdc);
  }
}

void NameLabelRenderer::displayLabels(DisplayContext *pdc)
{
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

  pdc->pushMatrix();
  pdc->translate(dv);

//  pdc->color(m_color);
  pdc->setLighting(false);
}

void NameLabelRenderer::postRender(DisplayContext *pdc)
{
  pdc->popMatrix();
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

  if (!nlab.str.isEmpty()) {
    rstrlab = nlab.str;
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
  // pdl->color(m_color);

  MolCoordPtr rCliMol = getClientMol();
  if (rCliMol.isnull()) {
    MB_DPRINTLN("NameLabelRenderer::render> Client mol is null");
    return;
  }
  
  if (m_pixCache.isEmpty()) {
    LString strlab;
    Vector4D pos;
    NameLabelList::iterator iter = m_pdata->begin();
    NameLabelList::iterator eiter = m_pdata->end();
    for (; iter!=eiter; iter++) {
      NameLabel &nlab = *iter;
      if (makeLabelStr(nlab, strlab, pos)) {
        m_pixCache.addString(pos, strlab);
      }
      else {
        MB_DPRINTLN("NameLabel: mklab failed in Atom %d", nlab.aid);
      }
    }
  }
  
  m_pixCache.setupFont(m_dFontSize, m_strFontName, m_strFontStyle, m_strFontWgt);
  pdc->color(m_color);
  if (pdc->isFile())
    m_pixCache.draw(pdc, false);
  else
    m_pixCache.draw(pdc);
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

void NameLabelRenderer::makeLabelImg()
{
  m_pixCache.invalidate();
  return;
/*
  LString strlab;
  Vector4D pos;
  NameLabelList::iterator iter = m_pdata->begin();
  NameLabelList::iterator eiter = m_pdata->end();
  for (; iter!=eiter; iter++) {
    NameLabel &nlab = *iter;
    if (makeLabelStr(nlab, strlab, pos)) {
      m_pixCache.addString(pos, strlab);
    }
    else {
      MB_DPRINTLN("NameLabel: mklab failed in Atom %d", nlab.aid);
    }
  }
  
  m_pixCache.setupFont(m_dFontSize, m_strFontName, m_strFontStyle, m_strFontWgt);
  m_pixCache.render();*/
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

  for (; nover>0; nover--)
    m_pdata->pop_front();

  makeLabelImg();
  //m_pixCache.invalidate();
  //m_pixCache.render();

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
  return addLabel(pAtom, label);
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
      m_pdata->erase(iter);

      makeLabelImg();
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

///////////////////////

void NameLabelRenderer::propChanged(qlib::LPropEvent &ev)
{
  const LString propnm = ev.getName();
  if (propnm.equals("color")) {
    //invalidateDisplayCache();
    // to be redrawn
    qsys::ScenePtr pScene = getScene();
    if (!pScene.isnull())
      pScene->setUpdateFlag();
  }
  else if (propnm.startsWith("font_")) {
    makeLabelImg();
    //m_pixCache.invalidate();
    //m_pixCache.render();
  }

  super_t::propChanged(ev);
}

void NameLabelRenderer::styleChanged(qsys::StyleEvent &ev)
{
  super_t::styleChanged(ev);
  makeLabelImg();
  //m_pixCache.invalidate();
  //m_pixCache.render();
}

void NameLabelRenderer::writeTo2(qlib::LDom2Node *pNode) const
{
  // write properties
  super_t::writeTo2(pNode);

  MolCoordPtr pobj = getClientMol();
  MB_ASSERT(!pobj.isnull());
  
  BOOST_FOREACH(NameLabel &value, *m_pdata) {

    LString said = pobj->toStrAID(value.aid);
    if (said.isEmpty())
      continue;

    qlib::LDom2Node *pChNode = pNode->appendChild("label");
    // always in child element
    pChNode->setAttrFlag(false);

    // add atom attribute
    pChNode->appendStrAttr("aid", said);
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

    m_pdata->push_back(elem);
  }
  
}

