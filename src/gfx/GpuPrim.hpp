// -*-Mode: C++;-*-
//
// GpuPrim: OpenGL-independent GPU primitive draw classes
//

#pragma once

#include "gfx.hpp"
#include "DisplayContext.hpp"

#include <qlib/Vector4D.hpp>

namespace gfx {

class ShaderObject;

/**
 * Base interface for all GpuPrim classes.
 *
 * A GpuPrim encapsulates a shader program together with its vertex/instance
 * data and the logic to upload draw parameters and issue draw calls.
 * Typical usage: init() → alloc() → set*() → draw() per frame → invalidate().
 */
class GFX_API GpuPrim
{
public:
    GpuPrim() = default;
    virtual ~GpuPrim() = default;

    /** Load shaders and allocate GPU resources. Must be called before alloc()/draw(). */
    virtual bool init(DisplayContext *pDC) = 0;

    /** Issue the draw call using the given display context. */
    virtual void draw(DisplayContext *pDC) = 0;

    /** Release all GPU resources (shader program, draw elements). */
    virtual void invalidate() = 0;

    /** Returns true when init() and alloc() have both completed successfully. */
    virtual bool isValid() const = 0;
};

//////////////////////////////////////////////////////////////////////////

}  // namespace gfx

// Backward-compatibility: include derived classes
#include "SphereGpuPrim.hpp"
#include "CylinderGpuPrim.hpp"
#include "TrigGpuPrim.hpp"
#include "LineGpuPrim.hpp"
