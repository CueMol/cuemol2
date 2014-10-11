#include "interpolation.hpp"

namespace alglib_impl
{

  /*************************************************************************
This subroutine calculates the value of the spline at the given point X.

INPUT PARAMETERS:
    C   -   spline interpolant
    X   -   point

Result:
    S(x)

  -- ALGLIB PROJECT --
     Copyright 23.06.2007 by Bochkanov Sergey
  *************************************************************************/
  double spline1dcalc(spline1dinterpolant* c, double x, ae_state *_state)
  {
    ae_int_t l;
    ae_int_t r;
    ae_int_t m;
    double t;
    double result;


    ae_assert(c->k==3, "Spline1DCalc: internal error", _state);
    ae_assert(!ae_isinf(x, _state), "Spline1DCalc: infinite X!", _state);
    
    /*
     * special case: NaN
     */
    if( ae_isnan(x, _state) )
      {
        result = _state->v_nan;
        return result;
      }
    
    /*
     * correct if periodic
     */
    if( c->periodic )
      {
        apperiodicmap(&x, c->x.ptr.p_double[0], c->x.ptr.p_double[c->n-1], &t, _state);
      }
    
    /*
     * Binary search in the [ x[0], ..., x[n-2] ] (x[n-1] is not included)
     */
    l = 0;
    r = c->n-2+1;
    while(l!=r-1)
      {
        m = (l+r)/2;
        if( c->x.ptr.p_double[m]>=x )
	  {
            r = m;
	  }
        else
	  {
            l = m;
	  }
      }
    
    /*
     * Interpolation
     */
    x = x-c->x.ptr.p_double[l];
    m = 4*l;
    result = c->c.ptr.p_double[m]+x*(c->c.ptr.p_double[m+1]+x*(c->c.ptr.p_double[m+2]+x*c->c.ptr.p_double[m+3]));
    return result;
  }

  /*************************************************************************
This subroutine differentiates the spline.

INPUT PARAMETERS:
    C   -   spline interpolant.
    X   -   point

Result:
    S   -   S(x)
    DS  -   S'(x)
    D2S -   S''(x)

  -- ALGLIB PROJECT --
     Copyright 24.06.2007 by Bochkanov Sergey
  *************************************************************************/
  void spline1ddiff(spline1dinterpolant* c,
		    double x,
		    double* s,
		    double* ds,
		    double* d2s,
		    ae_state *_state)
  {
    ae_int_t l;
    ae_int_t r;
    ae_int_t m;
    double t;

    *s = 0;
    *ds = 0;
    *d2s = 0;

    ae_assert(c->k==3, "Spline1DDiff: internal error", _state);
    ae_assert(!ae_isinf(x, _state), "Spline1DDiff: infinite X!", _state);
    
    /*
     * special case: NaN
     */
    if( ae_isnan(x, _state) )
      {
        *s = _state->v_nan;
        *ds = _state->v_nan;
        *d2s = _state->v_nan;
        return;
      }
    
    /*
     * correct if periodic
     */
    if( c->periodic )
      {
        apperiodicmap(&x, c->x.ptr.p_double[0], c->x.ptr.p_double[c->n-1], &t, _state);
      }
    
    /*
     * Binary search
     */
    l = 0;
    r = c->n-2+1;
    while(l!=r-1)
      {
        m = (l+r)/2;
        if( c->x.ptr.p_double[m]>=x )
	  {
            r = m;
	  }
        else
	  {
            l = m;
	  }
      }
    
    /*
     * Differentiation
     */
    x = x-c->x.ptr.p_double[l];
    m = 4*l;
    *s = c->c.ptr.p_double[m]+x*(c->c.ptr.p_double[m+1]+x*(c->c.ptr.p_double[m+2]+x*c->c.ptr.p_double[m+3]));
    *ds = c->c.ptr.p_double[m+1]+2*x*c->c.ptr.p_double[m+2]+3*ae_sqr(x, _state)*c->c.ptr.p_double[m+3];
    *d2s = 2*c->c.ptr.p_double[m+2]+6*x*c->c.ptr.p_double[m+3];
  }

  /*************************************************************************
This subroutine performs linear transformation of the spline argument.

INPUT PARAMETERS:
    C   -   spline interpolant.
    A, B-   transformation coefficients: x = A*t + B
Result:
    C   -   transformed spline

  -- ALGLIB PROJECT --
     Copyright 30.06.2007 by Bochkanov Sergey
  *************************************************************************/
  void spline1dlintransx(spline1dinterpolant* c,
			 double a,
			 double b,
			 ae_state *_state)
  {
    ae_frame _frame_block;
    ae_int_t i;
    ae_int_t j;
    ae_int_t n;
    double v;
    double dv;
    double d2v;
    ae_vector x;
    ae_vector y;
    ae_vector d;

    ae_frame_make(_state, &_frame_block);
    ae_vector_init(&x, 0, DT_REAL, _state, ae_true);
    ae_vector_init(&y, 0, DT_REAL, _state, ae_true);
    ae_vector_init(&d, 0, DT_REAL, _state, ae_true);

    n = c->n;
    
    /*
     * Special case: A=0
     */
    if( ae_fp_eq(a,0) )
      {
        v = spline1dcalc(c, b, _state);
        for(i=0; i<=n-2; i++)
	  {
            c->c.ptr.p_double[(c->k+1)*i] = v;
            for(j=1; j<=c->k; j++)
	      {
                c->c.ptr.p_double[(c->k+1)*i+j] = 0;
	      }
	  }
        ae_frame_leave(_state);
        return;
      }
    
    /*
     * General case: A<>0.
     * Unpack, X, Y, dY/dX.
     * Scale and pack again.
     */
    ae_assert(c->k==3, "Spline1DLinTransX: internal error", _state);
    ae_vector_set_length(&x, n-1+1, _state);
    ae_vector_set_length(&y, n-1+1, _state);
    ae_vector_set_length(&d, n-1+1, _state);
    for(i=0; i<=n-1; i++)
      {
        x.ptr.p_double[i] = c->x.ptr.p_double[i];
        spline1ddiff(c, x.ptr.p_double[i], &v, &dv, &d2v, _state);
        x.ptr.p_double[i] = (x.ptr.p_double[i]-b)/a;
        y.ptr.p_double[i] = v;
        d.ptr.p_double[i] = a*dv;
      }
    spline1dbuildhermite(&x, &y, &d, n, c, _state);
    ae_frame_leave(_state);
  }


  /*************************************************************************
This subroutine performs linear transformation of the spline.

INPUT PARAMETERS:
    C   -   spline interpolant.
    A, B-   transformation coefficients: S2(x) = A*S(x) + B
Result:
    C   -   transformed spline

  -- ALGLIB PROJECT --
     Copyright 30.06.2007 by Bochkanov Sergey
  *************************************************************************/
  void spline1dlintransy(spline1dinterpolant* c,
			 double a,
			 double b,
			 ae_state *_state)
  {
    ae_int_t i;
    ae_int_t j;
    ae_int_t n;


    n = c->n;
    for(i=0; i<=n-2; i++)
      {
        c->c.ptr.p_double[(c->k+1)*i] = a*c->c.ptr.p_double[(c->k+1)*i]+b;
        for(j=1; j<=c->k; j++)
	  {
            c->c.ptr.p_double[(c->k+1)*i+j] = a*c->c.ptr.p_double[(c->k+1)*i+j];
	  }
      }
  }


}
