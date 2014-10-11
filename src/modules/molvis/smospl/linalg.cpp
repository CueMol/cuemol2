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

#include "interpolation.hpp"

// disable some irrelevant warnings
#if (AE_COMPILER==AE_MSVC)
#pragma warning(disable:4100)
#pragma warning(disable:4127)
#pragma warning(disable:4702)
#pragma warning(disable:4996)
#endif
using namespace std;

/////////////////////////////////////////////////////////////////////////
//
// THIS SECTION CONTAINS IMPLEMENTATION OF COMPUTATIONAL CORE
//
/////////////////////////////////////////////////////////////////////////

namespace alglib_impl
{

  ae_bool _fblslincgstate_init(fblslincgstate* p, ae_state *_state, ae_bool make_automatic)
  {
    if( !ae_vector_init(&p->x, 0, DT_REAL, _state, make_automatic) )
      return ae_false;
    if( !ae_vector_init(&p->ax, 0, DT_REAL, _state, make_automatic) )
      return ae_false;
    if( !ae_vector_init(&p->rk, 0, DT_REAL, _state, make_automatic) )
      return ae_false;
    if( !ae_vector_init(&p->rk1, 0, DT_REAL, _state, make_automatic) )
      return ae_false;
    if( !ae_vector_init(&p->xk, 0, DT_REAL, _state, make_automatic) )
      return ae_false;
    if( !ae_vector_init(&p->xk1, 0, DT_REAL, _state, make_automatic) )
      return ae_false;
    if( !ae_vector_init(&p->pk, 0, DT_REAL, _state, make_automatic) )
      return ae_false;
    if( !ae_vector_init(&p->pk1, 0, DT_REAL, _state, make_automatic) )
      return ae_false;
    if( !ae_vector_init(&p->b, 0, DT_REAL, _state, make_automatic) )
      return ae_false;
    if( !_rcommstate_init(&p->rstate, _state, make_automatic) )
      return ae_false;
    if( !ae_vector_init(&p->tmp2, 0, DT_REAL, _state, make_automatic) )
      return ae_false;
    return ae_true;
  }

  /*************************************************************************
Microblock size

  -- ALGLIB routine --
     15.12.2009
     Bochkanov Sergey
  *************************************************************************/
  ae_int_t ablasmicroblocksize(ae_state *_state)
  {
    ae_int_t result;


    result = 8;
    return result;
  }

  /*************************************************************************
Complex ABLASSplitLength

  -- ALGLIB routine --
     15.12.2009
     Bochkanov Sergey
  *************************************************************************/
  static void ablas_ablasinternalsplitlength(ae_int_t n,
					     ae_int_t nb,
					     ae_int_t* n1,
					     ae_int_t* n2,
					     ae_state *_state)
  {
    ae_int_t r;

    *n1 = 0;
    *n2 = 0;

    if( n<=nb )
      {
        
        /*
         * Block size, no further splitting
         */
        *n1 = n;
        *n2 = 0;
      }
    else
      {
        
        /*
         * Greater than block size
         */
        if( n%nb!=0 )
	  {
            
            /*
             * Split remainder
             */
            *n2 = n%nb;
            *n1 = n-(*n2);
	  }
        else
	  {
            
            /*
             * Split on block boundaries
             */
            *n2 = n/2;
            *n1 = n-(*n2);
            if( *n1%nb==0 )
	      {
                return;
	      }
            r = nb-*n1%nb;
            *n1 = *n1+r;
            *n2 = *n2-r;
	  }
      }
  }

  /*************************************************************************
Returns block size - subdivision size where  cache-oblivious  soubroutines
switch to the optimized kernel.

INPUT PARAMETERS
    A   -   real matrix, is passed to ensure that we didn't split
            complex matrix using real splitting subroutine.
            matrix itself is not changed.

  -- ALGLIB routine --
     15.12.2009
     Bochkanov Sergey
  *************************************************************************/
  ae_int_t ablasblocksize(/* Real    */ ae_matrix* a, ae_state *_state)
  {
    ae_int_t result;


    result = 32;
    return result;
  }

  /*************************************************************************
Splits matrix length in two parts, left part should match ABLAS block size

INPUT PARAMETERS
    A   -   real matrix, is passed to ensure that we didn't split
            complex matrix using real splitting subroutine.
            matrix itself is not changed.
    N   -   length, N>0

OUTPUT PARAMETERS
    N1  -   length
    N2  -   length

N1+N2=N, N1>=N2, N2 may be zero

  -- ALGLIB routine --
     15.12.2009
     Bochkanov Sergey
  *************************************************************************/
  void ablassplitlength(/* Real    */ ae_matrix* a,
			ae_int_t n,
			ae_int_t* n1,
			ae_int_t* n2,
			ae_state *_state)
  {

    *n1 = 0;
    *n2 = 0;

    if( n>ablasblocksize(a, _state) )
      {
        ablas_ablasinternalsplitlength(n, ablasblocksize(a, _state), n1, n2, _state);
      }
    else
      {
        ablas_ablasinternalsplitlength(n, ablasmicroblocksize(_state), n1, n2, _state);
      }
  }

