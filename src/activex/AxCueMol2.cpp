//
// CAxCueMol2 class implementation:
//  Main singleton object for the CueMol2 ActiveX control
//  (also implements DLL Export routines, etc)
//

#include "stdafx.h"
#include "resource.h"

#include "AxCueMol2.h"

#include <qlib/LString.hpp>
#include <qlib/LMsgLog.hpp>

#include <qsys/qsys.hpp>
#include <qsys/SceneManager.hpp>
#include <sysdep/sysdep.hpp>
#include <sysdep/WinTimerImpl.hpp>
#include <jsbr/jsbr.hpp>

// gfx::TextRenderImpl *createTextRender();
// void destroyTextRender(void *pTR);

namespace molstr {
  extern bool init();
  extern void fini();
}

namespace molvis {
  extern bool init();
  extern void fini();
}

namespace xtal {
  extern bool init();
  extern void fini();
}

namespace surface {
  extern bool init();
  extern void fini();
}

namespace symm {
  extern bool init();
  extern void fini();
}

namespace lwview {
  extern bool init();
  extern void fini();
}

namespace anim {
  extern bool init();
  extern void fini();
}

using qlib::LString;

/////////////////////////////////////////////////////////////////

///
/// Module loader/unloader class to call CCueMol2Ctl::InitModule() and FiniModule()
///
[ module(dll, uuid = "{fc199060-5724-4df8-bb97-b8b5e3143a6f}", 
         name = "AxCueMol2", 
         helpstring = "CueMol2 ActiveX 1.0 Type Library",
         resource_name = "IDR_AXCUEMOL2") ]
class CAxCueMol2Module
{
public:
  // CAtlDllModuleT

  CAxCueMol2Module()
  {
    int old = _CrtSetDbgFlag(_CRTDBG_LEAK_CHECK_DF|_CRTDBG_ALLOC_MEM_DF);
    CAxCueMol2::initModule();
    CAxCueMol2 *pMod = CAxCueMol2::getInstance();
    ATLASSERT(pMod!=NULL);
    pMod->init();
  }

  virtual ~CAxCueMol2Module()
  {
    // finalization
    CAxCueMol2 *pMod = CAxCueMol2::getInstance();
    if (!pMod->isInitFailed() && pMod->isInitialized())
      pMod->fini();
    
    CAxCueMol2::finiModule();
  }
};

/////////////////////////////////////////////////////////////////

//static
CAxCueMol2 *CAxCueMol2::m_spInstance;

CAxCueMol2::CAxCueMol2()
  : m_bInit(FALSE), m_bInitFailed(FALSE), m_bUIInitialized(FALSE)
{
  ATLTRACE2("CAxCueMol2 ctor called\n");
  m_hModuleInst = _AtlBaseModule.GetModuleInstance();
}

CAxCueMol2::~CAxCueMol2()
{
  ATLTRACE2("CAxCueMol2 dtor called\n");
}

BOOL CAxCueMol2::init()
{
  if (m_bInit) {
    LOG_DPRINTLN("AxCueMol2> ERROR: CueMol2 already initialized.");
    return FALSE;
  }

  if (qlib::init()) {
    MB_DPRINTLN("qlib::init() OK.");
  }
  else {
    ATLTRACE2("qlib::init() ERROR!!\n");
    m_bInitFailed = TRUE;
    return FALSE;
  }

  LString conf_path = guessConfPath();

  if (!qsys::init(conf_path)) {
    LOG_DPRINTLN("Qsys Init (%s): ERROR!!", conf_path.c_str());
    m_bInitFailed = TRUE;
    return FALSE;
  }
  sysdep::init();

  // load internal JS module
  jsbr::init();

  // load molstr module
  molstr::init();

  // load other modules
  molvis::init();
  xtal::init();
  symm::init();
  surface::init();
  lwview::init();
  anim::init();
  // molanl::init();

  // setup timer
  sysdep::WinTimerImpl *pTimer = new sysdep::WinTimerImpl;
  qlib::EventManager::getInstance()->initTimer(pTimer);

  // setup text renderer
  // initTextRender();

  // Get version info
  qsys::SceneManager *pSceMgr = qsys::SceneManager::getInstance();
  m_strVersion = pSceMgr->getVersion();
  m_strBuild = pSceMgr->getBuildID();

  m_bInit = TRUE;
  return TRUE;
}

void CAxCueMol2::fini()
{
  // celanup text renderer
  //destroyTextRender(m_pTR);

  // cleanup timer
  qlib::EventManager::getInstance()->finiTimer();

  anim::fini();
  lwview::fini();
  surface::fini();
  symm::fini();
  xtal::fini();
  molvis::fini();

  molstr::fini();
  jsbr::fini();

  sysdep::fini();
  qsys::fini();
  qlib::fini();
}

LString CAxCueMol2::guessConfPath() const
{
  LString dllname, dlldirname;
  {
    TCHAR szLongPathName[_MAX_PATH];
    ::GetModuleFileName(getInstHandle(), szLongPathName, _MAX_PATH);
    dllname = szLongPathName;

    int spos = dllname.lastIndexOf(MB_PATH_SEPARATOR);
    dlldirname = dllname.substr(0, spos);
  }
  
  MB_DPRINTLN("module file name: <%s>", dllname.c_str());
  MB_DPRINTLN("module dir  name: <%s>", dlldirname.c_str());

  LString sysconf_path;

  sysconf_path = dlldirname + MB_PATH_SEPARATOR;
  sysconf_path += DEFAULT_SYSCONFIG;
  MB_DPRINTLN("sysconfig  path: <%s>", sysconf_path.c_str());

  return sysconf_path;
}

