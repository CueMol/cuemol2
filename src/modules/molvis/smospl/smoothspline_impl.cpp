#include "interpolation.hpp"
#include "spline_impl2.hpp"

namespace alglib
{

  /*************************************************************************
1-dimensional spline inteprolant
  *************************************************************************/
  _spline1dinterpolant_owner::_spline1dinterpolant_owner()
  {
    p_struct = (alglib_impl::spline1dinterpolant*)alglib_impl::ae_malloc(sizeof(alglib_impl::spline1dinterpolant), NULL);
    if( p_struct==NULL )
      throw ap_error("ALGLIB: malloc error");
    if( !alglib_impl::_spline1dinterpolant_init(p_struct, NULL, ae_false) )
      throw ap_error("ALGLIB: malloc error");
  }

  _spline1dinterpolant_owner::_spline1dinterpolant_owner(const _spline1dinterpolant_owner &rhs)
  {
    p_struct = (alglib_impl::spline1dinterpolant*)alglib_impl::ae_malloc(sizeof(alglib_impl::spline1dinterpolant), NULL);
    if( p_struct==NULL )
      throw ap_error("ALGLIB: malloc error");
    if( !alglib_impl::_spline1dinterpolant_init_copy(p_struct, const_cast<alglib_impl::spline1dinterpolant*>(rhs.p_struct), NULL, ae_false) )
      throw ap_error("ALGLIB: malloc error");
  }

  _spline1dinterpolant_owner& _spline1dinterpolant_owner::operator=(const _spline1dinterpolant_owner &rhs)
  {
    if( this==&rhs )
      return *this;
    alglib_impl::_spline1dinterpolant_clear(p_struct);
    if( !alglib_impl::_spline1dinterpolant_init_copy(p_struct, const_cast<alglib_impl::spline1dinterpolant*>(rhs.p_struct), NULL, ae_false) )
      throw ap_error("ALGLIB: malloc error");
    return *this;
  }

  _spline1dinterpolant_owner::~_spline1dinterpolant_owner()
  {
    alglib_impl::_spline1dinterpolant_clear(p_struct);
    ae_free(p_struct);
  }

  alglib_impl::spline1dinterpolant* _spline1dinterpolant_owner::c_ptr()
  {
    return p_struct;
  }

  alglib_impl::spline1dinterpolant* _spline1dinterpolant_owner::c_ptr() const
  {
    return const_cast<alglib_impl::spline1dinterpolant*>(p_struct);
  }
  spline1dinterpolant::spline1dinterpolant() : _spline1dinterpolant_owner() 
  {
  }

  spline1dinterpolant::spline1dinterpolant(const spline1dinterpolant &rhs):_spline1dinterpolant_owner(rhs) 
  {
  }

  spline1dinterpolant& spline1dinterpolant::operator=(const spline1dinterpolant &rhs)
  {
    if( this==&rhs )
      return *this;
    _spline1dinterpolant_owner::operator=(rhs);
    return *this;
  }

  spline1dinterpolant::~spline1dinterpolant()
  {
  }


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
  _spline1dfitreport_owner::_spline1dfitreport_owner()
  {
    p_struct = (alglib_impl::spline1dfitreport*)alglib_impl::ae_malloc(sizeof(alglib_impl::spline1dfitreport), NULL);
    if( p_struct==NULL )
      throw ap_error("ALGLIB: malloc error");
    if( !alglib_impl::_spline1dfitreport_init(p_struct, NULL, ae_false) )
      throw ap_error("ALGLIB: malloc error");
  }

  _spline1dfitreport_owner::_spline1dfitreport_owner(const _spline1dfitreport_owner &rhs)
  {
    p_struct = (alglib_impl::spline1dfitreport*)alglib_impl::ae_malloc(sizeof(alglib_impl::spline1dfitreport), NULL);
    if( p_struct==NULL )
      throw ap_error("ALGLIB: malloc error");
    if( !alglib_impl::_spline1dfitreport_init_copy(p_struct, const_cast<alglib_impl::spline1dfitreport*>(rhs.p_struct), NULL, ae_false) )
      throw ap_error("ALGLIB: malloc error");
  }

