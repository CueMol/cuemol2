#pragma once

#include <qsys/GUIDisplayContext.hpp>

namespace gfx {
class ShaderObject;
class RenderTarget;
class DataTexture;
}  // namespace gfx

namespace node_jsbr {

class ElecView;

class ElecDisplayContext : public qsys::GUIDisplayContext
{
private:
    using super_t = qsys::GUIDisplayContext;

    /// Target View
    ElecView *m_pView;

public:
    ElecDisplayContext() : m_pView(nullptr)
    {
    }
    virtual ~ElecDisplayContext();

    void init(ElecView *pView);

    virtual void enableDepthTest(bool) override;

    /// Toggle the depth test (GL_DEPTH_TEST) itself. Used by the fullscreen
    /// post-process passes (AO composite / FXAA) so they are not depth-rejected.
    virtual void setDepthTestEnabled(bool b) override;

    /// Toggle color blending (GL_BLEND). The off-screen post-AA passes write
    /// data-carrying alpha and must run with blending off.
    virtual void setBlendEnabled(bool b) override;

    /// Select additive (GL_ONE, GL_ONE) vs the default over-blend. Used by the
    /// temporal-jitter accumulation step.
    virtual void setBlendModeAdd(bool b) override;

    virtual void setCullFace(bool f = true) override;

    virtual void setInvertColorBlend(bool bInv) override;

    virtual void setFrontFace(bool bCCW = true) override;

    /// Clear the target buffer with the specified color.
    virtual void clearBuffer(const gfx::ColorPtr &pcol) override;

    // Pure virtual overrides
    virtual bool setCurrent() override;
    virtual bool isCurrent() const override;

    // Shader/buffer object creation
    virtual gfx::ShaderObject *createShaderObject(const LString &name,
                                                  const LString &vert_path,
                                                  const LString &frag_path) override;

    virtual gfx::BufTexRep *createBufTexRep() override;

    virtual gfx::VBORep *createVBORep(const gfx::AbstDrawAttrs &ada) override;

    virtual gfx::PixRep *createPixRep(const gfx::PixelBuffer &pixbuf) override;

    virtual gfx::RenderTarget *createRenderTarget(int w, int h, int flags) override;

    /// Create an immutable lookup texture from CPU bytes (SMAA AreaTex/SearchTex).
    virtual gfx::DataTexture *createDataTexture(int w, int h, int ncomp, bool linear,
                                                const void *data) override;

    /// Load a lookup texture from a raw byte file (path resolved like shaders).
    virtual gfx::DataTexture *createDataTextureFromFile(const LString &path, int w,
                                                        int h, int ncomp,
                                                        bool linear) override;

    virtual void bindRenderTarget(gfx::RenderTarget *prt) override;

    virtual void bindDefaultFramebuffer() override;

    /// Allocate vertex/index buffers in V8 cage memory so the C++ side
    /// can write directly into them via qlib::Array::refer(), and the
    /// JS side can hand the same backing store to gl.bufferData
    /// without any C++ to V8 memcpy.
    virtual void allocBuffer(gfx::AbstDrawAttrs &ada, int nvert, int nind) override;
};

}  // namespace node_jsbr
