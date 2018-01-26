// -*-Mode: C++;-*-
//
// Generate/Render the contour surface of ScalarObject
//

#ifndef XTAL_MAP_SURF_RENDERER_HPP_INCLUDED
#define XTAL_MAP_SURF_RENDERER_HPP_INCLUDED

#include "xtal.hpp"
#include "MapRenderer.hpp"

#include <qlib/ByteMap.hpp>
#include <qsys/ScalarObject.hpp>
#include <qsys/ViewEvent.hpp>
#include <modules/molstr/molstr.hpp>
#include <modules/molstr/BSPTree.hpp>

#include <modules/surface/MolSurfObj.hpp>

class MapSurfRenderer_wrap;

namespace xtal {

  using gfx::DisplayContext;
  using qsys::ScalarObject;
  using molstr::SelectionPtr;
  using molstr::MolCoordPtr;
  using molstr::BSPTree;
  class DensityMap;

  class MapSurfRenderer : public MapRenderer,
                          public qsys::ViewEventListener
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

  private:
    typedef MapRenderer super_t;
    friend class ::MapSurfRenderer_wrap;

    ///////////////////////////////////////////
    // properties

    /// Automatically update the map center as view center
    /// (default: true)
    bool m_bAutoUpdate;

    /// Automatically update the map center as view center
    /// in both mouse-drag and mouse-up events
    /// (default: false)
    bool m_bDragUpdate;

  public:
    enum {
      MSRDRAW_FILL = 0,
      MSRDRAW_LINE = 1,
      MSRDRAW_POINT = 2,
    };
    
  private:
    /// Mesh-drawing mode
    int m_nDrawMode;

    /// Line width (used in LINE/POINT mode)
    double m_lw;

  public:
    int getDrawMode() const { return m_nDrawMode; }
    void setDrawMode(int n) {
      m_nDrawMode = n;
      invalidateDisplayCache();
    }
    
    void setLineWidth(double f) {
      m_lw = f;
      invalidateDisplayCache();
    }
    double getLineWidth() const { return m_lw; }
    

  private:
    /// cull face
    bool m_bCullFace;

  public:
    bool isCullFace() const { return m_bCullFace; }
    void setCullFace(bool b) {
      m_bCullFace = b;
      invalidateDisplayCache();
    }
    
  private:
    /// binning
    int m_nBinFac;

  public:
    int getBinFac() const { return m_nBinFac; }
    void setBinFac(int n) {
      m_nBinFac = n;
      invalidateDisplayCache();
    }
    
  private:
    /// Max grid size (default=100x100x100 grid)
    int m_nMaxGrid;

  public:
    int getMaxGrids() const { return m_nMaxGrid; }
    void setMaxGrids(int n);

    /// Get max extent (in angstrom unit; calculated from m_nMaxGrid)
    double getMaxExtent() const;

  private:
    /// Use OpenMP (experimental)
    bool m_bUseOpenMP;

  public:
    bool isUseOpenMP() const { return m_bUseOpenMP; }
    void setUseOpenMP(bool b) {
      m_bUseOpenMP = b;
      invalidateDisplayCache();
    }

  private:
    /// OpenMP Thread number(-1: use all system cores)
    int m_nOmpThr;

  public:
    int getOmpThr() const { return m_nOmpThr; }
    void setOmpThr(int val) {
      m_nOmpThr = val;
      invalidateDisplayCache();
    }

  private:

    ///////////////////////////////////////////
    // work area

    /// Periodic boundary flag. This value is determined by the map size and usePBC flag
    bool m_bPBC;

    /// size of map (copy from m_pMap)
    int m_nMapColNo, m_nMapRowNo, m_nMapSecNo;

    /// size of section array
    int m_nActCol, m_nActRow, m_nActSec;
    int m_nStCol, m_nStRow, m_nStSec;

    /// contour level (not a property)
    double m_dLevel;

    /// for debug
    std::deque<Vector4D> m_tmpv;
    
  public:

    ///////////////////////////////////////////
    // constructors / destructor

