//
// XPCOM native window GDK/X11 implementation
//

#include <common.h>

#include "XPCNativeWidgetGDK.hpp"

#include "xpcom.hpp"

#include <qsys/InDevEvent.hpp>
#include <sysdep/XglView.hpp>
#include <sysdep/XglDisplayContext.hpp>

using namespace xpcom;
using gfx::DisplayContext;
using sysdep::XglDisplayContext;

XPCNativeWidgetGDK::XPCNativeWidgetGDK()
{
  MB_DPRINTLN("!! XPCNativeWidgetGDK (%p) ctor called.", this);

  mParGdkWin = NULL;
  mGdkWin = NULL;
  mGC = NULL;
}

XPCNativeWidgetGDK::~XPCNativeWidgetGDK()
{
  MB_DPRINTLN("!! XPCNativeWidgetGDK (%p) dtor called.", this);
}

// entry stub
static
GdkFilterReturn sHandleGdkEvent(GdkXEvent *gdk_xevent, 
				GdkEvent *event, gpointer data)
{
  XPCNativeWidgetGDK *pthis = (XPCNativeWidgetGDK *)data;
  return pthis->handleGdkEvent(gdk_xevent, event);
}

nsresult XPCNativeWidgetGDK::setupImpl(nativeWindow widget)
{
  mParGdkWin = GDK_WINDOW(widget);
  printf("native gdkwin: %p\n", mParGdkWin);

  //// Create new child window for OpenGL view

  GdkWindowAttr attributes;

  attributes.window_type = GDK_WINDOW_CHILD;
  attributes.x = 0;
  attributes.y = 0;
  attributes.width = 0;
  attributes.height = 0;
  attributes.wclass = GDK_INPUT_OUTPUT;
  attributes.event_mask = GDK_EXPOSURE_MASK|
    GDK_STRUCTURE_MASK|GDK_BUTTON_PRESS_MASK|GDK_BUTTON_RELEASE_MASK|GDK_POINTER_MOTION_MASK;

  mGdkWin = gdk_window_new(mParGdkWin, &attributes, GDK_WA_X | GDK_WA_Y);
  gdk_window_show(mGdkWin);

  gdk_window_add_filter(mGdkWin, (GdkFilterFunc)sHandleGdkEvent, this);

  mGC = gdk_gc_new(mGdkWin);
  gdk_window_set_back_pixmap(mGdkWin, NULL, false);

  return NS_OK;
}

nsresult XPCNativeWidgetGDK::attachImpl()
{
  qsys::View *ptmp = getQmView().get();
  NS_ENSURE_TRUE(ptmp, NS_ERROR_FAILURE);
  
  MB_DPRINT("GDK bind: view %p type=%s\n", ptmp, typeid(*ptmp).name());

  sysdep::XglView *pXglView = dynamic_cast<sysdep::XglView *>(ptmp);
  if (pXglView==NULL) {
    m_pXglView = NULL;
    LOG_DPRINTLN("GDK bind failed: invalid view type %p !!", ptmp);
    return NS_ERROR_FAILURE;
  }
  
  pXglView->setUseGlShader(m_bUseGlShader);

  // set cached view ptr
  m_pXglView = pXglView;

  bool res = pXglView->setup(GDK_WINDOW_XDISPLAY(mGdkWin),
			     GDK_WINDOW_XWINDOW(mGdkWin));
  MB_DPRINTLN("XGL bind: %s", res?"OK":"NG");
  if (!res) {
    m_pXglView = NULL;
    return NS_ERROR_FAILURE;
  }

  m_pXglView->sizeChanged(getWidth(), getHeight());

  MB_DPRINT("XPCNativeWidgetGDK::attachImpl OK\n");
  return NS_OK;
}

//void XPCNativeWidgetGDK::unloadImpl()
NS_IMETHODIMP XPCNativeWidgetGDK::Unload()
{
  XPCNativeWidget::Unload();

  if (mGdkWin) {
    // hide, unparent, and then destroy our private window
    gdk_window_hide(mGdkWin);
    gdk_window_reparent(mGdkWin, NULL, 0, 0);
    gdk_window_destroy(mGdkWin);
    mGdkWin = nullptr;
  }

  if (mGC) {
    g_object_unref(mGC);
    mGC = nullptr;
  }

  mParGdkWin = nullptr;

  return NS_OK;
}

NS_IMETHODIMP XPCNativeWidgetGDK::Resize(PRInt32 x, PRInt32 y, PRInt32 width, PRInt32 height)
{
  NS_ENSURE_TRUE(mGdkWin, NS_ERROR_FAILURE);

  //gint x, y, w, h, d;
  //gdk_window_get_geometry(mParGdkWin, &x, &y, &w, &h, &d);
  gdk_window_move_resize(mGdkWin, x, y, width, height);
  MB_DPRINTLN("GDK resized: (%d, %d, %d, %d)", x, y, width, height);
  //redrawImpl(0, 0, width, height);
  return NS_OK;
}

/* void show (); */
NS_IMETHODIMP XPCNativeWidgetGDK::Show()
{
  NS_ENSURE_TRUE(mGdkWin, NS_ERROR_FAILURE);
  gdk_window_show(mGdkWin);
  return NS_OK;
}

/* void hide (); */
NS_IMETHODIMP XPCNativeWidgetGDK::Hide()
{
  //NS_ENSURE_TRUE(mGdkWin, NS_ERROR_FAILURE);
  if (mGdkWin==NULL) return NS_OK;
  
  gdk_window_hide(mGdkWin);
  return NS_OK;
}


/* boolean reload (); */
NS_IMETHODIMP XPCNativeWidgetGDK::Reload(bool *_retval )
{
  *_retval = PR_TRUE;
  return NS_OK;
}

void XPCNativeWidgetGDK::redrawImpl(int x, int y, int w, int h)
{
  GdkColor white = {0,65535,65535,65535};
  gdk_gc_set_rgb_fg_color(mGC, &white);
  gdk_draw_rectangle(mGdkWin, mGC, true, 0, 0, w, h);
  
  GdkColor black = {0,0,0,0};
  gdk_gc_set_rgb_fg_color(mGC, &black);
  gdk_draw_line(mGdkWin, mGC, 0,0,w,h);
  gdk_draw_line(mGdkWin, mGC, 0,h,w,0);
}

GdkFilterReturn
XPCNativeWidgetGDK::handleGdkEvent(GdkXEvent *gdk_xevent, 
				   GdkEvent *event)
{
  XEvent *xevent = (XEvent *)gdk_xevent;

  if (m_pXglView) {
    Boolean b;
    m_pXglView->handleEvent(xevent, &b);
    return GDK_FILTER_CONTINUE;
  }

  // printf("**** GDK EVENT(2) **** type=%d\n", xevent->type);

  switch (xevent->type) {
  case Expose: {
    XExposeEvent *ee = (XExposeEvent *)gdk_xevent;
    //printf("**** Expose %d, x=%d, y=%d, w=%d, h=%d, c=%d\n",
    //ee->type, ee->x, ee->y, ee->width, ee->height, ee->count);
    gint x, y, w, h, d;
    gdk_window_get_geometry(mGdkWin, &x, &y, &w, &h, &d);
    redrawImpl(x, y, w, h);
    
    break;
  }
  case ButtonPress:
    printf("**** GDK button press\n");
    break;
  case ButtonRelease:
    printf("**** GDK button release\n");
    break;
    {
      //platform->SetFullscreen(false);
      //platform->ResizeToWindow();
    }
    break;

  default:
    break;
  }

  return GDK_FILTER_CONTINUE;
}
