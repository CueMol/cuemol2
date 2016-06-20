// -*-Mode: C++;-*-
//
// Material definition for StyleManager
//

#ifndef GFX_MATERIAL_HPP_INCLUDED
#define GFX_MATERIAL_HPP_INCLUDED

#include "gfx.hpp"

#include <qlib/Vector4D.hpp>
#include <qlib/MapTable.hpp>

namespace qlib {
  class PrintStream;
  class InStream;
  class OutStream;
  class LDom2Node;
}

namespace gfx {

using qlib::LString;
using qlib::Vector4D;
using qlib::LDom2Node;

class GFX_API Material
{
private:
  /// Name of the material
  LString m_name;

  /// has the system values (double value)
  bool m_bHasSysVal;

  /// has the dependent values (string value)
  bool m_bHasDepVal;

public:
  /// System's material type enum
  enum {
    MAT_AMBIENT = 0,
    MAT_DIFFUSE = 1,
    MAT_SPECULAR = 2,
    MAT_SHININESS = 3,
    MAT_EMISSION = 4,
  };

private:
  /// System's material definitions
  double m_sysmat[5];

  /// Renderer specific definitions
  qlib::MapTable<LString> m_depmat;
  
public:
  Material();

  void setSysValue(int nID, double value);
  double getSysValue(int nID) const;
  bool hasSysValue(int nID) const;

  void setDepValue(const LString &type, const LString &value);
  LString getDepValue(const LString &type) const;
  bool hasDepValue(const LString &type) const;

  /// serialization to the data node
  void writeTo(qlib::LDom2Node *pNode) const;
  
};


}

#endif

