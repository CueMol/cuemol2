//  $Id: mmdb_utils.h,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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
//  **** Module  :   MMDBF_Utils <interface>
//       ~~~~~~~~~
//  **** Project :   MacroMolecular Data Base (MMDB)
//       ~~~~~~~~~
//
//  **** Classes :   CContainerClass  ( containered class template    )
//       ~~~~~~~~~   CContString      ( containered string            )
//                   CClassContainer  ( container of classes          )
//                   CAtomPath        ( atom path ID                  )
//                   CQuickSort       ( quick sort of integers        )
//
//  **** Functions : Date9to11  ( DD-MMM-YY   -> DD-MMM-YYYY          )
//       ~~~~~~~~~~~ Date11to9  ( DD-MMM-YYYY -> DD-MMM-YY            )
//                   Date9toCIF ( DD-MMM-YY   -> YYYY-MM-DD           )
//                   Date11toCIF( DD-MMM-YYYY -> YYYY-MM-DD           )
//                   DateCIFto9 ( YYYY-MM-DD  -> DD-MMM-YY            )
//                   DateCIFto11( YYYY-MM-DD  -> DD-MMM-YYYY          )
//                   GetInteger ( reads integer from a string         )
//                   GetReal    ( reads real from a string            )
//                   GetIntIns  ( reads integer and insert code       )
//                   PutInteger ( writes integer into a string        )
//                   PutRealF   ( writes real in F-foram into a string)
//                   PutIntIns  ( writes integer and insert code      )
//                   CIFGetInteger ( reads and deletes int from CIF   )
//                   CIFGetReal    ( reads and deletes real from CIF  )
//                   CIFGetString  ( reads and deletes string from CIF)
//                   CIFGetInteger1 (reads and del-s int from CIF loop)
//                   CIFGetReal1    (reads and del-s int from CIF loop)
//                   Mat4Inverse    ( inversion of 4x4 matrices       )
//                   GetErrorDescription (ascii line to an Error_XXXXX)
//                   ParseAtomID    ( parses atom ID line             )
//                   ParseResID     ( parses residue ID line          )
//                   ParseAtomPath  ( parses full atom path           )
//
//   (C) E. Krissinel  2000-2008
//
//  =================================================================
//

#ifndef __MMDB_Utils__
#define __MMDB_Utils__


#ifndef __Stream__
#include "stream_.h"
#endif

#ifndef __MMDB_Defs__
#include "mmdb_defs.h"
#endif

#ifndef __MMDB_MMCIF__
#include "mmdb_mmcif.h"
#endif



// ==================  Date functions  ===================

// converts  DD-MMM-YY  to DD-MMM-YYYY; appends terminating zero
extern void  Date9to11   ( cpstr Date9, pstr Date11 );

// converts DD-MMM-YYYY to DD-MMM-YY;  does not append terminating zero
extern void  Date11to9   ( cpstr Date11, pstr Date9 );

// converts DD-MMM-YY   to YYYY-MM-DD;  appends terminating zero
extern void  Date9toCIF  ( cpstr Date9, pstr DateCIF );

// converts DD-MMM-YYYY to YYYY-MM-DD;  appends terminating zero
extern void  Date11toCIF ( cpstr Date11, pstr DateCIF );

// converts YYYY-MM-DD  to DD-MMM-YY;   appends terminating zero
extern void  DateCIFto9  ( cpstr DateCIF, pstr Date9 );

// converts YYYY-MM-DD  to DD-MMM-YYYY; appends terminating zero
extern void  DateCIFto11 ( cpstr DateCIF, pstr Date11 );


// =================  Format functions  ==================

//   Returns True if S contains an integer number in its
// first M characters. This number is returned in N.
//   The return is False if no integer number may be
// recognized. In this case, N is assigned MinInt4 value.
extern Boolean GetInteger ( int & N, cpstr S, int M );

//   Returns True if S contains a real number in its
// first M characters. This number is returned in R.
//   The return is False if no real number may be
// recognized. In this case, R is assigned -MaxReal value.
extern Boolean GetReal ( realtype & R, cpstr S, int M );

//   Returns True if S contains an integer number in its
// first M characters. This number is returned in N. In addition
// to that, GetIntIns() retrieves the insertion code which may
// follow the integer and returns it in "ins" (1 character +
// terminating 0).
//   The return is False if no integer number may be
// recognized. In this case, N is assigned MinInt4 value,
// "ins" just returns (M+1)th symbol of S (+terminating 0).
extern Boolean  GetIntIns ( int & N, pstr ins, cpstr S, int M ); 

