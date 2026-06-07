// -*-Mode: C++;-*-
//
//  Immutable data texture (CPU bytes -> sampler2D) abstraction
//

#pragma once

#include "gfx.hpp"

namespace gfx {

/// Backend-independent immutable 2D sampler texture created from CPU data.
/// Unlike RenderTarget (an FBO attachment), this is a plain lookup texture
/// (e.g. the SMAA AreaTex / SearchTex). Created via
/// DisplayContext::createDataTexture and bound to a texture unit for shaders.
class GFX_API DataTexture
{
public:
    virtual ~DataTexture() {}

    /// Bind this texture to the given texture unit.
    virtual void bind(int texUnit) = 0;

    /// Unbind (texture unit left on GL_TEXTURE_2D 0).
    virtual void unbind() = 0;

    virtual int getWidth() const = 0;
    virtual int getHeight() const = 0;
};

}  // namespace gfx
