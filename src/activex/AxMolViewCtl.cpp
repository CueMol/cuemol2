//
// AxMolViewCtl.cpp
//
// $Id: AxMolViewCtl.cpp,v 1.20 2006/03/15 16:10:01 rishitani Exp $
//

#include "stdafx.h"
#include "AxCueMol2.h"
#include "AxMolViewCtl.h"
//#include <math.h>
// #include "FontUtils.h"

#include <qlib/Utils.hpp>
#include <qsys/InDevEvent.hpp>
#include <qsys/SceneManager.hpp>
#include <qsys/StreamManager.hpp>
#include <qsys/ObjReader.hpp>
#include <qsys/SceneXMLReader.hpp>
#include <qsys/Scene.hpp>
#include <qsys/View.hpp>
#include <qsys/Renderer.hpp>
#include <sysdep/WglDisplayContext.hpp>

#include <qsys/anim/AnimMgr.hpp>
#include <modules/anim/SimpleSpin.hpp>


/////////////////////////////////////////////////////////////////////////////
// AxMolViewCtl
//

/// default ctor
CAxMolViewCtl::CAxMolViewCtl()
{
  m_url = "";
  m_bWndCreated = false;

  // superclass's (protected) member??
  m_bWindowOnly = TRUE;

  m_bActive = FALSE;
  m_bLoadOK = false;

  // m_hWnd = NULL;
  m_hDC = NULL;
  m_pWglView = NULL;

  m_hFont = NULL;
  m_hIcon = NULL;

  m_bUseAdhocAnim = false;
  m_hMenuPopup = NULL;
}

CAxMolViewCtl::~CAxMolViewCtl()
{
  if (m_hFont!=NULL)
    ::DeleteObject(m_hFont);
  if (m_hIcon!=NULL)
    ::DestroyIcon(m_hIcon);
}

HRESULT CAxMolViewCtl::OnDraw(ATL_DRAWINFO& di)
{
  if (!m_bWndCreated || m_pWglView==NULL) {
    // WglView hasn't been created --> draw edit-mode
    drawEditMode(di);
    return S_OK;
  }

  if (m_url=="" || !m_bLoadOK ) {
    // Not in edit mode, but datasrc is null or cannot be loaded
    // --> draw error page
    drawEditMode(di);
    return S_OK;
  }

  // draw the mol scene
  m_pWglView->forceRedraw();

  return S_OK;
}

