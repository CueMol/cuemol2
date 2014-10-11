// -*-Mode: C++;-*-
//
//  Paint coloring class implementation
//
//  $Id: PaintColoring.cpp,v 1.12 2011/01/23 07:25:32 rishitani Exp $

#include <common.h>
#include "molvis.hpp"
#include "PaintColoring.hpp"

#include <qlib/LDOM2Tree.hpp>
#include <qlib/LPropEvent.hpp>
#include <qlib/LVariant.hpp>
#include <qlib/ObjectManager.hpp>
#include <qlib/NestedPropHandler.hpp>
#include <qsys/PropEditInfo.hpp>
#include <qsys/Scene.hpp>

using namespace molvis;
using namespace molstr;
using gfx::ColorPtr;

namespace {

class PaintColorEvent : public qlib::LPropEvent
{
public:
  PaintColorEvent() : qlib::LPropEvent() {}
  PaintColorEvent(const LString &name) : qlib::LPropEvent(name) {}

  /// Internal data structure is changed by non-setter method(s)
  /// (i.e. append/insertBefore, etc)
  virtual bool isIntrDataChanged() const { return true; }
};

class PaintColorEditInfo : public qsys::PropEditInfoBase
{
public:
  enum {
    PCE_ADD,
    PCE_REMOVE,
    PCE_CHANGE,
    PCE_REMOVE_ALL
  };

  int m_nMode;

  int m_nInsBefore;
  SelectionPtr m_pSel;
  ColorPtr m_pCol;

  // for PCE_CHANGE
  SelectionPtr m_pOldSel;
  ColorPtr m_pOldCol;

  PaintColorEditInfo()
  {
  }

  virtual ~PaintColorEditInfo()
  {
  }

  //////////

  PaintColoring *getTargetColoring() const
  {
    qlib::LPropSupport *pTgtRoot = getTarget();
    if (pTgtRoot==NULL) return NULL;

    qlib::NestedPropHandler nph(getPropName(), pTgtRoot);
    qlib::LPropSupport *pTgt = nph.apply();
    qlib::LVariant lvar;
    if (!pTgt->getProperty(nph.last_name(), lvar))
      return NULL;
    if (!lvar.isObject())
      return NULL;
    qlib::LScriptable *pScr = lvar.getBareObjectPtr();
    PaintColoring *pTgtCol = dynamic_cast<PaintColoring*>(pScr);
    return pTgtCol;
  }

  /// Perform undo
  virtual bool undo()
  {
    MB_DPRINTLN("PaintColUndo mode=%d", m_nMode);

    PaintColoring *pTgtCol = getTargetColoring();
    if (pTgtCol==NULL)
      return false;
    
    switch (m_nMode) {
    case PCE_REMOVE:
      pTgtCol->insertBefore(m_nInsBefore, m_pSel, m_pCol);
      break;

    case PCE_ADD:
      pTgtCol->removeAt(m_nInsBefore);
      break;

    case PCE_CHANGE:
      pTgtCol->changeAt(m_nInsBefore, m_pOldSel, m_pOldCol);
      break;

    default:
      return false;
    }
    return true;
  }
  
  /// Perform redo
  virtual bool redo() {
    PaintColoring *pTgtCol = getTargetColoring();
    if (pTgtCol==NULL)
      return false;
    
    switch (m_nMode) {
    case PCE_REMOVE:
      pTgtCol->removeAt(m_nInsBefore);
      break;

    case PCE_ADD:
      pTgtCol->insertBefore(m_nInsBefore, m_pSel, m_pCol);
      break;

    case PCE_CHANGE:
      pTgtCol->changeAt(m_nInsBefore, m_pSel, m_pCol);
      break;

    default:
      return false;
    }
    return true;
  }
  
  virtual bool isUndoable() const {
    if (m_pSel.isnull() || m_pCol.isnull()) return false;
    return true;
  }
  virtual bool isRedoable() const {
    if (m_pSel.isnull() || m_pCol.isnull()) return false;
    return true;
  }

};


}

///////////////////////////////////////////////////

PaintColoring::PaintColoring()
{
  resetAllProps();
}

