// -*-Mode: C++;-*-
//
//  Abstract display context interface
//
//  $Id: DisplayContext.hpp,v 1.25 2011/01/09 15:12:22 rishitani Exp $

#ifndef GFX_DISPLAY_CONTEXT_HPP_
#define GFX_DISPLAY_CONTEXT_HPP_

#include "gfx.hpp"

#include <qlib/Vector4D.hpp>
#include <qlib/Matrix4D.hpp>
#include <qlib/LQuat.hpp>
#include "AbstractColor.hpp"
// #include "LTexture.hpp"

using qlib::Vector4D;
using qlib::Matrix4D;
using qlib::LQuat;

namespace qsys { class View; }

namespace gfx {

  class Mesh;
  class AbstDrawElem;
  class DrawElem;
  class AbstractColor;
  class PixelBuffer;

  class GFX_API DisplayContext : public qlib::LObject
  {
  private:
    LString m_defMatName;
    LString m_styleNames;

    /// Default alpha value
    double m_defAlpha;

    /// Pixel scaling factor
    double m_dPixSclFac;

    /// Edge line type (defined in gfx::DisplayContext)
    int m_nEdgeLineType;

    /// Edge line width
    double m_dEdgeLineWidth;

    /// Edge line color
    ColorPtr m_egLineCol;

    /// Target view
    qsys::View *m_pTargView;


  public:
    /// Polygon rendering mode
    enum {
      POLY_POINT,
      POLY_LINE,
      POLY_FILL,
      // filled face without ridge lines
      POLY_FILL_NORGLN,
      POLY_FILL_XX,
    };

    /// Edge line types
    enum {
      ELT_NONE,
      ELT_EDGES,
      ELT_SILHOUETTE,
    };

    /// Vertex attribute types (used as hint for edge rendering)
    enum {
      DVA_NONE,
      DVA_NOEDGE,
    };

  public:
    DisplayContext();
    virtual ~DisplayContext() {}

    virtual bool setCurrent() =0;
    virtual bool isCurrent() const =0;

    virtual void setTargetView(qsys::View *);
    virtual qsys::View *getTargetView() const;

    /// Returns whether the rendering target of this context is a file or not.
    virtual bool isFile() const =0;

    /// Returns whether this context can render pixmap or not.
    virtual bool isRenderPixmap() const;

    /// Returns whether this context support VA/VBO (DrawElem()) method
    virtual bool isDrawElemSupported() const;

    ////////////////

    /// Set current vertex vector by Vector4D
    virtual void vertex(const Vector4D &vec) =0;

    /// Set current normal vector by Vector4D
    virtual void normal(const Vector4D &vec) =0;

    /// Set current color
    virtual void color(const ColorPtr &c) =0;

    /// Set current vertex attribute
    virtual void attribute(int n);

    ////////////////

    virtual void setMaterial(const LString &name);
    virtual void setAlpha(double a);
    virtual void setStyleNames(const LString &names);

    /// Set edge (silhouette) line props
    virtual int getEdgeLineType() const;
    virtual void setEdgeLineType(int n);

    virtual double getEdgeLineWidth() const;
    virtual void setEdgeLineWidth(double w);

    virtual ColorPtr getEdgeLineColor() const;
    virtual void setEdgeLineColor(const ColorPtr &c);


    LString getMaterial() const { return m_defMatName; }
    double getAlpha() const { return m_defAlpha; }
    LString getStyleNames() const { return m_styleNames; }
    
    ////////////////

    virtual void pushMatrix() =0;
    virtual void popMatrix() =0;
    virtual void multMatrix(const Matrix4D &mat) =0;
    virtual void loadMatrix(const Matrix4D &mat) =0;

    virtual void enableDepthTest(bool) {}

    ////////////////
    // inteface with default implementation

    /// Set current vertex vector by x,y,z (calls vector version)
    virtual void vertex(double x, double y, double z);

    /// Set current normal vector by x,y,z (calls vector version)
    virtual void normal(double x, double y, double z);

    /// Set solid color
    virtual void color(double r, double g, double b);
    virtual void color(double r, double g, double b, double a);

