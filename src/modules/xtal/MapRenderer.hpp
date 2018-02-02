// -*-Mode: C++;-*-
//
// superclass of density-map renderers
//

#ifndef XTAL_MAP_RENDERER_HPP_INCLUDED
#define XTAL_MAP_RENDERER_HPP_INCLUDED

#include "xtal.hpp"

#include <qlib/Vector4D.hpp>
#include <gfx/gfx.hpp>
#include <gfx/AbstractColor.hpp>
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
    /// contour level in sigma scale
    double m_dSigLevel;

  public:
    double getSigLevel() const { return m_dSigLevel; }
    void setSigLevel(double value) {
      m_dSigLevel = value;
      invalidateDisplayCache();
    }

  private:
    /// display extent of the map (in angstrom unit)
    double m_dMapExtent;

  public:
    double getExtent() const { return m_dMapExtent; }
    void setExtent(double value) {
      m_dMapExtent = value;
      invalidateDisplayCache();
    }

  private:
    /// display color
    ColorPtr m_pcolor;

  public:
    /// display color
    void setColor(const ColorPtr &col) { m_pcolor = col; }
    const ColorPtr &getColor() const { return m_pcolor; }

  private:
    /// Periodic boundary flag
    ///  true: use PBC if map contains the entire of unit cell
    ///  false: always not use PBC (only show the original cell)
    bool m_bUsePBC;

  public:
    void setUsePBC(bool val) { m_bUsePBC = val; }
    bool isUsePBC() const { return m_bUsePBC; }


    ///////////////////////////////////////////
    // constructors / destructor

  public:

    /// default constructor
    MapRenderer();

    /// destructor
    virtual ~MapRenderer();

    // // TO DO: remove this
    // MapRenderer(const MapRenderer &) {}

    //////////////////////////////////////////////////////
    // Renderer implementation

    virtual bool isCompatibleObj(qsys::ObjectPtr pobj) const;

    virtual LString toString() const;

    // virtual void propChanged(qlib::LPropEvent &ev);

    ///////////////////////////////////////////

    double getLevel() const;
    void setLevel(double value);

    double getMaxLevel() const;
    double getMinLevel() const;

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

