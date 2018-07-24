// -*-Mode: C++;-*-
//
// Generate/Render the contour surface of ScalarObject (ver.2)
//

#ifndef XTAL_MAP_IPOL_SURF2_RENDERER_HPP_INCLUDED
#define XTAL_MAP_IPOL_SURF2_RENDERER_HPP_INCLUDED

#include "xtal.hpp"
#include "Map3Renderer.hpp"

#include <qsys/ScalarObject.hpp>
#include <modules/surface/MolSurfObj.hpp>
#include <modules/molstr/molstr.hpp>
#include <gfx/SolidColor.hpp>

#include "MapBsplIpol.hpp"

#include <unordered_set>
#include <unordered_map>

class MapIpolSurf2Renderer_wrap;

namespace sysdep {
  class OglProgramObject;
}

namespace xtal {

  using gfx::DisplayContext;
  using qsys::ScalarObject;
  using molstr::SelectionPtr;
  using molstr::MolCoordPtr;
  using molstr::MolAtomPtr;
  class DensityMap;

  ///
  /// Map surface renderer using B-spline interpolation (v2)
  ///
  class MapIpolSurf2Renderer : public Map3Renderer
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

  private:
    typedef Map3Renderer super_t;
    friend class ::MapIpolSurf2Renderer_wrap;

    ///////////////////////////////////////////
    // properties

    /*
  public:
    void setColor2(const ColorPtr &col) { super_t::setColor(col); }
    const ColorPtr &getColor2() const { return super_t::getColor(); }
*/

  public:
    enum {
      MSRDRAW_FILL = 0,
      MSRDRAW_LINE = 1,
      MSRDRAW_POINT = 2,
      MSRDRAW_FILL_LINE = 3,
    };
    
  private:
    /// Mesh-drawing mode
    int m_nDrawMode;

  public:
    int getDrawMode() const { return m_nDrawMode; }
    void setDrawMode(int n) {
      m_nDrawMode = n;
      invalidateDisplayCache();
    }
    
  private:
    /// Line width (used in LINE/POINT mode)
    double m_lw;

  public:
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
    
    //////////

  public:
    enum {
      MISR_MC=0,
      // MISR_MCPROJ=1,
      MISR_ISOMESH=2,
      MISR_ADAMESH=3,
    };

  private:
    /// Mesh build method
    int m_nMeshMode;

  public:
    int getMeshMode() const { return m_nMeshMode; }
    void setMeshMode(int n) {
      if (n!=m_nMeshMode) {
        m_nMeshMode = n;
        clearMeshData();
        invalidateDisplayCache();
      }
    }

  private:
    double m_dCurvScl;

  public:
    void setAdpScl(double f) {
      m_dCurvScl = f;
      clearMeshData();
      invalidateDisplayCache();
    }
    double getAdpScl() const { return m_dCurvScl; }


  private:
    double m_dLMin;

  public:
    void setLMin(double f) {
      m_dLMin = f;
      clearMeshData();
      invalidateDisplayCache();
    }
    double getLMin() const { return m_dLMin; }

  private:
    double m_dLMax;

  public:
    void setLMax(double f) {
      m_dLMax = f;
      clearMeshData();
      invalidateDisplayCache();
    }
    double getLMax() const { return m_dLMax; }

    /// project vertex onto isosurf
    bool m_bProjVert;

  public:
    bool isProjVert() const { return m_bProjVert; }
    void setProjVert(bool b) {
      m_bProjVert = b;
      clearMeshData();
      invalidateDisplayCache();
    }

    //////////

  public:
    /// carving mode/no carving (box/extent)
    static const int CRV_NONE = 0;
    /// carving mode/no carving (bounding box of bndryMol+bndryRng)
    static const int CRV_BBOX = 1;
    /// carving mode/atom distance based carving (using bndryMol+bndryRng)
    static const int CRV_ATOMDIST = 2;
    /// carving mode/atom dist + mesh connectivity based carving
    static const int CRV_MESHCONN = 3;
    
  private:
    /// Mesh carving mode
    int m_nCarvMode;

