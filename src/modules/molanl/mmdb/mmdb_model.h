//  $Id: mmdb_model.h,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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
//  **** Module  :  MMDB_Model <interface>
//       ~~~~~~~~~
//  **** Project :  MacroMolecular Data Base (MMDB)
//       ~~~~~~~~~
//  **** Classes :  CHetCompound  ( description of het compounds    )
//       ~~~~~~~~~  CHetCompounds ( HETNAM, HETSYN, FORMULA records )
//                  CSSContainer  ( container for helixes and turns )
//                  CHelix        ( helix info                      )
//                  CStrand       ( strand info                     )
//                  CSheet        ( sheet info                      )
//                  CSheets       ( container for sheets            )
//                  CTurn         ( turn info                       )
//                  CLinkContainer   ( container for link data      )
//                  CLink            ( link data                    )
//                  CCisPepContainer ( container for CisPep data    )
//                  CCisPep          ( CisPep data                  )
//                  CModel        ( PDB model                       )
//
//  Copyright (C) E. Krissinel 2000-2008
//
//  =================================================================
//

#ifndef __MMDB_Model__
#define __MMDB_Model__


#ifndef __Stream__
#include "stream_.h"
#endif

#ifndef  __MMDB_Defs__
#include "mmdb_defs.h"
#endif

#ifndef  __MMDB_Utils__
#include "mmdb_utils.h"
#endif

#ifndef  __MMDB_Chain__
#include "mmdb_chain.h"
#endif



//  ====================  CHetCompound  =======================


DefineClass(CHetCompound)
DefineStreamFunctions(CHetCompound)

class CHetCompound : public CStream  {

  public :

    ResName  hetID;      // Het identifiers, right-justified
    pstr     comment;
    int      nSynonyms;
    psvector hetSynonym; // synonyms
    int      compNum;    // component number
    char     wc;         // '*' for water, otherwise space
    pstr     Formula;    // formulas

    CHetCompound ( cpstr HetName );
    CHetCompound ( RPCStream Object );
    ~CHetCompound();

    void  AddKeyWord     ( cpstr W, Boolean Closed );
    void  HETNAM_PDBDump ( RCFile f );
    void  HETSYN_PDBDump ( RCFile f );
    void  FORMUL_PDBDump ( RCFile f );

    void  FormComString  ( pstr & F );
    void  FormSynString  ( pstr & F );
    void  FormForString  ( pstr & F );

    void  Copy  ( PCHetCompound HetCompound );

    void  write ( RCFile f );
    void  read  ( RCFile f );

  protected :

    void  InitHetCompound ( cpstr HetName );
    void  FreeMemory      ();

};


//  ====================  CSSContainer  ======================

DefineClass(CSSContainer)
DefineStreamFunctions(CSSContainer)

class CSSContainer : public CClassContainer  {

  public :

    CSSContainer  () : CClassContainer() {}
    CSSContainer  ( RPCStream Object )
                     : CClassContainer ( Object ) {} 
    ~CSSContainer () {}

    PCContainerClass MakeContainerClass ( int ClassID );

};


//  ====================  CHelix  ============================

DefineClass(CHelix)
DefineStreamFunctions(CHelix)

class CHelix : public CContainerClass  {

  public :
    int     serNum;      // serial number
    HelixID helixID;     // helix ID
    ResName initResName; // name of the helix's initial residue
    ChainID initChainID; // chain ID for the chain containing the helix
    int     initSeqNum;  // sequence number of the initial residue
    InsCode initICode;   // insertion code of the initial residue
    ResName endResName;  // name of the helix's terminal residue
    ChainID endChainID;  // chain ID for the chain containing the helix
    int     endSeqNum;   // sequence number of the terminal residue
    InsCode endICode;    // insertion code of the terminal residue
    int     helixClass;  // helix class
    pstr    comment;     // comment about the helix
    int     length;      // length of the helix

    CHelix ();
    CHelix ( cpstr S );
    CHelix ( RPCStream Object );
    ~CHelix();

