//
// CueMol main service for Mozilla/XPCOM interface
//
// $Id: XPCCueMol.cpp,v 1.38 2011/03/10 13:11:55 rishitani Exp $
//
#define __STDC_LIMIT_MACROS
#define __STDC_CONSTANT_MACROS

#include "xpcom.hpp"
#include <nsIObserverService.h>

#include "XPCCueMol.hpp"
#include "XPCObjWrapper.hpp"
#include "XPCTimerImpl.hpp"

#ifdef XP_WIN
#  undef NEW_H
#  define NEW_H "new.h"
#  include "XPCNativeWidgetWin.hpp"
#endif
#if defined(XP_MACOSX)
#  include "XPCNativeWidgetCocoa.hpp"
#elif defined(XP_UNIX)
#  include "XPCNativeWidgetGDK.hpp"
#endif

//

#include <libcuemol2_api/loader.hpp>
#include <libcuemol2_api/binding.hpp>
#include <libcuemol2_api/gui.hpp>

#include <qlib/ClassRegistry.hpp>
#include <qlib/EventManager.hpp>
#include <qlib/LByteArray.hpp>
#include <qsys/qsys.hpp>
#include <sysdep/sysdep.hpp>

#if defined(XP_MACOSX)
#include <Carbon/Carbon.h>
#include <ApplicationServices/ApplicationServices.h>
void registerFileType()
{
  CFBundleRef myAppsBundle = CFBundleGetMainBundle();
  if (myAppsBundle==NULL) {
    MB_DPRINTLN("Cannot get main bundle ref");
    return;
  }
  
  //CFURLRef myBundleURL = CFBundleCopyExecutableURL(myAppsBundle);
  CFURLRef myBundleURL = CFBundleCopyBundleURL(myAppsBundle);
  if (myBundleURL==NULL) {
    MB_DPRINTLN("Cannot get main bundle url");
    return;
  }

  FSRef myBundleRef;
  Boolean ok = CFURLGetFSRef(myBundleURL, &myBundleRef);
  CFRelease(myBundleURL);
  if (!ok) {
    MB_DPRINTLN("Cannot get main bundle FSRef");
  }

  OSStatus res = LSRegisterURL(myBundleURL, true);
  MB_DPRINTLN(">>>>> LSRegisterURL %d <<<<<", res);

  unsigned char sbuf[256];
  FSRefMakePath(&myBundleRef, sbuf, sizeof sbuf-1);
  MB_DPRINTLN(">>>>> registerFileType OK (%s)!! <<<<<", sbuf);
}
#else
void registerFileType()
{
}
#endif

using namespace xpcom;

#ifdef NS_IMPL_ISUPPORTS
NS_IMPL_ISUPPORTS(XPCCueMol, qICueMol, nsIObserver)
#else
NS_IMPL_ISUPPORTS2(XPCCueMol, qICueMol, nsIObserver)
#endif

// singleton instance of XPCCueMol
XPCCueMol *gpXPCCueMol;

XPCCueMol::XPCCueMol()
  : m_bInit(false)
{
  gpXPCCueMol = this;
}

XPCCueMol::~XPCCueMol()
{
  gpXPCCueMol = NULL;
  //if (m_bInit)
  //Fini();
}

//static
XPCCueMol *XPCCueMol::getInstance()
{
  return gpXPCCueMol;
}

//////////

// Quit-app observer

NS_IMETHODIMP
XPCCueMol::Observe(nsISupports* aSubject, const char* aTopic,
		   const char16_t * aData)
{
  // dumpWrappers();
  return NS_OK;
}

//////////

