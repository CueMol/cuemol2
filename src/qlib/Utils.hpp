// -*-Mode: C++;-*-
//
// utilities
//
// $Id: Utils.hpp,v 1.7 2011/03/10 13:11:55 rishitani Exp $

#ifndef UTIL_H__
#define UTIL_H__

#include "qlib.hpp"
#include "LString.hpp"
using qlib::LString;

#ifndef F_EPS16
# define F_EPS16 1.0e-16
#endif

#ifndef F_EPS8
# define F_EPS8 1.0e-8
#endif

#ifndef F_EPS4
# define F_EPS4 1.0e-4
#endif

#ifndef M_PI
# define M_PI 3.14159265358979323846
#endif

#ifdef max
# undef max
#endif
#ifdef min
# undef min
#endif

namespace qlib {

  template <typename _Type>
  inline bool isFinite(_Type val) {
#if defined(WIN32)
    if (::_finite(val)==0)
      return false;
    else
      return true;
#elif (__cplusplus>=201103L)
    // C++11
    return std::isfinite(val);
#elif defined(HAVE_FINITE)
    return finite(val);
#elif defined(HAVE_ISFINITE)
    return isfinite(val);
#endif    
  }

  template <typename _Type>
  _Type max(_Type a, _Type b) {
    if (a>b)
      return a;
    else
      return b;
  }

  template <typename _Type>
  _Type min(_Type a, _Type b) {
    if (a>b)
      return b;
    else
      return a;
  }

  template <typename _Type>
  _Type trunc(_Type v, _Type l, _Type h) {
    if (v<l) return l;
    else if (h<v) return h;
    else return v;
  }

  template <typename _Type>
  _Type abs(_Type a) {
    if (a < static_cast<_Type>(0))
      return -a;
    else
      return a;
  }

  template <typename _Type>
  _Type sign(_Type a, _Type b) 
  {
    if (b>static_cast<_Type>(0))
      return abs<_Type>(a);
    else
      return -abs<_Type>(a);
  }

  template <typename _Type>
  _Type toRadian(_Type deg)
  {
    return deg*M_PI/180.0;
  }

  template <typename _Type>
  _Type toDegree(_Type rad) {
    return rad*180.0/M_PI;
  }

  template <typename _Type>
  bool isNear(_Type x, _Type y) {
    return qlib::abs<_Type>(x-y)<F_EPS16;
  }
  
  template <typename _Type>
  bool isNear4(_Type x, _Type y) {
    return qlib::abs<_Type>(x-y)<F_EPS4;
  }
  
  template <typename _Type>
  bool isNear8(_Type x, _Type y) {
    return qlib::abs<_Type>(x-y)<F_EPS8;
  }

  template <typename _Type>
  _Type truncDig4(_Type x) {
    return (_Type)(((long)(x*10000))/1.0e4);
  }

  template <typename _Type>
  _Type truncDig3(_Type x) {
    return (_Type)(((long)(x*1000))/1.0e3);
  }

  template <typename _Type>
  _Type truncDig2(_Type x) {
    return (_Type)(((long)(x*100))/1.0e2);
  }

  template <typename _Type>
  _Type truncDig1(_Type x) {
    return (_Type)(((long)(x*10))/1.0e1);
  }

  ///
  ///  Functor to delete pointers, for std::for_each()
  ///
  template <class _T>
  class delete_ptr
  {
  public:
    void operator() (_T p) {
      delete p;
    }
  };

  template <typename _Cont, typename _Type>
  void delete_and_clear(_Cont &cont) {
    std::for_each(cont.begin(), cont.end(), delete_ptr<_Type *>());
    cont.clear();
  }
  

  template <class _T>
  class delete_ptr2
  {
  public:
    void operator() (_T p) {
      delete p.second;
    }
  };

  ////////////////////////////////////////////////////////////////////

  class QLIB_API Util
  {
  public:

    static double toRadian(double deg) {
      return deg*M_PI/180.0;
    }

    static double toDegree(double rad) {
      return rad*180.0/M_PI;
    }

    static bool isNear(double x, double y) {
      return qlib::abs<double>(x-y)<F_EPS16;
    }

    static bool isNear4(double x, double y) {
      return qlib::abs<double>(x-y)<F_EPS4;
    }

    static bool isNear8(double x, double y) {
      return qlib::abs<double>(x-y)<F_EPS8;
    }

  };

  QLIB_API LString getLeafName(const LString &aPath);
  QLIB_API LString makeRelativePath(const LString &abspath, const LString &basedir);
  QLIB_API LString makeAbsolutePath(const LString &abspath, const LString &basedir);
  QLIB_API bool isAbsolutePath(const LString &aPath);

  QLIB_API bool isFileReadable(const LString &path);

}


#endif