/// Draw the edit-mode/errmsg contents
void CAxMolViewCtl::drawEditMode(ATL_DRAWINFO& di)
{
  HDC hdc_mf  = di.hdcDraw;
  HBRUSH      hOldBrush, hBlkBrush, hWhtBrush;
  HPEN        hOldPen, hPen;
  int width = di.prcBounds->right - di.prcBounds->left;
  int height = di.prcBounds->bottom - di.prcBounds->top;

  HDC hdc = ::CreateCompatibleDC(::GetWindowDC(NULL));
  HBITMAP hbmp = ::CreateCompatibleBitmap(::GetWindowDC(NULL), width, height);
  HGDIOBJ hOldBmp = ::SelectObject(hdc, hbmp);
  CRect rc(CPoint(0,0), CSize(width, height)); // = *(RECT*)di.prcBounds;

  //
  // Initialize fonts
  //
  if (m_hFont==NULL) {
    NONCLIENTMETRICS info;
    LOGFONT logFont;
    info.cbSize = sizeof(info);
    ::SystemParametersInfo(SPI_GETNONCLIENTMETRICS, sizeof(info), &info, 0);
    memset(&logFont, 0, sizeof (LOGFONT));
    logFont.lfCharSet = (BYTE) ::GetTextCharsetInfo(hdc, NULL, 0);
    logFont.lfHeight = info.lfMenuFont.lfHeight;
    logFont.lfWeight = info.lfMenuFont.lfWeight;
    logFont.lfItalic = info.lfMenuFont.lfItalic;
    _tcscpy(logFont.lfFaceName, "MS Shell Dlg");
    m_hFont = ::CreateFontIndirect(&logFont);
  }
  
  if (m_hIcon==NULL) {
    m_hIcon = (HICON) ::LoadImage(_AtlBaseModule.GetModuleInstance(),
                                  MAKEINTRESOURCE(IDI_AXCUEMOL2_ICO),
                                  IMAGE_ICON, 32, 32, LR_DEFAULTCOLOR|LR_SHARED);
  }

  // Create and select the colors to draw the circle
  hPen = (HPEN)::GetStockObject(BLACK_PEN);
  hOldPen = (HPEN)::SelectObject(hdc, hPen);
  hWhtBrush = (HBRUSH)::GetStockObject(WHITE_BRUSH);
  hOldBrush = (HBRUSH)::SelectObject(hdc, hWhtBrush);

  //::FrameRect(hdc, &rc, hBlkBrush);
  ::Rectangle(hdc, rc.left, rc.top, rc.right, rc.bottom);

  ::DrawIcon(hdc, rc.left+15, rc.top+15, m_hIcon);

  HFONT hOldFont = (HFONT)::SelectObject(hdc, m_hFont);
  
  //
  // Draw Version Info
  //
  ::SetTextColor(hdc, RGB(0,0,0));
  ::SetBkMode(hdc, TRANSPARENT);
  CRect strrc = rc;
  strrc.left += 15+32+10;
  strrc.top += 15;

  CString vinfo = "CueMol2 ActiveX Control\n";
  vinfo += "Version ";
  vinfo += CAxCueMol2::getInstance()->getVersion().c_str();
  vinfo += "\n";
  vinfo += "Build ";
  vinfo += CAxCueMol2::getInstance()->getBuild().c_str();
  vinfo += "\n";

  ::DrawText(hdc, vinfo, -1, &strrc,
             DT_LEFT | DT_TOP | DT_WORDBREAK | DT_NOPREFIX | DT_CALCRECT);
  ::DrawText(hdc, vinfo, -1, &strrc,
             DT_LEFT | DT_TOP | DT_WORDBREAK | DT_NOPREFIX);
  int nHgt = strrc.bottom-strrc.top;
  if (nHgt<32+10)
    nHgt = 32+10;
  
  //
  // Draw DataSource Info
  //
  CString str;
  if (m_url!="") {
    str += "Data Source: ";
    str += m_url;
  }
  else {
    str += "Data Source: not loaded!!";
  }
  if (!m_bWndCreated)
    str += " (Edit Mode)";

  // show load error msg
  if (m_url!="" && !m_bLoadOK) {
    str += "\n";
    str += "LoadError: ";
    str += m_strErrMsg;
  }

  strrc = rc;
  strrc.left += 15;
  strrc.right -= 10;
  strrc.top += 15+nHgt;
  ::DrawText(hdc, str, -1, &strrc,
             DT_LEFT | DT_TOP | DT_WORDBREAK | DT_NOPREFIX | DT_PATH_ELLIPSIS);

  // Select back the old pen and brush and delete the brush we created
  SelectObject(hdc, hOldFont);
  SelectObject(hdc, hOldPen);
  SelectObject(hdc, hOldBrush);
  DeleteObject(hWhtBrush);

  // copy to the display
  int xx = di.prcBounds->left;
  int yy = di.prcBounds->top;
  ::BitBlt(hdc_mf, xx, yy, width, height, hdc, 0, 0, SRCCOPY);
  ::SelectObject(hdc, hOldBmp);
  ::DeleteObject(hbmp);
  ::DeleteDC(hdc);
}

