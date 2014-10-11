//  $Id: mmdb_file.h,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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
//    24.03.09   <--  Date of Last Modification.
//                   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//  -----------------------------------------------------------------
//
//  **** Module  :  MMDB_File <interface>
//       ~~~~~~~~~
//       Project :  MacroMolecular Data Base (MMDB)
//       ~~~~~~~~~
//  **** Classes :  CMMDBFile
//       ~~~~~~~~~
//
//  (C) E. Krissinel 2000-2009
//
//  =================================================================
//

#ifndef __MMDB_File__
#define __MMDB_File__


#ifndef __File__
#include "file_.h"
#endif

#ifndef  __mmdb_uddata__
#include "mmdb_uddata.h"
#endif

#ifndef  __MMDB_Defs__
#include "mmdb_defs.h"
#endif

#ifndef  __MMDB_Title__
#include "mmdb_title.h"
#endif

#ifndef  __MMDB_Cryst__
#include "mmdb_cryst.h"
#endif

#ifndef  __MMDB_Chain__
#include "mmdb_chain.h"
#endif

#ifndef  __MMDB_Model__
#include "mmdb_model.h"
#endif


// =======================  CMMDBFile  ===========================


// special effect flags

#define MMDBF_AutoSerials             0x00000001
#define MMDBF_NoCoordRead             0x00000002
#define MMDBF_SimRWBROOK              0x00000004
#define MMDBF_PrintCIFWarnings        0x00000008
#define MMDBF_EnforceSpaces           0x00000010
#define MMDBF_IgnoreDuplSeqNum        0x00000020
#define MMDBF_IgnoreSegID             0x00000040
#define MMDBF_IgnoreElement           0x00000080
#define MMDBF_IgnoreCharge            0x00000100
#define MMDBF_IgnoreNonCoorPDBErrors  0x00000200
#define MMDBF_IgnoreUnmatch           0x00000400
#define MMDBF_IgnoreBlankLines        0x00000800
#define MMDBF_IgnoreHash              0x00001000
#define MMDBF_IgnoreRemarks           0x00002000
#define MMDBF_AllowDuplChainID        0x00004000
#define MMDBF_FixSpaceGroup           0x00008000
#define MMDBF_EnforceAtomNames        0x00010000

// file types:
#define MMDB_FILE_Undefined     -1
#define MMDB_FILE_PDB            0
#define MMDB_FILE_CIF            1
#define MMDB_FILE_Binary         2

// cleanup flags:
#define PDBCLEAN_ATNAME         0x00000001
#define PDBCLEAN_TER            0x00000002
#define PDBCLEAN_CHAIN          0x00000004
#define PDBCLEAN_CHAIN_STRONG   0x00000008
#define PDBCLEAN_ALTCODE        0x00000010
#define PDBCLEAN_ALTCODE_STRONG 0x00000020
#define PDBCLEAN_SERIAL         0x00000040
#define PDBCLEAN_SEQNUM         0x00000080
#define PDBCLEAN_CHAIN_ORDER    0x00000100
#define PDBCLEAN_CHAIN_ORDER_IX 0x00000200
#define PDBCLEAN_SOLVENT        0x00000400
#define PDBCLEAN_INDEX          0x00000800
#define PDBCLEAN_ELEMENT        0x00001000
#define PDBCLEAN_ELEMENT_STRONG 0x00002000


// crystallographic info inquery
#define  CRRDY_NotPrecise       0x00000001
#define  CRRDY_isTranslation    0x00000002
#define  CRRDY_NoOrthCode       0x00000004

#define  CRRDY_Complete            0
#define  CRRDY_NoTransfMatrices   -1
#define  CRRDY_Unchecked          -2
#define  CRRDY_Ambiguous          -3
#define  CRRDY_NoCell             -4
#define  CRRDY_NoSpaceGroup       -5


DefineClass(CMMDBFile)
DefineStreamFunctions(CMMDBFile)

class CMMDBFile : public CUDData  {

  friend class CModel;
  friend class CChain;
  friend class CResidue;
  friend class CAtom;
  friend class CChannel;

  public :

    CMMDBFile ();
    CMMDBFile ( RPCStream Object );
    ~CMMDBFile();

    void  FreeFileMemory();


    //  ---------------  Reading/Writing external files  ---------

    void  SetFlag        ( word Flag );
    void  RemoveFlag     ( word Flag );

    int   ReadPDBASCII   ( cpstr PDBFileName,
                           byte gzipMode=GZM_CHECK );
    int   ReadPDBASCII1  ( cpstr PDBLFName,
                           byte gzipMode=GZM_CHECK );
    int   ReadPDBASCII   ( RCFile f );

