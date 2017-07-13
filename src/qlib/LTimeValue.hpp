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
    template <typename _Type=time_value>
    inline _Type toSec(time_value arg) {
      return _Type(arg)/_Type(1000000000);
    }

    /// internal repr to milli-second
    template <typename _Type=time_value>
    inline _Type toMilliSec(time_value arg) {
      return _Type(arg)/_Type(1000000);
    }
    
    /// from milli-second to internal repr
    template <typename _Type=time_value>
    inline time_value fromMilliSec(_Type arg) {
      return time_value( arg*time_value(1000000) );
    }

    /// from second to internal repr
    template <typename _Type=time_value>
    inline time_value fromSec(_Type arg) {
      return time_value( arg*time_value(1000000000) );
    }

    template <typename _Type=time_value>
    inline time_value fromNanoSec(_Type arg) {
      return time_value(arg);
    }

  }
  
}

#endif