LRESULT CAxMolViewCtl::OnCreate(UINT uMsg, WPARAM wParam, LPARAM lParam, BOOL& bHandled)
{
  if (m_bWndCreated) return S_OK;

  // Create new scene
  qsys::SceneManager *pScMgr = qsys::SceneManager::getInstance();
  m_pScene = pScMgr->createScene();

  // Create new view
  m_pView = m_pScene->createView();
  
  qsys::View *ptmp = m_pView.get();
  sysdep::WglView *pWglView = dynamic_cast<sysdep::WglView *>(ptmp);

  if (pWglView==NULL) {
    m_pWglView = NULL;
    LOG_DPRINTLN("WIN32 bind failed: invalid view type %p !!", ptmp);
    return 0; // XXX
  }
  
  // set cached view ptr
  m_pWglView = pWglView;

  // get the device context (DC)
  //m_hDC = ::GetDC( m_hWnd );
  m_hDC = GetDC();

  if (!m_hDC) {
    LOG_DPRINT("CAxMolViewCtl::OnCreate() cannot create device context!!\n");
    return 0; // XXX
  }

  MB_DPRINT("Win bind: view %p type=%s\n", ptmp, typeid(*ptmp).name());

  bool res = pWglView->attach(m_hWnd, m_hDC);
  MB_DPRINTLN("Win bind: %s", res?"OK":"NG");
  if (!res) {
    m_pWglView = NULL;
    return 0; // XXX
  }

  RECT rc;
  GetWindowRect(&rc);
  m_pWglView->sizeChanged(rc.left-rc.right, rc.bottom-rc.top);

  MB_DPRINT("XPCNativeWidgetWin::attachImpl OK\n");

  m_bWndCreated = true;

  // Load data from m_url
  loadData();

  // setup shortcut menu
  setupContextMenu();
  return 0;
}

LRESULT CAxMolViewCtl::OnDestroy(UINT uMsg, WPARAM wParam, LPARAM lParam, BOOL& bHandled)
{
  m_bActive = FALSE;
  if (!m_bWndCreated) return S_OK;

  if (m_hDC) {
    ReleaseDC(m_hDC);
    m_hDC=NULL;
  }

  qsys::SceneManager *pScMgr = qsys::SceneManager::getInstance();

  // destroy the view
  m_pScene->destroyView(m_pView->getUID());

  // unreference the view
  m_pView = qsys::ViewPtr();
  m_pWglView = NULL;
  
  // cleanup the scene
  m_pScene->clearAllData();

  // destroy the scene
  pScMgr->destroyScene(m_pScene->getUID());
  m_pScene = qsys::ScenePtr();

  m_bWndCreated = false;
  return 0;
}

/// Load data file from the path indicated by the m_url member
bool CAxMolViewCtl::loadData()
{
  LString base_url = getBaseURL();

  LString inurl = m_url;
  m_bLoadOK = false;
  m_strErrMsg = "";

  // cleanup old scene
  m_pScene->clearAllData();

  if ( !qlib::isAbsolutePath(inurl) && !base_url.isEmpty() ) {
    inurl = base_url + MB_PATH_SEPARATOR + inurl;
  }

  if (inurl.endsWith(".pdb")) {
    return loadDataPDB(inurl);
  }
  else if (inurl.endsWith(".qsc") ||
           inurl.endsWith(".qsl")) {
    return loadDataQSC(inurl);
  }

  return false;
}

/// Simple PDB file loader (just create the simple renderer)
bool CAxMolViewCtl::loadDataPDB(const qlib::LString &srcpath)
{
  qsys::StreamManager *pSM = qsys::StreamManager::getInstance();
  MB_ASSERT(pSM!=NULL);

  qsys::ObjectPtr pObj;
  try {
    qsys::ObjReaderPtr pReader = pSM->createHandler("pdb", 0);
    pReader->setPath(srcpath);
    pObj = pReader->createDefaultObj();
    pReader->attach(pObj);
    pReader->read();
    pReader->detach();
    pObj->setName("PDB");
    m_pScene->addObject(pObj);
  }
  catch (qlib::LException &e) {
    m_strErrMsg = e.getMsg();
    return false;
  }
  catch (...) {
    m_strErrMsg = "Unknown exception occured";
    return false;
  }

  if (pObj.isnull())
    return false;

  try {
    qsys::RendererPtr pRend = pObj->createRenderer("simple");
    pRend->applyStyles("DefaultCPKColoring");
    pRend->setName("simple0");
    qlib::Vector4D vcen = pRend->getCenter();
    m_pWglView->setViewCenter(vcen);
  }
  catch (qlib::LException &e) {
    m_strErrMsg = e.getMsg();
    return false;
  }
  catch (...) {
    m_strErrMsg = "Unknown exception occured";
    return false;
  }

  m_bLoadOK = true;
  return true;
}

