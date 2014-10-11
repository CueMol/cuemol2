// -*-Mode: C++;-*-
//
//  Gradient color class
//

#ifndef GFX_GRADIENT_COLOR_HPP_INCLUDE_
#define GFX_GRADIENT_COLOR_HPP_INCLUDE_

#include "gfx.hpp"
#include "AbstractColor.hpp"

using qlib::LString;

namespace qlib {
  class Vector4D;
}

namespace gfx {

  ///
  //   Gradient color class
  //
  class GFX_API GradientColor : public AbstractColor
  {
    // MC_SCRIPTABLE;
    MC_CLONEABLE;

  private:
    /// 1st color
    ColorPtr m_pColor1;

    /// 2nd color
    ColorPtr m_pColor2;

    /// Gradient parameter
    double m_rho;

  public:
    GradientColor();
    GradientColor(const GradientColor &r);

    GradientColor(ColorPtr pc1, ColorPtr pc2, double par);
    // GradientColor(const AbstractColor &c1, const AbstractColor &c2, double par);

    virtual ~GradientColor();
    
    /// = operator
    const GradientColor &operator=(const GradientColor &r);

    ///////////////////////////
    // AbstractColor implementations

    virtual int r() const;
    virtual int g() const;
    virtual int b() const;
    virtual int a() const;

    virtual quint32 getCode() const;
    
    virtual LString getMaterial() const;

    virtual bool equals(const AbstractColor &c) const;
    
    ////////////
    // Simple copy obj implementation

    virtual bool isStrConv() const;
    virtual LString toString() const;

    ///////////////////////////
    // special access methods

    // bool isGradient() const;

    ColorPtr getGradColor1() const { return m_pColor1; }
    ColorPtr getGradColor2() const { return m_pColor2; }
    double getGradParam() const { return m_rho; }
    
    void setGradColor(ColorPtr pc1, ColorPtr pc2) {
      m_pColor1 = pc1;
      m_pColor2 = pc2;
    }
    void setGradParam(double par) { m_rho = par; }
  };

}

#endif // GFX_COLOR_HPP_INCLUDE_
