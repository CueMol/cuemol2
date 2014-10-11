// -*-Mode: C++;-*-
//
// LM minimizer
//
// $Id: LMMinimizer.cpp,v 1.1 2010/11/16 14:55:53 rishitani Exp $

#include <common.h>
#include "LMMinimizer.hpp"
#include "minpack.hpp"

using namespace minpack;

LMMinimizer::LMMinimizer(EvalFcn *pfcn, int m, int n, double dtol/*=0.00001*/)
  : m_m(m), m_n(n), m_dtol(dtol), m_pfcn(pfcn)
{
  int i=1;
  m_dtol = minpack::dpmpar_(&i);
  m_lwa = m*n+5*n+m;

  m_wa = new double[m_lwa];
  m_iwa = new int[n];
}

LMMinimizer::~LMMinimizer()
{
  delete [] m_wa;
  delete [] m_iwa;
}

void LMMinimizer::minimize(qlib::Array<double> &x_ary,
			   qlib::Array<double> &fvec_ary)
{
  int m = m_m;
  int n = m_n;
  double *x = const_cast<double *>(&x_ary[0]);
  double *fvec = const_cast<double *>(&fvec_ary[0]);

  int maxfev = 200*(n + 1);
  double ftol = m_dtol;
  double xtol = m_dtol;
  double gtol = 0.0;
  double epsfcn = 0.0;
  double factor = 1.0e2;
  int mode = 1;
  int nprint = 0;
  int mp5n = m + 5*n;
  int nfev = 0;

  lmdif_(&m, &n, x, fvec,
	 &ftol, &xtol, &gtol, &maxfev, &epsfcn,
	 &m_wa[0], &mode, &factor, &nprint, &m_info,
	 &nfev, &m_wa[mp5n], &m, m_iwa, &m_wa[n],
	 &m_wa[2*n], &m_wa[3*n], &m_wa[4*n], &m_wa[5*n]);

  m_chisq = enorm_(&m, fvec);
}

double LMMinimizer::calcEnorm(qlib::Array<double> &fvec_ary)
{
  double *fvec = const_cast<double *>(&fvec_ary[0]);
  int m = fvec_ary.size();
  return enorm_(&m, fvec);
}

/*
int LMMinimizer::evalfcn(int *m, int *n, double *x, double *fvec, int *iflag)
{
  LOG_DPRINTLN("EVALFCN %p", m_pfcn);
  m_pfcn->eval(x, fvec, *iflag);
  return 0;
}

*/

