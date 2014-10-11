
#include "spline_impl2.hpp"
#include <string>
#include <stdio.h>

namespace spline1d {

  using std::vector;

  // Tridiagonal solver. Solves
  // 
  // ( B[0] C[0]                      )
  // ( A[1] B[1] C[1]                 )
  // (      A[2] B[2] C[2]            )
  // (            ..........          ) * X = D
  // (            ..........          )
  // (           A[N-2] B[N-2] C[N-2] )
  // (                  A[N-1] B[N-1] )
  //

  void solveTriDiagonal(const vector<double> &a,
			const vector<double> &b,
			const vector<double> &c,
			const vector<double> &d,
			size_t n,
			vector<double> &x)
  {
    vector<double> _b = b;
    vector<double> _d = d;
    int k;
    double t;
  
    if( x.size()<n )
      x.resize(n);

    for (k=1; k<n; k++) {
      t = a[k] / _b[k-1];
      _b[k] = _b[k] - t*c[k-1];
      _d[k] = _d[k] - t*_d[k-1];
    }

    x[n-1] = _d[n-1] / _b[n-1];

    for (k=n-2; k>=0; k--) {
      x[k] = (_d[k] - c[k]*x[k+1])/_b[k];
    }
  }


  //////////////////////////////////////////////


  // 
  // Internal version of Spline1DGridDiffCubic.
  // 
  // Accepts pre-ordered X/Y, temporary arrays (which may be  preallocated,  if
  // you want to save time, or not) and output array (which may be preallocated
  // too).
  // 
  // Y is passed as var-parameter because we may need to force last element  to
  // be equal to the first one (if periodic boundary conditions are specified).
  // 
  //   -- ALGLIB PROJECT --
  //      Copyright 03.09.2010 by Bochkanov Sergey
  // 
  void gridDiffCubicImpl(const vector<double> &x,
			 const vector<double> &y,
			 const size_t n,
			 // ae_int_t boundltype,
			 // double boundl,
			 // ae_int_t boundrtype,
			 // double boundr,
			 vector<double> &d,
			 vector<double> &a1,
			 vector<double> &a2,
			 vector<double> &a3,
			 vector<double> &b,
			 vector<double> &dt)
  {
    int i;
    
    //
    // allocate output arrays
    //
    d.resize(n);
    a1.resize(n);
    a2.resize(n);
    a3.resize(n);
    b.resize(n);
    dt.resize(n);
    
    const double boundl = 0.0;
    const double boundr = 0.0;

    //fprintf(stderr, "*** 1 \n");

    //
    // Non-periodic boundary condition.
    // Left boundary conditions.
    //  ( boundltype==2 )
    //
    a1[0] = 0;
    a2[0] = 2;
    a3[0] = 1;
    b[0] = 3*( y[1] - y[0] )/( x[1] - x[0] )
      - 0.5*boundl*( x[1] - x[0] );
        
    //fprintf(stderr, "*** 2 \n");

    //
    // Central conditions
    //
    for (i=1; i<=n-2; i++) {
      a1[i] = x[i+1] - x[i];
      a2[i] = 2.0*(x[i+1] - x[i-1]);
      a3[i] = x[i] - x[i-1];
      b[i] = 3*( y[i] - y[i-1] )/( x[i] - x[i-1] )*( x[i+1] - x[i] )
	+ 3*( y[i+1] - y[i] )/( x[i+1] - x[i] )*( x[i] - x[i-1] );
    }
    
    //fprintf(stderr, "*** 3 \n");

    //
    // Right boundary conditions
    //  ( boundrtype==2 )
    //
    a1[n-1] = 1;
    a2[n-1] = 2;
    a3[n-1] = 0;
    b[n-1] = 3*( y[n-1] - y[n-2] )/( x[n-1] - x[n-2] ) +
      0.5*boundr*( x[n-1] - x[n-2] );

    //fprintf(stderr, "*** 4 \n");

        
    //
    // Solve
    //
    solveTriDiagonal(a1, a2, a3, b,
		     n,
		     d);

    //fprintf(stderr, "*** 5 \n");
    // --> d is a result
  }

  ////////////////////////////////////////

