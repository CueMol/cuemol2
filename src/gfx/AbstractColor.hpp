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

  /**
     Abstract color class
  */
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

    virtual int r() const =0;
    virtual int g() const =0;
    virtual int b() const =0;
    virtual int a() const =0;

    virtual quint32 getCode() const =0;
    
    virtual LString getMaterial() const =0;

    virtual bool equals(const AbstractColor &c) const =0;
    
    ///////////////////////////

    double fr() const {
      return double(r())/255.0;
    }
    
    double fg() const {
      return double(g())/255.0;
    }
    
    double fb() const {
      return double(b())/255.0;
    }
    
    double fa() const {
      return double(a())/255.0;
    }

    ////////////////////////////////////////////
    // Utilities
    
    void getHSB (double &hue, double &sat, double &bri) const {
      RGBtoHSB(r(), g(), b(), hue, sat, bri);
    }

    static quint32 HSBtoRGB(double hue, double saturation, double brightness);
    
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
    
    LString makeModifFromProps() const;

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

  inline quint32 mixAlpha(quint32 ccode, double alpha)
  {
	  int r = gfx::getRCode(ccode);
	  int g = gfx::getGCode(ccode);
	  int b = gfx::getBCode(ccode);
	  int a = gfx::getACode(ccode);
    int aa = double(a) * alpha;
    return makeRGBACode(r,g,b,aa);

  }

}

#endif // GFX_COLOR_HPP_INCLUDE_
