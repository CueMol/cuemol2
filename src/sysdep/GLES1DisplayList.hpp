// -*-Mode: C++;-*-
//
// OpenGL ES1.1 displaylist implementation
//

#ifndef OPENGL_ES11_DISPLAYLIST_HPP_INCLUDE_
#define OPENGL_ES11_DISPLAYLIST_HPP_INCLUDE_

#include "sysdep.hpp"

#include <gfx/gfx.hpp>
#include <gfx/DisplayContext.hpp>

#include <qlib/Vector4D.hpp>
#include <qlib/LQuat.hpp>
#include <qlib/Matrix4D.hpp>

namespace sysdep {

  class GLES1View;
  class GLES1DisplayContext;

  using qlib::Vector4D;
  using qlib::Matrix4D;
  using gfx::ColorPtr;

  class SYSDEP_API GLES1DisplayList : public gfx::DisplayContext
  {
  private:
    typedef gfx::DisplayContext super_t;

    ////////////

    GLES1DisplayContext *m_pParent;

    /// current drawing mode
    int m_nDrawMode;
    
    enum {
      ESDC_NONE,
      ESDC_POINTS,
      ESDC_POLYGON,
      ESDC_LINES,
      ESDC_LINESTRIP,
      ESDC_TRIGS,
      ESDC_TRIGSTRIP,
      ESDC_TRIGFAN,
      ESDC_QUADS,
      ESDC_QUADSTRIP,
      ESDC_HITTEST
    };

    Vector4D m_curNorm;
    ColorPtr m_pCurCol;

    /// vertex attribute (without normal)
    struct VCAttr {
      GLfloat x, y, z;
      GLubyte r, g, b, a;
    };

    /// vertex/color attribute array (without normal for lines, etc)
    std::deque<VCAttr> m_vattr;

    int m_nVerts;
    GLuint m_iVbo;

    GLfloat m_lw;

    std::list<Matrix4D> m_matstack;

    bool m_bUseHit;

    float m_fHitPrec;

  public:
    GLES1DisplayList(GLES1DisplayContext *par);
    virtual ~GLES1DisplayList();

    virtual void vertex(const Vector4D &v);
    virtual void normal(const Vector4D &v);
    virtual void color(const ColorPtr &c);

    virtual void pushMatrix();
    virtual void popMatrix();
    virtual void multMatrix(const Matrix4D &mat);
    virtual void loadMatrix(const Matrix4D &mat);

    virtual void setLineWidth(double lw);

    ////////////////

    virtual void setPolygonMode(int id) ;
    virtual void startPoints() ;
    virtual void startPolygon() ;
    virtual void startLines() ;
    virtual void startLineStrip() ;
    virtual void startTriangles() ;
    virtual void startTriangleStrip() ;
    virtual void startTriangleFan() ;
    virtual void startQuadStrip() ;
    virtual void startQuads() ;
    virtual void end() ;

    ///////////////////////////////

    bool isDisplayList() const;
    bool recordStart();
    void recordEnd();

    ///////////////////////////////
    // Hittest
    //void startHit(qlib::uid_t rend_uid);
    //void endHit();
    void drawPointHit(int nid, const Vector4D &pos);

    ///////////////////////////////
    // TO DO: mesh/sphere/cone generation??

    ///////////////////////////////
    // System-dependent GL impl

    virtual bool setCurrent();
    virtual bool isCurrent() const;

    void play();

  private:
    void xform_vec(Vector4D &v);
    void xform_norm(Vector4D &v);
  };

}

#endif
