// -*-Mode: C++;-*-
//
// Scriptable Byte Array
//

#ifndef L_BYTE_ARRAY_HPP_INCLUDED_
#define L_BYTE_ARRAY_HPP_INCLUDED_

#include "qlib.hpp"

#include "Array.hpp"
#include "LScrObjects.hpp"
#include "LVariant.hpp"
#include "LScrSmartPtr.hpp"
#include "LTypes.hpp"
#include "mcutils.hpp"

namespace qlib {

  ///
  /// Scriptable array of byte (unsigned char)
  ///
  class QLIB_API LByteArray : public LSimpleCopyScrObject, public Array<qbyte>
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

  public:
    LByteArray()
      : Array<qbyte>()
    {
    }

    LByteArray(int nsize)
      : Array<qbyte>(nsize)
    {
    }

    LByteArray(const LByteArray &a)
      : Array<qbyte>(a)
    {
    }

    int getValue(int ind) const
    {
      const int nsize = getSize();
      MB_ASSERT(0<=ind && ind<nsize);
      if (ind<0 || nsize<=ind)
        MB_THROW(IndexOutOfBoundsException,
                 LString::format("LByteArray get() out of index %d", ind));
      return at(ind);
    }

    void setValue(int ind, int value)
    {
      const int nsize = getSize();
      MB_ASSERT(0<=ind && ind<nsize);
      if (ind<0 || nsize<=ind)
        MB_THROW(IndexOutOfBoundsException,
                 LString::format("LByteArray get() out of index %d", ind));
      at(ind) = qbyte(value);
    }
  };

  typedef LScrSp<LByteArray> LByteArrayPtr;
}

#endif