//  Integer N is converted into ASCII string of length M
// and pasted onto first M characters of string S. No
// terminating zero is added.
//  If N is set to MinInt4, then first M characters of
// string S are set to space.
extern void  PutInteger ( pstr S, int N, int M );

//  Real R is converted into ASCII string of length M
// and pasted onto first M characters of string S. No
// terminating zero is added. The conversion is done
// according to fixed format FM.L
//  If R is set to -MaxReal, then first M characters of
// string S are set to the space character.
extern void  PutRealF ( pstr S, realtype R, int M, int L );

//  Integer N is converted into ASCII string of length M
// and pasted onto first M characters of string S. No
// terminating zero is added. The insert code ins is put
// immediately after the integer.
//  If N is set to MinInt4, then first M+1 characters of
// string S are set to space, and no insert code are
// appended.
extern void  PutIntIns ( pstr S, int N, int M, cpstr ins );


//   CIFInteger(..), CIFReal(..) and CIFGetString(..) automate
// extraction and analysis of data from CIF file. If the data
// is erroneous or absent, they store an error message in
// CIFErrorLocation string (below) and return non-zero.
extern int CIFGetInteger  ( int & I, PCMMCIFStruct Struct,
                                     cpstr Tag,
                                     Boolean Remove=True );
extern int CIFGetReal     ( realtype & R, PCMMCIFStruct Struct,
                                     cpstr Tag,
                                     Boolean Remove=True );
extern int CIFGetString   ( pstr S, PCMMCIFStruct Struct,
                                    cpstr Tag, int SLen,
                                    cpstr DefS,
                                    Boolean Remove=True );

extern int CIFGetInteger  ( int & I, PCMMCIFLoop Loop, cpstr Tag,
                            int & Signal );
extern int CIFGetInteger1 ( int & I, PCMMCIFLoop Loop, cpstr Tag,
                            int nrow );

extern int CIFGetReal     ( realtype & R, PCMMCIFLoop Loop,
                            cpstr Tag, int & Signal );
extern int CIFGetReal1    ( realtype & R, PCMMCIFLoop Loop,
                            cpstr Tag, int nrow );

extern int CIFGetString   ( pstr S, PCMMCIFLoop Loop, cpstr Tag,
                            int row, int SLen, cpstr DefS );

//  Calculates AI=A^{-1}
extern void  Mat4Inverse ( mat44 & A, mat44 & AI );
//  Calculates A=B*C
extern void  Mat4Mult    ( mat44 & A, mat44 & B, mat44 & C );
//  Calculates A=B^{-1}*C
extern void  Mat4Div1    ( mat44 & A, mat44 & B, mat44 & C );
//  Calculates A=B*C^{-1}
extern void  Mat4Div2    ( mat44 & A, mat44 & B, mat44 & C );
//  Calculates determinant of the rotation part
extern realtype Mat4RotDet ( mat44 & T );

//  Sets up a unit matrix
extern void  Mat4Init     ( mat44 & A );
extern void  Mat3Init     ( mat33 & A );

//  Calculates AI=A^{-1}, returns determinant
extern realtype Mat3Inverse ( mat33 & A, mat33 & AI );

extern Boolean isMat4Unit ( mat44 & A, realtype eps, Boolean rotOnly );

//  Copies A into AC
extern void  Mat4Copy    ( mat44 & A, mat44 & AC );
extern void  Mat3Copy    ( mat33 & A, mat33 & AC );
extern Boolean isMat4Eq  ( mat44 & A, mat44 & B, realtype eps,
                           Boolean rotOnly );

extern void TransformXYZ   ( mat44 & T,
                            realtype & X, realtype & Y, realtype & Z );
extern realtype TransformX ( mat44 & T,
                             realtype X, realtype Y, realtype Z );
extern realtype TransformY ( mat44 & T,
                             realtype X, realtype Y, realtype Z );
extern realtype TransformZ ( mat44 & T,
                             realtype X, realtype Y, realtype Z );


extern char CIFErrorLocation[200];

//  Returns ASCII string explaining the nature of
// Error_xxxx error code. 
extern cpstr  GetErrorDescription ( int ErrorCode );



//  ==============  CContainerClass  ====================

DefineClass(CContainerClass)
DefineStreamFunctions(CContainerClass)

class CContainerClass : public CStream  {

  friend class CClassContainer;

  public :

    CContainerClass ();
    CContainerClass ( RPCStream Object );
    ~CContainerClass() {}