    int   ReadCIFASCII   ( cpstr CIFFileName,
                           byte gzipMode=GZM_CHECK );
    int   ReadCIFASCII1  ( cpstr CIFLFName,
                           byte gzipMode=GZM_CHECK );
    int   ReadFromCIF    ( PCMMCIFData CIFD, Boolean fixSpaceGroup );

    // adds info from PDB file
    int   AddPDBASCII1   ( cpstr PDBLFName,
                           byte gzipMode=GZM_CHECK );
    int   AddPDBASCII    ( cpstr PDBFileName,
                           byte gzipMode=GZM_CHECK );

    // auto format recognition
    int   ReadCoorFile   ( cpstr LFName,
                           byte gzipMode=GZM_CHECK );
    int   ReadCoorFile1  ( cpstr CFName,
                           byte gzipMode=GZM_CHECK );

    int   WritePDBASCII  ( cpstr PDBFileName,
                           byte gzipMode=GZM_CHECK );
    int   WritePDBASCII1 ( cpstr PDBLFName,
                           byte gzipMode=GZM_CHECK );
    void  WritePDBASCII  ( RCFile f );

    int   WriteCIFASCII  ( cpstr CIFFileName,
                           byte gzipMode=GZM_CHECK );
    int   WriteCIFASCII1 ( cpstr CIFLFName,
                           byte gzipMode=GZM_CHECK );
    
    int   ReadMMDBF      ( cpstr MMDBFileName,
                           byte gzipMode=GZM_CHECK );
    int   ReadMMDBF1     ( cpstr MMDBLFName,
                           byte gzipMode=GZM_CHECK );
    int   WriteMMDBF     ( cpstr MMDBFileName,
                           byte gzipMode=GZM_CHECK );
    int   WriteMMDBF1    ( cpstr MMDBLFName,
                           byte gzipMode=GZM_CHECK );

    void  GetInputBuffer ( pstr Line, int & count );

    //  PutPDBString adds a PDB-keyworded string
    // to the existing structure. Note that the string
    // is namely added meaning that it will be the
    // last REMARK, last JRNL, last ATOM etc. string
    // -- always the last one in its group.
    int   PutPDBString   ( cpstr PDBString );



    //  PDBCleanup(..) cleans coordinate part to comply with PDB
    // standards and MMDB "expectations":
    //
    //  PDBCLEAN_ATNAME  pads atom names with spaces to form
    //                   4-symbol names
    //  PDBCLEAN_TER     inserts TER cards in the end of each chain
    //  PDBCLEAN_CHAIN   generates 1-character chain ids instead of
    //                   those many-character
    //  PDBCLEAN_CHAIN_STRONG generates 1-character chain ids starting
    //                   from 'A' on for all ids, including the
    //                   single-character ones
    //  PDBCLEAN_ALTCODE generates 1-character alternative codes
    //                   instead of many-character ones
    //  PDBCLEAN_ALTCODE_STRONG generates 1-character alternative codes
    //                   from 'A' on for all codes, including the
    //                   single-character ones
    //  PDBCLEAN_SERIAL  puts serial numbers in due order
    //  PDBCLEAN_SEQNUM  renumbers all residues so that they go
    //                   incrementally-by-one without insertion codes
    //  PDBCLEAN_CHAIN_ORDER puts chains in order of atom's serial
    //                   numbers
    //  PDBCLEAN_CHAIN_ORDER_IX puts chains in order of atom's
    //                   indices internal to MMDB
    //  PDBCLEAN_SOLVENT moves solvent chains at the end of each model
    //
    //  Return codes (as bits):
    //  0                Ok
    //  PDBCLEAN_CHAIN   too many chains for assigning them
    //                   1-letter codes
    //  PDBCLEAN_ATNAME  element names were not available
    //  PDBCLEAN_ALTCODE too many alternative codes encountered.
    //
    word  PDBCleanup ( word CleanKey );

    //     Makes all atoms in chain 'chainID', in all models, as
    //  'Het' atoms if Make is set True, and makes them 'ordinary'
    //  atoms otherwise. 'Ter' is automatically removed when
    //  converting to 'Het' atoms, and is automatically added
    //  when converting to 'ordinary' atoms. This may cause
    //  disorder in serial numbers -- just call
    //  PDBClean(PDBCLEAN_SERIAL) when necessary to fix this.
    void  MakeHetAtoms ( cpstr chainID, Boolean Make );

    //  ---------------  Working with atoms by serial numbers  ---

    PPCAtom GetAtomArray  ()  { return Atom;   }
    int GetAtomArrayLength()  { return AtmLen; } // strictly not for
                                             // use in applications!!
    PCAtom  GetAtomI ( int index );   // returns Atom[index-1]

