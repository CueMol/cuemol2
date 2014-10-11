//
// AxMolViewCtl.h
//
// $Id: AxMolViewCtl.h,v 1.14 2006/08/11 15:20:05 rishitani Exp $
//

#pragma once
#include "resource.h"
#include <atlctl.h>

#include <sysdep/WglView.hpp>
#include <sysdep/MouseEventHandler.hpp>

#pragma comment(lib, "opengl32.lib")
#pragma comment(lib, "glu32.lib")
//#pragma warning(disable : 4100)

#include "IQm2ViewCtl.h"

//////////////////////////////////////////////////////////////////////

///
/// CAxMolViewCtl class definition using attributes
///  This class corresponds to XPCNativeWidget in the XPCOM implementation
///
[
  coclass,
  uuid("b3c22d9d-cb97-4692-8097-2a36ecd9970b"),
  helpstring("AxMolViewCtl Class"),
  version(1.0),
  progid("AxCueMol2.AxMolViewCtl.1"),
  vi_progid("AxCueMol2.AxMolViewCtl"),
  threading(apartment),
  implements_category("CATID_Insertable"),
  implements_category("CATID_Control"),
//  registration_script("control.rgs"),
  registration_script("../../src/activex/AxMolViewCtl.rgs"),
  default(IQm2ViewCtl),
  support_error_info(IQm2ViewCtl)
  ]
