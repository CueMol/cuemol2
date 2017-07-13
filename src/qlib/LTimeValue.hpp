// -*-Mode: C++;-*-
//
// Time value definition and utilities
//

#ifndef QLIB_LTIME_VALUE_HPP_INCLUDED
#define QLIB_LTIME_VALUE_HPP_INCLUDED

#include "LTypes.hpp"

namespace qlib {

  /// Internal time/time-span representation (nano seconds)
  typedef qint64 time_value;

  namespace timeval {
    /// internal repr to second
    inline time_value toSec(time_value arg) {
      return arg/time_value(1000000000);
    }

    /// internal repr to milli-second
    inline time_value toMilliSec(time_value arg) {
      return arg/time_value(1000000);
    }
    
    /// from milli-second to internal repr
    inline time_value fromMilliSec(time_value arg) {
      return arg*time_value(1000000);
    }

    inline time_value fromNanoSec(time_value arg) {
      return arg;
    }

  }
  
}

#endif