    //    ConvertPDBASCII(..) will return one of the Error_XXXXX
    // constants, see <mmdb_defs.h>
    virtual int     ConvertPDBASCII ( cpstr S  ) { return 0;     }
    virtual void    PDBASCIIDump    ( pstr S, int N ) {}
    virtual Boolean PDBASCIIDump1   ( RCFile f )      { return False; }
    virtual void    MakeCIF         ( PCMMCIFData CIF, int N ) {}

    //   Append(..) should return True if CC is appended to this class.
    // If this is not the case, CC is merely put on the top of
    // container.
    //   Note: Append(..) detects the necessity to append CC and
    // performs all the necessary actions for that. The rest of CC
    // will be disposed by Class Container.
    //   Note: Class Container checks every new class, which is
    // being added to it (see CClassContainer::AddData(..)), only
    // against the top of container.
    virtual Boolean Append ( PCContainerClass CC );

    //  GetCIF(..) extracts any necessary information from CIF and
    //  returns:
    //    Signal>=0   : the information was successfully extracted,
    //                  this instance of container class should be
    //                  stored, and unchanged value of Signal should
    //                  be passed to the next (newly created) instance
    //                  of this container class.
    //    Signal = -1 : there is no information for this type of
    //                  containers to extract. This instance of
    //                  container class should be deleted and input
    //                  for this type of container class terminated.
    //    Signal < -1 : error. The code of error is determined as
    //                  -(Signal+1), then see Error_XXXXX constants
    //                  in <mmdb_defs.h>. This instance of container
    //                  class should be deleted and the whole input
    //                  should be stopped.
    virtual void GetCIF ( PCMMCIFData CIF, int & Signal )
                               { Signal = -1;  }
    virtual int  GetClassID () { return ClassID_Template; }

    virtual void Copy ( PCContainerClass CClass ) {}

    void write ( RCFile f ) {}
    void read  ( RCFile f ) {}

  protected :
    int  ContinuationNo;

};


//  ==============  CContString  ====================

DefineClass(CContString)
DefineStreamFunctions(CContString)

class CContString : public CContainerClass  {

  public :

    pstr Line;  // a string

    CContString ();
    CContString ( cpstr S );
    CContString ( RPCStream Object );
    ~CContString();

    int   ConvertPDBASCII ( cpstr S );
    void  PDBASCIIDump    ( pstr S, int N );
    Boolean PDBASCIIDump1 ( RCFile f );
    void  MakeCIF         ( PCMMCIFData CIF, int N );
    void  GetCIF          ( PCMMCIFData CIF, int & Signal );
    Boolean Append        ( PCContainerClass ContString   );

    int   GetClassID      () { return ClassID_String; }

    void  Copy  ( PCContainerClass CString );

    void  write ( RCFile f );
    void  read  ( RCFile f );

  protected :
    pstr CIFCategory,CIFTag;

    void InitString();

};


//  ==============  CClassContainer  ====================

DefineClass(CClassContainer)
DefineStreamFunctions(CClassContainer)

class CClassContainer : public CStream  {

  public :

    CClassContainer  ();
    CClassContainer  ( RPCStream Object ); 
    ~CClassContainer ();

    void    FreeContainer     ();
    void    AddData           ( PCContainerClass Data );
    virtual void PDBASCIIDump ( RCFile f );
    virtual void MakeCIF      ( PCMMCIFData CIF );
    //  GetCIF(..) will return one of the Error_XXXXX constants,
    //  see <mmdb_defs.h>
    int     GetCIF            ( PCMMCIFData CIF, int ClassID );
    virtual PCContainerClass MakeContainerClass ( int ClassID );

    // Copy will empty the class if parameter is set to NULL
    virtual void Copy         ( PCClassContainer CContainer );

    int   Length() { return length; }
    PCContainerClass  GetContainerClass ( int ContClassNo );

    void  write ( RCFile f );
    void  read  ( RCFile f );

  protected :
    int               length;
    PPCContainerClass Container;

    void Init();

};


//  ======================  ID parsers  ==========================

DefineClass(CAtomPath)
DefineStreamFunctions(CAtomPath)

