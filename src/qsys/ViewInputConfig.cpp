// -*-Mode: C++;-*-
//
//  View input event configuration
//
//  $Id$

#include <common.h>

#include "ViewInputConfig.hpp"

#include "InDevEvent.hpp"

#include "style/StyleSheet.hpp"
#include "style/StyleMgr.hpp"
#include "style/StyleEditInfo.hpp"

using namespace qsys;

SINGLETON_BASE_IMPL(ViewInputConfig);

ViewInputConfig::ViewInputConfig()
{
  m_tbrad = 0.8;
  m_pStyles = MB_NEW StyleSheet();
  m_pStyles->setScopeID(0);
}

ViewInputConfig::~ViewInputConfig()
{
  delete m_pStyles;
}

bool ViewInputConfig::setBinding(int nID, int nModif)
{
  if (nID<0 || nID>EID_SIZE)
    return false;

  ModifMap::iterator iter = m_modifTab.find(nModif);
  if (iter!=m_modifTab.end()) {
    // remove the found entry
    m_modifTab.erase(iter);
  }

  // nModif==0 --> remove only
  if (nModif==0)
    return true;

  bool bOK = m_modifTab.insert(std::map<int,int>::value_type(nModif, nID)).second;
  MB_ASSERT(bOK);
  return bOK;
}

int ViewInputConfig::parseModifStr(const LString &str)
{
  std::list<LString> ls;
  str.split('|', ls);

  int nModif = 0;
  int nAxis = 0;
  BOOST_FOREACH (const LString &elem, ls) {
    LString telem = elem.trim(" \t\r\n");
    if (telem.equalsIgnoreCase("SHIFT"))
      nModif |= INDEV_SHIFT;
    if (telem.equalsIgnoreCase("CTRL"))
      nModif |= INDEV_CTRL;
    if (telem.equalsIgnoreCase("ALT"))
      nModif |= INDEV_ALT;
    if (telem.equalsIgnoreCase("LBUTTON"))
      nModif |= INDEV_LBTN;
    if (telem.equalsIgnoreCase("MBUTTON"))
      nModif |= INDEV_MBTN;
    if (telem.equalsIgnoreCase("RBUTTON"))
      nModif |= INDEV_RBTN;

    if (telem.equalsIgnoreCase("MOUSE_X"))
      nAxis = MOUSE_XAXIS;
    else if (telem.equalsIgnoreCase("MOUSE_Y"))
      nAxis = MOUSE_YAXIS;
    else if (telem.equalsIgnoreCase("WHEEL1"))
      nAxis = MOUSE_WHEEL1;
    else if (telem.equalsIgnoreCase("WHEEL2"))
      nAxis = MOUSE_WHEEL2;
    else if (telem.equalsIgnoreCase("GES_PANN_X"))
      nAxis = GSTR_PANN_X;
    else if (telem.equalsIgnoreCase("GES_PANN_Y"))
      nAxis = GSTR_PANN_Y;
    else if (telem.equalsIgnoreCase("GES_PINCH"))
      nAxis = GSTR_PINCH;
    else if (telem.equalsIgnoreCase("GES_ROTATE"))
      nAxis = GSTR_ROTATE;
    else if (telem.equalsIgnoreCase("GES_SWIPE_X"))
      nAxis = GSTR_SWIPE_X;
    else if (telem.equalsIgnoreCase("GES_SWIPE_Y"))
      nAxis = GSTR_SWIPE_Y;
  }

  return nModif | (nAxis << 6);
}

bool ViewInputConfig::setBinding(int nID, const LString &modifStr)
{
  // remove all bindings associated to nID
  removeBindings(nID);

  std::list<LString> ls;
  if (modifStr.isEmpty())
    // no modif/axis spec --> reset value
    return true;

  modifStr.split(',', ls);
  
  bool bOK = true;
  BOOST_FOREACH (const LString &elem, ls) {
    LString telem = elem.trim(" \t\r\n");
    int nmodif = parseModifStr(telem);
    if (nmodif==0)
      continue;
    if (!setBinding(nID, nmodif))
      bOK = false;
  }
  
  return bOK;
}

bool ViewInputConfig::removeBindings(int nID)
{
  ModifMap::iterator iter = m_modifTab.begin();
  bool bRes = false;
  while (iter!=m_modifTab.end()) {
    if (iter->second==nID) {
      m_modifTab.erase(iter++);
      bRes = true;
    }
    else
      ++iter;
  }

  return bRes;
}

