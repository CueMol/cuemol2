// $Id: ssm_superpose.h,v 1.1 2010/01/23 14:25:05 rishitani Exp $
// =================================================================
//
//    30.04.04   <--  Date of Last Modification.
//                   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// -----------------------------------------------------------------
//
//  **** Module  :  ssm_spose  <interface>
//       ~~~~~~~~~
//  **** Functions : SuperposeCalphas ( superposing protein structures )
//       ~~~~~~~~~~~
//
//  E. Krissinel 2002-2004
//
// =================================================================
//


#ifndef  __SSM_Superpose__
#define  __SSM_Superpose__

#ifndef  __SS_Graph__
#include "ss_graph.h"
#endif


//  =================================================================

#define  SPOSE_Ok            0
#define  SPOSE_BadData       1
#define  SPOSE_NoCalphas1    2
#define  SPOSE_NoCalphas2    3
#define  SPOSE_RemoteStruct  4
#define  SPOSE_SVDFail       5


DefineStructure(SSpAtom)

struct SSpAtom  {
  ChainID  chID;
  int      c,sse,c0;
  realtype dist,dist0;
  int      unmap1,unmap2;
  Boolean  excluded;
  Boolean  CompatibleSSE ( RSSpAtom a );
};


DefineStructure(SSectionDist)

struct SSectionDist  {
  realtype dist,rmsd,cosine;
  int      core_pos1,core_pos2,core_e1,core_e2;
  int      na,pos1,pos2,e1,e2;
  int      sse1,sse2;
  void Copy ( RSSectionDist D );
};


DefineStructure(SSSEDesc)

struct SSSEDesc  {
  realtype x1,y1,z1,x2,y2,z2;          // transformed start/end coordinates
  realtype xs1,ys1,zs1,xs2,ys2,zs2;    // original start/end coordinates
  realtype score,Qscore,Rscore,Xscore; // overlaping scores
  int      pos,len,pend, type,classID;
  int      m,match;
  void  Transform ( mat44   & T );
  void  CalcScore ( RSSSEDesc D );
  realtype Cosine ( RSSSEDesc D );
  void  Copy      ( RSSSEDesc D );
};


DefineStructure(SSortDistData)

struct SSortDistData  {
  realtype dist;
  int      index,unmap1,unmap2;
};

DefineClass(CSortDist)

class CSortDist : public CQuickSort  {
  public :
    CSortDist() : CQuickSort() {}
    int  Compare ( int i, int j );
    void Swap    ( int i, int j );
    void Sort    ( PSSortDistData sdata, int len );
  protected :
    PSSortDistData sd;
};


DefineStructure(SSuperposeData)

struct SSuperposeData  {
  PCSSGraph     G;  // SSE graph 
  PCMMDBManager M;  // the structure
  PSSpAtom      a;  // atom superposition vector
  PPCAtom  Calpha;  // selected C-alphas
  PSSSEDesc  SSED;  // SSE description vector
  pstr  selstring;  // C-alpha selection string
  int      selHnd;  // C-alpha selection handle
  int  selHndIncl;  // selection handle of inculded C-alphas
  int        nres;  // number of residues (C-alphas)
  int       nSSEs;  // number of SSEs
  void  Init   ();
  void  Dispose();
  void  DeselectCalphas();
  void  SelectCalphas  ();
};


#define  UNMAP_YES  (-2)
#define  UNMAP_NO   (-1)

DefineClass(CSuperpose)

class CSuperpose  {

  public :
    CSuperpose();
    ~CSuperpose();

    void SetAllowMC         ( Boolean allowMisconnections );
    void SetIterationLimits ( int iter_max, int iter_min, int max_hollow );
    void SetCaSelections    ( pstr selection1, pstr selection2 );

    int  SuperposeSSGraphs  ( PCSSGraph G1, ivector F1,
                              PCSSGraph G2, ivector F2,
                              int matchlen );

    //  driver #1
    int  SuperposeCalphas  (
            PCSSGraph     G1,   //  SSE graph of 1st structure
            PCSSGraph     G2,   //  SSE graph of 2nd structure
            ivector       F1,   //  matched vertices of G1 [1..mlen]
            ivector       F2,   //  matched vertices of G2 [1..mlen]
            int         mlen,   //  length of match (F1,F2)
            PCMMDBManager M1,   //  1st structure
            PCMMDBManager M2,   //  2nd structure
            int  selHndIncl1=0, //  sel handle to include atoms from M1
            int  selHndIncl2=0  //  sel handle to include atoms from M2
                           );

    //  driver #2
    int  SuperposeCalphas  (
            PSSuperposeData SD1,  // superposition data of 1st structure
            PSSuperposeData SD2,  // superposition data of 2nd structure
            ivector          F1,  // matched vertices of SD1.G [1..mlen]
            ivector          F2,  // matched vertices of SD2.G [1..mlen]
            int            mlen   // length of match (F1,F2)
                           );

    void  GetTMatrix       ( mat44 & TMat ); // to be applied to 1st structure
    mat44 *  GetTMatrix    ();    // to be applied to 1st structure
    realtype GetRMSD       ();
    int      GetNAlign     ();
    void  GetSuperposition ( ivector  & Ca1  ,
                             rvector  & dist1, int & nCa1,
                             ivector  & Ca2  , int & nCa2,
                             mat44    & TMat ,
                             realtype & rmsdAchieved,
                             int & nAligned,   int & nGaps,
                             realtype & seqIdentity,
                             int & nMisD, realtype & nCombs );

