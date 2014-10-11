/*************************************************************************
Copyright (c) Sergey Bochkanov (ALGLIB project).

>>> SOURCE LICENSE >>>
This program is free software; you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation (www.fsf.org); either version 2 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

A copy of the GNU General Public License is available at
http://www.fsf.org/licensing/licenses
>>> END OF LICENSE >>>
*************************************************************************/
#ifndef _interpolation_pkg_h
#define _interpolation_pkg_h

#include "ap.hpp"

//#include "alglibinternal.h"
namespace alglib_impl
{
  ae_bool isfinitevector(/* Real    */ ae_vector* x,
			 ae_int_t n,
			 ae_state *_state);

  ae_bool aredistinct(/* Real    */ ae_vector* x,
		      ae_int_t n,
		      ae_state *_state);

  void apperiodicmap(double* x,
		     double a,
		     double b,
		     double* k,
		     ae_state *_state);

  void tagsortfasti(/* Real    */ ae_vector* a,
		    /* Integer */ ae_vector* b,
		    /* Real    */ ae_vector* bufa,
		    /* Integer */ ae_vector* bufb,
		    ae_int_t n,
		    ae_state *_state);

}

//#include "linalg.h"
namespace alglib_impl
{
  typedef struct
  {
    double e1;
    double e2;
    ae_vector x;
    ae_vector ax;
    double xax;
    ae_int_t n;
    ae_vector rk;
    ae_vector rk1;
    ae_vector xk;
    ae_vector xk1;
    ae_vector pk;
    ae_vector pk1;
    ae_vector b;
    rcommstate rstate;
    ae_vector tmp2;
  } fblslincgstate;

  ae_bool _fblslincgstate_init(fblslincgstate* p, ae_state *_state, ae_bool make_automatic);

  void rmatrixgemm(ae_int_t m,
		   ae_int_t n,
		   ae_int_t k,
		   double alpha,
		   /* Real    */ ae_matrix* a,
		   ae_int_t ia,
		   ae_int_t ja,
		   ae_int_t optypea,
		   /* Real    */ ae_matrix* b,
		   ae_int_t ib,
		   ae_int_t jb,
		   ae_int_t optypeb,
		   double beta,
		   /* Real    */ ae_matrix* c,
		   ae_int_t ic,
		   ae_int_t jc,
		   ae_state *_state);

  ae_bool spdmatrixcholesky(/* Real    */ ae_matrix* a,
			    ae_int_t n,
			    ae_bool isupper,
			    ae_state *_state);

  void fblscholeskysolve(/* Real    */ ae_matrix* cha,
			 double sqrtscalea,
			 ae_int_t n,
			 ae_bool isupper,
			 /* Real    */ ae_vector* xb,
			 /* Real    */ ae_vector* tmp,
			 ae_state *_state);

}

namespace alglib_impl
{
  typedef struct
  {
    double taskrcond;
    double rmserror;
    double avgerror;
    double avgrelerror;
    double maxerror;
  } spline1dfitreport;
  
  typedef struct
  {
    ae_bool periodic;
    ae_int_t n;
    ae_int_t k;
    ae_vector x;
    ae_vector c;
  } spline1dinterpolant;
  
  void spline1dconvdiffinternal(/* Real    */ ae_vector* xold,
				/* Real    */ ae_vector* yold,
				/* Real    */ ae_vector* dold,
				ae_int_t n,
				/* Real    */ ae_vector* x2,
				ae_int_t n2,
				/* Real    */ ae_vector* y,
				ae_bool needy,
				/* Real    */ ae_vector* d1,
				ae_bool needd1,
				/* Real    */ ae_vector* d2,
				ae_bool needd2,
				ae_state *_state);
  
  void heapsortdpoints(/* Real    */ ae_vector* x,
		       /* Real    */ ae_vector* y,
		       /* Real    */ ae_vector* d,
		       ae_int_t n,
		       ae_state *_state);
  
  void spline1dbuildhermite(/* Real    */ ae_vector* x,
			    /* Real    */ ae_vector* y,
			    /* Real    */ ae_vector* d,
			    ae_int_t n,
			    spline1dinterpolant* c,
			    ae_state *_state);

  ae_bool _spline1dinterpolant_init(spline1dinterpolant* p,
				    ae_state *_state,
				    ae_bool make_automatic);
  ae_bool _spline1dinterpolant_init_copy(spline1dinterpolant* dst,
					 spline1dinterpolant* src,
					 ae_state *_state,
					 ae_bool make_automatic);
  void _spline1dinterpolant_clear(spline1dinterpolant* p);

  ae_bool _spline1dfitreport_init(spline1dfitreport* p, ae_state *_state, ae_bool make_automatic);
  ae_bool _spline1dfitreport_init_copy(spline1dfitreport* dst, spline1dfitreport* src, ae_state *_state, ae_bool make_automatic);
  void _spline1dfitreport_clear(spline1dfitreport* p);