  //
  // Function: gridDiff2Cubic(...)
  //
  // given table y[] of function values
  // at  nodes  x[],  it  calculates  and  returns  tables  of first and second
  // function derivatives d1[] and d2[] (calculated at the same nodes x[]).
  // 
  // This function yields same result as Spline1DBuildCubic() call followed  by
  // sequence of Spline1DDiff() calls, but it can be several times faster  when
  // called for ordered X[] and X2[].
  // 
  // INPUT PARAMETERS:
  //     X           -   spline nodes
  //     Y           -   function values
  // 
  // OPTIONAL PARAMETERS:
  //     N           -   points count:
  //                     * N>=2
  //                     * if given, only first N points are used
  //                     * if not given, automatically detected from X/Y sizes
  //                       (len(X) must be equal to len(Y))
  //     BoundLType  -   boundary condition type for the left boundary
  //     BoundL      -   left boundary condition (first or second derivative,
  //                     depending on the BoundLType)
  //     BoundRType  -   boundary condition type for the right boundary
  //     BoundR      -   right boundary condition (first or second derivative,
  //                     depending on the BoundRType)
  // 
  // OUTPUT PARAMETERS:
  //     D1          -   S' values at X[]
  //     D2          -   S'' values at X[]
  // 
  // ORDER OF POINTS
  // 
  // Subroutine automatically sorts points, so caller may pass unsorted array.
  // Derivative values are correctly reordered on return, so  D[I]  is  always
  // equal to S'(X[I]) independently of points order.
  // 
  // SETTING BOUNDARY VALUES:
  // 
  // The BoundLType/BoundRType parameters can have the following values:
  //     * -1, which corresonds to the periodic (cyclic) boundary conditions.
  //           In this case:
  //           * both BoundLType and BoundRType must be equal to -1.
  //           * BoundL/BoundR are ignored
  //           * Y[last] is ignored (it is assumed to be equal to Y[first]).
  //     *  0, which  corresponds  to  the  parabolically   terminated  spline
  //           (BoundL and/or BoundR are ignored).
  //     *  1, which corresponds to the first derivative boundary condition
  //     *  2, which corresponds to the second derivative boundary condition
  //     *  by default, BoundType=0 is used
  // 
  // PROBLEMS WITH PERIODIC BOUNDARY CONDITIONS:
  // 
  // Problems with periodic boundary conditions have Y[first_point]=Y[last_point].
  // However, this subroutine doesn't require you to specify equal  values  for
  // the first and last points - it automatically forces them  to  be  equal by
  // copying  Y[first_point]  (corresponds  to the leftmost,  minimal  X[])  to
  // Y[last_point]. However it is recommended to pass consistent values of Y[],
  // i.e. to make Y[first_point]=Y[last_point].
  // 
  //   -- ALGLIB PROJECT --
  //      Copyright 03.09.2010 by Bochkanov Sergey
  //

  void gridDiff2Cubic(const vector<double> &x,
		      const vector<double> &y,
		      vector<double> &d1,
		      vector<double> &d2)
  {
    vector<double> _x = x;
    vector<double> _y = y;

    vector<double> a1;
    vector<double> a2;
    vector<double> a3;
    vector<double> b;
    vector<double> dt;
    vector<int> p;
    int i;
    // size_t ylen;

    const size_t n = x.size();
    /*
    vector<double>_clear(d1);
    vector<double>_clear(d2);
    vector<double>_init(&a1, 0, DT_REAL, _state, ae_true);
    vector<double>_init(&a2, 0, DT_REAL, _state, ae_true);
    vector<double>_init(&a3, 0, DT_REAL, _state, ae_true);
    vector<double>_init(&b, 0, DT_REAL, _state, ae_true);
    vector<double>_init(&dt, 0, DT_REAL, _state, ae_true);
    vector<double>_init(&p, 0, DT_INT, _state, ae_true);
    */
    
    //
    // check lengths of arguments
    //
    // ae_assert(n>=2, "Spline1DGridDiff2Cubic: N<2!", _state);
    // ae_assert(x->cnt>=n, "Spline1DGridDiff2Cubic: Length(X)<N!", _state);
    // ae_assert(y->cnt>=n, "Spline1DGridDiff2Cubic: Length(Y)<N!", _state);
    
    /*
     * check and sort points
     */
    /*
    ylen = n;
    if( boundltype==-1 )
    {
        ylen = n-1;
    }
    ae_assert(isfinitevector(x, n, _state), "Spline1DGridDiff2Cubic: X contains infinite or NAN values!", _state);
    ae_assert(isfinitevector(y, ylen, _state), "Spline1DGridDiff2Cubic: Y contains infinite or NAN values!", _state);
    spline1d_heapsortppoints(x, y, &p, n, _state);
    ae_assert(aredistinct(x, n, _state), "Spline1DGridDiff2Cubic: at least two consequent points are too close!", _state);
    */
    
    //fprintf(stderr, "*** 00000 \n");
    /*
     * Now we've checked and preordered everything,
     * so we can call internal function.
     *
     * After this call we will calculate second derivatives
     * (manually, by converting to the power basis)
     */
    gridDiffCubicImpl(x, y, n,
		      d1,
		      a1, a2, a3, b, dt);

    // calc D2
    //fprintf(stderr, "*** 11111 \n");

    double delta;
    double delta2;
    double delta3;
    double s0;
    double s1;
    double s2;
    double s3;

    d2.resize(n);
    delta = 0;
    s2 = 0;
    s3 = 0;
    for (i=0; i<=n-2; i++) {
      /*
       * We convert from Hermite basis to the power basis.
       * Si is coefficient before x^i.
       *
       * Inside this cycle we need just S2,
       * because we calculate S'' exactly at spline node,
       * (only x^2 matters at x=0), but after iterations
       * will be over, we will need other coefficients
       * to calculate spline value at the last node.
       */
      delta = x[i+1]-x[i];
      delta2 = delta*delta; // sqr(delta, _state);
      delta3 = delta*delta2;
      s0 = y[i];
      s1 = d1[i];
      s2 = (3*(y[i+1]-y[i])-2*d1[i]*delta-d1[i+1]*delta)/delta2;
      s3 = (2*(y[i]-y[i+1])+d1[i]*delta+d1[i+1]*delta)/delta3;
      d2[i] = 2*s2;
    }
    d2[n-1] = 2*s2+6*s3*delta;
    
    /*
     * Remember that HeapSortPPoints() call?
     * Now we have to reorder them back.
     */
    /*
      if( dt.cnt<n )
    {
        vector<double>_set_length(&dt, n, _state);
    }
    for(i=0; i<=n-1; i++)
    {
        dt.ptr.p_double[p.ptr.p_int[i]] = d1[i];
    }
    ae_v_move(&d1[0], 1, &dt.ptr.p_double[0], 1, ae_v_len(0,n-1));
    for(i=0; i<=n-1; i++)
    {
        dt.ptr.p_double[p.ptr.p_int[i]] = d2[i];
    }
    ae_v_move(&d2[0], 1, &dt.ptr.p_double[0], 1, ae_v_len(0,n-1));
 */
  }

