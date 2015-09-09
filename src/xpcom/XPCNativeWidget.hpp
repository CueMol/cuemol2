//
// XPCOM native window/widget super class
//
// $Id: XPCNativeWidget.hpp,v 1.5 2010/10/20 15:29:46 rishitani Exp $
//

#ifndef XPC_NATIVE_WIDGET_HPP
#define XPC_NATIVE_WIDGET_HPP

#include "xpcom.hpp"

#include <nsCOMPtr.h>
#include <nsITimer.h>
#include <nsIDOMEventListener.h>
#include <nsIBaseWindow.h>
#include "qINativeWidget.h"

#include <qsys/View.hpp>
#include <sysdep/MouseEventHandler.hpp>

namespace qsys { class InDevEvent; }

namespace xpcom {

  class XPCNativeWidget : public qINativeWidget //, public nsIDOMEventListener
  {
  private:
    // Timer used for double-click check
    //nsCOMPtr<nsITimer> m_timer;

  protected:
    virtual ~XPCNativeWidget();

  public:
    XPCNativeWidget();

  public:
    NS_DECL_ISUPPORTS;
    // NS_DECL_NSIDOMEVENTLISTENER;
    // NS_DECL_QINATIVEWIDGET

     NS_IMETHOD Setup(nsIDocShell *docShell, nsIBaseWindow *arg);
     NS_IMETHOD Load(PRInt32 scid, PRInt32 vwid);
     NS_IMETHOD Unload(void);
     NS_IMETHOD Reload(bool *_retval );

     NS_IMETHOD GetUseGlShader(bool *);
     NS_IMETHOD SetUseGlShader(bool);

     NS_IMETHOD GetUseMultiPad(bool *aUseMultiPad);
     NS_IMETHOD SetUseMultiPad(bool aUseMultiPad);

     NS_IMETHOD GetUseRbtnEmul(bool *aUseRbtnEmul);
     NS_IMETHOD SetUseRbtnEmul(bool aUseRbtnEmul);

    /* attribute boolean useHiDPI; */
     NS_IMETHOD GetUseHiDPI(bool *aUseHiDPI);
     NS_IMETHOD SetUseHiDPI(bool aUseHiDPI);

     NS_IMETHOD GetSceneID(PRInt32 *aSceneID);
     NS_IMETHOD SetSceneID(PRInt32 aSceneID);
     NS_IMETHOD GetViewID(PRInt32 *aViewID);
     NS_IMETHOD SetViewID(PRInt32 aViewID);

     NS_IMETHOD HandleEvent(nsIDOMEvent* aEvent);
    
  public:
    virtual nsresult setupImpl(nativeWindow widget) =0;
    virtual nsresult attachImpl() =0;

    static const int DBCLK_TIMER = 500;
    
    enum {
      DME_MOUSE_DOWN = 0,
      DME_MOUSE_MOVE = 1,
      DME_MOUSE_UP = 2,
      DME_WHEEL = 3,
      DME_DBCHK_TIMEUP = 4
    };
    virtual void dispatchMouseEvent(int nType, qsys::InDevEvent &ev);

    // virtual void unloadImpl() =0;
    // virtual void resizeImpl(int x, int y, int width, int height) =0;

    void setSize(int w, int h) { mWidth = w; mHeight = h;}
    int getWidth() const { return mWidth; }
    int getHeight() const { return mHeight; }

    qsys::ViewPtr getQmView() const { return m_rQmView; }

    void resetCursor();

    bool useMultiTouchPad() const { return m_bUseMultiPad; }

    static void timerCallbackFunc(nsITimer *aTimer, void *aClosure);
    

  protected:
    nsCOMPtr<nsIBaseWindow> mBaseWin;
    nsCOMPtr<nsIDocShell> mDocShell;

    int mWidth, mHeight;
    int mPosX, mPosY;

    int m_nSceneID, m_nViewID;
    qsys::ViewPtr m_rQmView;

    sysdep::MouseEventHandler m_meh;
    
    bool m_bUseGlShader;
    bool m_bUseMultiPad;
    bool m_bUseHiDPI;

    void setupFromDOMEvent(nsIDOMEvent* aEvent, bool bMouseBtn, qsys::InDevEvent &ev);
  };

}

#endif

