// -*-Mode: C++;-*-
//
// FFT utility class
//

#include <common.h>
#include "FFTUtil.hpp"

#ifdef HAVE_FFTW3_H
#  include <fftw3.h>
#endif

using namespace xtal;

/// complex-->complex transform
void FFTUtil::doit(CompArray &in, CompArray &out)
{
  const Vector3I &grd = in.getDim();

  fftwf_complex *pin = reinterpret_cast<fftwf_complex*>(in.data());
  fftwf_complex *pout = reinterpret_cast<fftwf_complex*>(out.data());

  fftwf_plan p;
  p = fftwf_plan_dft_3d(grd.z(), grd.y(), grd.x(),
                        pin, pout,
                        FFTW_FORWARD, FFTW_ESTIMATE);

  fftwf_execute(p);
  fftwf_destroy_plan(p);
}

void FFTUtil::doit_rev(CompArray &in, CompArray &out)
{
  const Vector3I &grd = in.getDim();

  fftwf_complex *pin = reinterpret_cast<fftwf_complex*>(in.data());
  fftwf_complex *pout = reinterpret_cast<fftwf_complex*>(out.data());

  fftwf_plan p;
  p = fftwf_plan_dft_3d(grd.z(), grd.y(), grd.x(),
                        pin, pout,
                        FFTW_BACKWARD, FFTW_ESTIMATE);

  fftwf_execute(p);
  fftwf_destroy_plan(p);
}

/// hermit complex-->real(float) transform
void FFTUtil::doit(CompArray &in, FloatArray &out)
{
  // input has only the half region, so use output dimension
  const Vector3I &grd = out.getDim();

  fftwf_complex *pin = reinterpret_cast<fftwf_complex*>(in.data());
  float *pout = reinterpret_cast<float*>(out.data());

  fftwf_plan p;
  p = fftwf_plan_dft_c2r_3d(grd.z(), grd.y(), grd.x(),
                            pin, pout,
                            FFTW_ESTIMATE);

  fftwf_execute(p);
  fftwf_destroy_plan(p);
}

/// real(float)-->hermite complex transform
void FFTUtil::doit(FloatArray &in, CompArray &out)
{
  const Vector3I &grd = in.getDim();

  float *pin = reinterpret_cast<float*>(in.data());
  fftwf_complex *pout = reinterpret_cast<fftwf_complex*>(out.data());

  fftwf_plan p;
  p = fftwf_plan_dft_r2c_3d(grd.z(), grd.y(), grd.x(),
                            pin, pout,
                            FFTW_ESTIMATE);

  fftwf_execute(p);
  fftwf_destroy_plan(p);
}
