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

  typedef QUE_FLT_32 qfloat32;
  typedef QUE_FLT_64 qfloat64;

  /// Internal time/time-span representation (milli seconds)
  typedef qint64 time_value;

#if 0
// ATTN: is_integral and is_float is defined in TypeTraits.hpp
#define QLIB_DECL_TT_SPEC_CLS(CLASS_NAME, TYPE_NAME, RES_VALUE) \
  template<> \
  class CLASS_NAME<TYPE_NAME> \
  { public: static const bool value=RES_VALUE; };


  ////////////////////////////////////////////////////////////////
  // is_integral
  
  template <typename _Type>
  class is_integral
  {
  public:
    static const bool value=false;
  };

  QLIB_DECL_TT_SPEC_CLS(is_integral, bool, true);
  QLIB_DECL_TT_SPEC_CLS(is_integral, char, true);
  
  QLIB_DECL_TT_SPEC_CLS(is_integral,unsigned char,true);
  QLIB_DECL_TT_SPEC_CLS(is_integral,unsigned short,true);
  QLIB_DECL_TT_SPEC_CLS(is_integral,unsigned int,true);
  QLIB_DECL_TT_SPEC_CLS(is_integral,unsigned long,true);
          
  QLIB_DECL_TT_SPEC_CLS(is_integral,signed char,true);
  QLIB_DECL_TT_SPEC_CLS(is_integral,signed short,true);
  QLIB_DECL_TT_SPEC_CLS(is_integral,signed int,true);
  QLIB_DECL_TT_SPEC_CLS(is_integral,signed long,true);

  ////////////////////////////////////////////////////////////////
  // is_float

  template <typename _Type>
  class is_float
  {
  public:
    static const bool value=false;
  };

  QLIB_DECL_TT_SPEC_CLS(is_float, float, true);
  QLIB_DECL_TT_SPEC_CLS(is_float, double, true);
  QLIB_DECL_TT_SPEC_CLS(is_float, long double, true);

  ////////////////////////////////////////////////////////////////
#endif

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

using qlib::qint8;
using qlib::qint16;
using qlib::qint32;
using qlib::qint64;

using qlib::qbyte;
using qlib::quint8;
using qlib::quint16;
using qlib::quint32;

using qlib::qfloat32;
using qlib::qfloat64;

#endif // QUE_DATA_TYPES_HPP_INCLUDED_