LString ViewInputConfig::getBinding(int nID) const
{
  LString rval;
  std::list<LString> ls2;
  BOOST_FOREACH (const ModifMap::value_type &elem, m_modifTab) {
    if (nID==elem.second) {
      int nModifAxis = elem.first;

      std::list<LString> ls;
      if (nModifAxis & INDEV_SHIFT)
        ls.push_back("SHIFT");
      if (nModifAxis & INDEV_CTRL)
        ls.push_back("CTRL");
      if (nModifAxis & INDEV_ALT)
        ls.push_back("ALT");
      if (nModifAxis & INDEV_LBTN)
        ls.push_back("LBUTTON");
      if (nModifAxis & INDEV_MBTN)
        ls.push_back("MBUTTON");
      if (nModifAxis & INDEV_RBTN)
        ls.push_back("RBUTTON");

      int nAxis = nModifAxis >> 6;
      switch (nAxis) {
      case MOUSE_XAXIS:
        ls.push_back("MOUSE_X");
        break;
      case MOUSE_YAXIS:
        ls.push_back("MOUSE_Y");
        break;
      case MOUSE_WHEEL1:
        ls.push_back("WHEEL1");
        break;
      case MOUSE_WHEEL2:
        ls.push_back("WHEEL2");
        break;
      case GSTR_PANN_X:
        ls.push_back("GES_PANN_X");
        break;
      case GSTR_PANN_Y:
        ls.push_back("GES_PANN_Y");
        break;
      case GSTR_PINCH:
        ls.push_back("GES_PINCH");
        break;
      case GSTR_ROTATE:
        ls.push_back("GES_ROTATE");
        break;
      case GSTR_SWIPE_X:
        ls.push_back("GES_SWIPE_X");
        break;
      case GSTR_SWIPE_Y:
        ls.push_back("GES_SWIPE_Y");
        break;
      default:
        break;
      }

      LString tmp = LString::join("|", ls);
      ls2.push_back(tmp);
    }
  }

  if (ls2.empty()) return LString();
  
  return LString::join(",", ls2);
}


int ViewInputConfig::findEvent(int nAxisID, const InDevEvent &ev)
{
  int nmod = ev.getModifier();
  nmod |= nAxisID << 6;

  ModifMap::const_iterator iter = m_modifTab.find(nmod);
  if (iter==m_modifTab.end())
    return -1;
  return iter->second;
}

////////

void ViewInputConfig::setConfRotX(const LString &modif)
{
  setBinding(ViewInputConfig::VIEW_ROTX, modif);
}

LString ViewInputConfig::getConfRotX() const
{
  return getBinding(ViewInputConfig::VIEW_ROTX);
}

void ViewInputConfig::setConfRotY(const LString &modif)
{
  setBinding(ViewInputConfig::VIEW_ROTY, modif);
}

LString ViewInputConfig::getConfRotY() const
{
  return getBinding(ViewInputConfig::VIEW_ROTY);
}

void ViewInputConfig::setConfRotZ(const LString &modif)
{
  setBinding(ViewInputConfig::VIEW_ROTZ, modif);
}

LString ViewInputConfig::getConfRotZ() const
{
  return getBinding(ViewInputConfig::VIEW_ROTZ);
}

void ViewInputConfig::setConfTraX(const LString &modif)
{
  setBinding(ViewInputConfig::VIEW_TRAX, modif);
}

LString ViewInputConfig::getConfTraX() const
{
  return getBinding(ViewInputConfig::VIEW_TRAX);
}

void ViewInputConfig::setConfTraY(const LString &modif)
{
  setBinding(ViewInputConfig::VIEW_TRAY, modif);
}

LString ViewInputConfig::getConfTraY() const
{
  return getBinding(ViewInputConfig::VIEW_TRAY);
}

void ViewInputConfig::setConfTraZ(const LString &modif)
{
  setBinding(ViewInputConfig::VIEW_TRAZ, modif);
}

LString ViewInputConfig::getConfTraZ() const
{
  return getBinding(ViewInputConfig::VIEW_TRAZ);
}

void ViewInputConfig::setConfZoom(const LString &modif)
{
  setBinding(ViewInputConfig::VIEW_ZOOM, modif);
}

LString ViewInputConfig::getConfZoom() const
{
  return getBinding(ViewInputConfig::VIEW_ZOOM);
}

void ViewInputConfig::setConfSlab(const LString &modif)
{
  setBinding(ViewInputConfig::VIEW_SLAB, modif);
}

LString ViewInputConfig::getConfSlab() const
{
  return getBinding(ViewInputConfig::VIEW_SLAB);
}

void ViewInputConfig::setConfDist(const LString &modif)
{
  setBinding(ViewInputConfig::VIEW_DIST, modif);
}

LString ViewInputConfig::getConfDist() const
{
  return getBinding(ViewInputConfig::VIEW_DIST);
}

////////////////////////////////////////
// Style supports

bool ViewInputConfig::resetProperty(const LString &propnm)
{
  bool res = StyleResetPropImpl::resetProperty(propnm, this);
  if (!res) {
    // stylesheet value is not found --> default behaviour
    return super_t::resetProperty(propnm);
  }

  return true;
}

StyleSheet *ViewInputConfig::getStyleSheet() const
{
  return m_pStyles;
}

void ViewInputConfig::styleChanged(StyleEvent &ev)
{
  m_pStyles->applyStyle(this);
}

qlib::uid_t ViewInputConfig::getStyleCtxtID() const
{
  return 0;
}

//

LString ViewInputConfig::getStyleName() const
{
  return m_pStyles->getStyleNames();
}

void ViewInputConfig::applyStyle(const LString &n)
{
  m_pStyles->setStyleNames(n);
  m_pStyles->applyStyle(this);

  // Style changed & prop changed event
  //fireStyleEvents();
}
