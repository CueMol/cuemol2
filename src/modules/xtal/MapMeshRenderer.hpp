// -*-Mode: C++;-*-
//
// Generate/Render a mesh contour of ScalarObject
//
// $Id: MapMeshRenderer.hpp,v 1.7 2011/01/06 14:45:24 rishitani Exp $

#ifndef XTAL_MAP_MESH_RENDERER_HPP_INCLUDED
#define XTAL_MAP_MESH_RENDERER_HPP_INCLUDED

#include "xtal.hpp"
#include "MapRenderer.hpp"

#include <qlib/ByteMap.hpp>
#include <qlib/Vector3I.hpp>
#include <qsys/ViewEvent.hpp>

class MapMeshRenderer_wrap;

namespace xtal {

  using qlib::Vector3I;
  using gfx::DisplayContext;
  using qsys::ScalarObject;
  class DensityMap;

  class MapMeshRenderer : public MapRenderer,
                          public qsys::ViewEventListener
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    typedef MapRenderer super_t;
    friend class ::MapMeshRenderer_wrap;

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


  private:
    /// Internal buffer size (default: 100x100x100 points)
    int m_nBufSize;

  public:
    int getBufSize() const { return m_nBufSize; }
    void setBufSize(int nsize);

  protected:
    /// Periodic boundary flag
    /// (default: false; set true, if map contains the entire of unit cell)
    bool m_bPBC;

    /// Automatically update the map center as view center
    /// (default: true)
  private:
    bool m_bAutoUpdate;

  public:
    bool isAutoUpdate() const { return m_bAutoUpdate; }
    void setAutoUpdate(bool b) { m_bAutoUpdate = b; }

    /// Automatically update the map center as view center
    /// in both mouse-drag and mouse-up events
    /// (default: false)
  private:
    bool m_bDragUpdate;

  public:
    bool isDragUpdate() const { return m_bDragUpdate; }
    void setDragUpdate(bool b) { m_bDragUpdate = b; }

    ///////////////////////////////////////////
    // work area

    /// Size of map (in grid unit/copy from m_pMap)
    //int m_nMapColNo, m_nMapRowNo, m_nMapSecNo;
  private:
    Vector3I m_mapSize;

  public:
    const Vector3I &getMapSize() const { return m_mapSize; }

  protected:
    /// size of section array
    int m_nColCrs, m_nRowCrs, m_nSecCrs;

    /// Actual size of display extent (in grid unit)
    //int m_nActCol, m_nActRow, m_nActSec;
  private:
    Vector3I m_dspSize;

  public:
    const Vector3I &getDspSize() const { return m_dspSize; }

  protected:
    /// Start position of display extent from global origin (in grid unit)
    int m_nStCol, m_nStRow, m_nStSec;

    /// Start position of display extent from map origin (in grid unit)
    int m_nMapStCol, m_nMapStRow, m_nMapStSec;

    /// Level in 8-bit map unit
    unsigned int m_nIsoLevel;

  private:
    /// section array for x(column) direction
    qlib::ByteMap *m_pXCrsLst;

    /// section array for y direction
    qlib::ByteMap *m_pYCrsLst;

    /// section array for z direction
    qlib::ByteMap *m_pZCrsLst;

    /// delta
    double m_delta;

  public:

    ///////////////////////////////////////////
    // constructors / destructor

    /// default constructor
    MapMeshRenderer();

    /// destructor
    virtual ~MapMeshRenderer();

    ///////////////////////////////////////////

    virtual const char *getTypeName() const;

    virtual void setSceneID(qlib::uid_t nid);

    virtual qlib::uid_t detachObj();

    ///////////////////////////////////////////

    virtual void render(DisplayContext *pdl);
    virtual void preRender(DisplayContext *pdc);
    virtual void postRender(DisplayContext *pdc) {}

    virtual bool isTransp() const { return true; }

    ///////////////////////////////////////////////////////////////

    /// Generate contour level lines
    bool generate(ScalarObject *pMap, DensityMap *pXtal);

    /// Set internal buffer size
    bool setCrossArraySize(int ncol, int nrow, int nsec);

    /// Get internal buffer size (in col direction)
    int getColCrsSize() const { return m_nColCrs; }
    int getRowCrsSize() const { return m_nRowCrs; }
    int getSecCrsSize() const { return m_nSecCrs; }

    double getMaxExtent() const;

    ///////////////////////////////////////////////////////////////

    virtual void viewChanged(qsys::ViewEvent &);

    ///////////////////////////////////////////////////////////////

  public:
    void setupMapRendInfo(ScalarObject *pMap);
    void calcContLevel(ScalarObject *pMap);

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


  };

}

#endif
