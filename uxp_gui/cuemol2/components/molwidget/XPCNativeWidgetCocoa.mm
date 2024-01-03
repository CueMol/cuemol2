//
// XPCOM native widget Cocoa implementation class
//
// $Id: XPCNativeWidgetCocoa.cpp,v 1.14 2010/12/07 14:14:31 rishitani Exp $
//

#include <common.h>

#include "XPCNativeWidgetCocoa.hpp"

#include <prlog.h>
#include <nsDebug.h>

#include <nsCOMPtr.h>
#include <nsIRunnable.h>
#include <nsThreadUtils.h>

#import <AppKit/AppKit.h>
#import <OpenGL/gl.h>
#import <OpenGL/glext.h>
#import <OpenGL/glu.h>

#include <sysdep/CglView.hpp>
#include <sysdep/CglDisplayContext.hpp>
#include <qsys/InDevEvent.hpp>

#include "NSOglMolView.hpp"

using gfx::DisplayContext;
using sysdep::CglDisplayContext;

XPCNativeWidgetCocoa::XPCNativeWidgetCocoa()
{
  m_bRealTimeDrag = false;
  m_bScrollEndPending = false;
  m_bValidSizeSet = false;

  mParentView=NULL;
  mView=NULL;
  m_pCglView = NULL;
  //MB_DPRINT("XPCNativeWidgetCocoa ctor called.\n");
}

XPCNativeWidgetCocoa::~XPCNativeWidgetCocoa()
{
  //MB_DPRINT("XPCNativeWidgetCocoa dtor called.\n");
}

//////////

nsresult XPCNativeWidgetCocoa::setupImpl(nativeWindow widget)
{
  //mParentView = (void *)(widget->GetNativeData(NS_NATIVE_WIDGET));
  mParentView = widget;
  NS_ENSURE_TRUE(mParentView != NULL, NS_ERROR_FAILURE);

  NSView *parView = (NSView *) mParentView;
  //MB_DPRINT("XPCNativeWidgetCocoa::setupImpl ParentView: %p\n", parView);
  MB_DPRINT("ParentView.subviews count: %d\n", parView.subviews.count);
  //id sibling = [[parView subviews] objectAtInde: 0]
    
  int width = getWidth(), height=getHeight();
  if (width<0) width = 100;
  if (height<0) height = 100;
  NSRect rect = NSMakeRect(0,0,width,height);

  // Create NSOglMolView object (defined in NSOglMolView.hpp)
  NSOglMolView *view = [NSOglMolView alloc];
  // NSView *view = [NSButton alloc]];
    
  [view initWithFrameAndOwner: rect owner: this];
  
  //MB_DPRINT("NSView created: %p (%d, %d)\n", view, width, height);
  
  [parView addSubview: view];

  [view setParentView: parView];

  // [view setAcceptsTouchEvents: YES];
  // MB_DPRINT(" superview: %p\n", [view superview]);
  // MB_DPRINT(" nextresponder: %p\n", [view nextResponder]);
  
  mView = view;
  
  return NS_OK;
}

nsresult XPCNativeWidgetCocoa::attachImpl()
{
  if (!mView) {
    MB_DPRINT("XPCNativeWidgetCocoa::attachImpl mView is not initialized!!\n");
    return NS_ERROR_FAILURE;
  }

  Hide();

  qsys::View *ptmp = getQmView().get();
  NS_ENSURE_TRUE(ptmp, NS_ERROR_FAILURE);
  
  //MB_DPRINTLN("OSX bind: view %p type=%s", ptmp, typeid(*ptmp).name());
  MB_DPRINT("OSX bind: view %p type=%s\n", ptmp, typeid(*ptmp).name());

  sysdep::CglView *pCglView = dynamic_cast<sysdep::CglView *>(ptmp);
  if (pCglView==NULL) {
    m_pCglView = NULL;
    LOG_DPRINTLN("OSX bind failed: invalid view %p !!", ptmp);
    return NS_ERROR_FAILURE;
  }
  
  pCglView->setUseGlShader(m_bUseGlShader);

  NSOpenGLView *view = (NSOpenGLView *) mView;

  // check for display list sharing
  DisplayContext *pShare = pCglView->getSiblingCtxt();
  if (pShare!=NULL) {
    //MB_DPRINTLN("##### Display list sharing with %p is requested!!", pShare);
    CglDisplayContext *pCglShare = dynamic_cast<CglDisplayContext *>(pShare);
    if (pShare==NULL) {
      MB_DPRINTLN("Warning: Display context %p is not CGL!!", pShare);
    }
    else {
      // CGLContextObj shctxt = pCglShare->getCGLContext();
      NSOpenGLContext *shnsc = (NSOpenGLContext *)pCglShare->getNSGLContext();
      NSOpenGLPixelFormat * pf = [NSOglMolView basicPixelFormat];
      NSOpenGLContext *newctxt = [[[NSOpenGLContext alloc]
				   initWithFormat: pf
				   shareContext: shnsc] autorelease];
      [view setOpenGLContext: newctxt];
    }
  }

  if (m_bUseHiDPI) {
    // Request Retina HiDPI display
    [view setWantsBestResolutionOpenGLSurface:YES];
    NSSize tmp = {100, 100};
    NSSize tmp2 = [view convertSizeToBacking: tmp];
    double sclx = double(tmp2.width) / double(tmp.width);
    double scly = double(tmp2.height) / double(tmp.height);
    MB_DPRINTLN("scale factor %f, %f", sclx, scly);
    pCglView->setSclFac(sclx, scly);
  }

  // set cached view ptr
  m_pCglView = pCglView;

  // Get NS and CGL contexts and attach to the View object
  NSOpenGLContext *nsctxt = [view openGLContext];
  CGLContextObj cglctxt = (CGLContextObj) [nsctxt CGLContextObj];
  if (!m_pCglView->attach(nsctxt, cglctxt)) {
    MB_DPRINT("XPCNativeWidgetCocoa::attachImpl attach CGLContextObj failed !!\n");
    return NS_ERROR_FAILURE;
  }
  
  m_pCglView->sizeChanged(getWidth(), getHeight());

  MB_DPRINT("XPCNativeWidgetCocoa::attachImpl OK\n");
  return NS_OK;
}