/// qsc/qsl file loader
bool CAxMolViewCtl::loadDataQSC(const qlib::LString &srcpath)
{
  qsys::StreamManager *pSM = qsys::StreamManager::getInstance();
  MB_ASSERT(pSM!=NULL);

  try {
    qsys::SceneXMLReaderPtr pReader = pSM->createHandler("qsc_xml", 3);
    pReader->setPath(srcpath);
    pReader->attach(m_pScene);
    pReader->read();
    pReader->detach();
    m_pScene->setName("scene");
  }
  catch (qlib::LException &e) {
    m_strErrMsg = e.getMsg();
    return false;
  }
  catch (...) {
    m_strErrMsg = "Unknown exception occured";
    return false;
  }

  try {
    qlib::uid_t vwid = m_pWglView->getUID();
    m_pScene->loadViewFromCam(vwid, "__current");
  }
  catch (qlib::LException &e) {
    m_strErrMsg = e.getMsg();
    return false;
  }
  catch (...) {
    m_strErrMsg = "Unknown exception occured";
    return false;
  }

  // setup default spin animation, if the scene doesn't contain animations
  qsys::AnimMgrPtr pAM = m_pScene->getAnimMgr();
  if (pAM->getSize()==0) {
    m_bUseAdhocAnim = true;
    pAM->setLength(qlib::time_value(10*1000)); // 10sec
    pAM->setStartCamName("__current");
    qlib::LScrSp<anim::SimpleSpin> pAnim = qlib::LScrSp<anim::SimpleSpin>(new anim::SimpleSpin());
    pAnim->setRelStart(0);
    pAnim->setRelEnd(10*1000);
    pAnim->setAngle(360.0);
    pAnim->setAxis(qlib::Vector4D(0,1,0));
    pAM->append(pAnim);
  }

  m_bLoadOK = true;
  return true;
}

//////////////////////////////////////////////////////////////////////

LRESULT CAxMolViewCtl::OnSize(UINT uMsg, WPARAM wParam, LPARAM lParam, BOOL& bHandled)
{
  if (!m_bWndCreated) return S_OK;
  int cx = LOWORD(lParam);
  int cy = HIWORD(lParam);

  m_pWglView->sizeChanged(cx, cy);
  
  return 0;
}

LRESULT CAxMolViewCtl::OnLButtonDown(UINT uMsg, WPARAM wParam,
                                     LPARAM lParam, BOOL& bHandled)
{
  if (!m_bWndCreated) return S_OK;
  CPoint point(lParam);
  
  qsys::InDevEvent ev;
  setUpMouseEvent(uMsg, wParam, lParam, ev);
  dispatchMouseEvent(0, ev);
  ::SetCapture(m_hWnd);

  bHandled = TRUE;
  return 0;
}

LRESULT CAxMolViewCtl::OnRButtonDown(UINT uMsg, WPARAM wParam,
                                     LPARAM lParam, BOOL& bHandled)
{
  if (!m_bWndCreated) return S_OK;
  CPoint point(lParam);
  
  qsys::InDevEvent ev;
  setUpMouseEvent(uMsg, wParam, lParam, ev);
  dispatchMouseEvent(0, ev);
  ::SetCapture(m_hWnd);

  bHandled = TRUE;
  return 0;
}

