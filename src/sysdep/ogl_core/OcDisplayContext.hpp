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
class DataTexture;
class FloatDataTexture;
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
    ~OcDisplayContext() override;

    void enableDepthTest(bool) override;

    void setDepthTestEnabled(bool) override;

    void setCullFace(bool f = true) override;

    void setInvertColorBlend(bool bInv) override;

    void setBlendEnabled(bool b) override;

    void setBlendModeAdd(bool add) override;

    //////////

    /// Clear the target buffer with the specified color.
    void clearBuffer(const gfx::ColorPtr &pcol) override;

    //////////
    // Shader object creation (compiles GLSL via OglProgramObject)

    gfx::ShaderObject *createShaderObject(const LString &name,
                                                  const LString &vert_path,
                                                  const LString &frag_path) override;

    void setFrontFace(bool bCCW = true) override;

    gfx::BufTexRep *createBufTexRep() override;

    gfx::VBORep *createVBORep(const gfx::AbstDrawAttrs &ada) override;

    gfx::PixRep *createPixRep(const gfx::PixelBuffer &pixbuf) override;

    gfx::RenderTarget *createRenderTarget(int w, int h, int flags) override;

    gfx::DataTexture *createDataTexture(int w, int h, int ncomp, bool linear,
                                                const void *data) override;

    gfx::DataTexture *createDataTextureFromFile(const LString &path, int w,
                                                        int h, int ncomp,
                                                        bool linear) override;

    gfx::FloatDataTexture *createFloatDataTexture() override;

    void bindRenderTarget(gfx::RenderTarget *prt) override;

    void bindDefaultFramebuffer() override;
};

}  // namespace sysdep
