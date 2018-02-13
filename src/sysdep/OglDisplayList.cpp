// -*-Mode: C++;-*-
//
//  OpenGL display list class
//
//  $Id: OglDisplayList.cpp,v 1.4 2009/08/22 07:10:36 rishitani Exp $

#include <common.h>

#ifdef WIN32
# include <windows.h>
#endif

#ifdef HAVE_GL_GL_H
#  include <GL/gl.h>
#elif defined(HAVE_OPENGL_GL_H)
#  include <OpenGL/gl.h>
#else
#  error no gl.h
#endif

#include "OglDisplayList.hpp"
#include "OglDisplayContext.hpp"

#include <qsys/Scene.hpp>
#include <qsys/SceneManager.hpp>

//#include <GL/glu.h>

//#define CHK_GLERROR(MSG) \
//{ GLenum errc; errc = glGetError(); MB_DPRINTLN("%s GLError: %s", MSG, gluErrorString(errc)); }

#define CHK_GLERROR(MSG)
  ;  

using namespace sysdep;

OglDisplayList::OglDisplayList()
  : OglDisplayContext(), m_nID(0), m_fValid(false)
{
  //MB_DPRINTLN("GLlist %d created", m_nID);
}

OglDisplayList::~OglDisplayList()
{
  // To perform glDeleteList(),
  // we have to set current to another view's display context.
  // (any view is OK, since DLs are shared among all Views attached to the Scene)
  qsys::ScenePtr rsc = qsys::SceneManager::getSceneS(getSceneID());
  if (rsc.isnull()) {
    LOG_DPRINTLN("OglDispList: unknown scene, GLlist %d cannot be deleted", m_nID);
    return;
  }
  
  qsys::Scene::ViewIter viter = rsc->beginView();
  if (viter==rsc->endView()) {
    MB_DPRINTLN("OglDispList: no view, GLlist %d cannot deleted", m_nID);
    return;
  }
  
  qsys::ViewPtr rvw = viter->second;
  if (rvw.isnull()) {
    // If any views aren't found, it is no problem,
    // because the parent context (and also all DLs) may be already destructed.
    return;
  }
  gfx::DisplayContext *pctxt = rvw->getDisplayContext();
  pctxt->setCurrent();

  glDeleteLists(m_nID, 1);

  CHK_GLERROR("delet:");

  //MB_DPRINTLN("GLlist %d deleted", m_nID);
}

////////////////////////////////////////////////////////
// DisplayList impl.

bool OglDisplayList::recordStart()
{
//  if (!m_pParent->isCurrent())
//    m_pParent->setCurrent();

  // XXX
  //if (!m_pParent->setDLCurrent(this))
  //return false;

  if (m_nID==0) {
    m_nID = glGenLists(1);
    CHK_GLERROR("create: ");
  }

  m_fValid = false;
  // glNewList(m_nID, GL_COMPILE_AND_EXECUTE);
  glNewList(m_nID, GL_COMPILE);
  return true;
}

void OglDisplayList::recordEnd()
{
//  if (!m_pParent->isCurrent())
//    m_pParent->setCurrent();

  glEndList();
  CHK_GLERROR("EndList: ");

  // Mark as valid
  m_fValid = true;

  // XXX
  //m_pParent->setDLCurrent(NULL);
}

////////////////////////////////////////////////////////

gfx::DisplayContext *OglDisplayList::createDisplayList()
{
  return NULL;
}

bool OglDisplayList::canCreateDL() const
{
  return false;
}

bool OglDisplayList::isDisplayList() const
{
  return true;
}

