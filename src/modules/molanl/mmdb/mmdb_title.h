//  $Id: mmdb_title.h,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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
//    17.03.09   <--  Date of Last Modification.
//                   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//  -----------------------------------------------------------------
//
//  **** Module  :  MMDB_Title <interface>
//       ~~~~~~~~~
//  **** Project :  MacroMolecular Data Base (MMDB)
//       ~~~~~~~~~
//  **** Classes :  CTitleContainer  (container of title classes)
//       ~~~~~~~~~  CObsLine
//                  CTitleLine
//                  CCaveat
//                  CCompound
//                  CSource
//                  CKeyWords
//                  CExpData
//                  CAuthor
//                  CRevData
//                  CSupersede
//                  CJournal
//                  CRemark
//                  CBiomolecule
//                  CMMDBTitle       ( MMDB title section )
//
//   (C) E. Krissinel 2000-2009
//
//  =================================================================
//

#ifndef __MMDB_Title__
#define __MMDB_Title__


#ifndef __Stream__
#include "stream_.h"
#endif

#ifndef  __MMDB_Defs__
#include "mmdb_defs.h"
#endif

#ifndef  __MMDB_Utils__
#include "mmdb_utils.h"
#endif

#ifndef  __MMDB_MMCIF__
#include "mmdb_mmcif.h"
#endif


//  ====================  CTitleContainer  ======================

DefineClass(CTitleContainer)
DefineStreamFunctions(CTitleContainer)

class CTitleContainer : public CClassContainer  {

  public :

    CTitleContainer  () : CClassContainer() {}
    CTitleContainer  ( RPCStream Object )
                        : CClassContainer ( Object ) {} 
    ~CTitleContainer () {}

    PCContainerClass MakeContainerClass ( int ClassID );

};


//  ==================  CObsLine  ========================

DefineClass(CObsLine)
DefineStreamFunctions(CObsLine)

class CObsLine : public CContainerClass  {

  public :

    Date   repDate;    //  date of replacement
    IDCode idCode;     //  ID code of replaced entry
    IDCode rIdCode[8]; //  ID codes of entries that replaced this one

    CObsLine ();
    CObsLine ( cpstr S );
    CObsLine ( RPCStream Object );
    ~CObsLine();

    void  PDBASCIIDump    ( pstr S, int N   );
    void  MakeCIF         ( PCMMCIFData CIF, int N );
    int   ConvertPDBASCII ( cpstr S );
    void  GetCIF          ( PCMMCIFData CIF, int & Signal );
    int   GetClassID      () { return ClassID_ObsLine; }

    void  Copy  ( PCContainerClass ObsLine );

    void  write ( RCFile f );
    void  read  ( RCFile f );

  protected :
    
    void InitObsLine();

};


//  ====================  CTitleLine  =====================

DefineClass(CTitleLine)
DefineStreamFunctions(CTitleLine)

class CTitleLine : public CContString  {

  public :

    CTitleLine ();
    CTitleLine ( cpstr S );
    CTitleLine ( RPCStream Object );
    ~CTitleLine();

    int   ConvertPDBASCII ( cpstr S );
    void  PDBASCIIDump    ( pstr S, int N );
    Boolean PDBASCIIDump1 ( RCFile f ) { return False; }
    int   GetClassID      () { return ClassID_TitleLine; }

//    void  GetCIF          ( PCMMCIFData CIF, int & Signal );
//    void  MakeCIF         ( PCMMCIFData CIF, int N        );
//    void  Copy  ( PCContainerClass TitleLine );

    void  write ( RCFile f );
    void  read  ( RCFile f );

  protected :

    void InitTitleLine();

};


//  ====================  CCaveat  =====================

DefineClass(CCaveat)
DefineStreamFunctions(CCaveat)

class CCaveat : public CContString  {

  public :

    IDCode idCode;   //  ID code of the entry

    CCaveat ();
    CCaveat ( cpstr S );
    CCaveat ( RPCStream Object );
    ~CCaveat();

    void  PDBASCIIDump    ( pstr S, int N );
    Boolean PDBASCIIDump1 ( RCFile f ) { return False; }
    void  MakeCIF         ( PCMMCIFData CIF, int N );
    int   ConvertPDBASCII ( cpstr S );
    void  GetCIF          ( PCMMCIFData CIF, int & Signal );
    int   GetClassID      () { return ClassID_CAVEAT; }

    void  Copy  ( PCContainerClass Caveat );

