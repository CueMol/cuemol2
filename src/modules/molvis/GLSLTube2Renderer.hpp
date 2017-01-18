// -*-Mode: C++;-*-
//
//  Tube renderer2 using GLSL
//

#ifndef TUBE2_REND_GLSL_HPP_INCLUDED
#define TUBE2_REND_GLSL_HPP_INCLUDED

#include "molvis.hpp"

#include "Tube2Renderer.hpp"

#ifdef WIN32
#define USE_TBO 1
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

  class Tube2Renderer;
  class Tube2SS;

  ////////////////////////////////////////////////
  //
  /// Rendering object for the one drawing segment
  //
  class GLSLTube2DS : public Tube2DS
  {
  public:

    typedef Tube2DS super_t;

    GLSLTube2DS(int st, int en) : super_t(st, en), m_pAttrAry(NULL)
    {
    }

    virtual ~GLSLTube2DS();

    //////////
    // GLSL implementation

    struct AttrElem {
      qfloat32 rhoi, rhoj;
    };

    typedef gfx::DrawAttrElems<quint32, AttrElem> AttrArray;

    /// VBO for glsl rendering
    AttrArray *m_pAttrAry;

  };


  ////////////////////////////////////////////////
  //
  /// Rendering object for the one spline segment
  //
  class GLSLTube2SS : public Tube2SS
  {
  public:

    typedef Tube2SS super_t;

    /// ctor
    GLSLTube2SS() : super_t(), m_pCoefTex(NULL), m_pBinormTex(NULL), m_pColorTex(NULL)
    {
    }

    /// dtor
    virtual ~GLSLTube2SS();

    // virtual void generateImpl(int nstart, int nend);
    virtual detail::DrawSegment *createDrawSeg(int nstart, int nend);

    /////////////////////
    // GLSL implementation

    /// float texture of the main axis coeff (common)
    gfx::Texture *m_pCoefTex;

    /// float texture of the binorm interp coeff
    gfx::Texture *m_pBinormTex;

    /// color texture
    gfx::Texture *m_pColorTex;
    std::vector<qbyte> m_colorTexData;

  };


  ////////////////////////////////////////////////////////
  //
  // Tube Renderer version 2 class using GLSL
  //

  class GLSLTube2Renderer : public Tube2Renderer
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    typedef Tube2Renderer super_t;

    //////////////
    // Properties

    /////////////////
    // ctor/dtor

  public:
    GLSLTube2Renderer();
    
    virtual ~GLSLTube2Renderer();

    /////////////////
    // event handling

    // virtual void propChanged(qlib::LPropEvent &ev);

    virtual void objectChanged(qsys::ObjectEvent &ev);


  public:
    /////////////////
    // Common implementation

    virtual void createSegList();
    
    virtual SplineSegment *createSegment();

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

    /// GLSL shader objects
    sysdep::OglProgramObject *m_pPO;

    quint32 m_nRhoLoc;

    // quint32 m_nColLoc;

    static const int COEF_TEX_UNIT = 0;
    static const int BINORM_TEX_UNIT = 1;
    static const int SECT_TEX_UNIT = 2;
    static const int COLOR_TEX_UNIT = 3;

    gfx::Texture *m_pSectTex;
    std::vector<float> m_secttab;

    void setupSectGLSL();
    
    void updateSectGLSL();

  };

}

#endif

