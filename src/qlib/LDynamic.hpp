//
// Interface for dynamic classes
//
// $Id: LDynamic.hpp,v 1.5 2010/01/14 14:38:58 rishitani Exp $

#ifndef __L_DYNAMIC_HPP_INCLUDED__
#define __L_DYNAMIC_HPP_INCLUDED__

#include "qlib.hpp"

#include "LString.hpp"
#include "LClass.hpp"
#include "LExceptions.hpp"

namespace qlib {

  class LString;
  class LClass;

  class QLIB_API LDynamic
  {
  public:
    virtual ~LDynamic() {}
    
    virtual LClass *getClassObj() const =0;

    LString getClassName() const {
      LClass *pClass = getClassObj();
      if (pClass==NULL) {
        MB_THROW(ClassNotFoundException,
		 LString::format("class \"%s\" is not registered.",
				 typeid(*this).name()));
      }
      return pClass->getClassName();
    }

    static bool initClass(LClass *) { return true; }
    static void finiClass(LClass *) {}

    static LDynamic *fromStringS(const LString &aStr) { return NULL; }

  };

}

#endif // __DYNAMIC_CLASS_H__
