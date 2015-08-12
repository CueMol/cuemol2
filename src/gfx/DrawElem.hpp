// -*-Mode: C++;-*-
//
// Draw element object
//

#ifndef GFX_DRAWELEM_HPP_INCLUDE_
#define GFX_DRAWELEM_HPP_INCLUDE_

#include "gfx.hpp"
#include <qlib/Vector4D.hpp>
#include <qlib/LTypes.hpp>
#include "SolidColor.hpp"

namespace gfx {

  using qlib::Vector4D;
  
  class GFX_API VBORep
  {
  public:
    virtual ~VBORep() {}
  };

  /// Draw element class
  /// abstraction of VA/VBO implementation of OpenGL
  class GFX_API DrawElem
  {
  public:
    // drawing mode IDs
    static const int DRAW_POINTS = 1;
    static const int DRAW_LINE_STRIP =2;
    static const int DRAW_LINE_LOOP = 3;
    static const int DRAW_LINES = 4;
    static const int DRAW_TRIANGLE_STRIP = 5;
    static const int DRAW_TRIANGLE_FAN = 6;
    static const int DRAW_TRIANGLES = 7;
    static const int DRAW_QUAD_STRIP = 8;
    static const int DRAW_QUADS = 9;
    static const int DRAW_POLYGON = 10;

    //////////////////////////////////////////////////

    /// vertex, normal, color
    static const int VA_VNC = 1;
    /// vertex, color
    static const int VA_VC = 2;
    /// vertex, normal (color is supplied separatedly)
    static const int VA_VN = 3;
    /// vertex only (color is supplied separatedly)
    static const int VA_V = 4;
    /// vertex, normal, color, and index
    static const int VA_VNCI = 5;

    /// pixel data (UI label, etc)
    static const int VA_PIXEL = 6;

    /// texture map ( to be implemented )
    static const int VA_TEXTURE = 7;

    //////////////////////////////////////////////////

    DrawElem();
    virtual ~DrawElem();

    virtual void alloc(int nsize) =0;

    virtual bool vertex(int ind, const Vector4D &v) =0;

    //bool color(int ind, const ColorPtr &c) {
    //return color(ind, c->getCode());
    //}
    virtual bool color(int ind, quint32 cc);

    virtual bool normal(int ind, const Vector4D &v);

    virtual int getType() const =0;

    void startPoints(int nsize);
    void startLines(int nsize);
    void startTriangles(int nsize);

    int getSize() const { return m_nSize; }
    void setSize(int n) { m_nSize = n; }

    int getDrawMode() const { return m_nDrawMode; }
    void setDrawMode(int n) { m_nDrawMode = n; }

    float getLineWidth() const { return m_fLineWidth; }
    void setLineWidth(float f) { m_fLineWidth = f; }

    quint32 getDefColor() const { return m_nDefColor; }
    void setDefColor(quint32 cc) { m_nDefColor = cc; }
    void setDefColor(const ColorPtr &col);

    VBORep *getVBO() const { return m_pVBORep; }
    void setVBO(VBORep *p) const { m_pVBORep = p; }

    /// clear cached data (--> delete VBO)
    virtual void invalidateCache() const;

  private:
    /// size of vertices
    int m_nSize;

    /// drawing mode
    int m_nDrawMode;
    
    /// line width/point size
    float m_fLineWidth;

    /// default color
    quint32 m_nDefColor;

    /// buffer ID (for GL VBO impl)
    mutable VBORep *m_pVBORep;

  };
  
  /// Draw element with vertex and color
  class GFX_API DrawElemVC : public DrawElem
  {
  public:
    DrawElemVC();

    virtual ~DrawElemVC();

    struct Elem
    {
      qfloat32 x, y, z;
      qbyte r, g, b, a;
    };

    const Elem *getData() const { return m_pData; }

    virtual int getType() const { return VA_VC; }

    virtual void alloc(int nsize);

    virtual bool vertex(int ind, const Vector4D &v);

    virtual bool color(int ind, quint32 cc);

  private:
      Elem *m_pData;

  };

  /// Draw element with only vertex
  class GFX_API DrawElemV : public DrawElem
  {
  public:
    DrawElemV();

    virtual ~DrawElemV();

    struct Elem
    {
      qfloat32 x, y, z;
    };

    const Elem *getData() const { return m_pData; }

    virtual int getType() const { return VA_V; }

    virtual void alloc(int nsize);

    virtual bool vertex(int ind, const Vector4D &v);

  private:
      Elem *m_pData;

  };

  /// Draw element with vertex, normal and color
  class GFX_API DrawElemVNC : public DrawElem
  {
  public:
    DrawElemVNC();

    virtual ~DrawElemVNC();

    struct Elem
    {
      qfloat32 x, y, z;
      qfloat32 nx, ny, nz;
      qbyte r, g, b, a;
    };

    Elem *m_pData;

    const Elem *getData() const { return m_pData; }

    virtual int getType() const { return VA_VNC; }

    virtual void alloc(int nsize);

    virtual bool vertex(int ind, const Vector4D &v);

    virtual bool color(int ind, quint32 cc);

    virtual bool normal(int ind, const Vector4D &v);

  };

  /// Draw element with vertex, normal, color, and index
  class GFX_API DrawElemVNCI : public DrawElemVNC
  {
    typedef DrawElemVNC super_t;

  public:
    typedef quint16 index_t;

    DrawElemVNCI();

    virtual ~DrawElemVNCI();

    index_t *getIndexData() const { return m_pIndData; }

    virtual int getType() const { return VA_VNCI; }

    /// allocate index buffer (for general use)
    void allocIndex(int ninds);

    void setIndex(int ind, index_t n1) {
      MB_ASSERT( ind <m_nIndSize);
      m_pIndData[ind] = n1;
    }

    /// start indexed triangles mode (shortcut method)
    void startIndexTriangles(int nverts, int nfaces) {
      DrawElem::startTriangles(nverts);
      allocIndex(nfaces*3);
    }

    /// set face index for triangles mode (shortcut method)
    void setIndex3(int ind, index_t n1, index_t n2, index_t n3) {
      MB_ASSERT( (ind*3+2) <m_nIndSize);
      m_pIndData[ind*3 + 0] = n1;
      m_pIndData[ind*3 + 1] = n2;
      m_pIndData[ind*3 + 2] = n3;
    }

    int getIndexSize() const { return m_nIndSize; }

    /// index VBO object access
    VBORep *getIndexVBO() const { return m_pIndVBO; }
    void setIndexVBO(VBORep *p) const { m_pIndVBO = p; }

    /// clear cached data (--> delete VBO & index VBO)
    virtual void invalidateCache() const;

  private:
    /// buffer ID (for GL VBO impl)
    mutable VBORep *m_pIndVBO;

    int m_nIndSize;
    index_t *m_pIndData;


  };

  //////////////////////////////////////////////////////
  
  class PixelBuffer;

  /// Draw element for pixel data (2D bitmap)
  class GFX_API DrawElemPix : public DrawElem
  {
  public:
    DrawElemPix();

    virtual ~DrawElemPix();

    virtual int getType() const;

    /// implemented but should not be used
    virtual void alloc(int nsize);
    virtual bool vertex(int ind, const Vector4D &v);

    //////////

    /// Image data
    PixelBuffer *m_pPixBuf;
    
    Vector4D m_pos;
    quint32 m_color;

    void setup(const PixelBuffer &src, const Vector4D &pos, quint32 color);

  };

}

#endif

