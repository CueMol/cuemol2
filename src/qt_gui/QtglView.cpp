// -*-Mode: C++;-*-
//
//  QtGL dependent molecular viewer implementation
//

#include <common.h>

#ifdef WIN32
#  include <windows.h>
#endif

#ifdef HAVE_GLEW
#include <GL/glew.h>
#ifdef WIN32
#pragma comment(lib, "glew32.lib")
#endif
#endif

#include <GL/gl.h>
#include <GL/glu.h>

#include "QtglView.hpp"

#include <qlib/Utils.hpp>

#include "QtglDisplayContext.hpp"

using qsys::InDevEvent;

using namespace qtgui;

QtglView::QtglView()
{
}

QtglView::~QtglView()
{
  MB_DPRINTLN("QtglView (ctxt=%p) destructing.", m_pCtxt);
}

LString QtglView::toString() const
{
  return LString::format("Qt/OpenGL View(%p)", this);
}

void QtglView::swapBuffers()
{
  //if (m_hDC!=NULL)
  //::SwapBuffers(m_hDC);
}

DisplayContext *QtglView::getDisplayContext()
{
  return m_pCtxt;
}

////////////////////////////////////////////

bool QtglView::attach()
{
  return true;
}

void QtglView::unloading()
{
}

/// Query hardware stereo capability
bool QtglView::hasHWStereo() const
{
  //LOG_DPRINTLN("WglView> hasHWStereo: %d", m_bHasQuadBuffer);
  return m_bHasQuadBuffer;
}

////////////////////////////////////////////

