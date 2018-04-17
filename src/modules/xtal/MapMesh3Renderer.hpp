// -*-Mode: C++;-*-
//
// Generate/Render mesh contours of ScalarObject (ver. 3)
//
// $Id$

#ifndef XTAL_MAP_MESH3_RENDERER_HPP_INCLUDED
#define XTAL_MAP_MESH3_RENDERER_HPP_INCLUDED

#include "xtal.hpp"
#include "Map3Renderer.hpp"

#include <qlib/Vector3I.hpp>
#include <qlib/Array.hpp>

class MapMesh3Renderer_wrap;

namespace xtal {

  using qlib::Vector3I;
  using qlib::Vector3F;
  using qlib::FloatArray;

  using gfx::DisplayContext;
  using qsys::ScalarObject;
  class DensityMap;

  class MapMesh3Renderer : public Map3Renderer
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

  private:
    typedef Map3Renderer super_t;
    friend class ::MapMesh3Renderer_wrap;

    typedef qlib::Array3D<qbyte> ByteMap;
    
    ///////////////////////////////////////////
    // properties

    /// Drawing line width (in pixel unit)
  private:
    double m_lw;

  public:
    void setLineWidth(double f) {
      m_lw = f;
      super_t::invalidateDisplayCache();
    }
    double getLineWidth() const { return m_lw; }

/*
  private:
    /// Internal buffer size (default: 100x100x100 points)
    int m_nBufSize;
  public:
    
    int getBufSize() const { return m_nBufSize; }
    void setBufSize(int nsize) {
      m_nMaxGrid = nsize;
    }
*/
  public:
    // for compatibility
    int getBufSize() const { return getMaxGrids(); }
    void setBufSize(int nsize) { setMaxGrids(nsize); }

    /// Use spherical extent
  private:
    bool m_bSphExt;

  public:
    bool isSphExt() const { return m_bSphExt; }
    void setSphExt(bool b) { m_bSphExt = b; }

    ///////////////////////////////////////////
    // work area

    /*
  protected:
    /// size of section array
    int m_nColCrs, m_nRowCrs, m_nSecCrs;
     */
    
  protected:
    qlib::Array3D<qbyte> m_maptmp;

    Vector3I m_texStPos;

  public:

    ///////////////////////////////////////////
    // constructors / destructor

    /// default constructor
    MapMesh3Renderer();

    /// destructor
    virtual ~MapMesh3Renderer();

    ///////////////////////////////////////////

    virtual const char *getTypeName() const;

    virtual void setSceneID(qlib::uid_t nid);

    virtual qlib::uid_t detachObj();

    ///////////////////////////////////////////

    virtual void render(DisplayContext *pdl);
    virtual void preRender(DisplayContext *pdc);
    virtual void postRender(DisplayContext *pdc) {}

    virtual bool isTransp() const { return true; }

    // /// Generate contour level lines
    // bool generate(ScalarObject *pMap, DensityMap *pXtal);

    ///////////////////////////////////////////////////////////////

    /// Rendering implementation 1 (using basic marching planes alg.)
    void renderImpl1(DisplayContext *pdl);

    void renderImplTest2(DisplayContext *pdl);

    virtual void objectChanged(qsys::ObjectEvent &ev);

    ///////////////////////////////////////////////////////////////

  public:

  protected:

    unsigned char getContSec(unsigned int s0,
                             unsigned int s1,
                             unsigned int lv);

    unsigned char getMap(ScalarObject *pMap, int x, int y, int z) const
    {
      if (m_bPBC) {
        const int xx = (x+10000*m_mapSize.x())%m_mapSize.x();
        const int yy = (y+10000*m_mapSize.y())%m_mapSize.y();
        const int zz = (z+10000*m_mapSize.z())%m_mapSize.z();
        return pMap->atByte(xx,yy,zz);
      }
      else {
        if (pMap->isInBoundary(x,y,z))
          return pMap->atByte(x,y,z);
        else
          return 0;
      }
    }

    ///////////////////////////////////////////////////////////////

    Vector3I m_ivdel[12];

    int m_idel[12][3];
    
    int m_triTable[16][2];

    static inline float getCrossVal(quint8 d0, quint8 d1, quint8 isolev)
    {
      if (d0==d1 || d0==0 || d1==0) return -1.0;
      
      float crs = float(isolev-d0)/float(d1-d0);
      return crs;
    }

    Vector3F calcVecCrs(const Vector3I &tpos, int iv0, float crs0, int ivbase);
    
    inline Vector3F calcVecCrs(int i, int j, int k, int iv0, float crs0, int ivbase){
      Vector3F v0(float(i + m_idel[ivbase+iv0][0]),
                  float(j + m_idel[ivbase+iv0][1]),
                  float(k + m_idel[ivbase+iv0][2]));
      
      Vector3F v1(float(i + m_idel[ivbase+(iv0+1)%4][0]),
                  float(j + m_idel[ivbase+(iv0+1)%4][1]),
                  float(k + m_idel[ivbase+(iv0+1)%4][2]));
      
      return v0 + (v1-v0).scale(crs0);
    }
    
    ///////////////////////////////////////////////////////////////

    FloatArray *m_pBsplCoeff;
    
    float calcIpolBspl3(const Vector3F &pos) const;
    Vector3F calcIpolBspl3Diff(const Vector3F &pos) const;
    Vector3F calcIpolBspl3DscDiff(const Vector3F &pos) const;

    std::complex<float> calc_cm2(int i, int N)
    {
      int ii;
      if (i<N/2)
        ii = i;
      else
        ii = i-N;

      float u = float(ii)/float(N);
      
      std::complex<float> piu(0.0f, -2.0f*M_PI*u);
      std::complex<float> rval = std::complex<float>(3,0) * std::exp(piu) / std::complex<float>(2.0 + cos(2.0*M_PI*u),0);

      return rval;

    }

    Vector3F getXValF(float val0, const Vector3F &vec0, float val1, const Vector3F &vec1, float isolev);
    Vector3F getXValFBsec(float val0, const Vector3F &vec0, float val1, const Vector3F &vec1, float isolev);
    //Vector3F getXValFNr(float val0, const Vector3F &vec0, float val1, const Vector3F &vec1, float isolev);
    bool getXValFNr(float val0, const Vector3F &vec0, float val1, const Vector3F &vec1, float isolev, Vector3F &rval);

    bool getXValFNrImpl1(const Vector3F &vec0, const Vector3F &dv, float rho, float isolev, float &rval);

    
    void divideAndDraw(DisplayContext *pdl, const Vector3F &v0, const Vector3F &v1, float isolev, const Vector3F &pln);

    float m_dArcMax;
  };

}

#endif
