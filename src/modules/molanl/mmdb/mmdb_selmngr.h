//  $Id: mmdb_selmngr.h,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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
//  **** Module  :  mmdb_selmngr <interface>
//       ~~~~~~~~~
//       Project :  MacroMolecular Data Base (MMDB)
//       ~~~~~~~~~
//  **** Classes :  CMMDBSelManager ( MMDB atom selection manager )
//       ~~~~~~~~~
//
//   (C) E. Krissinel 2000-2008
//
//  =================================================================
//

#ifndef __MMDB_SelMngr__
#define __MMDB_SelMngr__

#ifndef  __MMDB_CoorMngr__
#include "mmdb_coormngr.h"
#endif

#ifndef  __MMDB_Mask__
#include "mmdb_mask.h"
#endif



// ======================  CMMDBSelManager  =========================

//   Selection keys. These specify how the requested selection
// operation applies to the existing selection for the given mask:
//    SKEY_NEW    previous selection is wiped out
//    SKEY_OR     new selection is added to the already selected set;
//                if no selection preexists, SKEY_NEW and SKEY_OR
//                are equivalent. This key is the default one in
//                all selection functions.
//    SKEY_AND    new selection is made on the already selected set;
//                this corresponds to logical 'and' of former and
//                current selections. If no selection preexists,
//                no selection will be made.
//    SKEY_XOR    only those atoms will be left which are found
//                in either former or newly selected sets, but not
//                in both of them; this corresponds to logical
//                'exclusive or' of previous and current selections.
//                If no selection preexists, it is equivalent to
//                SKEY_OR.
#define SKEY_NEW   0
#define SKEY_OR    1
#define SKEY_AND   2
#define SKEY_XOR   3
#define SKEY_CLR   4


//  Selection types
#define STYPE_INVALID  (-1)
#define STYPE_UNDEFINED  0
#define STYPE_ATOM       1
#define STYPE_RESIDUE    2
#define STYPE_CHAIN      3
#define STYPE_MODEL      4

//  Residue properties for SelectProperties()
#define SELPROP_Solvent    0
#define SELPROP_Aminoacid  1
#define SELPROP_Nucleotide 2
#define SELPROP_Sugar      3
#define SELPROP_ModRes     4

//  comparison rules for SelectUDD function
#define UDSCR_LT         1
#define UDSCR_LE         2
#define UDSCR_EQ         3
#define UDSCR_NE         4
#define UDSCR_GE         5
#define UDSCR_GT         6
#define UDSCR_LTcase     7
#define UDSCR_LEcase     8
#define UDSCR_EQcase     9
#define UDSCR_NEcase     10
#define UDSCR_GEcase     11
#define UDSCR_GTcase     12
#define UDSCR_LTn        13
#define UDSCR_LEn        14
#define UDSCR_EQn        15
#define UDSCR_NEn        16
#define UDSCR_GEn        17
#define UDSCR_GTn        18
#define UDSCR_LTncase    19
#define UDSCR_LEncase    20
#define UDSCR_EQncase    21
#define UDSCR_NEncase    22
#define UDSCR_GEncase    23
#define UDSCR_GTncase    24
#define UDSCR_Substr     25
#define UDSCR_NoSubstr   26
#define UDSCR_Substr1    27
#define UDSCR_NoSubstr1  28



DefineClass(CMMDBSelManager)
DefineStreamFunctions(CMMDBSelManager)

class CMMDBSelManager : public CMMDBCoorManager  {

  public :

    CMMDBSelManager ();
    CMMDBSelManager ( RPCStream Object );
    ~CMMDBSelManager();


    // ====================  Selecting atoms  =======================

    //    NewSelection() creates a new selection mask and returns its
    // handle.  A handle is always a positive (non-zero) integer.
    // Calling NewSelection() is the only way to create a new
    // selection mask. Notice however that masks will be automatically
    // copied from another MMDB (see Copy(..) in CMMDBManager) if
    // coordinates are copied; if this is the case, the mask handles
    // will be inherited from the source MMDB as well. The masks will
    // also be automatically deleted (see Delete(..) in CMMDBManager())
    // if coordinates are deleted.
    int   NewSelection ();

    int   GetSelType ( int selHnd );  // returns STYPE_XXXX

    //    DeleteSelection(..) deletes the specified selection mask
    // and removes the corresponding selection attributes from
    // all atoms, which were selected with this mask. If an atom
    // was selected also with other mask(s), the other selection(s)
    // will remain, provided that the corresponding masks are valid.
    // After DeleteSelection() returns, the corresponding mask
    // becomes invalid.
    void  DeleteSelection ( int selHnd );