PaintColoring::~PaintColoring()
{
}

bool PaintColoring::getAtomColor(MolAtomPtr pAtom, ColorPtr &color)
{
  BOOST_FOREACH(const PaintTuple &pt, m_coltab) {
    if (pt.first->isSelected(pAtom)) {
      color = pt.second;
      return true;
    }
  }

  return false;
}

qsys::ScenePtr PaintColoring::getScene() const
{
  qsys::ScenePtr pScene;

  qlib::uid_t rootuid = getRootUID();
  if (rootuid==qlib::invalid_uid)
    return pScene;

  {
    // try renderer
    qsys::Renderer *pTgtRoot =
      qlib::ObjectManager::sGetObj<qsys::Renderer>(rootuid);
    if (pTgtRoot!=NULL)
      return pTgtRoot->getScene();
  }
  
  {
    // try object
    qsys::Object *pTgtRoot =
      qlib::ObjectManager::sGetObj<qsys::Object>(rootuid);
    if (pTgtRoot!=NULL)
      return pTgtRoot->getScene();
  }

  return pScene;
}

void PaintColoring::append(const SelectionPtr &psel, const ColorPtr &color)
{
  m_coltab.push_back(PaintTuple(psel, color));

  // setup undo infor
  qsys::UndoUtil uu(getScene());
  if (uu.isOK()) {
    PaintColorEditInfo *pInfo = MB_NEW PaintColorEditInfo();
    pInfo->m_nMode = PaintColorEditInfo::PCE_ADD;
    pInfo->m_nInsBefore = m_coltab.size();
    pInfo->m_pSel = psel;
    pInfo->m_pCol = color;
    pInfo->setup(this);
    uu.add(pInfo);
  }

  // fire event
  PaintColorEvent ev(m_thisname);
  nodePropChgImpl(ev);
}

void PaintColoring::insertBefore(int ind, const SelectionPtr &psel, const ColorPtr &color)
{
  if (ind>=m_coltab.size() || ind<0) {
    append(psel, color);
    return;
  }

  ColorTab::iterator iter = m_coltab.begin()+ind;
  m_coltab.insert(iter, PaintTuple(psel, color));

  // setup undo info
  qsys::UndoUtil uu(getScene());
  if (uu.isOK()) {
    PaintColorEditInfo *pInfo = MB_NEW PaintColorEditInfo();
    pInfo->m_nMode = PaintColorEditInfo::PCE_ADD;
    pInfo->m_nInsBefore = ind;
    pInfo->m_pSel = psel;
    pInfo->m_pCol = color;
    pInfo->setup(this);
    uu.add(pInfo);
  }

  // fire event
  PaintColorEvent ev(m_thisname);
  nodePropChgImpl(ev);
}

bool PaintColoring::removeAtImpl(int ind)
{
  if (ind>=m_coltab.size())
    return false;

  ColorTab::iterator iter = m_coltab.begin()+ind;
  SelectionPtr psel = iter->first;
  ColorPtr pcol = iter->second;
  m_coltab.erase(iter);

  // setup undo info
  qsys::UndoUtil uu(getScene());
  if (uu.isOK()) {
    PaintColorEditInfo *pInfo = MB_NEW PaintColorEditInfo();
    pInfo->m_nMode = PaintColorEditInfo::PCE_REMOVE;
    pInfo->m_nInsBefore = ind;
    pInfo->m_pSel = psel;
    pInfo->m_pCol = pcol;
    pInfo->setup(this);
    uu.add(pInfo);
  }

  return true;
}

bool PaintColoring::removeAt(int ind)
{
  if (!removeAtImpl(ind))
    return false;

  // fire event
  PaintColorEvent ev(m_thisname);
  nodePropChgImpl(ev);

  return true;
}

