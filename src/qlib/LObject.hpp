// -*-Mode: C++;-*-
//
// Superclass of objects: LObject
//
// $Id: LObject.hpp,v 1.2 2011/01/09 17:57:09 rishitani Exp $

#ifndef __L_OBJECT_H__
#define __L_OBJECT_H__

#include "qlib.hpp"

namespace qlib {
  
  class LClass;

  class QLIB_API LObject
  {
  public:
    LObject() {}
    virtual ~LObject() {}

    template <class T>
    bool instanceOf() const {
      return (dynamic_cast<const T *>(this)!=NULL);
    }

  };

  class QLIB_API LSingletonObject : public LObject
  {
  public:
    LSingletonObject() {}
  };

  class QLIB_API LCloneableObject : public LObject
  {
  public:
    LCloneableObject() {}
    LCloneableObject(const LCloneableObject&) {}
    virtual LCloneableObject *clone() const =0;

    template <class T>
    T *clone_cast() const {
      return dynamic_cast<T *>(clone());
    }
  };

}

#endif // __L_OBJECT_H__
