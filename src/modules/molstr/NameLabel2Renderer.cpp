// -*-Mode: C++;-*-
//
//  Name label renderer class
//

#include <common.h>
#include "NameLabel2Renderer.hpp"

#include "MolCoord.hpp"
#include "MolChain.hpp"
#include "MolResidue.hpp"

#include <gfx/DisplayContext.hpp>
#include <gfx/Texture.hpp>
#include <qsys/SceneManager.hpp>

using namespace molstr;

NameLabel2Renderer::NameLabel2Renderer()
     : super_t()
{
  m_pdata = MB_NEW NameLabel2List;

  m_strFontStyle = "normal";
  m_strFontWgt = "normal";
  m_bScaling = false;
  m_dPixPerAng = 10.0;
}

NameLabel2Renderer::~NameLabel2Renderer()
{
  m_pdata->clear();
  delete m_pdata;
}

//////////////////////////////////////////////////////////////////////////

bool NameLabel2Renderer::isCompatibleObj(qsys::ObjectPtr pobj) const
{
  MolCoord *ptest = dynamic_cast<MolCoord *>(pobj.get());
  return ptest!=NULL;
}

LString NameLabel2Renderer::toString() const
{
  return LString::format("NameLabel2Renderer %p", this);
}

bool NameLabel2Renderer::isHitTestSupported() const
{
  return false;
}

const char *NameLabel2Renderer::getTypeName() const
{
  return "*namelabel2";
}

Vector4D NameLabel2Renderer::getCenter() const
{
  // TO DO: throw NoCenterException
  return Vector4D();
}

//////////////////////////////////////////////////////////////////////////
// old renderer interface implementations

/// Invalidate the display cache
void NameLabel2Renderer::invalidateDisplayCache()
{
  // // clean-up internal data
  // clearAllLabelPix();

  // clean-up display list
  super_t::invalidateDisplayCache();
}

void NameLabel2Renderer::preRender(DisplayContext *pdc)
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

void NameLabel2Renderer::postRender(DisplayContext *pdc)
{
  pdc->popMatrix();
  pdc->enableDepthTest(true);
}

void NameLabel2Renderer::render(DisplayContext *pdc)
{
  if (!pdc->isRenderPixmap())
    return;
  
  MolCoordPtr pMol = getClientMol();
  if (pMol.isnull()) {
    MB_DPRINTLN("NameLabel2Renderer::render> Client mol is null");
    return;
  }
  
  double sclx = pdc->getPixSclFac();

  LString strlab;
  Vector4D pos;
  MolAtomPtr pA;

  for (NameLabel2 &lab : *m_pdata) {
    if (lab.m_pPixBuf==NULL) {
      strlab = makeLabelStr(lab);
      lab.m_pPixBuf = createPixBuf(sclx, strlab);
    }

    pA = pMol->getAtom(lab.aid);
    pos = pA->getPos();
    pdc->drawPixels(pos, *lab.m_pPixBuf, m_pcolor);
  }
}

//////////////////////////////////////////////////////////////////////////
// Label specific implementations

