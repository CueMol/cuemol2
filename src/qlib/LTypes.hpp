// -*-Mode: C++;-*-
//
// Data type declarations
//
// $Id: LTypes.hpp,v 1.2 2010/01/17 13:52:13 rishitani Exp $

#ifndef QUE_DATA_TYPES_HPP_INCLUDED_
#define QUE_DATA_TYPES_HPP_INCLUDED_

#include "TypeTraits.hpp"

namespace qlib {

  typedef QUE_INT_8 qint8;
  typedef QUE_INT_16 qint16;
  typedef QUE_INT_32 qint32;
  typedef QUE_INT_64 qint64;

  typedef QUE_BYTE qbyte;
  typedef QUE_UINT_8 quint8;
  typedef QUE_UINT_16 quint16;
  typedef QUE_UINT_32 quint32;
  typedef QUE_UINT_64 quint64;

  typedef QUE_FLT_32 qfloat32;
  typedef QUE_FLT_64 qfloat64;

  typedef QUE_VOIDP qvoidp;

  /// Data type constants
  ///  (These defs are common with QDF data type definition,
  ///   and should be persistent and part of API)
  struct type_consts {
    static const int QTC_BOOL = 0;
    static const int QTC_UINT8 = 1;
    static const int QTC_UINT16 = 2;
    static const int QTC_UINT32 = 3;
    static const int QTC_UINT64 = 4;

    static const int QTC_INT8 = 11;
    static const int QTC_INT16 = 12;
    static const int QTC_INT32 = 13;
    static const int QTC_INT64 = 14;

    static const int QTC_FLOAT8 = 19;
    static const int QTC_FLOAT16 = 20;
    static const int QTC_FLOAT32 = 21;
    static const int QTC_FLOAT64 = 22;
    static const int QTC_FLOAT128 = 23;

    static const int QTC_UTF8STR = 41;

    /// float32 x 3 elem vector
    static const int QTC_VEC3 = 51;
    /// float32 x 4 elem vector
    static const int QTC_VEC4 = 52;
    /// qbyte x 3 RGB color
    static const int QTC_RGB = 53;
    /// qbyte x 4 RGBA color
    static const int QTC_RGBA = 54;
  };

  namespace detail {
    inline void swapByteImpl(char *buf, int pos1, int pos2)
    {
      char tmp = buf[pos1];
      buf[pos1] = buf[pos2];
      buf[pos2] = tmp;
    }

    template <int _Size>
    struct LByteSwapperImpl
    {
      static void swapImpl(char *) {}
    };

    template <>
    struct LByteSwapperImpl<2>
    {
      static void swapImpl(char *in)
      {
        detail::swapByteImpl(in, 0, 1);
      }
    };

    template <>
    struct LByteSwapperImpl<4>
    {
      static void swapImpl(char *in)
      {
        detail::swapByteImpl(in, 0, 3);
        detail::swapByteImpl(in, 1, 2);
      }
    };

    template <>
    struct LByteSwapperImpl<8>
    {
      static void swapImpl(char *in)
      {
        detail::swapByteImpl(in, 0, 7);
        detail::swapByteImpl(in, 1, 6);
        detail::swapByteImpl(in, 2, 5);
        detail::swapByteImpl(in, 3, 4);
      }
    };
  } // detail    

  /////////////////////////////////////////////////////
  // Byte-swapper interface

  template <typename _Type>
  struct LByteSwapper : public detail::LByteSwapperImpl<sizeof (_Type)>
  {
    typedef detail::LByteSwapperImpl<sizeof (_Type)> super_t;
    static void swap(_Type &value) {
      super_t::swapImpl((char *)&value);
    }
  };
  
  namespace detail {

    /////////////////////////////////////////////////////
    // LE normalizer

    template <typename _Type, bool _IsInt, bool _IsFloat>
    struct LByteNormalizeImpl
    {
      static void doit(_Type &value)
      {
      }
    };

    // integral case
    template <typename _Type>
    struct LByteNormalizeImpl<_Type, true, false>
    {
      static void doit(_Type &value)
      {
#if (BYTEORDER==4321)
        LByteSwapper<_Type>::swap(value);
#elif (BYTEORDER!=1234)
# error "Unsupported integer byte-order machine"
#endif
      }
    };

    // floating num case
    template <typename _Type>
    struct LByteNormalizeImpl<_Type, false, true>
    {
      static void doit(_Type &value)
      {
#if (HOST_FLOAT_FORMAT==IEEE_BE)
        LByteSwapper<_Type>::swap(value);
#elif (HOST_FLOAT_FORMAT!=IEEE_LE)
# error "Unsupported integer byte-order machine"
#endif
      }
    };

    /////////////////////////////////////////////////////
    // BE normalizer

    template <typename _Type, bool _IsInt, bool _IsFloat>
    struct LByteNormalizeBEImpl
    {
      static void doit(_Type &value)
      {
      }
    };

    // integral case
    template <typename _Type>
    struct LByteNormalizeBEImpl<_Type, true, false>
    {
      static void doit(_Type &value)
      {
#if (BYTEORDER==1234)
        LByteSwapper<_Type>::swap(value);
#elif (BYTEORDER!=4321)
# error "Unsupported integer byte-order machine"
#endif
      }
    };

    // floating num case
    template <typename _Type>
    struct LByteNormalizeBEImpl<_Type, false, true>
    {
      static void doit(_Type &value)
      {
#if (HOST_FLOAT_FORMAT==IEEE_LE)
        LByteSwapper<_Type>::swap(value);
#elif (HOST_FLOAT_FORMAT!=IEEE_BE)
# error "Unsupported integer byte-order machine"
#endif
      }
    };

  } // detail

  /////////////////////////////////////////////////////

  template <typename _Type>
  struct LByteNormalize :
    detail::LByteNormalizeImpl<_Type, is_integral<_Type>::value, is_float<_Type>::value>
  {
  };

  template <typename _Type>
  struct LByteNormalizeBE :
    detail::LByteNormalizeBEImpl<_Type, is_integral<_Type>::value, is_float<_Type>::value>
  {
  };

}

#define QM_USING_QTYPES \
using qlib::qint8; \
using qlib::qint16; \
using qlib::qint32; \
using qlib::qint64; \
using qlib::qbyte; \
using qlib::quint8; \
using qlib::quint16; \
using qlib::quint32; \
using qlib::quint64; \
using qlib::qfloat32; \
using qlib::qfloat64; \
using qlib::qvoidp;

#ifndef NO_USING_QTYPES
using qlib::qint8;
using qlib::qint16;
using qlib::qint32;
using qlib::qint64;
using qlib::qbyte;
using qlib::quint8;
using qlib::quint16;
using qlib::quint32;
using qlib::quint64;
using qlib::qfloat32;
using qlib::qfloat64;
using qlib::qvoidp;
#endif

#endif // QUE_DATA_TYPES_HPP_INCLUDED_