    //   PutAtom(..) puts atom with the specified properties
    // into the structure. The current model is used; if no model
    // is set (crModel==NULL), one is created. Coordinates and
    // other parameters of the atom need to be set separately.
    //   The place, at which the atom is put, is determined by
    // index. If index is positive, then it points onto (index-1)th
    // element of the Atom array (the index counts 1,2,... and
    // generally coincides with the atom's serial number). If
    // there is already an atom at this position in the system,
    // the new atom will REPLACE it. The corresponding residues
    // are automatically updated.
    //   If index is null (=0), the new atom will be put on
    // the top of the structure, i.e. it will be put into
    // (index=nAtoms+1)-th position.
    //   If index is negative, then the new atom is INSERTED
    // BEFORE the atom in the (-index)th position. For saving
    // the computational efforts, this WILL NOT cause the
    // recalculation of all atoms' serial numbers according
    // to their actual positions. It will be needed, however,
    // for putting the things in order at a certain point,
    // especially before writing an output ASCII file. NOTE
    // that this ordering is never done automatically.
    //   In a correct PDB file the serial number (serNum) is always
    // equal to its position (index). However here we allow them
    // to be different for easing the management of relations,
    // particularly the connectivity.
    //
    //   Limitation: if PutAtom implies creating new
    // chains/residues, these are always created on the top
    // of existing chains/residues.
    int   PutAtom ( int            index,
                    int            serNum,
                    const AtomName atomName,
                    const ResName  resName,
                    const ChainID  chainID,
                    int            seqNum,
                    const InsCode  insCode,
                    const AltLoc   altLoc,
                    const SegID    segID,
                    const Element  element );

    int   PutAtom (
               int      index,    // same meaning as above
               PCAtom   A,        // pointer to completed atom class
               int      serNum=0  // 0 means that the serial number
                                  // will be set equal to index.
                                  // Otherwise the serial number
                                  // is set to the specified
                                  // value
                  );


    //    RemoveAtom(..) removes atom at the specified index
    // in the Atom array. This index is always accessible
    // as Atom[index]->index. If this leaves a residue empty,
    // the residue is removed. If this leaves an empty chain,
    // the chain is removed as well; the same happens to the
    // model.
    void  RemoveAtom ( int index );

    void  FinishStructEdit();

    void  TrimModelTable();

    //  ----------------  Deleting models  -----------------------

    int  DeleteAllModels  ();
    Boolean GetNewChainID ( int modelNo, ChainID chID, int length=1 );

    //  ---------------  Enquiring -------------------------------

    int   CrystReady();
    //    Returns flags:
    // CRRDY_Complete       if crystallographic information is complete
    // CRRDY_NotPrecise     if cryst. inf-n is not precise
    // CRRDY_isTranslation  if cryst. inf-n contains translation
    // CRRDY_NoOrthCode      no orthogonalization code
    //    Fatal:
    // CRRDY_NoTransfMatrices  if transform. matrices were not
    //                         calculated
    // CRRDY_Unchecked         if cryst. inf-n was not checked
    // CRRDY_Ambiguous         if cryst. inf-n is ambiguous
    // CRRDY_NoCell            if cryst. inf-n is unusable
    // CRRDY_NoSpaceGroup      if space group is not set


    Boolean isCrystInfo   ();  // cell parameters and space group
    Boolean isCellInfo    ();  // cell param-s a,b,c, alpha,beta,gamma
    Boolean isSpaceGroup  ();  // space group on CRYST1 card
    Boolean isTransfMatrix();  // orthogonalizing/fractionalizing
                               // matrices
    Boolean isScaleMatrix ();  // SCALEx PDB records
    Boolean isNCSMatrix   ();  // MTRIXx PDB records
    int     GetNumberOfNCSMatrices();
    int     GetNumberOfNCSMates   ();  // Returns the number of
                                       // NCS mates not given in
                                       // the file (iGiven==0)
    Boolean GetNCSMatrix  ( int NCSMatrixNo, // 0..N-1
                            mat44 & ncs_m, int & iGiven );

    int GetNumberOfSymOps ();  // number of symmetry operations
    pstr GetSymOp ( int Nop ); // XYZ symmetry operation name


    //  -------------  User-Defined Data  ------------------------

    int RegisterUDInteger ( int udr_type, cpstr UDDataID );
    int RegisterUDReal    ( int udr_type, cpstr UDDataID );
    int RegisterUDString  ( int udr_type, cpstr UDDataID );
    int GetUDDHandle      ( int udr_type, cpstr UDDataID );