LString NameLabel2Renderer::makeLabelStr( NameLabel2 &lab)
{
  LString rstrlab;
  
  MolCoordPtr pobj = getClientMol();
  MB_ASSERT(!pobj.isnull());
  
  if (lab.aid<0) {
    lab.aid = pobj->fromStrAID(lab.strAid);
    if (lab.aid<0)
      return LString("(null)");
  }

  MolAtomPtr pAtom = pobj->getAtom(lab.aid);
  if (pAtom.isnull())
    return LString("(null)");
  
  if (!lab.str.isEmpty()) {
    rstrlab = lab.str;
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
  
  return rstrlab;
}

gfx::PixelBuffer *NameLabel2Renderer::createPixBuf(double scl, const LString &lab)
{
  auto pixbuf = MB_NEW gfx::PixelBuffer();
  pixbuf->renderText(scl, lab, m_dFontSize, m_strFontName, m_strFontStyle, m_strFontWgt);
  return pixbuf;
}

bool NameLabel2Renderer::addLabel(MolAtomPtr patom, const LString &label /*= LString()*/)
{
  NameLabel2 newlab;
  newlab.aid = patom->getID();
  if (!label.isEmpty())
    newlab.str = label;

  for (NameLabel2 &lab : *m_pdata) {
    if (newlab.equals(lab))
      return false; // already labeled
  }

  m_pdata->push_back(newlab);

  // to be redrawn
  invalidateDisplayCache();

  return true;
}

bool NameLabel2Renderer::addLabelByID(int aid, const LString &label /*= LString()*/)
{
  MolCoordPtr pobj = getClientMol();
  MB_ASSERT(!pobj.isnull());
  
  MolAtomPtr pAtom = pobj->getAtom(aid);
  return addLabel(pAtom, label);
}

bool NameLabel2Renderer::removeLabelByID(int aid)
{
  MolCoordPtr pobj = getClientMol();
  MB_ASSERT(!pobj.isnull());
  
  NameLabel2List::iterator iter = m_pdata->begin();
  NameLabel2List::iterator eiter = m_pdata->end();
  for (; iter!=eiter; ++iter) {
    NameLabel2 &lab = *iter;
    if (aid==lab.aid) {
      // already labeled --> remove it
      m_pdata->erase(iter);

      // to be redrawn
      invalidateDisplayCache();
      
      return true;
    }
  }

  // no label removed
  return false;
}

void NameLabel2Renderer::setFontSize(double val)
{
  if (qlib::isNear4(m_dFontSize, val))
    return;

  m_dFontSize = val;

  // font info was changed --> clear label image data
  clearAllLabelPix();
}

void NameLabel2Renderer::setFontName(const LString &val)
{
  if (m_strFontName.equals(val))
    return;
  
  m_strFontName = val;

  // font info was changed --> clear label image data
  clearAllLabelPix();
}

void NameLabel2Renderer::setFontStyle(const LString &val)
{
  if (m_strFontStyle.equals(val))
    return;

  m_strFontStyle = val;

  // font info was changed --> clear label image data
  clearAllLabelPix();
}

void NameLabel2Renderer::setFontWgt(const LString &val)
{
  if (m_strFontWgt.equals(val))
    return;

  m_strFontWgt = val;

  // font info was changed --> clear label image data
  clearAllLabelPix();
}

void NameLabel2Renderer::setScaling(bool b)
{
  if (m_bScaling==b)
    return;
  m_bScaling = b;

  clearAllLabelPix();
} 

void NameLabel2Renderer::setRotTh(double th)
{
  m_dRotTh = th;
}

/// clear all label images
void NameLabel2Renderer::clearAllLabelPix()
{
  for (NameLabel2 &value : *m_pdata) {
    if (value.m_pPixBuf!=NULL)
      delete value.m_pPixBuf;
    value.m_pPixBuf = NULL;
  }
  
  // clear display list
  invalidateDisplayCache();
}

///////////////////////

void NameLabel2Renderer::propChanged(qlib::LPropEvent &ev)
{
  const LString propnm = ev.getName();
  if (propnm.equals("color")) {
    invalidateDisplayCache();
  }

  super_t::propChanged(ev);
}

void NameLabel2Renderer::styleChanged(qsys::StyleEvent &ev)
{
  super_t::styleChanged(ev);

  // TO DO: ignore non-relevant styleChanged message

  // style-change may include the change of font settings
  // --> clear label image data
  clearAllLabelPix();
}

///////////////////////

void NameLabel2Renderer::writeTo2(qlib::LDom2Node *pNode) const
{
  // write properties
  super_t::writeTo2(pNode);

  MolCoordPtr pobj = getClientMol();
  MB_ASSERT(!pobj.isnull());
  
  BOOST_FOREACH(NameLabel2 &value, *m_pdata) {

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

void NameLabel2Renderer::readFrom2(qlib::LDom2Node *pNode)
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
      
    NameLabel2 elem;
    elem.aid = -1;
    elem.strAid = value;

    m_pdata->push_back(elem);
  }
  
}

