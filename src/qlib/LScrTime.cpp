// -*-Mode: C++;-*-
//
// Scriptable representation of time/time span
//

#include <common.h>
#include "LScrTime.hpp"
#include "Utils.hpp"

using namespace qlib;

LScrTime::~LScrTime()
{
}

bool LScrTime::equals(const LScrTime &arg)
{
  return arg.m_value==m_value;
}

bool LScrTime::isStrConv() const
{
  return true;
}

LString LScrTime::toString() const
{
  time_value t_msec = m_value % 1000;
  time_value sec = m_value/1000;

  time_value t_sec = sec % 60;
  time_value minute = sec/60;

  time_value t_min = minute % 60;
  time_value hour = minute/60;

  LString rval = LString::fromInt(t_sec);
  if (int(t_msec)!=0)
    rval = rval + "." + LString::fromInt(t_msec);

  if (int(hour)!=0) {
    return LString::fromInt(hour) + ":" + LString::fromInt(t_min) + ":" + rval;
  }

  if (int(t_min)!=0) {
    return LString::fromInt(t_min) + ":" + rval;
  }

  return rval;
}

void LScrTime::setStrValue(const LString &src)
{
  std::list<LString> ls;
  int nsep = src.split(':', ls);
  if (nsep>3) {
    MB_THROW(TimeFormatException, src);
    return;
  }

  time_value msec = 0;
  time_value sec = 0;
  time_value minute = 0;
  time_value hour = 0;

  std::list<LString>::const_reverse_iterator riter = ls.rbegin();
  LString elem;
  int ival;

  for (;;) {
    // second & milli second
    elem = *riter;
    LString str_sec("0"), str_msec("0");
    {
      std::list<LString> ls2;
      int nsep2 = elem.split('.', ls2);
      if (nsep2<=1) {
        str_sec = elem;
      }
      else if (nsep2==2) {
        str_sec = ls2.front();
        ls2.pop_front();
        str_msec = ls2.front();
      }
      if (nsep2>2) {
        MB_THROW(TimeFormatException, src);
        return;
      }
    }

    if (!str_msec.toInt(&ival)) {
      MB_THROW(TimeFormatException, src);
      return;
    }
    msec = ival;

    if (!str_sec.toInt(&ival)) {
      MB_THROW(TimeFormatException, src);
      return;
    }
    sec = ival;
    ++riter;
    if (riter==ls.rend())
      break;

    // minute
    elem = *riter;
    if (!elem.toInt(&ival)) {
      MB_THROW(TimeFormatException, src);
      return;
    }
    minute = ival;
    ++riter;
    if (riter==ls.rend())
      break;

    // hour
    elem = *riter;
    if (!elem.toInt(&ival)) {
      MB_THROW(TimeFormatException, src);
      return;
    }
    hour = ival;
    break;
  }
  
  m_value = msec + 1000*( sec + 60*( minute + 60*hour ) );
}

//static
LScrTime *LScrTime::fromStringS(const LString &src)
{
  LScrTime *pTime = MB_NEW LScrTime();
  pTime->setStrValue(src);
  return pTime;
}

LInt LScrTime::getHour() const
{
  time_value t_msec = m_value % 1000;
  time_value sec = m_value/1000;

  time_value t_sec = sec % 60;
  time_value minute = sec/60;

  time_value t_min = minute % 60;
  time_value hour = minute/60;

  return LInt(hour);
}

LInt LScrTime::getMinute(LBool lim) const
{
  time_value t_msec = m_value % 1000;
  time_value sec = m_value/1000;

  time_value t_sec = sec % 60;
  time_value minute = sec/60;

  time_value t_min = minute % 60;
  if (lim)
    return LInt(t_min);
  else
    return LInt(minute);
}

LInt LScrTime::getSecond(LBool lim) const
{
  time_value t_msec = m_value % 1000;
  time_value sec = m_value/1000;

  time_value t_sec = sec % 60;
  if (lim)
    return LInt(t_sec);
  else
    return LInt(sec);
}

LInt LScrTime::getMilliSec(LBool lim) const
{
  time_value t_msec = m_value % 1000;
  if (lim)
    return LInt(t_msec);
  else
    return LInt(m_value);
}

