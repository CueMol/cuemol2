// -*-Mode: C++;-*-
//
//  OpenGL display context interface
//

#pragma once

#include <sysdep/sysdep.hpp>
#include <qsys/GUIDisplayContext.hpp>

namespace gfx {
class AbstDrawAttrs;
class PixGpuPrim;
class BufTexRep;
}  // namespace gfx

namespace sysdep {

class OcTexRep;
class OcBufTexRep;

class SYSDEP_API OcDisplayContext : public qsys::GUIDisplayContext
{
private:
    typedef qsys::GUIDisplayContext super_t;

    gfx::PixGpuPrim *m_pPixGpuPrim;

public:
    OcDisplayContext();
    virtual ~OcDisplayContext();

    virtual void enableDepthTest(bool);

    virtual void setCullFace(bool f = true);

    virtual void setInvertColorBlend(bool bInv) override;

    virtual void drawPixels(const Vector4D &pos, const gfx::PixelBuffer &data,
                            const gfx::ColorPtr &col);

    virtual void drawElem(const gfx::AbstDrawElem &l);

    //////////

    /// Clear the target buffer with the specified color.
    virtual void clearBuffer(const gfx::ColorPtr &pcol);

    //////////
    // Shader object creation (compiles GLSL via OglProgramObject)

    virtual gfx::ShaderObject *createShaderObject(const LString &name,
                                                  const LString &vert_path,
                                                  const LString &frag_path) override;

    virtual void setFrontFace(bool bCCW = true) override;

    virtual gfx::BufTexRep *createBufTexRep() override;
};

}  // namespace sysdep
