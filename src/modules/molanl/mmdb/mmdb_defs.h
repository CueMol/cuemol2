//  $Id: mmdb_defs.h,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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
//    10.09.07   <--  Date of Last Modification.
//                   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//  -----------------------------------------------------------------
//
//  **** Module  :   MMDBF_Defs <interface>
//       ~~~~~~~~~
//  **** Project :   MacroMolecular Data Base (MMDB)
//       ~~~~~~~~~
//
//      Definition of types, constants and important classes.
//
//  (C) E. Krissinel 2000-2008
//
//  =================================================================
//

#ifndef __MMDB_Defs__
#define __MMDB_Defs__

#ifndef  __MatType__
#include "mattype_.h"
#endif


//  =======================  types  =================================

typedef  char         IDCode  [16];   // ID code of the entry
typedef  IDCode *     PIDCode;        // pointer to ID code 
typedef  PIDCode &    RPIDCode;       // ref-ce to pointer to ID code 
typedef  char         Date    [12];   // date DD-MMM-YYYY
typedef  char         RecName [7];    // name of PDB record

typedef  char         ChainID [10];   // chain ID
typedef  ChainID *    PChainID;       // pointer to chain ID
typedef  char         InsCode [10];   // insertion code
typedef  char         DBName  [10];   // sequence database name
typedef  char         DBAcCode[20];   // seq. database accession code
typedef  DBAcCode *   PDBAcCode;      // pointer to seq. db acc code
typedef  char         DBIdCode[20];   // seq. database ident-n code
typedef  DBIdCode *   PDBIdCode;      // pointer to DBIdCode
typedef  char         ResName [20];   // residue name
typedef  ResName  *   PResName;       // pointer to residue name
typedef  PResName *   PPResName;      // ptr to vector of residue names
typedef  char         HelixID [20];   // helix ID
typedef  char         StrandID[20];   // strand ID
typedef  char         SheetID [20];   // sheet ID
typedef  char         TurnID  [20];   // turn ID

typedef  char         SymGroup[100];  // group of space symmetry
typedef  realtype     vect3   [3];    // vector of 3 real numbers
typedef  vect3    *   pvect3;
typedef  pvect3   &   rpvect3;
typedef  realtype     vect4   [4];    // vector of 4 real numbers
typedef  vect3        mat33   [3];    // matrix 3x3 of real numbers

typedef  vect4        mat44   [4];    // matrix 4x4 of real numbers
typedef  mat44    *   pmat44;
typedef  mat44    &   rmat44;
typedef  pmat44   *   ppmat44;
typedef  pmat44   &   rpmat44;
typedef  mat33        mat633  [6];    // matrix 6x3x3 of real numbers

typedef  char         AtomName[20];   // name of the atom
typedef  AtomName *   PAtomName;      // pointer to atom name
typedef  char         AltLoc  [20];   // alternate location indicator
typedef  AltLoc   *   PAltLoc;        // pointer to alt loc indicator
typedef  char         SegID   [20];   // segment identifier
typedef  char         Element [10];   // chemical element name
typedef  Element  *   PElement;       // ptr to chemical element name
typedef  char         EnergyType[10]; // energy type name
typedef  EnergyType * PEnergyType;    // pointer to energy type name

// do not forget update this when change the above typedefs:
#define MaxMMDBNameLength  40
typedef  char     maxMMDBName[MaxMMDBNameLength];


//  =====================  constants  ===============================

//   ANY_RES should be used in selection functions for specifying
// "any residue" to select
#define ANY_RES  MinInt4

//    PRNK_XXXXX are the print keys. PRNK_Silent supresses all print
// inside mmdb_xxxx unless specifically ordered or catastrophic.
// PRNK_SimRWBROOK instructs mmdb to issue, whenever possible and
// necessary, printouts and warnings of RWBROOK (fortran) package.
#define  PRNK_Silent                0
#define  PRNK_SimRWBROOK            1

//  Error_XXXX may be returned by XX::ConvertPDBString() and GetCIF(..)
// functions.
//  Error_WrongSection is returned if the string passed into function
// does not belong to the corresponding PDB section.

#define  Error_NoError               0
#define  Error_Ok                    0
#define  Error_WrongSection          1

