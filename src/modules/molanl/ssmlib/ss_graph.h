// $Id: ss_graph.h,v 1.1 2010/01/23 14:25:05 rishitani Exp $
// =================================================================
//
//    28.09.04   <--  Date of Last Modification.
//                   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// -----------------------------------------------------------------
//
//  **** Module  :  ss_graph  <interface>
//       ~~~~~~~~~
//  **** Classes :  CSSGraph  ( secondary structure graph )
//       ~~~~~~~~~  
//
//  E. Krissinel 2002-2004
//
// =================================================================
//


#ifndef  __SS_Graph__
#define  __SS_Graph__

#ifndef  __MMDB_Manager__
//#include "mmdb_manager.h"
#include <modules/molanl/mmdb/mmdb_manager.h>
#endif

#ifndef  __SS_VxEdge__
#include "ss_vxedge.h"
#endif


//  ==========================  CSSGraph  ===========================

#define SSGP_Distance   0
#define SSGP_Alpha1     1
#define SSGP_Alpha2     2 
#define SSGP_Alpha3     3 
#define SSGP_Alpha4     4 
#define SSGP_dAlpha1    5 
#define SSGP_dAlpha2    6
#define SSGP_dAlpha3    7
#define SSGP_dAlpha4    8

#define SSGE_Ok                     0
#define SSGE_NoVertices             70
#define SSGE_UnmatchedConnectivity  5001
#define SSGE_AlignError             5002
#define SSGE_WrongSelLine1          5003
#define SSGE_WrongSelLine2          5004
#define SSGE_WrongSelLine3          5005

#define SSGT_None       0
#define SSGT_PDB        1
#define SSGT_SCOP       2
#define SSGT_PDBDOMAIN  3
#define SSGT_PDBRANGE   4
#define SSGT_CFDOMAIN   5
#define SSGT_CFRANGE    6


DefineClass(CSSGraph)
DefineStreamFunctions(CSSGraph)

class CSSGraph : public CStream  {

  friend class CSSGraphMatch;

  public :

    CSSGraph ();
    CSSGraph ( RPCStream Object );
    ~CSSGraph();

    void  Reset();  // must be called before building a graph
                    // The sequence of calls is:
                    //    SSGraph.Reset();
                    //    for (....)  {
                    //      V = new CSSVertex();
                    //      .....
                    //      SSGraph.AddVertex ( V );
                    //    }
                    //    SSGraph.Build();

    void  SetGraphName  ( pstr gname     );

    void  SelectCalphas ( PCMMDBManager MMDB, int & selHnd,
                          pstr selstring );

    //   AddVertex(..) do not copy the objects, but take them over.
    // This means that application should forget about pointers to
    // V once they were given to CSSGraph. All vertices must be
    // allocated newly prior each call to AddVertex(..).
    void  AddVertex  ( PCSSVertex V );

    int   MakeGraph ( PCMMDBManager MMDB );

    void  CalcVertexOrder();
    void  RepairSS ( PCMMDBManager MMDB );

    //   BuildGraph() calculates all edges and builds the graph.
    void    BuildGraph();
    Boolean isBuild   ();

    void  calcVTypes();  // calculates nHelices and nStrands only

    //   ReleaseEdges() deallocates all graph edges and
    //  the connectivity matrix 
    void  ReleaseEdges();

    void  RemoveShortVertices   ( int nmin_hx, int nmin_sd );

    //   LeaveVertices(..) removes all vertices from the graph
    // except those having numbers listed in vector vlist. Thus,
    // if vlist[i]=j, 1<=i<=vllen,  1<=j, then jth vertex will
    // not be removed.
    void  LeaveVertices         ( ivector vlist, int vllen );

    //   LeaveVertices(..) removes all vertices from the graph
    // except those found in the specified range. 'select' is of
    // the following format:
    //    "*", "(all)"            - take all file
    //    "-"                     - take chain without chain ID
    //    "a:Ni-Mj,b:Kp-Lq,..."   - take chain a residue number N
    //                              insertion code i to residue number M
    //                              insertion code j plus chain b
    //                              residue number K insertion code p to
    //                              residue number L insertion code q and
    //                              so on.
    //    "a:,b:..."              - take whole chains a and b and so on
    //    "a:,b:Kp-Lq,..."        - any combination of the above.
    void  LeaveVertices ( pstr select, PCMMDBManager M );

    //    LeaveVertices ( selHnd,MMDB ) leaves only vertices that are
    // covered by the given selection. selHnd may refer to the selection
    // of atoms, residues or chains.
    void  LeaveVertices ( int selHnd, PCMMDBManager M );

    void  RemoveVertex          ( int vertex_no );  // 1..nVertices