    //    DeleteAllSelections() deletes all selection masks and
    // unselects all atoms in the file. All mask handles become
    // invalid.
    void  DeleteAllSelections();

    //   SelectAtoms(..) selects atoms in the serial number range
    // of iSer1 to iSer2 by adding them to the set of atoms
    // marked by the given mask. If iSer1=iSer2=0 then all atoms
    // are selected. Each atom may be selected by a number of masks
    // simultaneously.
    void  SelectAtoms ( int selHnd, int iSer1, int iSer2,
                        int selKey=SKEY_OR // selection key
                      );

    //   SelectAtoms(..) selects atoms with serial numbers given in
    // vector asn[0..nsn-1].
    void  SelectAtoms ( int selHnd, ivector asn, int nsn,
                        int selKey=SKEY_OR // selection key
                      );

    //   UnselectAtoms(..) clears the specified mask for atoms in
    // the serial number range of iSer1 to iSer2. If iSer1=iSer2=0
    // then all atoms are cleared of the specified mask. If selHnd
    // is set to 0, then the atoms are cleared of any mask.
    void  UnselectAtoms ( int selHnd, int iSer1, int iSer2 );

    //   SelectAtom(..) selects a single atom according to the value
    // of selection key. If makeIndex is False, then the routine
    // does not update the selection index. This saves time, but
    // prevents GetSelIndex(..) from accessing all selected atoms.
    // In order to update the index after all single-atom selections
    // are done, use MakeSelIndex(selHnd) found next.
    void  SelectAtom    ( int selHnd, PCAtom A, int selKey=SKEY_OR,
                          Boolean makeIndex=True );

    //   SelectResidue(..), SelectChain(..) and SelectModel(..)
    // select a single residue, chain or model, or all their
    // hierarchical descendants depending on the value of selType
    // (i.e. atoms, residues (in chain and model) and chains
    // (in model only). Ascending hierarchical objects should be
    // selected explicitely, e.g. atom->GetResidue()->SelectResidue(..)
    void  SelectResidue ( int selHnd, PCResidue Res,
                          int selType, int selKey,
                          Boolean makeIndex );
    void  SelectChain   ( int selHnd, PCChain Chain,
                          int selType, int selKey,
                          Boolean makeIndex );
    void  SelectModel   ( int selHnd, PCModel model,
                          int selType, int selKey,
                          Boolean makeIndex );


    //   MakeSelIndex(.) calculates selection index for selection
    // adressed by selHnd.  All selection functions except the
    // SelectAtom(..) above, update selection index automatically.
    // This function is for use after a series of calls to
    // SelectAtom(..) with makeIndex parameter set False. This
    // combination of SelectAtom - MakeSelIndex considerably saves CPU
    // at extensive selections.
    //   MakeSelIndex(.) returns the number of selected objects.
    int   MakeSelIndex  ( int selHnd );
    void  MakeAllSelIndexes();

    //   Selecting by atom ID, space condition (a sphere) and some
    // other bits.
    void  SelectAtoms (
             int   selHnd,   // must be obtained from NewSelection()
             int   iModel,   // model number; iModel=0 means
                             // 'any model'
             cpstr Chains,   // may be several chains "A,B,W"; "*"
                             // means 'any chain' (in selected
                             // model(s))
             int   ResNo1,   // starting residue sequence number
             cpstr Ins1,     // starting residue insertion code; "*"
                             // means 'any code'
             int   ResNo2,   // ending residue sequence number.
             cpstr Ins2,     // ending residue insertion code; "*"
                             // means 'any code'. Combination of
                             // ResNo1=ResNo2=ANY_RES and
                             // Ins1=Ins2="*" means 'any residue'
                             // (in selected chain(s))
             cpstr RNames,   // may be several residue names
                             // "ALA,GLU,CIS"; "*" means 'any
                             // residue name'
             cpstr ANames,   // may be several names "CA,CB"; "*"
                             // means 'any atom' (in selected
                             // residue(s))
             cpstr Elements, // may be several element types
                             // 'H,C,O,CU'; "*" means 'any element'
             cpstr altLocs,  // may be several alternative
                             // locations 'A,B'; "*" means
                             // 'any alternative location'
             cpstr Segments, // may be several segment IDs
                             // like "S1,S2,A234"; "*" means
                             // 'any segment'
             cpstr Charges,  // may be several charges like
                             // "+1,-2,  "; "*" means 'any charge'
             realtype occ1,  // lowest occupancy
             realtype occ2,  // highest occupancy; occ1=occ2<0.0
                             // means "any occupancy"
             realtype x0,    // reference x-point
             realtype y0,    // reference y-point
             realtype z0,    // reference z-point
             realtype d0,    // selection distance from the
                             // reference point; d0<=0.0
                             // means "any distance" and values
                             // of x0, y0 and z0 are ignored
             int  selKey=SKEY_OR // selection key
           );