NS_IMETHODIMP XPCNativeWidgetCocoa::Unload()
{
  XPCNativeWidget::Unload();

  if (mView) {
    NSView *view = (NSView *) mView;
    [view removeFromSuperviewWithoutNeedingDisplay];
    mView=NULL;
  }

  mParentView = NULL;
  //MB_DPRINT("!! XPCNativeWidgetCocoa::Unload called.\n");

  return NS_OK;
}

NS_IMETHODIMP XPCNativeWidgetCocoa::Resize(PRInt32 x, PRInt32 y, PRInt32 width, PRInt32 height)
{
  NS_ENSURE_TRUE(mView, NS_ERROR_FAILURE);
  MB_DPRINTLN("XPCNativeWidgetCocoa> resize W,H= %d,%d", width, height);

  NSView *view = (NSView *) mView;
  NSView *parView = [view superview];

  int ph = [parView frame].size.height;
  MB_DPRINTLN("XPCNativeWidgetCocoa> parent Height= %d", ph);
  int y2 =  ph - (y+height);
  MB_DPRINTLN("XPCNativeWidgetCocoa> flipped y: %d", y2);

  NSRect rect = NSMakeRect(x,y2,width,height);
  [view setFrame: rect];
  m_bValidSizeSet = true;

  // if (m_bUseHiDPI) {
  // // Get view dimensions in pixels
  // NSRect backingBounds = [view convertRectToBacking:[view bounds]];
  // GLsizei backingPixelWidth  = (GLsizei)(backingBounds.size.width),
  // backingPixelHeight = (GLsizei)(backingBounds.size.height);
  // setSize(backingPixelWidth, backingPixelHeight);
  // }
  // else {
  setSize(width, height);
  // }

  return NS_OK;

  /*
  NSView *view = (NSView *) mView;
  NSRect rect = NSMakeRect(x,y,width,height);
  [view setFrame: rect];

  if (m_pCglView==NULL) return NS_OK;
  m_pCglView->sizeChanged(width, height);

  // MB_DPRINT("ParentView.subviews count: %d\n", view.superview.subviews.count);
  return NS_OK;
  */
}

/* void show (); */
NS_IMETHODIMP XPCNativeWidgetCocoa::Show()
{
  NS_ENSURE_TRUE(mView, NS_ERROR_FAILURE);
  NSView *view = (NSView *) mView;
  if (!m_bValidSizeSet) {
    MB_DPRINTLN(">>> XPCNativeWindowCocoa::Show() called but valid size not set %d,%d", getWidth(), getHeight());
    return NS_OK;
  }
  [view setHidden: NO];

  MB_DPRINTLN(">>> XPCNativeWindowCocoa::Show() called");

  return NS_OK;
}

/* void hide (); */
NS_IMETHODIMP XPCNativeWidgetCocoa::Hide()
{
  //NS_ENSURE_TRUE(mView, NS_ERROR_FAILURE);
  if (mView==NULL) return NS_OK;
  
  NSView *view = (NSView *) mView;
  [view setHidden: YES];
  MB_DPRINTLN(">>> XPCNativeWindowCocoa::Hide() called");
  return NS_OK;
}