    //  ----------------------------------------------------------

    void  SetSyminfoLib ( cpstr syminfo_lib );
    pstr  GetSyminfoLib ();
    int   SetSpaceGroup ( cpstr spGroup );
    pstr  GetSpaceGroup ();
    pstr  GetSpaceGroupFix();

    void  GetAtomStatistics ( RSAtomStat AS );

    void  SetIgnoreSCALEi ( Boolean ignoreScalei );

    //  SetCell(..) is for changing cell parameters
    void  SetCell ( realtype cell_a,
                    realtype cell_b,
                    realtype cell_c,
                    realtype cell_alpha,
                    realtype cell_beta,
                    realtype cell_gamma,
                    int      OrthCode=0 );

    //  PutCell(..) is for setting cell parameters
    void  PutCell ( realtype cell_a,
                    realtype cell_b,
                    realtype cell_c,
                    realtype cell_alpha,
                    realtype cell_beta,
                    realtype cell_gamma,
                    int      OrthCode=0 );

    int   GetCell ( realtype & cell_a,
                    realtype & cell_b,
                    realtype & cell_c,
                    realtype & cell_alpha,
                    realtype & cell_beta,
                    realtype & cell_gamma,
                    realtype & vol,
                    int      & OrthCode );

    int  GetRCell ( realtype & cell_as,
                    realtype & cell_bs,
                    realtype & cell_cs,
                    realtype & cell_alphas,
                    realtype & cell_betas,
                    realtype & cell_gammas,
                    realtype & vols,
                    int      & OrthCode );

    void GetROMatrix ( mat44 & RO );

    //  GetTMatrix(..) calculates and returns the coordinate
    //  transformation matrix, which converts orthogonal coordinates
    //  according to the symmetry operation number Nop and places
    //  them into unit cell shifted by cellshift_a a's, cellshift_b
    //  b's and cellshift_c c's.
    //
    //  Return 0 means everything's fine,
    //         1 there's no symmetry operation Nop defined
    //         2 fractionalizing/orthogonalizing matrices were not
    //           calculated
    //         3 cell parameters were not set up.
    int GetTMatrix ( mat44 & TMatrix, int Nop,
                     int cellshift_a, int cellshift_b,
                     int cellshift_c );

    //  GetUCTMatrix(..) calculates and returns the coordinate
    //  transformation matrix, which converts orthogonal coordinates
    //  according to the symmetry operation number Nop. Translation
    //  part of the matrix is being chosen such that point (x,y,z)
    //  has least distance to the center of primary (333) unit cell,
    //  and then it is shifted by cellshift_a a's, cellshift_b b's and
    //  cellshift_c c's.
    //
    //  Return 0 means everything's fine,
    //         1 there's no symmetry operation Nop defined
    //         2 fractionalizing/orthogonalizing matrices were not
    //           calculated
    //         3 cell parameters were not set up.
    int GetUCTMatrix ( mat44 & TMatrix, int Nop,
                       realtype x, realtype y, realtype z,
                       int cellshift_a, int cellshift_b,
                       int cellshift_c );

    //  GetFractMatrix(..) calculates and returns the coordinate
    //  transformation matrix, which converts fractional coordinates
    //  according to the symmetry operation number Nop and places them
    //  into unit cell shifted by cellshift_a a's, cellshift_b b's
    //  and cellshift_c c's.
    //
    //  Return 0 means everything's fine,
    //         1 there's no symmetry operation Nop defined
    //         2 fractionalizing/orthogonalizing matrices were not
    //           calculated
    //         3 cell parameters were not set up.
    int GetFractMatrix ( mat44 & TMatrix, int Nop,
                         int cellshift_a, int cellshift_b,
                         int cellshift_c );


    //  GetSymOpMatrix(..) returns the transformation matrix for
    //  Nop-th symmetry operator in the space group
    //
    //  Return 0 means everything's fine,
    //         1 there's no symmetry operation Nop defined
    //         2 fractionalizing/orthogonalizing matrices were not
    //           calculated
    //         3 cell parameters were not set up.
    //
    int GetSymOpMatrix ( mat44 & TMatrix, int Nop );


    int   AddNCSMatrix    ( mat33 & ncs_m, vect3 & ncs_v, int iGiven );
    int   GenerateNCSMates(); // 1: no NCS matrices, 0: Ok

    pstr  GetEntryID ();
    void  SetEntryID ( const IDCode idCode );

    int   GetNofExpDataRecs();
    pstr  GetExpDataRec ( int recNo );  // 0.. on

    int   GetFileType() { return FType; }

    void  Copy ( PCMMDBFile MMDBFile );

