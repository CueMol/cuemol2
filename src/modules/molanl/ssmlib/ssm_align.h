// $Id: ssm_align.h,v 1.1 2010/01/23 14:25:05 rishitani Exp $
// =================================================================
//
//    22.04.04   <--  Date of Last Modification.
//                   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//  ----------------------------------------------------------------
//
//  **** Module  :  SSM_Align <interface>
//       ~~~~~~~~~
//  **** Project :  Structure alignment in 3D
//       ~~~~~~~~~
//  **** Classes :  CSSMAlign ( Secondary Structure Matching )
//       ~~~~~~~~~  CXAlign   ( Output alignment             ) 
//                  CXTAlign  ( Text output alignment        )
//
//  E. Krissinel, 2002-2004
//
// =================================================================
//
 
#ifndef  __SSM_Align__
#define  __SSM_Align__

#ifndef  __MMDB_Manager__
#include <modules/molanl/mmdb/mmdb_manager.h>
#endif

#ifndef  __SSM_Superpose__
#include "ssm_superpose.h"
#endif

#ifndef  __SS_CSIA__
#include "ss_csia.h"
#endif


//  ---------------------------  CSSMAlign  ------------------------

#define SSM_Ok          0
#define SSM_noHits      1
#define SSM_noSPSN      2
#define SSM_noGraph     3
#define SSM_noVertices  4
#define SSM_noGraph2    5
#define SSM_noVertices2 6

DefineClass(CSSMAlign)
DefineStreamFunctions(CSSMAlign)

class CSSMAlign : public CStream  {

  public :
    mat44    TMatrix; // superposition matrix to be applied to 1st structure
    realtype rmsd;         // core rmsd achieved
    int      cnCheck;      // connectivity option used
    int      nres1,nres2;  // number of residues in structures
    int      nsel1,nsel2;  // number of residues in aligned selections
    int      nalgn;        // number of aligned residues
    int      ngaps;        // number of gaps
    int      nmd;          // number of misdirections
    realtype ncombs;       // number of SSE combinations
    realtype seqIdentity;  // sequence identity
    int      selHndCa1,selHndCa2; // selection handles to used C-alphas
    ivector  Ca1,Ca2;      // C-alpha correspondence vectors
                           // Ca1[i] corresponds to a[i], where a is
                           // selection identified by selHndCa1
    rvector  dist1;        // optimizedd distances between the query
                           // and target C-alphas
    PCSSGraph G1,G2;       // retained SSE graphs

    CSSMAlign ();
    CSSMAlign ( RPCStream Object );
    ~CSSMAlign();

    int Align ( PCMMDBManager M1, PCMMDBManager M2,
                int precision, int connectivity,
                int selHnd1=0, int selHnd2=0 );

    PCSSGraph GetSSGraph ( PCMMDBManager M, int selHnd, int & rc );

    void  read  ( RCFile f );
    void  write ( RCFile f );

  protected :
    CSSGraphMatch U;
    CSuperpose    Superpose;

    void  InitSSMAlign();
    void  FreeMemory  ();
    void  MapSelections  ( int & selHndCa, PCMMDBManager M,
                           PCSSGraph G, int selHnd,
                           ivector & newID );
    void  MakeSelections ( PCMMDBManager M1, int selHnd1,
                           PCMMDBManager M2, int selHnd2 );

};

   

//  -----------------------------  CXAlign --------------------------

DefineStructure(SXBlock)

struct SXBlock  {
  int      i1,i2;    // the outer block boundaries
  int      ip1,ip2;  // the alignment boundaries (ip1>=i1, ip2<=i2)
  int      icol;     // the block "column" number
  realtype mc;       // center of "index mass"
};


DefineClass(CXAlign)

class CXAlign  {

  public :
    CXAlign();
    ~CXAlign();

    void XAlign ( PCSSGraph g1, PPCAtom Calpha1, ivector Ca1, int nat1,
                  PCSSGraph g2, PPCAtom Calpha2, ivector Ca2, int nat2,
                  rvector dist1, int & nr );

    int  GetNCols2() { return nCols2; }

  protected :
    PSXBlock  XBlock1,XBlock2;
    int       nBlock1,nBlock2;
    int       na1,na2,nCols1,nCols2,nRows,algnLen;

    ivector   a1,a2;
    PPCAtom   alpha1,alpha2;
    PCSSGraph sg1,sg2;
    rvector   d1;
    realtype  maxdist;

    virtual void FreeMemory();
    virtual void customInit();
    int   makeXBlocks  ( ivector Ca, int nat, RPSXBlock XBlock,
                         int & nBlocks );
    void  alignXBlocks ( RSXBlock B1, RSXBlock B2, int & nr );

    virtual void makeRow ( PCAtom A1, int sseType1,
                           PCAtom A2, int sseType2,
                           realtype dist, int rowNo, int icol,
                           Boolean aligned );
};


//  ----------------------------  CXTAlign --------------------------

DefineStructure(SXTAlign)

struct SXTAlign  {
  realtype hydropathy1,hydropathy2,dist;
  ChainID  chID1,chID2;
  ResName  resName1,resName2;
  InsCode  insCode1,insCode2;
  int      alignKey; // 0: aligned, 1: not aligned, 2: NULL 1, 3: NULL 2
  int      loopNo;
  int      sseType1,sseType2;
  int      seqNum1,seqNum2;
  int      simindex;
  void  Print ( RCFile f );
};


DefineClass(CXAlignText)

class CXAlignText : public CXAlign  {

  public :
    CXAlignText ();
    ~CXAlignText();

    PSXTAlign GetTextRows   () { return R; }
    void      GetAlignments ( pstr & algn1, pstr & algn2 );
    void      WipeTextRows  ();

  protected :
    PSXTAlign R;

    void customFree();
    void customInit();
    void makeRow   ( PCAtom A1, int sseType1,
                     PCAtom A2, int sseType2,
                     realtype dist, int rowNo, int icol,
                     Boolean aligned );
};


extern void PrintSSMAlignTable ( RCFile f,
                                 PCMMDBManager M1, PCMMDBManager M2,
                                 PCSSMAlign SSMAlign );

#endif
