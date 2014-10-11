//  $Id: mmdb_chain.h,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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
//    18.02.04   <--  Date of Last Modification.
//                   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//  -----------------------------------------------------------------
//
//  **** Module  :  MMDB_Chain <interface>
//       ~~~~~~~~~
//  **** Project :  MacroMolecular Data Base (MMDB)
//       ~~~~~~~~~
//  **** Classes :  CProModel       ( a virtue of CModel              )
//       ~~~~~~~~~  CChainContainer ( container of in-chain classes   )
//                  CContainerChain ( chain containered class template)
//                  CDBReference    ( DBREF  records                  )
//                  CSeqAdv         ( SEQADV records                  )
//                  CSeqRes         ( SEQRES records                  )
//                  CModRes         ( MODRES records                  )
//                  CHetRec         ( HET    records                  )
//                  CChain          ( chain class                     )
//
//  Copyright (C) E. Krissinel 2000-2008
//
//  =================================================================
//

#ifndef __MMDB_Chain__
#define __MMDB_Chain__


#ifndef __Stream__
#include "stream_.h"
#endif

#ifndef  __MMDB_Defs__
#include "mmdb_defs.h"
#endif

#ifndef  __MMDB_Utils__
#include "mmdb_utils.h"
#endif

#ifndef  __MMDB_Atom__
#include "mmdb_atom.h"
#endif


//  ====================  CProModel  ======================

//    This class is a virtue needed only for defining certain
// functions of CModel, which are used by CChain and
// CResidue

DefineClass(CProModel)
DefineStreamFunctions(CProModel)

class CProModel : public CUDData  {

  friend class CChain;

  public :

    CProModel  () : CUDData () {}
    CProModel  ( RPCStream Object ) : CUDData ( Object ) {} 
    ~CProModel () {}

    virtual pstr  GetEntryID () { return pstr(""); }
    virtual void  SetEntryID ( const IDCode idCode ) {}

    virtual int   AddChain ( PCChain chain ) { return 0; }

    // returns pointer to CMMDBFile
    virtual void * GetCoordHierarchy() { return NULL; }

    //  GetNumberOfModels() returns TOTAL number of models
    virtual int GetNumberOfModels() { return 0;    }

    //  GetNumberOfAllAtoms() returns TOTAL number of atoms in
    // all models
    virtual int GetNumberOfAllAtoms() { return 0;    }

    //  returns pointer to the general Atom array
    virtual PPCAtom     GetAllAtoms() { return NULL; }

    virtual int  GetSerNum       () { return 0; }

    virtual void ExpandAtomArray ( int inc )  {}
    virtual void AddAtomArray    ( int inc )  {}

  protected :

    virtual int  _ExcludeChain ( const ChainID chainID ) { return 0; } 

};



//  ====================  CChainContainer  ======================

DefineClass(CChainContainer)
DefineStreamFunctions(CChainContainer)

class CChainContainer : public CClassContainer  {

  public :

    CChainContainer  () : CClassContainer () {}
    CChainContainer  ( RPCStream Object )
                        : CClassContainer ( Object ) {} 
    ~CChainContainer () {}

    PCContainerClass MakeContainerClass ( int ClassID );

    void  SetChain ( PCChain Chain_Owner ); // must be set before using
                                            // the Container
    
    // special functions used in CModel::GetCIF(..)
    pstr  Get1stChainID ();
    void  MoveByChainID ( ChainID chainID,
                          PCChainContainer ChainContainer );

  protected :
    PCChain Chain;

};


//  ==================  CContainerChain  =====================

DefineClass(CContainerChain)
DefineStreamFunctions(CContainerChain)

class CContainerChain : public CContainerClass {

  friend class CChainContainer;

  public :

    CContainerChain ();
    CContainerChain ( PCChain Chain_Owner );
    CContainerChain ( RPCStream Object    ) : CContainerClass(Object){}

    void SetChain   ( PCChain Chain_Owner );

  protected :
    PCChain Chain;
    ChainID chainID;  // just a copy of Chain->chainID

};


//  ==================  CDBReference  ========================

DefineClass(CDBReference)
DefineStreamFunctions(CDBReference)

class CDBReference : public CContainerChain  {

  public :

