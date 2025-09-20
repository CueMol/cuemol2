#pragma once

#include <gfx/DisplayContext.hpp>

// namespace gfx {
// class ProgramObject;
// }

namespace sysdep {

class EsView;
class OglProgramObject;

class OcDisplayContext : public gfx::DisplayContext
{
private:
    typedef gfx::DisplayContext super_t;

    /// UID of the target view
    qlib::uid_t m_nViewID;

    /// UID of the target scene
    qlib::uid_t m_nSceneID;

    /// Matrix stack
    std::deque<qlib::Matrix4D> m_matstack;

    qlib::LString m_sectionName;

public:
    OcDisplayContext() : m_nViewID(qlib::invalid_uid), m_nSceneID(qlib::invalid_uid) {}
    virtual ~OcDisplayContext();

    inline qlib::uid_t getViewID() const
    {
        return m_nViewID;
    }
    inline qlib::uid_t getSceneID() const
    {
        return m_nSceneID;
    }

    inline qlib::LString getSectionName() const
    {
        return m_sectionName;
    }

    virtual void setTargetView(qsys::View *pView);

    virtual void startSection(const qlib::LString &section_name);

    virtual void endSection();

    //////////
    // Display list impl

    virtual gfx::DisplayContext *createDisplayList();
    virtual bool canCreateDL() const;
    virtual void callDisplayList(DisplayContext *pdl);
    virtual bool isCompatibleDL(DisplayContext *pdl) const;

    //

    virtual bool isFile() const;

    bool isDrawElemSupported() const
    {
        return true;
    }

    void drawElem(const AbstDrawElem &ade);
    void drawElemAttrs(const gfx::AbstDrawAttrs &ada);

    void OglDisplayContext::setMaterial(const LString &name)
    {
        super_t::setMaterial(name);
        setMaterImpl(name);
    }

    void setLineWidth(double lw) {
    }

    void setLineStipple(unsigned short pattern) {
    }

    void OglDisplayContext::setPointSize(double size) {
    }

    void enableDepthTest(bool f) {
    }

    void OglDisplayContext::setLighting(bool f);

    void OglDisplayContext::setCullFace(bool f/*=true*/);

    //////////
    // 

    virtual void pushMatrix();
    virtual void popMatrix();
    virtual void multMatrix(const qlib::Matrix4D &mat);
    virtual void loadMatrix(const qlib::Matrix4D &mat);

    //////////
    // noimpl

    virtual void vertex(const qlib::Vector4D &);
    virtual void normal(const qlib::Vector4D &);
    virtual void color(const gfx::ColorPtr &c);

    virtual void setPolygonMode(int id);
    virtual void startPoints();
    virtual void startPolygon();
    virtual void startLines();
    virtual void startLineStrip();
    virtual void startTriangles();
    virtual void startTriangleStrip();
    virtual void startTriangleFan();
    virtual void startQuadStrip();
    virtual void startQuads();
    virtual void end();

    //

    void clearMatStack()
    {
        m_matstack.erase(m_matstack.begin(), m_matstack.end());
    }

    void xform_vec(Vector4D &v) const
    {
        const Matrix4D &mtop = m_matstack.front();
        v.w() = 1.0;
        mtop.xform4D(v);
    }

    void xform_norm(Vector4D &v) const
    {
        const Matrix4D &mtop = m_matstack.front();
        v.w() = 0.0;
        mtop.xform4D(v);
    }

public:

    ///////////////////////////////
    // Shader support

    /// Create the GLSL program object.
    /// If program object with the same name already exists, returns it.
    /// @param name name of the program objec.
    /// @return program object having the specified name.
    OglProgramObject *createProgramObject(const LString &name);

    /// Get the GLSL program object by name.
    /// @param name name of the program object.
    /// @return program object having the specified name.
    OglProgramObject *getProgramObject(const LString &name);

    // virtual ProgramObject *createProgObjImpl() = 0;

    // Impl: DisplayList ??
    // void OglDisplayContext::drawPixels(const Vector4D &pos,
    //                                    const gfx::PixelBuffer &data,
    //                                    const gfx::ColorPtr &acol);

    // void OglDisplayContext::drawString(const Vector4D &pos, const qlib::LString &str);

};

}  // namespace sysdep
