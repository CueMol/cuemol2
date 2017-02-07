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


  class Spl2GLSLDrawSeg : public Spline2DS
  {
  public:

    typedef Spline2DS super_t;

    Spl2GLSLDrawSeg(int st, int en) : super_t(st,en), m_pAttrAry(NULL)
    {
    }

    virtual ~Spl2GLSLDrawSeg();

    //////////
    // GLSL implementation

    struct AttrElem {
      qfloat32 rho;
      // qbyte r, g, b, a;
    };

    typedef gfx::DrawAttrArray<AttrElem> AttrArray;

    /// VBO for glsl rendering
    AttrArray *m_pAttrAry;

  };

  //
  /// Rendering object for the one spline segment
  //
  class Spl2GLSLSeg : public Spline2SS
  {
  public:

    typedef Spline2SS super_t;

    // typedef std::deque<Spl2GLSLDrawSeg> DrawList;
    // DrawList m_draws;

    Spl2GLSLSeg() : super_t()
    {
      m_pCoefTex = NULL;
      m_pColorTex = NULL;
    }

    virtual ~Spl2GLSLSeg();

    virtual detail::DrawSegment *createDrawSeg(int nstart, int nend);

    /////////////////////
    // GLSL implementation

    /// float texture of the main axis coeff (common)
    gfx::Texture *m_pCoefTex;

    /// color texture
    gfx::Texture *m_pColorTex;
    std::vector<qbyte> m_colorTexData;

  };

  ////////////////////////////////////////////////////////
  //
  /// Spline Renderer version 2 class (GLSL impl)
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

    // virtual void objectChanged(qsys::ObjectEvent &ev);


  public:
    /////////////////
    // GLSL implementation

    virtual SplineSegment *createSegment();

    /// Initialize shaders
    virtual bool init(DisplayContext *pdc);

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

#endif
