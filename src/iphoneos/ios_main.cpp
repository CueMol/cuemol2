//
// iOS CueMol main routine
//

#include <common.h>

#include <qlib/qlib.hpp>
#include <qsys/qsys.hpp>
#include <sysdep/sysdep.hpp>
// #include <jsbr/jsbr.hpp>
#include <modules/molstr/molstr.hpp>
#include <modules/lwview/lwview.hpp>
#include <modules/anim/anim.hpp>

#include "ios_main.h"

bool ios_init(const char *confpath)
{
  qlib::init();

  if (!qsys::init(confpath)) {
    return false;
  }
  sysdep::init();

  lwview::init();
  molstr::init();
  anim::init();

  return true;
}

void ios_fini()
{
  anim::fini();
  molstr::fini();
  lwview::fini();

  sysdep::fini();
  qsys::fini();
  qlib::fini();
}

