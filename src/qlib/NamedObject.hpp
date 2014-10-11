// -*-Mode: C++;-*-
//
//
// $Id: NamedObject.hpp,v 1.2 2009/01/04 02:35:49 rishitani Exp $

#ifndef NAMED_OBJECT_H__
#define NAMED_OBJECT_H__

#include "qlib.hpp"
#include "LString.hpp"

namespace qlib {

  class QLIB_API NamedObject
  {
  private:
    LString m_name;

  public:
    /** default ctor */
    NamedObject() {}

    /** copy ctor */
    NamedObject(const NamedObject &arg) : m_name(arg.m_name) {}

    virtual ~NamedObject();

    const LString &getName() const { return m_name; }

    virtual void setName(const LString &name);

    /** utility : name validity check */
    inline static
      bool isValidName(const LString &name) {
        return (name.length()>0 && name.indexOf(':')<0);
      }
  };

}

#endif

