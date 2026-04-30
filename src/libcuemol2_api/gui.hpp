#pragma once

#include "api.hpp"

namespace gfx { class TextRenderImpl; }
namespace qsys { class MouseEventHandler; }

namespace cuemol2 {

  LIBCUEMOL_API gfx::TextRenderImpl *initTextRender();
  LIBCUEMOL_API void finiTextRender(gfx::TextRenderImpl *pTR);
  LIBCUEMOL_API qsys::MouseEventHandler *createMouseEventHander();

  void registerViewFactory();
}