  /*************************************************************************
GEMM kernel

  -- ALGLIB routine --
     16.12.2009
     Bochkanov Sergey
  *************************************************************************/
  static void ablas_rmatrixgemmk(ae_int_t m,
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
				 ae_state *_state)
  {
    ae_int_t i;
    ae_int_t j;
    double v;


    
    /*
     * if matrix size is zero
     */
    if( m*n==0 )
      {
        return;
      }
    
    /*
     * Try optimized code
     */
    //if( rmatrixgemmf(m, n, k, alpha, a, ia, ja, optypea, b, ib, jb, optypeb, beta, c, ic, jc, _state) )
    //    {
    //        return;
    //    }
    
    /*
     * if K=0, then C=Beta*C
     */
    if( k==0 )
      {
        if( ae_fp_neq(beta,1) )
	  {
            if( ae_fp_neq(beta,0) )
	      {
                for(i=0; i<=m-1; i++)
		  {
                    for(j=0; j<=n-1; j++)
		      {
                        c->ptr.pp_double[ic+i][jc+j] = beta*c->ptr.pp_double[ic+i][jc+j];
		      }
		  }
	      }
            else
	      {
                for(i=0; i<=m-1; i++)
		  {
                    for(j=0; j<=n-1; j++)
		      {
                        c->ptr.pp_double[ic+i][jc+j] = 0;
		      }
		  }
	      }
	  }
        return;
      }
    
    /*
     * General case
     */
    if( optypea==0&&optypeb!=0 )
      {
        
        /*
         * A*B'
         */
        for(i=0; i<=m-1; i++)
	  {
            for(j=0; j<=n-1; j++)
	      {
                if( k==0||ae_fp_eq(alpha,0) )
		  {
                    v = 0;
		  }
                else
		  {
                    v = ae_v_dotproduct(&a->ptr.pp_double[ia+i][ja], 1, &b->ptr.pp_double[ib+j][jb], 1, ae_v_len(ja,ja+k-1));
		  }
                if( ae_fp_eq(beta,0) )
		  {
                    c->ptr.pp_double[ic+i][jc+j] = alpha*v;
		  }
                else
		  {
                    c->ptr.pp_double[ic+i][jc+j] = beta*c->ptr.pp_double[ic+i][jc+j]+alpha*v;
		  }
	      }
	  }
        return;
      }
    if( optypea==0&&optypeb==0 )
      {
        
        /*
         * A*B
         */
        for(i=0; i<=m-1; i++)
	  {
            if( ae_fp_neq(beta,0) )
	      {
                ae_v_muld(&c->ptr.pp_double[ic+i][jc], 1, ae_v_len(jc,jc+n-1), beta);
	      }
            else
	      {
                for(j=0; j<=n-1; j++)
		  {
                    c->ptr.pp_double[ic+i][jc+j] = 0;
		  }
	      }
            if( ae_fp_neq(alpha,0) )
	      {
                for(j=0; j<=k-1; j++)
		  {
                    v = alpha*a->ptr.pp_double[ia+i][ja+j];
                    ae_v_addd(&c->ptr.pp_double[ic+i][jc], 1, &b->ptr.pp_double[ib+j][jb], 1, ae_v_len(jc,jc+n-1), v);
		  }
	      }
	  }
        return;
      }
    if( optypea!=0&&optypeb!=0 )
      {
        
        /*
         * A'*B'
         */
        for(i=0; i<=m-1; i++)
	  {
            for(j=0; j<=n-1; j++)
	      {
                if( ae_fp_eq(alpha,0) )
		  {
                    v = 0;
		  }
                else
		  {
                    v = ae_v_dotproduct(&a->ptr.pp_double[ia][ja+i], a->stride, &b->ptr.pp_double[ib+j][jb], 1, ae_v_len(ia,ia+k-1));
		  }
                if( ae_fp_eq(beta,0) )
		  {
                    c->ptr.pp_double[ic+i][jc+j] = alpha*v;
		  }
                else
		  {
                    c->ptr.pp_double[ic+i][jc+j] = beta*c->ptr.pp_double[ic+i][jc+j]+alpha*v;
		  }
	      }
	  }
        return;
      }
    if( optypea!=0&&optypeb==0 )
      {
        
        /*
         * A'*B
         */
        if( ae_fp_eq(beta,0) )
	  {
            for(i=0; i<=m-1; i++)
	      {
                for(j=0; j<=n-1; j++)
		  {
                    c->ptr.pp_double[ic+i][jc+j] = 0;
		  }
	      }
	  }
        else
	  {
            for(i=0; i<=m-1; i++)
	      {
                ae_v_muld(&c->ptr.pp_double[ic+i][jc], 1, ae_v_len(jc,jc+n-1), beta);
	      }
	  }
        if( ae_fp_neq(alpha,0) )
	  {
            for(j=0; j<=k-1; j++)
	      {
                for(i=0; i<=m-1; i++)
		  {
                    v = alpha*a->ptr.pp_double[ia+j][ja+i];
                    ae_v_addd(&c->ptr.pp_double[ic+i][jc], 1, &b->ptr.pp_double[ib+j][jb], 1, ae_v_len(jc,jc+n-1), v);
		  }
	      }
	  }
        return;
      }
  }

