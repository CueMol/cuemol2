//
// XPCOM native window GDK/X11 implementation class
//

#ifndef XPC_NATIVE_WIDGET_GDK_HPP
#define XPC_NATIVE_WIDGET_GDK_HPP

#include "xpcom.hpp"

#include "XPCNativeWidget.hpp"
#include <sysdep/MouseEventHandler.hpp>

#include <gtk/gtk.h>
#include <gdk/gdkx.h>
#include <gdk/gdkwindow.h>

namespace sysdep { class XglView; }
namespace qsys { class InDevEvent; }

namespace xpcom {

  class XPCNativeWidgetGDK : public XPCNativeWidget
  {
  public:
    XPCNativeWidgetGDK();
    virtual ~XPCNativeWidgetGDK();

     NS_IMETHOD Unload(void);
     NS_IMETHOD Resize(PRInt32 x, PRInt32 y, PRInt32 w, PRInt32 h);
     NS_IMETHOD Show(void);
     NS_IMETHOD Hide(void); 
     NS_IMETHOD Reload(bool *_retval );

  public:
    virtual nsresult setupImpl(nativeWindow widget);
    virtual nsresult attachImpl();

    /// GDK event handler impl
    GdkFilterReturn handleGdkEvent(GdkXEvent *gdk_xevent, 
				   GdkEvent *event);

  private:
    /// Redrawing implementation
    void redrawImpl(int x, int y, int width, int height);

    /// parent GDK window object
    GdkWindow *mParGdkWin;
    /// child GDK window object
    GdkWindow *mGdkWin;
    /// GDK GC for child window
    GdkGC *mGC;

    sysdep::XglView *m_pXglView;

    sysdep::MouseEventHandler m_meh;

    //bool setupOpenGL();
    //bool setupOpenGL2();
    //void cleanupOpenGL();
  };

}

#endif