    virtual void rotate(const LQuat &q);
    virtual void scale(const Vector4D &);
    virtual void translate(const Vector4D &);
    virtual void loadIdent();

    virtual void setCullFace(bool f=true) {}

    ////////////////

    virtual void setLineWidth(double lw);
    virtual void setLineStipple(unsigned short pattern);
    virtual void setLighting(bool f=true);
    virtual void setPointSize(double size);

    ////////////////
    // metadata operations
    
    virtual void startHit(qlib::uid_t rend_uid);
    virtual void endHit();

    virtual void loadName(int nameid);
    virtual void pushName(int nameid);
    virtual void popName();
    virtual void drawPointHit(int nid, const Vector4D &pos);

    virtual void startRender();
    virtual void endRender();
    virtual void startSection(const LString &section_name);
    virtual void endSection();

    virtual void startEdgeSection();
    virtual void endEdgeSection();

    ////////////////
    // image/text drawing (default: do nothing)

    virtual void drawString(const Vector4D &pos, const qlib::LString &str);
    virtual void drawPixels(const Vector4D &pos,
                            const PixelBuffer &data,
                            const ColorPtr &col);

    // pixel scaling factor
    void setPixSclFac(double f) { m_dPixSclFac = f; }
    inline double getPixSclFac() const { return m_dPixSclFac; }

    ////////////////
    // line and triangle primitives
    
    virtual void setPolygonMode(int id) =0;
    virtual void startPoints() =0;
    virtual void startPolygon() =0;
    virtual void startLines() =0;
    virtual void startLineStrip() =0;
    virtual void startTriangles() =0;
    virtual void startTriangleStrip() =0;
    virtual void startTriangleFan() =0;
    virtual void startQuadStrip() =0;
    virtual void startQuads() =0;
    virtual void end() =0;

    ///////////////////////////////
    // higher-order objects

    /// Display unit sphere
    virtual void sphere();

    /// Display sphere with radius of r at position vec
    virtual void sphere(double r, const Vector4D &vec);

    /// Display cylinder (capping is dependent on the implementation)
    virtual void cylinder(double r, const Vector4D &pos1, const Vector4D &pos2);

    /// Display cylinder (capping is always created)
    virtual void cylinderCap(double r, const Vector4D &pos1, const Vector4D &pos2);

    virtual void cone(double r1, double r2,
                      const Vector4D &pos1, const Vector4D &pos2,
                      bool bCap);

    virtual void setDetail(int n);
    virtual int getDetail() const;

    // texture (default: not supported)
    // virtual void useTexture(const LTexture &) {}
    // virtual void unuseTexture() {}
    // virtual void texCoord(double u, double v) {}
    // virtual LTexture createTexture() { return LTexture(); }

    /// Mesh drawing
    virtual void drawMesh(const Mesh &);

    /// Drawing element support (vertex array version)
    virtual void drawElem(const AbstDrawElem &);

    ///////////////////////////////
    // Display List support
  
    /// Create new display list.
    /// returns NULL if display list is not supported.
    virtual DisplayContext *createDisplayList();

    virtual bool canCreateDL() const;

    /// Call display list.
    /// "pdl" should be a display list supported by this context.
    virtual void callDisplayList(DisplayContext *pdl);
  
    virtual bool isCompatibleDL(DisplayContext *pdl) const;

    virtual bool isDisplayList() const;

    virtual bool recordStart();
    virtual void recordEnd();

    ////////////////////////////////////////////////////
    // convenience methods

    /*
    inline void color(const ColorPtr &c) {
      MB_ASSERT(!c.isnull());
      color(*(c.get()));
    }
     */
    
    inline void drawAster(const Vector4D &pos, double rad) {
      const Vector4D xdel(rad,0,0);
      const Vector4D ydel(0,rad,0);
      const Vector4D zdel(0,0,rad);
      
      vertex(pos-xdel);
      vertex(pos+xdel);
      vertex(pos-ydel);
      vertex(pos+ydel);
      vertex(pos-zdel);
      vertex(pos+zdel);
    }

  };

}

#endif