/* boolean reload (); */
NS_IMETHODIMP XPCNativeWidgetCocoa::Reload(bool *_retval )
{
  LOG_DPRINT("XPCNativeWidgetCocoa::Reload NOT IMPLEMENTED!!");

  /*
  NS_ENSURE_TRUE(mParentView != NULL, NS_ERROR_FAILURE);

  m_pCglView->unloading();

  NSView *parView = (NSView *) mParentView;
  MB_DPRINT("ParentView.subviews count: %d\n", parView.subviews.count);
    
  NSView *oldview = (NSView *) mView;

  NSRect oldrect = [oldview frame];

  [oldview removeFromSuperviewWithoutNeedingDisplay];
  mView=NULL;

  //////////

  // int width = getWidth(), height=getHeight();
  // if (width<0) width = 100;
  // if (height<0) height = 100;
  // NSRect rect = NSMakeRect(0,0,width,height);

  // Create NSOglMolView object (defined in NSOglMolView.hpp)
  NSOglMolView *view = [NSOglMolView alloc];
    
  [view initWithFrameAndOwner: oldrect owner: this];
  
  //MB_DPRINT("NSView created: %p (%d, %d)\n", view, width, height);
  
  [parView addSubview: view];
  [view setParentView: parView];

  // [view setAcceptsTouchEvents: YES];
  // MB_DPRINT(" superview: %p\n", [view superview]);
  // MB_DPRINT(" nextresponder: %p\n", [view nextResponder]);
  
  mView = view;

  nsresult rv = attachImpl();
  NS_ENSURE_SUCCESS(rv, rv);
  */

  *_retval = PR_TRUE;
  return NS_OK;
}


//////////

void XPCNativeWidgetCocoa::dispatchMouseEvent(int nType, qsys::InDevEvent &ev)
{
  //MB_DPRINTLN("scroll end pending: %d", m_bScrollEndPending);
  checkScrollEndPending();
  super_t::dispatchMouseEvent(nType, ev);
}

void XPCNativeWidgetCocoa::checkScrollEndPending()
{
  if (m_bScrollEndPending) {
    m_pCglView->setViewCenter(m_pCglView->getViewCenter());
    m_bScrollEndPending = false;
  }
}

//////////

void XPCNativeWidgetCocoa::doRedrawGL()
{
  if (m_pCglView==NULL) return;

  int curw = getWidth(); 
  int curh = getHeight(); 
  if (curw!=m_pCglView->getWidth() ||
      curh!=m_pCglView->getHeight())
    m_pCglView->sizeChanged(curw, curh);

  m_pCglView->forceRedraw();
}

void XPCNativeWidgetCocoa::scrollGesture(float deltaX, float deltaY)
{
  const float factor = -4.0f;

  if (m_pCglView==NULL) return;

  qlib::Vector4D vec;
  m_pCglView->convXYTrans(deltaX*factor, deltaY*factor, vec);
  //MB_DPRINTLN("ScrollGesture %f,%f,%f", vec.x(), vec.y(), vec.z());    

  if (m_bRealTimeDrag)
    m_pCglView->setViewCenter(m_pCglView->getViewCenter()-vec);
  else {
    m_pCglView->setViewCenterDrag(m_pCglView->getViewCenter()-vec);
    m_bScrollEndPending = true;
  }
}

void XPCNativeWidgetCocoa::pinchGesture(float deltaZ)
{
  if (m_pCglView==NULL) return;

  checkScrollEndPending();

  double vw = m_pCglView->getZoom();
  double dw = double(-deltaZ)/200.0 * vw;
  m_pCglView->setZoom(vw+dw);
  m_pCglView->setUpProjMat(-1, -1);
}

void XPCNativeWidgetCocoa::rotateGesture(float rot)
{
  if (m_pCglView==NULL) return;

  checkScrollEndPending();

  m_pCglView->rotateView(0.0f, 0.0f, double(-rot*4.0));
}

void XPCNativeWidgetCocoa::swipeGesture(float deltaX, float deltaY)
{
  if (m_pCglView==NULL) return;

  checkScrollEndPending();

  if (fabs(deltaX)>0.0) {
    double vw = m_pCglView->getSlabDepth();
    double dw = double(deltaX)/5.0 * vw;
    m_pCglView->setSlabDepth(vw+dw);
  }
  else if (fabs(deltaY)>0.0) {
    double vw = m_pCglView->getSlabDepth();
    double dw = double(deltaY)/5.0 * vw;
    m_pCglView->setSlabDepth(vw+dw);
  }

}


/* attribute boolean useRbtnEmul; */
NS_IMETHODIMP XPCNativeWidgetCocoa::GetUseRbtnEmul(bool *aUseRbtnEmul)
{
  NSOglMolView *view = (NSOglMolView *) mView;
  *aUseRbtnEmul = [view getUseRbtnEmul];

  //*aUseRbtnEmul = PR_FALSE;
  return NS_OK;
}

NS_IMETHODIMP XPCNativeWidgetCocoa::SetUseRbtnEmul(bool aUseRbtnEmul)
{
  NSOglMolView *view = (NSOglMolView *) mView;
  [view setUseRbtnEmul: aUseRbtnEmul];

  return NS_OK;
}