#define APATH_ModelNo     0x00000001
#define APATH_ChainID     0x00000002
#define APATH_SeqNum      0x00000004
#define APATH_InsCode     0x00000008
#define APATH_ResName     0x00000010
#define APATH_AtomName    0x00000020
#define APATH_Element     0x00000040
#define APATH_AltLoc      0x00000080
#define APATH_Incomplete  0x00000100
#define APATH_WC_ModelNo  0x00001000
#define APATH_WC_ChainID  0x00002000
#define APATH_WC_SeqNum   0x00004000
#define APATH_WC_InsCode  0x00008000
#define APATH_WC_ResName  0x00010000
#define APATH_WC_AtomName 0x00020000
#define APATH_WC_Element  0x00040000
#define APATH_WC_AltLoc   0x00080000

class CAtomPath : public CStream  {

  public :

    int      modelNo;
    ChainID  chainID;
    int      seqNum;
    InsCode  insCode;
    ResName  resName;
    AtomName atomName;
    Element  element;
    AltLoc   altLoc;
    int      isSet;

    CAtomPath  ();
    CAtomPath  ( cpstr ID );
    CAtomPath  ( RPCStream Object );
    ~CAtomPath ();

    //  SetPath(..) parses the Atom Path ID string, which
    //  may be incomplete. Below {..} means blocks that
    //  may be omitted; any elements within such blocks
    //  may be omitted as well.
    //
    //  1. If ID starts with '/' then the ID must be of
    //     the following form:
    //   /mdl{/chn{/seq(res).i{/atm[elm]:a}}}
    //
    //  2. If ID starts with a letter:
    //        chn{/seq(res).i{/atm[elm]:a}}
    //
    //  3. If ID starts with a number or '(':
    //            seq(res).i{/atm[elm]:a}
    //
    //  4. If ID contains colon ':' or '[' then
    //     it may be just
    //                       atm[elm]:a
    //
    //  The following are valid samples of IDs:
    //
    //     /1      model number 1
    //     /1/A/23(GLU).A/CA[C]:A  model number 1, chain A,
    //             residue 23 GLU insertion code A, C-alpha
    //             atom in alternative location A
    //     A/23    residue 23 of chain A
    //     CA[C]:  atom C-alpha
    //     [C]     a carbon
    //     *[C]:*  same as above
    //     :A      an atom with insertion code A
    //     5       residue number 5
    //     (GLU)   residue GLU
    // 
    //   All spaces are ignored. SetPath(..) sets bit of isSet
    // for each element present. Any element may be a wildcard
    // '*'. Wildcard for model will set modelNo=0, for sequence
    // number will set seqNum=MinInt4.
    //
    // Returns:
    //   0   <-> Ok
    //   -1  <-> wrong numerical format for model
    //   -2  <-> wrong numerical format for sequence number
    int SetPath ( cpstr ID );

    void write ( RCFile f );
    void read  ( RCFile f );

  protected :
    void InitAtomPath();

};


//  --------------------------------------------------------------

DefineClass(CQuickSort)

class CQuickSort : public CStream  {

  public :
    CQuickSort ();
    CQuickSort ( RPCStream Object );
    ~CQuickSort() {}
    virtual int  Compare ( int i, int j );
    virtual void Swap    ( int i, int j );
    void Sort ( void * sortdata, int data_len );

  protected :
    int    selSortLimit,dlen;
    void * data;

    void SelectionSort ( int left, int right );
    int  Partition     ( int left, int right );
    void Quicksort     ( int left, int right );

};


//  --------------------------------------------------------------

void  takeWord ( pstr & p, pstr wrd, cpstr ter, int l );

//   ParseAtomID(..) reads the atom ID of the following form:
//    {name} {[element]} {:altcode}
// (here {} means that the item may be omitted; any field may have
// value of wildcard '*'), and returns the atom name in aname,
// element name - in elname, and alternate location code - in aloc.
// Except for the alternate location code, missing items are
// replaced by wildcards. Missing alternate location code is
// returned as empty string "".
//   Leading spaces are allowed; any other space will terminate
// the parsing.
//   The followings are perfectly valid atom IDs:
//        CA[C]:A     (carbon C_alpha in location A)
//        CA[*]:A     (either C_alpha or Ca in location A)
//        CA:A        (same as above)
//        CA          (either C_alpha or Ca with no location indicator)
//        CA[]        (same as above)
//        CA[C]:      (C_alpha with no location indicator)
//        [C]         (any carbon with no location indicator)
//        [C]:*       (any carbon with any location indicator)
//        *[C]:*      (same as above)
//        :A          (any atom in location A)
//        *[*]:A      (same as above)
//        *[*]:*      (any atom)
//        *           (any atom with no alternate location indicator)
extern void ParseAtomID ( cpstr ID, AtomName aname,
                          Element elname, AltLoc   aloc );

