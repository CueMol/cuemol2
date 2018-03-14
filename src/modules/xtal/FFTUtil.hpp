// -*-Mode: C++;-*-
//
// FFT utility class
//

#ifndef XTAL_FFT_UTIL_HPP_INCLUDED
#define XTAL_FFT_UTIL_HPP_INCLUDED

#include "xtal.hpp"

#include <qlib/mcutils.hpp>
#include <qlib/LExceptions.hpp>
#include <qlib/Array.hpp>

namespace xtal {
  using qlib::CompArray;
  using qlib::FloatArray;

  class FFTUtil
  {
  private:

  public:
    //typedef qlib::Array3D<std::complex<float>> CompArray;
    //typedef qlib::Array3D<float> FloatArray;

    FFTUtil()
    {
    }

    ~FFTUtil()
    {
    }

    /// complex-->complex transform (recip to real space)
    void doit(CompArray &in, CompArray &out);

    /// complex-->complex transform (real to recip space)
    void doit_rev(CompArray &in, CompArray &out);

    /// hermit complex-->real(float) transform (recip to real space)
    void doit(CompArray &in, FloatArray &out);

    /// real(float)-->hermite complex transform (real to recip space)
    void doit(FloatArray &in, CompArray &out);

  };

}


#endif