  _spline1dfitreport_owner& _spline1dfitreport_owner::operator=(const _spline1dfitreport_owner &rhs)
  {
    if( this==&rhs )
      return *this;
    alglib_impl::_spline1dfitreport_clear(p_struct);
    if( !alglib_impl::_spline1dfitreport_init_copy(p_struct, const_cast<alglib_impl::spline1dfitreport*>(rhs.p_struct), NULL, ae_false) )
      throw ap_error("ALGLIB: malloc error");
    return *this;
  }

  _spline1dfitreport_owner::~_spline1dfitreport_owner()
  {
    alglib_impl::_spline1dfitreport_clear(p_struct);
    ae_free(p_struct);
  }

  alglib_impl::spline1dfitreport* _spline1dfitreport_owner::c_ptr()
  {
    return p_struct;
  }

  alglib_impl::spline1dfitreport* _spline1dfitreport_owner::c_ptr() const
  {
    return const_cast<alglib_impl::spline1dfitreport*>(p_struct);
  }
  spline1dfitreport::spline1dfitreport() : _spline1dfitreport_owner() ,taskrcond(p_struct->taskrcond),rmserror(p_struct->rmserror),avgerror(p_struct->avgerror),avgrelerror(p_struct->avgrelerror),maxerror(p_struct->maxerror)
  {
  }

  spline1dfitreport::spline1dfitreport(const spline1dfitreport &rhs):_spline1dfitreport_owner(rhs) ,taskrcond(p_struct->taskrcond),rmserror(p_struct->rmserror),avgerror(p_struct->avgerror),avgrelerror(p_struct->avgrelerror),maxerror(p_struct->maxerror)
  {
  }

  spline1dfitreport& spline1dfitreport::operator=(const spline1dfitreport &rhs)
  {
    if( this==&rhs )
      return *this;
    _spline1dfitreport_owner::operator=(rhs);
    return *this;
  }

