//  $Id: mmdb_graph.h,v 1.1 2010/01/23 14:25:04 rishitani Exp $
//  =================================================================
//
//   CCP4 Coordinate Library: support of coordinate-related
//   functionality in protein crystallography applications.
//
//   Copyright (C) Eugene Krissinel 2000-2008.
//
//    This library is free software: you can redistribute it and/or 
//    modify it under the terms of the GNU Lesser General Public 
//    License version 3, modified in accordance with the provisions 
//    of the license to address the requirements of UK law.
//
//    You should have received a copy of the modified GNU Lesser 
//    General Public License along with this library. If not, copies 
//    may be downloaded from http://www.ccp4.ac.uk/ccp4license.php
//
//    This program is distributed in the hope that it will be useful,
//    but WITHOUT ANY WARRANTY; without even the implied warranty of
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU Lesser General Public License for more details.
//
//  =================================================================
//
//    08.07.08   <--  Date of Last Modification.
//                   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//  -----------------------------------------------------------------
//
//  **** Module  :  mmdb_graph  <interface>
//       ~~~~~~~~~
//  **** Classes :  CVertex     ( graph vertex                        )
//       ~~~~~~~~~  CEdge       ( graph edge                          )
//                  CGraph      ( structural graph                    )
//                  CMatch      ( match of structural graphs          )
//                  CGraphMatch ( CSIA algorithms for graphs matching )
//
//   (C) E. Krissinel 2000-2008
//
//  When used, please cite:
//
//   Krissinel, E. and Henrick, K. (2004)
//   Common subgraph isomorphism detection by backtracking search.
//   Software - Practice and Experience, 34, 591-607.
//
//  =================================================================
//

#ifndef  __MMDB_Graph__
#define  __MMDB_Graph__


#ifndef  __TIME_H
#include <time.h>
#endif

#ifndef  __MMDB_Atom__
#include "mmdb_atom.h"
#endif

//  ==========================  CVertex  ============================

DefineClass(CVertex)

#define  CHIRAL_RIGHT      0x10000000
#define  CHIRAL_LEFT       0x20000000
#define  ATOM_LEAVING      0x40000000
#define  HYDROGEN_BOND     0x0F000000
#define  SYMREL_MASK       0x00FF0000
#define  CHIRAL_MASK       0xCFFFFFFF
#define  TYPE_MASK         0x00FFFFFF

class CVertex : public CStream  {

  friend class CGraph;
  friend class CGraphMatch;
  friend class CSBase0;

  public :

    CVertex ();
    CVertex ( RPCStream Object );
    CVertex ( int  vtype, cpstr vname );
    CVertex ( int  vtype );
    CVertex ( cpstr chem_elem );
    CVertex ( cpstr chem_elem, cpstr name );
    ~CVertex();

    void  SetVertex ( cpstr chem_elem );
    void  SetVertex ( int vtype, cpstr vname );
    void  SetVertex ( int vtype );
    void  SetType   ( int vtype );

    void  RemoveChirality();
    void  LeaveChirality ( int eltype );

    void  SetName     ( cpstr vname );
    void  SetProperty ( int vprop  );
    void  SetID       ( int vid    );
    void  AddBond     ();
    void  CopyNBonds  ( PCVertex V );
    int   GetProperty () { return property; }
    int   GetID       () { return id;       }
    int   GetUserID   () { return userid;   }
    pstr  GetName     () { return name;     }
    int   GetType     () { return type;     }
    int   GetNBonds   ();

    void  SaveType    ();  // in userid
    void  RestoreType ();  // from userid
    void  CopyType    ( PCVertex V );

    virtual void Print ( int PKey );

    virtual void Copy ( PCVertex V );

    void  read  ( RCFile f );
    void  write ( RCFile f );

    void  mem_read  ( cpstr S, int & l );
    void  mem_write ( pstr S, int & l );

  protected :
    pstr name;     // name may be general, "C", "Hg", "Cl" etc.
    int  type;     // type of vertex, see comments in mmdb_graph.cpp
    int  property; // flagwise properties -- user-defined
    int  id;       // a graph-defined vertex id
    int  userid;   // a user-defined vertex id

    void InitVertex();

};

DefineStreamFunctions(CVertex)



//  ===========================  CEdge  =============================

#define BOND_SINGLE    1
#define BOND_DOUBLE    2
#define BOND_AROMATIC  3
#define BOND_TRIPLE    4

DefineClass(CEdge)

class CEdge : public CStream  {

  friend class CGraph;
  friend class CGMatch;
  friend class CSBase0;

  public :

