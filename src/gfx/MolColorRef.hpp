// -*-Mode: C++;-*-
//
//  Special color object for molcolor reference impl.
//

#ifndef GFX_MOL_COLOR_REF_HPP_INCLUDE_
#define GFX_MOL_COLOR_REF_HPP_INCLUDE_

#include "gfx.hpp"
#include "AbstractColor.hpp"

using qlib::LString;

namespace gfx {

  ///
  ///   Special color object for molcolor reference impl.
  ///
  class GFX_API MolColorRef : public AbstractColor
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    typedef AbstractColor super_t;

  public:
    MolColorRef()
    {
      m_alpha = -1.0;
      m_dModHue = 0.0;
      m_dModSat = 0.0;
      m_dModBri = 0.0;
    }
    MolColorRef(const MolColorRef &r)
    {
      m_alpha = r.m_alpha;
      m_dModHue = r.m_dModHue;
      m_dModSat = r.m_dModSat;
      m_dModBri = r.m_dModBri;
      m_material = r.m_material;
    }

    ~MolColorRef() override {}
    
    /// = operator
    const MolColorRef &operator=(const MolColorRef &r) {
      if(&r!=this){
        m_alpha = r.m_alpha;
        m_dModHue = r.m_dModHue;
        m_dModSat = r.m_dModSat;
        m_dModBri = r.m_dModBri;
        m_material = r.m_material;
      }
      return *this;
    }

    ///////////////////////////
    // Common access interfaces

    int r() const override { return 0x7F; }
    int g() const override { return 0x7F; }
    int b() const override { return 0x7F; }
    int a() const override { return 0x7F; }

    quint32 getCode() const override { return 0x7F7F7F7F; }

    LString getMaterial() const override { return m_material; }
    
    bool equals(const AbstractColor &c) const override;
    
    bool isStrConv() const override {
      return true;
    }
    LString toString() const override;

    ColorPtr modifyColor(const ColorPtr &pCol) const;

  private:
    ///////////////////////////
    // properties

    /// overrided material name
    LString m_material;

    /// overrided transparency
    double m_alpha;
    
    /// modification by HSB model
    double m_dModHue;
    double m_dModSat;
    double m_dModBri;

  public:
    
    void setMaterial(const LString &mat) { m_material = mat; }

    void setAlpha(double val) { m_alpha = val; }
    double getAlpha() const { return m_alpha; }

    void setModHue(double val) { m_dModHue = val; }
    double getModHue() const { return m_dModHue; }

    void setModSat(double val) { m_dModSat = val; }
    double getModSat() const { return m_dModSat; }

    void setModBri(double val) { m_dModBri = val; }
    double getModBri() const { return m_dModBri; }

    bool isAlphaSet() const;
    
    bool isModSet() const;

  };

}

#endif // GFX_COLOR_HPP_INCLUDE_