    int      seqBeg;      // initial seq num of the PDB seq-ce segment
    InsCode  insBeg;      // initial ins code of the PDB seq-ce segm-t
    int      seqEnd;      // ending seq number of the PDB seq-ce segm-t
    InsCode  insEnd;      // ending ins code of the PDB seq-ce segment
    DBName   database;    // sequence database name
    DBAcCode dbAccession; // sequence database accession code
    DBIdCode dbIdCode;    // sequence database identification code
    int      dbseqBeg;    // initial seq number of the database segment
    InsCode  dbinsBeg;    // ins code of initial residue of the segment
    int      dbseqEnd;    // ending seq number of the database segment
    InsCode  dbinsEnd;   // ins code of the ending residue of the seg-t
    
    CDBReference ();
    CDBReference ( PCChain Chain_Owner );
    CDBReference ( PCChain Chain_Owner, cpstr S );
    CDBReference ( RPCStream Object );
    ~CDBReference();

    void  PDBASCIIDump    ( pstr S, int N );
    void  MakeCIF         ( PCMMCIFData CIF, int N );
    int   ConvertPDBASCII ( cpstr S );
    void  GetCIF          ( PCMMCIFData CIF, int & Signal );
    int   GetClassID      () { return ClassID_DBReference; }

    void  Copy  ( PCContainerClass DBRef );

    void  write ( RCFile f );
    void  read  ( RCFile f );

  protected :
    
    void InitDBReference();

};


//  ====================  CSeqAdv  ===========================

DefineClass(CSeqAdv)
DefineStreamFunctions(CSeqAdv)

class CSeqAdv : public CContainerChain  {

  public :
 
    ResName  resName;     // residue name in conflict
    int      seqNum;      // residue sequence number
    InsCode  insCode;     // residue insertion code
    DBName   database;    // sequence database name
    DBAcCode dbAccession; // sequence database accession code
    ResName  dbRes;       // sequence database residue name
    int      dbSeq;       // sequence database sequence number
    pstr     conflict;    // conflict comment
    
    CSeqAdv ();
    CSeqAdv ( PCChain Chain_Owner );
    CSeqAdv ( PCChain Chain_Owner, cpstr S );
    CSeqAdv ( RPCStream Object );
    ~CSeqAdv();

    void  PDBASCIIDump    ( pstr S, int N );
    int   ConvertPDBASCII ( cpstr S );

    void  MakeCIF         ( PCMMCIFData CIF, int N );
    void  GetCIF          ( PCMMCIFData CIF, int & Signal );

    int   GetClassID      () { return ClassID_SeqAdv; }

    void  Copy  ( PCContainerClass SeqAdv );

    void  write ( RCFile f );
    void  read  ( RCFile f );

  protected :
    
    void InitSeqAdv();

};


//  ==================  CSeqRes  ========================

DefineClass(CSeqRes)
DefineStreamFunctions(CSeqRes)

class CSeqRes : public CStream  {

  friend class CModel;
  friend class CChain;

  public :
 
    int       numRes;   // number of residues in the chain
    PResName  resName;  // residue names
    
    CSeqRes ();
    CSeqRes ( RPCStream Object );
    ~CSeqRes();

    void  SetChain        ( PCChain Chain_Owner );
    void  PDBASCIIDump    ( RCFile f );
    int   ConvertPDBASCII ( cpstr  S );

    void  MakeCIF         ( PCMMCIFData CIF );
    int   GetCIF          ( PCMMCIFData CIF );

    void  Copy  ( PCSeqRes SeqRes );

    void  write ( RCFile f );
    void  read  ( RCFile f );

  protected :
    PCChain Chain;
    ChainID chainID;
    int     serNum;

    void InitSeqRes();
    void FreeMemory();

};


//  ==================  CModRes  ========================

DefineClass(CModRes)
DefineStreamFunctions(CModRes)

class CModRes : public CContainerChain  {

  public :
 
    ResName  resName;     // residue name used
    int      seqNum;      // residue sequence number
    InsCode  insCode;     // residue insertion code
    ResName  stdRes;      // standard residue name
    pstr     comment;     // description of the residue modification
    
    CModRes ();
    CModRes ( PCChain Chain_Owner );
    CModRes ( PCChain Chain_Owner, cpstr S );
    CModRes ( RPCStream Object );
    ~CModRes();