LRESULT CAxMolViewCtl::OnMouseMove(UINT uMsg, WPARAM wParam, LPARAM lParam, BOOL& bHandled)
{
  if (!m_bWndCreated) return S_OK;
  CPoint point(lParam);
  
  if ((wParam & MK_LBUTTON) ||
      (wParam & MK_MBUTTON) ||
      (wParam & MK_RBUTTON)) {
    // mouse button is pressed --> fire indev event
    //MB_DPRINTLN("****** WM_MOUSE MOVE %p", lParam);
    qsys::InDevEvent ev;
    setUpMouseEvent(uMsg, wParam, lParam, ev);
    dispatchMouseEvent(1, ev);
  }

  bHandled = TRUE;
  return 0;
}

LRESULT CAxMolViewCtl::OnLButtonUp(UINT uMsg, WPARAM wParam, LPARAM lParam, BOOL& bHandled)
{
  if (!m_bWndCreated) return S_OK;
  CPoint point(lParam);
  
  ::ReleaseCapture();
  
  UINT nFlags = wParam;
  
  nFlags &= ~(MK_LBUTTON|MK_RBUTTON|MK_MBUTTON);
  if (uMsg==WM_LBUTTONUP)
    nFlags |= MK_LBUTTON;
  else
    nFlags |= MK_RBUTTON;
  
  qsys::InDevEvent ev;
  setUpMouseEvent(uMsg, nFlags, lParam, ev);
  dispatchMouseEvent(2, ev);
  
  bHandled = TRUE;
  return 0;
}

LRESULT CAxMolViewCtl::OnRButtonUp(UINT uMsg, WPARAM wParam, LPARAM lParam, BOOL& bHandled)
{
  if (!m_bWndCreated) return S_OK;
  CPoint point(lParam);
  
  ::ReleaseCapture();
  
  UINT nFlags = wParam;
  
  nFlags &= ~(MK_LBUTTON|MK_RBUTTON|MK_MBUTTON);
  if (uMsg==WM_LBUTTONUP)
    nFlags |= MK_LBUTTON;
  else
    nFlags |= MK_RBUTTON;
  
  qsys::InDevEvent ev;
  setUpMouseEvent(uMsg, nFlags, lParam, ev);
  dispatchMouseEvent(2, ev);
  
  // handle the context menu
  if (ev.getType()==qsys::InDevEvent::INDEV_RBTN_CLICK) {
    //::MessageBox(m_hWnd, "OnContestMenu", "OK", MB_OK);
    doContextMenu(ev.getRootX(), ev.getRootY());
  }

  bHandled = TRUE;
  return 0;
}

LRESULT CAxMolViewCtl::OnMouseWheel(UINT uMsg, WPARAM wParam, LPARAM lParam, BOOL& bHandled)
{
  short zDelta = GET_WHEEL_DELTA_WPARAM(wParam);
  //UINT nFlags = GET_KEYSTATE_WPARAM(wParam);
  UINT nFlags = LOWORD(wParam);
  wParam = 0;
  qsys::InDevEvent ev;
  setUpMouseEvent(uMsg, nFlags, lParam, ev);
  ev.setType(qsys::InDevEvent::INDEV_WHEEL);
  ev.setDeltaX((int) zDelta);
  dispatchMouseEvent(3, ev);

  return 0;
}

LRESULT CAxMolViewCtl::OnLButtonDblClk(UINT uMsg, WPARAM wParam,
                                       LPARAM lParam, BOOL& bHandled)
{
  if (!m_bWndCreated) return S_OK;
  CPoint point(lParam);

  bHandled = TRUE;
  return 0;
}

LRESULT CAxMolViewCtl::OnRButtonDblClk(UINT uMsg, WPARAM wParam, LPARAM lParam, BOOL& bHandled)
{
  if (!m_bWndCreated) return S_OK;
  CPoint point(lParam);
  
  bHandled = TRUE;
  return 0;
}