#define  Error_WrongChainID          2
#define  Error_WrongEntryID          3

//  Error_SEQRES_serNum is returned by CSeqRes::ConvertPDBASCII() if
//  serial numbers of SEQRES records do not increment by 1
#define  Error_SEQRES_serNum         4 

//  Error_SEQRES_numRes is returned by CSeqRes::ConvertPDBASCII() if
//  SEQRES records show different number of residues
#define  Error_SEQRES_numRes         5

//  Error_SEQRES_extraRes is returned by CSeqRes::ConvertPDBASCII() if
//  SEQRES contains more residues than specified
#define  Error_SEQRES_extraRes       6

#define  Error_NCSM_Unrecognized     7
#define  Error_NCSM_AlreadySet       8
#define  Error_NCSM_WrongSerial      9
#define  Error_NCSM_UnmatchIG       10

#define  Error_ATOM_Unrecognized    11
#define  Error_ATOM_AlreadySet      12
#define  Error_ATOM_NoResidue       13
#define  Error_ATOM_Unmatch         14

#define  Error_CantOpenFile         15
#define  Error_UnrecognizedInteger  16
#define  Error_WrongModelNo         17
#define  Error_DuplicatedModel      18
#define  Error_NoModel              19
#define  Error_ForeignFile          20
#define  Error_WrongEdition         21

//  CIF specific
#define  Error_NotACIFFile          22
#define  Error_NoData               23
#define  Error_UnrecognCIFItems     24
#define  Error_MissingCIFField      25
#define  Error_EmptyCIFLoop         26
#define  Error_UnexpEndOfCIF        27
#define  Error_MissgCIFLoopField    28
#define  Error_NotACIFStructure     29
#define  Error_NotACIFLoop          30
#define  Error_UnrecognizedReal     31

#define  Error_NoSheetID            32
#define  Error_WrongSheetID         33
#define  Error_WrongStrandNo        34

//   Error_WrongNumberOfStrands may be issued when reading
// sheet data from CIF
#define  Error_WrongNumberOfStrands 35

//   Error_WrongSheetOrder may be issued when reading
// sheet data from CIF
#define  Error_WrongSheetOrder      36

//   Error_HBondInconsistency may be issued when reading
// sheet data from CIF
#define  Error_HBondInconsistency   37

//   Error_EmptyResidueName is issued when PDB ATOM record
// does not have a residue name
#define  Error_EmptyResidueName     38

//   Error_DuplicateSeqNum is issued when PDB ATOM records
// show the sequence number and insertion code assigned
// to more than one residue name
#define  Error_DuplicateSeqNum      39

//   Error_NoLogicalName may be returned by file i/o functions
// if the specified environmental variable for file name
// is not found.
#define  Error_NoLogicalName        40

//   Error_EmptyFile may be returned at reading non-existing
// coordinate files
#define  Error_EmptyFile            41


//   Error_CIF_EmptyRow is the event of encountering
// an empty row in _atom_site loop. It is handled
// internally and has no effect on API
#define  Error_CIF_EmptyRow      99999

#define  Error_GeneralError1     10000


//  ClassID_XXXX are used by container classes for proper
// creating containered classes when reading from binary file.

#define  ClassID_Template           0
#define  ClassID_String             1
#define  ClassID_ObsLine            2
#define  ClassID_TitleLine          3
#define  ClassID_CAVEAT             4
#define  ClassID_Compound           5
#define  ClassID_Source             6
#define  ClassID_ExpData            7
#define  ClassID_Author             8
#define  ClassID_RevData            9
#define  ClassID_Supersede         10
#define  ClassID_Journal           11
#define  ClassID_Remark            12
#define  ClassID_DBReference       13
#define  ClassID_SeqAdv            14
#define  ClassID_ModRes            15
#define  ClassID_Het               16
#define  ClassID_NCSMatrix         17
#define  ClassID_TVect             18
#define  ClassID_Helix             19
#define  ClassID_Turn              20
#define  ClassID_Link              21
#define  ClassID_CisPep            22


//  =====================  classes  ===============================

DefineClass(CAtom)
DefineClass(CResidue)
DefineClass(CChain)
DefineClass(CModel)
DefineClass(CMMDBManager)


#endif