    void  PDBASCIIDump    ( pstr S, int N );
    void  MakeCIF         ( PCMMCIFData CIF, int N );
    int   ConvertPDBASCII ( cpstr S );
    void  GetCIF          ( PCMMCIFData CIF, int & Signal );
    int   GetClassID      () { return ClassID_ModRes; }

    void  Copy  ( PCContainerClass ModRes );

    void  write ( RCFile f );
    void  read  ( RCFile f );

  protected :
    
    void InitModRes();

};


//  ==================  CHetRec  ===========================

DefineClass(CHetRec)
DefineStreamFunctions(CHetRec)

class CHetRec : public CContainerChain  {

  public :
 
    ResName  hetID;       // Het identifier (right-justified)
    int      seqNum;      // sequence number
    InsCode  insCode;     // insertion code
    int      numHetAtoms; // number of HETATM records for the
                          // group present in the entry
    pstr     comment;     // text describing Het group
    
    CHetRec ();
    CHetRec ( PCChain Chain_Owner );
    CHetRec ( PCChain Chain_Owner, cpstr S );
    CHetRec ( RPCStream Object );
    ~CHetRec();

    void  PDBASCIIDump    ( pstr S, int N );
    void  MakeCIF         ( PCMMCIFData CIF, int N );
    int   ConvertPDBASCII ( cpstr S );
    void  GetCIF          ( PCMMCIFData CIF, int & Signal );
    int   GetClassID      () { return ClassID_Het; }

    void  Copy  ( PCContainerClass Het );

    void  write ( RCFile f );
    void  read  ( RCFile f );

  protected :
    
    void InitHetRec();

};


//  =================  CChain  =======================

DefineFactoryFunctions(CChain)

class CChain : public CUDData  {

  friend class CDBReference;
  friend class CSeqAdv;
  friend class CSeqRes;
  friend class CModRes;
  friend class CHetRec;
  friend class CResidue;
  friend class CAtom;
  friend class CModel;
  friend class CMMDBFile;
  friend class CMMDBSelManager;
  friend class CMMDBBondManager;
  friend class CMMDBCoorManager;
  friend class CMMDBManager;

  public :

    CChainContainer DBReference; // database reference
    CChainContainer SeqAdv;      // SEQADV records
    CSeqRes         SeqRes;      // Sequence residues, SEQRES records
    CChainContainer ModRes;      // modification descriptions
    CChainContainer Het;         // non-standard residues descriptions

    CChain ();  // SetModel() MUST be used after this constructor!
    CChain ( PCProModel Model, ChainID chID );
    CChain ( RPCStream Object );
    ~CChain();

    void FreeAnnotations();

    void SetModel ( PCProModel    Model );
    void SetChain ( const ChainID chID  );

    void * GetCoordHierarchy();   // PCMMDBFile

    //   ConvertXXXXX(..) functions do not check for record name
    // and assume that PDBString is at least 81 symbols long
    // (including the terminating null).
    int  ConvertDBREF  ( cpstr PDBString );
    int  ConvertSEQADV ( cpstr PDBString );
    int  ConvertSEQRES ( cpstr PDBString );
    int  ConvertMODRES ( cpstr PDBString );
    int  ConvertHET    ( cpstr PDBString );

    // This function should be used for testing purposes only.
    // A full PDB ASCII dump for all models and chains involved
    // is done by CMMDBFile class. 
    void  PDBASCIIDump     ( RCFile f );

    void  PDBASCIIAtomDump ( RCFile      f   );
    void  MakeAtomCIF      ( PCMMCIFData CIF );


    //  -----------------  Extracting residues  -------------------------

    int GetNumberOfResidues(); // returns number of res-s in the chain
    PCResidue GetResidue   ( int resNo ); // returns resNo-th residue
                                          // in the chain;
                                          // 0<=resNo<nResidues

    //   GetResidue(..) returns pointer on residue, whose sequence
    // number and insert code are given in seqNum and insCode,
    // respectively. If such a residue is absent in the chain,
    // returns NULL.
    PCResidue GetResidue ( int seqNum, const InsCode insCode );