/*LRESULT CAxMolViewCtl::OnContextMenu(UINT uMsg, WPARAM wParam, LPARAM lParam, BOOL& bHandled)
{
  if (!m_bWndCreated) return S_OK;
  CPoint point(lParam);
  
  bHandled = TRUE;
  return 0;
}*/


void CAxMolViewCtl::setUpMouseEvent(UINT msg, WPARAM wParam, LPARAM lParam, qsys::InDevEvent &ev)
{
  // setup locations
  POINTS pt = MAKEPOINTS(lParam);

  ev.setX(pt.x);
  ev.setY(pt.y);

  POINT ptroot = {pt.x, pt.y};
  ::ClientToScreen(m_hWnd, &ptroot);

  ev.setRootX(ptroot.x);
  ev.setRootY(ptroot.y);

  // set modifier
  int modif = 0;
  UINT nFlags = wParam;

  if (nFlags & MK_CONTROL)
    modif |= qsys::InDevEvent::INDEV_CTRL;
  if (nFlags & MK_SHIFT)
    modif |= qsys::InDevEvent::INDEV_SHIFT;
  if (nFlags & MK_LBUTTON)
    modif |= qsys::InDevEvent::INDEV_LBTN;
  if (nFlags & MK_MBUTTON)
    modif |= qsys::InDevEvent::INDEV_MBTN;
  if (nFlags & MK_RBUTTON)
    modif |= qsys::InDevEvent::INDEV_RBTN;

  // ev.setSource(this);
  ev.setModifier(modif);

  return;
}

bool CAxMolViewCtl::dispatchMouseEvent(int nType, qsys::InDevEvent &ev)
{
  switch (nType) {

    // mouse down event
  case 0:
    m_meh.buttonDown(ev);
    return true;

    // mouse move/dragging event
  case 1:
    if (!m_meh.move(ev)) return true;
    break;

    // mouse up event
  case 2:
    if (!m_meh.buttonUp(ev))
      return true;
    break;

    // other events
  case 3:
    // non-mouse event
    break;

    // should not be happen
  default:
    MB_DPRINTLN("NativeWidget::dispatchMouseEvent unknown nType %d", nType);
    return true;
    break;
  }

  m_pView->fireInDevEvent(ev);
  return true;
}

////////////////////////////////////////////////////////////////////////
// ActiveX property handlers

STDMETHODIMP CAxMolViewCtl::get_Source(BSTR* pVal)
{
  CComBSTR tmp = CT2OLE(m_url);
  return tmp.CopyTo(pVal);
}

STDMETHODIMP CAxMolViewCtl::put_Source(BSTR newVal)
{
  CString url = COLE2T(newVal);
  if (url==m_url)
    return S_OK;

  m_url = url;

  if (m_bWndCreated) {
    if (!loadData()) {
      return S_FALSE;
    }

    // // activate the slide-show tool
    // ToolManager *pMgr = ToolManager::getInstance();
    // pMgr->activateTool("Slide-show mode");
  }
  FireViewChange();

  SetDirty(TRUE);
  return S_OK;
}


/////////////////////////////////////////

CString CAxMolViewCtl::GetClientSiteURL()
{
  IMoniker* ptrfullMoniker = NULL;
  char objectname[300];
  LPOLESTR ppszDisplaynamefull;
  IBindCtx* pbcfull = NULL;
  
  LPOLECLIENTSITE pOleClientSite;
  HRESULT hres = GetClientSite(&pOleClientSite);
  if (!SUCCEEDED(hres))
    return CString();

  CString res;
  
  if (pOleClientSite) {
    hres = pOleClientSite->GetMoniker(OLEGETMONIKER_TEMPFORUSER,
                                      OLEWHICHMK_CONTAINER,
                                      &ptrfullMoniker);
    if (SUCCEEDED(hres)) {
      if (SUCCEEDED(CreateBindCtx( 0, &pbcfull ))) {
        if(SUCCEEDED(ptrfullMoniker->GetDisplayName(pbcfull,NULL,
                                                    &ppszDisplaynamefull))) {
          CComBSTR bstr = ppszDisplaynamefull;
          IMalloc *pm;
          CoGetMalloc(1, &pm);
          pm->Free(ppszDisplaynamefull);
          ptrfullMoniker->Release();
          pm->Release();

          res = COLE2T(bstr);
        }
      }
      pbcfull->Release();
    }
    pOleClientSite->Release();
  }

  return res;
}

