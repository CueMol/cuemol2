//
// Interface for the property handling class
//

#ifndef _QLIB_PROP_SPEC_HPP__
#define _QLIB_PROP_SPEC_HPP__

#include "qlib.hpp"

#include "LString.hpp"

namespace qlib {

  // Enum type definition
  struct EnumDef : public std::map<LString,int>
  {
  };

  class PropSpec
  {
  public:
    /// type name of this property
    LString type_name;

    /// this property is read only
    bool bReadOnly;

    /// this property has a default value
    bool bHasDefault;

    /// this property shouldn't be serialized
    bool bNoPersist;

    /// key/value pair of enum definition (ptr is retained!!)
    EnumDef *pEnumDef;

    //////////////////////////////////

    /// ctor
    PropSpec()
      : type_name(), bReadOnly(false),
        bHasDefault(false), bNoPersist(false),
        pEnumDef(NULL) {}

    /// dtor
    ~PropSpec() {
      if (pEnumDef!=NULL)
	delete pEnumDef;
    }
  };

}

#endif
