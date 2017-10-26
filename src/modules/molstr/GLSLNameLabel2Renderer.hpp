// -*-Mode: C++;-*-
//
//  Name label renderer (ver.2) class using GLSL
//

#ifndef MOLSTR_GLSL_NAME_LABEL2_RENDERER_H_INCLUDED
#define MOLSTR_GLSL_NAME_LABEL2_RENDERER_H_INCLUDED

#include "molstr.hpp"

#include "NameLabel2Renderer.hpp"

namespace molstr {

  class MOLSTR_API GLSLNameLabel2Renderer : public NameLabel2Renderer
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

  private:
    typedef NameLabel2Renderer super_t;

    //////////////////////////////////////////////////////
    // Properties


    //////////////////////////////////////////////////////

    /// OpenGL label image rendering helper
    GLSLLabelHelper m_glsllabel;

    //////////////////////////////////////////////////////

  public:
    GLSLNameLabel2Renderer();
    virtual ~GLSLNameLabel2Renderer();

    //////////////////////////////////////////////////////
    // Renderer interface implementation

    virtual bool isCompatibleObj(qsys::ObjectPtr pobj) const;
    virtual LString toString() const;

    virtual bool isHitTestSupported() const;

    virtual Vector4D getCenter() const;

    virtual const char *getTypeName() const;

    virtual bool isTransp() const { return true; }

    /// Invalidate the display cache
    virtual void invalidateDisplayCache();

    //////////////////////////////////////////////////////
    // Old rendering interface
    //   (for renderFile()/GL compatible prof)

    virtual void preRender(DisplayContext *pdc);
    virtual void render(DisplayContext *pdc);
    virtual void postRender(DisplayContext *pdc);

    //////////////////////////////////////////////////////
    // Ver. 2 interface

    /// Use ver2 interface (--> return true)
    virtual bool isUseVer2Iface() const;

    /// Initialize & setup capabilities (for glsl setup)
    virtual bool init(DisplayContext *pdc);
    
    virtual bool isCacheAvail() const;

    /// Create GLSL data (VBO, texture, etc)
    virtual void createGLSL();

    /// update VBO positions using CrdArray
    virtual void updateDynamicGLSL();

    /// update VBO positions using getPos
    virtual void updateStaticGLSL();


    // /// Render to display (using VBO)
    // virtual void renderVBO(DisplayContext *pdc);

    /// Render to display (using GLSL)
    virtual void renderGLSL(DisplayContext *pdc);

    void createTextureData(DisplayContext *pdc, float sclx, float scly);

    //////////////////////////////////////////////////////
    // Event handlers

    virtual void propChanged(qlib::LPropEvent &ev);

    virtual void styleChanged(qsys::StyleEvent &);

    //virtual void objectChanged(qsys::ObjectEvent &ev);

  private:
    //bool makeLabelStr(NameLabel &n, LString &lab,Vector4D &pos);
    LString makeLabelStr(NameLabel2 &nlab);

    gfx::PixelBuffer *createPixBuf(double scl, const LString &lab);

    /// clear all cached data
    void clearAllLabelPix();


  };

} // namespace

#endif