    CEdge ();
    CEdge ( RPCStream Object );
    CEdge ( int vx1, int vx2, int btype );  // vx1,vx2 are numbered
                                            // as 1,2,3 on and refer
                                            // to vertices in the order
                                            // as they were added to
                                            // the graph; btype>0
    ~CEdge();

    void  SetEdge ( int vx1, int vx2, cpstr btype );
    void  SetEdge ( int vx1, int vx2, int  btype ); // btype>0

    void  SetType     ( int btype );
    void  SetProperty ( int eprop );
    void  SaveType    ();  // in property
    void  RestoreType ();  // from property

    int   GetVertex1  () { return v1-1;     }
    int   GetVertex2  () { return v2-1;     }
    int   GetType     () { return type;     }
    int   GetProperty () { return property; }

    virtual void Print ( int PKey );

    virtual void Copy  ( PCEdge G );

    void  read  ( RCFile f );
    void  write ( RCFile f );

    void  mem_read  ( cpstr S, int & l );
    void  mem_write ( pstr S, int & l );

  protected :
    int  v1,v2;  //  >=1
    int  type;
    int  property;

    void  InitEdge();

};

DefineStreamFunctions(CEdge)



//  ==========================  CGraph  ============================

#define MKGRAPH_Ok             0
#define MKGRAPH_NoAtoms        -1
#define MKGRAPH_ChangedAltLoc  1
#define MKGRAPH_MaxOccupancy   2

DefineClass(CGraph)

class CGraph : public CStream  {

  friend class CGraphMatch;
  friend class CSBase0;

  public :

    CGraph ();
    CGraph ( PCResidue R, cpstr altLoc=NULL );
    CGraph ( RPCStream Object );
    ~CGraph();

    void  Reset   ();
    void  SetName ( cpstr gname );
    pstr  GetName () { return name; }

    //   AddVertex(..) and AddEdge(..) do not copy the objects, but
    // take them over. This means that application should forget
    // about pointers to V and G once they were given to CGraph.
    // Vertices and edges  must be allocated newly prior each call
    // to AddVertex(..) and AddEdge(..).
    void  AddVertex   ( PCVertex  V );
    void  AddEdge     ( PCEdge    G );
    void  SetVertices ( PPCVertex V, int vlen );
    void  SetEdges    ( PPCEdge   G, int glen );

    void  RemoveChirality();
    void  LeaveChirality ( int eltype );

    //   MakeGraph(..) makes a graph corresponding to residue R.
    // The graphs vertices then correspond to the residue's atoms
    // (CVertex::userid points to atom R->atom[CVertex::userid]),
    // edges are calculated as chemical bonds between atoms basing
    // on the table of cut-off distances.
    //   altCode specifies a particular conformation that should be
    // used for making the graph. If it is set to "" or NULL ("empty"
    // altcode) but the residue does not have conformation which
    // contains *only* ""-altcode atoms, a conformation corresponding
    // to maximal occupancy will be used. The same will happen if
    // altcode information in residue is not correct, whatever altCode
    // is specified.
    //   After making the graph, Build(..) should be called as usual
    // before graph matching.
    //   Non-negative return means that graph has been made.
    // MakeGraph(..) may return:
    //   MKGRAPH_Ok             everything is Ok
    //   MKGRAPH_NoAtoms        residue does not have atoms, graph
    //                          is not made
    //   MKGRAPH_ChangedAltLoc  a different altcode was used because
    //                          the residue has only one altcode and
    //                          that is different of 
    //   MKGRAPH_MaxOccupancy   a maximal-occupancy conformation has
    //                          been chosen because of default
    //                          ""-altcode supplied or incorrect
    //                          altcode information in the residue
    int   MakeGraph   ( PCResidue R, cpstr altLoc=NULL );

    void  HideType    ( int bond_vx_type );
    void  ExcludeType ( int type );

    void  MakeSymmetryRelief ( Boolean noCO2 );

    int   Build       ( Boolean bondOrder );  // returns 0 if Ok

    void  MakeVertexIDs      ();  // simply numbers vertices as 1.. on
    int   GetVertexID        ( int vertexNo );
    // GetBondedVertexID(..) works after MoveType(..)
    int   GetNBondedVertices ( int vertexNo );
    int   GetBondedVertexID  ( int vertexNo, int bond_vx_type,
                               int bondNo );

    PCVertex   GetVertex ( int vertexNo );  // 1<=vertexNo<=nVertices
    int   GetNofVertices () { return nVertices; }

    PCEdge    GetEdge    ( int edgeNo );    // 1<=edgeNo<=nEdges
    int   GetNofEdges    () { return nEdges;    }