    void  PDBASCIIDump    ( pstr S, int N   );
    void  MakeCIF         ( PCMMCIFData CIF, int N );
    int   ConvertPDBASCII ( cpstr S );
    void  GetCIF          ( PCMMCIFData CIF, int & Signal );
    int   GetClassID      () { return ClassID_Helix; }

    void  Copy  ( PCContainerClass Helix );

    void  write ( RCFile f );
    void  read  ( RCFile f );

  protected :
    
    void InitHelix();

};



//  ====================  CStrand  ============================

DefineClass(CStrand)
DefineStreamFunctions(CStrand)

class CStrand : public CStream  {

  public :

    StrandID sheetID;     // sheet ID
    int      strandNo;    // strand number
    ResName  initResName; // name of the strand's initial residue
    ChainID  initChainID; // chain ID of initial residue in the strand
    int      initSeqNum;  // sequence number of the initial residue
    InsCode  initICode;   // insertion code of the initial residue
    ResName  endResName;  // name of the strand's terminal residue
    ChainID  endChainID;  // chain ID of terminal residue in the strand
    int      endSeqNum;   // sequence number of the terminal residue
    InsCode  endICode;    // insertion code of the terminal residue
    int      sense;       // sense of strand with respect to previous
                          //    strand
    AtomName curAtom;     // registration; atom name in current strand
    ResName  curResName;  // registration; residue name in current
                          //    strand
    ChainID  curChainID;  // registration; chain ID in current strand
    int      curResSeq;   // registration; res-e seq numb in current
                          //    strand
    InsCode  curICode;    // registration; ins code in current strand
    AtomName prevAtom;    // registration; atom name in previous strand
    ResName  prevResName; // registration; residue name in previous
                          //    strand
    ChainID  prevChainID; // registration; chain ID in previous strand
    int      prevResSeq;  // registration; res-e seq numb in previous
                          //    strand
    InsCode  prevICode;   // registration; ins code in previous strand

    CStrand ();
    CStrand ( RPCStream Object );
    ~CStrand();

    void  PDBASCIIDump    ( pstr S          );
    void  MakeCIF         ( PCMMCIFData CIF );
    int   ConvertPDBASCII ( cpstr S    );
    int   GetCIF          ( PCMMCIFData CIF, cpstr sheet_id );

    void  Copy  ( PCStrand Strand );

    void  write ( RCFile f );
    void  read  ( RCFile f );

  protected :
    
    void InitStrand();

};


//  ====================  CSheet  ============================

DefineClass(CSheet)
DefineStreamFunctions(CSheet)

class CSheet : public CStream  {

  public :
    SheetID   sheetID;   // sheet ID
    int       nStrands;  // number of strands in the sheet
    PPCStrand Strand;    // array of strands

    CSheet ();
    CSheet ( RPCStream Object );
    ~CSheet();

    void  FreeMemory();
    void  OrderSheet();

    void  PDBASCIIDump    ( RCFile f        );
    void  MakeCIF         ( PCMMCIFData CIF );
    int   ConvertPDBASCII ( cpstr  S   );
    int   GetCIF          ( PCMMCIFData CIF );

    void  Copy  ( PCSheet Sheet );

    void  write ( RCFile f );
    void  read  ( RCFile f );

  protected :
    void  InitSheet      ();
    void  CIFFindStrands ( PCMMCIFData CIF, cpstr Category );
    void  TryStrand      ( int strand_no );
    int   GetStrand      ( int strand_no );

};


//  ====================  CSheets  ============================

DefineClass(CSheets)
DefineStreamFunctions(CSheets)

class CSheets : public CStream  {

  public :
    int      nSheets;
    PPCSheet Sheet;

    CSheets ();
    CSheets ( RPCStream Object );
    ~CSheets();

    void  FreeMemory();

    void  PDBASCIIDump    ( RCFile f );
    void  MakeCIF         ( PCMMCIFData CIF );
    int   ConvertPDBASCII ( cpstr  S   );
    int   GetCIF          ( PCMMCIFData CIF );