  ////////////////////////////////////////////////////////

  void Spline1DCoeff::buildHermite(const vector<double> &x,
				   const vector<double> &y,
				   const vector<double> &d)
  {
    vector<double> _x = x;
    vector<double> _y = y;
    vector<double> _d = d;
    int i;
    const size_t n = x.size();
    double delta;
    double delta2;
    double delta3;

    // _spline1dinterpolant_clear(c);
    // ae_assert(n>=2, "Spline1DBuildHermite: N<2!", _state);
    // ae_assert(x->cnt>=n, "Spline1DBuildHermite: Length(X)<N!", _state);
    // ae_assert(y->cnt>=n, "Spline1DBuildHermite: Length(Y)<N!", _state);
    // ae_assert(d->cnt>=n, "Spline1DBuildHermite: Length(D)<N!", _state);
    
    //
    // Build
    //
    m_x.resize( n );
    m_c.resize( 4*(n-1) );
    // vector<double>_set_length(&c->x, n, _state);
    // vector<double>_set_length(&c->c, 4*(n-1), _state);
    m_periodic = false;
    m_k = 3;
    m_n = n;

    for (i=0; i<=n-1; i++) {
      m_x[i] = x[i];
    }

    for(i=0; i<=n-2; i++) {
      delta = x[i+1]-x[i];
      delta2 = delta*delta; //ae_sqr(delta, _state);
      delta3 = delta*delta2;
      m_c[4*i+0] = y[i];
      m_c[4*i+1] = d[i];
      m_c[4*i+2] = (3*(y[i+1]-y[i])-2*d[i]*delta-d[i+1]*delta)/delta2;
      m_c[4*i+3] = (2*(y[i]-y[i+1])+d[i]*delta+d[i+1]*delta)/delta3;
    }
  }


  ////////////////////////////////////////////////////////

  void Spline1DCoeff::buildCubic(const vector<double> &x,
				 const vector<double> &y)
  {
    vector<double> _x = x;
    vector<double> _y = y;
    vector<double> a1;
    vector<double> a2;
    vector<double> a3;
    vector<double> b;
    vector<double> dt;
    vector<double> d;
    // vector<int> p;
    // ae_int_t ylen;
    
    const size_t n = x.size();

    //
    // check lengths of arguments
    //
    // ae_assert(n>=2, "Spline1DBuildCubic: N<2!", _state);
    // ae_assert(x->cnt>=n, "Spline1DBuildCubic: Length(X)<N!", _state);
    // ae_assert(y->cnt>=n, "Spline1DBuildCubic: Length(Y)<N!", _state);
    
    //
    // Now we've checked and preordered everything,
    // so we can call internal function to calculate derivatives,
    // and then build Hermite spline using these derivatives
    //

    // calc 1st derivatives
    gridDiffCubicImpl(x, y, n,
		      d, a1, a2, a3, b, dt);

    // build Hermite spline using the first derivative
    buildHermite(x, y, d);

  }

}
