// -*-Mode: C++;-*-
//
//  Color definition compiler class
//

#ifndef GFX_COLOR_COMPILER_HPP_INCLUDED_
#define GFX_COLOR_COMPILER_HPP_INCLUDED_

#include "gfx.hpp"

#include <qlib/LString.hpp>
#include <qlib/Vector4D.hpp>
#include <qlib/MapTable.hpp>
#include <qlib/SingletonBase.hpp>

#define YY_NO_UNISTD_H

namespace gfx {

using qlib::LString;
using qlib::Vector4D;

class ColCompiler : public qlib::SingletonBase<ColCompiler>
{

public:
  ColCompiler();
  ~ColCompiler();
  
  AbstractColor *compile(const LString &str);

  static AbstractColor *compileS(const LString &str) {
    return getInstance()->compile(str);
  }
  
  /////////////////////////////////////

private:
  enum {
    CC_MODE_NAMED,
    CC_MODE_HSB,
    CC_MODE_RGB,
    CC_MODE_RGBHEX,
    CC_MODE_CMYK,
    CC_MODE_MOLCOL
  };

  int m_nMode;

  LString m_material;
  double m_alpha;

  LString m_name;

  unsigned int m_nRGBHex;

  Vector4D m_vecval;

  qlib::MapTable<LString> m_defs;

public:
  void setNamedColor(const char *name) {
    // MB_DPRINTLN("CC> NamedColor %s", name);
    m_nMode = CC_MODE_NAMED;
    m_name = name;
  }
  void setMolColor() {
    // MB_DPRINTLN("CC> NamedColor %s", name);
    m_nMode = CC_MODE_MOLCOL;
  }
  void setRGBHexColor(unsigned int val) {
    // MB_DPRINTLN("CC> RGBHexColor %X", val);
    m_nMode = CC_MODE_RGBHEX;
    m_nRGBHex = val;
  }
  void setRGBColor(double r, double g, double b) {
    // MB_DPRINTLN("CC> RGBColor %f,%f,%f", r, g, b);
    m_nMode = CC_MODE_RGB;
    m_vecval = Vector4D(r, g, b);
  }
  void setHSBColor(double h, double s, double b) {
    // MB_DPRINTLN("CC> HSBColor %f,%f,%f", h, s, b);
    m_nMode = CC_MODE_HSB;
    m_vecval = Vector4D(h, s, b);
  }
  void setCMYKColor(double c, double m, double y, double k) {
    // MB_DPRINTLN("CC> CMYKColor %f,%f,%f,%f", c, m, y, k);
    m_nMode = CC_MODE_CMYK;
    m_vecval = Vector4D(c, m, y, k);
  }

  void setAlpha(double a) {
    m_alpha = a;
  }

  void defModif(const char *key, const char *value) {
    // MB_DPRINTLN("DefModif (%s, %s)", key, value);
    m_defs.set(key, value);
  }

  /////////////////////////////////////

  int feedInput(char *buf, int nmax);
  
  static void setModifState();
  static void setInitState();

private:
  char *m_sbuf;
  int m_nsize;
  
  int yyparse_wrapper();
  static void resetScannerState();
  static void resetParserState();
  
};

}

SINGLETON_BASE_DECL(gfx::ColCompiler);

#endif
