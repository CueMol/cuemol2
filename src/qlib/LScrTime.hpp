//
// Scriptable representation of time/time span
//

#ifndef L_SCR_TIME_HPP_INCLUDED
#define L_SCR_TIME_HPP_INCLUDED

#include "qlib.hpp"
#include "LScrObjects.hpp"
#include "LTypes.hpp"
#include "LExceptions.hpp"
#include "mcutils.hpp"

namespace qlib {

  MB_DECL_EXCPT_CLASS(QLIB_API, TimeFormatException, RuntimeException);

  class QLIB_API LScrTime : public LSimpleCopyScrObject
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;
      
  private:
    /// time value (64bit int) in millisecond
    time_value m_value;
    
  public:
    // constructors

    /// default constructor
    LScrTime()
         : m_value(0)
    {
    }

    /// copy constructor
    LScrTime(const LScrTime &arg)
         : m_value(arg.m_value)
    {
    }

    /// Implicit conversion
    LScrTime(time_value arg)
         : m_value(arg)
    {
    }

    /// destructor
    virtual ~LScrTime();

    /// Assignment
    const LScrTime &operator=(const LScrTime &arg)
    {
      if(&arg!=this) {
        m_value = arg.m_value;
      }
      return *this;
    }

  public:

    /// get time in 64-bit millisecond unit (intrinsic representation)
    time_value getValue() const { return m_value; }

    /// set time in 64-bit millisecond unit (intrinsic representation)
    void setValue(time_value aVal) { m_value = aVal; }

    //////////

    /// get time in string representation (the same as toString())
    LString getStrValue() const { return toString(); }

    /// set time in string representation
    void setStrValue(const LString &str);

    LInt getHour() const;
    LInt getMinute(LBool lim) const;
    LInt getSecond(LBool lim) const;
    LInt getMilliSec(LBool lim) const;

    void setIntValue(LInt value) {
      m_value = time_value(value);
    }

    LInt getIntValue() const {
      return LInt(m_value);
    }

    //////////

    virtual bool equals(const LScrTime &arg);
    virtual bool isStrConv() const;
    virtual LString toString() const;

    typedef boost::true_type has_fromString;
    static LScrTime *fromStringS(const LString &src);
  };

}

#endif