    //  Selecting by just atom ID, no other conditions
    void  SelectAtoms (
             int   selHnd,   // must be obtained from NewSelection()
             int   iModel,   // model number; iModel=0 means
                             // 'any model'
             cpstr Chains,   // may be several chains "A,B,W"; "*"
                             // means 'any chain' (in selected
                             // model(s))
             int   ResNo1,   // starting residue sequence number
             cpstr Ins1,     // starting residue insertion code; "*"
                             // means 'any code'
             int   ResNo2,   // ending residue sequence number.
             cpstr Ins2,     // ending residue insertion code; "*"
                             // means 'any code'. Combination of
                             // ResNo1=ResNo2=ANY_RES and
                             // Ins1=Ins2="*" means 'any residue
                             // number' (in selected chain(s))
             cpstr RNames,   // may be several residue names
                             // "ALA,GLU,CIS"; "*" means 'any
                             // residue name'
             cpstr ANames,   // may be several names "CA,CB"; "*"
                             // means 'any atom' (in selected
                             // residue(s))
             cpstr Elements, // may be several element types
                             // "H,C,O,CU"; "*" means 'any element'
             cpstr altLocs,  // may be several alternative
                             // locations 'A,B'; "*" means
                             // 'any alternative location'
             int selKey=SKEY_OR // selection key
           );


    //  Selecting by integer User-Defined Data
    void  SelectUDD ( 
             int      selHnd, // must be obtained from NewSelection()
             int     selType, // selection type STYPE_XXXXX
             int   UDDhandle, // UDD handle
             int      selMin, // lower selection boundary
             int      selMax, // upper selection boundary
             int      selKey  // selection key
           );
    void  SelectUDD ( 
             int      selHnd, // must be obtained from NewSelection()
             int     selType, // selection type STYPE_XXXXX
             int   UDDhandle, // UDD handle
             realtype selMin, // lower selection boundary
             realtype selMax, // upper selection boundary
             int      selKey  // selection key
           );
    void  SelectUDD ( 
             int        selHnd, // must be obtained from NewSelection()
             int       selType, // selection type STYPE_XXXXX
             int     UDDhandle, // UDD handle
             cpstr selStr, // selection string
             int       cmpRule, // comparison rule
             int        selKey  // selection key
           );


    //  Selecting a sphere
    void  SelectSphere (
             int  selHnd, // must be obtained from NewSelection()
             int selType, // selection type STYPE_XXXXX
             realtype  x, // x-coordinate of the sphere's center
             realtype  y, // y-coordinate of the sphere's center
             realtype  z, // z-coordinate of the sphere's center
             realtype  r, // radius of the sphere
             int  selKey=SKEY_OR // selection key
           );

    //  Selecting a cylinder
    void  SelectCylinder (
             int  selHnd, // must be obtained from NewSelection()
             int selType, // selection type STYPE_XXXXX
             realtype x1, // x-coordinate of the cylinder axis' 1st end
             realtype y1, // y-coordinate of the cylinder axis' 1st end
             realtype z1, // z-coordinate of the cylinder axis' 1st end
             realtype x2, // x-coordinate of the cylinder axis' 2nd end
             realtype y2, // y-coordinate of the cylinder axis' 2nd end
             realtype z2, // z-coordinate of the cylinder axis' 2nd end
             realtype  r, // radius of the cylinder
             int  selKey=SKEY_OR // selection key
           );

    //  Selecting all atoms on a given distance from a plane
    void  SelectSlab (
             int  selHnd, // must be obtained from NewSelection()
             int selType, // selection type STYPE_XXXXX
             realtype  a, // a-parameter of the plane  ax+by+cz=d
             realtype  b, // b-parameter of the plane  ax+by+cz=d
             realtype  c, // c-parameter of the plane  ax+by+cz=d
             realtype  d, // d-parameter of the plane  ax+by+cz=d
             realtype  r, // distance to the plane
             int selKey=SKEY_OR  // selection key
           );

    //  Selecting all atoms on a given distance from already selected
    void  SelectNeighbours (
             int  selHnd, // must be obtained from NewSelection()
             int selType, // selection type STYPE_XXXXX
             PPCAtom  sA, // array of already selected atoms
             int    alen, // length of A
             realtype d1, // minimal distance to already selected atoms
             realtype d2, // maximal distance to already selected atoms
             int  selKey=SKEY_OR // selection key
           );