  spline1dfitreport::~spline1dfitreport()
  {
  }



/*************************************************************************
INPUT PARAMETERS:
    X   -   points, array[0..N-1].
    Y   -   function values, array[0..N-1].
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
			    const ae_int_t m,
			    const double rho,
			    ae_int_t &info,
			    spline1dinterpolant &s,
			    spline1dfitreport &rep)
  {
    alglib_impl::ae_state _alglib_env_state;    
    ae_int_t n;
    if( (x.length()!=y.length()))
      throw ap_error("Error while calling 'spline1dfitpenalized':"
		     " looks like one of arguments has wrong size");
    n = x.length();
    alglib_impl::ae_state_init(&_alglib_env_state);
    try {
      alglib_impl::spline1dfitpenalized(const_cast<alglib_impl::ae_vector*>(x.c_ptr()),
					const_cast<alglib_impl::ae_vector*>(y.c_ptr()),
					n, m, rho, &info,
					const_cast<alglib_impl::spline1dinterpolant*>(s.c_ptr()),
					const_cast<alglib_impl::spline1dfitreport*>(rep.c_ptr()),
					&_alglib_env_state);

      alglib_impl::ae_state_clear(&_alglib_env_state);
      return;
    }
    catch(alglib_impl::ae_error_type) {
      throw ap_error(_alglib_env_state.error_msg);
    }
    catch(...) {
      throw;
    }
  }

  /////////////////////////////////////

  void spline1dfitpenalizedw(const real_1d_array &x,
			     const real_1d_array &y,
			     const real_1d_array &w,
			     const ae_int_t m,
			     const double rho,
			     ae_int_t &info,
			     spline1dinterpolant &s,
			     spline1dfitreport &rep)
  {
    alglib_impl::ae_state _alglib_env_state;    
    ae_int_t n;
    if( (x.length()!=y.length()) || (x.length()!=w.length()))
      throw ap_error("Error while calling 'spline1dfitpenalizedw': looks like one of arguments has wrong size");
    n = x.length();
    alglib_impl::ae_state_init(&_alglib_env_state);
    try {
        alglib_impl::spline1dfitpenalizedw(const_cast<alglib_impl::ae_vector*>(x.c_ptr()),
					   const_cast<alglib_impl::ae_vector*>(y.c_ptr()),
					   const_cast<alglib_impl::ae_vector*>(w.c_ptr()),
					   n, m, rho, &info,
					   const_cast<alglib_impl::spline1dinterpolant*>(s.c_ptr()),
					   const_cast<alglib_impl::spline1dfitreport*>(rep.c_ptr()),
					   &_alglib_env_state);

        alglib_impl::ae_state_clear(&_alglib_env_state);
        return;
    }
    catch(alglib_impl::ae_error_type) {
      throw ap_error(_alglib_env_state.error_msg);
    }
    catch(...) {
      throw;
    }
  }


  /////////////////////////////////////

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
  double spline1dcalc(const spline1dinterpolant &c, const double x)
  {
    alglib_impl::ae_state _alglib_env_state;
    alglib_impl::ae_state_init(&_alglib_env_state);
    try
      {
        double result = alglib_impl::spline1dcalc(const_cast<alglib_impl::spline1dinterpolant*>(c.c_ptr()), x, &_alglib_env_state);
        alglib_impl::ae_state_clear(&_alglib_env_state);
        return *(reinterpret_cast<double*>(&result));
      }
    catch(alglib_impl::ae_error_type)
      {
        throw ap_error(_alglib_env_state.error_msg);
      }
    catch(...)
      {
        throw;
      }
  }


} // namespace alglib

/////////////////////////////////////////////////////////////////////////
//
// THIS SECTION CONTAINS IMPLEMENTATION OF COMPUTATIONAL CORE
//
/////////////////////////////////////////////////////////////////////////
namespace alglib_impl
{

  void spline1dfitpenalized(/* Real    */ ae_vector* x,
			    /* Real    */ ae_vector* y,
			    ae_int_t n,
			    ae_int_t m,
			    double rho,
			    ae_int_t* info,
			    spline1dinterpolant* s,
			    spline1dfitreport* rep,
			    ae_state *_state)
  {
    ae_frame _frame_block;
    ae_vector _x;
    ae_vector _y;
    ae_vector w;
    ae_int_t i;

    ae_frame_make(_state, &_frame_block);
    ae_vector_init_copy(&_x, x, _state, ae_true);
    x = &_x;
    ae_vector_init_copy(&_y, y, _state, ae_true);
    y = &_y;
    *info = 0;
    _spline1dinterpolant_clear(s);
    _spline1dfitreport_clear(rep);
    ae_vector_init(&w, 0, DT_REAL, _state, ae_true);

    ae_assert(n>=1, "Spline1DFitPenalized: N<1!", _state);
    ae_assert(m>=4, "Spline1DFitPenalized: M<4!", _state);
    ae_assert(x->cnt>=n, "Spline1DFitPenalized: Length(X)<N!", _state);
    ae_assert(y->cnt>=n, "Spline1DFitPenalized: Length(Y)<N!", _state);
    ae_assert(isfinitevector(x, n, _state), "Spline1DFitPenalized: X contains infinite or NAN values!", _state);
    ae_assert(isfinitevector(y, n, _state), "Spline1DFitPenalized: Y contains infinite or NAN values!", _state);
    ae_assert(ae_isfinite(rho, _state), "Spline1DFitPenalized: Rho is infinite!", _state);
    ae_vector_set_length(&w, n, _state);
    for(i=0; i<=n-1; i++) {
      w.ptr.p_double[i] = 1;
    }
    spline1dfitpenalizedw(x, y, &w, n, m, rho, info, s, rep, _state);
    ae_frame_leave(_state);
  }

  void test_gridDiff2Cubic(/* Real    */ ae_vector* x,
			   /* Real    */ ae_vector* y,
			   ae_int_t n,
			   /* Real    */ ae_vector* d1,
			   /* Real    */ ae_vector* d2,
			   ae_state *_state)
  {
    //fprintf(stderr, "===== test =====\n");

    ae_frame _frame_block;
    ae_frame_make(_state, &_frame_block);

    std::vector<double> vx(n), vy(n);
    for (size_t i=0; i<n; ++i) {
      vx[i] = x->ptr.p_double[i];
      vy[i] = y->ptr.p_double[i];
      //fprintf(stderr, "i=%d, vx=%f, vy=%f\n", i, vx[i], vy[i]);
    }

    //fprintf(stderr, "*** 222 \n");
    std::vector<double> vd1(n), vd2(n);
    spline1d::gridDiff2Cubic(vx, vy, vd1, vd2);

    ae_vector_set_length(d1, n, _state);
    ae_vector_set_length(d2, n, _state);

    //fprintf(stderr, "*** 333 \n");
    for (int i=0; i<n; ++i) {
      //fprintf(stderr, "i=%d, d1=%f, vd1=%f\n", i, d1->ptr.p_double[i], vd1[i]);
      //fprintf(stderr, "      d2=%f, vd2=%f\n", i, d2->ptr.p_double[i], vd2[i]);
      d1->ptr.p_double[i] = vd1[i];
      d2->ptr.p_double[i] = vd2[i];
    }

    ae_frame_leave(_state);

    //fprintf(stderr, "===== test end =====\n");
  }

  void test_buildCubic(/* Real    */ ae_vector* x,
		       /* Real    */ ae_vector* y,
		       ae_int_t n,
		       spline1dinterpolant* c,
		       ae_state *_state)
  {
    //fprintf(stderr, "===== test =====\n");

    ae_frame _frame_block;
    ae_frame_make(_state, &_frame_block);

    std::vector<double> vx(n), vy(n);
    for (size_t i=0; i<n; ++i) {
      vx[i] = x->ptr.p_double[i];
      vy[i] = y->ptr.p_double[i];
      //fprintf(stderr, "i=%d, vx=%f, vy=%f\n", i, vx[i], vy[i]);
    }

    spline1d::Spline1DCoeff scoeff;
    scoeff.buildCubic(vx, vy);

    _spline1dinterpolant_clear(c);
    ae_vector_set_length(&c->x, n, _state);
    ae_vector_set_length(&c->c, 4*(n-1), _state);

    c->periodic = scoeff.m_periodic;
    c->k = scoeff.m_k;
    c->n = scoeff.m_n;
    
    for (int i=0; i<=c->n-1; i++) {
      c->x.ptr.p_double[i] = scoeff.m_x[i];
    }
    for(int i=0; i<=c->n-2; i++) {
      c->c.ptr.p_double[4*i+0] = scoeff.m_c[4*i+0];
      c->c.ptr.p_double[4*i+1] = scoeff.m_c[4*i+1];
      c->c.ptr.p_double[4*i+2] = scoeff.m_c[4*i+2];
      c->c.ptr.p_double[4*i+3] = scoeff.m_c[4*i+3];
    }

    ae_frame_leave(_state);

    //fprintf(stderr, "===== test end =====\n");
  }

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

  void spline1dfitpenalizedw(/* Real    */ ae_vector* x,
			     /* Real    */ ae_vector* y,
			     /* Real    */ ae_vector* w,
			     ae_int_t n,
			     ae_int_t m,
			     double rho,
			     ae_int_t* info,
			     spline1dinterpolant* s,
			     spline1dfitreport* rep,
			     ae_state *_state)
  {
    ae_frame _frame_block;
    ae_vector _x;
    ae_vector _y;
    ae_vector _w;
    ae_int_t i;
    ae_int_t j;
    ae_int_t b;
    double v;
    double relcnt;
    double xa;
    double xb;
    double sa;
    double sb;
    ae_vector xoriginal;
    ae_vector yoriginal;
    double pdecay;
    double tdecay;
    ae_matrix fmatrix;
    ae_vector fcolumn;
    ae_vector y2;
    ae_vector w2;
    ae_vector xc;
    ae_vector yc;
    ae_vector dc;
    double fdmax;
    double admax;
    ae_matrix amatrix;
    ae_matrix d2matrix;
    double fa;
    double ga;
    double fb;
    double gb;
    double lambdav;
    ae_vector bx;
    ae_vector by;
    ae_vector bd1;
    ae_vector bd2;
    ae_vector tx;
    ae_vector ty;
    ae_vector td;
    spline1dinterpolant bs;
    ae_matrix nmatrix;
    ae_vector rightpart;
    fblslincgstate cgstate;
    ae_vector c;
    ae_vector tmp0;

    ae_frame_make(_state, &_frame_block);
    ae_vector_init_copy(&_x, x, _state, ae_true);
    x = &_x;
    ae_vector_init_copy(&_y, y, _state, ae_true);
    y = &_y;
    ae_vector_init_copy(&_w, w, _state, ae_true);
    w = &_w;
    *info = 0;
    _spline1dinterpolant_clear(s);
    _spline1dfitreport_clear(rep);
    ae_vector_init(&xoriginal, 0, DT_REAL, _state, ae_true);
    ae_vector_init(&yoriginal, 0, DT_REAL, _state, ae_true);
    ae_matrix_init(&fmatrix, 0, 0, DT_REAL, _state, ae_true);
    ae_vector_init(&fcolumn, 0, DT_REAL, _state, ae_true);
    ae_vector_init(&y2, 0, DT_REAL, _state, ae_true);
    ae_vector_init(&w2, 0, DT_REAL, _state, ae_true);
    ae_vector_init(&xc, 0, DT_REAL, _state, ae_true);
    ae_vector_init(&yc, 0, DT_REAL, _state, ae_true);
    ae_vector_init(&dc, 0, DT_INT, _state, ae_true);
    ae_matrix_init(&amatrix, 0, 0, DT_REAL, _state, ae_true);
    ae_matrix_init(&d2matrix, 0, 0, DT_REAL, _state, ae_true);
    ae_vector_init(&bx, 0, DT_REAL, _state, ae_true);
    ae_vector_init(&by, 0, DT_REAL, _state, ae_true);
    ae_vector_init(&bd1, 0, DT_REAL, _state, ae_true);
    ae_vector_init(&bd2, 0, DT_REAL, _state, ae_true);
    ae_vector_init(&tx, 0, DT_REAL, _state, ae_true);
    ae_vector_init(&ty, 0, DT_REAL, _state, ae_true);
    ae_vector_init(&td, 0, DT_REAL, _state, ae_true);
    _spline1dinterpolant_init(&bs, _state, ae_true);
    ae_matrix_init(&nmatrix, 0, 0, DT_REAL, _state, ae_true);
    ae_vector_init(&rightpart, 0, DT_REAL, _state, ae_true);
    _fblslincgstate_init(&cgstate, _state, ae_true);
    ae_vector_init(&c, 0, DT_REAL, _state, ae_true);
    ae_vector_init(&tmp0, 0, DT_REAL, _state, ae_true);

    ae_assert(n>=1, "Spline1DFitPenalizedW: N<1!", _state);
    ae_assert(m>=4, "Spline1DFitPenalizedW: M<4!", _state);
    ae_assert(x->cnt>=n, "Spline1DFitPenalizedW: Length(X)<N!", _state);
    ae_assert(y->cnt>=n, "Spline1DFitPenalizedW: Length(Y)<N!", _state);
    ae_assert(w->cnt>=n, "Spline1DFitPenalizedW: Length(W)<N!", _state);
    ae_assert(isfinitevector(x, n, _state), "Spline1DFitPenalizedW: X contains infinite or NAN values!", _state);
    ae_assert(isfinitevector(y, n, _state), "Spline1DFitPenalizedW: Y contains infinite or NAN values!", _state);
    ae_assert(isfinitevector(w, n, _state), "Spline1DFitPenalizedW: Y contains infinite or NAN values!", _state);
    ae_assert(ae_isfinite(rho, _state), "Spline1DFitPenalizedW: Rho is infinite!", _state);
    
    /*
     * Prepare LambdaV
     */
    v = -ae_log(ae_machineepsilon, _state)/ae_log(10, _state);
    if( ae_fp_less(rho,-v) )
    {
        rho = -v;
    }
    if( ae_fp_greater(rho,v) )
    {
        rho = v;
    }
    lambdav = ae_pow(10, rho, _state);
    
    /*
     * Sort X, Y, W
     */
    heapsortdpoints(x, y, w, n, _state);
    
    /*
     * Scale X, Y, XC, YC
     */
    lsfitscalexy(x, y, w, n, &xc, &yc, &dc, 0, &xa, &xb, &sa, &sb, &xoriginal, &yoriginal, _state);
    
    /*
     * Allocate space
     */
    ae_matrix_set_length(&fmatrix, n, m, _state);
    ae_matrix_set_length(&amatrix, m, m, _state);
    ae_matrix_set_length(&d2matrix, m, m, _state);
    ae_vector_set_length(&bx, m, _state);
    ae_vector_set_length(&by, m, _state);
    ae_vector_set_length(&fcolumn, n, _state);
    ae_matrix_set_length(&nmatrix, m, m, _state);
    ae_vector_set_length(&rightpart, m, _state);
    ae_vector_set_length(&tmp0, ae_maxint(m, n, _state), _state);
    ae_vector_set_length(&c, m, _state);
    
    /*
     * Fill:
     * * FMatrix by values of basis functions
     * * TmpAMatrix by second derivatives of I-th function at J-th point
     * * CMatrix by constraints
     */
    fdmax = 0;
    for (b=0; b<=m-1; b++)
    {
        
        /*
         * Prepare I-th basis function
         */
        for(j=0; j<=m-1; j++)
        {
            bx.ptr.p_double[j] = (double)(2*j)/(double)(m-1)-1;
            by.ptr.p_double[j] = 0;
        }
        by.ptr.p_double[b] = 1;
	//spline1dgriddiff2cubic(&bx, &by, m, 2, 0.0, 2, 0.0, &bd1, &bd2, _state);
	test_gridDiff2Cubic(&bx, &by, m, &bd1, &bd2, _state);

        // spline1dbuildcubic(&bx, &by, m, 2, 0.0, 2, 0.0, &bs, _state);
        test_buildCubic(&bx, &by, m, &bs, _state);
        
        /*
         * Calculate B-th column of FMatrix
         * Update FDMax (maximum column norm)
         */
        spline1dconvcubic(&bx, &by, m, 2, 0.0, 2, 0.0, x, n, &fcolumn, _state);
        ae_v_move(&fmatrix.ptr.pp_double[0][b], fmatrix.stride, &fcolumn.ptr.p_double[0], 1, ae_v_len(0,n-1));
        v = 0;
        for(i=0; i<=n-1; i++)
        {
	  //fprintf(stderr, "fcoll %d %f\n", i, fcolumn.ptr.p_double[i]);
	  v = v+ae_sqr(w->ptr.p_double[i]*fcolumn.ptr.p_double[i], _state);
        }
        fdmax = ae_maxreal(fdmax, v, _state);
        
        /*
         * Fill temporary with second derivatives of basis function
         */
        ae_v_move(&d2matrix.ptr.pp_double[b][0], 1, &bd2.ptr.p_double[0], 1, ae_v_len(0,m-1));
    }
    
    /*
     * * calculate penalty matrix A
     * * calculate max of diagonal elements of A
     * * calculate PDecay - coefficient before penalty matrix
     */
    for(i=0; i<=m-1; i++)
    {
        for(j=i; j<=m-1; j++)
        {
            
            /*
             * calculate integral(B_i''*B_j'') where B_i and B_j are
             * i-th and j-th basis splines.
             * B_i and B_j are piecewise linear functions.
             */
            v = 0;
            for(b=0; b<=m-2; b++)
            {
                fa = d2matrix.ptr.pp_double[i][b];
                fb = d2matrix.ptr.pp_double[i][b+1];
                ga = d2matrix.ptr.pp_double[j][b];
                gb = d2matrix.ptr.pp_double[j][b+1];
                v = v+(bx.ptr.p_double[b+1]-bx.ptr.p_double[b])*(fa*ga+(fa*(gb-ga)+ga*(fb-fa))/2+(fb-fa)*(gb-ga)/3);
            }
            amatrix.ptr.pp_double[i][j] = v;
            amatrix.ptr.pp_double[j][i] = v;
        }
    }
    admax = 0;
    for(i=0; i<=m-1; i++)
    {
        admax = ae_maxreal(admax, ae_fabs(amatrix.ptr.pp_double[i][i], _state), _state);
    }
    pdecay = lambdav*fdmax/admax;
    
    /*
     * Calculate TDecay for Tikhonov regularization
     */
    tdecay = fdmax*(1+pdecay)*10*ae_machineepsilon;
    
    /*
     * Prepare system
     *
     * NOTE: FMatrix is spoiled during this process
     */
    for(i=0; i<=n-1; i++)
    {
        v = w->ptr.p_double[i];
        ae_v_muld(&fmatrix.ptr.pp_double[i][0], 1, ae_v_len(0,m-1), v);
    }
    rmatrixgemm(m, m, n, 1.0, &fmatrix, 0, 0, 1, &fmatrix, 0, 0, 0, 0.0, &nmatrix, 0, 0, _state);
    for(i=0; i<=m-1; i++)
    {
        for(j=0; j<=m-1; j++)
        {
            nmatrix.ptr.pp_double[i][j] = nmatrix.ptr.pp_double[i][j]+pdecay*amatrix.ptr.pp_double[i][j];
        }
    }
    for(i=0; i<=m-1; i++)
    {
        nmatrix.ptr.pp_double[i][i] = nmatrix.ptr.pp_double[i][i]+tdecay;
    }
    for(i=0; i<=m-1; i++)
    {
        rightpart.ptr.p_double[i] = 0;
    }
    for(i=0; i<=n-1; i++)
    {
        v = y->ptr.p_double[i]*w->ptr.p_double[i];
        ae_v_addd(&rightpart.ptr.p_double[0], 1, &fmatrix.ptr.pp_double[i][0], 1, ae_v_len(0,m-1), v);
    }
    
    /*
     * Solve system
     */
    if( !spdmatrixcholesky(&nmatrix, m, ae_true, _state) )
    {
        *info = -4;
        ae_frame_leave(_state);
        return;
    }
    fblscholeskysolve(&nmatrix, 1.0, m, ae_true, &rightpart, &tmp0, _state);
    ae_v_move(&c.ptr.p_double[0], 1, &rightpart.ptr.p_double[0], 1, ae_v_len(0,m-1));
    
    /*
     * add nodes to force linearity outside of the fitting interval
     */
    spline1dgriddiffcubic(&bx, &c, m, 2, 0.0, 2, 0.0, &bd1, _state);
    ae_vector_set_length(&tx, m+2, _state);
    ae_vector_set_length(&ty, m+2, _state);
    ae_vector_set_length(&td, m+2, _state);
    ae_v_move(&tx.ptr.p_double[1], 1, &bx.ptr.p_double[0], 1, ae_v_len(1,m));
    ae_v_move(&ty.ptr.p_double[1], 1, &rightpart.ptr.p_double[0], 1, ae_v_len(1,m));
    ae_v_move(&td.ptr.p_double[1], 1, &bd1.ptr.p_double[0], 1, ae_v_len(1,m));
    tx.ptr.p_double[0] = tx.ptr.p_double[1]-(tx.ptr.p_double[2]-tx.ptr.p_double[1]);
    ty.ptr.p_double[0] = ty.ptr.p_double[1]-td.ptr.p_double[1]*(tx.ptr.p_double[2]-tx.ptr.p_double[1]);
    td.ptr.p_double[0] = td.ptr.p_double[1];
    tx.ptr.p_double[m+1] = tx.ptr.p_double[m]+(tx.ptr.p_double[m]-tx.ptr.p_double[m-1]);
    ty.ptr.p_double[m+1] = ty.ptr.p_double[m]+td.ptr.p_double[m]*(tx.ptr.p_double[m]-tx.ptr.p_double[m-1]);
    td.ptr.p_double[m+1] = td.ptr.p_double[m];
    spline1dbuildhermite(&tx, &ty, &td, m+2, s, _state);
    spline1dlintransx(s, 2/(xb-xa), -(xa+xb)/(xb-xa), _state);
    spline1dlintransy(s, sb-sa, sa, _state);
    *info = 1;
    
    /*
     * Fill report
     */
    rep->rmserror = 0;
    rep->avgerror = 0;
    rep->avgrelerror = 0;
    rep->maxerror = 0;
    relcnt = 0;
    spline1dconvcubic(&bx, &rightpart, m, 2, 0.0, 2, 0.0, x, n, &fcolumn, _state);
    for(i=0; i<=n-1; i++)
    {
        v = (sb-sa)*fcolumn.ptr.p_double[i]+sa;
        rep->rmserror = rep->rmserror+ae_sqr(v-yoriginal.ptr.p_double[i], _state);
        rep->avgerror = rep->avgerror+ae_fabs(v-yoriginal.ptr.p_double[i], _state);
        if( ae_fp_neq(yoriginal.ptr.p_double[i],0) )
        {
            rep->avgrelerror = rep->avgrelerror+ae_fabs(v-yoriginal.ptr.p_double[i], _state)/ae_fabs(yoriginal.ptr.p_double[i], _state);
            relcnt = relcnt+1;
        }
        rep->maxerror = ae_maxreal(rep->maxerror, ae_fabs(v-yoriginal.ptr.p_double[i], _state), _state);
    }
    rep->rmserror = ae_sqrt(rep->rmserror/n, _state);
    rep->avgerror = rep->avgerror/n;
    if( ae_fp_neq(relcnt,0) )
    {
        rep->avgrelerror = rep->avgrelerror/relcnt;
    }
    ae_frame_leave(_state);
}

}
