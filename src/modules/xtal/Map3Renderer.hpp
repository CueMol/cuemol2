// -*-Mode: C++;-*-
//
// Superclass of density-map renderers (ver. 3)
//

#ifndef XTAL_MAP3_RENDERER_HPP_INCLUDED
#define XTAL_MAP3_RENDERER_HPP_INCLUDED

#include "xtal.hpp"

#include <qlib/Vector4D.hpp>
//#include <qlib/Vector3I.hpp>
//#include <qlib/Vector3F.hpp>

#include <gfx/gfx.hpp>
#include <gfx/AbstractColor.hpp>

#include <qsys/DispListRenderer.hpp>
#include <qsys/ScalarObject.hpp>
#include <qsys/ViewEvent.hpp>

#include <modules/molstr/molstr.hpp>
#include <modules/molstr/Selection.hpp>
#include <modules/molstr/BSPTree.hpp>

namespace gfx {
  class DisplayContext;
}

namespace xtal {

  using qlib::Vector3I;
  using qlib::Vector3F;
  using qlib::Vector4D;
  using gfx::ColorPtr;
  using qsys::ScalarObject;
  using molstr::SelectionPtr;
  using molstr::MolCoordPtr;
  using molstr::BSPTree;

  class XTAL_API Map3Renderer : public qsys::DispListRenderer,
                                public qsys::ViewEventListener
  {
    MC_SCRIPTABLE;

    typedef qsys::DispListRenderer super_t;

    ///////////////////////////////////////////////////////
    //
    // Properties, setter/getter
    //

  private:
    /// center of the display extent
    Vector4D m_center;

  public:
    void setCenter(const Vector4D &v) {
      m_center = v;
      invalidateDisplayCache();
    }

    virtual Vector4D getCenter() const {
      return m_center;
    }

  private:
    /// contour level in sigma unit
    double m_dSigLevel;

  public:
    double getSigLevel() const { return m_dSigLevel; }
    void setSigLevel(double value) {
      m_dSigLevel = value;
      invalidateDisplayCache();
    }

    double getLevel() const;
    void setLevel(double value);

    double getMaxLevel() const;
    double getMinLevel() const;

    /////////

  private:
    /// display extent of the map (in angstrom unit)
    double m_dMapExtent;

  public:
    double getExtent() const { return m_dMapExtent; }
    void setExtent(double value) {
      m_dMapExtent = value;
      invalidateDisplayCache();
    }

    /////////

  private:
    /// display color
    ColorPtr m_pcolor;

  public:
    /// display color
    void setColor(const ColorPtr &col) { m_pcolor = col; }
    const ColorPtr &getColor() const { return m_pcolor; }

    /////////

  private:
    /// Coloring mode
    int m_nMode;

  public:
    enum {
      MAPREND_SIMPLE = 0,
      MAPREND_MOLFANC = 3,
      MAPREND_MULTIGRAD = 4,
    };

    int getColorMode() const { return m_nMode; }
    void setColorMode(int n) {
      m_nMode = n;
      invalidateDisplayCache();
    }

    /////////

  private:
    /// Periodic boundary flag
    ///  true: use PBC, if map contains the entire of unit cell
    ///  false: always not use PBC (only show the original cell)
    bool m_bUsePBC;

  public:
    void setUsePBC(bool val) {
      m_bUsePBC = val;
      invalidateDisplayCache();
    }
    bool isUsePBC() const { return m_bUsePBC; }

    /////////

  private:
    /// Max grid size (default=100x100x100 grid)
    int m_nMaxGrid;

  public:
    int getMaxGrids() const { return m_nMaxGrid; }
    void setMaxGrids(int n) { m_nMaxGrid = n; }

    /// Get max extent (in angstrom unit; calculated from m_nMaxGrid)
    double getMaxExtent() const;

    /////////

    /// Automatically update the map center as view center
    /// (default: true)
  private:
    bool m_bAutoUpdate;

  public:
    bool isAutoUpdate() const { return m_bAutoUpdate; }
    void setAutoUpdate(bool b) { m_bAutoUpdate = b; }

    /////////

    /// Automatically update the map center as view center
    /// in both mouse-drag and mouse-up events
    /// (default: false)
  private:
    bool m_bDragUpdate;

  public:
    bool isDragUpdate() const { return m_bDragUpdate; }
    void setDragUpdate(bool b) { m_bDragUpdate = b; }

  private:
    /// Absolute contour level flag
    ///  This flag has no effect on the renderers behaviour.
    ///  (UI should change behaviour based on the value of this flag)
    bool m_bUseAbsLev;

  public:
    void setUseAbsLev(bool val) { m_bUseAbsLev = val; }
    bool isUseAbsLev() const { return m_bUseAbsLev; }


  private:
    /// Multi gradient data
    qsys::MultiGradientPtr m_pGrad;

  public:
    qsys::MultiGradientPtr getMultiGrad() const {
      return m_pGrad;
    }

    void setMultiGrad(const qsys::MultiGradientPtr &val) {
      m_pGrad = val;
    }

  private:
    /// Scalar field object name by which painting color is determined.
    /// (used in MULTIGRAD mode)
    LString m_sColorMap;

  public:
    /// reference coloring map target (used in MULTIGRAD mode)
    LString getColorMapName() const { return m_sColorMap; }
    void setColorMapName(const LString &n) {
      m_sColorMap = n;
      invalidateDisplayCache();
    }

    /// get color-map object (valid in MULTIGRAD mode)
    qsys::ObjectPtr getColorMapObj() const;

    ///////////////////////////////////////////////////////
    // Workarea (for derived classes MapMesh, MapSurf, etc)
    
  protected:

    /// Periodic boundary availability flag
    /// (This flag is set true, when PBC is available,
    ///   i.e., map contains the entire of unit cell)
    bool m_bPBC;

    /// Size of map (in grid unit/copy of Map's property)
    Vector3I m_mapSize;

    const Vector3I &getMapSize() const { return m_mapSize; }

    /// Actual size of display extent (in grid unit)
    Vector3I m_dspSize;

    const Vector3I &getDspSize() const { return m_dspSize; }

    /// Start position of display extent from global origin (in grid unit)
    Vector3I m_glbStPos;

    const Vector3I &getGlbStPos() const { return m_glbStPos; }

    /// Start position of display extent from map origin (in grid unit)
    Vector3I m_mapStPos;

    const Vector3I &getMapStPos() const { return m_mapStPos; }

    /// Level in 8-bit map unit
    qbyte m_nIsoLevel;

    /// Calculate 8-bit contour level
    void calcContLevel(ScalarObject *pMap);

    /// Calculate map display extent
    void calcMapDispExtent(ScalarObject *pMap);

    /// Calc coord xform mat for map rendering (grid-->world)
    /// @param bTrGlbPos apply getGlbStPos() translation to the matrix, if bTrGlbPos is true (default)
    Matrix4D calcXformMat(ScalarObject *pMap, DensityMap *pXtal, bool bTrGlbPos=true);

    /// Calc normal xform mat for map rendering (grid-->world)
    Matrix4D calcNormMat(ScalarObject *pMap, DensityMap *pXtal);

    /// Calc coord xform (grid-->world) & set to the display context
    void setupXform(gfx::DisplayContext *pdc, ScalarObject *pMap, DensityMap *pXtal, bool bTrGlbPos=true);

    ///////////////////////////////////////////
    // constructors / destructor

  public:

    /// default constructor
    Map3Renderer();

    /// destructor
    virtual ~Map3Renderer();

    //////////////////////////////////////////////////////
    // Renderer implementation

    virtual bool isCompatibleObj(qsys::ObjectPtr pobj) const;

    virtual LString toString() const;

    //////////////////////////////////////////////////////
    // Ver2 interface (for VBO/GLSL)

    // virtual void createDisplayCache();

    
    //////////////////////////////////////////////////////
    // Map3 interface (for VBO/GLSL)

    /// Create data structure for CPU rendering
    // virtual void createCPU() {}
    
    /// Create data structure for GPU rendering
    // virtual void createGPU() {}

    /// Update data structure for CPU rendering
    // virtual void updateCPU() {}

    /// Update data structure for GPU rendering
    // virtual void updateGPU() {}


    //////////////////////////////////////////////////////
    // Event handlers

    /// Property change handler (contour level, extent, etc)
    virtual void propChanged(qlib::LPropEvent &ev);

    // /// Object change handler (map sharpening, etc)
    // virtual void objectChanged(qsys::ObjectEvent &ev);

    /// View change handler (map center, etc)
    virtual void viewChanged(qsys::ViewEvent &);


    ///////////////////////////////////////////////////////////////
    // MolBoundary properties/implementation

  public:
    LString getBndryMolName() const { return m_strBndryMol; }
    void setBndryMolName(const LString &s);

    SelectionPtr getBndrySel() const { return m_pSelBndry; }
    void setBndrySel(const SelectionPtr &pSel);

    double getBndryRng() const { return m_dBndryRng; }
    void setBndryRng(double d);

  private:

    /// Boundary target mol name
    LString m_strBndryMol;

    /// Selection for mol boundary
    SelectionPtr m_pSelBndry;

    bool m_bUseMolBndry;

    BSPTree<int> m_boundary;

    double m_dBndryRng;

  public:
    bool isUseMolBndry() const { return m_bUseMolBndry; }

    void setupMolBndry();
    
    bool inMolBndry(ScalarObject *pMap, int nx, int ny, int nz) const
    {
      if (!m_bUseMolBndry)
        return true;
      Vector4D tv(nx, ny, nz);
      tv = pMap->convToOrth(tv);
      if (!m_boundary.collChk(tv, m_dBndryRng))
        return false;
      return true;
    }
  

  };

}

#endif

