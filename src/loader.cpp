
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
#  include <pybr/PythonBridge.hpp>
#endif

#ifdef USE_XMLRPC
#  include <xmlrpc_bridge/xrbr.hpp>
#endif

#if !defined(QM_BUILD_LW)

namespace importers {
  extern bool init();
  extern void fini();
}

namespace mdtools {
  extern bool init();
  extern void fini();
}

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

#ifndef DEFAULT_CONFIG
#define DEFAULT_CONFIG "./sysconfig.xml"
#endif

int init_cuemol2(const LString &confpath)
{
  if (qlib::init())
    LOG_DPRINTLN("qlib::init() OK.");
  else {
    LOG_DPRINTLN("Init: ERROR!!");
    return -1;
  }

  // if (confpath.isEmpty()) {
  //   confpath = LString(DEFAULT_CONFIG);
  // }

  if (!qsys::init(confpath)) {
    LOG_DPRINTLN("Qsys Init (%s): ERROR!!", confpath.c_str());
    return -1;
  }

  LOG_DPRINTLN("main> confpath=%s", confpath.c_str());

  // load molstr/lwview module
  molstr::init();
  lwview::init();
  anim::init();

  // load other modules
  render::init();
  molvis::init();
  xtal::init();
  symm::init();
  surface::init();
  molanl::init();
  mdtools::init();
  importers::init();

  return 0;
}

int cuemol2_fini()
{

  // load other modules
  render::fini();
  molvis::fini();
  xtal::fini();
  symm::fini();
  surface::fini();
  molanl::fini();

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