//   ParseResID(..) reads the residue ID of the following form:
//    {seqnum} {(name)} {.inscode}
// (here {} means that the item may be omitted; any field may have
// value of wildcard '*'), and returns the sequence number in sn,
// insertion code - in inscode, and residue name - in resname.
// If a wildcard was specified for the sequence number, then
// ParseResID(..) returns 1. Missing residue name is replaced by
// the wildcard '*', and misisng insertion code is returned as empty
// string "".
//   Leading spaces are allowed; any other space will terminate
// the parsing.
//   Return 0 means Ok, 1 - wildcard for the sequence number,
// 2 - an error in numerical format of the sequence number
// (other items are parsed).
//   The followings are perfectly valid residue IDs:
//        27(ALA).A   (residue 27A ALA)
//        27().A      (residue 27A)
//        27(*).A     (same as above)
//        27.A        (same as above)
//        27          (residue 27)
//        27().       (same as above)
//        (ALA)       (any ALA without insertion code)
//        (ALA).      (same as above)
//        (ALA).*     (any ALA)
//        *(ALA).*    (any ALA)
//        .A          (any residue with insertion code A)
//        *(*).A      (same as above)
//        *(*).*      (any residue)
//        *           (any residue with no insertion code)
extern int ParseResID ( cpstr ID, int & sn,
                        InsCode inscode, ResName resname );


//   ParseAtomPath(..) parses an atom path string of the following
// structure:
//   /mdl/chn/seq(res).i/atm[elm]:a
// where all items may be represented by a wildcard '*' and
//   mdl   - model number (mandatory); at least model #1 is always
//           present; returned in mdl; on a wildcard mdl is set to 0
//   chn   - chain identifier ( mandatory); returned in chn; on a
//           wildcard chn is set to '*'
//   seq   - residue sequence number (mandatory); returned in sn;
//           on a wild card ParseAtomPath(..) returns 1
//   (res) - residue name in round brackets (may be omitted);
//           returnded in res; on a wildcard res is set to '*'
//   .i    - insert code after a dot; if '.i' or 'i' is missing
//           then a residue without an insertion code is looked for;
//           returned in ic; on a wildcard (any insertion code would
//           do) ic is set to '*'
//   atm   - atom name (mandatory); returned in atm; on a wildcard
//           atm is set to '*'
//   [elm] - chemical element code in square brackets; it may
//           be omitted but could be helpful for e.g.
//           distinguishing C_alpha and CA; returned in elm;
//           in a wildcard elm is set to '*'
//   :a    - alternate location indicator after colon; if
//           ':a' or 'a' is missing then an atom without
//           alternate location indicator is looked for; returned
//           in aloc; on a wildcard (any alternate code would do)
//           aloc is set to '*'.
// All spaces are ignored, all identifiers should be in capital
// letters (comparisons are case-sensitive).
//   The atom path string may be incomplete. If DefPath is supplied,
// the function will try to get missing elements from there. If
// missing items may not be found in DefPath, they are replaced by
// wildcards.
//   ParseAtomPath(..) returns the following bits:
//      0                 - Ok
//      APATH_Incomplete  - if path contains wildcards. Wildcards for
//                          residue name and chemical element will be
//                          ignored here if sequence number and
//                          atom name, correspondingly, are provided.
//      APATH_WC_XXXXX    - wildcard for different elements
//      -1                - wrong numerical format for model (fatal)
//      -2                - wrong numerical format for seqNum (fatal)

extern int ParseAtomPath ( cpstr      ID,
                           int &      mdl,
                           ChainID    chn,
                           int &      sn,
                           InsCode    ic,
                           ResName    res,
                           AtomName   atm,
                           Element    elm,
                           AltLoc     aloc,
                           PCAtomPath DefPath=NULL );



extern int ParseSelectionPath ( cpstr   CID,
                                int &   iModel,
                                pstr    Chains,
                                int &   sNum1,
                                InsCode ic1,
                                int &   sNum2,
                                InsCode ic2,
                                pstr    RNames,
                                pstr    ANames,
                                pstr    Elements,
                                pstr    altLocs );



extern void MakeSelectionPath ( pstr       CID,
                                int        iModel,
                                cpstr      Chains,
                                int        sNum1,
                                const InsCode ic1,
                                int        sNum2,
                                const InsCode ic2,
                                cpstr      RNames,
                                cpstr      ANames,
                                cpstr      Elements,
                                cpstr      altLocs );

#endif

