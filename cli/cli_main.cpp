
#include <common.h>
#include <loader.hpp>

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

#ifdef BUILD_PYTHON_BINDINGS
#  include <pybr/pybr.hpp>
#  include <pybr/PythonBridge.hpp>
#endif

#include "TTYView.hpp"

namespace cli {
  class TTYViewFactory : public qsys::ViewFactory
  {
  public:
    TTYViewFactory() {}
    virtual ~TTYViewFactory() {}
    virtual qsys::View* create() {
      return MB_NEW TTYView();
    }
  };
  void registerViewFactory()
  {
    qsys::View::setViewFactory(MB_NEW TTYViewFactory());
  }
}

using qlib::LString;
void process_input(const LString &loadscr, const std::deque<LString> &args,bool bInvokeIntrShell);

#ifndef DEFAULT_CONFIG
#define DEFAULT_CONFIG "./sysconfig.xml"
#endif

///
///   main routine for CueTTY (CLI version)
///
int internal_main(int argc, const char *argv[])
{
  if (cuemol2::init_qlib()) {
    LOG_DPRINTLN("cuemol2::init_qlib OK.");
  }
  else {
    printf("Init: ERROR!!\n");
    return -1;
  }

  int i;
  LString loadscr;
  LString confpath;
  std::deque<LString> args2;

  bool bInvokeIntrShell = false;

  for (i=1; i<argc; ++i) {
    MB_DPRINTLN("arg%d=%s", i, argv[i]);
    LString value = argv[i];

    if (value.equals("-i")) {
      bInvokeIntrShell = true;
      continue;
    }
    else if (value.equals("-conf")) {
      ++i;
      if (i>=argc) break;
      confpath = argv[i];
      // ++i;
      continue;
    }
    else {
      break;
    }
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

  int result = cuemol2::init(confpath, false);
  if (result < 0) {
    return result;
  }
  cli::registerViewFactory();

  //if (!loadscr.isEmpty()) {
  process_input(loadscr, args2, bInvokeIntrShell);
  //}

  cuemol2::fini();

  printf("=== Terminated normaly ===\n");
  return 0;
}

int main(int argc, const char *argv[])
{
  try {
    return internal_main(argc, argv);
  }
  catch (const qlib::LException &e) {
    LOG_DPRINTLN("Caught exception <%s>", typeid(e).name());
    LOG_DPRINTLN("Reason: %s", e.getMsg().c_str());
  }
  catch (std::exception &e) {
    LOG_DPRINTLN("Caught exception <%s>", typeid(e).name());
    LOG_DPRINTLN("Reason: %s", e.what());
  }
  catch (...) {
    LOG_DPRINTLN("Caught unknown exception");
  }
}

namespace fs = boost::filesystem;

void process_input(const LString &loadscr, const std::deque<LString> &args, bool bInvokeIntrShell )
{
  qsys::SceneManager *pSM = qsys::SceneManager::getInstance();
  LOG_DPRINTLN("CueMol version %s build %s", pSM->getVersion().c_str(), pSM->getBuildID().c_str());

  fs::path scr_path(loadscr.c_str());
  
  fs::path full_path = fs::system_complete( scr_path );

  if (full_path.extension()==".qsc") {
    //qsys::ScenePtr rscene = pSM->loadSceneFrom(scr_path.file_string(), "xml");
    bInvokeIntrShell = true;
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
#ifdef BUILD_PYTHON_BINDINGS
    pybr::PythonBridge *pSvc = pybr::PythonBridge::getInstance();
    pSvc->setCmdArgs(args);
    pSvc->runFile(loadscr);
#else
    LOG_DPRINTLN("Python not supported!!");
#endif
  }
  else {
    // no input file --> try to run interactive shell
    bInvokeIntrShell = true;
  }
  
#ifdef BUILD_PYTHON_BINDINGS
  if (bInvokeIntrShell) {
    pybr::PythonBridge *pSvc = pybr::PythonBridge::getInstance();
    MB_DPRINTLN("");
    pSvc->runInteractiveShell();
  }
#endif

  MB_DPRINTLN("main> cleanup ...");
  pSM->destroyAllScenes();
  MB_DPRINTLN("main> cleanup done.");
}

