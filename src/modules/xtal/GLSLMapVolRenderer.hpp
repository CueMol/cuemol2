// -*-Mode: C++;-*-
//
// Volume rendering class of ScalarObject
//

#ifndef XTAL_GLSL_MAP_VOL_RENDERER_HPP_INCLUDED
#define XTAL_GLSL_MAP_VOL_RENDERER_HPP_INCLUDED

#include "xtal.hpp"
#include "MapRenderer.hpp"

#include <qlib/ByteMap.hpp>
#include <qlib/IntVec3D.hpp>
#include <qsys/ScalarObject.hpp>
#include <qsys/ViewEvent.hpp>

#include <sysdep/OglDisplayContext.hpp>
#include <sysdep/OglProgramObject.hpp>

#include <gfx/MultiGradient.hpp>
#include <gfx/Texture.hpp>

class GLSLMapVolRenderer_wrap;

namespace sysdep {
  class OglProgramObject;
  class OglShaderObject;
}

namespace xtal {

  using gfx::DisplayContext;
  using qsys::ScalarObject;
  class DensityMap;
  using sysdep::OglProgramObject;
  using sysdep::OglShaderObject;
  using qlib::IntVec3D;

  class GLSLMapVolRenderer : public MapRenderer,
                          public qsys::ViewEventListener
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    typedef MapRenderer super_t;
    friend class ::GLSLMapVolRenderer_wrap;

  private:
    ///////////////////////////////////////////
    // properties

    /// Periodic boundary flag
    /// (default: false; set true, if map contains the entire of unit cell)
    bool m_bPBC;

    /// Automatically update the map center as view center
    /// (default: true)
    bool m_bAutoUpdate;

    /// Automatically update the map center as view center
    /// in both mouse-drag and mouse-up events
    /// (default: false)
    bool m_bDragUpdate;

    gfx::MultiGradient m_xferfn;

  public:
    /// Auto xfer function type ID
    static const int GLMV_MULTIGRAD = 0;
    static const int GLMV_AUTO1 = 1;
    static const int GLMV_AUTO2 = 2;

  private:
    /// Auto xfer function type
    int m_nXferType;

  public:
    int getXferFnType() const { return m_nXferType; }
    void setXferFnType(int i) { m_nXferType = i; }

  private:

    // GLSL shader objects
    OglProgramObject *m_pPO;

    ///////////////////////////////////////////
    // work area

    /// GLSL support check flag
    bool m_bChkShaderDone;

    /// size of map (copy from m_pMap)
    int m_nMapColNo, m_nMapRowNo, m_nMapSecNo;

    int m_nActCol, m_nActRow, m_nActSec;
    int m_nStCol, m_nStRow, m_nStSec;

    double m_dgrid;

    /// map 3D texture ID
    // GLuint m_nMapTexID;
    gfx::Texture3D *m_pMapTex;

    /// 3D map texture data
    typedef qlib::Array3D<quint8> MapTmp;
    MapTmp m_maptmp;

    // transfer function 1D texture
    // GLuint m_nXfunTexID;
    gfx::Texture1D *m_pXfnTex;

    /// 1D xfer func texture data
    std::vector<quint8> m_xfnmap;

    // planes to draw (not used??)
    // GLuint m_nVBOID;
    
    /// isosurface level
    //  (in int unit, calculated from MapRenderer::getSigLevel())
    unsigned int m_isolevel;

    void renderGPU(DisplayContext *pdc);

  public:

    ///////////////////////////////////////////
    // constructors / destructor

    /// default constructor
    GLSLMapVolRenderer();

    /// destructor
    virtual ~GLSLMapVolRenderer();

    ///////////////////////////////////////////

    virtual const char *getTypeName() const;

    virtual void setSceneID(qlib::uid_t nid);

    virtual qlib::uid_t detachObj();

    void initShader(DisplayContext *pdc);

    /// Called just before this object is unloaded
    virtual void unloading();

    ///////////////////////////////////////////

    void display(DisplayContext *pdc);
    
    virtual void render(DisplayContext *pdl) {}
    virtual void preRender(DisplayContext *pdc) {}
    virtual void postRender(DisplayContext *pdc) {}

    virtual bool isTransp() const { return true; }

    virtual void invalidateDisplayCache();

    virtual void viewChanged(qsys::ViewEvent &);

    ///////////////////////////////////////////////////////////////

    double getMaxExtent() const;

    ///////////////////////////////////////////////////////////////

  private:

    void make3DTexMap(ScalarObject *pMap, DensityMap *pXtal);

    void genXferFunMap();

    bool m_bMapTexOK;

    unsigned char getMap(ScalarObject *pMap, int x, int y, int z) const
    {
      if (m_bPBC) {
        const int xx = (x+10000*m_nMapColNo)%m_nMapColNo;
        const int yy = (y+10000*m_nMapRowNo)%m_nMapRowNo;
        const int zz = (z+10000*m_nMapSecNo)%m_nMapSecNo;
        return pMap->atByte(xx,yy,zz);
      }
      else {
        if (pMap->isInBoundary(x,y,z))
          return pMap->atByte(x,y,z);
        else
          return 0;
      }
    }

  };

}

#endif
