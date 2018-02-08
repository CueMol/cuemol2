// -*-Mode: C++;-*-
//
// OpenGL program object manager
//


#include <common.h>

#ifdef HAVE_GL_GLEW_H
#  include <GL/glew.h>
#endif

#ifdef HAVE_GL_GL_H
#  include <GL/gl.h>
#elif defined(HAVE_OPENGL_GL_H)
#  include <OpenGL/gl.h>
#else
#  error no gl.h
#endif

#include "OglProgObjMgr.hpp"
#include "OglDisplayContext.hpp"
#include "OglProgramObject.hpp"

#include <qsys/SceneEvent.hpp>
#include <qsys/SceneManager.hpp>

using namespace sysdep;
using gfx::DisplayContext;
using qsys::SceneEvent;

SINGLETON_BASE_IMPL(OglProgObjMgr);

OglProgramObject *OglProgObjMgr::createProgramObject(const LString &name, OglDisplayContext *pdc)
{
  OglProgramObject *pRval = NULL;

  pRval = getProgramObject(name, pdc);
  if (pRval!=NULL)
    return pRval;

  qsys::ScenePtr pScene = qsys::SceneManager::getSceneS( pdc->getSceneID() );
  if (pScene.isnull()) {
    // ERROR
    return NULL;
  }
  pScene->addListener(this);

  pRval = MB_NEW OglProgramObject();  
  if (!pRval->init()) {
    delete pRval;
    return NULL;
  }

  LString key = LString::format("%s@%d", name.c_str(), pdc->getSceneID());
  m_data.insert(data_t::value_type(key, pRval));
  return pRval;
}

OglProgramObject *OglProgObjMgr::getProgramObject(const LString &name, OglDisplayContext *pdc)
{
  LString key = LString::format("%s@%d", name.c_str(), pdc->getSceneID());
  
  data_t::const_iterator i = m_data.find(key);
  if (i==m_data.end())
    return NULL;

  return i->second;
}

void OglProgObjMgr::sceneChanged(SceneEvent &ev)
{
  if (ev.getType()!=SceneEvent::SCE_SCENE_REMOVING)
    return;

  qlib::uid_t nid = ev.getTarget();
  LString key = LString::format("@%d", nid);

  std::list<LString> delkeys;

  BOOST_FOREACH (data_t::value_type &elem, m_data) {
    if (elem.first.endsWith(key)) {
      delkeys.push_back(elem.first);
    }
  }
  
  BOOST_FOREACH (const LString &key, delkeys) {
    data_t::iterator &iter = m_data.find(key);
    if (iter!=m_data.end()) {
      MB_DPRINTLN("Destroy progobj: %s", key.c_str());
      if (iter->second!=NULL)
        delete iter->second;
      m_data.erase(iter);
    }
  }
}


