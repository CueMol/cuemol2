// -*-Mode: C++;-*-
//
// String-convertable interface
//
// $Id: LStrConvCap.hpp,v 1.1 2008/03/09 08:04:38 rishitani Exp $

#ifndef __L_STRING_CONVERSION_CAPACITANCE_HPP_
#define __L_STRING_CONVERSION_CAPACITANCE_HPP_

#include "qlib.hpp"

#include "LString.hpp"

namespace qlib {
  struct LStrConvCap {
    virtual bool fromString(const LString &src) =0;
    virtual LString toString() const =0;
  };
}

#endif
