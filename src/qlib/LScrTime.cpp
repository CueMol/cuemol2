// -*-Mode: C++;-*-
//
// Scriptable representation of time/time span
//

#include <common.h>

#include "LScrTime.hpp"

#include "Utils.hpp"

namespace qlib {

LScrTime::~LScrTime() {}

bool LScrTime::equals(const LScrTime &arg)
{
    return arg.m_value == m_value;
}

bool LScrTime::isStrConv() const
{
    return true;
}

LString LScrTime::toString() const
{
    time_value msec = timeval::toMilliSec(m_value);

    time_value t_msec = msec % 1000;
    time_value sec = msec / 1000;

    time_value t_sec = sec % 60;
    time_value minute = sec / 60;

    time_value t_min = minute % 60;
    time_value hour = minute / 60;

    LString rval = LString::fromInt(t_sec);
    if (int(t_msec) != 0) rval = rval + "." + LString::fromInt(t_msec);

    if (int(hour) != 0) {
        return LString::fromInt(hour) + ":" + LString::fromInt(t_min) + ":" + rval;
    }

    if (int(t_min) != 0) {
        return LString::fromInt(t_min) + ":" + rval;
    }

    return rval;
}

void LScrTime::setStrValue(const LString &src)
{
    LStringList ls;
    int nsep = src.split(':', ls);
    if (nsep > 3) {
        MB_THROW(TimeFormatException, src);
        return;
    }

    time_value msec = 0;
    time_value sec = 0;
    time_value minute = 0;
    time_value hour = 0;

    auto riter = ls.rbegin();
    LString elem;
    int ival;

    for (;;) {
        // second & milli second
        elem = *riter;
        LString str_sec("0"), str_msec("0");
        {
            LStringList ls2;
            int nsep2 = elem.split('.', ls2);
            if (nsep2 <= 1) {
                str_sec = elem;
            } else if (nsep2 == 2) {
                str_sec = ls2.front();
                ls2.pop_front();
                str_msec = ls2.front();
            }
            if (nsep2 > 2) {
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
        if (riter == ls.rend()) break;

        // minute
        elem = *riter;
        if (!elem.toInt(&ival)) {
            MB_THROW(TimeFormatException, src);
            return;
        }
        minute = ival;
        ++riter;
        if (riter == ls.rend()) break;

        // hour
        elem = *riter;
        if (!elem.toInt(&ival)) {
            MB_THROW(TimeFormatException, src);
            return;
        }
        hour = ival;
        break;
    }

    time_value ms =
        msec +
        time_value(1000) * (sec + time_value(60) * (minute + time_value(60) * hour));

    // conv to nano-sec representation
    m_value = timeval::fromMilliSec(ms);
}

// static
LScrTime *LScrTime::fromStringS(const LString &src)
{
    LScrTime *pTime = MB_NEW LScrTime();
    pTime->setStrValue(src);
    return pTime;
}

LInt LScrTime::getHour() const
{
    // conv nanosec to sec
    time_value sec = timeval::toSec(m_value);
    time_value minute = sec / 60;
    time_value hour = minute / 60;

    return LInt(hour);
}

LInt LScrTime::getMinute(LBool lim) const
{
    // conv nanosec to sec
    time_value sec = timeval::toSec(m_value);
    time_value minute = sec / 60;

    if (lim)
        return LInt(minute % 60);
    else
        return LInt(minute);
}

LInt LScrTime::getSecond(LBool lim) const
{
    // conv nanosec to sec
    time_value sec = timeval::toSec(m_value);

    if (lim)
        return LInt(sec % 60);
    else
        return LInt(sec);
}

LInt LScrTime::getMilliSec(LBool lim) const
{
    // conv nanosec to millisec
    time_value msec = timeval::toMilliSec(m_value);

    if (lim)
        return LInt(msec % 1000);
    else
        return LInt(msec);
}

}  // namespace qlib
