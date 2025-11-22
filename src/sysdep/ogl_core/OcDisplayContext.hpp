// -*-Mode: C++;-*-
//
//  OpenGL display context interface
//

#pragma once

#include <sysdep/sysdep.hpp>
#include <gfx/DisplayContext.hpp>

namespace gfx {
class DrawElemPix;
class AbstDrawAttrs;
}  // namespace gfx

namespace sysdep {

class OglProgramObject;
class OcPixDraw;

using gfx::AbstractColor;
using gfx::ColorPtr;

class SYSDEP_API OcDisplayContext : public gfx::DisplayContext
{
private:
    typedef gfx::DisplayContext super_t;

private:
    Vector4D m_fcolor;

    int m_nDetail;
    void *m_pGluData;

    /// Name buffer emulation
    std::deque<int> m_namebuf;

    /// Use shader alpha
    bool m_bUseShaderAlpha;

    OcPixDraw *m_pOcPixDraw;

public:
    OcDisplayContext();
    virtual ~OcDisplayContext();

    //////////

    bool useShaderAlpha() const
    {
        return true;
    }
    void setUseShaderAlpha(bool)
    {
    }

public:
    virtual void setTargetView(qsys::View *pView);

    // OpenGL-level initialization
    virtual void init();

    virtual bool isFile() const;

    /// Returns whether this context support VA/VBO (DrawElem()) method
    virtual bool isDrawElemSupported() const;

    // // shader control
    // virtual void startSection(const LString &section_name);
    // virtual void endSection();

    // virtual void startEdgeSection();
    // virtual void endEdgeSection();

    ////////////////

    virtual void vertex(const Vector4D &) { MB_ASSERT(false); }
    virtual void normal(const Vector4D &) { MB_ASSERT(false); }

    virtual void enableDepthTest(bool);

    ////////////////

    virtual void setCullFace(bool f = true);

    ////////////////
    // image/text drawing

    virtual void drawString(const Vector4D &pos, const qlib::LString &str);
    virtual void drawPixels(const Vector4D &pos, const gfx::PixelBuffer &data,
                            const gfx::ColorPtr &col);

    ////////////////

    virtual void setPolygonMode(int id) { }

    virtual void startPoints() { MB_ASSERT(false); }
    virtual void startPolygon() { MB_ASSERT(false); }
    virtual void startLines() { MB_ASSERT(false); }
    virtual void startLineStrip() { MB_ASSERT(false); }
    virtual void startTriangles() { MB_ASSERT(false); }
    virtual void startTriangleStrip() { MB_ASSERT(false); }
    virtual void startTriangleFan() { MB_ASSERT(false); }
    virtual void startQuadStrip() { MB_ASSERT(false); }
    virtual void startQuads() { MB_ASSERT(false); }
    virtual void end() { MB_ASSERT(false); }

    ///////////////////////////////

    // /// Display unit sphere
    // virtual void sphere();

    // virtual void sphere(double r, const Vector4D &vec);

    // /// Display cone (and cylinder)
    // virtual void cone(double r1, double r2, const Vector4D &pos1, const Vector4D &pos2,
    //                   bool bCap);

    // virtual void setDetail(int n);
    // virtual int getDetail() const;

    virtual void drawMesh(const gfx::Mesh &l);

    virtual void drawElem(const gfx::AbstDrawElem &l);

    ///////////////////////////////
    // Display List support

    virtual gfx::DisplayContext *createDisplayList();
    virtual bool canCreateDL() const;

    virtual void callDisplayList(DisplayContext *pdl);
    virtual bool isCompatibleDL(DisplayContext *pdl) const;

    virtual bool isDisplayList() const;

    virtual bool recordStart();
    virtual void recordEnd();

    virtual void setMaterial(const LString &name);

    ///////////////////////////////
    // OpenGL VBO support

    /// draw element (vertex array version)
    // void drawElemVA(const gfx::DrawElem &l);

    // void drawElemPix(const gfx::DrawElemPix &de);

    void drawElemAttrs(const gfx::AbstDrawAttrs &ada);

    ///////////////////////////////
    // OpenGL SL support

public:
    /// Create the GLSL program object.
    /// If program object with the same name already exists, returns it.
    /// @param name name of the program objec.
    /// @return program object having the specified name.
    OglProgramObject *createProgramObject(const LString &name);

    /// Get the GLSL program object by name.
    /// @param name name of the program object.
    /// @return program object having the specified name.
    OglProgramObject *getProgramObject(const LString &name);

private:
    /// Current material name
    LString m_curMater;

    /// Set current material name
    void setMaterImpl(const LString &name);
};

}  // namespace sysdep
