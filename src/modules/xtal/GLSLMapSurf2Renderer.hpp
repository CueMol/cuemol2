// -*-Mode: C++;-*-
//
// Generate/Render a mesh surface of ScalarObject using GPU (ver. 1)
//

#ifndef XTAL_GLSL_MAP_SURF2_RENDERER_HPP_INCLUDED
#define XTAL_GLSL_MAP_SURF2_RENDERER_HPP_INCLUDED

#include "xtal.hpp"
#include "MapSurf2Renderer.hpp"

#include <qlib/Vector3F.hpp>
#include <gfx/Texture.hpp>
#include <gfx/DrawAttrArray.hpp>

class GLSLMapSurf2Renderer_wrap;

namespace sysdep {
  class OglProgramObject;
}

namespace xtal {

  using gfx::DisplayContext;
  using qsys::ScalarObject;
  using sysdep::OglProgramObject;
  using qlib::Vector3F;

  class DensityMap;

  class GLSLMapSurf2Renderer : public MapSurf2Renderer
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    typedef MapSurf2Renderer super_t;
    friend class ::GLSLMapSurf2Renderer_wrap;

  private:
    ///////////////////////////////////////////
    // properties

    bool m_bUseGlobMap;

  public:
    bool isUseGlobMap() const { return m_bUseGlobMap; }
    void setUseGlobMap(bool b);

  public:

    ///////////////////////////////////////////
    // constructors / destructor

    /// default constructor
    GLSLMapSurf2Renderer();

    /// destructor
    virtual ~GLSLMapSurf2Renderer();

    ///////////////////////////////////////////

    /// Called just before this object is unloaded
    virtual void unloading();

    ///////////////////////////////////////////
    // Renderer ver.2 interface (using GLSL)

    /// Use ver2 interface
    virtual bool isUseVer2Iface() const;

    /// Initialize & setup capabilities (for glsl setup)
    virtual bool init(DisplayContext *pdc);
    // void initShader(DisplayContext *pdc);
    
    // virtual bool isCacheAvail() const;

    /// Render to display (using GLSL)
    virtual void renderGLSL(DisplayContext *pdc);

    /// Invalidate the display cache
    // virtual void invalidateDisplayCache();

    virtual void createDisplayCache();

  private:
    /// Create GLSL data (VBO, texture, etc)
    void createGLSL();

    void createGLSL2();

    void createGlobMapTex();

    void createLocMapTex();

  private:

    ///////////////////////////////////////////
    // work area

    struct AttrElem {
      qfloat32 dummy;
      // quint32 ind;
      //qfloat32 flag;
      //qfloat32 ivert;
    };
    
    typedef gfx::DrawAttrArray<AttrElem> AttrArray;

    sysdep::OglProgramObject *m_pPO;

    int m_nDummyLoc;

    AttrArray *m_pAttrArray;
    
    typedef qlib::Array3D<qbyte> MapTmp;

    /// Map 3D texture (CPU side)
    MapTmp m_maptmp;

    /// Map 3D texture (GPU side)
    gfx::Texture *m_pMapTex;

    static const int MAP_TEX_UNIT = 0;

    /// MC triangle table (256x15x3)
    gfx::Texture *m_pTriTex;

    static const int TRI_TEX_UNIT = 1;

    std::vector<qbyte> m_tritex;

  };
}

#endif

