// -*-Mode: C++;-*-
//
//  Name label renderer (ver.2) class using GLSL
//

#ifndef MOLSTR_GLSL_NAME_LABEL2_RENDERER_H_INCLUDED
#define MOLSTR_GLSL_NAME_LABEL2_RENDERER_H_INCLUDED

#include "molstr.hpp"

#include "NameLabel2Renderer.hpp"
#include "GLSLLabelHelper.hpp"

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

    double m_dPixPerAng;

    //////////////////////////////////////////////////////

  public:
    GLSLNameLabel2Renderer();
    virtual ~GLSLNameLabel2Renderer();

    //////////////////////////////////////////////////////
    // Renderer interface implementation

    virtual LString toString() const;

    virtual bool isTransp() const { return true; }

    //////////////////////////////////////////////////////
    // Ver. 2 interface

    /// Invalidate the display cache
    virtual void invalidateDisplayCache();

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

    /// Render to display (using VBO)
    virtual void renderVBO(DisplayContext *pdc);

    //////////////////////////////////////////////////////
    // Event handlers

    // virtual void propChanged(qlib::LPropEvent &ev);

    // virtual void styleChanged(qsys::StyleEvent &);


    virtual void setColor(const gfx::ColorPtr &pcol);

    virtual void setRotTh(double th);

  private:


  };

} // namespace

#endif
