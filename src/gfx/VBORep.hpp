// -*-Mode: C++;-*-
//
// VBORep: VBO representation interface
//

#pragma once

#include "gfx.hpp"

namespace gfx {

class AbstDrawAttrs;

class GFX_API VBORep
{
public:
    virtual ~VBORep() {}
    virtual void bind() = 0;
    virtual void update(const AbstDrawAttrs &ada) = 0;
    virtual void setAttrib(const AbstDrawAttrs &ada) = 0;
    virtual void draw(const AbstDrawAttrs &ada) = 0;
    virtual void unbind(const AbstDrawAttrs &ada) = 0;
};

}  // namespace gfx
