// -*-Mode: C++;-*-
//
// superclass of density-map renderers
//

#ifndef XTAL_MAP_RENDERER_HPP_INCLUDED
#define XTAL_MAP_RENDERER_HPP_INCLUDED

#include "xtal.hpp"

#include <qlib/Vector4D.hpp>
#include <qlib/Utils.hpp>
#include <gfx/gfx.hpp>
#include <gfx/AbstractColor.hpp>
#include <qsys/MultiGradient.hpp>
#include <qsys/DispListRenderer.hpp>
#include <qsys/ScalarObject.hpp>

#include <modules/molstr/molstr.hpp>
#include <modules/molstr/Selection.hpp>
#include <modules/molstr/BSPTree.hpp>

namespace gfx {
  class DisplayContext;
}

namespace xtal {

  using gfx::ColorPtr;
  using qlib::Vector4D;
  using qsys::ScalarObject;
  using molstr::SelectionPtr;
  using molstr::MolCoordPtr;
  using molstr::BSPTree;

  class XTAL_API MapRenderer : public qsys::DispListRenderer
  {
    MC_SCRIPTABLE;

    typedef qsys::DispListRenderer super_t;

    ///////////////////////////////////////////////////////////////
    // properties, setter/getter

  protected:
    /// Invalidation hook for geometry-affecting properties (center, level,
    /// extent, PBC, boundary). The default is a plain display-cache
    /// invalidation (the historical behavior for all map renderers);
    /// subclasses keeping a persistent geometry cache override this to also
    /// drop that cache.
    virtual void invalidateGeomCache() {
      invalidateDisplayCache();
    }

  private:
    /// center of the display extent
    Vector4D m_center;

  public:
    void setCenter(const Vector4D &v) {
      // Skip the rebuild when the center is numerically unchanged; the view
      // fires a "center" prop change with the same value on every pan
      // mouse-up, which otherwise forces a full (and identical) rebuild.
      if (m_center.equals(v))
        return;
      m_center = v;
      invalidateGeomCache();
    }

    Vector4D getCenter() const override {
      return m_center;
    }

    /// Set the center without invalidating the geometry (full region mode
    /// keeps the center property following the view for a later switch to
    /// box mode, while the marched region is driven by the view box).
    void setCenterQuiet(const Vector4D &v) {
      m_center = v;
    }

  private:
    /// contour level in sigma scale
    double m_dSigLevel;

  public:
    double getSigLevel() const { return m_dSigLevel; }
    void setSigLevel(double value) {
      if (qlib::isNear4(value, m_dSigLevel))
        return;
      m_dSigLevel = value;
      invalidateGeomCache();
    }

    /////////

  private:
    /// display extent of the map (in angstrom unit)
    double m_dMapExtent;

  public:
    double getExtent() const { return m_dMapExtent; }
    void setExtent(double value) {
      if (qlib::isNear4(value, m_dMapExtent))
        return;
      m_dMapExtent = value;
      invalidateGeomCache();
    }

    //////////////////

  private:
    /// display color
    ColorPtr m_pcolor;

  public:
    /// display color
    void setColor(const ColorPtr &col) {
      m_pcolor = col;
      invalidateDisplayCache();
    }
    const ColorPtr &getColor() const { return m_pcolor; }

    //////////////////

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

    //////////////////

  private:
    /// Periodic boundary flag
    ///  true: use PBC if map contains the entire of unit cell
    ///  false: always not use PBC (only show the original cell)
    bool m_bUsePBC;

  public:
    void setUsePBC(bool val) {
      if (m_bUsePBC == val)
        return;
      m_bUsePBC = val;
      invalidateGeomCache();
    }
    bool isUsePBC() const { return m_bUsePBC; }

    //////////////////

  public:
    /// Display region policy (region_mode property values)
    enum {
      REGION_AUTO = 0,
      REGION_BOX = 1,
      REGION_FULL = 2,
    };

  private:
    /// Display region policy (REGION_*). AUTO resolves to FULL for cryo-EM
    /// maps and to BOX (center +- extent, the historical behavior) for
    /// everything else.
    int m_nRegionMode;

  public:
    int getRegionMode() const { return m_nRegionMode; }
    void setRegionMode(int n) {
      if (m_nRegionMode == n)
        return;
      m_nRegionMode = n;
      invalidateGeomCache();
    }

    /// Effective region policy (REGION_BOX or REGION_FULL). Resolved at
    /// render time: the map kind is only known after the reader ran, which
    /// happens after the renderer properties are deserialized.
    int getEffectiveRegionMode() const;

    /// Effective region policy as a string ("box" or "full")
    LString getRegionModeResolvedStr() const;

    /// Periodic-boundary eligibility of the current display: pMap must be a
    /// periodic (crystallographic) DensityMap whose stored block spans the
    /// whole cell (bSpansCell, computed by the caller from the grid size),
    /// use_pbc must be on, and the effective region policy must not be FULL.
    bool isPBCEligible(const ScalarObject *pMap, bool bSpansCell) const;


  private:
    /// Absolute contour level flag
    ///  This flag has no effect on the renderers behaviour.
    ///  (UI should change behaviour based on the value of this flag)
    bool m_bUseAbsLev;

  public:
    void setUseAbsLev(bool val) { m_bUseAbsLev = val; }
    bool isUseAbsLev() const { return m_bUseAbsLev; }

    //////////////////

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

    ///////////////////////////////////////////
    // constructors / destructor

  public:

    /// default constructor
    MapRenderer();

    /// destructor
    ~MapRenderer() override;

    // // TO DO: remove this
    // MapRenderer(const MapRenderer &) {}

    //////////////////////////////////////////////////////
    // Renderer implementation

    bool isCompatibleObj(qsys::ObjectPtr pobj) const override;

    LString toString() const override;

    void propChanged(qlib::LPropEvent &ev) override;

    /// object-changed event handler (map_type changes of the client map)
    void objectChanged(qsys::ObjectEvent &ev) override;

    ///////////////////////////////////////////

    double getLevel() const;
    void setLevel(double value);

    double getMaxLevel() const;
    double getMinLevel() const;

    ScalarObject *getScalarObj() const
    {
      MapRenderer *pthis = const_cast<MapRenderer *>(this);
      return static_cast<ScalarObject *>( pthis->getClientObj().get() );
    }

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

    /// Bounding box of the boundary atoms (world coordinates; valid while
    /// m_bUseMolBndry and at least one atom was found)
    bool m_bBndryBBox;
    Vector4D m_vBndryMin, m_vBndryMax;

  public:
    void setupMolBndry();

    bool isUseMolBndry() const { return m_bUseMolBndry; }

    /// Bounding box of the boundary atoms, expanded by the boundary range
    /// (world coordinates). Returns false when no boundary is in effect.
    bool getBndryBBox(Vector4D &rmin, Vector4D &rmax) const {
      if (!m_bUseMolBndry || !m_bBndryBBox)
        return false;
      const Vector4D d(m_dBndryRng, m_dBndryRng, m_dBndryRng);
      rmin = m_vBndryMin - d;
      rmax = m_vBndryMax + d;
      return true;
    }

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

