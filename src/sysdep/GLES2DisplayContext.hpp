// -*-Mode: C++;-*-
//
// OpenGL ES2 display context implementation
//

#ifndef OPENGL_ES2_CONTEXT_HPP_INCLUDE_
#define OPENGL_ES2_CONTEXT_HPP_INCLUDE_

#include "sysdep.hpp"

#include <gfx/gfx.hpp>
#include <gfx/DisplayContext.hpp>

#include <qlib/Vector4D.hpp>
#include <qlib/LQuat.hpp>
#include <qlib/Matrix4D.hpp>

namespace gfx {
  class DrawElemPix;
}

namespace sysdep {

  class OglProgramObject;
  class GLES2View;
  class GLES2DisplayList;

  using qlib::Vector4D;
  using qlib::Matrix4D;
  using gfx::ColorPtr;

  class SYSDEP_API GLES2DisplayContext : public gfx::DisplayContext
  {
    friend class ::sysdep::GLES2DisplayList;

  private:
    typedef gfx::DisplayContext super_t;

    int m_nDetail;

    GLES2View *m_pTargetView;

    /// Matrix stack impl
    std::deque<Matrix4D> m_matstack;

    /// Projection matrix
    Matrix4D m_projMat;

    ////////////

  public:

    /// vertex attribute index
    int GLES2_ATTR_VERT;

    /// normal attribute index
    int GLES2_ATTR_NORM;

    /// color attribute index
    int GLES2_ATTR_COLOR;


    GLES2DisplayContext(GLES2View *pView);
    virtual ~GLES2DisplayContext();

    /// initialization
    void init();

    virtual bool isFile() const;

    virtual void pushMatrix();
    virtual void popMatrix();
    virtual void multMatrix(const Matrix4D &mat);
    virtual void loadMatrix(const Matrix4D &mat);

    virtual void enableDepthTest(bool);

    //virtual void scale(const Vector4D &);
    //virtual void translate(const Vector4D &);
    //virtual void loadIdent();

    ////////////////

    virtual void setLineWidth(double lw);
    virtual void setLineStipple(unsigned short pattern);
    virtual void setPointSize(double size);

    virtual void setLighting(bool f=true);
    virtual void setCullFace(bool f=true);

    virtual void vertex(const Vector4D &v) {}
    virtual void normal(const Vector4D &v) {}
    virtual void color(const ColorPtr &c) {}

    virtual void setPolygonMode(int id) {}
    virtual void startPoints() {}
    virtual void startPolygon() {}
    virtual void startLines() {}
    virtual void startLineStrip() {}
    virtual void startTriangles() {}
    virtual void startTriangleStrip() {}
    virtual void startTriangleFan() {}
    virtual void startQuadStrip() {}
    virtual void startQuads() {}
    virtual void end() {}

    ////////////////
    // metadata operations

    virtual void startHit(qlib::uid_t rend_uid);
    virtual void endHit();
    virtual void drawPointHit(int nid, const Vector4D &pos);

    ////////////////
    // image/text drawing
/*
    virtual void drawString(const Vector4D &pos, const qlib::LString &str);
    virtual void drawPixels(const Vector4D &pos,
                            const gfx::PixelBuffer &data,
                            const gfx::AbstractColor &col);
*/
    ////////////////

//    virtual void drawMesh(const gfx::Mesh &l);    

    virtual void drawElem(const gfx::DrawElem &l);

    virtual bool setCurrent();
    virtual bool isCurrent() const;

    virtual qsys::View *getTargetView() const;

    ///////////////////////////////
    // Display List support

    virtual gfx::DisplayContext *createDisplayList();
    virtual bool canCreateDL() const;

    virtual void callDisplayList(DisplayContext *pdl);
    virtual bool isCompatibleDL(DisplayContext *pdl) const;

    virtual bool isDisplayList() const;

    virtual bool recordStart();
    virtual void recordEnd();

    ///////////////////////////////
    // OpenGL SL support

  private:
    typedef std::map<LString, OglProgramObject *> ProgTab;
    ProgTab m_progs;

    /// Default program object
    OglProgramObject *m_pDefPO;

  public:

    OglProgramObject *createProgramObject(const LString &name);
    OglProgramObject *getProgramObject(const LString &name);
    bool destroyProgramObject(const LString &name);

    ///////////////////////////////
    // GLES2 specific operations

    /// setup orthographic projection
    void loadOrthoProj(float left, float right,
		       float bottom, float top,
		       float near, float far);

  private:

    void drawElemPix(const gfx::DrawElemPix &de);

    void setMvpMatUniform();

  };

}

#endif
