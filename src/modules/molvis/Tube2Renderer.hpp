// -*-Mode: C++;-*-
//
//  backbone spline-trace renderer class
//

#ifndef TUBE2_RENDERER_HPP_INCLUDED
#define TUBE2_RENDERER_HPP_INCLUDED

#include "molvis.hpp"

#include <qlib/Vector4D.hpp>
#include <qlib/Vector3F.hpp>
#include <gfx/DrawElem.hpp>
#include <gfx/DrawAttrArray.hpp>

#include <modules/molstr/MainChainRenderer.hpp>
#include "CubicSpline.hpp"
#include "TubeSection.hpp"
#include "Spline2Renderer.hpp"

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
  class Tube2Seg;

  ////////////////////////////////////////////////
  //
  /// Rendering object for the one drawing segment
  //
  class Tub2DrawSeg : public detail::DrawSegment
  {
  public:

    typedef detail::DrawSegment super_t;

    Tub2DrawSeg(int st, int en) : super_t(st, en), m_pVBO(NULL), m_pAttrAry(NULL)
    {
    }

    virtual ~Tub2DrawSeg();

    //////////
    // VBO implementation

    typedef gfx::DrawElemVNCI32 VertArray;

    /// cached vertex array/VBO
    VertArray *m_pVBO;

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
  class Tube2Seg : public detail::SplineSegment
  {
  public:

    typedef detail::SplineSegment super_t;
    
    typedef std::deque<Tub2DrawSeg> DrawSegList;

    DrawSegList m_draws;

    /// ctor
    Tube2Seg() : super_t()
    {
      m_pCoefTex = NULL;
      m_pBinormTex = NULL;
      m_pColorTex = NULL;
    }

    /// dtor
    virtual ~Tube2Seg();

    virtual void generateImpl(int nstart, int nend);

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

  typedef std::deque<Tube2Seg> Tub2SegList;

  ////////////////////////////////////////////////////////
  //
  // Tube Renderer version 2 class
  //

  class Tube2Renderer : public SplineRendBase
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    typedef SplineRendBase super_t;

    //////////////
    // Properties

  private:
    /// Tube section data
    TubeSectionPtr m_pts;

  public:
    TubeSectionPtr getTubeSection() const {
      return m_pts;
    }


    /////////////////
    // ctor/dtor

  public:
    Tube2Renderer();
    
    virtual ~Tube2Renderer();

    /////////////////
    // Renderer interface
    
    virtual const char *getTypeName() const;

    // virtual void display(DisplayContext *pdc);

    /////////////////
    // DispCacheRenderer interface

    virtual void preRender(DisplayContext *pdc);
    
    // virtual void invalidateDisplayCache();
    

    /////////////////
    // event handling

    virtual void propChanged(qlib::LPropEvent &ev);

    // virtual void objectChanged(qsys::ObjectEvent &ev);


  public:
    /////////////////
    // Common implementation

    void createSegList(DisplayContext *pdc);
    
    virtual SplineSegment *createSegment();

    /////////////////
    // VBO implementation

    virtual void setupVBO(detail::SplineSegment *pSeg, DisplayContext *pdc);

    virtual void updateCrdVBO(detail::SplineSegment *pSeg);

    virtual void updateColorVBO(detail::SplineSegment *pSeg, DisplayContext *pdc);

    virtual void drawVBO(detail::SplineSegment *pSeg, DisplayContext *pdc);

    /////////////////
    // GLSL implementation

    /// Initialize shaders
    virtual bool initShader(DisplayContext *pdc);

    virtual void setupGLSL(detail::SplineSegment *pSeg, DisplayContext *pdc);

    virtual void updateCrdGLSL(detail::SplineSegment *pSeg);

    virtual void updateColorGLSL(detail::SplineSegment *pSeg, DisplayContext *pdc);

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

    void setupSectGLSL(DisplayContext *pdc);
    
    void updateSectGLSL();

  };

}

#endif