    //   GetResidueNo(..) returns the residue number in the chain's
    // residues table. Residues are numbered as 0..nres-1 as they
    // appear in the coordinate file.
    //   If residue is not found, the function returns -1.
    int  GetResidueNo ( int seqNum, const InsCode insCode );

    void GetResidueTable ( PPCResidue & resTable,
                           int & NumberOfResidues );

    //   GetResidueCreate(..) returns pointer on residue, whose name,
    // sequence number and insertion code are given by resName, seqNum
    // and insCode, respectively. If such a residue is absent in the
    // chain, one is created at the end of chain.
    //   If a residue with given sequence number and insertion code
    // is present in the chain but has a different name, the function
    // returns NULL unless Enforce is set True. In the latter case,
    // a new residue is still created at the end of chain, but there
    // is no guarantee that any function operating on the sequence
    // number and insertion code will work properly.
    PCResidue GetResidueCreate ( const ResName resName, int seqNum,
                             const InsCode insCode, Boolean Enforce );


    //  ------------------  Deleting residues  ----------------------

    int  DeleteResidue ( int resNo ); // returns num of deleted res-s
    int  DeleteResidue ( int seqNum, const InsCode insCode );
    int  DeleteAllResidues();
    int  DeleteSolvent    ();
    void TrimResidueTable ();  // do not forget to call after all dels

    //  -------------------  Adding residues  -----------------------

    //   AddResidue(..) adds residue to the chain, InsResidue inserts
    // the residue on the specified position of the chain (other
    // residues are shifted up to the end of chain). Position in the
    // chain may be specified by a serial number (that is position in
    // the residue table) or by seqNum and insCode of one of the
    // chain's residues (the new residue is then inserted before that
    // one). If the chain is associated with a coordinate hierarchy,
    // and residue 'res' is not, the latter is checked in
    // automatically. If residue 'res' belongs to any coordinate
    // hierarchy (even though that of the residue), it is *copied*
    // rather than simply taken over, and is checked in.
    //   If the chain is not associated with a coordinate hierarchy,
    // all added residues will be checked in automatically once the
    // chain is checked in.
    int  AddResidue ( PCResidue res );
    int  InsResidue ( PCResidue res, int pos );
    int  InsResidue ( PCResidue res, int seqNum,
                      const InsCode insCode );

    //  --------------------  Extracting atoms  ---------------------

    int  GetNumberOfAtoms ( Boolean countTers );
    int  GetNumberOfAtoms ( int seqNo, const InsCode insCode );
    int  GetNumberOfAtoms ( int resNo );

    PCAtom GetAtom ( int            seqNo,
                     const InsCode  insCode,
                     const AtomName aname,
                     const Element  elmnt,
                     const AltLoc   aloc );
    PCAtom GetAtom ( int seqNo, const InsCode insCode, int atomNo );
    PCAtom GetAtom ( int            resNo,
                     const AtomName aname,
                     const Element  elmnt,
                     const AltLoc   aloc );
    PCAtom GetAtom ( int resNo, int atomNo );

    void GetAtomTable ( int seqNo, const InsCode insCode,
                        PPCAtom & atomTable, int & NumberOfAtoms );
    void GetAtomTable ( int resNo,
                        PPCAtom & atomTable, int & NumberOfAtoms );

    //   GetAtomTable1(..) returns atom table without TER atoms and
    // without NULL atom pointers. NumberOfAtoms returns the actual
    // number of atom pointers in atomTable.
    //   atomTable is allocated withing the function. If it was
    // not set to NULL before calling the function, the latter will
    // attempt to deallocate it first.
    //   The application is responsible for deleting atomTable,
    // however it must not touch atom pointers, i.e. use simply
    // "delete[] atomTable;". Never pass atomTable from
    // GetAtomTable(..) into this function, unless you set it to NULL
    // before doing that.
    void GetAtomTable1 ( int seqNo, const InsCode insCode,
                         PPCAtom & atomTable, int & NumberOfAtoms );
    void GetAtomTable1 ( int resNo,
                         PPCAtom & atomTable, int & NumberOfAtoms );

    //  ---------------------  Deleting atoms  ----------------------