    void  write ( RCFile f );
    void  read  ( RCFile f );

  protected :

    void InitCaveat();

};


//  ====================  CCompound  =====================

DefineClass(CCompound)
DefineStreamFunctions(CCompound)

class CCompound : public CContString  {

  public :

    CCompound ();
    CCompound ( cpstr S );
    CCompound ( RPCStream Object );
    ~CCompound();

    void  PDBASCIIDump    ( pstr S, int N );
    Boolean PDBASCIIDump1 ( RCFile f ) { return False; }
    int   ConvertPDBASCII ( cpstr S );
    int   GetClassID      () { return ClassID_Compound; }

//    void  GetCIF          ( PCMMCIFData CIF, int & Signal );
//    void  MakeCIF         ( PCMMCIFData CIF, int N        );
//    void  Copy  ( PCContainerClass Compound );

    void  write ( RCFile f );
    void  read  ( RCFile f );

  protected :
    
    void InitCompound();

};


//  ====================  CSource  =====================

DefineClass(CSource)
DefineStreamFunctions(CSource)

class CSource : public CContString  {

  public :

    CSource ();
    CSource ( cpstr S );
    CSource ( RPCStream Object );
    ~CSource();

    void  PDBASCIIDump    ( pstr S, int N );
    Boolean PDBASCIIDump1 ( RCFile f ) { return False; }
    int   ConvertPDBASCII ( cpstr S );
    int   GetClassID      () { return ClassID_Source; }

//    void  GetCIF          ( PCMMCIFData CIF, int & Signal );
//    void  MakeCIF         ( PCMMCIFData CIF, int N        );
//    void  Copy  ( PCContainerClass Source );

    void  write ( RCFile f );
    void  read  ( RCFile f );

  protected :

    void InitSource();

};


//  ====================  CKeyWords  =====================

DefineClass(CKeyWords)
DefineStreamFunctions(CKeyWords)

class CKeyWords : public CStream  {

  public :

    int      nKeyWords;     // number of key words
    psvector KeyWord;       // key word array

    CKeyWords ();
    CKeyWords ( cpstr S );
    CKeyWords ( RPCStream Object );
    ~CKeyWords();

    void  Delete          ();

    void  PDBASCIIDump    ( RCFile f );
    void  MakeCIF         ( PCMMCIFData CIF );

    int   ConvertPDBASCII ( cpstr S );
    void  GetCIF          ( PCMMCIFData CIF );

    void  Copy  ( PCKeyWords KeyWords );

    void  write ( RCFile f );
    void  read  ( RCFile f );

  protected :

    Boolean Cont;

    void  Init();

};


//  ====================  CExpData  =====================

DefineClass(CExpData)
DefineStreamFunctions(CExpData)

class CExpData : public CContString  {

  public :

    CExpData ();
    CExpData ( cpstr S );
    CExpData ( RPCStream Object );
    ~CExpData();

    void  PDBASCIIDump    ( pstr S, int N );
    Boolean PDBASCIIDump1 ( RCFile f ) { return False; }

    int   ConvertPDBASCII ( cpstr S );
    int   GetClassID      () { return ClassID_ExpData; }

//    void  GetCIF          ( PCMMCIFData CIF, int & Signal );
//    void  MakeCIF         ( PCMMCIFData CIF, int N        );
//    void  Copy  ( PCContainerClass ExpData );

    void  write ( RCFile f );
    void  read  ( RCFile f );

  protected :
    
    void InitExpData();

};


//  ====================  CAuthor  =====================

DefineClass(CAuthor)
DefineStreamFunctions(CAuthor)

class CAuthor : public CContString  {

  public :

    CAuthor ();
    CAuthor ( cpstr S );
    CAuthor ( RPCStream Object );
    ~CAuthor();

    void  PDBASCIIDump    ( pstr S, int N   );
    Boolean PDBASCIIDump1 ( RCFile f ) { return False; }

    int   ConvertPDBASCII ( cpstr S );
    int   GetClassID      () { return ClassID_Author; }

//    void  GetCIF          ( PCMMCIFData CIF, int & Signal );
//    void  MakeCIF         ( PCMMCIFData CIF, int N        );
//    void  Copy  ( PCContainerClass Author );

    void  write ( RCFile f );
    void  read  ( RCFile f );

  protected :

    void InitAuthor();

};


//  ====================  CRevData  =====================

DefineClass(CRevData)
DefineStreamFunctions(CRevData)