  public:
    int getCarvMode() const { return m_nCarvMode; }
    void setCarvMode(int n) {
      m_nCarvMode = n;
      invalidateDisplayCache();
    }
    
  private:
    double m_dBndryRng2;

  public:
    double getBndryRng2() const { return m_dBndryRng2; }
    void setBndryRng2(double d);

  private:
    /// line color
    ColorPtr m_pLineCol;

  public:
    /// Line color (only used for fill_line mode)
    virtual void setLineColor(const ColorPtr &col) {
      m_pLineCol = col;
      invalidateDisplayCache();
    }
    const ColorPtr &getLineColor() const { return m_pLineCol; }


    //////////

  private:
    /// OpenMP Thread number(-1: use all system cores)
    int m_nOmpThr;

  public:
    int getOmpThr() const { return m_nOmpThr; }
    void setOmpThr(int val) {
      m_nOmpThr = val;
      invalidateDisplayCache();
    }

  protected:

    ///////////////////////////////////////////
    // work area

    /// contour level (cached value/not a property)
    double m_dLevel;

    /// for debug
    std::deque<Vector4D> m_tmpv;
    
    // cached ptr of target obj
    ScalarObject *m_pCMap;

  public:

    ///////////////////////////////////////////
    // constructors / destructor

    /// default constructor
    MapIpolSurf2Renderer();

    /// destructor
    virtual ~MapIpolSurf2Renderer();

    ///////////////////////////////////////////

    virtual const char *getTypeName() const;

    //virtual void attachObj(qlib::uid_t obj_uid);
    virtual void setSceneID(qlib::uid_t nid);

    virtual qlib::uid_t detachObj();

    // /// For updating the center by the mouse events
    // virtual void viewChanged(qsys::ViewEvent &);

    ///////////////////////////////////////////
    // Old/common rendering interface
    //   (for file/display-list rendering)

    virtual void render(DisplayContext *pdl);
    virtual void preRender(DisplayContext *pdc);
    virtual void postRender(DisplayContext *pdc);

  private:

    inline float getDen(int x, int y, int z) const
    {
      // TO DO: support symop
      //if (!inMolBndry(m_pCMap, x, y, z))
      //return 0.0f;

      if (m_bPBC) {
        const int xx = (x+10000*m_mapSize.x())%m_mapSize.x();
        const int yy = (y+10000*m_mapSize.y())%m_mapSize.y();
        const int zz = (z+10000*m_mapSize.z())%m_mapSize.z();
        // return pMap->atByte(xx,yy,zz);
        return m_pCMap->atFloat(xx, yy, zz);
      }
      else {
        if (x<0||y<0||z<0)
          return 0.0;
        if (x>=m_mapSize.x()||
            y>=m_mapSize.y()||
            z>=m_mapSize.z())
          return 0.0;
        return m_pCMap->atFloat(x, y, z);
      }
      
    }

    MapBsplIpol m_ipol;

    void renderImpl2(DisplayContext *pdl);

    Vector3F calcNorm(const Vector3F &v) const;

    void marchCube(void *);

    /// CGAL mesh data
    void *m_pMesh;

    typedef std::unordered_map<int,int> IntMap;

    void buildMeshData(DisplayContext *pdl);

    void renderNocarv(DisplayContext *pdl);
    void renderCrvAtomDist(DisplayContext *pdl);
    void renderCrvMeshConn(DisplayContext *pdl);

    void clearMeshData();

    void renderMeshImpl(DisplayContext *pdl, const IntMap &vidmap, gfx::Mesh &mesh);

    gfx::ColorPtr calcColor(const MolAtomPtr &pAtm);

  public:

    virtual bool isUseVer2Iface() const;

    virtual void invalidateDisplayCache();
    
    virtual void setCenter(const Vector4D &v);
    virtual void setExtent(double value);
    virtual void setSigLevel(double value);

    virtual void setColor(const ColorPtr &col);

  protected:

    int m_nbcol;
    int m_nbrow;
    int m_nbsec;

    ///////////////////////////////////////////////
    // Surface object generation

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