    void  GetVertices ( PPCVertex & V, int & nV );
    void  GetEdges    ( PPCEdge   & E, int & nE );

    virtual void Print();
    void  Print1();

    virtual void Copy ( PCGraph G );

    void  read  ( RCFile f );
    void  write ( RCFile f );

    void  mem_read  ( cpstr S, int & l );
    void  mem_write ( pstr S, int & l );

  protected :
    pstr      name;
    int       nVertices,nEdges, nAllVertices,nAllEdges;
    PPCVertex Vertex;
    PPCEdge   Edge;
    imatrix   graph;

    void  InitGraph ();
    void  FreeMemory();

  private :
    int  nVAlloc,nEAlloc,nGAlloc;

};

DefineStreamFunctions(CGraph)


//  ==========================  CMatch  ============================

DefineClass(CMatch)
DefineStreamFunctions(CMatch)

class CMatch : public CStream  {

  friend class CGraphMatch;

  public :

    CMatch ();
    CMatch ( RPCStream Object );
    CMatch ( ivector FV1, ivector FV2, int nv, int n, int m );
    ~CMatch();

    // FV1[] and FV2[] are copied into internal buffers
    void SetMatch ( ivector FV1, ivector FV2, int nv, int n, int m );

    Boolean isMatch       ( ivector FV1, ivector FV2, int nv );
    Boolean isCombination ( ivector FV1, ivector FV2, int nv );

    // do not allocate or dispose FV1 and FV2 in application!
    void GetMatch ( ivector & FV1, ivector & FV2, int & nv,
                    realtype & p1, realtype & p2 );

    void read  ( RCFile f );
    void write ( RCFile f );

    void mem_read  ( cpstr S, int & l );
    void mem_write ( pstr S, int & l );

  protected :
    int     n1,n2,mlength;
    ivector F1,F2;

    void InitMatch();

  private :
    int nAlloc;

};


//  =======================  CGraphMatch  =========================

#define  _UseRecursion

#define  GMF_UniqueMatch     0x00000001
#define  GMF_NoCombinations  0x00000002

DefineClass(CGraphMatch)

class CGraphMatch : public CStream  {

  public :

    CGraphMatch ();
    CGraphMatch ( RPCStream Object );
    ~CGraphMatch();

    void SetFlag          ( word flag );
    void RemoveFlag       ( word flag );
    void SetMaxNofMatches ( int maxNofMatches, Boolean stopOnMaxN );
    void SetTimeLimit     ( int maxTimeToRun=0 );
    Boolean GetStopSignal () { return Stop; }

    void MatchGraphs    ( PCGraph Gh1, PCGraph Gh2, int minMatch,
                          Boolean vertexType=True );
    void PrintMatches   ();
    int  GetNofMatches  () { return nMatches; }

    // do not allocate or dispose FV1 and FV2 in application!
    // FV1/p1 will always correspond to Gh1, and FV2/p2 -
    // to Gh2 as specified in MatchGraphs(..)
    void GetMatch ( int MatchNo, ivector & FV1, ivector & FV2,
                    int & nv, realtype & p1, realtype & p2 );

    void read  ( RCFile f );
    void write ( RCFile f );

    void mem_read  ( cpstr S, int & l );
    void mem_write ( pstr  S, int & l );

  protected :
    PCGraph   G1,G2;
    PPCVertex V1;
    PPCVertex V2;
    imatrix   c1,c2;
    Boolean   swap;
#ifndef _UseRecursion
    ivector   jj;
#endif
    int       n,m;

    imatrix3  P;
    imatrix   iF1;
    ivector   F1,F2,ix;

    int       nMatches,maxNMatches;
    PPCMatch  Match;
    Boolean   wasFullMatch,Stop,stopOnMaxNMathches;
    word      flags;
    int       maxMatch,timeLimit;

    void    InitGraphMatch();
    void    FreeMemory    ();
    void    FreeRecHeap   ();
    void    GetMemory     ();
    void    GetRecHeap    ();
    int     Initialize    ( Boolean vertexType );
#ifdef _UseRecursion
    void    Backtrack     ( int i );          // exact matching
#else
    void    Ullman        ();
#endif
    void    Backtrack1    ( int i, int k0 );  // exact/partial matching
    void    CollectMatch  ( int nm );

  private :
    int     nAlloc,mAlloc,nMAlloc;
    time_t  startTime;

};

DefineStreamFunctions(CGraphMatch)

extern void  SetGraphAllocPortion ( int alloc_portion );

/*
extern void  TestGraphMatch();
*/


#endif
