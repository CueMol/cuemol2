// $Id: ss_vxedge.h,v 1.1 2010/01/23 14:25:05 rishitani Exp $
// =================================================================
//
//    19.01.04   <--  Date of Last Modification.
//                   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// -----------------------------------------------------------------
//
//  **** Module  :  ss_vxedge  <interface>
//       ~~~~~~~~~
//  **** Classes :  CSSVertex  ( secondary structure graph vertex )
//       ~~~~~~~~~  CSSEdge    ( secondary structure graph edge   )
//
//  E. Krissinel 2002-2004
//
// =================================================================
//


#ifndef  __SS_VxEdge__
#define  __SS_VxEdge__

#ifndef  __MMDB_Manager__
#include <modules/molanl/mmdb/mmdb_manager.h>
#endif


//  ==========================  Tune-up  ============================

extern int hx_min_len;
extern int sd_min_len;

extern void InitSSGraph();  // should be called on top of application

//  precision level conatsnts
#define SSMP_Highest   1
#define SSMP_High      2
#define SSMP_Normal    3
#define SSMP_Low       4
#define SSMP_Lowest    5

//  regimes of checking the SS connectivity
#define CSSC_None      0
#define CSSC_Flexible  1
#define CSSC_Strict    2

extern void SetSSMatchPrecision    ( int  precision );
extern void writeSSMatchParameters ( pstr FileName  );
extern int  readSSMatchParameters  ( pstr FileName  );
extern void SetSSConnectivityCheck ( int  checkMode );


//  =========================  CSSVertex  ===========================

#ifdef V_UNKNOWN
#undef V_UNKNOWN
#endif

#define  V_UNKNOWN  -1
#define  V_HELIX     0
#define  V_STRAND    1

DefineClass(CSSVertex)
DefineStreamFunctions(CSSVertex)

class CSSVertex : public CStream  {

  friend class CSSEdge;
  friend class CSSGraph;

  public :

    CSSVertex ();
    CSSVertex ( RPCStream Object );
    ~CSSVertex();

    int  SetVertex ( PCMMDBManager MMDB, PCHelix  Helix  );
    int  SetVertex ( PCMMDBManager MMDB, PCStrand Strand );
    int  SetVertex ( PCMMDBManager MMDB, int v_type, int sNum,
                     int  iclass, ChainID chID,
                     int seqNum1, InsCode iCode1,
                     int seqNum2, InsCode iCode2 );

    void SetID ( int vid ) { id = vid; }

    realtype GetAngle  ( PCSSVertex v );
    realtype GetCosine ( PCSSVertex v );
    realtype GetAngle  ( realtype vx, realtype vy, realtype vz );

    pstr     GetShortVertexDesc ( pstr S );
    pstr     GetFullVertexDesc  ( pstr S );

    Boolean  Compare ( PCSSVertex v ); // True if vertices compare

    realtype GetLengthDeviation ( PCSSVertex v );

    void     GetDirection ( vect3 & v );
    void     GetPosition  ( vect3 & p );
    void     GetPosition  ( realtype & vx0, realtype & vy0,
                            realtype & vz0 );

    realtype GetLength    () { return length; }
    int      GetSeqLength () { return nres;   }
    realtype GetMass      () { return mass;   }

    realtype GetX1        () { return x1;     };
    realtype GetX2        () { return x2;     };
    realtype GetY1        () { return y1;     };
    realtype GetY2        () { return y2;     };
    realtype GetZ1        () { return z1;     };
    realtype GetZ2        () { return z2;     };

    Boolean  inRange      ( pstr chID, int Pos1, int Pos2 );

    int   GetVertexType   () { return type;    }
    int   GetVertexChainNo() { return VNo;     }
    pstr  GetChainID      () { return chainID; }
    void  GetVertexRange  ( ChainID chID,
                            ResName name1,
                            int &   seqNum1,
                            InsCode insCode1,
                            ResName name2,
                            int &   seqNum2,
                            InsCode insCode2 );  

    void  Copy  ( PCSSVertex v );