    void  Copy  ( PCSheets Sheets );

    void  write ( RCFile f );
    void  read  ( RCFile f );

  protected :
    void  InitSheets    ();
    void  CIFFindSheets ( PCMMCIFData CIF, cpstr Category );

};


//  ====================  CTurn  ============================

DefineClass(CTurn)
DefineStreamFunctions(CTurn)

class CTurn : public CContainerClass  {

  public :
    int     serNum;      // serial number
    TurnID  turnID;      // turn ID
    ResName initResName; // name of the turn's initial residue
    ChainID initChainID; // chain ID for the chain containing the turn
    int     initSeqNum;  // sequence number of the initial residue
    InsCode initICode;   // insertion code of the initial residue
    ResName endResName;  // name of the turn's terminal residue
    ChainID endChainID;  // chain ID for the chain containing the turn
    int     endSeqNum;   // sequence number of the terminal residue
    InsCode endICode;    // insertion code of the terminal residue
    pstr    comment;     // comment about the helix

    CTurn ();
    CTurn ( cpstr S );
    CTurn ( RPCStream Object );
    ~CTurn();

    void  PDBASCIIDump    ( pstr S, int N   );
    void  MakeCIF         ( PCMMCIFData CIF, int N );
    int   ConvertPDBASCII ( cpstr S );
    void  GetCIF          ( PCMMCIFData CIF, int & Signal );
    int   GetClassID      () { return ClassID_Turn; }

    void  Copy  ( PCContainerClass Turn );

    void  write ( RCFile f );
    void  read  ( RCFile f );

  protected :
    
    void InitTurn();

};



//  ====================  CHetCompounds  =======================

DefineClass(CHetCompounds)
DefineStreamFunctions(CHetCompounds)

class CHetCompounds : public CStream  {

  public :

    int            nHets;
    PPCHetCompound hetCompound;

    CHetCompounds ();
    CHetCompounds ( RPCStream Object );
    ~CHetCompounds();

    void  FreeMemory    ();

    void  PDBASCIIDump  ( RCFile f );
    void  ConvertHETNAM ( cpstr S );
    void  ConvertHETSYN ( cpstr S );
    void  ConvertFORMUL ( cpstr S );

    void  MakeCIF       ( PCMMCIFData CIF );
    void  GetCIF        ( PCMMCIFData CIF );

    void  Copy  ( PCHetCompounds HetCompounds );

    void  write ( RCFile f );
    void  read  ( RCFile f );

  protected :
    Boolean Closed;

    void  InitHetCompounds();
    int   AddHetName      ( cpstr H );

};


//  ===================  CLinkContainer  =====================

DefineClass(CLinkContainer)
DefineStreamFunctions(CLinkContainer)

class CLinkContainer : public CClassContainer  {

  public :

    CLinkContainer  () : CClassContainer() {}
    CLinkContainer  ( RPCStream Object )
                     : CClassContainer ( Object ) {} 
    ~CLinkContainer () {}

    PCContainerClass MakeContainerClass ( int ClassID );

};


//  ====================  CLink  ============================

DefineClass(CLink)
DefineStreamFunctions(CLink)

class CLink : public CContainerClass  {

  public :
    AtomName atName1;   // name of 1st linked atom
    AltLoc   aloc1;     // alternative location of 1st linked atom
    ResName  resName1;  // residue name of 1st linked atom
    ChainID  chainID1;  // chain ID of 1st linked atom
    int      seqNum1;   // sequence number of 1st linked atom
    InsCode  insCode1;  // insertion code of 1st linked atom
    AtomName atName2;   // name of 2nd linked atom
    AltLoc   aloc2;     // alternative location of 2nd linked atom
    ResName  resName2;  // residue name of 2nd linked atom
    ChainID  chainID2;  // chain ID of 2nd linked atom
    int      seqNum2;   // sequence number of 2nd linked atom
    InsCode  insCode2;  // insertion code of 2nd linked atom
    int      s1,i1,j1,k1;  // sym id of 1st atom
    int      s2,i2,j2,k2;  // sym id of 2nd atom
    
