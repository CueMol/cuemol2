// -*-Mode: C++;-*-
//
// ShaderObject: backend-independent shader program interface
//

#pragma once

#include "gfx.hpp"
#include <qlib/MapTable.hpp>
#include <qlib/Matrix4D.hpp>
#include <qlib/Matrix3D.hpp>

namespace gfx {

class DisplayContext;

/**
 * Backend-independent interface for a compiled shader program.
 *
 * Concrete implementations (e.g. OglProgramObject) provide OpenGL or other
 * platform-specific behaviour.  The UBO management methods default to no-ops
 * so that non-OpenGL backends can compile without change.
 */
class GFX_API ShaderObject
{
public:
    // ─── Shared UBO data structures ──────────────────────────────────────────
    // These structs define the std140 memory layout shared between C++ host
    // code and the corresponding GLSL uniform blocks.

    /**
     * std140 FogBlock layout (binding=1, 32 bytes).
     * Must match the FogBlock uniform block defined in fog_inc.glsl.
     */
    struct FogBlock {
        float fogEnd;           // offset 0  — far limit of the fog range
        float fogScale;         // offset 4  — 1/(fogEnd - fogStart)
        float _pad1, _pad2;     // offset 8, 12 — padding for vec3 alignment
        float fogColor[3];      // offset 16 — RGB fog colour
        float _pad3;            // offset 28 — trailing padding
    };

    /**
     * std140 MatricesBlock layout (binding=0, 192 bytes).
     * Must match the MatricesBlock uniform block defined in matrices_inc.glsl.
     */
    struct MatricesBlock {
        float modelView[16];    // offset 0   — column-major ModelView mat4
        float projection[16];   // offset 64  — column-major Projection mat4
        float normal[16];       // offset 128 — Normal matrix (mat3 stored as mat4)
    };

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    virtual ~ShaderObject() = default;

    /**
     * Load and link shader programs from a name-to-path map.
     * Must be called before enable().
     */
    virtual bool loadShaders(const qlib::MapTable<qlib::LString> &name) = 0;

    /** Activate this shader program for subsequent draw calls. */
    virtual void enable() = 0;

    /** Deactivate this shader program. */
    virtual void disable() = 0;

    // ─── Object identity ─────────────────────────────────────────────────────

    /** Set the identifying name of this shader object. */
    void setName(const qlib::LString &name) { m_shaderObjName = name; }

    /** Return the identifying name of this shader object. */
    qlib::LString getName() const { return m_shaderObjName; }

    // ─── Uniform variable setters ─────────────────────────────────────────────

    /** Set an integer uniform (1–4 components). */
    virtual void setUniform(const qlib::LString &name, int v0) = 0;
    virtual void setUniform(const qlib::LString &name, int v0, int v1) = 0;
    virtual void setUniform(const qlib::LString &name, int v0, int v1, int v2) = 0;
    virtual void setUniform(const qlib::LString &name, int v0, int v1, int v2, int v3) = 0;

    /** Set a float uniform (1–4 components). */
    virtual void setUniformF(const qlib::LString &name, float v0) = 0;
    virtual void setUniformF(const qlib::LString &name, float v0, float v1) = 0;
    virtual void setUniformF(const qlib::LString &name, float v0, float v1, float v2) = 0;
    virtual void setUniformF(const qlib::LString &name, float v0, float v1, float v2, float v3) = 0;

    /** Set a matrix uniform (4×4 or 3×3). */
    virtual void setMatrix(const qlib::LString &name, const qlib::Matrix4D &mat) = 0;
    virtual void setMatrix(const qlib::LString &name, const qlib::Matrix3D &mat) = 0;

    /** Return the vertex attribute location index for the given name. */
    virtual int getAttribLocation(const char *name) = 0;

    // ─── High-level per-frame setup ───────────────────────────────────────────

    /**
     * Populate the FogBlock UBO (binding=1) from the current display context.
     * Reads fog parameters from pdc and delegates to updateFogUBO().
     */
    virtual void setupFog(DisplayContext *pdc);

    /**
     * Populate the MatricesBlock UBO (binding=0) from the current display context.
     * Calls setupViewport(pdc), then packs ModelView/Projection/Normal matrices
     * and delegates to updateMatricesUBO().
     */
    virtual void setupMat(DisplayContext *pdc);

    // ─── Platform extension hooks ─────────────────────────────────────────────

    /**
     * Called by setupMat() before uploading the MatricesBlock UBO.
     * Override in platform-specific subclasses to perform viewport setup
     * (e.g. call glViewport() in OpenGL backends).
     */
    virtual void setupViewport(DisplayContext * /*pdc*/) {}

    // ─── Low-level UBO management ─────────────────────────────────────────────
    // Implemented by the platform-specific subclass (e.g. OglProgramObject).
    // Default implementations are no-ops so non-OpenGL backends compile unchanged.

    /** Upload data to the MatricesBlock UBO (binding=0). */
    virtual void updateMatricesUBO(const void * /*data*/, size_t /*size*/) {}

    /** Upload data to the FogBlock UBO (binding=1). */
    virtual void updateFogUBO(const void * /*data*/, size_t /*size*/) {}

    /**
     * Allocate the DrawParamsBlock UBO (binding=2) with the given byte size.
     * Called once per shader program during GpuPrim::init().
     */
    virtual void initDrawParamsUBO(size_t /*size*/) {}

    /** Upload data to the DrawParamsBlock UBO (binding=2). */
    virtual void updateDrawParamsUBO(const void * /*data*/, size_t /*size*/) {}

private:
    qlib::LString m_shaderObjName;
};

}  // namespace gfx
