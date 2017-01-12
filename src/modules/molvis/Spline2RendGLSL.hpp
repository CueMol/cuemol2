// -*-Mode: C++;-*-
//
//  backbone spline-trace renderer class
//

#ifndef SPLINE2_REND_GLSL_HPP_INCLUDED
#define SPLINE2_REND_GLSL_HPP_INCLUDED

#include "molvis.hpp"

#include <qlib/Vector4D.hpp>
#include <qlib/Vector3F.hpp>
#include <gfx/DrawElem.hpp>
#include <gfx/DrawAttrArray.hpp>

#include <modules/molstr/MainChainRenderer.hpp>
#include "Spline2Renderer.hpp"

#ifdef WIN32
#define USE_TBO 1
#define USE_INSTANCED 1
#else
#endif

namespace sysdep {
  class OglProgramObject;
}

namespace gfx {
  class Texture;
}

namespace molvis {

  using qlib::Vector4D;
  using qlib::Vector3F;
  using gfx::ColorPtr;
  using namespace molstr;


  ////////////////////////////////////////////////////////
  //
  // Spline Renderer version 2 class (GLSL impl)
  //

  class Spline2RendGLSL : public Spline2Renderer
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    typedef Spline2Renderer super_t;

    //////////////
    // Properties

    /////////////////
    // ctor/dtor

  public:
    Spline2RendGLSL();
    
    virtual ~Spline2RendGLSL();

    /////////////////
    // event handling

    // virtual void propChanged(qlib::LPropEvent &ev);

    virtual void objectChanged(qsys::ObjectEvent &ev);


  public:
    /////////////////
    // GLSL implementation

    /// Initialize shaders
    virtual bool initShader(DisplayContext *pdc);

    virtual void setupGLSL(detail::SplineSegment *pSeg);

    virtual void updateCrdGLSL(detail::SplineSegment *pSeg);

    virtual void updateColorGLSL(detail::SplineSegment *pSeg);

    virtual void drawGLSL(detail::SplineSegment *pSeg, DisplayContext *pdc);

  private:
    /////////////////
    // work area

    static const int COEF_TEX_UNIT = 0;
    static const int COLOR_TEX_UNIT = 1;

    /// GLSL shader objects
    sysdep::OglProgramObject *m_pPO;

    quint32 m_nRhoLoc;

    // quint32 m_nColLoc;

  };

}

