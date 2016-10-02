// -*-Mode: C++;-*-
//
// Generate/Render a mesh contour of ScalarObject
//

#ifndef XTAL_GLSL_MAP_MESH2_RENDERER_HPP_INCLUDED
#define XTAL_GLSL_MAP_MESH2_RENDERER_HPP_INCLUDED

#include "xtal.hpp"
#include "MapRenderer.hpp"

#include <qlib/ByteMap.hpp>
#include <qlib/IntVec3D.hpp>
#include <qsys/ScalarObject.hpp>
#include <qsys/ViewEvent.hpp>

#include <sysdep/OglDisplayContext.hpp>
#include <sysdep/OglProgramObject.hpp>

class GLSLMapMesh2Renderer_wrap;

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

  class GLSLMapMesh2Renderer : public MapRenderer,
                          public qsys::ViewEventListener
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    typedef MapRenderer super_t;
    friend class ::GLSLMapMesh2Renderer_wrap;

  private:
    ///////////////////////////////////////////
    // properties

    /// Drawing line width (in pixel unit)
    double m_lw;

    /// Internal buffer size (default: 100x100x100 points)
    int m_nBufSize;

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

  private:

    /// GLSL support check flag
    bool m_bChkShaderDone;

    /// GLSL shader objects
    OglProgramObject *m_pPO;

    ///////////////////////////////////////////
    // work area

    /// size of map (copy from m_pMap)
    int m_nMapColNo, m_nMapRowNo, m_nMapSecNo;

    // /// size of section array
    // int m_nColCrs, m_nRowCrs, m_nSecCrs;

    int m_nActCol, m_nActRow, m_nActSec;
    int m_nStCol, m_nStRow, m_nStSec;

    /// delta
    double m_delta;

    /// map 3D texture ID
    //GLuint m_nMapTexID;
    //GLuint m_nMapBufID;
    gfx::Texture *m_pMapTex;

    static const int MAP_TEX_UNIT = 0;

    // GLuint m_nVBOID;

    struct AttrElem {
      qfloat32 pos_x, pos_y, pos_z;
      qfloat32 plane;
      qfloat32 ord;
    };

    typedef gfx::DrawAttrArray<AttrElem> AttrArray;

    /// VBO for glsl map rendering
    AttrArray *m_pAttrAry;

    int m_nPosLoc;
    int m_nPlaneLoc;
    int m_nOrdLoc;

    unsigned int m_isolevel;

    GLuint m_nVertexLoc;

    //typedef qlib::Array3D<int> MapTmp;
    typedef qlib::Array3D<quint8> MapTmp;
    //typedef qlib::Array3D<float> MapTmp;

    MapTmp m_maptmp;

    void renderGPU(DisplayContext *pdc);
    void renderCPU(DisplayContext *pdc);

    IntVec3D m_ivdel[12];
    
    Vector4D calcVecCrs(const IntVec3D &tpos, int iv0, float crs0, int ivbase);
  public:

    ///////////////////////////////////////////
    // constructors / destructor

    /// default constructor
    GLSLMapMesh2Renderer();

    /// destructor
    virtual ~GLSLMapMesh2Renderer();

    ///////////////////////////////////////////

    virtual const char *getTypeName() const;

    virtual void setSceneID(qlib::uid_t nid);

    virtual qlib::uid_t detachObj();

    void initShader();

    /// Called just before this object is unloaded
    virtual void unloading();

    ///////////////////////////////////////////

    void display(DisplayContext *pdc);
    
    virtual void render(DisplayContext *pdl) {}
    virtual void preRender(DisplayContext *pdc) {}
    virtual void postRender(DisplayContext *pdc) {}

    virtual bool isTransp() const { return true; }

    virtual void invalidateDisplayCache();

    ///////////////////////////////////////////////////////////////

    void make3DTexMap(ScalarObject *pMap, DensityMap *pXtal);

    ///////////////////////////////////////////////////////////////

    void setLineWidth(double f) {
      m_lw = f;
      super_t::invalidateDisplayCache();
    }
    double getLineWidth() const { return m_lw; }

    double getMaxExtent() const;

    int getBufSize() const { return m_nBufSize; }
    void setBufSize(int nsize) {
      m_nBufSize = nsize;
    }

    ///////////////////////////////////////////////////////////////

    virtual void viewChanged(qsys::ViewEvent &);

    ///////////////////////////////////////////////////////////////

  private:

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
