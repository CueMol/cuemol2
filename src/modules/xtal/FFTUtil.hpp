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
#include <complex>

namespace xtal {
  using qlib::Vector3I;

  class FFTUtil
  {
  private:
    // Vector3I m_grid;

  public:
    typedef qlib::Array3D<std::complex<float>> CompArray;
    typedef qlib::Array3D<float> FloatArray;

    FFTUtil()
    {
    }

    ~FFTUtil()
    {
    }

    /// complex-->complex transform
    void doit(CompArray &in, CompArray &out);

    void doit_rev(CompArray &in, CompArray &out);

    /// hermit complex-->real(float) transform
    void doit(CompArray &in, FloatArray &out);

    /// real(float)-->hermite complex transform
    void doit(FloatArray &in, CompArray &out);

  };

}


#endif

