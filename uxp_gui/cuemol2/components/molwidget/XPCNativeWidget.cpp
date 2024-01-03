//
// XPCOM native window/widget super class imprementation
//
// $Id: XPCNativeWidget.cpp,v 1.8 2011/02/12 13:51:19 rishitani Exp $
//

#include "xpcom.hpp"

//#undef XP_DARWIN
//#include "nsMathUtils.h"

#include "XPCNativeWidget.hpp"

#include <nsIDOMMouseEvent.h>

#include <qsys/Scene.hpp>
#include <qsys/SceneManager.hpp>
#include <qsys/InDevEvent.hpp>

#include <gfx/TextRenderManager.hpp>
//#include "Canvas2DTextRender.hpp"

using namespace xpcom;

//NS_IMPL_ISUPPORTS2(XPCNativeWidget, qINativeWidget, nsIDOMEventListener)
#ifdef NS_IMPL_ISUPPORTS
NS_IMPL_ISUPPORTS(XPCNativeWidget, qINativeWidget)
#else
NS_IMPL_ISUPPORTS1(XPCNativeWidget, qINativeWidget)
#endif

XPCNativeWidget::XPCNativeWidget()
{
  mWidth = mHeight = -1;

  m_bUseGlShader = false;
  m_bUseMultiPad = false;
  m_bUseHiDPI = false;

  //m_timer = do_CreateInstance("@mozilla.org/timer;1");
  //printf("!! XPCNativeWidget ctor called.\n");
}

XPCNativeWidget::~XPCNativeWidget()
{
  /*if (m_timer) {
    m_timer->Cancel();
    m_timer = nullptr;
  }*/

  //MB_DPRINT("!! XPCNativeWidget dtor called.\n");
}

/* void setBaseWin (in nsIBaseWindow arg); */
NS_IMETHODIMP XPCNativeWidget::Setup(nsIDocShell *docShell, nsIBaseWindow *baseWindow)
{
  nsresult rv;

  //MB_DPRINTLN("!! XPCNativeWindow::SetupByBaseWin(%p) called.", baseWindow);

  nativeWindow hwnd;
  rv = baseWindow->GetParentNativeWindow(&hwnd);
  NS_ENSURE_SUCCESS(rv, rv);
  MB_DPRINTLN("!! XPCNativeWindow HWND=%X.", hwnd);

  rv = setupImpl(hwnd);
  NS_ENSURE_SUCCESS(rv, rv);
  
  mBaseWin = baseWindow;
  mDocShell = docShell;

  gfx::TextRenderManager *pTRM = gfx::TextRenderManager::getInstance();
  if (pTRM==NULL)
    return NS_OK;
    
  //  Canvas2DTextRender *pTTR =
  //    dynamic_cast<Canvas2DTextRender *>( pTRM->getImpl() );
  //  if (pTTR==NULL)
  //    return NS_OK;
  //
  //  pTTR->addDocShell(docShell);

  return NS_OK;
}

/* void load (); */
NS_IMETHODIMP XPCNativeWidget::Load(PRInt32 nSceneID, PRInt32 nViewID)
{
  nsresult rv;

  NS_ENSURE_TRUE(mBaseWin, NS_ERROR_FAILURE);

  // rv = setupImpl(m);
  // NS_ENSURE_SUCCESS(rv, rv);

  ////////

  MB_DPRINTLN("XPCNativeWidget::Load (Scene uid=%d, View uid=%d) called !!", nSceneID, nViewID);
  
  qsys::ScenePtr rsc = qsys::SceneManager::getSceneS(nSceneID);
  NS_ENSURE_TRUE(!rsc.isnull(), NS_ERROR_FAILURE);

  qsys::ViewPtr rvw = rsc->getView(nViewID);
  NS_ENSURE_TRUE(!rvw.isnull(), NS_ERROR_FAILURE);

  m_rQmView = rvw;

  m_nSceneID = nSceneID;
  m_nViewID = nViewID;

  // Calls system-dependent OpenGL initialization routine(s)
  rv = attachImpl();
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_OK;
}

