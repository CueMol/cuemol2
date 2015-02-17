// -*-Mode: C++;-*-
//
// OpenGL ES1.1 context implementation
//

#ifndef OPENGL_ES11_CONTEXT_HPP_INCLUDE_
#define OPENGL_ES11_CONTEXT_HPP_INCLUDE_

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

  class GLES1View;
  class GLES1DisplayList;

  using qlib::Vector4D;
  using qlib::Matrix4D;
  using gfx::ColorPtr;

  class SYSDEP_API GLES1DisplayContext : public gfx::DisplayContext
  {
    friend class ::sysdep::GLES1DisplayList;

  private:
    typedef gfx::DisplayContext super_t;

    int m_nDetail;
    // void *m_pGluData;

    // name buffer emulation
    std::deque<int> m_namebuf;
    
    GLES1View *m_pTargetView;

    qlib::uid_t m_nHitRendUID;

    ////////////

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
      ESDC_QUADSTRIP
    };

    Vector4D m_curNorm;
    ColorPtr m_pCurCol;

    /// vertex attribute (without normal)
    struct VertexAttr
    {
      VertexAttr(float ax, float ay, float az, 
		 const ColorPtr &apcol)
	: x(ax), y(ay), z(az), pcol(apcol)
      {
      }

      float x, y, z;
      ColorPtr pcol;
    };

    /// vertex attribute array (without normal for lines, etc)
    std::deque<VertexAttr> m_vattr;

  public:
    GLES1DisplayContext(GLES1View *pView);
    virtual ~GLES1DisplayContext();

    virtual bool isFile() const;

    // int getSceneID() const { return m_nSceneID; }
    //    int getViewID() const { return m_nViewID; }

    virtual void vertex(const Vector4D &v);
    virtual void normal(const Vector4D &v);
    virtual void color(const ColorPtr &c);

    virtual void pushMatrix();
    virtual void popMatrix();
    virtual void multMatrix(const Matrix4D &mat);
    virtual void loadMatrix(const Matrix4D &mat);

    virtual void enableDepthTest(bool);

    // virtual void rotate(const qlib::LQuat &q);
    virtual void scale(const Vector4D &);
    virtual void translate(const Vector4D &);
    virtual void loadIdent();

    ////////////////

    virtual void setLineWidth(double lw);
    virtual void setLineStipple(unsigned short pattern);
    virtual void setPointSize(double size);

    virtual void setLighting(bool f=true);
    virtual void setCullFace(bool f=true);

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

    /// Display unit sphere
    virtual void sphere();

    virtual void sphere(double r, const Vector4D &vec);

    /// Display cone (and cylinder)
    virtual void cone(double r1, double r2,const Vector4D &pos1,
                      const Vector4D &pos2,bool bCap);

    virtual void setDetail(int n);
    virtual int getDetail() const;

//    virtual void drawMesh(const gfx::Mesh &l);    

    virtual void drawElem(const gfx::DrawElem &l);

    ///////////////////////////////
    // Display List support

    virtual gfx::DisplayContext *createDisplayList();
    virtual bool canCreateDL() const;

    virtual void callDisplayList(DisplayContext *pdl);
    virtual bool isCompatibleDL(DisplayContext *pdl) const;

    virtual bool isDisplayList() const;

    virtual bool recordStart();
    virtual void recordEnd();

//    virtual void setMaterial(const LString &name);

    ///////////////////////////////
    // System-dependent GL impl

    virtual bool setCurrent();
    virtual bool isCurrent() const;

    virtual qsys::View *getTargetView() const;

  private:
//    LString m_curMater;
//    void setMaterImpl(const LString &name);

    void drawElemPix(const gfx::DrawElemPix &de);

  };

}

#endif
