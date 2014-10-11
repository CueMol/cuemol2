// $Id: ss_csia.h,v 1.1 2010/01/23 14:25:05 rishitani Exp $
// =================================================================
//
//    27.04.04   <--  Date of Last Modification.
//                   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// -----------------------------------------------------------------
//
//  **** Module  :  ss_csia       <interface>
//       ~~~~~~~~~
//  **** Classes :  CSSGraphMatch ( matching SS graphs )
//       ~~~~~~~~~
//
//  E. Krissinel 2001-2004
//
//  When used, please cite:
//
//   Krissinel, E. and Henrick, K. (2004)
//   Common subgraph isomorphism detection by backtracking search.
//   Software - Practice and Experience, 34, 591-607.
//
// =================================================================
//

#ifndef  __SS_CSIA__
#define  __SS_CSIA__


#ifndef  __SS_Graph__
#include "ss_graph.h"
#endif


//  =========================  CSSMatch  ===========================

DefineClass(CSSMatch)

class CSSMatch : public CStream  {

  friend class CSSGraphMatch;

  public :

    CSSMatch ();
    CSSMatch ( RPCStream Object );
    CSSMatch ( ivector FV1, ivector FV2, int nv, int n, int m );
    ~CSSMatch();

    void SetMatch ( ivector FV1, ivector FV2,
                    int nv, int n, int m );   // FV1[], FV2[] are copied

    void    Swap();

    Boolean isMatch ( ivector FV1, ivector FV2, int nv );

    int  isSubMatch ( ivector FV1, ivector FV2, int nv );
    // return 0 <=> no submatch relations
    //        1 <=> "this" is submatch of (FV1,FV2)
    //       -1 <=> (FV1,FV2) is submatch of "this"

    void GetMatch ( ivector  & FV1,  // do not allocate or
                    ivector  & FV2,  // dispose FV1 and FV2 in
                    int      & nv ); // application!

    void GetMatch ( ivector  & FV1, // do not allocate or
                    ivector  & FV2, // dispose FV1 and FV2 in
                    int      & nv,  // application!
                    realtype & p1,
                    realtype & p2 );

    void read  ( RCFile f );
    void write ( RCFile f );

  protected :
    int     mlength,n1,n2;
    ivector F1,F2;

    void InitSSMatch();

  private :
    int nAlloc;

};

DefineStreamFunctions(CSSMatch)



//  =========================  CSSGraphMatch  ===========================

#define SSMF_UniqueMatch       0x00000001
#define SSMF_BestMatch         0x00000002
#define SSMF_WrongConnectOnly  0x00000004


DefineClass(CSSGraphMatch)

class CSSGraphMatch : public CStream  {

  public :

    CSSGraphMatch ();
    CSSGraphMatch ( RPCStream Object );
    ~CSSGraphMatch();

    void  SetUniqueMatch ( Boolean unique_match );
    void  SetBestMatch   ( Boolean best_match   );
    void  SetMatchBufferLength ( int matchBufLen );
    void  SetFlags       ( word Flags );
    void  RemoveFlags    ( word Flags );

    void  MatchGraphs    ( PCSSGraph Gh1, PCSSGraph Gh2, int minMatch );

    PCSSGraph  GetGraph1 ();
    PCSSGraph  GetGraph2 ();
    void  GetMatches     ( PPCSSMatch & SSMatch, int & nOfMatches );
    int   GetMaxRecursionLevel() { return maxRecursionLevel; }

    int   CheckConnectivity ( int matchNo );

    void  read  ( RCFile f );
    void  write ( RCFile f );


  protected :

    PCSSGraph   G1,G2;
    PPCSSVertex V1;
    PPCSSVertex V2;
    PPCSSEdge   E1;
    PPCSSEdge   E2;
    imatrix     c1,c2;
    Boolean     swap;
    word        flags;
    int         n,m;

    imatrix3    P;
    imatrix     iF1;
    ivector     F1,F2,ix;

    int         nMatches,maxNofMatches;
    PPCSSMatch  Match;
    Boolean     UniqueMatch,BestMatch,wasFullMatch,Stop;
    int         maxMatch,maxCollectedMatch,maxRecursionLevel;

    void  InitSSGraphMatch ();
    void  FreeMemory       ();
    void  FreeRecHeap      ();
    void  GetMemory        ();
    void  GetRecHeap       ();
    int   Initialize       ();
    void  DoMatch          ( int minMatch );
    void  MatchSingleVertex();
    void  Backtrack        ( int i );
    void  Backtrack1       ( int i, int k0 );
    void  CollectMatch     ( int nm );

  private :
    int nAlloc,mAlloc,nMAlloc;

};

DefineStreamFunctions(CSSGraphMatch)


#endif
