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

    typedef MapRenderer super_t;
    friend class ::MapSurfRenderer_wrap;

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

  private:

    ///////////////////////////////////////////
    // work area

    /// size of map (copy from m_pMap)
    int m_nMapColNo, m_nMapRowNo, m_nMapSecNo;

    /// size of section array
    int m_nActCol, m_nActRow, m_nActSec;
    int m_nStCol, m_nStRow, m_nStSec;

    /// contour level (not a property)
    double m_dLevel;

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
    virtual void postRender(DisplayContext *pdc) {}

    virtual bool isTransp() const { return true; }

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

    void marchCube(DisplayContext *pdl, double fx, double fy, double fz, double *values);
    double getOffset(double fValue1, double fValue2, double fValueDesired);
    void getVertexColor(Vector4D &rfColor, Vector4D &rfPosition, Vector4D &rfNormal);
    void getNormal(Vector4D &rfNormal, double fX, double fY, double fZ);

    inline double getDen(int x, int y, int z) const
    {
      // TO DO: support PBC
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

    inline double intrpX(double x, int y, int z) const
    {
      double ix = x+double(m_nStCol - m_pCMap->getStartCol());
      int iy    = y+      (m_nStRow - m_pCMap->getStartRow());
      int iz    = z+      (m_nStSec - m_pCMap->getStartSec());

      double xlo = ::floor(ix);
      double xhi = ::ceil(ix);
      double xf = ix - xlo;

      return
        getDen((int) xlo, (int) iy, (int) iz)*(1.0-xf) +
          getDen((int) xhi, (int) iy, (int) iz)*xf;
    }

    inline double intrpY(int x, double y, int z) const
    {
      int ix    = x+      (m_nStCol - m_pCMap->getStartCol());
      double iy = y+double(m_nStRow - m_pCMap->getStartRow());
      int iz    = z+      (m_nStSec - m_pCMap->getStartSec());

      double ylo = ::floor(iy);
      double yhi = ::ceil(iy);
      double yf = iy - ylo;

      return
        getDen((int) ix, (int) ylo, (int) iz)*(1.0-yf) +
          getDen((int) ix, (int) yhi, (int) iz)*yf;
    }

    inline double intrpZ(int x, int y, double z) const
    {
      int ix    = x+      (m_nStCol - m_pCMap->getStartCol());
      int iy    = y+      (m_nStRow - m_pCMap->getStartRow());
      double iz = z+double(m_nStSec - m_pCMap->getStartSec());

      double zlo = ::floor(iz);
      double zhi = ::ceil(iz);
      double zf = iz - zlo;

      return
        getDen((int) ix, (int) iy, (int) zlo)*(1.0-zf) +
          getDen((int) ix, (int) iy, (int) zhi)*zf;
    }

  };

}

#endif