NS_IMETHODIMP XPCCueMol::Init(const char *confpath, bool *_retval)
{
  // XXX
  //AddRef();

  nsresult rv = NS_OK;

  if (m_bInit) {
    LOG_DPRINTLN("XPCCueMol> ERROR: CueMol already initialized.");
    return NS_ERROR_ALREADY_INITIALIZED;
  }

  MB_DPRINTLN("Call cuemol2::init...");
  int result = cuemol2::init(confpath, true);
  if (result < 0) {
    return NS_ERROR_FAILURE;
  }
  MB_DPRINTLN("Call cuemol2::init OK.");

  initTextRender();
  MB_DPRINTLN("---------- initTextRender() OK");

  registerFileType();

  result = cuemol2::init_timer(new XPCTimerImpl);
  if (result < 0) {
    return NS_ERROR_FAILURE;
  }
  
  // setup quit-app observer
  nsCOMPtr<nsIObserverService> obs = do_GetService("@mozilla.org/observer-service;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  
  rv = obs->AddObserver(this, "xpcom-shutdown", PR_FALSE);
  // rv = obs->AddObserver(this, "quit-application", PR_FALSE);
  NS_ENSURE_SUCCESS(rv, rv);
  
  MB_DPRINTLN("---------- setup observers OK");
  
  MB_DPRINTLN("XPCCueMol> CueMol initialized.");
  m_bInit = true;
  *_retval = PR_TRUE;

  return NS_OK;
}

NS_IMETHODIMP XPCCueMol::Fini()
{
  sysdep::destroyTextRender(m_pTR);
  cleanupWrappers();
  // cleanup timer
  qlib::EventManager::getInstance()->finiTimer();

  cuemol2::fini();

  m_bInit = false;
  return NS_OK;
}

bool XPCCueMol::initTextRender()
{
  m_pTR = cuemol2::initTextRender();
  return true;
}

/* boolean isInitialized (); */
NS_IMETHODIMP XPCCueMol::IsInitialized(bool *_retval)
{
  *_retval = m_bInit;
  return NS_OK;
  //return NS_ERROR_NOT_IMPLEMENTED;
}

using qlib::ClassRegistry;

NS_IMETHODIMP XPCCueMol::HasClass(const char * clsname, bool *_retval)
{
  LString errmsg;
  bool result = cuemol2::hasClass(clsname, _retval, errmsg);
  if (!result) {
    setErrMsg(errmsg);
    return NS_ERROR_FAILURE;
  }

  return NS_OK;
}

NS_IMETHODIMP XPCCueMol::GetService(const char *svcname,
                                    qIObjWrapper **_retval)
{
  LString errmsg;
  qlib::LScriptable *pobj;
  bool ok = cuemol2::getService(svcname, &pobj, errmsg);
  if (!ok) {
    setErrMsg(errmsg);
    return NS_ERROR_FAILURE;
  }

  XPCObjWrapper *pWrap = createWrapper();
  pWrap->setWrappedObj(pobj);

  *_retval = pWrap;
  NS_ADDREF((*_retval));
  MB_DPRINTLN("getService(%s) OK: %p", svcname, pobj);
  return NS_OK;
}

NS_IMETHODIMP XPCCueMol::CreateObj(const char *clsname,
                                   qIObjWrapper **_retval)
{
  return CreateFromString(clsname, "", _retval);
}

NS_IMETHODIMP XPCCueMol::CreateFromString(const char *clsname,
                                          const char *strval,
                                          qIObjWrapper **_retval)
{
  LString errmsg;
  qlib::LScriptable *pobj;
  bool ok;
  
  ok = cuemol2::createObj(clsname, strval, &pobj, errmsg);
  if (!ok) {
    setErrMsg(errmsg);
    return NS_ERROR_FAILURE;
  }

  XPCObjWrapper *pWrap = createWrapper();
  pWrap->setWrappedObj(pobj);

  *_retval = pWrap;
  NS_ADDREF((*_retval));
  MB_DPRINTLN("XPCCueMol> createObj(%s) OK: %p", clsname, pobj);
  return NS_OK;
}

XPCObjWrapper *XPCCueMol::createWrapper()
{
  int nind;
  if (m_freeind.size()>0) {
    // reuse allocated entry
    nind = m_freeind.back();
    m_freeind.pop_back();
  }
  else {
    // append to the last entry
    nind = m_pool.size();
    m_pool.push_back(Cell());
  }

  MB_ASSERT(m_pool[nind].ptr==NULL);

  XPCObjWrapper *pWr = new XPCObjWrapper(this, nind);
  m_pool[nind].ptr = pWr;

#ifdef MB_DEBUG
  m_pool[nind].dbgmsg = LString();
#endif

  return pWr;
}

void XPCCueMol::notifyDestr(int nind)
{
  //MB_DPRINTLN("======\ndestroy obj ind=%d, dbgmsg=%s\n======", nind, m_pool[nind].dbgmsg.c_str());
  m_pool[nind].ptr = NULL;

#ifdef MB_DEBUG
  m_pool[nind].dbgmsg = LString();
#endif

  m_freeind.push_back(nind);
}

void XPCCueMol::setWrapperDbgMsg(int nind, const char *dbgmsg)
{
#ifdef MB_DEBUG
  if (m_pool[nind].ptr==NULL)
    return; // unused wrapper
  
  XPCObjWrapper *pWr = m_pool[nind].ptr;
  LString clsnm = typeid(*(pWr->getWrappedObj())).name();
  m_pool[nind].dbgmsg = LString("Wrapper for ["+clsnm+"] created at:\n");
  m_pool[nind].dbgmsg += dbgmsg;
#endif
}

void XPCCueMol::dumpWrappers() const
{
  MB_DPRINTLN("=== Unreleased wrappers... ===");
  for (size_t i=0; i<m_pool.size(); ++i) {
    if (m_pool[i].ptr) {
      XPCObjWrapper *pwr = m_pool[i].ptr;
      // LScriptable *pscr = pwr->getWrappedObj();
      // MB_DPRINTLN("Wrapper: %d %p (%s)", i, pwr, typeid(*pscr).name());
      MB_DPRINTLN("Wrapper: %d %p", i, pwr);
#ifdef MB_DEBUG
      MB_DPRINT("   MSG: ", m_pool[i].dbgmsg.c_str() );
      MB_DPRINTLN( m_pool[i].dbgmsg.c_str() );
      MB_DPRINTLN("----------");
#endif
    }
  }
  MB_DPRINTLN("=== Done ===");
}

/* void getErrMsg (out string confpath); */
NS_IMETHODIMP XPCCueMol::GetErrMsg(char **_retval )
{
  nsAutoCString nsstr(m_errMsg.c_str());
  *_retval = ToNewCString(nsstr);

  return NS_OK;
}

///////////////////////

/* qINativeWidget createNativeWidget (); */
NS_IMETHODIMP XPCCueMol::CreateNativeWidget(qINativeWidget **_retval )
{
  XPCNativeWidget *pWgt = NULL;

#ifdef XP_WIN
  pWgt = new XPCNativeWidgetWin();
#endif

#if defined(XP_MACOSX)
  pWgt = new XPCNativeWidgetCocoa();
#elif defined(XP_UNIX)
  pWgt = new XPCNativeWidgetGDK();
#endif

  if (pWgt==NULL) {
    LOG_DPRINTLN("XPCCueMol> FATAL ERROR: cannot create native widget");
    return NS_ERROR_FAILURE;
  }

  *_retval = pWgt;
  NS_ADDREF((*_retval));
  MB_DPRINTLN("XPCCueMol> createNativeWidget OK: %p", pWgt);
  return NS_OK;
}

/////////////////////////////////////////////////////////////////////
// ByteArray operation

/// ACString convBAryToStr (in qIObjWrapper aObj)
NS_IMETHODIMP XPCCueMol::ConvBAryToStr(qIObjWrapper *aObj, nsACString & _retval )
{
  XPCObjWrapper *pp = dynamic_cast<XPCObjWrapper *>(aObj);
  if (pp==NULL) {
    LOG_DPRINTLN("ConvBAryToStr> FATAL ERROR: unknown wrapper type (unsupported)");
    return NS_ERROR_FAILURE;
  }
  
  qlib::LByteArrayPtr *pByteAry = dynamic_cast<qlib::LByteArrayPtr *>( pp->getWrappedObj() );
  if (pByteAry==NULL) {
    LOG_DPRINTLN("ConvBAryToStr> FATAL ERROR: arg1 is not ByteArray");
    return NS_ERROR_FAILURE;
  }
  
  int nlen = pByteAry->get()->getSize();
  _retval.SetLength(nlen);

  if (_retval.Length() != nlen)
    return NS_ERROR_OUT_OF_MEMORY;

  char *ptr = _retval.BeginWriting();
  const char *pBuf = (const char *) pByteAry->get()->data();

  for (int i=0; i<nlen; ++i)
    ptr[i] = pBuf[i];

  return NS_OK;
}

/// qIObjWrapper createBAryFromStr (in ACString aString, in PRUint32 aCount)
NS_IMETHODIMP XPCCueMol::CreateBAryFromStr(const nsACString & aString, qIObjWrapper **_retval )
{
  PRUint32 nlen = aString.Length();

  qlib::LByteArray *pNewObj = new qlib::LByteArray(nlen);
  if (nlen>0) {
    const char *ptr = aString.BeginReading();
    char *pBuf = (char *)(pNewObj->data());
    for (int i=0; i<nlen; ++i)
      pBuf[i] = ptr[i];
  }
  
  XPCObjWrapper *pWrap = createWrapper();
  pWrap->setWrappedObj(pNewObj);
  *_retval = pWrap;
  NS_ADDREF((*_retval));

  return NS_OK;
}


/* qIObjWrapper createBAryFromIStream (in nsIInputStream aInputStream); */
NS_IMETHODIMP XPCCueMol::CreateBAryFromIStream(nsIInputStream *aInputStream, qIObjWrapper **_retval )
{
  nsresult rv = NS_OK;

  uint64_t nlen;
  rv = aInputStream->Available(&nlen);
  NS_ENSURE_SUCCESS(rv, rv);

  qlib::LByteArray *pNewObj = new qlib::LByteArray(nlen);
  if (nlen>0) {
    char *pBuf = (char *)(pNewObj->data());
    PRUint32 nres;
    rv = aInputStream->Read(pBuf, nlen, &nres);
    NS_ENSURE_SUCCESS(rv, rv);
  }
  
  XPCObjWrapper *pWrap = createWrapper();
  pWrap->setWrappedObj(pNewObj);
  *_retval = pWrap;
  NS_ADDREF((*_retval));

  return NS_OK;
}

void XPCCueMol::cleanupWrappers()
{
  MB_DPRINTLN("=== Cleaning up the unreleased %d wrappers... ===", m_pool.size());
  for (size_t i=0; i<m_pool.size(); ++i) {
    if (m_pool[i].ptr) {
      XPCObjWrapper *pwr = m_pool[i].ptr;
      qlib::LScriptable *pscr = pwr->getWrappedObj();

#ifdef MB_DEBUG
      LString clsnm = typeid(*(pscr)).name();
      MB_DPRINTLN("Detach wrapper for class %s: %d %p", clsnm.c_str(), i, pwr);

      LString strrep = pscr->toString();
      MB_DPRINTLN("  str rep=<%s>", strrep.c_str());

      if (pscr->isSmartPtr()) {
        //pscr = pscr->getSPInner();
        long nref = dynamic_cast<qlib::LSupScrSp*>(pscr)->use_count();
        MB_DPRINTLN("  ref ctr=%d", nref);
      }
#endif

      pwr->detach();
    }
  }
  m_pool.clear();
  MB_DPRINTLN("=== Done ===");
}

NS_IMETHODIMP XPCCueMol::Test(nsISupports *arg)
{
  dumpWrappers();
  return NS_OK;
}
