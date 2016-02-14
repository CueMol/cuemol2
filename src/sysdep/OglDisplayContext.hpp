// -*-Mode: C++;-*-
//
//  OpenGL display context interface
//
//  $Id: OglDisplayContext.hpp,v 1.20 2011/01/09 15:12:22 rishitani Exp $

#ifndef GFX_OGL_DISPLAY_CONTEXT_HPP_
#define GFX_OGL_DISPLAY_CONTEXT_HPP_

#include "sysdep.hpp"

#include <gfx/DisplayContext.hpp>

namespace gfx {
  class DrawElemPix;
  class AbstDrawAttrs;
}

namespace sysdep {

  class OglProgramObject;

  using gfx::AbstractColor;
  using gfx::ColorPtr;

  class SYSDEP_API OglDisplayContext : public gfx::DisplayContext
  {
  private:
    typedef gfx::DisplayContext super_t;

    int m_nSceneID;
    // int m_nViewID;

    Vector4D m_color;
    // Vector4D m_pos;

    int m_nDetail;
    void *m_pGluData;

    /// Name buffer emulation
    std::deque<int> m_namebuf;
    
    /// Use shader alpha
    bool m_bUseShaderAlpha;

    /// Default program object (shader)
    OglProgramObject *m_pDefPO;
    
    OglProgramObject *m_pEdgePO;

    //////////

  public:
    OglDisplayContext(int sceneid);
    virtual ~OglDisplayContext();

    //////////

    bool useShaderAlpha() const { return m_bUseShaderAlpha; }
    void setUseShaderAlpha(bool f) { m_bUseShaderAlpha = f; }

    int getSceneID() const { return m_nSceneID; }
    //    int getViewID() const { return m_nViewID; }

    // OpenGL-level initialization
    virtual void init();
    
    virtual bool isFile() const;

    /// Returns whether this context support VA/VBO (DrawElem()) method
    virtual bool isDrawElemSupported() const;
    
    // shader control
    virtual void startSection(const LString &section_name);
    virtual void endSection();

    virtual void startEdgeSection();
    virtual void endEdgeSection();

    ////////////////

    virtual void vertex(const Vector4D &);
    virtual void vertex(double x, double y, double z);
    virtual void normal(const Vector4D &);
    virtual void normal(double x, double y, double z);
    virtual void color(const ColorPtr &c);
    virtual void color(double r, double g, double b, double a);
    virtual void color(double r, double g, double b);

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

    virtual void loadName(int nameid);
    virtual void pushName(int nameid);
    virtual void popName();

    virtual void drawPointHit(int nid, const Vector4D &pos);

    ////////////////
    // image/text drawing

    virtual void drawString(const Vector4D &pos, const qlib::LString &str);
    virtual void drawPixels(const Vector4D &pos,
                            const gfx::PixelBuffer &data,
                            const gfx::ColorPtr &col);

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
    void drawElemVA(const gfx::DrawElem &l);

    void drawElemPix(const gfx::DrawElemPix &de);

    void drawElemAttrs(const gfx::AbstDrawAttrs &ada);

    ///////////////////////////////
    // OpenGL SL support

  private:
    typedef std::map<LString, OglProgramObject *> ProgTab;
    ProgTab m_progs;

  public:
    // bool hasShaders() const;
    // bool hasGeomShader() const;

    /// create GLSL program object
    OglProgramObject *createProgramObject(const LString &name);
    OglProgramObject *getProgramObject(const LString &name);
    bool destroyProgramObject(const LString &name);

  private:
    LString m_curMater;
    void setMaterImpl(const LString &name);

  };

}

#endif
