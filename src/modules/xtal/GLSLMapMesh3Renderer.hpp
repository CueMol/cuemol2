// -*-Mode: C++;-*-
//
// Generate/Render a mesh contour of ScalarObject using GPU (ver. 3)
//

#ifndef XTAL_GLSL_MAP_MESH3_RENDERER_HPP_INCLUDED
#define XTAL_GLSL_MAP_MESH3_RENDERER_HPP_INCLUDED

#include "xtal.hpp"
#include "MapMeshRenderer.hpp"

#include <qlib/ByteMap.hpp>
#include <qlib/Vector3F.hpp>
#include <qsys/ScalarObject.hpp>
#include <qsys/ViewEvent.hpp>

#include <gfx/Texture.hpp>
#include <gfx/DrawAttrArray.hpp>


class GLSLMapMesh3Renderer_wrap;

namespace sysdep {
  class OglProgramObject;
}

namespace xtal {

  using gfx::DisplayContext;
  using qsys::ScalarObject;
  class DensityMap;
  using sysdep::OglProgramObject;

  using qlib::Vector3F;

  class GLSLMapMesh3Renderer : public MapMeshRenderer
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    typedef MapMeshRenderer super_t;
    friend class ::GLSLMapMesh3Renderer_wrap;

  private:
    ///////////////////////////////////////////
    // properties

  public:

    ///////////////////////////////////////////
    // constructors / destructor

    /// default constructor
    GLSLMapMesh3Renderer();

    /// destructor
    virtual ~GLSLMapMesh3Renderer();

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
    
    virtual bool isCacheAvail() const;

    /// Create GLSL data (VBO, texture, etc)
    virtual void createGLSL();

    /// Render to display (using GLSL)
    virtual void renderGLSL(DisplayContext *pdc);

    /// Invalidate the display cache
    virtual void invalidateDisplayCache();

    virtual void createDisplayCache();

  private:

    ///////////////////////////////////////////
    // work area

    /// GLSL shader objects
    OglProgramObject *m_pPO;

    gfx::Texture *m_pMapTex;

    static const int MAP_TEX_UNIT = 0;

    struct AttrElem {
      qfloat32 dummy;
    };

    typedef gfx::DrawAttrArray<AttrElem> AttrArray;

    /// VBO for glsl map rendering
    AttrArray *m_pAttrAry;

    int m_nPosLoc;

    quint32 m_nVertexLoc;


    // Vector3I m_ivdel[12];
    
    // Vector3F calcVecCrs(const Vector3I &tpos, int iv0, float crs0, int ivbase);
    // void make3DTexMap(ScalarObject *pMap, DensityMap *pXtal);

  private:

    bool m_bCacheValid;

  };

}

#endif