    CLink ();
    CLink ( cpstr S );
    CLink ( RPCStream Object );
    ~CLink();

    void  PDBASCIIDump    ( pstr S, int N   );
    void  MakeCIF         ( PCMMCIFData CIF, int N );
    int   ConvertPDBASCII ( cpstr S );
    void  GetCIF          ( PCMMCIFData CIF, int & Signal );
    int   GetClassID      () { return ClassID_Link; }

    void  Copy  ( PCContainerClass Link );

    void  write ( RCFile f );
    void  read  ( RCFile f );

  protected :
    
    void InitLink();

};



//  ===================  CCisPepContainer  =====================

DefineClass(CCisPepContainer)
DefineStreamFunctions(CCisPepContainer)

class CCisPepContainer : public CClassContainer  {

  public :

    CCisPepContainer  () : CClassContainer() {}
    CCisPepContainer  ( RPCStream Object )
                     : CClassContainer ( Object ) {} 
    ~CCisPepContainer () {}

    PCContainerClass MakeContainerClass ( int ClassID );

};


//  =====================  CCisPep  ===========================

DefineClass(CCisPep)
DefineStreamFunctions(CCisPep)

class CCisPep : public CContainerClass  {

  public :
    int      serNum;   //  record serial number
    ResName  pep1;     //  residue name
    ChainID  chainID1; //  chain identifier 1
    int      seqNum1;  //  residue sequence number 1
    InsCode  icode1;   //  insertion code 1
    ResName  pep2;     //  residue name 2
    ChainID  chainID2; //  chain identifier 2
    int      seqNum2;  //  residue sequence number 2
    InsCode  icode2;   //  insertion code 2
    int      modNum;   //  model number
    realtype measure;  //  measure of the angle in degrees.

    CCisPep ();
    CCisPep ( cpstr S );
    CCisPep ( RPCStream Object );
    ~CCisPep();

    void  PDBASCIIDump    ( pstr S, int N );
    int   ConvertPDBASCII ( cpstr S );

//    void  MakeCIF         ( PCMMCIFData CIF, int N );
//    void  GetCIF          ( PCMMCIFData CIF, int & Signal );

    int   GetClassID      () { return ClassID_CisPep; }

    void  Copy  ( PCContainerClass CisPep );

    void  write ( RCFile f );
    void  read  ( RCFile f );

  protected :

    void InitCisPep();

};



//  ====================  CModel  ===============================

#define  SSERC_Ok            0
#define  SSERC_noResidues    1
#define  SSERC_noAminoacids  2
#define  SSERC_noSSE         3

DefineFactoryFunctions(CModel)

class CModel : public CProModel  {

  friend class CMMDBManager;
  friend class CMMDBBondManager;
  friend class CMMDBSelManager;
  friend class CMMDBCoorManager;
  friend class CMMDBFile;
  friend class CChain;
  friend class CResidue;
  friend class CAtom;

  public :

    CModel ();  // SetMMDBFile() MUST be used after this constructor!
    CModel ( PCMMDBManager MMDBF, int serialNum );
    CModel ( RPCStream Object );
    ~CModel();

    void   SetMMDBManager   ( PCMMDBManager MMDBM, int serialNum );
    void * GetCoordHierarchy() { return manager; }    
    
    //   GetChainCreate() returns pointer on chain, whose identifier
    // is given in chID. If such a chain is absent in the model,
    // it is created.
    PCChain GetChainCreate ( const ChainID chID );

    //   CreateChain() creates a new chain with chain ID regardless
    // the presence of same-ID chains in the model. This function
    // was introduced only for compatibility with older CCP4
    // applications and using it in any new developments should be
    // strictly discouraged.
    PCChain CreateChain    ( const ChainID chID );

    pstr   GetEntryID ();
    void   SetEntryID ( const IDCode idCode );

    int    GetSerNum  (); // returns the model's serial number