bool PaintColoring::changeAt(int ind, const SelectionPtr &psel, const ColorPtr &pcol)
{
  if (ind>=m_coltab.size()) return false;
  ColorTab::iterator iter = m_coltab.begin()+ind;

  SelectionPtr poldsel = iter->first;
  iter->first = psel;

  ColorPtr poldcol = iter->second;
  iter->second = pcol;

  // UndoInfo
  qsys::UndoUtil uu(getScene());
  if (uu.isOK()) {
    PaintColorEditInfo *pInfo = MB_NEW PaintColorEditInfo();
    pInfo->m_nMode = PaintColorEditInfo::PCE_CHANGE;
    pInfo->m_nInsBefore = ind;
    pInfo->m_pSel = psel;
    pInfo->m_pCol = pcol;
    pInfo->m_pOldSel = poldsel;
    pInfo->m_pOldCol = poldcol;
    pInfo->setup(this);
    uu.add(pInfo);
  }

  // PropEvent
  PaintColorEvent ev(m_thisname);
  nodePropChgImpl(ev);

  return true;
}

void PaintColoring::clear()
{
  // m_coltab.clear();
  while (m_coltab.size()>0) {
    removeAtImpl(0);
  }

  // PropEvent
  PaintColorEvent ev(m_thisname);
  nodePropChgImpl(ev);
}

//////////

ColorPtr PaintColoring::getColorAt(int ind) const
{
  if (ind>=m_coltab.size()) return ColorPtr();
  const PaintTuple &pt = m_coltab.at(ind);
  return pt.second;
}

SelectionPtr PaintColoring::getSelAt(int ind) const
{
  if (ind>=m_coltab.size()) return SelectionPtr();
  const PaintTuple &pt = m_coltab.at(ind);
  return pt.first;
}

//ColorPtr PaintColoring::applyMaskColor(const ColorPtr &c1)
//{
//  return ColorPtr(c1);
  //if (m_maskColor.r()!=255||m_maskColor.g()!=255||m_maskColor.b()!=255||m_maskColor.a()!=255)
  //return LColor(c1.fr()*m_maskColor.fr(),
  //c1.fg()*m_maskColor.fg(), c1.fb()*m_maskColor.fb(), c1.fa()*m_maskColor.fa());
  //  else
  //return c1;
//}

void PaintColoring::writeTo2(qlib::LDom2Node *pNode) const
{
  // write properties
  super_t::writeTo2(pNode);

  BOOST_FOREACH(const PaintTuple &pt, m_coltab) {
    qlib::LDom2Node *pChNode = pNode->appendChild("paint");
    // always in child element
    pChNode->setAttrFlag(false);

    {
      // write selection of tuple (maybe stored as attribute)
      //qlib::LDom2Node *pSelNode = pChNode->appendChild("sel");
      //pSelNode->setupByObject(pt.first.get());
      pChNode->appendStrAttr("sel", pt.first->toString());
    }
    {
      // write color of tuple (maybe stored as attribute)
      qlib::LDom2Node *pColNode = pChNode->appendChild("color");
      pColNode->setupByObject(pt.second.get());
    }

  }
}

void PaintColoring::readFrom2(qlib::LDom2Node *pNode)
{
  super_t::readFrom2(pNode);

  for (pNode->firstChild(); pNode->hasMoreChild(); pNode->nextChild()) {
    qlib::LDom2Node *pChNode = pNode->getCurChild();
    LString tag = pChNode->getTagName();
    //LString type_name = pChNode->getTypeName();

    if (!tag.equals("paint")) {
      continue;
    }

    if (pChNode->findChild("sel")==NULL) {
      LOG_DPRINTLN("PaintColoring.readFrom> no sel valule in paint tag!!");
      continue;
    }

    LString selstr = pChNode->getStrAttr("sel");
    SelectionPtr pSel(Selection::fromStringS(selstr));

    // LString colstr = pChNode->getStrAttr("color");
    // ColorPtr pCol(gfx::AbstractColor::fromStringS(colstr));

    qlib::LDom2Node *pColNode = pChNode->findChild("color");
    if (pColNode==NULL) {
      LOG_DPRINTLN("PaintColoring.readFrom> no color valule in paint tag!!");
      continue;
    }
    ColorPtr pCol(gfx::AbstractColor::fromNode(pColNode));

    append(pSel, pCol);
    //m_coltab.push_back(PaintTuple(pSel, pCol));
  }
}