    void  SetShortBinary();  // leaves only coordinates in binary files

    // -------  user-defined data handlers
    int   PutUDData ( int UDDhandle, int      iudd );
    int   PutUDData ( int UDDhandle, realtype rudd );
    int   PutUDData ( int UDDhandle, cpstr    sudd );

    int   GetUDData ( int UDDhandle, int      & iudd );
    int   GetUDData ( int UDDhandle, realtype & rudd );
    int   GetUDData ( int UDDhandle, pstr sudd, int maxLen );
    int   GetUDData ( int UDDhandle, pstr     & sudd );

    // GetStructureTitle() returns the contents of TITLE record
    // unfolded into single line. If Title is missing, returns
    // contents of COMPND(:MOLECULE). If COMPND is missing, returns
    // HEADER. If Header is missing, returns PDB code. If no PDB
    // code is there, returns "Not available".
    pstr  GetStructureTitle ( pstr & L );

  protected :

    word       Flags;    // special effect flags
    int        FType;    // type of last file operation:
                         //    -1 : none
                         //     0 : PDB
                         //     1 : CIF
                         //     2 : BIN
                         // encoded as MMDB_FILE_XXXXX above

    CMMDBTitle  Title;   // title section
    CMMDBCryst  Cryst;   // crystallographic information section
    CUDRegister UDRegister; // register of user-defined data

    int        nModels;  // number of models
    PPCModel   Model;    // array of models [0..nModels-1]

    int        nAtoms;   // number of atoms
    int        AtmLen;   // length of Atom array
    PPCAtom    Atom;     // array of atoms ordered by serial numbers

    CAtomPath  DefPath;  // default coordinate path

    CClassContainer SA;  // string container for unrecognized strings
                         // which are between the title and the
                         // crystallographic sections
    CClassContainer Footnote;  // string container for footnotes
    CClassContainer SB;  // string container for unrecognized strings
                         // which are between the crystallographic and
                         // the coordinate sections
    CClassContainer SC;  // string container for unrecognized strings
                         // following the coordinate section

    //  input buffer
    int         lcount;  // input line counter
    char        S[500];  // read buffer
    PCMMCIFData CIF;     // CIF file manager

    PCModel     crModel; // current model, used at reading a PDB file
    PCChain     crChain; // current chain, used at reading a PDB file
    PCResidue   crRes;   // current residue, used at reading a PDB file

    Boolean     Exclude; // used internally
    Boolean     ignoreRemarks;  // used temporarily
    Boolean     allowDuplChID;  // used temporarily

    void  InitMMDBFile    ();
    void  FreeCoordMemory ();
    void  ReadPDBLine     ( RCFile f, pstr L, int maxlen );
    int   ReadPDBAtom     ( cpstr L );
    int   ReadCIFAtom     ( PCMMCIFData CIFD   );
    int   CheckAtomPlace  ( int  index, cpstr L );
    int   CheckAtomPlace  ( int  index, PCMMCIFLoop Loop );
    int   SwitchModel     ( cpstr L );
    int   SwitchModel     ( int nM );
    int   AllocateAtom    ( int           index,
                            const ChainID chainID,
                            const ResName resName,
                            int           seqNum,
                            const InsCode insCode,
                            Boolean       Replace );
    void  ExpandAtomArray ( int inc );
    void  AddAtomArray    ( int inc );

    void  ApplyNCSTransform ( int NCSMatrixNo );

    virtual void ResetManager();

    //  ---------------  Stream I/O  -----------------------------
    void  write ( RCFile f );
    void  read  ( RCFile f );

    // don't use _ExcludeModel in your applications!
    int   _ExcludeModel ( int serNum );

    int   CheckInAtom   ( int index, PCAtom A );
    int   CheckInAtoms  ( int index, PPCAtom A, int natms );

    virtual PCMask GetSelMask ( int selHnd );

  private :
    int modelCnt;  // used only at reading files

};



//  isMMDBBIN will return
//    -1   if file FName does not exist
//     0   if file FName is likely a MMDB BIN (binary) file
//     1   if file FName is not a MMDB BIN (binary) file
//     2   if file FName is likely a MMDB BIN (binary) file,
//         but of a wrong edition (i.e. produced by a lower
//         version of MMDB).
extern int isMMDBBIN ( cpstr FName, byte gzipMode=GZM_CHECK );

//  isPDB will return
//    -1   if file FName does not exist
//     0   if file FName is likely a PDB file
//     1   if file FName is not a PDB file
extern int isPDB ( cpstr FName, byte gzipMode=GZM_CHECK,
                   Boolean IgnoreBlankLines=False );

#endif

