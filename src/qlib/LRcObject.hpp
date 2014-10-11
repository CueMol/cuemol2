// -*-Mode: C++;-*-
//
// LRcObject.hpp
//   reference counter class LRcObject
//
// $Id: LRcObject.hpp,v 1.2 2007/04/30 14:32:09 rishitani Exp $

#ifndef L_RC_OBJECT_H__
#define L_RC_OBJECT_H__

#include <qlib/qlib.hpp>

#include "LObject.hpp"

namespace qlib {

  class QLIB_API LRcObject : public LObject
  {
  private:
    mutable int m_nRef;

  public:

    /** default ctor */
    LRcObject() : LObject(), m_nRef(0) {}

    virtual ~LRcObject();

    //
    // member methods
    //

    /** add reference for this obj */
    void addRef() const {
      MB_DPRINTLN("addRef %s(%p) %d->%d ",
		  typeid(*this).name(), this, m_nRef, m_nRef+1);
      m_nRef++;
    }

    // remove reference for this obj
    void release() const {
      MB_DPRINTLN("release %s(%p) %d->%d ",
		  typeid(*this).name(), this, m_nRef, m_nRef-1);
      MB_ASSERT(m_nRef>0);

      LRcObject * pthis = const_cast<LRcObject *>(this);
      MB_ASSERT(pthis!=NULL);
      m_nRef--;
      if(m_nRef<=0)
	delete pthis;
    }
  
    int getRefCount() const { return m_nRef; }

  };

}

#endif // L_RC_OBJECT_H__
