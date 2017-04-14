// -*-Mode: C++;-*-
//
//  Tube renderer2 using GLSL
//

#ifndef GLSL_RC_TUBE_REND_HPP_INCLUDED
#define GLSL_RC_TUBE_REND_HPP_INCLUDED

#include "molvis.hpp"

#include "GLSLTube2Renderer.hpp"

namespace molvis {

  using qlib::Vector4D;
  using qlib::Vector3F;
  using gfx::ColorPtr;
  using namespace molstr;

  ////////////////////////////////////////////////////////
  //
  // Tube Renderer version 2 class using GLSL
  //

  class GLSLRcTubeRenderer : public GLSLTube2Renderer
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    typedef GLSLTube2Renderer super_t;

    /////////////////
    // ctor/dtor

  public:
    GLSLRcTubeRenderer();
    
    virtual ~GLSLRcTubeRenderer();

    /////////////////
    // Renderer interface

    virtual const char *getTypeName() const;

  public:
    /////////////////
    // Common implementation

    // virtual SplineSegment *createSegment();

    /////////////////
    // GLSL implementation

    /// Initialize shaders&set cap flags
    virtual bool init(DisplayContext *pdc);

    virtual void setupGLSL(detail::SplineSegment *pSeg);

    //virtual void updateCrdGLSL(detail::SplineSegment *pSeg);

    virtual void updateColorGLSL(detail::SplineSegment *pSeg);

    virtual void drawGLSL(detail::SplineSegment *pSeg, DisplayContext *pdc);

  public:
    float m_gamma;

  public:
    void setGamma(float d) {
      m_gamma = d;
      invalidateDisplayCache();
    }
    float getGamma() const { return m_gamma; }
    

  private:
    /////////////////
    // work area

    /// GLSL shader objects
    sysdep::OglProgramObject *m_pPO;

    quint32 m_nRhoLoc;

    static const int COEF_TEX_UNIT = 0;
    static const int BINORM_TEX_UNIT = 1;
    //static const int SECT_TEX_UNIT = 2;
    static const int COLOR_TEX_UNIT = 3;
    static const int PUTTY_TEX_UNIT = 4;

    //gfx::Texture *m_pSectTex;
    //std::vector<float> m_secttab;

    //void setupSectGLSL();
    
    //void updateSectGLSL();

  };

}

#endif