    void GetSSEDesc1 ( RPSSSEDesc SSEDesc, int & numSSEs );
    void GetSSEDesc2 ( RPSSSEDesc SSEDesc, int & numSSEs );
    PSSSEDesc GetSSEDesc1();
    PSSSEDesc GetSSEDesc2();

    void GetSuperposedSSEs ( ivector v1, ivector v2,
                             int & nSupSSEs );

    realtype GetCalphaQ   ()  { return Q_achieved; }
    realtype MatchQuality ( int Nalign, realtype Rmsd );

  protected :
    mat44     TMatrix,TMx;
    PSSpAtom  a1,a2;
    realtype  Rmsd0;       // optimization parameter
    realtype  minContact;  // minimal Calpha-pair contact parameter
    realtype  maxContact;  // maximal Calpha-pair contact parameter
    realtype  maxRMSD;     // maximal RMSD allowed
    realtype  minQStep;    // minimal quality improvement that counts
    realtype  minCosine;   // minimum cosine between co-directional SSEs
    realtype  SSEweight;   // additional weight for SSE atoms
    int       sseGray;     // gray zone on the ends of SSEs allowed for
                           // matching to non-SSE atoms
    int       selInclHnd1; // selection handle for included Calpha1
    int       selInclHnd2; // selection handle for included Calpha2
    int       driverID;    // ID of the used Superpose driver
    pstr      selString1;  // optional selection string for 1st structure
    pstr      selString2;  // optional selection string for 2nd structure


    realtype  rmsd_achieved,Q_achieved,ncombs,seqIdent;
    int       shortSect1,shortSect2;
    int       iterMax,iterMin;
    int       maxHollowIt;  // maximal allowed number of consequtive
                            // iterations without quality improvement

    int       nres1,nres2,nalgn,ngaps,nmd,nmisdr;
    Boolean   allowMC;     // allowing for misconnection

    rmatrix   A,U,V, AD;
    rvector   W,RV1;

    ivector   FF1,FF2;  // copy pointers to input F1,F2
    int       FFlen;    // length of FF1,FF2
    rvector   cax0,cay0,caz0;  // working arrays
    PSSortDistData sdata;

    PCMMDBManager MMDB1,MMDB2; // copies of 1st and 2nd structure MMDBs

    PPCAtom   Calpha1,Calpha2;
    PSSSEDesc SSED1,SSED2;
    ivector   FH1,FS1,FH2,FS2;
    int       nSSEs1,nSSEs2;
    int       nFH1,nFS1,nFH2,nFS2;
    PPSSectionDist SDist;
    int       SDistAlloc;

    CSortDist SortDist;


    void  InitSuperpose       ();
    void  FreeMemory          ();
    void  SelectCalphas       ( PCMMDBManager MMDB, PCSSGraph G,
                                PPCAtom & Calpha, PSSpAtom & a,
                                int & nres, int & selHnd,
                                int selInclHnd, pstr selString );
    void  MapSSEs             ( PPCAtom Calpha, PSSpAtom a, int nres,
                                PCSSGraph G, RPSSSEDesc SSED,
                                int & nSSEs );
    void  IdentifyUnmatchedSSEs ( ivector & FH, int & nFH,
                                ivector & FS, int & nFS,
                                ivector F, int mlen,
                                PCSSGraph G );
    void  GetSSESpseCenters   ( RSSSEDesc Q1, RSSSEDesc Q2,
                                RSSSEDesc T1, RSSSEDesc T2,
                                realtype & qc1, realtype & qc2,
                                realtype & tc1, realtype & tc2 );
    int   FirstGuess          ( ivector F1, ivector F2, int mlen );
    void  ChooseFirstRotation ( int rotSSE1, int rotSSE2 );
    void  CalcDistance        ( int SSE1, int SSSE2, RSSectionDist D );
    void  AlignSSEs           ( RSSectionDist D, int unmap );
    Boolean isMC              ( int pos1, int pos2 );
    void  CorrespondSSEs      ( ivector F1, int nF1, ivector F2, int nF2,
                                realtype rmsd_est );
    void  CorrespondContacts  ( PCMMDBManager M1, realtype rmsd_est );
    void  ExpandContact       ( RSContact c, int & ip, int & im,
                                realtype maxDist2 );
    void  RecoverGaps         ( PPCAtom Ca1, PSSpAtom at1, int nat1,
                                PPCAtom Ca2, PSSpAtom at2, int nat2,
                                realtype thresh );
    void  CleanShortSections  ( PSSpAtom at1, int nat1, PSSpAtom at2 );

    int   CalculateTMatrix    ();
    void     CalcNGaps        ( PSSpAtom a, int nres, int & Ng, int & Nm );
    realtype CalcNCombs       ( PCSSGraph G, PSSSEDesc SSED, int nSSEs,
                                PSSpAtom  a, int nres );
    realtype MatchQuality2    ( int Nalign, realtype dist2 );
    void     CalcQScore       ( RSSSEDesc SSE1 );
    int   OptimizeNalign      ();
    void  UnmapExcluded       ( PSSpAtom a1, PSSpAtom a2, int nres1 );

    void  _superpose ( PCSSGraph G1, PCSSGraph G2, int & rc );

};


#endif
