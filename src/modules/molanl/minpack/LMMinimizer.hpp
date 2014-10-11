// -*-Mode: C++;-*-
//
// LM minimizer
//
// $Id: LMMinimizer.hpp,v 1.2 2010/11/17 13:43:30 rishitani Exp $

#ifndef ML_MINIMIZER_HPP_INCLUDED_
#define ML_MINIMIZER_HPP_INCLUDED_

#include <modules/molanl/molanl.hpp>

#ifndef NULL
#  define NULL ((void *)0)
#endif

#include <qlib/Array.hpp>

namespace minpack{

  class MOLANL_API LMMinimizer
  {
  public:
    class EvalFcn
    {
    public:
      virtual void eval(double *x, double *fvec, int iflag) =0;
    };

  private:
    /** size of parameter */
    int m_m;

    /** size of problem */
    int m_n;
    
    /** tolerance */
    double m_dtol;

    /** information flag */
    int m_info;

    /** evaluator function obj */
    EvalFcn *m_pfcn;

    /** resulting chi**2 */
    double m_chisq;

    ////////////////////////////////////////
    // work area

    int m_lwa;
    double *m_wa;
    int *m_iwa;

  public:
    LMMinimizer(EvalFcn *pfcn, int m, int n, double dtol=0.00001);
    virtual ~LMMinimizer();

    /** perform minimization*/
    void minimize(qlib::Array<double> &x, qlib::Array<double> &fvec);

    /** get the residual euclidean norm of minimization (sqrt. of sum of sqr.) */
    double getChiSq() const { return m_chisq; }

    /** calc euclidean norm (sqrt. of sum of sqr.) */
    static double calcEnorm(qlib::Array<double> &fvec);

    int getInfo() const { return m_info; }

  private:

    inline int evalfcn(int *m, int *n, double *x, double *fvec, int *iflag)
    {
      /*if (*iflag==0) {
	double fnorm = enorm_(m, fvec);
	LOG_DPRINTLN("lsq: %f", sqrt(fnorm));
	return 0;
	}*/

      m_pfcn->eval(x, fvec, *iflag);
      return 0;
    }

    int lmdif_(int *m, int *n, double *x, 
	       double *fvec, double *ftol, double *xtol, double *
	       gtol, int *maxfev, double *epsfcn, double *diag, int *
	       mode, double *factor, int *nprint, int *info, int *
	       nfev, double *fjac, int *ldfjac, int *ipvt, double *
	       qtf, double *wa1, double *wa2, double *wa3, double *
	       wa4);
    
    int fdjac2_(int *m, int *n, double *x, 
		double *fvec, double *fjac, int *ldfjac, int *iflag, 
		double *epsfcn, double *wa);
  };

}

#endif // ML_MINIMIZER_HPP_INCLUDED_
