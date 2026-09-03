// -*-Mode: C++;-*-
//
// Scalar-field colouring shared by the surface renderers: the potential
// ramp (elepot + low/mid/high stops), the multi-gradient (color_mapname +
// multi_grad), and the ramp_above sampling offset both of them use.
//
// A host renderer inherits this next to its renderer base, redirects the
// scripting properties to the accessors below, and implements
// scalarColorPropChanged() to redraw when one of them changes.
//

#ifndef SURFACE_SCALAR_COLOR_SUPPORT_HPP
#define SURFACE_SCALAR_COLOR_SUPPORT_HPP

#include "surface.hpp"

#include <qlib/LString.hpp>
#include <qlib/Vector4D.hpp>
#include <gfx/SolidColor.hpp>
#include <qsys/qsys.hpp>
#include <qsys/MultiGradient.hpp>

namespace qsys { class ScalarObject; }

namespace surface {

  using qlib::LString;
  using qlib::Vector4D;
  using gfx::ColorPtr;

  class SURFACE_API ScalarColorSupport
  {
  public:
    /// Which scalar colouring a host's colour mode selects.
    enum ScalarMode {
      SCM_NONE = 0,
      SCM_RAMP = 1,
      SCM_MULTIGRAD = 2,
    };

    ScalarColorSupport();
    virtual ~ScalarColorSupport();

    //////////
    // potential (ramp) properties

    /// scalar object name used by the ramp (property "elepot")
    LString getTgtElePotName() const { return m_sTgtElePot; }
    void setTgtElePotName(const LString &n) {
      m_sTgtElePot = n;
      scalarColorPropChanged();
    }

    double getLowPar() const { return m_dParLow; }
    void setLowPar(double d) {
      m_dParLow = d;
      scalarColorPropChanged();
    }

    double getMidPar() const { return m_dParMid; }
    void setMidPar(double d) {
      m_dParMid = d;
      scalarColorPropChanged();
    }

    double getHighPar() const { return m_dParHigh; }
    void setHighPar(double d) {
      m_dParHigh = d;
      scalarColorPropChanged();
    }

    ColorPtr getLowCol() const { return m_colLow; }
    void setLowCol(const ColorPtr &rc) {
      m_colLow = rc;
      scalarColorPropChanged();
    }

    ColorPtr getMidCol() const { return m_colMid; }
    void setMidCol(const ColorPtr &rc) {
      m_colMid = rc;
      scalarColorPropChanged();
    }

    ColorPtr getHighCol() const { return m_colHigh; }
    void setHighCol(const ColorPtr &rc) {
      m_colHigh = rc;
      scalarColorPropChanged();
    }

    /// sample the field ramp_value above the surface (along the normal)
    bool isRampAbove() const { return m_bRampAbove; }
    void setRampAbove(bool val) {
      m_bRampAbove = val;
      scalarColorPropChanged();
    }

    double getRampValue() const { return m_dRampVal; }
    void setRampValue(double d) {
      m_dRampVal = d;
      scalarColorPropChanged();
    }

    //////////
    // multi-gradient properties

    qsys::MultiGradientPtr getMultiGrad() const { return m_pGrad; }
    void setMultiGrad(const qsys::MultiGradientPtr &val) {
      m_pGrad = val;
      scalarColorPropChanged();
    }

    /// scalar object name used by the multi-gradient (property "color_mapname");
    /// stored apart from elepot so a qsc load cannot wipe one with the other
    LString getColorMapName() const { return m_sColorMap; }
    void setColorMapName(const LString &n) {
      m_sColorMap = n;
      scalarColorPropChanged();
    }

    //////////
    // evaluation

    /// The scalar object name the given mode reads (empty for SCM_NONE).
    LString getScalarTargetName(ScalarMode mode) const;

    /// Look the mode's scalar object up in pScene; NULL when the name is
    /// empty, unknown, or not a scalar object. The scene owns the object.
    qsys::ScalarObject *resolveScalarObj(const qsys::ScenePtr &pScene,
                                         ScalarMode mode) const;

    /// The multi-gradient's map object (null when unset or not in pScene).
    qsys::ObjectPtr getColorMapObjImpl(const qsys::ScenePtr &pScene) const;

    /// Three-stop ramp: lowcol below lowpar, highcol above highpar,
    /// interpolated through midcol in between.
    ColorPtr rampColor(double par) const;

    /// Colour for a field value in the given mode (null for SCM_NONE).
    ColorPtr scalarColor(double par, ScalarMode mode) const;

    /// Where the field is sampled for a vertex: pos, or pos + norm * ramp_value.
    Vector4D samplePos(const Vector4D &pos, const Vector4D &norm) const;

    /// Colour for a vertex; false when there is no scalar object or mode.
    bool getScalarColor(const qsys::ScalarObject *pSca,
                        const Vector4D &pos, const Vector4D &norm,
                        ScalarMode mode, ColorPtr &rcol) const;

  protected:
    /// Called by every setter above; hosts redraw when a scalar mode is active.
    virtual void scalarColorPropChanged() = 0;

  private:
    LString m_sTgtElePot;
    double m_dParLow;
    double m_dParMid;
    double m_dParHigh;
    ColorPtr m_colLow;
    ColorPtr m_colMid;
    ColorPtr m_colHigh;
    bool m_bRampAbove;
    double m_dRampVal;
    qsys::MultiGradientPtr m_pGrad;
    LString m_sColorMap;
  };

}

#endif