class ATL_NO_VTABLE CAxMolViewCtl :
public CStockPropImpl<CAxMolViewCtl, IQm2ViewCtl, &__uuidof(IQm2ViewCtl), &CAtlModule::m_libid>,
public CComControl<CAxMolViewCtl>,
public IPersistStreamInitImpl<CAxMolViewCtl>,
public IOleControlImpl<CAxMolViewCtl>,
public IOleObjectImpl<CAxMolViewCtl>,
public IOleInPlaceActiveObjectImpl<CAxMolViewCtl>,
public IViewObjectExImpl<CAxMolViewCtl>,
public IOleInPlaceObjectWindowlessImpl<CAxMolViewCtl>,
public IPersistStorageImpl<CAxMolViewCtl>,
public ISpecifyPropertyPagesImpl<CAxMolViewCtl>,
public IQuickActivateImpl<CAxMolViewCtl>,
public IDataObjectImpl<CAxMolViewCtl>,
public IObjectSafetyImpl<CAxMolViewCtl, INTERFACESAFE_FOR_UNTRUSTED_CALLER|INTERFACESAFE_FOR_UNTRUSTED_DATA>,
public IPersistPropertyBagImpl<CAxMolViewCtl>,
public IProvideClassInfo2Impl<&__uuidof(CAxMolViewCtl), NULL>
//public IObjectSafety,
//public ISupportErrorInfo
{

public:
  CAxMolViewCtl();
  virtual ~CAxMolViewCtl();

  BEGIN_PROP_MAP(CAxMolViewCtl)
    PROP_DATA_ENTRY("_cx", m_sizeExtent.cx, VT_UI4)
    PROP_DATA_ENTRY("_cy", m_sizeExtent.cy, VT_UI4)
    PROP_ENTRY_TYPE("Source", 1, CLSID_NULL, VT_BSTR)

    //PROP_ENTRY_TYPE("BackColor", DISPID_BACKCOLOR, CLSID_StockColorPage, VT_DISPATCH)
    //PROP_ENTRY_TYPE("Font", DISPID_FONT, CLSID_StockFontPage, VT_DISPATCH)
//    PROP_ENTRY_TYPE("Source", 1, __uuidof(CSrcProp), VT_BSTR)
//    PROP_ENTRY("BackColor", DISPID_BACKCOLOR, CLSID_StockColorPage)
//    PROP_ENTRY("Font", DISPID_FONT, CLSID_StockFontPage)
//    PROP_ENTRY("Source", 1, __uuidof(CSrcProp))

      // example:
      // PROP_ENTRY("Property Description", dispid, clsid)
      // PROP_PAGE(CLSID_StockColorPage)
  END_PROP_MAP()
    ;
  
  BEGIN_MSG_MAP(CAxMolViewCtl)
    MESSAGE_HANDLER(WM_CREATE, OnCreate)
    MESSAGE_HANDLER(WM_DESTROY, OnDestroy)
    MESSAGE_HANDLER(WM_SIZE, OnSize)
    MESSAGE_HANDLER(WM_LBUTTONDBLCLK, OnLButtonDblClk)
    MESSAGE_HANDLER(WM_LBUTTONDOWN, OnLButtonDown)
    MESSAGE_HANDLER(WM_LBUTTONUP, OnLButtonUp)
    MESSAGE_HANDLER(WM_MOUSEMOVE, OnMouseMove)
    MESSAGE_HANDLER(WM_MOUSEWHEEL, OnMouseWheel)
    MESSAGE_HANDLER(WM_RBUTTONDBLCLK, OnRButtonDblClk)
    MESSAGE_HANDLER(WM_RBUTTONDOWN, OnRButtonDown)
    MESSAGE_HANDLER(WM_RBUTTONUP, OnRButtonUp)

    COMMAND_ID_HANDLER(ID_ANIM_START, OnAnimStart)
    COMMAND_ID_HANDLER(ID_ANIM_STOP, OnAnimStop)
    COMMAND_ID_HANDLER(ID_ANIM_PAUSE, OnAnimPause)

    //
    // XXX: Is this handler is required to avoid flickering in redrawing??
    // MESSAGE_HANDLER(WM_ERASEBKGND, OnEraseBkgnd)
    //
    // This handler will be used when implementing animation or etc.
    //  MESSAGE_HANDLER(WM_TIMER, OnTimer)
    CHAIN_MSG_MAP(CComControl<CAxMolViewCtl>)
    DEFAULT_REFLECTION_HANDLER()
  END_MSG_MAP()
    ;

  // Handler prototypes:
  //  LRESULT MessageHandler(UINT uMsg, WPARAM wParam, LPARAM lParam, BOOL& bHandled);
  //  LRESULT CommandHandler(WORD wNotifyCode, WORD wID, HWND hWndCtl, BOOL& bHandled);
  //  LRESULT NotifyHandler(int idCtrl, LPNMHDR pnmh, BOOL& bHandled);
  
  // Advice to clients that this control is opaque and has solid bkgnd.
  //  (see IViewObjectEx::GetViewStatus)
  DECLARE_VIEW_STATUS(VIEWSTATUS_SOLIDBKGND | VIEWSTATUS_OPAQUE);    

  /// Redraw the control (called by clients)
  HRESULT OnDraw(ATL_DRAWINFO& di);

/*
  /// Deserialize this control's property (especially the "Source" prop)
  ///  from the property bag provided by the client.
  ///  (by implementing IPersistPropertyBagImpl::Load)
  STDMETHOD(Load)(LPPROPERTYBAG pPropBag, LPERRORLOG pErrorLog);
*/
  
public:

  CComPtr<IFontDisp> m_pFont;

  // virtual void OnFontChanged( );
  // void onBackColorChanged();

  //
  // Window Message Handlers
  //
  LRESULT OnCreate(UINT uMsg, WPARAM wParam, LPARAM lParam, BOOL& bHandled);
  LRESULT OnDestroy(UINT uMsg, WPARAM wParam, LPARAM lParam, BOOL& bHandled);
  LRESULT OnSize(UINT uMsg, WPARAM wParam, LPARAM lParam, BOOL& bHandled);
  LRESULT OnLButtonDblClk(UINT uMsg, WPARAM wParam, LPARAM lParam, BOOL& bHandled);
  LRESULT OnLButtonDown(UINT uMsg, WPARAM wParam, LPARAM lParam, BOOL& bHandled);
  LRESULT OnLButtonUp(UINT uMsg, WPARAM wParam, LPARAM lParam, BOOL& bHandled);
  LRESULT OnMouseMove(UINT uMsg, WPARAM wParam, LPARAM lParam, BOOL& bHandled);
  LRESULT OnMouseWheel(UINT uMsg, WPARAM wParam, LPARAM lParam, BOOL& bHandled);
  LRESULT OnRButtonDblClk(UINT uMsg, WPARAM wParam, LPARAM lParam, BOOL& bHandled);
  LRESULT OnRButtonDown(UINT uMsg, WPARAM wParam, LPARAM lParam, BOOL& bHandled);
  LRESULT OnRButtonUp(UINT uMsg, WPARAM wParam, LPARAM lParam, BOOL& bHandled);

/*
  LRESULT OnEraseBkgnd(UINT uMsg, WPARAM wParam,
                       LPARAM lParam, BOOL& bHandled) {
    return 0;
  }
  LRESULT OnTimer(UINT uMsg, WPARAM wParam, LPARAM lParam, BOOL& bHandled);
*/
  

  HRESULT OnAnimStart(WORD wNotifyCode, WORD wID, HWND hWndCtl, BOOL& bHandled);
  HRESULT OnAnimStop(WORD wNotifyCode, WORD wID, HWND hWndCtl, BOOL& bHandled);
  HRESULT OnAnimPause(WORD wNotifyCode, WORD wID, HWND hWndCtl, BOOL& bHandled);


  //
  // Property Handlers
  //
  STDMETHOD(get_Source)(BSTR* pVal);
  STDMETHOD(put_Source)(BSTR newVal);

  // STDMETHOD(get_BackColor)(OLE_COLOR *pVal);
  // STDMETHOD(put_BackColor)(OLE_COLOR newVal);

  //STDMETHOD(get_Font)(OLE_COLOR *pVal);
  //STDMETHOD(put_Font)(OLE_COLOR newVal);

  ////////////////////////////////////////////////////
  
private:

  CString m_url;  // the url of the stream ==m_bstrSrc

  bool m_bWndCreated;

  bool m_bLoadOK;
  CString m_strErrMsg;
  
  // bool m_bfullscreen;
  bool m_bActive;

  HDC m_hDC;
  
  /// Scene reference to the view object attached
  qsys::ScenePtr m_pScene;

  /// View reference to the view object attached
  qsys::ViewPtr m_pView;

  /// Cached native view pointer
  sysdep::WglView *m_pWglView;

  sysdep::MouseEventHandler m_meh;

  HFONT m_hFont;

  HICON m_hIcon;
  CString m_strVerInfo;

  //int ReadParamString(LPPROPERTYBAG pPropBag, LPERRORLOG pErrorLog,
  //WCHAR *name, TCHAR *buf, int bufsize);

  void drawEditMode(ATL_DRAWINFO& di);

  bool loadData();
  bool loadDataPDB(const qlib::LString &srcpath);
  bool loadDataQSC(const qlib::LString &srcpath);

  void setUpMouseEvent(UINT msg, WPARAM wParam, LPARAM lParam, qsys::InDevEvent &ev);
  bool dispatchMouseEvent(int nType, qsys::InDevEvent &ev);

  CString GetClientSiteURL();
  LString getBaseURL();

  // setup (rbtn-click) shortcut menu
  void setupContextMenu();
  void destroyContextMenu();
  void doContextMenu(int x, int y);

  bool m_bUseAdhocAnim;
  HMENU m_hMenuPopup;
};


