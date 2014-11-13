
#include <common.h>

#include <iostream>
#include "boost/filesystem/path.hpp"
#include "boost/filesystem/operations.hpp"

#include <qlib/qlib.hpp>
#include <qlib/FileStream.hpp>

#include <qsys/qsys.hpp>
#include <qsys/SceneManager.hpp>
#include <qsys/SysConfig.hpp>

#ifdef HAVE_JAVASCRIPT
#  include <jsbr/jsbr.hpp>
#  include <jsbr/Interp.hpp>
#endif

#ifdef HAVE_PYTHON
#  include <pybr/pybr.hpp>
#endif

#ifdef USE_XMLRPC
#  include <xmlrpc_bridge/xrbr.hpp>
#  include <xmlrpc_bridge/XmlRpcMgr.hpp>
#endif

#if !defined(QM_BUILD_LW)

namespace render {
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

namespace molanl {
  extern bool init();
  extern void fini();
}

#endif

namespace molstr {
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
void process_input(const LString &loadscr, const std::deque<LString> &args);

#ifndef DEFAULT_CONFIG
#define DEFAULT_CONFIG ""
#endif

///
///   main routine for CueTTY (CLI version)
///
int main(int argc, const char *argv[])
{
  if (qlib::init())
    MB_DPRINTLN("qlib::init() OK.");
  else {
    LOG_DPRINTLN("Init: ERROR!!");
    return -1;
  }

  int i;
  LString loadscr;
  LString confpath;
  std::deque<LString> args2;

  for (i=1; i<argc; ++i) {
    MB_DPRINTLN("arg%d=%s", i, argv[i]);
    LString value = argv[i];

    if (value.equals("-conf")) {
      ++i;
      if (i>=argc) break;
      confpath = argv[i];
      ++i;
    }

    break;
  }
  
  for (; i<argc; ++i) {
    MB_DPRINTLN("arg%d=%s", i, argv[i]);
    args2.push_back(argv[i]);
  }

  if (args2.size()>0)
    loadscr = args2.front();

  if (confpath.isEmpty()) {
    confpath = DEFAULT_CONFIG;
  }

  if (!qsys::init(confpath)) {
    LOG_DPRINTLN("Qsys Init (%s): ERROR!!", confpath.c_str());
    return -1;
  }

  MB_DPRINTLN("main> confpath=%s", confpath.c_str());

  // load molstr/lwview module
  molstr::init();
  lwview::init();
  anim::init();

#if !defined(QM_BUILD_LW)
  // load other modules
  render::init();
  molvis::init();
  xtal::init();
  symm::init();
  surface::init();
  molanl::init();
#endif

#ifdef HAVE_JAVASCRIPT
  // load internal JS module
  jsbr::init();
#endif

#ifdef HAVE_PYTHON
  // load python module
  pybr::init();
#endif

#ifdef USE_XMLRPC
  // load XML-RPC module
  xrbr::init();
#endif

  //////////

  // Process input script(s)
  if (!loadscr.isEmpty()) {
    process_input(loadscr, args2);
  }

#ifdef USE_XMLRPC
  {
    // Start server thread
    xrbr::XmlRpcMgr *pMgr = xrbr::XmlRpcMgr::getInstance();
    pMgr->start();
    for (;;) {
      pMgr->processReq(1000*1000);
    }
  }
#endif

  //////////

#ifdef USE_XMLRPC
  // unload XML-RPC module
  xrbr::fini();
  MB_DPRINTLN("=== xrbr::fini() OK ===");
#endif

#ifdef HAVE_PYTHON
  // unload python module
  pybr::fini();
  MB_DPRINTLN("=== pybr::fini() OK ===");
#endif

#ifdef HAVE_JAVASCRIPT
  jsbr::fini();
  MB_DPRINTLN("=== jsbr::fini() OK ===");
#endif

#if !defined(QM_BUILD_LW)
  // load other modules
  render::fini();
  molvis::fini();
  xtal::fini();
  symm::fini();
  surface::fini();
  molanl::fini();
#endif

  anim::fini();
  lwview::fini();
  molstr::fini();
  MB_DPRINTLN("=== molstr::fini() OK ===");

  qsys::fini();
  MB_DPRINTLN("=== qsys::fini() OK ===");

  qlib::fini();

  std::cerr << "=== Terminated normaly ===" << std::endl;
  return 0;
}

namespace fs = boost::filesystem;

void process_input(const LString &loadscr, const std::deque<LString> &args)
{
  qsys::SceneManager *pSM = qsys::SceneManager::getInstance();
  LOG_DPRINTLN("CueMol version %s build %s", pSM->getVersion().c_str(), pSM->getBuildID().c_str());

  fs::path scr_path(loadscr);
  
  fs::path full_path = fs::system_complete( scr_path );

  if ( !fs::exists( full_path ) ) {
#if (BOOST_FILESYSTEM_VERSION==2)
    std::cout << "\nNot found: " << full_path.file_string() << std::endl;
#else
    std::cout << "\nNot found: " << full_path.string() << std::endl;
#endif
    return;
  }

  //std::cerr << "\nFull path: " << full_path.file_string() << std::endl;
  //std::cerr << "Extn: " << full_path.extension() << std::endl;

  if (full_path.extension()==".qsc") {
    //qsys::ScenePtr rscene = pSM->loadSceneFrom(scr_path.file_string(), "xml");
    //qlib::FileOutStream &fos = qlib::FileOutStream::getStdErr();
    //rscene->writeTo(fos, true);
  }
  else if (full_path.extension()==".js") {
#ifdef HAVE_JAVASCRIPT
    jsbr::Interp *pInt = jsbr::createInterp(NULL);
    pInt->setCmdArgs(args);

    // setup system default script path
    qsys::SysConfig *pconf = qsys::SysConfig::getInstance();
    LString scrdir = pconf->get("script_dir");
    MB_DPRINTLN("sysconfig: script_dir=%s", scrdir.c_str());
    if (!scrdir.isEmpty())
      pInt->setScriptPath("system", pconf->convPathName(scrdir));

    // run startup script
    pInt->execFile("startup.js");

    // run the main script
    pInt->execFile(loadscr);

    delete pInt;
#else
    LOG_DPRINTLN("Javascript not supported!!");
#endif
  }
  else if (full_path.extension()==".py") {
#ifdef HAVE_PYTHON
    pybr::runFile(loadscr);
#else
    LOG_DPRINTLN("Python not supported!!");
#endif
  }
  MB_DPRINTLN("main> cleanup ...");
  pSM->destroyAllScenes();
  MB_DPRINTLN("main> cleanup done.");
}

