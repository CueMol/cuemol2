//
// $Id: minpack.hpp,v 1.1 2010/11/16 14:55:53 rishitani Exp $
//

#ifndef QLIB_MINPACK_H
#define QLIB_MINPACK_H

namespace minpack {

  typedef int (*U_fp)(...);
  typedef int (*S_fp)(...);

  int chkder_(int *m, int *n, double *x,
		     double *fvec, double *fjac, int *ldfjac,
		     double *xp, double *fvecp, int *mode,
		     double *err);

  int lmder1_(U_fp fcn, int *m, int *n, 
		     double *x, double *fvec, double *fjac, 
		     int *ldfjac, double *tol, int *info, 
		     int *ipvt, double *wa, int *lwa);

  int lmdif_(S_fp fcn, int *m, int *n, double *x, 
		    double *fvec, double *ftol, double *xtol, 
		    double *gtol, int *maxfev, double *epsfcn, 
		    double *diag, int *mode, double *factor, 
		    int *nprint, int *info, int *nfev, 
		    double *fjac, int *ldfjac, int *ipvt, 
		    double *qtf, double *wa1, double *wa2, 
		    double *wa3, double *wa4);

  int fdjac2_(S_fp fcn, int *m, int *n, double *x, 
		     double *fvec, double *fjac, int *ldfjac, 
		     int *iflag, double *epsfcn, double *wa);


  double dpmpar_(int *i__);

  double enorm_(int *n, double *x);

  int qrfac_(int *m, int *n, double *a, int *
	     lda, long int *pivot, int *ipvt, int *lipvt, double *rdiag,
	     double *acnorm, double *wa);

  int lmpar_(int *n, double *r__, int *ldr, 
	     int *ipvt, double *diag, double *qtb, double *delta, 
	     double *par, double *x, double *sdiag, double *wa1, 
	     double *wa2);

  int qrsolv_(int *n, double *r__, int *ldr, 
	      int *ipvt, double *diag, double *qtb, double *x, 
	      double *sdiag, double *wa);
}

#endif

