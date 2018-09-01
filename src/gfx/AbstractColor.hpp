// -*-Mode: C++;-*-
//
//  Abstract color class
//
// $Id: AbstractColor.hpp,v 1.10 2010/12/25 13:13:21 rishitani Exp $

#ifndef GFX_ABST_COLOR_HPP_INCLUDE_
#define GFX_ABST_COLOR_HPP_INCLUDE_

#include "gfx.hpp"

#include <qlib/LString.hpp>
#include <qlib/LTypes.hpp>
#include <qlib/LScrObjects.hpp>
#include <qlib/LScrSmartPtr.hpp>
#include <qlib/mcutils.hpp>

using qlib::LString;

namespace gfx {

  QM_USING_QTYPES;

  inline double convB2F(qlib::qbyte color) {
    return double(color)/255.0;
  }
  inline double convI2F(int color) {
    return double(color)/255.0;
  }
  inline int convF2I(double color) {
    return int(color * 255.0 + 0.5);
  }
  

  ///
  /// Abstract color class
  ///
  class GFX_API AbstractColor : public qlib::LSimpleCopyScrObject
  {
    MC_SCRIPTABLE;

    typedef qlib::LSimpleCopyScrObject super_t;

  public:
    AbstractColor()
    {
    }

    AbstractColor(const AbstractColor &r)
         : qlib::LSimpleCopyScrObject()
    {
    }

    virtual ~AbstractColor();
  
    ///////////////////////////
    // Common access interfaces

    virtual qlib::quint32 getCode() const =0;
    
    virtual LString getMaterial() const =0;

    virtual bool equals(const AbstractColor &c) const =0;
    
    // these methods have default implementation to use getCode() method,
    // but can be overloaded for performance
    virtual int r() const;
    virtual int g() const;
    virtual int b() const;
    virtual int a() const;

    // access interface for the rendering device

    /// Get color after conversion for proofing
    virtual qlib::quint32 getDevCode(qlib::uid_t ctxtid) const;

    /// check if the color is in the gamut of the current proofing profile
    virtual bool isInGamut(qlib::uid_t ctxtid) const;

    ///////////////////////////

    double fr() const {
      return convI2F(r());
    }
    
    double fg() const {
      return convI2F(g());
    }
    
    double fb() const {
      return convI2F(b());
    }
    
    double fa() const {
      return convI2F(a());
    }

    ////////////////////////////////////////////
    // Utilities
    
    void getHSB (double &hue, double &sat, double &bri) const {
      RGBtoHSB(r(), g(), b(), hue, sat, bri);
    }

    static qlib::quint32 HSBtoRGB(double hue, double saturation, double brightness);
    
    static void HSBtoRGB(double hue, double saturation, double brightness,
                         double &r, double &g, double &b);
    
    static void RGBtoHSB(int r, int g, int b,
                         double &hue, double &saturation, double &brightness);
    ////////////

    // virtual bool fromString(const LString &src);
    // virtual LString toString() const;

    typedef boost::true_type has_fromString;
    static AbstractColor *fromStringS(const LString &aStr);
    static AbstractColor *fromNode(qlib::LDom2Node *);
    
    LString makeModifFromProps(bool bIgnoreAlpha=false) const;

  };

  inline quint32 makeRGBACode(int r, int g, int b, int a) {
    return (((a & 0xFF) << 24) |
            ((r & 0xFF) << 16) |
            ((g & 0xFF) << 8)  |
            ((b & 0xFF) << 0));
  }
  
  inline qbyte getRCode(quint32 color) {
      return (color >> 16) & 0xFF;
  }
  inline qbyte getGCode(quint32 color) {
    return (color >> 8) & 0xFF;
  }
  inline qbyte getBCode(quint32 color) {
    return (color >> 0) & 0xFF;
  }
  inline qbyte getACode(quint32 color) {
    return (color >> 24) & 0xff;
  }
  
  inline double getFR(quint32 color) {
    return convB2F( getRCode(color) );
  }

  inline double getFG(quint32 color) {
    return convB2F( getGCode(color) );
  }
  
  inline double getFB(quint32 color) {
    return convB2F( getBCode(color) );
  }
  
  inline double getFA(quint32 color) {
    return convB2F( getACode(color) );
  }

  inline quint32 mixAlpha(quint32 ccode, double alpha)
  {
    int r = gfx::getRCode(ccode);
    int g = gfx::getGCode(ccode);
    int b = gfx::getBCode(ccode);
    int a = gfx::getACode(ccode);
    int aa = int( double(a) * alpha );
    return makeRGBACode(r,g,b,aa);

  }

}

#endif // GFX_COLOR_HPP_INCLUDE_