    /// default constructor
    MapSurfRenderer();

    /// destructor
    virtual ~MapSurfRenderer();

    ///////////////////////////////////////////

    virtual const char *getTypeName() const;

    //virtual void attachObj(qlib::uid_t obj_uid);
    virtual void setSceneID(qlib::uid_t nid);

    virtual qlib::uid_t detachObj();

    ///////////////////////////////////////////

    virtual void render(DisplayContext *pdl);
    virtual void preRender(DisplayContext *pdc);
    virtual void postRender(DisplayContext *pdc);

    // virtual bool isTransp() const { return true; }

    ///////////////////////////////////////////////////////////////

    virtual void viewChanged(qsys::ViewEvent &);

  protected:
    // We must override firePropertyChanged() to avoid destructing the display list,
    // when only the color was changed.
    // virtual void firePropertyChanged(qlib::PropChgEvent &ev);

  private:

    // cached ptr of target obj
    ScalarObject *m_pCMap;

    void makerange();

    void renderImpl(DisplayContext *pdl);

    void marchCube(DisplayContext *pdl, int fx, int fy, int fz);

    //double getOffset(double fValue1, double fValue2, double fValueDesired);
    void getVertexColor(Vector4D &rfColor, Vector4D &rfPosition, Vector4D &rfNormal);
    Vector4D getNormal(const Vector4D &rfNormal,bool,bool,bool);

    inline float getDen(int x, int y, int z) const
    {
      // TO DO: support symop

      if (m_bPBC) {
        const int xx = (x+10000*m_nMapColNo)%m_nMapColNo;
        const int yy = (y+10000*m_nMapRowNo)%m_nMapRowNo;
        const int zz = (z+10000*m_nMapSecNo)%m_nMapSecNo;
        // return pMap->atByte(xx,yy,zz);
        return m_pCMap->atFloat(xx, yy, zz);
      }
      else {
        if (x<0||y<0||z<0)
          return 0.0;
        if (x>=m_nMapColNo||
            y>=m_nMapRowNo||
            z>=m_nMapSecNo)
          return 0.0;
        return m_pCMap->atFloat(x, y, z);
      }
      
    }

    Vector4D getGrdNorm(int ix, int iy, int iz);
    Vector4D getGrdNorm2(int ix, int iy, int iz);

    float m_values[8];
    bool m_bary[8];
    Vector4D m_norms[8];

    //////////

    // Experimental rendering impl
    void renderImpl2(DisplayContext *pdl);
    
    typedef std::vector<surface::MSVert> MSVertList;

    void MapSurfRenderer::marchCube2(int fx, int fy, int fz,
                                     const qbyte *values,
                                     const bool *bary,
                                     MSVertList &verts);
      
    inline qbyte getByteDen(int x, int y, int z) const
    {
      // TO DO: support symop

      if (m_bPBC) {
        const int xx = (x+10000*m_nMapColNo)%m_nMapColNo;
        const int yy = (y+10000*m_nMapRowNo)%m_nMapRowNo;
        const int zz = (z+10000*m_nMapSecNo)%m_nMapSecNo;
        return m_pCMap->atByte(xx,yy,zz);
      }
      else {
        if (x<0||y<0||z<0)
          return 0;
        if (x>=m_nMapColNo||
            y>=m_nMapRowNo||
            z>=m_nMapSecNo)
          return 0;
        return m_pCMap->atByte(x, y, z);
      }
      
    }

    qbyte m_bIsoLev;

  private:
    std::deque<surface::MSVert> m_msverts;
    Matrix4D m_xform;

    int addMSVert(const Vector4D &v, const Vector4D &n)
    {
      Vector4D vv(v);
      vv.w() = 1.0;
      m_xform.xform4D(vv);

      Vector4D nn(n);
      nn.w() = 0.0;
      m_xform.xform4D(nn);

      int nid = m_msverts.size();
      m_msverts.push_back( surface::MSVert(vv, nn) );

      return nid;
    }

  public:    
    qsys::ObjectPtr generateSurfObj();

  };

}

#endif