#define REVDAT_WARN_MODNUM   0x00000001
#define REVDAT_WARN_MODTYPE  0x00000002

class CRevData : public CContainerClass  {

  public :

    int     modNum;
    Date    modDate;
    char    modId[13];
    int     modType;
    RecName record[4];
    word    Warning;

    CRevData ();
    CRevData ( cpstr S );
    CRevData ( RPCStream Object );
    ~CRevData();

    void  PDBASCIIDump    ( pstr S, int N );
    void  MakeCIF         ( PCMMCIFData CIF, int N );

    int   ConvertPDBASCII ( cpstr S );
    void  GetCIF          ( PCMMCIFData CIF, int & Signal );

    int   GetClassID      () { return ClassID_RevData; }

    void  Copy  ( PCContainerClass RevData );

    void  write ( RCFile f );
    void  read  ( RCFile f );

  protected :

    void InitRevData();

};


//  ==================  CSupersede  ========================

DefineClass(CSupersede)
DefineStreamFunctions(CSupersede)

class CSupersede : public CContainerClass  {

  public :

    Date   sprsdeDate;  //  date of supersede
    IDCode idCode;      //  ID code of the entry
    IDCode sIdCode[8];  //  ID codes of superseded entries

    CSupersede ();
    CSupersede ( cpstr S );
    CSupersede ( RPCStream Object );
    ~CSupersede();

    void  PDBASCIIDump    ( pstr S, int N );
    void  MakeCIF         ( PCMMCIFData CIF, int N );

    int   ConvertPDBASCII ( cpstr S );
    void  GetCIF          ( PCMMCIFData CIF, int & Signal );

    int   GetClassID      () { return ClassID_Supersede; }

    void  Copy  ( PCContainerClass Supersede );

    void  write ( RCFile f );
    void  read  ( RCFile f );

  protected :
    
    void InitSupersede();

};


//  ====================  CJournal  =====================

DefineClass(CJournal)
DefineStreamFunctions(CJournal)

class CJournal : public CContString  {

  public :

    CJournal ();
    CJournal ( cpstr S );
    CJournal ( RPCStream Object );
    ~CJournal();

    void  PDBASCIIDump    ( pstr S, int N );
    Boolean PDBASCIIDump1 ( RCFile f ) { return False; }

    int   ConvertPDBASCII ( cpstr S );
    int   GetClassID      () { return ClassID_Journal; }

//    void  GetCIF          ( PCMMCIFData CIF, int & Signal );
//    void  MakeCIF         ( PCMMCIFData CIF, int N        );
//    void  Copy  ( PCContainerClass Journal );

    void  write ( RCFile f );
    void  read  ( RCFile f );

  protected :

    void InitJournal();

};


//  ====================  CRemark  =====================

DefineClass(CRemark)
DefineStreamFunctions(CRemark)

class CRemark : public CContainerClass  {

  public :

    int  remarkNum;  // remark id
    pstr Remark;     // remark line

    CRemark ();
    CRemark ( cpstr S );
    CRemark ( RPCStream Object );
    ~CRemark();

    void  PDBASCIIDump    ( pstr S, int N );
    void  MakeCIF         ( PCMMCIFData CIF, int N );

    int   ConvertPDBASCII ( cpstr S );
    void  GetCIF          ( PCMMCIFData CIF, int & Signal );

    int   GetClassID      () { return ClassID_Remark; }

    void  Copy  ( PCContainerClass RemarkClass );

    void  write ( RCFile f );
    void  read  ( RCFile f );

  protected :

    void InitRemark();

};

//  =================  CBiomolecule  =====================

DefineClass(CBMApply)
DefineStreamFunctions(CBMApply)

class CBMApply : public CStream  {

  public :
    PChainID  chain;
    int       nChains;
    pmat44    tm;
    int       nMatrices;

    CBMApply ();
    CBMApply ( RPCStream Object );
    ~CBMApply();

    void  FreeMemory();

    int   addChains ( int & i, RPCRemark rem, RCTitleContainer Remark );
    int addMatrices ( int & i, RPCRemark rem, RCTitleContainer Remark );

    void  Copy  ( PCBMApply BMA );  // if BMA is NULL, then empties
                                    // the class
    void  write ( RCFile f );
    void  read  ( RCFile f );

  protected :
    void  InitBMApply();

};


DefineClass(CBiomolecule)
DefineStreamFunctions(CBiomolecule)

class CBiomolecule : public CStream  {