    int DeleteAtom ( int            seqNo,
                     const InsCode  insCode,
                     const AtomName aname,
                     const Element  elmnt,
                     const AltLoc   aloc );
    int DeleteAtom ( int           seqNo,
                     const InsCode insCode,
                     int           atomNo );
    int DeleteAtom ( int            resNo,
                     const AtomName aname,
                     const Element  elmnt,
                     const AltLoc   aloc );
    int DeleteAtom ( int resNo, int atomNo );

    int DeleteAllAtoms ( int seqNo, const InsCode insCode );
    int DeleteAllAtoms ( int resNo );
    int DeleteAllAtoms ();

    //  DeleteAltLocs() leaves only alternative location with maximal
    // occupancy, if those are equal or unspecified, the one with
    // "least" alternative location indicator.
    //  The function returns the number of deleted. All tables remain
    // untrimmed, so that explicit trimming or calling
    // FinishStructEdit() is required.
    int DeleteAltLocs();

    //  ----------------------  Adding atoms  -----------------------

    int AddAtom ( int seqNo, const InsCode insCode, PCAtom atom );
    int AddAtom ( int resNo, PCAtom atom );

    //  -------------------------------------------------------------

    void  ApplyTransform ( mat44 & TMatrix );  // transforms all
                                         // coordinates by multiplying
                                         // with matrix TMatrix

    int   GetModelNum();
    PCModel GetModel () { return (PCModel)model; }
    pstr  GetChainID () { return chainID; }
    void  SetChainID ( const ChainID chID );
    pstr  GetChainID ( pstr  ChID );  // returns /m/c 

    void  GetAtomStatistics  ( RSAtomStat AS );
    void  CalcAtomStatistics ( RSAtomStat AS );

    int   CheckID    ( const ChainID chID );
    int   CheckIDS   ( cpstr CID  );

    pstr  GetEntryID ();
    void  SetEntryID ( const IDCode idCode );

    int   GetNumberOfDBRefs ();
    PCDBReference  GetDBRef ( int dbRefNo );  // 0..nDBRefs-1

    void  MaskAtoms      ( PCMask Mask );
    void  MaskResidues   ( PCMask Mask );
    void  UnmaskAtoms    ( PCMask Mask );
    void  UnmaskResidues ( PCMask Mask );

    void  SortResidues   ();

    int       GetNofModResidues();
    PCModRes  GetModResidue    ( int modResNo );  // 0.. on

    Boolean   isSolventChain   ();
    Boolean   isInSelection    ( int selHnd );
    Boolean   isAminoacidChain ();
    Boolean   isNucleotideChain();


    // -------  user-defined data handlers
    int   PutUDData ( int UDDhandle, int      iudd );
    int   PutUDData ( int UDDhandle, realtype rudd );
    int   PutUDData ( int UDDhandle, cpstr    sudd );

    int   GetUDData ( int UDDhandle, int      & iudd );
    int   GetUDData ( int UDDhandle, realtype & rudd );
    int   GetUDData ( int UDDhandle, pstr sudd, int maxLen );
    int   GetUDData ( int UDDhandle, pstr     & sudd );

    void  Copy ( PCChain Chain );

    void  write ( RCFile f );    // writes header to PDB binary file
    void  read  ( RCFile f );    // reads header from PDB binary file

  protected :

    ChainID         chainID;     // chain ID
    ChainID         prevChainID; // if chain is renamed, its original
                                 // name may be saved here.
    PCProModel      model;       // pointer to model class

    int             nWeights;    // used externally for sorting
    realtype        Weight;      //   chains

    int             nResidues;   // number of residues
    PPCResidue      Residue;     // array of residues

    Boolean         Exclude;     // used internally

    void  InitChain ();
    void  FreeMemory();

    void  ExpandResidueArray ( int inc );
    //   _ExcludeResidue(..) excludes (but does not dispose!) a residue
    // from the chain. Returns 1 if the chain gets empty and 0
    // otherwise.
    int   _ExcludeResidue ( const ResName resName, int seqNum,
                            const InsCode insCode );
    void  _copy ( PCChain Chain );
    void  _copy ( PCChain Chain, PPCAtom atom, int & atom_index );
    void  CheckInAtoms();

  private :
    int  ResLen;      // length of Residue array

};


extern void  TestChain();  //  reads from 'in.chain', writes into 
                           //  'out.chain' and 'abin.chain'

#endif