  void spline1dfitpenalized(/* Real    */ ae_vector* x,
			    /* Real    */ ae_vector* y,
			    ae_int_t n,
			    ae_int_t m,
			    double rho,
			    ae_int_t* info,
			    spline1dinterpolant* s,
			    spline1dfitreport* rep,
			    ae_state *_state);
  void spline1dfitpenalizedw(/* Real    */ ae_vector* x,
			     /* Real    */ ae_vector* y,
			     /* Real    */ ae_vector* w,
			     ae_int_t n,
			     ae_int_t m,
			     double rho,
			     ae_int_t* info,
			     spline1dinterpolant* s,
			     spline1dfitreport* rep,
			     ae_state *_state);

  double spline1dcalc(spline1dinterpolant* c, double x, ae_state *_state);

  void lsfitscalexy(/* Real    */ ae_vector* x,
		    /* Real    */ ae_vector* y,
		    /* Real    */ ae_vector* w,
		    ae_int_t n,
		    /* Real    */ ae_vector* xc,
		    /* Real    */ ae_vector* yc,
		    /* Integer */ ae_vector* dc,
		    ae_int_t k,
		    double* xa,
		    double* xb,
		    double* sa,
		    double* sb,
		    /* Real    */ ae_vector* xoriginal,
		    /* Real    */ ae_vector* yoriginal,
		    ae_state *_state);

  void spline1dconvcubic(/* Real    */ ae_vector* x,
			 /* Real    */ ae_vector* y,
			 ae_int_t n,
			 ae_int_t boundltype,
			 double boundl,
			 ae_int_t boundrtype,
			 double boundr,
			 /* Real    */ ae_vector* x2,
			 ae_int_t n2,
			 /* Real    */ ae_vector* y2,
			 ae_state *_state);

  void spline1dgriddiffcubic(/* Real    */ ae_vector* x,
			     /* Real    */ ae_vector* y,
			     ae_int_t n,
			     ae_int_t boundltype,
			     double boundl,
			     ae_int_t boundrtype,
			     double boundr,
			     /* Real    */ ae_vector* d,
			     ae_state *_state);

  void spline1dlintransx(spline1dinterpolant* c,
			 double a,
			 double b,
			 ae_state *_state);
  void spline1dlintransy(spline1dinterpolant* c,
			 double a,
			 double b,
			 ae_state *_state);
}

////////////////////

namespace alglib
{
  /*************************************************************************
  1-dimensional spline inteprolant
  *************************************************************************/
  class _spline1dinterpolant_owner
  {
  public:
    _spline1dinterpolant_owner();
    _spline1dinterpolant_owner(const _spline1dinterpolant_owner &rhs);
    _spline1dinterpolant_owner& operator=(const _spline1dinterpolant_owner &rhs);
    virtual ~_spline1dinterpolant_owner();
    alglib_impl::spline1dinterpolant* c_ptr();
    alglib_impl::spline1dinterpolant* c_ptr() const;
  protected:
    alglib_impl::spline1dinterpolant *p_struct;
  };
  class spline1dinterpolant : public _spline1dinterpolant_owner
  {
  public:
    spline1dinterpolant();
    spline1dinterpolant(const spline1dinterpolant &rhs);
    spline1dinterpolant& operator=(const spline1dinterpolant &rhs);
    virtual ~spline1dinterpolant();

  };

  /*************************************************************************
Spline fitting report:
    RMSError        RMS error
    AvgError        average error
    AvgRelError     average relative error (for non-zero Y[I])
    MaxError        maximum error

Fields  below are  filled  by   obsolete    functions   (Spline1DFitCubic,
Spline1DFitHermite). Modern fitting functions do NOT fill these fields:
    TaskRCond       reciprocal of task's condition number
  *************************************************************************/
  class _spline1dfitreport_owner
  {
  public:
    _spline1dfitreport_owner();
    _spline1dfitreport_owner(const _spline1dfitreport_owner &rhs);
    _spline1dfitreport_owner& operator=(const _spline1dfitreport_owner &rhs);
    virtual ~_spline1dfitreport_owner();
    alglib_impl::spline1dfitreport* c_ptr();
    alglib_impl::spline1dfitreport* c_ptr() const;
  protected:
    alglib_impl::spline1dfitreport *p_struct;
  };
  class spline1dfitreport : public _spline1dfitreport_owner
  {
  public:
    spline1dfitreport();
    spline1dfitreport(const spline1dfitreport &rhs);
    spline1dfitreport& operator=(const spline1dfitreport &rhs);
    virtual ~spline1dfitreport();
    double &taskrcond;
    double &rmserror;
    double &avgerror;
    double &avgrelerror;
    double &maxerror;

  };