  public :
    PPCBMApply BMApply;
    int        nBMAs;

    CBiomolecule ();
    CBiomolecule ( RPCStream Object );
    ~CBiomolecule();

    void  FreeMemory();

    PCBMApply addBMApply();

    int     Size();
    Boolean checkComposition ( PChainID chID, ivector occ,
                               ivector  wocc, int n );

    void  Copy  ( PCBiomolecule B );  // if B is NULL, then empties
                                      // the class
    void  write ( RCFile f );
    void  read  ( RCFile f );

  protected :
    void  InitBiomolecule();

};

//  =================  CMMDBTitle  =======================

DefineClass(CMMDBTitle)
DefineStreamFunctions(CMMDBTitle)

class CMMDBTitle : public CStream  {

  friend class CModel;
  friend class CChain;
  friend class CMMDBFile;

  public :

    CMMDBTitle ();
    CMMDBTitle ( RPCStream Object );
    ~CMMDBTitle();

    void  FreeMemory ( Boolean keepBiomolecules );

    // Fills the PDB file header
    void  SetHeader ( cpstr Classification, // any length is Ok
                      cpstr DepDate,    // DD-MMM-YYYY
                      cpstr ID_Code );  // not more than 11 chars

    // Interprets the ASCII PDB line belonging to the title section
    // and fills the corresponding fields.
    //   Returns zero if the line was converted, otherwise returns a
    // non-negative value of Error_XXXX.
    //   PDBString must be not shorter than 81 characters.
    int   ConvertPDBString ( pstr PDBString );

    // MakePDBString() makes the ASCII PDB HEADER line from the
    // class data. PDBString must be not shorter than 81 characters.
    void  MakePDBHeaderString ( pstr PDBString );

    // GetStructureTitle() returns the contents of TITLE record
    // unfolded into single line. If Title is missing, returns
    // contents of COMPND(:MOLECULE). If COMPND is missing, returns
    // HEADER. If Header is missing, returns PDB code. If no PDB
    // code is there, returns "Not available".
    pstr  GetStructureTitle ( pstr & S );

    PCTitleContainer GetRemarks();

    realtype GetResolution(); // -1.0 mean no resolution record in file

    int   ParseBiomolecules(); // returns the number of biomolecules,
                               // -2 for general format error
                               // -3 for errors in BIOMT records

    int   GetNofBiomolecules();
    void  GetBiomolecules   ( PPCBiomolecule & BM, int & nBMs );
    PCBiomolecule GetBiomolecule ( int bmNo ); // bmno=0,1,..
                               // returns NULL if bmNo is incorrect

    void  PDBASCIIDump ( RCFile      f   );
    void  MakeCIF      ( PCMMCIFData CIF );

    //   GetCIF(..) returns the same code as ConvertPDBString(..)
    // save for Error_WrongSection
    int   GetCIF       ( PCMMCIFData CIF );

    pstr   GetIDCode() { return idCode; }
    Boolean GetCol73() { return col73;  }
    void  TrimInput ( pstr PDBString );

    void  Copy  ( PCMMDBTitle TS );  // if TS is NULL, then empties
                                     // the class

    void  write ( RCFile f );    // writes header to PDB binary file
    void  read  ( RCFile f );    // reads header from PDB binary file

  protected :

    //   Header data
    pstr     classification;  // classification of the molecule
    Date     depDate;         // deposition date DD-MMM-YYYY
    IDCode   idCode;          // unique PDB identifier
    realtype resolution;      // resolution
    Boolean  col73;           // True if columns 73-80 contain PDB ID

    CTitleContainer ObsData;     // obsoletion data
    CTitleContainer Title;       // title data
    CTitleContainer CAVEAT;      // error data
    CTitleContainer Compound;    // compound data
    CTitleContainer Source;      // source
    CKeyWords       KeyWords;    // key words
    CTitleContainer ExpData;     // experimental data
    CTitleContainer Author;      // author data
    CTitleContainer RevData;     // revision data
    CTitleContainer Supersede;   // supersede records
    CTitleContainer Journal;     // journal records
    CTitleContainer Remark;      // remark records

    PPCBiomolecule  Biomolecule;
    int             nBiomolecules;

    void  Init();
    void  FreeBiomolecules();

    PCBiomolecule addBiomolecule();

};

extern void  TestHeader();
extern void  TestTitle (); // reads PDB title from file 'in.title'
                           // and rewrites it into 'out.title' and
                           // 'abin.title'

#endif