    pstr   GetModelID ( pstr modelID );  // returns "/mdl"

    int    GetNumberOfModels  (); // returns TOTAL number of models
    int    GetNumberOfAtoms   ( Boolean countTers ); // returns number
                                              // of atoms in the model
    int    GetNumberOfResidues(); // returns number of residues in
                                  // the model


    //  ----------------  Extracting chains  --------------------------

    int  GetNumberOfChains();  // returns number of chains in the model
    Boolean GetNewChainID ( ChainID chID, int length=1 );
    //   GetChain() returns pointer on chain, whose identifier
    // is given in chID. If such a chain is absent in the model,
    // returns NULL.
    PCChain GetChain ( const ChainID chID );
    PCChain GetChain ( int chainNo ); // returns chainNo-th chain
                                      // in the model;
                                      // 0<=chainNo<nChains
    void GetChainTable ( PPCChain & chainTable,
                         int & NumberOfChains );

    //  ------------------  Deleting chains  --------------------------

    int  DeleteChain        ( const ChainID chID );
    int  DeleteChain        ( int chainNo );
    int  DeleteAllChains    ();
    int  DeleteSolventChains();
    void TrimChainTable     ();
    
    //  -------------------  Adding chains  ---------------------------

    int  AddChain ( PCChain chain );

    //  ----------------  Extracting residues  ------------------------

    int GetNumberOfResidues ( const ChainID chainID );
    int GetNumberOfResidues ( int   chainNo );
    PCResidue GetResidue ( const ChainID chainID, int seqNo,
                           const InsCode insCode );
    PCResidue GetResidue ( const ChainID chainID, int resNo );
    PCResidue GetResidue ( int   chainNo, int seqNo,
                           const InsCode insCode );
    PCResidue GetResidue ( int   chainNo, int resNo );
    int     GetResidueNo ( const ChainID chainID, int seqNo,
                           const InsCode insCode );
    int     GetResidueNo ( int   chainNo, int seqNo,
                           const InsCode insCode );
    void GetResidueTable ( PPCResidue & resTable,
                           int & NumberOfResidues );
    void GetResidueTable ( const ChainID chainID,
                           PPCResidue & resTable,
                           int & NumberOfResidues );
    void GetResidueTable ( int   chainNo, PPCResidue & resTable,
                           int & NumberOfResidues );

    //  -----------------  Deleting residues  -------------------------

    int DeleteResidue ( const ChainID chainID, int seqNo,
                        const InsCode insCode );
    int DeleteResidue ( const ChainID chainID, int resNo );
    int DeleteResidue ( int   chainNo, int seqNo,
                        const InsCode insCode );
    int DeleteResidue ( int   chainNo, int resNo );
    int DeleteAllResidues ( const ChainID chainID );
    int DeleteAllResidues ( int   chainNo );
    int DeleteSolvent     (); // in difference of DeleteSolventChains,
                              // this will remove all solvent molecules
                              // from the file rather then
                              // solely-solvent chains
    int DeleteAllResidues ();

    //  ------------------  Adding residues  --------------------------

    int AddResidue ( const ChainID chainID, PCResidue res );
    int AddResidue ( int   chainNo, PCResidue res );

    //  -------------------  Extracting atoms  ------------------------

    int GetNumberOfAllAtoms(); // returns TOTAL number of atoms in all
                               //    models
    PPCAtom    GetAllAtoms (); // returns pointer to Atom array

    int   GetNumberOfAtoms ( const ChainID chainID, int seqNo,
                             const InsCode insCode );
    int   GetNumberOfAtoms ( int   chainNo, int seqNo,
                             const InsCode insCode );
    int   GetNumberOfAtoms ( const ChainID chainID, int resNo );
    int   GetNumberOfAtoms ( int   chainNo, int resNo );

