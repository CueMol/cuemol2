// -*-Mode: C++;-*-
//
//  Solid RGBA color class
//

#ifndef GFX_SOLID_COLOR_HPP_INCLUDE_
#define GFX_SOLID_COLOR_HPP_INCLUDE_

#include "gfx.hpp"
#include "AbstractColor.hpp"

using qlib::LString;

namespace qlib {
  class Vector4D;
}

namespace gfx {

  ///
  /// Solid RGBA/HSBA color class
  ///
  class GFX_API SolidColor : public AbstractColor
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

  private:
    mutable quint32 m_code;

    int m_nMode;

    // /// Cache validity flag for named color
    // mutable bool m_bNamedColCache;

    /// Name of material (empty means default material)
    LString m_material;

  public:
    enum {
      CM_RGB,
      CM_HSB,
      CM_CMYK
    };

  public:
    SolidColor();
    SolidColor(const SolidColor &r);

    SolidColor(unsigned int c);
    SolidColor(int r, int g, int b);
    SolidColor(int r, int g, int b, int a);
    SolidColor(double r, double g, double b);
    SolidColor(double r, double g, double b, double a);
    SolidColor(const qlib::Vector4D &v);
    // SolidColor(const LString &name);

    ~SolidColor() override;
    
    /// = operator
    const SolidColor &operator=(const SolidColor &r);

    ///////////////////////////
    // Common access interfaces

    int r() const override;
    int g() const override;
    int b() const override;
    int a() const override;

    quint32 getCode() const override;

    LString getMaterial() const override;
    
    bool equals(const AbstractColor &c) const override;
    
    ///////////////////////////

    void setCode(unsigned int);
    void setR(int r);
    void setG(int r);
    void setB(int r);
    void setA(int r);

    void setAlpha(double alpha) {
      //setA(int(alpha * 255.0 + 0.5));
      setA( convF2I(alpha) );
    }

    double getAlpha() const {
      //return double( a()/255.0 );
      return convI2F( a() );
    }

    void setMaterial(const LString &mat)
    {
      // if (!m_material.isEmpty())
      // LOG_DPRINTLN("SolidColor> material %s is overwritten by %s.", m_material.c_str(), mat.c_str());
      m_material = mat;
    }

    void setRGBA(double R, double G, double B, double A=1.0);
    void setHSBA(double H, double S, double B, double A=1.0);

    ///////////////////////////

    static qlib::LScrSp<SolidColor> createRGB(double R, double G, double B, double A=1.0);

    static qlib::LScrSp<SolidColor> createHSB(double H, double S, double B, double A=1.0);
    static SolidColor *createRawHSB(double H, double S, double B, double A=1.0);

    ////////////

    bool isStrConv() const override;
    LString toString() const override;

  private:
    // void updateNamedColor() const;

  };

}

#endif // GFX_COLOR_HPP_INCLUDE_

