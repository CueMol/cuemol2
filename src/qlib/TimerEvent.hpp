// -*-Mode: C++;-*-
//
// Timer Event
//

#ifndef QLIB_TIMER_EVENT_HPP_
#define QLIB_TIMER_EVENT_HPP_

#include "qlib.hpp"
#include "LTimeValue.hpp"

namespace qlib {

  /// Timer event listener class
  class QLIB_API TimerListener
  {
  public:
    virtual bool onTimer(double t, time_value curr, bool bLast) = 0;
  };


} // namespace qlib

#endif
