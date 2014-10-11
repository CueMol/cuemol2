//
// CueMol2 plugin class
//
// $Id: Plugin.cpp,v 1.13 2009/08/13 08:46:06 rishitani Exp $

#include <common.h>
#include "npcommon.h"

#include "Plugin.hpp"
#include "NP_ScrPluginObj.hpp"

#include <qsys/View.hpp>
#include <qsys/Scene.hpp>
#include <qsys/SceneManager.hpp>

using namespace np;

Plugin::Plugin(NPP pNPInstance) :
  m_pNPInstance(pNPInstance),
  m_pWindow(NULL),
  m_pNPStream(NULL),
  m_bInitialized(false),
  m_pScriptableObject(NULL)
{
  m_nSceneID = qlib::invalid_uid;
  m_nViewID = qlib::invalid_uid;
}

Plugin::~Plugin()
{
  if (m_pScriptableObject)
    NPN_ReleaseObject(m_pScriptableObject);
}

bool Plugin::init(NPWindow* pNPWindow)
{
  m_pWindow = pNPWindow;
  m_bInitialized = true;
  return true;
}

void Plugin::fini()
{

  if (!m_rview.isnull()) {
    qlib::uid_t nViewID = m_rview->getUID();
    qlib::uid_t nSceneID = m_rview->getSceneID();
    qsys::ScenePtr rsc = qsys::SceneManager::getSceneS(nSceneID);
    if (!rsc.isnull()) {
      rsc->destroyView(nViewID);
      if (rsc->getViewCount()==0) {
        // unreference the scene
        rsc = qsys::ScenePtr();
        // orphan scene --> destroy
        qsys::SceneManager::getInstance()->destroyScene(nSceneID);
      }
    }
  }

  m_rview = qsys::ViewPtr();
  m_bInitialized = false;
}

int Plugin::handleEvent(void*)
{
  return 0;
}

void Plugin::windowResized(NPWindow* pNPWindow)
{
}

void Plugin::setWindow(NPWindow* pNPWindow)
{
}


USE_NPOBJECT_CLASS(NP_ScrPluginObj);

NPObject *Plugin::getScriptableObject()
{
  //MB_DPRINTLN("########## getScriptableObject()\n");
  if (!m_pScriptableObject) {
    //MB_DPRINTLN("########## 1\n");
    m_pScriptableObject =
      NPN_CreateObject(m_pNPInstance,
                       GET_NPOBJECT_CLASS(NP_ScrPluginObj));
    //MB_DPRINTLN("########## 2\n");
  }

  if (m_pScriptableObject) {
    //MB_DPRINTLN("########## 3\n");
    NPN_RetainObject(m_pScriptableObject);
    //MB_DPRINTLN("########## 4\n");
  }

  //MB_DPRINTLN("########## Scrobj: %s*****\n", typeid(*m_pScriptableObject).name());
  return m_pScriptableObject;
}

bool Plugin::bindCommon(int nSceneID, int nViewID)
{
  MB_DPRINTLN("Bind (View uid=%d) called !!", nViewID);
  
  qsys::ScenePtr rsc = qsys::SceneManager::getSceneS(nSceneID);
  if (rsc.isnull()) {
    MB_DPRINTLN("Win bind: invalid scene %d !!", nSceneID);
    return false;
  }

  qsys::ViewPtr rvw = rsc->getView(nViewID);
  Plugin::setViewPtr(rvw);

  m_nSceneID = nSceneID;
  m_nViewID = nViewID;

  return true;
}

void Plugin::unbind()
{
  m_nSceneID = qlib::invalid_uid;
  m_nViewID = qlib::invalid_uid;

  m_rview = qsys::ViewPtr();
}

