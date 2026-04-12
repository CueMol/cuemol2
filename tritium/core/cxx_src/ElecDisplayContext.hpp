#pragma once

#include <qsys/GUIDisplayContext.hpp>

namespace gfx {
class ShaderObject;
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
};

}  // namespace node_jsbr
