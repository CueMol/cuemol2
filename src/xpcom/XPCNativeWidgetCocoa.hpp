//
// XPCOM native widget Cocoa implementation class
//
// $Id: XPCNativeWidgetCocoa.hpp,v 1.9 2010/12/07 14:14:31 rishitani Exp $
//

#ifndef XPC_NATIVE_WIDGET_COCOA_H
#define XPC_NATIVE_WIDGET_COCOA_H

#include "XPCNativeWidget.hpp"

namespace sysdep { class CglView; }
namespace qsys { class InDevEvent; }

class XPCNativeWidgetCocoa : public xpcom::XPCNativeWidget
{
  typedef xpcom::XPCNativeWidget super_t;

 public:
  XPCNativeWidgetCocoa();
  virtual ~XPCNativeWidgetCocoa();
  
   NS_IMETHOD Unload(void);
   NS_IMETHOD Resize(PRInt32 x, PRInt32 y, PRInt32 w, PRInt32 h);
   NS_IMETHOD Show(void);
   NS_IMETHOD Hide(void); 
   NS_IMETHOD Reload(bool *_retval );

   NS_IMETHOD GetUseRbtnEmul(bool *aUseRbtnEmul);
   NS_IMETHOD SetUseRbtnEmul(bool aUseRbtnEmul);

 public:
  virtual nsresult setupImpl(nativeWindow widget);
  virtual nsresult attachImpl();
  //virtual void unloadImpl();
  //virtual void resizeImpl(int x, int y, int width, int height);
  
  virtual void dispatchMouseEvent(int nType, qsys::InDevEvent &ev);

  //
  // Native event handling methods
  // (Called by ObjC NSOglMolView class)

  // Redraw contents
  void doRedrawGL();

  // void mouseOver(qsys::InDevEvent &ev);

  void scrollGesture(float deltaX, float deltaY);
  void pinchGesture(float deltaZ);
  void rotateGesture(float rot);
  void swipeGesture(float deltaX, float deltaY);

 private:
  void *mParentView;
  void *mView;

  sysdep::CglView *m_pCglView;

  bool m_bRealTimeDrag;

  bool m_bScrollEndPending;

  void checkScrollEndPending();

  bool m_bValidSizeSet;
};

#endif