    PCAtom GetAtom ( const ChainID  chID,
                     int            seqNo,
                     const InsCode  insCode,
                     const AtomName aname,
                     const Element  elmnt,
                     const AltLoc   aloc );
    PCAtom GetAtom ( const ChainID chID,    int seqNo,
                     const InsCode insCode, int atomNo );
    PCAtom GetAtom ( const ChainID  chID,
                     int            resNo,
                     const AtomName aname,
                     const Element  elmnt,
                     const AltLoc   aloc );
    PCAtom GetAtom ( const ChainID  chID,  int resNo, int atomNo );
    PCAtom GetAtom ( int chNo,  int seqNo,
                     const InsCode  insCode,
                     const AtomName aname,
                     const Element  elmnt,
                     const AltLoc   aloc );
    PCAtom GetAtom ( int chNo,  int seqNo, const InsCode insCode,
                     int atomNo );
    PCAtom GetAtom ( int chNo,  int resNo,
                     const AtomName aname,
                     const Element  elmnt,
                     const AltLoc aloc );
    PCAtom GetAtom ( int chNo,  int resNo, int atomNo );

    void GetAtomTable ( const ChainID chainID, int seqNo,
                        const InsCode insCode,
                        PPCAtom & atomTable, int & NumberOfAtoms );
    void GetAtomTable ( int   chainNo,       int seqNo,
                        const InsCode insCode,
                        PPCAtom & atomTable, int & NumberOfAtoms );
    void GetAtomTable ( const ChainID chainID, int resNo,
                        PPCAtom & atomTable, int & NumberOfAtoms );
    void GetAtomTable ( int     chainNo,     int resNo,
                        PPCAtom & atomTable, int & NumberOfAtoms );

    //   GetAtomTable1(..) returns atom table without TER atoms and
    // without NULL atom pointers. NumberOfAtoms returns the actual
    // number of atom pointers in atomTable.
    //   atomTable is allocated withing the function. If it was
    // not set to NULL before calling the function, the latter will
    // attempt to deallocate it first.
    //   The application is responsible for deleting atomTable,
    // however it must not touch atom pointers, i.e. use simply
    // "delete atomTable;". Never pass atomTable from GetAtomTable(..)
    // into this function, unless you set it to NULL before doing that.
    void GetAtomTable1 ( const ChainID chainID, int seqNo,
                         const InsCode insCode,
                         PPCAtom & atomTable, int & NumberOfAtoms );
    void GetAtomTable1 ( int   chainNo, int seqNo,
                         const InsCode insCode,
                         PPCAtom & atomTable, int & NumberOfAtoms );
    void GetAtomTable1 ( const ChainID chainID, int resNo,
                         PPCAtom & atomTable, int & NumberOfAtoms );
    void GetAtomTable1 ( int     chainNo,     int resNo,
                         PPCAtom & atomTable, int & NumberOfAtoms );

    void  GetAtomStatistics  ( RSAtomStat AS );
    void  CalcAtomStatistics ( RSAtomStat AS );


    //  --------------------  Deleting atoms  -------------------------

    int DeleteAtom ( const ChainID  chID,
                     int            seqNo,
                     const InsCode  insCode,
                     const AtomName aname,
                     const Element  elmnt,
                     const AltLoc   aloc );
    int DeleteAtom ( const ChainID chID,    int seqNo,
                     const InsCode insCode, int atomNo );
    int DeleteAtom ( const ChainID  chID,
                     int            resNo,
                     const AtomName aname,
                     const Element  elmnt,
                     const AltLoc   aloc );
    int DeleteAtom ( const ChainID  chID,  int resNo, int atomNo );
    int DeleteAtom ( int chNo,  int seqNo,
                     const InsCode  insCode,
                     const AtomName aname,
                     const Element  elmnt,
                     const AltLoc   aloc );
    int DeleteAtom ( int chNo,  int seqNo, const InsCode insCode,
                     int atomNo );
    int DeleteAtom ( int chNo,  int resNo,
                     const AtomName aname,
                     const Element  elmnt,
                     const AltLoc   aloc );
    int DeleteAtom ( int chNo,  int resNo, int atomNo );

