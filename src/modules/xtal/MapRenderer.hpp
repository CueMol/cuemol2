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

namespace gfx {
  class DisplayContext;
}

namespace xtal {

using gfx::ColorPtr;
using qlib::Vector4D;

class XTAL_API MapRenderer : public qsys::DispListRenderer
{
  MC_SCRIPTABLE;

  typedef qsys::DispListRenderer super_t;

private:
  // properties
  
  //MCINFO: Vector4D m_center => center
  Vector4D m_center;

  //MCINFO: double m_siglevel => siglevel
  /// contour level in sigma scale
  double m_dSigLevel;

  /// display extent of the map (in angstrom unit)
  double m_dMapExtent;

  /// display color
  //MCINFO: LColor m_color => color
  ColorPtr m_pcolor;

public:

  ///////////////////////////////////////////
  // constructors / destructor

  /// default constructor
  MapRenderer();

  // TO DO: remove this
  MapRenderer(const MapRenderer &) {}

  /// destructor
  virtual ~MapRenderer();

  //////////////////////////////////////////////////////
  // Renderer implementation
  
  virtual bool isCompatibleObj(qsys::ObjectPtr pobj) const;
  
  virtual LString toString() const;
  
  // virtual void propChanged(qlib::LPropEvent &ev);
  
  ///////////////////////////////////////////

  /*
  /// attach DensityMap obj to this obj
  virtual bool setClientObj(MbObject *pobj);

  // renderer interfaces
  virtual void invalidateDisplayCache();

  virtual void display(DisplayContext *pdc);
   */

  ///////////////////////////////////////////////////////////////
  // setter/getter

  /** color */
  void setColor(const ColorPtr &col) { m_pcolor = col; }
  const ColorPtr &getColor() const { return m_pcolor; }

  /*
  void setColor(int nRed, int nGreen, int nBlue) {
    m_color.r(nRed);
    m_color.g(nGreen);
    m_color.b(nBlue);
  }

  void getColor(int &nRed, int &nGreen, int &nBlue) const {
    nRed = m_color.r(); nGreen = m_color.g(); nBlue = m_color.b();
  }
  void setTransp(int tp) { m_color.a(tp); }
  int getTransp() const { return m_color.a(); }
   */


  double getExtent() const { return m_dMapExtent; }
  void setExtent(double value) {
    m_dMapExtent = value;
    invalidateDisplayCache();
  }

  double getSigLevel() const { return m_dSigLevel; }
  void setSigLevel(double value) {
    m_dSigLevel = value;
    invalidateDisplayCache();
  }

  double getLevel() const;
  void setLevel(double value);

  double getMaxLevel() const;
  double getMinLevel() const;


  /*void setCenter(double centx, double centy, double centz) {
    m_center.x() = centx;
    m_center.y() = centy;
    m_center.z() = centz;
  }*/

  void setCenter(const Vector4D &v) {
    m_center = v;
    invalidateDisplayCache();
  }

  virtual Vector4D getCenter() const {
    return m_center;
  }


  /*
  virtual double getMaxRange() const =0;
  virtual void render(DisplayCommand *pdl) =0;
  virtual void preRender(DisplayContext *pdc) =0;
  virtual void postRender(DisplayContext *pdc) =0;
   */
};

}

#endif