  /*************************************************************************
Rational least squares fitting using  Floater-Hormann  rational  functions
with optimal D chosen from [0,9].

Equidistant  grid  with M node on [min(x),max(x)]  is  used to build basis
functions. Different values of D are tried, optimal  D  (least  root  mean
square error) is chosen.  Task  is  linear, so linear least squares solver
is used. Complexity  of  this  computational  scheme is  O(N*M^2)  (mostly
dominated by the least squares solver).

INPUT PARAMETERS:
    X   -   points, array[0..N-1].
    Y   -   function values, array[0..N-1].
    N   -   number of points, N>0.
    M   -   number of basis functions ( = number_of_nodes), M>=2.

OUTPUT PARAMETERS:
    Info-   same format as in LSFitLinearWC() subroutine.
    * Info>0    task is solved
    * Info<=0   an error occured:
                        -4 means inconvergence of internal SVD
                        -3 means inconsistent constraints
    B   -   barycentric interpolant.
    Rep -   report, same format as in LSFitLinearWC() subroutine.
            Following fields are set:
            * DBest         best value of the D parameter
            * RMSError      rms error on the (X,Y).
            * AvgError      average error on the (X,Y).
            * AvgRelError   average relative error on the non-zero Y
            * MaxError      maximum error
                            NON-WEIGHTED ERRORS ARE CALCULATED

  -- ALGLIB PROJECT --
     Copyright 18.08.2009 by Bochkanov Sergey
  *************************************************************************/
  void spline1dfitpenalized(const real_1d_array &x,
			    const real_1d_array &y,
			    const ae_int_t n,
			    const ae_int_t m,
			    const double rho,
			    ae_int_t &info,
			    spline1dinterpolant &s,
			    spline1dfitreport &rep);

  void spline1dfitpenalized(const real_1d_array &x,
			    const real_1d_array &y,
			    const ae_int_t m,
			    const double rho,
			    ae_int_t &info,
			    spline1dinterpolant &s,
			    spline1dfitreport &rep);

  /*************************************************************************
Weighted fitting by penalized cubic spline.

Equidistant grid with M nodes on [min(x,xc),max(x,xc)] is  used  to  build
basis functions. Basis functions are cubic splines with  natural  boundary
conditions. Problem is regularized by  adding non-linearity penalty to the
usual least squares penalty function:

    S(x) = arg min { LS + P }, where
    LS   = SUM { w[i]^2*(y[i] - S(x[i]))^2 } - least squares penalty
    P    = C*10^rho*integral{ S''(x)^2*dx } - non-linearity penalty
    rho  - tunable constant given by user
    C    - automatically determined scale parameter,
           makes penalty invariant with respect to scaling of X, Y, W.

INPUT PARAMETERS:
    X   -   points, array[0..N-1].
    Y   -   function values, array[0..N-1].
    W   -   weights, array[0..N-1]
            Each summand in square  sum  of  approximation deviations from
            given  values  is  multiplied  by  the square of corresponding
            weight. Fill it by 1's if you don't  want  to  solve  weighted
            problem.
    N   -   number of points (optional):
    * N>0
    * if given, only first N elements of X/Y/W are processed
    * if not given, automatically determined from X/Y/W sizes
    M   -   number of basis functions ( = number_of_nodes), M>=4.
    Rho -   regularization  constant  passed   by   user.   It   penalizes
            nonlinearity in the regression spline. It  is  logarithmically
            scaled,  i.e.  actual  value  of  regularization  constant  is
            calculated as 10^Rho. It is automatically scaled so that:
            * Rho=2.0 corresponds to moderate amount of nonlinearity
            * generally, it should be somewhere in the [-8.0,+8.0]
            If you do not want to penalize nonlineary,
            pass small Rho. Values as low as -15 should work.

OUTPUT PARAMETERS:
    Info-   same format as in LSFitLinearWC() subroutine.
    * Info>0    task is solved
    * Info<=0   an error occured:
                        -4 means inconvergence of internal SVD or
                           Cholesky decomposition; problem may be
                           too ill-conditioned (very rare)
    S   -   spline interpolant.
    Rep -   Following fields are set:
    * RMSError      rms error on the (X,Y).
    * AvgError      average error on the (X,Y).
    * AvgRelError   average relative error on the non-zero Y
    * MaxError      maximum error
                            NON-WEIGHTED ERRORS ARE CALCULATED

IMPORTANT:
    this subroitine doesn't calculate task's condition number for K<>0.

NOTE 1: additional nodes are added to the spline outside  of  the  fitting
interval to force linearity when x<min(x,xc) or x>max(x,xc).  It  is  done
for consistency - we penalize non-linearity  at [min(x,xc),max(x,xc)],  so
it is natural to force linearity outside of this interval.

NOTE 2: function automatically sorts points,  so  caller may pass unsorted
array.

  -- ALGLIB PROJECT --
     Copyright 19.10.2010 by Bochkanov Sergey
  *************************************************************************/

  void spline1dfitpenalizedw(const real_1d_array &x,
			     const real_1d_array &y,
			     const real_1d_array &w,
			     const ae_int_t n,
			     const ae_int_t m,
			     const double rho,
			     ae_int_t &info,
			     spline1dinterpolant &s,
			     spline1dfitreport &rep);

  void spline1dfitpenalizedw(const real_1d_array &x,
			     const real_1d_array &y,
			     const real_1d_array &w,
			     const ae_int_t m,
			     const double rho,
			     ae_int_t &info,
			     spline1dinterpolant &s,
			     spline1dfitreport &rep);


  ///////////////////////////////////////////////////////////////////

  double spline1dcalc(const spline1dinterpolant &c, const double x);

}

#endif