    void  read  ( RCFile f );
    void  write ( RCFile f );

  protected :
    
    //  matching info
    int      id;          // unique identifier that MUST be the vertex
                          // number starting from 1 on
    int      type;        // a V_XXXXX constant
    int      classID;     // class ID for helices
    int      nres;        // number of residues
    realtype x0,y0,z0;    // center of mass
    realtype mass;        // the mass
    realtype ex,ey,ez;    // direction vector
    realtype dalpha;      // uncertainty angle
    realtype length;      // vertex length

    //  identification info
    pstr     name;        // composed name for short identification
    int      serNum;      // helix serial number
    int      strandNo;    // strand number
    maxMMDBName vertexID; // helix ID or sheet ID
    ChainID  chainID;     // chain ID (only for identification)
    ResName  initResName; // name of the strand's initial residue
    int      initSeqNum;  // sequence number of the initial residue
    int      initPos;     // sequence position of the initial residue
    InsCode  initICode;   // insertion code of the initial residue
    ResName  endResName;  // name of the strand's terminal residue
    int      endSeqNum;   // sequence number of the terminal residue
    int      endPos;      // sequence position of the terminal residue
    InsCode  endICode;    // insertion code of the terminal residue
    int      VNo;         // number of vertex in the chain

    realtype x1,x2;       // coordinates
    realtype y1,y2;       //   SSE
    realtype z1,z2;       //     ends

    void  InitSSVertex ();
    void  FreeMemory   ();
    void  CalcGeometry ( PPCAtom CA );
    int   GetPositions ( PCMMDBManager MMDB, int minlen );
    realtype  GetCoor1 ( PPCAtom CA, int coor_key );
    realtype  GetCoor2 ( PPCAtom CA, int coor_key );

};



//  ==========================  CSSEdge  ============================

DefineClass(CSSEdge)
DefineStreamFunctions(CSSEdge)

class CSSEdge : public CStream  {

  friend class CSSGraph;
  friend class CSSGraphMatch;

  public :

    CSSEdge ();
    CSSEdge ( RPCStream Object );
    ~CSSEdge();

    void     SetEdge  ( PCSSVertex v1, PCSSVertex v2 );

    realtype GetAngle ( PCSSVertex v );  // returns angle between
                                         // the edge and vertex
    realtype GetCosine ( PCSSEdge E );   // returns cosine angle between
                                         // the edges
    realtype GetAngle ( rvector V1, rvector V2 );

    // Compare(..) returns 0 if edges compare, that is:
    //   1. edge lengths compare within relative precision
    //      edge_len_tol
    //   2. angles alpha1, alpha2 and alpha3 compare within
    //      absolute deviations edge_alphaX_tol .
    int   Compare ( Boolean swap_this, PCSSEdge edge,
                    Boolean swap_edge );

    int   CheckConnectivity ( Boolean swap_this, PCSSEdge edge,
                              Boolean swap_edge );

    void  GetDirection ( vect3 & v );
    realtype GetLength () { return length; }

    void  read  ( RCFile f );
    void  write ( RCFile f );
 
  protected :
    int      id1,id2;  // linked vertices
    int      vtype1;   // type of 1st linked vertex
    int      vtype2;   // type of 2nd linked vertex
    int      bdir;     // bond direction along the chain
    realtype length;   // length of edge (between v1 and v2 mass centers)
    realtype ex,ey,ez; // direction vector from v1 to v2
    realtype alpha1;   // angle V1E between v1 and the edge
    realtype alpha2;   // angle V2E between v2 and the edge
    realtype alpha3;   // angle V1V2 between v1 and v2
    realtype alpha4;   // torsion angle V1EV2 of v1, edge and v2
    realtype dalpha1;  // uncertainty in alpha1
    realtype dalpha2;  // uncertainty in alpha2
    realtype dalpha3;  // uncertainty in alpha3
    realtype dalpha4;  // uncertainty in alpha4
    realtype dr12;
    Boolean  GoodTorsion; // True if the VEV torsion angle is well defined

    void  InitSSEdge();

};


#endif