LString CAxMolViewCtl::getBaseURL()
{
  /*
  fs::path srcpath( (const char *)GetClientSiteURL() );
  fs::path parent_path = srcpath.parent_path();
  if (!parent_path.is_complete())
    return LString();
  return parent_path.directory_string();
   */

  LString res = (const char *)GetClientSiteURL();
  int lastsp = res.lastIndexOf(MB_PATH_SEPARATOR);
  if (lastsp<0)
    return LString(); // error
  res = res.substr(0, lastsp);
  if ( !qlib::isAbsolutePath(res) )
    return LString(); // error
  return res;
}

void CAxMolViewCtl::setupContextMenu()
{
  HMENU hMenuPopup = ::CreatePopupMenu();
  
  ::AppendMenu(hMenuPopup, MF_ENABLED | MF_STRING , ID_ANIM_START, "Start animation");
  ::AppendMenu(hMenuPopup, MF_ENABLED | MF_STRING , ID_ANIM_STOP, "Stop animation");
  ::AppendMenu(hMenuPopup, MF_ENABLED | MF_STRING , ID_ANIM_PAUSE, "Pause animation");

  m_hMenuPopup = hMenuPopup;
}

void CAxMolViewCtl::destroyContextMenu()
{
  ::DestroyMenu(m_hMenuPopup);
  m_hMenuPopup = NULL;
}

void CAxMolViewCtl::doContextMenu(int x, int y)
{
  ::TrackPopupMenu(m_hMenuPopup,
                   TPM_LEFTALIGN|TPM_RIGHTBUTTON,
                   x, y, 0, m_hWnd, NULL);
}

HRESULT CAxMolViewCtl::OnAnimStart(WORD wNotifyCode, WORD wID, HWND hWndCtl, BOOL& bHandled)
{
  //::MessageBox(m_hWnd, "OnAnimStart", "test", MB_OK);
  if (m_pScene.isnull()||m_pView.isnull())
    return S_OK;
  qsys::AnimMgrPtr pAM = m_pScene->getAnimMgr();
  if (pAM.isnull())
    return S_OK;

  if (pAM->getSize()==0) {
    return S_OK;
  }

  if (m_bUseAdhocAnim) {
    // in the ad-hoc animation mode, the start camera is always the current view position
    m_pScene->saveViewToCam(m_pView->getUID(), "__current");
  }

  pAM->start(m_pView);
  return S_OK;
}

HRESULT CAxMolViewCtl::OnAnimStop(WORD wNotifyCode, WORD wID, HWND hWndCtl, BOOL& bHandled)
{
  if (m_pScene.isnull())
    return S_OK;
  qsys::AnimMgrPtr pAM = m_pScene->getAnimMgr();
  if (pAM.isnull())
    return S_OK;

  if (pAM->getSize()==0) {
    return S_OK;
  }

  pAM->stop();
  return S_OK;
}

HRESULT CAxMolViewCtl::OnAnimPause(WORD wNotifyCode, WORD wID, HWND hWndCtl, BOOL& bHandled)
{
  if (m_pScene.isnull())
    return S_OK;
  qsys::AnimMgrPtr pAM = m_pScene->getAnimMgr();
  if (pAM.isnull())
    return S_OK;

  if (pAM->getSize()==0) {
    return S_OK;
  }

  pAM->pause();
  return S_OK;
}

