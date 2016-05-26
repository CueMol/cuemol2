
#include <common.h>

#include "gfx.hpp"
#include "TextRenderManager.hpp"

#include "GradientColor.hpp"
#include "ColCompiler.hpp"
#include "ColProfMgr.hpp"

extern void gfx_regClasses();

namespace gfx {

  bool init()
  {
    gfx_regClasses();
    GradientColor::regClass();
    TextRenderManager::init();
    ColCompiler::init();
    ColProfMgr::init();
    return true;
  }

  void fini()
  {
    TextRenderManager::fini();
    ColCompiler::fini();
    ColProfMgr::fini();
  }

}