    int DeleteAllAtoms ( const ChainID chID, int seqNo,
                         const InsCode insCode );
    int DeleteAllAtoms ( const ChainID chID, int resNo );
    int DeleteAllAtoms ( const ChainID chID );
    int DeleteAllAtoms ( int chNo, int seqNo, const InsCode insCode );
    int DeleteAllAtoms ( int chNo, int resNo );
    int DeleteAllAtoms ( int chNo );
    int DeleteAllAtoms ();

    //  DeleteAltLocs() leaves only alternative location with maximal
    // occupancy, if those are equal or unspecified, the one with
    // "least" alternative location indicator.
    //  The function returns the number of deleted. All tables remain
    // untrimmed, so that explicit trimming or calling
    // FinishStructEdit() is required.
    int DeleteAltLocs();


    //  ---------------------  Adding atoms  --------------------------

    int AddAtom ( const ChainID chID, int seqNo,
                  const InsCode insCode, PCAtom atom );
    int AddAtom ( const ChainID chID, int resNo, PCAtom  atom );
    int AddAtom ( int   chNo, int seqNo, const InsCode insCode,
                  PCAtom atom );
    int AddAtom ( int   chNo, int resNo, PCAtom  atom );


    //  ---------------------------------------------------------------

    //   ConvertPDBString(..) interprets PDB records DBREF, SEQADV,
    // SEQRES, MODRES.
    //   Returns zero if the line was converted, otherwise returns a
    // non-negative value of Error_XXXX.
    //   PDBString must be not shorter than 81 characters.
    int   ConvertPDBString ( pstr PDBString );

    // PDBASCIIDumpPS(..) makes output of PDB primary structure records
    // excluding cispeps
    void  PDBASCIIDumpPS   ( RCFile f );

    // PDBASCIIDumpCP(..) makes output of cispep records
    void  PDBASCIIDumpCP   ( RCFile f );

    // PDBASCIIDump(..) makes output of PDB coordinate (ATOM etc.)
    // records
    void  PDBASCIIDump     ( RCFile f );

    void  MakeAtomCIF      ( PCMMCIFData CIF );
    void  MakePSCIF        ( PCMMCIFData CIF );
    int   GetCIF           ( PCMMCIFData CIF );

    //   MoveChain(..) adds chain m_chain on the top Chain array.
    // The pointer on chain is then set to NULL (m_chain=NULL).
    // If chain_ext is greater than 0, the moved chain will be
    // forcefully renamed; the new name is composed as the previous
    // one + underscore + chain_ext (e.g. A_1). If thus generated
    // name duplicates any of existing chain IDs, or if chain_ext
    // was set to 0 and there is a duplication of chain IDs, the
    // name is again modified as above, with the extension number
    // generated automatically (this may result in IDs like
    // A_1_10).
    //   m_atom must give pointer to the Atom array, from which
    // the atoms belonging to m_chain, are moved to Atom array
    // given by 'atom', starting from poisition 'atom_index'.
    // 'atom_index' is then automatically updated to the next
    // free position in 'atom'.
    //   Note1: the moved atoms will occupy a continuous range
    // in 'atom' array; no checks on whether the corresponding
    // cells are occupied or not, are performed.
    //   Note2: the 'atom_index' is numbered from 0 on, i.e.
    // it is equal to atom[atom_index]->index-1; atom[]->index
    // is assigned automatically.
    void  MoveChain ( PCChain & m_chain, PPCAtom m_atom,
                      PPCAtom  atom, int & atom_index,
                      int  chain_ext );

    void  GetAIndexRange ( int & i1, int & i2 );

    void  MaskAtoms      ( PCMask Mask );
    void  MaskResidues   ( PCMask Mask );
    void  MaskChains     ( PCMask Mask );
    void  UnmaskAtoms    ( PCMask Mask );
    void  UnmaskResidues ( PCMask Mask );
    void  UnmaskChains   ( PCMask Mask );


    //  ----  Getting Secondary Structure Elements

    int  GetNumberOfHelices ();
    int  GetNumberOfSheets  ();

