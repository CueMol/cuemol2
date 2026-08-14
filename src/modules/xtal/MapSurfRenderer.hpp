// -*-Mode: C++;-*-
//
// Generate/Render the contour surface of ScalarObject
//

#ifndef XTAL_MAP_SURF_RENDERER_HPP_INCLUDED
#define XTAL_MAP_SURF_RENDERER_HPP_INCLUDED

#include "xtal.hpp"
#include "MapRenderer.hpp"

#include <qsys/ScalarObject.hpp>
#include <qsys/ViewEvent.hpp>
#include <modules/molstr/molstr.hpp>
#include <modules/molstr/BSPTree.hpp>

#include <modules/molstr/ColoringScheme.hpp>
#include <modules/surface/MolSurfObj.hpp>

class MapSurfRenderer_wrap;

namespace molstr { class AtomPosMap2; }

namespace xtal {

  using gfx::DisplayContext;
  using qsys::ScalarObject;
  using molstr::SelectionPtr;
  using molstr::MolCoordPtr;
  using molstr::BSPTree;
  class DensityMap;

  class MapSurfRenderer : public MapRenderer,
                          public molstr::ColSchmHolder,
                          public qsys::ViewEventListener
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

  private:
    typedef MapRenderer super_t;
    friend class ::MapSurfRenderer_wrap;

  public:
    // Both MapRenderer::getColor() (solid color property) and
    // ColSchmHolder::getColor(MolAtomPtr/MolResiduePtr) are inherited from
    // different bases; bring both overload sets into the same scope so that
    // unqualified calls resolve by argument instead of being ambiguous.
    using MapRenderer::getColor;
    using molstr::ColSchmHolder::getColor;

  private:
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
    /// Molecule object ID by which painting color is determined
    /// (used in MOLFANC mode)
    qlib::uid_t m_nTgtMolID;

    /// Molecule object name by which painting color is determined.
    /// Used if MolID cannot be resolved (when deserialized from qsc file)
    qlib::LString m_sTgtMolName;

    /// Selection for atompos-map (used in MOLFANC mode)
    SelectionPtr m_pMolSel;

  public:
    /// Get reference molecule target (used in MOLFANC mode)
    qlib::LString getTgtObjName() const;

    /// Set reference molecule target (used in MOLFANC mode)
    void setTgtObjName(const qlib::LString &n);

    SelectionPtr getMolSel() const { return m_pMolSel; }

    void setMolSel(SelectionPtr pNewSel) {
      m_pMolSel = pNewSel;
      invalidateDisplayCache();
    }

    ////

    void propChanged(qlib::LPropEvent &ev) override;

    /// object-changed event handler (for target mol changes in MOLFANC mode)
    void objectChanged(qsys::ObjectEvent &ev) override;

    /// scene-changed event handler (for target mol name resolution)
    void sceneChanged(qsys::SceneEvent &ev) override;

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
    ~MapSurfRenderer() override;

    ///////////////////////////////////////////

    const char *getTypeName() const override;

    //virtual void attachObj(qlib::uid_t obj_uid);
    void setSceneID(qlib::uid_t nid) override;

    qlib::uid_t detachObj() override;

    ///////////////////////////////////////////

    void render(DisplayContext *pdl) override;
    void preRender(DisplayContext *pdc) override;
    void postRender(DisplayContext *pdc) override;

    // virtual bool isTransp() const { return true; }

    ///////////////////////////////////////////////////////////////

    void viewChanged(qsys::ViewEvent &) override;

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
    // Vector4D getNormal(const Vector4D &rfNormal,bool,bool,bool);

    /// Coloring map object (for MULTIGRAD mode)
    qsys::ScalarObject *m_pColMapObj;

    qsys::MultiGradient *m_pGrad;

    /// Coloring target mol (for MOLFANC mode; only valid during rendering)
    MolCoordPtr m_pColMol;

    /// Nearest-atom map for MOLFANC coloring (only valid during rendering)
    molstr::AtomPosMap2 *m_pAtomPosMap;

    /// Resolve mol name, set m_nTgtMolID, listen the MolCoord events,
    /// and return the MolCoord object
    MolCoordPtr resolveMolIDImpl(const qlib::LString &name);

    void makeAtomPosMap();

    /// Get color of the nearest atom (v is in the orthogonal coordinates)
    bool getColorMol(const Vector4D &v, gfx::ColorPtr &rcol);

    void setVertexColor(DisplayContext *pdl, const Vector4D &rfPosition);

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

    void setupXformMat(DisplayContext *pdl);
    void setupXformMat();

  private:
    bool m_bGenSurfMode;

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

    int addMSVert(int ix, int iy, int iz, int nx, int ny, int nz)
    {
      return addMSVert(Vector4D(ix, iy, iz), Vector4D(nx, ny, nz));
    }

  public:    
    qsys::ObjectPtr generateSurfObj();

  };

}

#endif