    int   GetSelLength ( int selHnd );

    //  Getting an array of atoms selected for a certain mask
    void  GetSelIndex (
             int       selHnd,   // selection mask
             PPCAtom & SelAtom,  // continuous index of selected
                                 // atoms; application must not
                                 // dispose either index or atoms
             int &     nSelAtoms // length of index
                                 // [0..nSelectedAtoms-1]
           );

    //  Getting an array of residues selected for a certain mask
    void  GetSelIndex (
             int          selHnd,      // selection mask
             PPCResidue & SelResidues, // continuous index of selected
                                       // residues; application must
                                       // not dispose either index or
                                       // residues
             int &        nSelResidues // length of index
                                       // [0..nSelResidues-1]
           );

    //  Getting an array of chains selected for a certain mask
    void  GetSelIndex (
             int        selHnd,    // selection mask
             PPCChain & SelChains, // continuous index of selected
                                   // chains; application must not
                                   // dispose either index or chains
             int &      nSelChains // length of index
                                   // [0..nSelChains-1]
           );

    //  Getting an array of models selected for a certain mask
    void  GetSelIndex (
             int        selHnd,    // selection mask
             PPCModel & SelModels, // continuous index of selected
                                   // models; application must not
                                   // dispose either index or models
             int &      nSelModels // length of index
                                   // [0..nSelModels-1]
           );

    void  GetAtomStatistics ( int selHnd, RSAtomStat AS );


    // ===============  General selection functions  ================

    //   Selecting by atom ID, space condition (a sphere) and some
    // other bits.
    void  Select (
             int   selHnd,   // must be obtained from NewSelection()
             int   selType,  // selection type STYPE_XXXXX
             int   iModel,   // model number; iModel=0 means
                             // 'any model'
             cpstr Chains,   // may be several chains "A,B,W"; "*"
                             // means 'any chain' (in selected
                             // model(s))
             int   ResNo1,   // starting residue sequence number
             cpstr Ins1,     // starting residue insertion code; "*"
                             // means 'any code'
             int   ResNo2,   // ending residue sequence number.
             cpstr Ins2,     // ending residue insertion code; "*"
                             // means 'any code'. Combination of
                             // ResNo1=ResNo2=ANY_RES and
                             // Ins1=Ins2="*" means 'any residue'
                             // (in selected chain(s))
             cpstr RNames,   // may be several residue names
                             // "ALA,GLU,CIS"; "*" means
                             // 'any residue name'
             cpstr ANames,   // may be several names "CA,CB"; "*"
                             // means 'any atom' (in selected
                             // residue(s))
             cpstr Elements, // may be several element types
                             // 'H,C,O,CU'; "*" means 'any element'
             cpstr altLocs,  // may be several alternative
                             // locations 'A,B'; "*" means
                             // 'any alternative location'
             cpstr Segments, // may be several segment IDs like
                             // "S1,S2,A234"; "*" means
                             // 'any segment'
             cpstr Charges,  // may be several charges like
                             // "+1,-2,  "; "*" means 'any charge'
             realtype occ1,  // lowest occupancy
             realtype occ2,  // highest occupancy; occ1=occ2<0.0
                             // means "any occupancy"
             realtype x0,    // reference x-point
             realtype y0,    // reference y-point
             realtype z0,    // reference z-point
             realtype d0,    // selection distance from the
                             // reference point; d0<=0.0
                             // means "any distance" and values
                             // of x0, y0 and z0 are ignored
             int selKey=SKEY_OR // selection key
           );


    //  Selecting by just atom ID, no other conditions
    void  Select (
             int   selHnd,   // must be obtained from NewSelection()
             int   selType,  // selection type STYPE_XXXXX
             int   iModel,   // model number; iModel=0 means
                             // 'any model'
             cpstr Chains,   // may be several chains "A,B,W"; "*"
                             // means 'any chain' (in selected
                             // model(s))
             int   ResNo1,   // starting residue sequence number
             cpstr Ins1,     // starting residue insertion code; "*"
                             // means 'any code'
             int   ResNo2,   // ending residue sequence number.
             cpstr Ins2,     // ending residue insertion code; "*"
                             // means 'any code'. Combination of
                             // ResNo1=ResNo2=ANY_RES and
                             // Ins1=Ins2="*" means 'any residue
                             // number' (in selected chain(s))
             cpstr RNames,   // may be several residue names
                             // "ALA,GLU,CIS"; "*" means
                             // 'any residue name'
             cpstr ANames,   // may be several names "CA,CB"; "*"
                             // means 'any atom' (in selected
                             // residue(s))
             cpstr Elements, // may be several element types
                             // "H,C,O,CU"; "*" means 'any element'
             cpstr altLocs,  // may be several alternative
                             // locations 'A,B'; "*" means
                             // 'any alternative location'
             int selKey=SKEY_OR // selection key
           );


