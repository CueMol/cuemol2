// -*-Mode: C++;-*-
//
// Event object
//

#ifndef QLIB_EVENT_HPP_
#define QLIB_EVENT_HPP_

#include "qlib.hpp"
#include "LObject.hpp"
#include "LString.hpp"

namespace qlib {

  class LScriptable;

  ///
  /// Event object
  ///
  class QLIB_API LEvent : public LCloneableObject
  {
  public:
    virtual ~LEvent() {}
    
    template <class T>
    bool instanceOf() const {
      return (dynamic_cast<const T *>(this)!=NULL);
    }

    virtual LString getJSON() const { return LString(); }
    virtual LScriptable *getScrObject() const { return NULL; }
  };

} // namespace qlib

#endif
