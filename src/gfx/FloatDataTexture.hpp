// -*-Mode: C++;-*-
//
//  Mutable float data texture (CPU floats -> sampler2D) abstraction
//

#pragma once

#include "gfx.hpp"

namespace gfx {

/// Backend-independent mutable 2D float sampler texture created from CPU data.
/// Unlike DataTexture (immutable, R8/RG8), the contents can be replaced after
/// creation via update(). Used to hold per-atom coordinates so that vertex
/// shaders can fetch positions by index (texelFetch), letting coordinate
/// changes be pushed as a texture re-upload instead of a geometry rebuild.
/// Created via DisplayContext::createFloatDataTexture and bound to a texture
/// unit for shaders.
class GFX_API FloatDataTexture
{
public:
    virtual ~FloatDataTexture() {}

    /// Allocate the texture storage (w*h texels, ncomp floats each).
    /// Returns false on failure (caller must fall back).
    virtual bool create(int w, int h, int ncomp) = 0;

    /// Upload w*h*ncomp floats, replacing the whole texture contents.
    virtual void update(const void *data) = 0;

    /// Backend-owned memory of w*h*ncomp floats that a caller may fill instead
    /// of an array of its own, sparing the copy update() would make. NULL when
    /// the backend has none. Valid from a successful create() until the
    /// texture is destroyed; the contents persist between uploads.
    virtual void *getStagingData() { return NULL; }

    /// Upload the contents of getStagingData(). Only meaningful when that
    /// returned non-NULL.
    virtual void updateFromStaging() {}

    /// Bind this texture to the given texture unit.
    virtual void bind(int texUnit) = 0;

    /// Unbind (texture unit left on GL_TEXTURE_2D 0).
    virtual void unbind() = 0;

    virtual int getWidth() const = 0;
    virtual int getHeight() const = 0;
};

}  // namespace gfx