    //  Selecting by coordinate ID.
    //  Examples:
    //
    //  1.  /mdl/chn/s1.i1-s2.i2/at[el]:aloc
    //  2.  /mdl/chn/*(res).ic  /at[el]:aloc
    //  3.       chn/*(res).ic  /at[el]:aloc
    //  4.           s1.i1-s2.i2/at[el]:aloc
    //  5.           s1.i1      /at[el]:aloc
    //  6.  /mdl
    //  7.       chn
    //  8.           s1.i1-s2.i2
    //  9.           (res)
    //  10.                      at[el]:aloc
    //  11.      chn//[el]
    //
    //  mdl   - the model's serial number or 0 or '*' for any model
    //          (default).
    //  chn   - the chain ID or list of chains 'A,B,C' or '*' for
    //          any chain (default).
    //  s1,s2 - the starting and ending residue sequence numbers
    //          or '*' for any sequence number (default).
    //  i1,i2 - the residues insertion codes or '*' for any
    //          insertion code. If the sequence number other than  
    //          '*' is specified, then insertion code defaults to ""
    //          (no insertion code), otherwise the default is '*'.
    //  at    - atom name or list of atom names 'CA,N1,O' or '*'
    //          for any atom name (default)
    //  el    - chemical element name or list of chemical element
    //          names 'C,N,O' or '*' for any chemical element name
    //          (default)
    //  aloc  - the alternative location indicator or '*' for any
    //          alternate location. If the atom name and chemical
    //          element name is specified (both may be '*'), then
    //          the alternative location indicator defaults to ""
    //          (no alternate location), otherwise the default is
    //           '*'.
    //
    //  All spaces are ignored.
    //
    //  Returns -1 if numerical format of model is wrong, -2 if
    //  numerical format for sequence number is wrong, and 0
    //  otherwise.

    int   Select (
             int   selHnd,    // must be obtained from NewSelection()
             int   selType,   // selection type STYPE_XXXXX
             cpstr CID,       // coordinate ID
             int   selKey     // selection key
           );

    //  Propagating the selection up and down coordinate hierarchy
    void  Select (
             int  selHnd1,  // must be obtained from NewSelection()
             int  selType,  // selection type STYPE_XXXXX
             int  selHnd2,  // must be obtained from NewSelection()
                            // and have been used for selection
             int  selKey=SKEY_OR // selection key
           );

    void  SelectProperty (
             int  selHnd,   // must be obtained from NewSelection()
             int propKey,   // property key SELPROP_XXXXXXX
             int selType,   // selection type STYPE_XXXXX
             int  selKey    // selection key
           );

    // In SelectDomain, domainRange is of the following format:
    //    "*", "(all)"            - take all file
    //    "-"                     - take chain without chain ID
    //    "a:Ni-Mj,b:Kp-Lq,..."   - take chain a residue number N
    //                             insertion code i to residue numberM
    //                             insertion code j plus chain b
    //                             residue number K insertion code p to
    //                             residue number L insertion code q
    //                             and so on.
    //    "a:,b:..."              - take whole chains a and b and so on
    //    "a:,b:Kp-Lq,..."        - any combination of the above.
    int  SelectDomain ( int selHnd , cpstr domainRange,
                        int selType, int selKey, int modelNo=1 );

    void  DeleteSelObjects ( int selHnd );


  protected :

    // --- SELECTION DATA NOT FOR PUBLIC ACCESS
    int       nSelections;   // number of selections
    PPCMask   Mask;          // vector of selections
    ivector   SelType;       // vector of selection types
    ivector   nSelItems;     // numbers of selected items
    PPCMask * Selection;     // vector of selected items

    //  ---------------  Stream I/O  -----------------------------
    void  write ( RCFile f );
    void  read  ( RCFile f );

    void  InitMMDBSelManager();
    void  SelectAtom        ( PCAtom   atom,  int    maskNo,
                              int    selKey,  int &  nsel );
    void  SelectObject      ( int    selType, PCAtom atom,  int maskNo,
                              int    selKey,  int &  nsel );
    void  SelectObject      ( PCMask object,  int    maskNo,
                              int    selKey,  int &  nsel );
    void  MakeSelIndex      ( int    selHnd,  int    selType,
                              int    nsel );

    void  ResetManager();

    PCMask GetSelMask ( int selHnd );

};

#endif

