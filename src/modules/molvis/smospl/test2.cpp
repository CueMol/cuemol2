
#include <stdlib.h>
#include <stdio.h>
#include <math.h>

#include "interpolation.hpp"

#include <vector>
#include <string>

using namespace alglib;

int main(int argc, char **argv)
{
  std::vector<double> tvec, xvec, yvec, zvec;
  char sbuf[1024];
  double tmin=1e100, tmax=-1e100;

  for (;;) {
    char *res = ::fgets(sbuf, sizeof sbuf, stdin);
    if (res==NULL) break;
    // fprintf(stderr, "READ: %s", res);

    std::string line = sbuf;
    std::string anam = line.substr(12,4);
    std::string resn = line.substr(22,4);
    std::string xpos = line.substr(30,8);
    std::string ypos = line.substr(38,8); //Y
    std::string zpos = line.substr(46,8);
    
    if (anam!=" CA ")
      continue;

    char *sptr;
    const char *cstr = resn.c_str();
    int nresn = ::strtol(cstr, &sptr, 0);
    if(sptr==cstr) return 0;

    cstr = xpos.c_str();
    double xval = ::strtod(cstr, &sptr);
    if(sptr==cstr) return 0;

    cstr = ypos.c_str();
    double yval = ::strtod(cstr, &sptr);
    if(sptr==cstr) return 0;

    cstr = zpos.c_str();
    double zval = ::strtod(cstr, &sptr);
    if(sptr==cstr) return 0;

    fprintf(stderr, "INPUT: %d, x=%f\n", nresn, xval);
    tvec.push_back( (double) nresn );
    xvec.push_back( xval );
    yvec.push_back( yval );
    zvec.push_back( zval );

    if (tmin>nresn)
      tmin = nresn;
    if (tmax<nresn)
      tmax = nresn;
  }
  const size_t nsize = tvec.size();

  fprintf(stderr, "data size: %d\n", nsize);
  fprintf(stderr, "tmin: %f, tmax: %f\n", tmin, tmax);

  //

  real_1d_array t, x, y, z, w;
  t.setlength(nsize);
  x.setlength(nsize);
  y.setlength(nsize);
  z.setlength(nsize);
  w.setlength(nsize);

  for (int i=0; i<nsize; ++i) {
    t[i] = tvec[i];
    x[i] = xvec[i];
    y[i] = yvec[i];
    z[i] = zvec[i];
    int resn = i+64;
    if (resn<69 || 80<resn)
      w[i] = 1.0; // beta
    else if (resn==69 || resn==80)
      w[i] = 10.0; // anchor
    else
      w[i] = 8.0; // coil
  }
  w[0] = 10.0;
  w[nsize-1] = 10.0;

  ae_int_t info;
  double v;
  spline1dinterpolant sx, sy, sz;
  spline1dfitreport rep;
  double rho;

  //
  // Fit with VERY small amount of smoothing (rho = -5.0)
  // and large number of basis functions (M=50).
  //
  // With such small regularization penalized spline almost fully reproduces function values
  //
  //rho = -5.0;
  rho = 0.0;
  int mseg = nsize+2-1;

  //spline1dfitpenalized(t, x, mseg, rho, info, sx, rep);
  spline1dfitpenalizedw(t, x, w, mseg, rho, info, sx, rep);
  fprintf(stderr, "X info: %d\n", int(info)); // EXPECTED: 1

  //spline1dfitpenalized(t, y, mseg, rho, info, sy, rep);
  spline1dfitpenalizedw(t, y, w, mseg, rho, info, sy, rep);
  fprintf(stderr, "Y info: %d\n", int(info)); // EXPECTED: 1

  //spline1dfitpenalized(t, z, mseg, rho, info, sz, rep);
  spline1dfitpenalizedw(t, z, w,mseg, rho, info, sz, rep);
  fprintf(stderr, "Z info: %d\n", int(info)); // EXPECTED: 1

  const double dt = 0.05;
  int nseq = floor(tmin+0.5);
  for (double t = tmin; t<=tmax; t+=dt) {
    double x = spline1dcalc(sx, t);
    double y = spline1dcalc(sy, t);
    double z = spline1dcalc(sz, t);

    //ATOM     10  CA  ALA A  15     -75.125  53.864  47.016  1.00131.78           C
    printf("ATOM  %5d  CA  ALA A%4d    %8.3f%8.3f%8.3f  1.00 30.00           C\n",
	   int(nseq), int(nseq), x, y, z);
    ++nseq;
  }
  return 0;

}

