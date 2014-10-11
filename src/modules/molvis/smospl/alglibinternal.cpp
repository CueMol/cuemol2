#include "interpolation.hpp"

namespace alglib_impl
{

  /*************************************************************************
This function checks that all values from X[] are finite

  -- ALGLIB --
     Copyright 18.06.2010 by Bochkanov Sergey
  *************************************************************************/
  ae_bool isfinitevector(/* Real    */ ae_vector* x,
			 ae_int_t n,
			 ae_state *_state)
  {
    ae_int_t i;
    ae_bool result;


    ae_assert(n>=0, "APSERVIsFiniteVector: internal error (N<0)", _state);
    for(i=0; i<=n-1; i++)
      {
        if( !ae_isfinite(x->ptr.p_double[i], _state) )
	  {
            result = ae_false;
            return result;
	  }
      }
    result = ae_true;
    return result;
  }
  
/*************************************************************************
This function checks that all values from X[] are distinct. It does more
than just usual floating point comparison:
* first, it calculates max(X) and min(X)
* second, it maps X[] from [min,max] to [1,2]
* only at this stage actual comparison is done

The meaning of such check is to ensure that all values are "distinct enough"
and will not cause interpolation subroutine to fail.

NOTE:
    X[] must be sorted by ascending (subroutine ASSERT's it)

  -- ALGLIB --
     Copyright 02.12.2009 by Bochkanov Sergey
*************************************************************************/
ae_bool aredistinct(/* Real    */ ae_vector* x,
     ae_int_t n,
     ae_state *_state)
{
    double a;
    double b;
    ae_int_t i;
    ae_bool nonsorted;
    ae_bool result;


    ae_assert(n>=1, "APSERVAreDistinct: internal error (N<1)", _state);
    if( n==1 )
    {
        
        /*
         * everything is alright, it is up to caller to decide whether it
         * can interpolate something with just one point
         */
        result = ae_true;
        return result;
    }
    a = x->ptr.p_double[0];
    b = x->ptr.p_double[0];
    nonsorted = ae_false;
    for(i=1; i<=n-1; i++)
    {
        a = ae_minreal(a, x->ptr.p_double[i], _state);
        b = ae_maxreal(b, x->ptr.p_double[i], _state);
        nonsorted = nonsorted||ae_fp_greater_eq(x->ptr.p_double[i-1],x->ptr.p_double[i]);
    }
    ae_assert(!nonsorted, "APSERVAreDistinct: internal error (not sorted)", _state);
    for(i=1; i<=n-1; i++)
    {
        if( ae_fp_eq((x->ptr.p_double[i]-a)/(b-a)+1,(x->ptr.p_double[i-1]-a)/(b-a)+1) )
        {
            result = ae_false;
            return result;
        }
    }
    result = ae_true;
    return result;
}
  
static void tsort_tagsortfastirec(/* Real    */ ae_vector* a,
     /* Integer */ ae_vector* b,
     /* Real    */ ae_vector* bufa,
     /* Integer */ ae_vector* bufb,
     ae_int_t i1,
     ae_int_t i2,
     ae_state *_state);

/*************************************************************************
Same as TagSort, but optimized for real keys and integer labels.

A is sorted, and same permutations are applied to B.

NOTES:
1.  this function assumes that A[] is finite; it doesn't checks that
    condition. All other conditions (size of input arrays, etc.) are not
    checked too.
2.  this function uses two buffers, BufA and BufB, each is N elements large.
    They may be preallocated (which will save some time) or not, in which
    case function will automatically allocate memory.

  -- ALGLIB --
     Copyright 11.12.2008 by Bochkanov Sergey
*************************************************************************/
void tagsortfasti(/* Real    */ ae_vector* a,
     /* Integer */ ae_vector* b,
     /* Real    */ ae_vector* bufa,
     /* Integer */ ae_vector* bufb,
     ae_int_t n,
     ae_state *_state)
{
    ae_int_t i;
    ae_int_t j;
    ae_bool isascending;
    ae_bool isdescending;
    double tmpr;
    ae_int_t tmpi;


    
    /*
     * Special case
     */
    if( n<=1 )
    {
        return;
    }
    
    /*
     * Test for already sorted set
     */
    isascending = ae_true;
    isdescending = ae_true;
    for(i=1; i<=n-1; i++)
    {
        isascending = isascending&&a->ptr.p_double[i]>=a->ptr.p_double[i-1];
        isdescending = isdescending&&a->ptr.p_double[i]<=a->ptr.p_double[i-1];
    }
    if( isascending )
    {
        return;
    }
    if( isdescending )
    {
        for(i=0; i<=n-1; i++)
        {
            j = n-1-i;
            if( j<=i )
            {
                break;
            }
            tmpr = a->ptr.p_double[i];
            a->ptr.p_double[i] = a->ptr.p_double[j];
            a->ptr.p_double[j] = tmpr;
            tmpi = b->ptr.p_int[i];
            b->ptr.p_int[i] = b->ptr.p_int[j];
            b->ptr.p_int[j] = tmpi;
        }
        return;
    }
    
    /*
     * General case
     */
    if( bufa->cnt<n )
    {
        ae_vector_set_length(bufa, n, _state);
    }
    if( bufb->cnt<n )
    {
        ae_vector_set_length(bufb, n, _state);
    }
    tsort_tagsortfastirec(a, b, bufa, bufb, 0, n-1, _state);
}

/*************************************************************************
Internal TagSortFastI: sorts A[I1...I2] (both bounds are included),
applies same permutations to B.

  -- ALGLIB --
     Copyright 06.09.2010 by Bochkanov Sergey
*************************************************************************/
static void tsort_tagsortfastirec(/* Real    */ ae_vector* a,
     /* Integer */ ae_vector* b,
     /* Real    */ ae_vector* bufa,
     /* Integer */ ae_vector* bufb,
     ae_int_t i1,
     ae_int_t i2,
     ae_state *_state)
{
    ae_int_t i;
    ae_int_t j;
    ae_int_t k;
    ae_int_t cntless;
    ae_int_t cnteq;
    ae_int_t cntgreater;
    double tmpr;
    ae_int_t tmpi;
    double v0;
    double v1;
    double v2;
    double vp;


    
    /*
     * Fast exit
     */
    if( i2<=i1 )
    {
        return;
    }
    
    /*
     * Non-recursive sort for small arrays
     */
    if( i2-i1<=16 )
    {
        for(j=i1+1; j<=i2; j++)
        {
            
            /*
             * Search elements [I1..J-1] for place to insert Jth element.
             *
             * This code stops immediately if we can leave A[J] at J-th position
             * (all elements have same value of A[J] larger than any of them)
             */
            tmpr = a->ptr.p_double[j];
            tmpi = j;
            for(k=j-1; k>=i1; k--)
            {
                if( a->ptr.p_double[k]<=tmpr )
                {
                    break;
                }
                tmpi = k;
            }
            k = tmpi;
            
            /*
             * Insert Jth element into Kth position
             */
            if( k!=j )
            {
                tmpr = a->ptr.p_double[j];
                tmpi = b->ptr.p_int[j];
                for(i=j-1; i>=k; i--)
                {
                    a->ptr.p_double[i+1] = a->ptr.p_double[i];
                    b->ptr.p_int[i+1] = b->ptr.p_int[i];
                }
                a->ptr.p_double[k] = tmpr;
                b->ptr.p_int[k] = tmpi;
            }
        }
        return;
    }
    
    /*
     * Quicksort: choose pivot
     * Here we assume that I2-I1>=2
     */
    v0 = a->ptr.p_double[i1];
    v1 = a->ptr.p_double[i1+(i2-i1)/2];
    v2 = a->ptr.p_double[i2];
    if( v0>v1 )
    {
        tmpr = v1;
        v1 = v0;
        v0 = tmpr;
    }
    if( v1>v2 )
    {
        tmpr = v2;
        v2 = v1;
        v1 = tmpr;
    }
    if( v0>v1 )
    {
        tmpr = v1;
        v1 = v0;
        v0 = tmpr;
    }
    vp = v1;
    
    /*
     * now pass through A/B and:
     * * move elements that are LESS than VP to the left of A/B
     * * move elements that are EQUAL to VP to the right of BufA/BufB (in the reverse order)
     * * move elements that are GREATER than VP to the left of BufA/BufB (in the normal order
     * * move elements from the tail of BufA/BufB to the middle of A/B (restoring normal order)
     * * move elements from the left of BufA/BufB to the end of A/B
     */
    cntless = 0;
    cnteq = 0;
    cntgreater = 0;
    for(i=i1; i<=i2; i++)
    {
        v0 = a->ptr.p_double[i];
        if( v0<vp )
        {
            
            /*
             * LESS
             */
            k = i1+cntless;
            if( i!=k )
            {
                a->ptr.p_double[k] = v0;
                b->ptr.p_int[k] = b->ptr.p_int[i];
            }
            cntless = cntless+1;
            continue;
        }
        if( v0==vp )
        {
            
            /*
             * EQUAL
             */
            k = i2-cnteq;
            bufa->ptr.p_double[k] = v0;
            bufb->ptr.p_int[k] = b->ptr.p_int[i];
            cnteq = cnteq+1;
            continue;
        }
        
        /*
         * GREATER
         */
        k = i1+cntgreater;
        bufa->ptr.p_double[k] = v0;
        bufb->ptr.p_int[k] = b->ptr.p_int[i];
        cntgreater = cntgreater+1;
    }
    for(i=0; i<=cnteq-1; i++)
    {
        j = i1+cntless+cnteq-1-i;
        k = i2+i-(cnteq-1);
        a->ptr.p_double[j] = bufa->ptr.p_double[k];
        b->ptr.p_int[j] = bufb->ptr.p_int[k];
    }
    for(i=0; i<=cntgreater-1; i++)
    {
        j = i1+cntless+cnteq+i;
        k = i1+i;
        a->ptr.p_double[j] = bufa->ptr.p_double[k];
        b->ptr.p_int[j] = bufb->ptr.p_int[k];
    }
    
    /*
     * Sort left and right parts of the array (ignoring middle part)
     */
    tsort_tagsortfastirec(a, b, bufa, bufb, i1, i1+cntless-1, _state);
    tsort_tagsortfastirec(a, b, bufa, bufb, i1+cntless+cnteq, i2, _state);
}


/*************************************************************************
This function makes periodic mapping of X to [A,B].

It accepts X, A, B (A>B). It returns T which lies in  [A,B] and integer K,
such that X = T + K*(B-A).

NOTES:
* K is represented as real value, although actually it is integer
* T is guaranteed to be in [A,B]
* T replaces X

  -- ALGLIB --
     Copyright by Bochkanov Sergey
*************************************************************************/
void apperiodicmap(double* x,
     double a,
     double b,
     double* k,
     ae_state *_state)
{

    *k = 0;

    ae_assert(ae_fp_less(a,b), "APPeriodicMap: internal error!", _state);
    *k = ae_ifloor((*x-a)/(b-a), _state);
    *x = *x-*k*(b-a);
    while(ae_fp_less(*x,a))
    {
        *x = *x+(b-a);
        *k = *k-1;
    }
    while(ae_fp_greater(*x,b))
    {
        *x = *x-(b-a);
        *k = *k+1;
    }
    *x = ae_maxreal(*x, a, _state);
    *x = ae_minreal(*x, b, _state);
}


}