  /*************************************************************************
Same as CMatrixGEMM, but for real numbers.
OpType may be only 0 or 1.

  -- ALGLIB routine --
     16.12.2009
     Bochkanov Sergey
  *************************************************************************/

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
		   ae_state *_state)
  {
    ae_int_t s1;
    ae_int_t s2;
    ae_int_t bs;


    bs = ablasblocksize(a, _state);
    if( (m<=bs&&n<=bs)&&k<=bs )
      {
        ablas_rmatrixgemmk(m, n, k, alpha, a, ia, ja, optypea, b, ib, jb, optypeb, beta, c, ic, jc, _state);
        return;
      }
    if( m>=n&&m>=k )
      {
        
        /*
         * A*B = (A1 A2)^T*B
         */
        ablassplitlength(a, m, &s1, &s2, _state);
        if( optypea==0 )
	  {
            rmatrixgemm(s1, n, k, alpha, a, ia, ja, optypea, b, ib, jb, optypeb, beta, c, ic, jc, _state);
            rmatrixgemm(s2, n, k, alpha, a, ia+s1, ja, optypea, b, ib, jb, optypeb, beta, c, ic+s1, jc, _state);
	  }
        else
	  {
            rmatrixgemm(s1, n, k, alpha, a, ia, ja, optypea, b, ib, jb, optypeb, beta, c, ic, jc, _state);
            rmatrixgemm(s2, n, k, alpha, a, ia, ja+s1, optypea, b, ib, jb, optypeb, beta, c, ic+s1, jc, _state);
	  }
        return;
      }
    if( n>=m&&n>=k )
      {
        
        /*
         * A*B = A*(B1 B2)
         */
        ablassplitlength(a, n, &s1, &s2, _state);
        if( optypeb==0 )
	  {
            rmatrixgemm(m, s1, k, alpha, a, ia, ja, optypea, b, ib, jb, optypeb, beta, c, ic, jc, _state);
            rmatrixgemm(m, s2, k, alpha, a, ia, ja, optypea, b, ib, jb+s1, optypeb, beta, c, ic, jc+s1, _state);
	  }
        else
	  {
            rmatrixgemm(m, s1, k, alpha, a, ia, ja, optypea, b, ib, jb, optypeb, beta, c, ic, jc, _state);
            rmatrixgemm(m, s2, k, alpha, a, ia, ja, optypea, b, ib+s1, jb, optypeb, beta, c, ic, jc+s1, _state);
	  }
        return;
      }
    if( k>=m&&k>=n )
      {
        
        /*
         * A*B = (A1 A2)*(B1 B2)^T
         */
        ablassplitlength(a, k, &s1, &s2, _state);
        if( optypea==0&&optypeb==0 )
	  {
            rmatrixgemm(m, n, s1, alpha, a, ia, ja, optypea, b, ib, jb, optypeb, beta, c, ic, jc, _state);
            rmatrixgemm(m, n, s2, alpha, a, ia, ja+s1, optypea, b, ib+s1, jb, optypeb, 1.0, c, ic, jc, _state);
	  }
        if( optypea==0&&optypeb!=0 )
	  {
            rmatrixgemm(m, n, s1, alpha, a, ia, ja, optypea, b, ib, jb, optypeb, beta, c, ic, jc, _state);
            rmatrixgemm(m, n, s2, alpha, a, ia, ja+s1, optypea, b, ib, jb+s1, optypeb, 1.0, c, ic, jc, _state);
	  }
        if( optypea!=0&&optypeb==0 )
	  {
            rmatrixgemm(m, n, s1, alpha, a, ia, ja, optypea, b, ib, jb, optypeb, beta, c, ic, jc, _state);
            rmatrixgemm(m, n, s2, alpha, a, ia+s1, ja, optypea, b, ib+s1, jb, optypeb, 1.0, c, ic, jc, _state);
	  }
        if( optypea!=0&&optypeb!=0 )
	  {
            rmatrixgemm(m, n, s1, alpha, a, ia, ja, optypea, b, ib, jb, optypeb, beta, c, ic, jc, _state);
            rmatrixgemm(m, n, s2, alpha, a, ia+s1, ja, optypea, b, ib, jb+s1, optypeb, 1.0, c, ic, jc, _state);
	  }
        return;
      }
  }

  /////////////////////////////////////////////////////////////////////////////////////////

  /*************************************************************************
Level 2 subrotuine
  *************************************************************************/
  static void ablas_rmatrixsyrk2(ae_int_t n,
				 ae_int_t k,
				 double alpha,
				 /* Real    */ ae_matrix* a,
				 ae_int_t ia,
				 ae_int_t ja,
				 ae_int_t optypea,
				 double beta,
				 /* Real    */ ae_matrix* c,
				 ae_int_t ic,
				 ae_int_t jc,
				 ae_bool isupper,
				 ae_state *_state)
  {
    ae_int_t i;
    ae_int_t j;
    ae_int_t j1;
    ae_int_t j2;
    double v;


    
    /*
     * Fast exit (nothing to be done)
     */
    if( (ae_fp_eq(alpha,0)||k==0)&&ae_fp_eq(beta,1) )
      {
        return;
      }
    
    /*
     * Try to call fast SYRK
     */
    //if( rmatrixsyrkf(n, k, alpha, a, ia, ja, optypea, beta, c, ic, jc, isupper, _state) )
    //{
    //return;
    //}
    
    /*
     * SYRK
     */
    if( optypea==0 )
      {
        
        /*
         * C=alpha*A*A^H+beta*C
         */
        for(i=0; i<=n-1; i++)
	  {
            if( isupper )
	      {
                j1 = i;
                j2 = n-1;
	      }
            else
	      {
                j1 = 0;
                j2 = i;
	      }
            for(j=j1; j<=j2; j++)
	      {
                if( ae_fp_neq(alpha,0)&&k>0 )
		  {
                    v = ae_v_dotproduct(&a->ptr.pp_double[ia+i][ja], 1, &a->ptr.pp_double[ia+j][ja], 1, ae_v_len(ja,ja+k-1));
		  }
                else
		  {
                    v = 0;
		  }
                if( ae_fp_eq(beta,0) )
		  {
                    c->ptr.pp_double[ic+i][jc+j] = alpha*v;
		  }
                else
		  {
                    c->ptr.pp_double[ic+i][jc+j] = beta*c->ptr.pp_double[ic+i][jc+j]+alpha*v;
		  }
	      }
	  }
        return;
      }
    else
      {
        
        /*
         * C=alpha*A^H*A+beta*C
         */
        for(i=0; i<=n-1; i++)
	  {
            if( isupper )
	      {
                j1 = i;
                j2 = n-1;
	      }
            else
	      {
                j1 = 0;
                j2 = i;
	      }
            if( ae_fp_eq(beta,0) )
	      {
                for(j=j1; j<=j2; j++)
		  {
                    c->ptr.pp_double[ic+i][jc+j] = 0;
		  }
	      }
            else
	      {
                ae_v_muld(&c->ptr.pp_double[ic+i][jc+j1], 1, ae_v_len(jc+j1,jc+j2), beta);
	      }
	  }
        for(i=0; i<=k-1; i++)
	  {
            for(j=0; j<=n-1; j++)
	      {
                if( isupper )
		  {
                    j1 = j;
                    j2 = n-1;
		  }
                else
		  {
                    j1 = 0;
                    j2 = j;
		  }
                v = alpha*a->ptr.pp_double[ia+i][ja+j];
                ae_v_addd(&c->ptr.pp_double[ic+j][jc+j1], 1, &a->ptr.pp_double[ia+i][ja+j1], 1, ae_v_len(jc+j1,jc+j2), v);
	      }
	  }
        return;
      }
  }


  /*************************************************************************
Same as CMatrixSYRK, but for real matrices

OpType may be only 0 or 1.

  -- ALGLIB routine --
     16.12.2009
     Bochkanov Sergey
  *************************************************************************/
  void rmatrixsyrk(ae_int_t n,
		   ae_int_t k,
		   double alpha,
		   /* Real    */ ae_matrix* a,
		   ae_int_t ia,
		   ae_int_t ja,
		   ae_int_t optypea,
		   double beta,
		   /* Real    */ ae_matrix* c,
		   ae_int_t ic,
		   ae_int_t jc,
		   ae_bool isupper,
		   ae_state *_state)
  {
    ae_int_t s1;
    ae_int_t s2;
    ae_int_t bs;


    bs = ablasblocksize(a, _state);
    if( n<=bs&&k<=bs )
      {
        ablas_rmatrixsyrk2(n, k, alpha, a, ia, ja, optypea, beta, c, ic, jc, isupper, _state);
        return;
      }
    if( k>=n )
      {
        
        /*
         * Split K
         */
        ablassplitlength(a, k, &s1, &s2, _state);
        if( optypea==0 )
	  {
            rmatrixsyrk(n, s1, alpha, a, ia, ja, optypea, beta, c, ic, jc, isupper, _state);
            rmatrixsyrk(n, s2, alpha, a, ia, ja+s1, optypea, 1.0, c, ic, jc, isupper, _state);
	  }
        else
	  {
            rmatrixsyrk(n, s1, alpha, a, ia, ja, optypea, beta, c, ic, jc, isupper, _state);
            rmatrixsyrk(n, s2, alpha, a, ia+s1, ja, optypea, 1.0, c, ic, jc, isupper, _state);
	  }
      }
    else
      {
        
        /*
         * Split N
         */
        ablassplitlength(a, n, &s1, &s2, _state);
        if( optypea==0&&isupper )
	  {
            rmatrixsyrk(s1, k, alpha, a, ia, ja, optypea, beta, c, ic, jc, isupper, _state);
            rmatrixgemm(s1, s2, k, alpha, a, ia, ja, 0, a, ia+s1, ja, 1, beta, c, ic, jc+s1, _state);
            rmatrixsyrk(s2, k, alpha, a, ia+s1, ja, optypea, beta, c, ic+s1, jc+s1, isupper, _state);
            return;
	  }
        if( optypea==0&&!isupper )
	  {
            rmatrixsyrk(s1, k, alpha, a, ia, ja, optypea, beta, c, ic, jc, isupper, _state);
            rmatrixgemm(s2, s1, k, alpha, a, ia+s1, ja, 0, a, ia, ja, 1, beta, c, ic+s1, jc, _state);
            rmatrixsyrk(s2, k, alpha, a, ia+s1, ja, optypea, beta, c, ic+s1, jc+s1, isupper, _state);
            return;
	  }
        if( optypea!=0&&isupper )
	  {
            rmatrixsyrk(s1, k, alpha, a, ia, ja, optypea, beta, c, ic, jc, isupper, _state);
            rmatrixgemm(s1, s2, k, alpha, a, ia, ja, 1, a, ia, ja+s1, 0, beta, c, ic, jc+s1, _state);
            rmatrixsyrk(s2, k, alpha, a, ia, ja+s1, optypea, beta, c, ic+s1, jc+s1, isupper, _state);
            return;
	  }
        if( optypea!=0&&!isupper )
	  {
            rmatrixsyrk(s1, k, alpha, a, ia, ja, optypea, beta, c, ic, jc, isupper, _state);
            rmatrixgemm(s2, s1, k, alpha, a, ia, ja+s1, 1, a, ia, ja, 0, beta, c, ic+s1, jc, _state);
            rmatrixsyrk(s2, k, alpha, a, ia, ja+s1, optypea, beta, c, ic+s1, jc+s1, isupper, _state);
            return;
	  }
      }
  }

  /*************************************************************************
Level 2 subroutine

  -- ALGLIB routine --
     15.12.2009
     Bochkanov Sergey
  *************************************************************************/
  static void ablas_rmatrixrighttrsm2(ae_int_t m,
				      ae_int_t n,
				      /* Real    */ ae_matrix* a,
				      ae_int_t i1,
				      ae_int_t j1,
				      ae_bool isupper,
				      ae_bool isunit,
				      ae_int_t optype,
				      /* Real    */ ae_matrix* x,
				      ae_int_t i2,
				      ae_int_t j2,
				      ae_state *_state)
  {
    ae_int_t i;
    ae_int_t j;
    double vr;
    double vd;


    
    /*
     * Special case
     */
    if( n*m==0 )
      {
        return;
      }
    
    /*
     * Try to use "fast" code
     */
    //if( rmatrixrighttrsmf(m, n, a, i1, j1, isupper, isunit, optype, x, i2, j2, _state) )
    //{
    //return;
    //}
    
    /*
     * General case
     */
    if( isupper )
      {
        
        /*
         * Upper triangular matrix
         */
        if( optype==0 )
	  {
            
            /*
             * X*A^(-1)
             */
            for(i=0; i<=m-1; i++)
	      {
                for(j=0; j<=n-1; j++)
		  {
                    if( isunit )
		      {
                        vd = 1;
		      }
                    else
		      {
                        vd = a->ptr.pp_double[i1+j][j1+j];
		      }
                    x->ptr.pp_double[i2+i][j2+j] = x->ptr.pp_double[i2+i][j2+j]/vd;
                    if( j<n-1 )
		      {
                        vr = x->ptr.pp_double[i2+i][j2+j];
                        ae_v_subd(&x->ptr.pp_double[i2+i][j2+j+1], 1, &a->ptr.pp_double[i1+j][j1+j+1], 1, ae_v_len(j2+j+1,j2+n-1), vr);
		      }
		  }
	      }
            return;
	  }
        if( optype==1 )
	  {
            
            /*
             * X*A^(-T)
             */
            for(i=0; i<=m-1; i++)
	      {
                for(j=n-1; j>=0; j--)
		  {
                    vr = 0;
                    vd = 1;
                    if( j<n-1 )
		      {
                        vr = ae_v_dotproduct(&x->ptr.pp_double[i2+i][j2+j+1], 1, &a->ptr.pp_double[i1+j][j1+j+1], 1, ae_v_len(j2+j+1,j2+n-1));
		      }
                    if( !isunit )
		      {
                        vd = a->ptr.pp_double[i1+j][j1+j];
		      }
                    x->ptr.pp_double[i2+i][j2+j] = (x->ptr.pp_double[i2+i][j2+j]-vr)/vd;
		  }
	      }
            return;
	  }
      }
    else
      {
        
        /*
         * Lower triangular matrix
         */
        if( optype==0 )
	  {
            
            /*
             * X*A^(-1)
             */
            for(i=0; i<=m-1; i++)
	      {
                for(j=n-1; j>=0; j--)
		  {
                    if( isunit )
		      {
                        vd = 1;
		      }
                    else
		      {
                        vd = a->ptr.pp_double[i1+j][j1+j];
		      }
                    x->ptr.pp_double[i2+i][j2+j] = x->ptr.pp_double[i2+i][j2+j]/vd;
                    if( j>0 )
		      {
                        vr = x->ptr.pp_double[i2+i][j2+j];
                        ae_v_subd(&x->ptr.pp_double[i2+i][j2], 1, &a->ptr.pp_double[i1+j][j1], 1, ae_v_len(j2,j2+j-1), vr);
		      }
		  }
	      }
            return;
	  }
        if( optype==1 )
	  {
            
            /*
             * X*A^(-T)
             */
            for(i=0; i<=m-1; i++)
	      {
                for(j=0; j<=n-1; j++)
		  {
                    vr = 0;
                    vd = 1;
                    if( j>0 )
		      {
                        vr = ae_v_dotproduct(&x->ptr.pp_double[i2+i][j2], 1, &a->ptr.pp_double[i1+j][j1], 1, ae_v_len(j2,j2+j-1));
		      }
                    if( !isunit )
		      {
                        vd = a->ptr.pp_double[i1+j][j1+j];
		      }
                    x->ptr.pp_double[i2+i][j2+j] = (x->ptr.pp_double[i2+i][j2+j]-vr)/vd;
		  }
	      }
            return;
	  }
      }
  }

  /*************************************************************************
Same as CMatrixRightTRSM, but for real matrices

OpType may be only 0 or 1.

  -- ALGLIB routine --
     15.12.2009
     Bochkanov Sergey
  *************************************************************************/
  void rmatrixrighttrsm(ae_int_t m,
			ae_int_t n,
			/* Real    */ ae_matrix* a,
			ae_int_t i1,
			ae_int_t j1,
			ae_bool isupper,
			ae_bool isunit,
			ae_int_t optype,
			/* Real    */ ae_matrix* x,
			ae_int_t i2,
			ae_int_t j2,
			ae_state *_state)
  {
    ae_int_t s1;
    ae_int_t s2;
    ae_int_t bs;


    bs = ablasblocksize(a, _state);
    if( m<=bs&&n<=bs )
      {
        ablas_rmatrixrighttrsm2(m, n, a, i1, j1, isupper, isunit, optype, x, i2, j2, _state);
        return;
      }
    if( m>=n )
      {
        
        /*
         * Split X: X*A = (X1 X2)^T*A
         */
        ablassplitlength(a, m, &s1, &s2, _state);
        rmatrixrighttrsm(s1, n, a, i1, j1, isupper, isunit, optype, x, i2, j2, _state);
        rmatrixrighttrsm(s2, n, a, i1, j1, isupper, isunit, optype, x, i2+s1, j2, _state);
      }
    else
      {
        
        /*
         * Split A:
         *               (A1  A12)
         * X*op(A) = X*op(       )
         *               (     A2)
         *
         * Different variants depending on
         * IsUpper/OpType combinations
         */
        ablassplitlength(a, n, &s1, &s2, _state);
        if( isupper&&optype==0 )
	  {
            
            /*
             *                  (A1  A12)-1
             * X*A^-1 = (X1 X2)*(       )
             *                  (     A2)
             */
            rmatrixrighttrsm(m, s1, a, i1, j1, isupper, isunit, optype, x, i2, j2, _state);
            rmatrixgemm(m, s2, s1, -1.0, x, i2, j2, 0, a, i1, j1+s1, 0, 1.0, x, i2, j2+s1, _state);
            rmatrixrighttrsm(m, s2, a, i1+s1, j1+s1, isupper, isunit, optype, x, i2, j2+s1, _state);
            return;
	  }
        if( isupper&&optype!=0 )
	  {
            
            /*
             *                  (A1'     )-1
             * X*A^-1 = (X1 X2)*(        )
             *                  (A12' A2')
             */
            rmatrixrighttrsm(m, s2, a, i1+s1, j1+s1, isupper, isunit, optype, x, i2, j2+s1, _state);
            rmatrixgemm(m, s1, s2, -1.0, x, i2, j2+s1, 0, a, i1, j1+s1, optype, 1.0, x, i2, j2, _state);
            rmatrixrighttrsm(m, s1, a, i1, j1, isupper, isunit, optype, x, i2, j2, _state);
            return;
	  }
        if( !isupper&&optype==0 )
	  {
            
            /*
             *                  (A1     )-1
             * X*A^-1 = (X1 X2)*(       )
             *                  (A21  A2)
             */
            rmatrixrighttrsm(m, s2, a, i1+s1, j1+s1, isupper, isunit, optype, x, i2, j2+s1, _state);
            rmatrixgemm(m, s1, s2, -1.0, x, i2, j2+s1, 0, a, i1+s1, j1, 0, 1.0, x, i2, j2, _state);
            rmatrixrighttrsm(m, s1, a, i1, j1, isupper, isunit, optype, x, i2, j2, _state);
            return;
	  }
        if( !isupper&&optype!=0 )
	  {
            
            /*
             *                  (A1' A21')-1
             * X*A^-1 = (X1 X2)*(        )
             *                  (     A2')
             */
            rmatrixrighttrsm(m, s1, a, i1, j1, isupper, isunit, optype, x, i2, j2, _state);
            rmatrixgemm(m, s2, s1, -1.0, x, i2, j2, 0, a, i1+s1, j1, optype, 1.0, x, i2, j2+s1, _state);
            rmatrixrighttrsm(m, s2, a, i1+s1, j1+s1, isupper, isunit, optype, x, i2, j2+s1, _state);
            return;
	  }
      }
  }


  /*************************************************************************
Level 2 subroutine
  *************************************************************************/
  static void ablas_rmatrixlefttrsm2(ae_int_t m,
				     ae_int_t n,
				     /* Real    */ ae_matrix* a,
				     ae_int_t i1,
				     ae_int_t j1,
				     ae_bool isupper,
				     ae_bool isunit,
				     ae_int_t optype,
				     /* Real    */ ae_matrix* x,
				     ae_int_t i2,
				     ae_int_t j2,
				     ae_state *_state)
  {
    ae_int_t i;
    ae_int_t j;
    double vr;
    double vd;


    
    /*
     * Special case
     */
    if( n*m==0 )
      {
        return;
      }
    
    /*
     * Try fast code
     */
    //if( rmatrixlefttrsmf(m, n, a, i1, j1, isupper, isunit, optype, x, i2, j2, _state) )
    //{
    //return;
    //}
    
    /*
     * General case
     */
    if( isupper )
      {
        
        /*
         * Upper triangular matrix
         */
        if( optype==0 )
	  {
            
            /*
             * A^(-1)*X
             */
            for(i=m-1; i>=0; i--)
	      {
                for(j=i+1; j<=m-1; j++)
		  {
                    vr = a->ptr.pp_double[i1+i][j1+j];
                    ae_v_subd(&x->ptr.pp_double[i2+i][j2], 1, &x->ptr.pp_double[i2+j][j2], 1, ae_v_len(j2,j2+n-1), vr);
		  }
                if( !isunit )
		  {
                    vd = 1/a->ptr.pp_double[i1+i][j1+i];
                    ae_v_muld(&x->ptr.pp_double[i2+i][j2], 1, ae_v_len(j2,j2+n-1), vd);
		  }
	      }
            return;
	  }
        if( optype==1 )
	  {
            
            /*
             * A^(-T)*X
             */
            for(i=0; i<=m-1; i++)
	      {
                if( isunit )
		  {
                    vd = 1;
		  }
                else
		  {
                    vd = 1/a->ptr.pp_double[i1+i][j1+i];
		  }
                ae_v_muld(&x->ptr.pp_double[i2+i][j2], 1, ae_v_len(j2,j2+n-1), vd);
                for(j=i+1; j<=m-1; j++)
		  {
                    vr = a->ptr.pp_double[i1+i][j1+j];
                    ae_v_subd(&x->ptr.pp_double[i2+j][j2], 1, &x->ptr.pp_double[i2+i][j2], 1, ae_v_len(j2,j2+n-1), vr);
		  }
	      }
            return;
	  }
      }
    else
      {
        
        /*
         * Lower triangular matrix
         */
        if( optype==0 )
	  {
            
            /*
             * A^(-1)*X
             */
            for(i=0; i<=m-1; i++)
	      {
                for(j=0; j<=i-1; j++)
		  {
                    vr = a->ptr.pp_double[i1+i][j1+j];
                    ae_v_subd(&x->ptr.pp_double[i2+i][j2], 1, &x->ptr.pp_double[i2+j][j2], 1, ae_v_len(j2,j2+n-1), vr);
		  }
                if( isunit )
		  {
                    vd = 1;
		  }
                else
		  {
                    vd = 1/a->ptr.pp_double[i1+j][j1+j];
		  }
                ae_v_muld(&x->ptr.pp_double[i2+i][j2], 1, ae_v_len(j2,j2+n-1), vd);
	      }
            return;
	  }
        if( optype==1 )
	  {
            
            /*
             * A^(-T)*X
             */
            for(i=m-1; i>=0; i--)
	      {
                if( isunit )
		  {
                    vd = 1;
		  }
                else
		  {
                    vd = 1/a->ptr.pp_double[i1+i][j1+i];
		  }
                ae_v_muld(&x->ptr.pp_double[i2+i][j2], 1, ae_v_len(j2,j2+n-1), vd);
                for(j=i-1; j>=0; j--)
		  {
                    vr = a->ptr.pp_double[i1+i][j1+j];
                    ae_v_subd(&x->ptr.pp_double[i2+j][j2], 1, &x->ptr.pp_double[i2+i][j2], 1, ae_v_len(j2,j2+n-1), vr);
		  }
	      }
            return;
	  }
      }
  }


  /*************************************************************************
Same as CMatrixLeftTRSM, but for real matrices

OpType may be only 0 or 1.

  -- ALGLIB routine --
     15.12.2009
     Bochkanov Sergey
  *************************************************************************/
  void rmatrixlefttrsm(ae_int_t m,
		       ae_int_t n,
		       /* Real    */ ae_matrix* a,
		       ae_int_t i1,
		       ae_int_t j1,
		       ae_bool isupper,
		       ae_bool isunit,
		       ae_int_t optype,
		       /* Real    */ ae_matrix* x,
		       ae_int_t i2,
		       ae_int_t j2,
		       ae_state *_state)
  {
    ae_int_t s1;
    ae_int_t s2;
    ae_int_t bs;


    bs = ablasblocksize(a, _state);
    if( m<=bs&&n<=bs )
      {
        ablas_rmatrixlefttrsm2(m, n, a, i1, j1, isupper, isunit, optype, x, i2, j2, _state);
        return;
      }
    if( n>=m )
      {
        
        /*
         * Split X: op(A)^-1*X = op(A)^-1*(X1 X2)
         */
        ablassplitlength(x, n, &s1, &s2, _state);
        rmatrixlefttrsm(m, s1, a, i1, j1, isupper, isunit, optype, x, i2, j2, _state);
        rmatrixlefttrsm(m, s2, a, i1, j1, isupper, isunit, optype, x, i2, j2+s1, _state);
      }
    else
      {
        
        /*
         * Split A
         */
        ablassplitlength(a, m, &s1, &s2, _state);
        if( isupper&&optype==0 )
	  {
            
            /*
             *           (A1  A12)-1  ( X1 )
             * A^-1*X* = (       )   *(    )
             *           (     A2)    ( X2 )
             */
            rmatrixlefttrsm(s2, n, a, i1+s1, j1+s1, isupper, isunit, optype, x, i2+s1, j2, _state);
            rmatrixgemm(s1, n, s2, -1.0, a, i1, j1+s1, 0, x, i2+s1, j2, 0, 1.0, x, i2, j2, _state);
            rmatrixlefttrsm(s1, n, a, i1, j1, isupper, isunit, optype, x, i2, j2, _state);
            return;
	  }
        if( isupper&&optype!=0 )
	  {
            
            /*
             *          (A1'     )-1 ( X1 )
             * A^-1*X = (        )  *(    )
             *          (A12' A2')   ( X2 )
             */
            rmatrixlefttrsm(s1, n, a, i1, j1, isupper, isunit, optype, x, i2, j2, _state);
            rmatrixgemm(s2, n, s1, -1.0, a, i1, j1+s1, optype, x, i2, j2, 0, 1.0, x, i2+s1, j2, _state);
            rmatrixlefttrsm(s2, n, a, i1+s1, j1+s1, isupper, isunit, optype, x, i2+s1, j2, _state);
            return;
	  }
        if( !isupper&&optype==0 )
	  {
            
            /*
             *          (A1     )-1 ( X1 )
             * A^-1*X = (       )  *(    )
             *          (A21  A2)   ( X2 )
             */
            rmatrixlefttrsm(s1, n, a, i1, j1, isupper, isunit, optype, x, i2, j2, _state);
            rmatrixgemm(s2, n, s1, -1.0, a, i1+s1, j1, 0, x, i2, j2, 0, 1.0, x, i2+s1, j2, _state);
            rmatrixlefttrsm(s2, n, a, i1+s1, j1+s1, isupper, isunit, optype, x, i2+s1, j2, _state);
            return;
	  }
        if( !isupper&&optype!=0 )
	  {
            
            /*
             *          (A1' A21')-1 ( X1 )
             * A^-1*X = (        )  *(    )
             *          (     A2')   ( X2 )
             */
            rmatrixlefttrsm(s2, n, a, i1+s1, j1+s1, isupper, isunit, optype, x, i2+s1, j2, _state);
            rmatrixgemm(s1, n, s2, -1.0, a, i1+s1, j1, optype, x, i2+s1, j2, 0, 1.0, x, i2, j2, _state);
            rmatrixlefttrsm(s1, n, a, i1, j1, isupper, isunit, optype, x, i2, j2, _state);
            return;
	  }
      }
  }

  /*************************************************************************
Matrix-vector product: y := op(A)*x

INPUT PARAMETERS:
    M   -   number of rows of op(A)
    N   -   number of columns of op(A)
    A   -   target matrix
    IA  -   submatrix offset (row index)
    JA  -   submatrix offset (column index)
    OpA -   operation type:
    * OpA=0     =>  op(A) = A
    * OpA=1     =>  op(A) = A^T
    X   -   input vector
    IX  -   subvector offset
    IY  -   subvector offset

OUTPUT PARAMETERS:
    Y   -   vector which stores result

if M=0, then subroutine does nothing.
if N=0, Y is filled by zeros.


  -- ALGLIB routine --

     28.01.2010
     Bochkanov Sergey
  *************************************************************************/
  void rmatrixmv(ae_int_t m,
		 ae_int_t n,
		 /* Real    */ ae_matrix* a,
		 ae_int_t ia,
		 ae_int_t ja,
		 ae_int_t opa,
		 /* Real    */ ae_vector* x,
		 ae_int_t ix,
		 /* Real    */ ae_vector* y,
		 ae_int_t iy,
		 ae_state *_state)
  {
    ae_int_t i;
    double v;


    if( m==0 )
      {
        return;
      }
    if( n==0 )
      {
        for(i=0; i<=m-1; i++)
	  {
            y->ptr.p_double[iy+i] = 0;
	  }
        return;
      }
    //if( rmatrixmvf(m, n, a, ia, ja, opa, x, ix, y, iy, _state) )
    //{
    //return;
    //}
    if( opa==0 )
      {
        
        /*
         * y = A*x
         */
        for(i=0; i<=m-1; i++)
	  {
            v = ae_v_dotproduct(&a->ptr.pp_double[ia+i][ja], 1, &x->ptr.p_double[ix], 1, ae_v_len(ja,ja+n-1));
            y->ptr.p_double[iy+i] = v;
	  }
        return;
      }
    if( opa==1 )
      {
        
        /*
         * y = A^T*x
         */
        for(i=0; i<=m-1; i++)
	  {
            y->ptr.p_double[iy+i] = 0;
	  }
        for(i=0; i<=n-1; i++)
	  {
            v = x->ptr.p_double[ix+i];
            ae_v_addd(&y->ptr.p_double[iy], 1, &a->ptr.pp_double[ia+i][ja], 1, ae_v_len(iy,iy+m-1), v);
	  }
        return;
      }
  }



  /*************************************************************************
Level-2 Cholesky subroutine

  -- LAPACK routine (version 3.0) --
     Univ. of Tennessee, Univ. of California Berkeley, NAG Ltd.,
     Courant Institute, Argonne National Lab, and Rice University
     February 29, 1992
  *************************************************************************/
  static ae_bool trfac_spdmatrixcholesky2(/* Real    */ ae_matrix* aaa,
					  ae_int_t offs,
					  ae_int_t n,
					  ae_bool isupper,
					  /* Real    */ ae_vector* tmp,
					  ae_state *_state)
  {
    ae_int_t i;
    ae_int_t j;
    double ajj;
    double v;
    double r;
    ae_bool result;


    result = ae_true;
    if( n<0 )
      {
        result = ae_false;
        return result;
      }
    
    /*
     * Quick return if possible
     */
    if( n==0 )
      {
        return result;
      }
    if( isupper )
      {
        
        /*
         * Compute the Cholesky factorization A = U'*U.
         */
        for(j=0; j<=n-1; j++)
	  {
            
            /*
             * Compute U(J,J) and test for non-positive-definiteness.
             */
            v = ae_v_dotproduct(&aaa->ptr.pp_double[offs][offs+j], aaa->stride, &aaa->ptr.pp_double[offs][offs+j], aaa->stride, ae_v_len(offs,offs+j-1));
            ajj = aaa->ptr.pp_double[offs+j][offs+j]-v;
            if( ae_fp_less_eq(ajj,0) )
	      {
                aaa->ptr.pp_double[offs+j][offs+j] = ajj;
                result = ae_false;
                return result;
	      }
            ajj = ae_sqrt(ajj, _state);
            aaa->ptr.pp_double[offs+j][offs+j] = ajj;
            
            /*
             * Compute elements J+1:N-1 of row J.
             */
            if( j<n-1 )
	      {
                if( j>0 )
		  {
                    ae_v_moveneg(&tmp->ptr.p_double[0], 1, &aaa->ptr.pp_double[offs][offs+j], aaa->stride, ae_v_len(0,j-1));
                    rmatrixmv(n-j-1, j, aaa, offs, offs+j+1, 1, tmp, 0, tmp, n, _state);
                    ae_v_add(&aaa->ptr.pp_double[offs+j][offs+j+1], 1, &tmp->ptr.p_double[n], 1, ae_v_len(offs+j+1,offs+n-1));
		  }
                r = 1/ajj;
                ae_v_muld(&aaa->ptr.pp_double[offs+j][offs+j+1], 1, ae_v_len(offs+j+1,offs+n-1), r);
	      }
	  }
      }
    else
      {
        
        /*
         * Compute the Cholesky factorization A = L*L'.
         */
        for(j=0; j<=n-1; j++)
	  {
            
            /*
             * Compute L(J+1,J+1) and test for non-positive-definiteness.
             */
            v = ae_v_dotproduct(&aaa->ptr.pp_double[offs+j][offs], 1, &aaa->ptr.pp_double[offs+j][offs], 1, ae_v_len(offs,offs+j-1));
            ajj = aaa->ptr.pp_double[offs+j][offs+j]-v;
            if( ae_fp_less_eq(ajj,0) )
	      {
                aaa->ptr.pp_double[offs+j][offs+j] = ajj;
                result = ae_false;
                return result;
	      }
            ajj = ae_sqrt(ajj, _state);
            aaa->ptr.pp_double[offs+j][offs+j] = ajj;
            
            /*
             * Compute elements J+1:N of column J.
             */
            if( j<n-1 )
	      {
                if( j>0 )
		  {
                    ae_v_move(&tmp->ptr.p_double[0], 1, &aaa->ptr.pp_double[offs+j][offs], 1, ae_v_len(0,j-1));
                    rmatrixmv(n-j-1, j, aaa, offs+j+1, offs, 0, tmp, 0, tmp, n, _state);
                    for(i=0; i<=n-j-2; i++)
		      {
                        aaa->ptr.pp_double[offs+j+1+i][offs+j] = (aaa->ptr.pp_double[offs+j+1+i][offs+j]-tmp->ptr.p_double[n+i])/ajj;
		      }
		  }
                else
		  {
                    for(i=0; i<=n-j-2; i++)
		      {
                        aaa->ptr.pp_double[offs+j+1+i][offs+j] = aaa->ptr.pp_double[offs+j+1+i][offs+j]/ajj;
		      }
		  }
	      }
	  }
      }
    return result;
  }


  /*************************************************************************
Recursive computational subroutine for SPDMatrixCholesky.

INPUT PARAMETERS:
    A       -   matrix given by upper or lower triangle
    Offs    -   offset of diagonal block to decompose
    N       -   diagonal block size
    IsUpper -   what half is given
    Tmp     -   temporary array; allocated by function, if its size is too
                small; can be reused on subsequent calls.
                
OUTPUT PARAMETERS:
    A       -   upper (or lower) triangle contains Cholesky decomposition

RESULT:
    True, on success
    False, on failure

  -- ALGLIB routine --
     15.12.2009
     Bochkanov Sergey
  *************************************************************************/
  ae_bool spdmatrixcholeskyrec(/* Real    */ ae_matrix* a,
			       ae_int_t offs,
			       ae_int_t n,
			       ae_bool isupper,
			       /* Real    */ ae_vector* tmp,
			       ae_state *_state)
  {
    ae_int_t n1;
    ae_int_t n2;
    ae_bool result;


    
    /*
     * check N
     */
    if( n<1 )
      {
        result = ae_false;
        return result;
      }
    
    /*
     * Prepare buffer
     */
    if( tmp->cnt<2*n )
      {
        ae_vector_set_length(tmp, 2*n, _state);
      }
    
    /*
     * special cases
     */
    if( n==1 )
      {
        if( ae_fp_greater(a->ptr.pp_double[offs][offs],0) )
	  {
            a->ptr.pp_double[offs][offs] = ae_sqrt(a->ptr.pp_double[offs][offs], _state);
            result = ae_true;
	  }
        else
	  {
            result = ae_false;
	  }
        return result;
      }
    if( n<=ablasblocksize(a, _state) )
      {
        result = trfac_spdmatrixcholesky2(a, offs, n, isupper, tmp, _state);
        return result;
      }
    
    /*
     * general case: split task in cache-oblivious manner
     */
    result = ae_true;
    ablassplitlength(a, n, &n1, &n2, _state);
    result = spdmatrixcholeskyrec(a, offs, n1, isupper, tmp, _state);
    if( !result )
      {
        return result;
      }
    if( n2>0 )
      {
        if( isupper )
	  {
            rmatrixlefttrsm(n1, n2, a, offs, offs, isupper, ae_false, 1, a, offs, offs+n1, _state);
            rmatrixsyrk(n2, n1, -1.0, a, offs, offs+n1, 1, 1.0, a, offs+n1, offs+n1, isupper, _state);
	  }
        else
	  {
            rmatrixrighttrsm(n2, n1, a, offs, offs, isupper, ae_false, 1, a, offs+n1, offs, _state);
            rmatrixsyrk(n2, n1, -1.0, a, offs+n1, offs, 0, 1.0, a, offs+n1, offs+n1, isupper, _state);
	  }
        result = spdmatrixcholeskyrec(a, offs+n1, n2, isupper, tmp, _state);
        if( !result )
	  {
            return result;
	  }
      }
    return result;
  }

  /*************************************************************************
Cache-oblivious Cholesky decomposition

The algorithm computes Cholesky decomposition  of  a  symmetric  positive-
definite matrix. The result of an algorithm is a representation  of  A  as
A=U^T*U  or A=L*L^T

INPUT PARAMETERS:
    A       -   upper or lower triangle of a factorized matrix.
                array with elements [0..N-1, 0..N-1].
    N       -   size of matrix A.
    IsUpper -   if IsUpper=True, then A contains an upper triangle of
                a symmetric matrix, otherwise A contains a lower one.

OUTPUT PARAMETERS:
    A       -   the result of factorization. If IsUpper=True, then
                the upper triangle contains matrix U, so that A = U^T*U,
                and the elements below the main diagonal are not modified.
                Similarly, if IsUpper = False.

RESULT:
    If  the  matrix  is  positive-definite,  the  function  returns  True.
    Otherwise, the function returns False. Contents of A is not determined
    in such case.

  -- ALGLIB routine --
     15.12.2009
     Bochkanov Sergey
  *************************************************************************/
  ae_bool spdmatrixcholesky(/* Real    */ ae_matrix* a,
			    ae_int_t n,
			    ae_bool isupper,
			    ae_state *_state)
  {
    ae_frame _frame_block;
    ae_vector tmp;
    ae_bool result;

    ae_frame_make(_state, &_frame_block);
    ae_vector_init(&tmp, 0, DT_REAL, _state, ae_true);

    if( n<1 )
      {
        result = ae_false;
        ae_frame_leave(_state);
        return result;
      }
    result = spdmatrixcholeskyrec(a, 0, n, isupper, &tmp, _state);
    ae_frame_leave(_state);
    return result;
  }

  /*************************************************************************
Basic Cholesky solver for ScaleA*Cholesky(A)'*x = y.

This subroutine assumes that:
* A*ScaleA is well scaled
* A is well-conditioned, so no zero divisions or overflow may occur

INPUT PARAMETERS:
    CHA     -   Cholesky decomposition of A
    SqrtScaleA- square root of scale factor ScaleA
    N       -   matrix size
    IsUpper -   storage type
    XB      -   right part
    Tmp     -   buffer; function automatically allocates it, if it is  too
                small.  It  can  be  reused  if function is called several
                times.
                
OUTPUT PARAMETERS:
    XB      -   solution

NOTES: no assertion or tests are done during algorithm operation

  -- ALGLIB --
     Copyright 13.10.2010 by Bochkanov Sergey
  *************************************************************************/
  void fblscholeskysolve(/* Real    */ ae_matrix* cha,
			 double sqrtscalea,
			 ae_int_t n,
			 ae_bool isupper,
			 /* Real    */ ae_vector* xb,
			 /* Real    */ ae_vector* tmp,
			 ae_state *_state)
  {
    ae_int_t i;
    double v;


    if( tmp->cnt<n )
      {
        ae_vector_set_length(tmp, n, _state);
      }
    
    /*
     * A = L*L' or A=U'*U
     */
    if( isupper )
      {
        
        /*
         * Solve U'*y=b first.
         */
        for(i=0; i<=n-1; i++)
	  {
            xb->ptr.p_double[i] = xb->ptr.p_double[i]/(sqrtscalea*cha->ptr.pp_double[i][i]);
            if( i<n-1 )
	      {
                v = xb->ptr.p_double[i];
                ae_v_moved(&tmp->ptr.p_double[i+1], 1, &cha->ptr.pp_double[i][i+1], 1, ae_v_len(i+1,n-1), sqrtscalea);
                ae_v_subd(&xb->ptr.p_double[i+1], 1, &tmp->ptr.p_double[i+1], 1, ae_v_len(i+1,n-1), v);
	      }
	  }
        
        /*
         * Solve U*x=y then.
         */
        for(i=n-1; i>=0; i--)
	  {
            if( i<n-1 )
	      {
                ae_v_moved(&tmp->ptr.p_double[i+1], 1, &cha->ptr.pp_double[i][i+1], 1, ae_v_len(i+1,n-1), sqrtscalea);
                v = ae_v_dotproduct(&tmp->ptr.p_double[i+1], 1, &xb->ptr.p_double[i+1], 1, ae_v_len(i+1,n-1));
                xb->ptr.p_double[i] = xb->ptr.p_double[i]-v;
	      }
            xb->ptr.p_double[i] = xb->ptr.p_double[i]/(sqrtscalea*cha->ptr.pp_double[i][i]);
	  }
      }
    else
      {
        
        /*
         * Solve L*y=b first
         */
        for(i=0; i<=n-1; i++)
	  {
            if( i>0 )
	      {
                ae_v_moved(&tmp->ptr.p_double[0], 1, &cha->ptr.pp_double[i][0], 1, ae_v_len(0,i-1), sqrtscalea);
                v = ae_v_dotproduct(&tmp->ptr.p_double[0], 1, &xb->ptr.p_double[0], 1, ae_v_len(0,i-1));
                xb->ptr.p_double[i] = xb->ptr.p_double[i]-v;
	      }
            xb->ptr.p_double[i] = xb->ptr.p_double[i]/(sqrtscalea*cha->ptr.pp_double[i][i]);
	  }
        
        /*
         * Solve L'*x=y then.
         */
        for(i=n-1; i>=0; i--)
	  {
            xb->ptr.p_double[i] = xb->ptr.p_double[i]/(sqrtscalea*cha->ptr.pp_double[i][i]);
            if( i>0 )
	      {
                v = xb->ptr.p_double[i];
                ae_v_moved(&tmp->ptr.p_double[0], 1, &cha->ptr.pp_double[i][0], 1, ae_v_len(0,i-1), sqrtscalea);
                ae_v_subd(&xb->ptr.p_double[0], 1, &tmp->ptr.p_double[0], 1, ae_v_len(0,i-1), v);
	      }
	  }
      }
  }
}