/* void unload (); */
NS_IMETHODIMP XPCNativeWidget::Unload()
{
  MB_DPRINTLN("!! XPCNativeWidget::Unload() called.");

  //  gfx::TextRenderManager *pTRM = gfx::TextRenderManager::getInstance();
  //  if (pTRM!=NULL) {
  //    Canvas2DTextRender *pTTR =
  //      dynamic_cast<Canvas2DTextRender *>( pTRM->getImpl() );
  //    if (pTTR!=NULL) {
  //      pTTR->removeDocShell(mDocShell);
  //    }
  //  }
  
  m_rQmView = qsys::ViewPtr();
  mBaseWin = nullptr;
  mDocShell = nullptr;
  return NS_OK;
}

NS_IMETHODIMP XPCNativeWidget::HandleEvent(nsIDOMEvent* aEvent)
{
  // MB_DPRINTLN("XPCNativeWidget::HandleEvent(%p) called, basewin=%p", aEvent, mBaseWin);
  nsresult rv;
  nsAutoString eventType;
  aEvent->GetType(eventType);

/*
  if(eventType.EqualsLiteral("resize")) {
    if (mBaseWin) {
      PRInt32 x, y, cx, cy;
      mBaseWin->GetPositionAndSize(&x,&y,&cx,&cy);
      // MB_DPRINTLN("DOM Resize Event %d, %d, %d, %d", x,y,cx,cy);
      resizeImpl(x,y,cx,cy);
    }
  }
*/
  if(eventType.EqualsLiteral("DOMMouseScroll")) {
    qsys::InDevEvent ev;
    setupFromDOMEvent(aEvent, false, ev);

    nsCOMPtr<nsIDOMUIEvent> mouseEvent = do_QueryInterface(aEvent, &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    PRInt32 delta;
    mouseEvent->GetDetail(&delta);

    MB_DPRINTLN("DOMMouseScroll event deltax=%d", delta);
    ev.setType(qsys::InDevEvent::INDEV_WHEEL);
    ev.setDeltaX(delta * -40);
    dispatchMouseEvent(DME_WHEEL, ev);
  }
  return NS_OK;
}

/* attribute boolean useGlShader; */
NS_IMETHODIMP XPCNativeWidget::GetUseGlShader(bool *aUseGlShader)
{
  *aUseGlShader = m_bUseGlShader;
  return NS_OK;
}
NS_IMETHODIMP XPCNativeWidget::SetUseGlShader(bool aUseGlShader)
{
  m_bUseGlShader = aUseGlShader;
  return NS_OK;
}

/* attribute boolean useMultiPad; */
NS_IMETHODIMP XPCNativeWidget::GetUseMultiPad(bool *aUseMultiPad)
{
  *aUseMultiPad = m_bUseMultiPad;
  return NS_OK;
}
NS_IMETHODIMP XPCNativeWidget::SetUseMultiPad(bool aUseMultiPad)
{
  m_bUseMultiPad = aUseMultiPad;
  return NS_OK;
}

/* attribute boolean useRbtnEmul; */
NS_IMETHODIMP XPCNativeWidget::GetUseRbtnEmul(bool *aUseRbtnEmul)
{
  *aUseRbtnEmul = PR_FALSE;
  return NS_OK;
}
NS_IMETHODIMP XPCNativeWidget::SetUseRbtnEmul(bool aUseRbtnEmul)
{
  return NS_OK;
}

/* attribute boolean useHiDPI; */
NS_IMETHODIMP XPCNativeWidget::GetUseHiDPI(bool *aUseHiDPI)
{
  *aUseHiDPI = m_bUseHiDPI;
  return NS_OK;
}
NS_IMETHODIMP XPCNativeWidget::SetUseHiDPI(bool aUseHiDPI)
{
  m_bUseHiDPI = aUseHiDPI;
  return NS_OK;
}


/* attribute long sceneID; */
NS_IMETHODIMP XPCNativeWidget::GetSceneID(PRInt32 *aSceneID)
{
  *aSceneID = m_nSceneID;
  return NS_OK;
}
NS_IMETHODIMP XPCNativeWidget::SetSceneID(PRInt32 aSceneID)
{
  return NS_ERROR_FAILURE;
}

/* attribute long viewID; */
NS_IMETHODIMP XPCNativeWidget::GetViewID(PRInt32 *aViewID)
{
  *aViewID = m_nViewID;
  return NS_OK;
}
NS_IMETHODIMP XPCNativeWidget::SetViewID(PRInt32 aViewID)
{
  return NS_ERROR_FAILURE;
}


/* boolean reload (); */
NS_IMETHODIMP XPCNativeWidget::Reload(bool *_retval )
{
  _retval = PR_FALSE;
  return NS_OK;
}

/// non-DOM mouse event handling
void XPCNativeWidget::dispatchMouseEvent(int nType, qsys::InDevEvent &ev)
{
  switch (nType) {

    // mouse down event
  case DME_MOUSE_DOWN:
    /*
    if (m_meh.getState()==sysdep::MouseEventHandler::DRAG_NONE) {
      m_timer->InitWithFuncCallback(timerCallbackFunc, this, DBCLK_TIMER, nsITimer::TYPE_ONE_SHOT);
    }
    else {
      m_timer->Cancel();
    }
    m_meh.buttonDown(ev, true);
    break;
    //return true;
     */

    m_meh.buttonDown(ev);
    break;

    // mouse move/dragging event
  case DME_MOUSE_MOVE:
    if (!m_meh.move(ev))
      return; // skip event invokation
    break;

    // mouse up event
  case DME_MOUSE_UP:
    if (!m_meh.buttonUp(ev)) {
      return; // skip event invokation
    }
    break;

  case DME_WHEEL:
    // wheel events
    break;
    
    // should not be happen
  default:
    MB_DPRINTLN("XPCNativeWidget::dispatchMouseEvent unknown nType %d", nType);
    return;
    break;
  }

  m_rQmView->fireInDevEvent(ev);
  return;
}

void XPCNativeWidget::resetCursor()
{
  /*
  if (!mWidget)
    return;
  // reset mouse cursor
  nsCursor id = mWidget->GetCursor();
  mWidget->SetCursor(id);
   */
}

/// Convert DOM-type event to InDevEvent
void XPCNativeWidget::setupFromDOMEvent(nsIDOMEvent* aEvent,
                                        bool bMouseBtn,
                                        qsys::InDevEvent &ev)
{
  MB_DPRINTLN("aEvent: %p", aEvent);
  /*
  void *pp;
  aEvent->QueryInterface(nsIDOMMouseEvent::GetIID(),
			 &pp);
  MB_DPRINTLN("aEvent: %p", pp);
  */
  nsresult rv;
  nsCOMPtr<nsIDOMMouseEvent> mouseEvent = do_QueryInterface(aEvent, &rv);
  if (NS_FAILED(rv))
    return;
  if (!mouseEvent) {
    //non-ui event passed in.  bad things.
    return;
  }

  // setup locations
  PRInt32 clientX, clientY;
  mouseEvent->GetClientX(&clientX);
  mouseEvent->GetClientY(&clientY);

  ev.setX(clientX);
  ev.setY(clientY);

  PRInt32 screenX, screenY;
  mouseEvent->GetScreenX(&screenX);
  mouseEvent->GetScreenY(&screenY);

  ev.setRootX(screenX);
  ev.setRootY(screenY);

  // set modifier (key)
  int modif = 0;
  bool boolval;
  mouseEvent->GetAltKey(&boolval);
  if (boolval)
    modif |= qsys::InDevEvent::INDEV_ALT;
  mouseEvent->GetCtrlKey(&boolval);
  if (boolval)
    modif |= qsys::InDevEvent::INDEV_CTRL;
  mouseEvent->GetShiftKey(&boolval);
  if (boolval)
    modif |= qsys::InDevEvent::INDEV_SHIFT;
  // ???
  mouseEvent->GetMetaKey(&boolval);
  if (boolval)
    modif |= qsys::InDevEvent::INDEV_ALT;

  if (bMouseBtn) {
    // set modifier (mouse)
    //PRUint16 nbtn;
	PRInt16 nbtn;
	mouseEvent->GetButton(&nbtn);
    if (nbtn==0)
      modif |= qsys::InDevEvent::INDEV_LBTN;
    else if (nbtn==1)
      modif |= qsys::InDevEvent::INDEV_MBTN;
    else if (nbtn==2)
      modif |= qsys::InDevEvent::INDEV_RBTN;
  }
  
  ev.setModifier(modif);

  return;
}

//static
void XPCNativeWidget::timerCallbackFunc(nsITimer *aTimer, void *aClosure)
{
  //MB_DPRINTLN("Timer: notified");
  XPCNativeWidget *pThis = reinterpret_cast<XPCNativeWidget *>(aClosure);

  qsys::InDevEvent ev;
  pThis->dispatchMouseEvent(DME_DBCHK_TIMEUP, ev);
  return;
}

