// -*-Mode: C++;-*-
//
//  unit-cell renderer class
//

#ifndef SYMM_UNIT_CELL_RENDERER_HPP
#define SYMM_UNIT_CELL_RENDERER_HPP

#include "symm.hpp"

#include <qsys/DispListRenderer.hpp>
#include <gfx/SolidColor.hpp>

namespace symm {
  
using gfx::ColorPtr;
using gfx::DisplayContext;

class SYMM_API UnitCellRenderer : public qsys::DispListRenderer
{
  MC_SCRIPTABLE;
  MC_CLONEABLE;

  typedef qsys::DispListRenderer super_t;

private:

  //////////////////////////////////////////////////////
  // properties

  /// Line width (pixel)
  double m_linew;

  /// Line color
  ColorPtr m_color;

  /// Label color
  ColorPtr m_labcol;

  //////////////////////////////////////////////////////
  // work area



  
  //////////////////////////////////////////////////////

public:
  UnitCellRenderer();
  virtual ~UnitCellRenderer();

  //////////////////////////////////////////////////////

  virtual bool isCompatibleObj(qsys::ObjectPtr pobj) const;
  virtual LString toString() const;
  virtual const char *getTypeName() const;

  virtual void preRender(DisplayContext *pdc);
  virtual void postRender(DisplayContext *pdc);
  virtual void render(DisplayContext *pdl);
  virtual bool isHitTestSupported() const;

  virtual qlib::Vector4D getCenter() const;

  //////////////////////////////////////////////////////

  double getLineWidth() const { return m_linew; }
  void setLineWidth(double v) {
    m_linew = v;
    super_t::invalidateDisplayCache();
  }

  ColorPtr getColor() const { return m_color; }
  void setColor(const ColorPtr &col) {
    m_color = col;
    super_t::invalidateDisplayCache();
  }

  ColorPtr getLabelColor() const { return m_labcol; }
  void setLabelColor(const ColorPtr &col) {
    m_labcol = col;
    super_t::invalidateDisplayCache();
  }

private:

};

}

#endif
