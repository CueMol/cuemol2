// -*-Mode: C++;-*-
//
//  Draw attributes
//

#include <common.h>

#include "DrawAttrArray.hpp"
#include "PixelBuffer.hpp"

using namespace gfx;

const void *AbstDrawAttrs::getData() const
{
  return NULL;
}
size_t AbstDrawAttrs::getElemSize() const {
  return 0;
}
/// returns index buffer ptr
const void *AbstDrawAttrs::getIndData() const
{
  return NULL;
}

size_t AbstDrawAttrs::getIndElemSize() const {
  return 0;
}

size_t AbstDrawAttrs::getIndSize() const {
  return 0;
}