    Boolean    inRange          ( pstr chainID, int initPos, int endPos );
    pstr       GetGraphName     () { return name;        }
    pstr       GetDevChain      () { return devChain;    }
    pstr       GetChainList     ( pstr S );
    int        GetNofVertices   () { return nVertices;   }
    PPCSSVertex GetVertices     () { return Vertex;      }
    int        GetNofEdges      () { return nEdges;      }
    int        GetNofHelices    () { return nHelices;    }
    int        GetNofStrands    () { return nStrands;    }
    void       GetAllChains     ( PChainID & chain, int & nchains );
    int        GetNofChains     ();
    Boolean    GetEdgeDirection ( int v1, int v2, vect3 & v );
    int        GetVertexType    ( int vertex_no  ); // 1..nVertices
    int        GetVertexClass   ( int vertex_no  ); // 1..nVertices
    Boolean    GetVertexDirection ( int vertex_no, vect3 & v );
    int        GetSeqLength     ( int vertex_no  ); // 1..nVertices
    realtype   GetMass          ( int vertex_no  ); // 1..nVertices
    PCSSVertex GetGraphVertex   ( int vertex_no  ); // 1..nVertices
    pstr       GetVertexChainID ( int vertex_no  ); // 1..nVertices
    pstr       GetVertexInitRes ( int vertex_no  ); // 1..nVertices
    pstr       GetVertexEndRes  ( int vertex_no  ); // 1..nVertices
    void       GetVertexRange   ( int     vertex_no,  // 1..nVertices
                                  ChainID chID,
                                  int &   initSeqNum,
                                  InsCode initICode,
                                  int &   endSeqNum,
                                  InsCode endICode  );  
    void       GetVertexRange   ( int     vertex_no,  // 1..nVertices
                                  ChainID chID,
                                  int &   initPos,
                                  int &   endPos );
    int        GetSSEType       ( pstr chainID, int atomPos );
    int        GetSSEType       ( PCAtom A );

    PCSSEdge   GetGraphEdge   ( int edge_no );     // 1..nEdges
    PCSSEdge   GetGraphEdge   ( int v1, int v2 );  // 1..nVertices

    realtype CalcCombinations ( ivector F, int nm );

    void  DevelopChainGraphs ( PPCSSGraph & G, int & nGraphs );

    //  Superpose(..) returns TMatrix - a transformation matrix for
    // G's coordinates, such that TMatrix*{G} ~= {this}
    //  F1 is for 'this' graph, F2 = for G.
    void  Superpose          ( PCSSGraph G, ivector F1, ivector F2,
                               int nMatch, mat44 & TMatrix );


    void  Copy  ( PCSSGraph G );

    void  read  ( RCFile f );
    void  write ( RCFile f );

  protected :
    pstr        name;        // graph name
    ChainID     devChain;    // chain of a developed graph
    int         nVertices,nEdges;
    int         nHelices,nStrands;

    PPCSSVertex Vertex;
    PPCSSEdge   Edge;
    imatrix     graph;

    void  InitSSGraph    ();
    void  FreeMemory     ();
    void  _leaveVertices ( PCMMDBManager M, int selHnd1 );

    //   CompareEdges(..) compares edge (ij) of the graph with
    // edge (kl) of graph G. i may be either less or greater
    // than j, same about k and l. If edges compare, the function
    // returns 0. Edges with equal indices (i.e. (ii) and (kk))
    // are considered as comparable (returns 0).
    //   The function may be used only after both graphs have
    // been built.
    int   CompareEdges ( int i, int j, PCSSGraph G,
                         int k, int l );

    int   CheckEdgeConnectivity ( int i, int j, PCSSGraph G,
                                  int k, int l );

  private :
    int  nVAlloc,nEAlloc,nGAlloc;

};



//  ==================================================================

//   In SelectDomain(..) and CutOutDomain(..), select is of the
// following format:
//    "*", "(all)"            - take all file
//    "-"                     - take chain without chain ID
//    "a:Ni-Mj,b:Kp-Lq,..."   - take chain a residue number N
//                              insertion code i to residue number M
//                              insertion code j plus chain b
//                              residue number K insertion code p to
//                              residue number L insertion code q and
//                              so on.
//    "a:,b:..."              - take whole chains a and b and so on
//    "a:,b:Kp-Lq,..."        - any combination of the above.
extern int SelectDomain ( PCMMDBManager MMDB, int & selHnd, pstr select,
                          int selType );
extern int CutOutDomain ( PCMMDBManager MMDB, pstr select );

extern void DisposeSSGraphs ( PPCSSGraph & G, int & nGraphs );

extern int  SuperposeSSGraphs ( PCSSGraph G1, ivector F1,
                                PCSSGraph G2, ivector F2,
                                int     matchlen,
                                mat44 & TMatrix );


/*

extern realtype  GetTorsion ( rvector U, rvector W, rvector V );
//      U     W      V
//   o<----o----->o----->o
//

extern realtype  GetAngle   ( rvector v1, rvector v2 );
//  returns angle between v1 and v2



extern void  CalcCombinations ( rvector & combs, int & vlen,
                                PCSSGraph G1, PCSSGraph G2 );

*/

#endif
