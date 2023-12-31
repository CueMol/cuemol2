#pragma once

#include <common.h>

namespace qlib { class LString; }
namespace gfx { class TextRenderImpl; }
namespace sysdep { class MouseEventHandler; }

namespace cuemol2 {

  int init_qlib();
  int init(const qlib::LString &confpath, bool reg_view);

  int fini();
  
#ifdef BUILD_OPENGL_SYSDEP
  gfx::TextRenderImpl *initTextRender();
  void finiTextRender(gfx::TextRenderImpl *pTR);
  sysdep::MouseEventHandler *createMouseEventHander();
#endif
    
} // namespace cuemol2
