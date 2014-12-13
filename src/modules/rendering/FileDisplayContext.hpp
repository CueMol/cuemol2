// -*-Mode: C++;-*-
//
//  Superclass for file display contexts
//

#ifndef FILE_DISPLAY_CONTEXT_HPP_INCLUDED
#define FILE_DISPLAY_CONTEXT_HPP_INCLUDED

#include "render.hpp"

#include <gfx/DisplayContext.hpp>
#include <qlib/LString.hpp>

namespace qlib {
  class OutStream;
}

namespace render {

  class RendIntData;

  class RENDER_API FileDisplayContext : public gfx::DisplayContext
  {
    typedef gfx::DisplayContext super_t;

  protected:
    /// Internal data structure
    RendIntData *m_pIntData;

    double m_dZoom;
    double m_dViewDist;
    double m_dSlabDepth;

    /// bg color
    gfx::ColorPtr m_bgcolor;

    /// matrix stack
    std::deque<Matrix4D> m_matstack;

    /// unitarity of the current transformation
    bool m_bUnitary;

    /// current line width
    double m_linew;

    /// current color
    gfx::ColorPtr m_pColor;

    /// current normal vec
    Vector4D m_norm;

    /// current drawing mode
    int m_nDrawMode;

    enum {
      POV_NONE,
      POV_POINTS,
      POV_POLYGON,
      POV_LINES,
      POV_LINESTRIP,
      POV_TRIGS,
      POV_TRIGSTRIP,
      POV_TRIGFAN,
      POV_QUADS,
      POV_QUADSTRIP
    };

    bool m_fPrevPosValid;
    Vector4D m_prevPos, m_prevCol, m_prevNorm;

    int m_nTriIndex;

    // /// output texture type
    // bool m_fUseTexBlend;

    /// projection type (perspective)
    bool m_fPerspective;

    /// detail level for sphere/cone obj
    int m_nDetail;

    /// Tolerance of unitarity check
    double m_dUniTol;

    /// Z-dir slab clipping flag
    bool m_bUseClipZ;

    /// Line/point width scale factor (pixel/angstrom)
    double m_dLineScale;

    /// Polygon drawing mode (fill/line/point)
    int m_nPolyMode;

    bool m_bLighting;

    int m_nVertCnt;

    std::vector<Vector4D> m_vectmp;

  public:

    ////////////////////////////////////////////////////////////
    // Implementation

    /// common initialization
    void init();

    /// Get internal data structure
    RendIntData *getIntData() const {
      return m_pIntData;
    }

    /// Reset&forget internal data structure for next rendering
    void resetIntData() {
      m_pIntData = NULL;
    }

    void setZoom(double z) {
      if (z<=F_EPS4) z = F_EPS4;
      m_dZoom = z;
    }
    void setSlabDepth(double d) {
      if (d<=0.1)
        d = 0.1;
      if (d>=10000.0)
        d = 10000.0;
      m_dSlabDepth = d;
    }
    void setViewDist(double d) { m_dViewDist = d; }

    void setBgColor(const gfx::ColorPtr &c) { m_bgcolor = c; }

    // void setTexBlend(bool f) { m_fUseTexBlend = f; }
    void setClipZ(bool f) { m_bUseClipZ = f; }
    void setPerspective(bool f) { m_fPerspective = f; }

    const gfx::ColorPtr &getCurrentColor() const { return m_pColor; }

    //void setPostBlend(bool b) { m_bPostBlend = b; }
    //bool isPostBlend() const { return m_bPostBlend; }
    //LString getPostBlendTableJSON() const;

    double getLineScale() const { return m_dLineScale; }
    void setLineScale(double d) { m_dLineScale = d; }

    int getPolygonMode() const { return m_nPolyMode; }

    double getLineWidth() const { return m_linew; }

    ////////////////////////////////////////////////////////////

  public:
    FileDisplayContext();
    virtual ~FileDisplayContext();

    //////////////////////////////
    // generic implementation

    virtual void vertex(const Vector4D &v);
    virtual void normal(const Vector4D &v);
    virtual void color(const gfx::ColorPtr &c);

    virtual void pushMatrix();
    virtual void popMatrix();
    virtual void multMatrix(const Matrix4D &mat);
    virtual void loadMatrix(const Matrix4D &mat);

    ////////////////

    virtual void setLineWidth(double lw);
    virtual void setLineStipple(unsigned short pattern);
    virtual void setLighting(bool f=true);

    virtual void setPointSize(double size);

    //virtual void loadName(int nameid);
    //virtual void pushName(int nameid);
    //virtual void popName();

    ////////////////
    // line and triangles

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

    /// Polygon mode (fill/line/point)
    virtual void setPolygonMode(int id);

    ///////////////////////////////
    // higher-order objects

    virtual void setDetail(int n);
    virtual int getDetail() const;

    /// Display unit sphere
    virtual void sphere();

    /// Display sphere with radius of r at position vec
    virtual void sphere(double r, const Vector4D &vec);

    /// Display cone (and cylinder)
    virtual void cone(double r1, double r2,const Vector4D &pos1,
                      const Vector4D &pos2,bool bCap);

    /// Mesh drawing
    virtual void drawMesh(const gfx::Mesh &);

    ///////////////////////////////
    // Display List (not supported)

    virtual DisplayContext *createDisplayList();
    virtual bool canCreateDL() const;
    virtual void callDisplayList(DisplayContext *pdl);
    virtual bool isCompatibleDL(DisplayContext *pdl) const;

    virtual bool isDisplayList() const;
    virtual bool recordStart();
    virtual void recordEnd();

    ///////////////////////////////

    virtual qsys::View *getTargetView() const { return NULL; }

    virtual void startSection(const LString &name);
    virtual void endSection();

    virtual bool setCurrent();
    virtual bool isCurrent() const;

    virtual bool isPostBlend() const;

    ///////////////////////////////
    // file context specific op.

    void clearMatStack() {
      m_matstack.erase(m_matstack.begin(), m_matstack.end());
    }

    void checkUnitary();

    void xform_vec(Vector4D &v) {
      const Matrix4D &mtop = m_matstack.front();
      v.w() = 1.0;
      mtop.xform4D(v);
    }

    void xform_norm(Vector4D &v) {
      const Matrix4D &mtop = m_matstack.front();
      v.w() = 0.0;
      mtop.xform4D(v);
    }

    /// Draw a single line segment from v1 to v2 to the output
    /// v1 and v2 should be transformed by matrix stack
    void drawLine(const Vector4D &v1, const Vector4D &v2);
  };

}

#endif

