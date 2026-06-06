// -*-Mode: C++;-*-
//
//  OpenGL display context interface
//

#pragma once

#include <sysdep/sysdep.hpp>
#include <qsys/GUIDisplayContext.hpp>

namespace gfx {
class AbstDrawAttrs;
class BufTexRep;
class VBORep;
class PixRep;
class PixelBuffer;
class RenderTarget;
}  // namespace gfx

namespace sysdep {

class OcTexRep;
class OcBufTexRep;

class SYSDEP_API OcDisplayContext : public qsys::GUIDisplayContext
{
private:
    typedef qsys::GUIDisplayContext super_t;

public:
    OcDisplayContext();
    virtual ~OcDisplayContext();

    virtual void enableDepthTest(bool) override;

    virtual void setDepthTestEnabled(bool) override;

    virtual void setCullFace(bool f = true) override;

    virtual void setInvertColorBlend(bool bInv) override;

    //////////

    /// Clear the target buffer with the specified color.
    virtual void clearBuffer(const gfx::ColorPtr &pcol) override;

    //////////
    // Shader object creation (compiles GLSL via OglProgramObject)

    virtual gfx::ShaderObject *createShaderObject(const LString &name,
                                                  const LString &vert_path,
                                                  const LString &frag_path) override;

    virtual void setFrontFace(bool bCCW = true) override;

    virtual gfx::BufTexRep *createBufTexRep() override;

    virtual gfx::VBORep *createVBORep(const gfx::AbstDrawAttrs &ada) override;

    virtual gfx::PixRep *createPixRep(const gfx::PixelBuffer &pixbuf) override;

    virtual gfx::RenderTarget *createRenderTarget(int w, int h, int flags) override;

    virtual void bindRenderTarget(gfx::RenderTarget *prt) override;

    virtual void bindDefaultFramebuffer() override;
};

}  // namespace sysdep
