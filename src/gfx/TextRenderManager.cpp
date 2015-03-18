// -*-Mode: C++;-*-
//
// Text rendering manager
//
// $Id: TextRenderManager.cpp,v 1.2 2009/12/01 15:18:11 rishitani Exp $

#include <common.h>

#include "TextRenderManager.hpp"
//#include "SColor.hpp"

SINGLETON_BASE_IMPL(gfx::TextRenderManager);

using namespace gfx;

bool TextRenderImpl::setupFont(double fontsize,
			       const LString &fontname,
			       const LString &font_style,
			       const LString &font_wgt,
			       const ColorPtr &col,
			       double olsize,
			       const ColorPtr &olcol)
{
  return setupFont(fontsize, fontname, font_style, font_wgt);
}

