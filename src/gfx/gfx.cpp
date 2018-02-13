
#include <common.h>

#include "gfx.hpp"
#include "TextRenderManager.hpp"

#include "GradientColor.hpp"
#include "ColCompiler.hpp"
#include "ColProfMgr.hpp"

extern void gfx_regClasses();
extern void gfx_unregClasses();

namespace gfx {

  bool init()
  {
    gfx_regClasses();

    TextRenderManager::init();
    ColCompiler::init();
    ColProfMgr::init();
    return true;
  }

  void fini()
  {
    ColProfMgr::fini();
    ColCompiler::fini();
    TextRenderManager::fini();

    gfx_unregClasses();
  }

}

