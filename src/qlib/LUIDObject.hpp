//
// Object with Unique ID 
//
// $Id: LUIDObject.hpp,v 1.2 2009/05/04 10:29:17 rishitani Exp $

#ifndef L_UID_OBJECT_HPP_INCLUDED_
#define L_UID_OBJECT_HPP_INCLUDED_

#include "qlib.hpp"

namespace qlib {

  class QLIB_API LUIDObject
  {
  public:
//    LUIDObject() {}
    virtual ~LUIDObject() {}
//    virtual uid_t getUID() const =0;
  };

}

#endif