    PCHelix   GetHelix      ( int serialNum ); // 1<=serNum<=NofHelices

    void      GetSheetID    ( int serialNum, SheetID sheetID );
                                                 // '\0' for none

    PCSheet   GetSheet      ( int   serialNum ); //1<=serNum<=NofSheets
    PCSheet   GetSheet      ( const SheetID sheetID ); // NULL for none
    int  GetNumberOfStrands ( int   sheetSerNum );
    int  GetNumberOfStrands ( const SheetID sheetID );
    PCStrand  GetStrand     ( int   sheetSerNum,
                              int strandSerNum );
    PCStrand  GetStrand     ( const SheetID sheetID,
                              int strandSerNum );

    PCSSContainer   GetHelices() { return &Helices;  }
    PCSheets        GetSheets () { return &Sheets;   }

    void  RemoveSecStructure();
    int   CalcSecStructure  ( Boolean flagBulge=True,
                              int aminoSelHnd=-1 );
//    int   CalcSecStructure  ( Boolean flagBulge=True );

    void  RemoveHetInfo     ();


    //  ----  Working Links

    int    GetNumberOfLinks ();
    PCLink          GetLink ( int serialNum ); // 1<=serNum<=NofLinks
    PCLinkContainer GetLinks() { return &Links; }

    void   RemoveLinks();
    void   AddLink    ( PCLink Link );


    //  ----  Working CisPeps

    int       GetNumberOfCisPeps();
    PCCisPep          GetCisPep ( int CisPepNum );
    PCCisPepContainer GetCisPeps() { return &CisPeps; }

    void  RemoveCisPeps();
    void  AddCisPep    ( PCCisPep CisPep );



    void  ApplyTransform    ( mat44 & TMatrix );  // transforms all
                                      // coordinates by multiplying
                                      // with matrix TMatrix

    Boolean isInSelection ( int selHnd );


    // -------  user-defined data handlers
    int   PutUDData ( int UDDhandle, int      iudd );
    int   PutUDData ( int UDDhandle, realtype rudd );
    int   PutUDData ( int UDDhandle, cpstr    sudd );

    int   GetUDData ( int UDDhandle, int      & iudd );
    int   GetUDData ( int UDDhandle, realtype & rudd );
    int   GetUDData ( int UDDhandle, pstr sudd, int maxLen );
    int   GetUDData ( int UDDhandle, pstr     & sudd );


    void  Copy ( PCModel Model );

    void  write ( RCFile f );
    void  read  ( RCFile f );

  protected :

    int              serNum;       // the model serial number
    PCMMDBManager    manager;      // pointer to mmdbmanager class

    CHetCompounds    HetCompounds; // information on heterocompounds
    CSSContainer     Helices;      // information on helices
    CSheets          Sheets;       // information on sheets
    CSSContainer     Turns;        // information on turns
    CLinkContainer   Links;        // information on links
    CCisPepContainer CisPeps;      // information on cispeps

    int              nChains;      // number of chains
    int              nChainsAlloc; // actual length of Chain[]
    PPCChain         Chain;        // array of chains

    Boolean          Exclude;      // used internally

    void  InitModel        ();
    void  FreeMemory       ();
    void  ExpandChainArray ( int nOfChains );
    int   GetCIFPSClass    ( PCMMCIFData CIF, int ClassID );

    //   _ExcludeChain(..) excludes (but does not dispose!) a chain
    // from the model. Returns 1 if the chain gets empty and 0
    // otherwise.
    int   _ExcludeChain ( const ChainID chainID );

    //  _copy(PCModel) does not copy atoms! -- not for use in
    // applications
    void  _copy ( PCModel Model );

    //  _copy(PCModel,PPCAtom,int&) does copy atoms into array 'atom'
    // starting from position atom_index. 'atom' should be able to
    // accept all new atoms - no checks on the length of 'atom'
    // is being made. This function should not be used in applications.
    void  _copy ( PCModel Model, PPCAtom  atom, int & atom_index );

    void  CheckInAtoms  ();

};


#endif

