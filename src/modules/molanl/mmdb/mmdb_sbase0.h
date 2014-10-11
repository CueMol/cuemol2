//  $Id: mmdb_sbase0.h,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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
//  **** Module  :  mmdb_sbase0 <implementation>
//       ~~~~~~~~~
//  **** Classes :  CSBase0      ( structure base manager 0     )
//       ~~~~~~~~~  CSBAtom      ( SB atom class                )
//                  CSBBond      ( SB bond class                )
//                  CSBStructure ( SB structure (monomer) class )
//                  CSBIndex     ( SB index class               )
//
//   (C) E. Krissinel 2000-2008
//
//  =================================================================
//

#ifndef  __MMDB_SBase0__
#define  __MMDB_SBase0__

#ifndef  __MMDB_Manager__
#include "mmdb_manager.h"
#endif

#ifndef  __MMDB_Graph__
#include "mmdb_graph.h"
#endif


//  =================================================================

//  --  oracle data field lengths
#define compoundID_len       10
#define formula_len          1000
#define charge_len           5000
#define name_len             1000
#define synonym_len          1000
#define sca_name_len         20
#define pdb_name_len         20
#define element_len          5
#define sca_leaving_atom_len 3
#define chirality_len        1
#define scb_bond_order_len   10
#define energy_type_len      8


typedef char CompoundID   [compoundID_len+1];
typedef char SBPDBName    [pdb_name_len+1];
typedef char SBElementName[element_len+1];

//  -- names for graph files
#define sbIndexFile   cpstr("index.sbase")
#define sbGraphFile   cpstr("graph.sbase")
#define sbStructFile  cpstr("struct.sbase")


//  ======================  SB Atom Class  =========================

DefineClass(CSBAtom)

class CSBAtom : public CStream  {

  public :
    char sca_name  [sca_name_len+1];    // SCA atom name
    char pdb_name  [pdb_name_len+1];    // PDB atom name (aligned)
    char old_pdb_name[pdb_name_len+1];  // old PDB atom name (aligned)
    char element   [element_len+1];     // chemical element (aligned)
    char energyType[energy_type_len+1]; // energy type; set to empty
                                        // string "" if not provided
    realtype x,y,z;                     // cartesian coordinates; set
                                        // to -MaxReal if not provided
    realtype x_esd,y_esd,z_esd;         // ESDs for cartesian coordi-
                                        //   nates; set to 0.0 if not
                                        //   provided
    realtype ccp4_charge;               // atom charge from ccp4 libs
    realtype sca_charge;                // formal atom charge (MSD)
    realtype partial_charge;            // partial atom charge (MSD)
    realtype vdw_radius;                // Van-der-Waals radius
    realtype vdwh_radius;               // Van-der-Waals radius with
                                        //   hydrogen
    realtype ion_radius;                // ion radius
    int      valency;                   // valency
    char     chirality;                 // chirality: 'R', 'S' or 'N'
    char     leaving;                   // leaving atom: 'Y' or 'N'
    char     hb_type;                   // hydrogen bond type:
                                        //   'D' donor
                                        //   'A' acceptor
                                        //   'B' both
                                        //   'H' hydrogen candidate
                                        //   'N' neither

    CSBAtom ();
    CSBAtom ( RPCStream Object );
    ~CSBAtom();

    void   makeCAtom ( RPCAtom a );
    PCAtom makeCAtom ();

    virtual void Copy  ( PCSBAtom A );

    void read  ( RCFile f );
    void write ( RCFile f );

  protected :
    void SBAtomInit();

};

DefineStreamFunctions(CSBAtom)



//  =======================  SB Bond Class  ========================

DefineClass(CSBBond)

class CSBBond : public CStream  {

  public :
    int      atom1,atom2,order;  //   bonded atoms ordinal numbers in
                                 // reference to the atom array in
                                 // CSBStructure; atom1 and atom2
                                 // number atoms like 1,2 on; these
                                 // fields are always provided
    realtype length,length_esd;  //   bond length in A and its esd;
                                 // set to 0.0 if not provided by
                                 // data base

    CSBBond ();
    CSBBond ( RPCStream Object );
    ~CSBBond();

    void  SetBond ( int at1, int at2, int ord );

    virtual void  Copy ( PCSBBond B );

    void  read  ( RCFile f );
    void  write ( RCFile f );

  protected :
    void  SBBondInit();

};

DefineStreamFunctions(CSBBond)



//  =======================  SB Angle Class  =======================

DefineClass(CSBAngle)

class CSBAngle : public CStream  {

  public :
    int      atom1,atom2,atom3;  // number atoms like 1,2 on; always
                                 // provided
    realtype angle,angle_esd;    // angle is always provided; esd
                                 // is set to 0.0 if not provided

    CSBAngle ();
    CSBAngle ( RPCStream Object );
    ~CSBAngle();

    virtual void  Copy  ( PCSBAngle G );

    void  read  ( RCFile f );
    void  write ( RCFile f );

  protected :
    void  SBAngleInit();

};

DefineStreamFunctions(CSBAngle)


//  ======================  SB Torsion Class  ======================

DefineClass(CSBTorsion)

class CSBTorsion : public CStream  {

  public :
    int   atom1,atom2,atom3,atom4; // number atoms like 1,2 on;
                                   // always provided
    realtype torsion,torsion_esd;  // torsion is always provided;
                                   // esd is set to 0.0 if not provided

    CSBTorsion ();
    CSBTorsion ( RPCStream Object );
    ~CSBTorsion();

    virtual void  Copy  ( PCSBTorsion T );

    void  read  ( RCFile f );
    void  write ( RCFile f );

  protected :
    void  SBTorsionInit();

};

DefineStreamFunctions(CSBTorsion)


//  ====================  Structure Class  =========================

DefineClass(CSBStructure)

class CSBStructure : public CStream  {

  public :
    CompoundID   compoundID;  // CIF ID  -- always provided
    pstr         Formula;     // NULL if not provided
    pstr         Name;        // NULL if not provided
    pstr         Synonym;     // NULL if not provided
    pstr         Charge;      // NULL if not provided

    //   Atom, Bond, Angle and Torsion point on the vectors of
    // PCSBAtom[nAtoms], PCSBBond[nBonds], PCSBAngle[nAngles] and
    // PCSBTorsion[nTorsions], respectively. Not all of them may be
    // provided by the data base. If not provided, NULL is assigned.
    int          nAtoms,nBonds,nAngles,nTorsions;
    PPCSBAtom    Atom;        // always provided
    PPCSBBond    Bond;        // report if not provided
    PPCSBAngle   Angle;       // NULL if not provided
    PPCSBTorsion Torsion;     // NULL if not provided

    int          nLeavingAtoms;
    ivector      leavingAtom;
    ivector      bondedAtom;

    char         xyz_source;  // 'A' for ACD coordinates,
                              // 'R' for RCSB coordinates
                              // 'P' for PDB coordinates
                              // 'N' if xyz are not provided

    CSBStructure ();
    CSBStructure ( RPCStream Object );
    ~CSBStructure();

    void  Reset    ();

    void  PutFormula ( cpstr F );
    void  PutName    ( cpstr N );
    void  PutSynonym ( cpstr S );
    void  PutCharge  ( cpstr G );

    void  AddAtom    ( PCSBAtom    atom    );
    void  AddBond    ( PCSBBond    bond    );
    void  MakeLeavingAtoms();
    void  AddAngle   ( PCSBAngle   angle   );
    void  AddTorsion ( PCSBTorsion torsion );

    void  RemoveEnergyTypes();
    int   SetEnergyType ( cpstr sca_name, cpstr energyType,
                          realtype partial_charge );

    int   GetAtomNo  ( cpstr sca_name ); // returns 0 if atom not
                            // found, >0 gives the atom ordinal number

    PCSBAtom GetAtom ( cpstr sca_name );

    //  GetAtomTable(..)  does not deallocate atomTable!
    void  GetAtomTable ( PPCAtom & atomTable, int & nOfAtoms );

    //  CheckAtoms() returns -1 if there is no atoms
    //                       -2 if not all atoms are annotated
    //                       -3 if not all coordinates are set
    //                        0 otherwise
    int   CheckAtoms();

    //  GetAtomNameMatch(..) returns anmatch[i], i=0..nAtoms-1, equal
    // to j such that name(Atom[i])==name(A[j]). Note that atom names
    // are similarly aligned and space-padded in both MMDB and SBase.
    // If ith atom in the structue is not found in A, anmatch[i] is
    // set -1.
    //   If array A contains atoms in different alternative
    // conformations, the the value of altLoc is interpreted as
    // follows:
    //    NULL  - the highest occupancy atom will be taken
    //            if all occupancies are equal then atom with
    //            first altLoc taken
    //    other - atoms with given altLoc are taken. If such
    //            altLoc is not found, the function does as if
    //            NULL value for altLoc is given.
    //   A clean PDB file is anticipated, so that atoms with
    // alternative conformations are grouped together.
    //   It is Ok to have NULL pointers in A.
    void  GetAtomNameMatch ( PPCAtom A, int nat, pstr altLoc,
                             ivector anmatch );

    PCResidue makeCResidue ( Boolean includeHydrogens=False,
                             Boolean makeTer=False );

    int       AddHydrogens ( PCResidue R );

    virtual void  Copy ( PCSBStructure S );

    void  read       ( RCFile f );
    void  write      ( RCFile f );

  protected :
    int   nAAlloc,nBAlloc,nGAlloc,nTAlloc;
    void  SBStructureInit();
    void  FreeMemory     ();

};

DefineStreamFunctions(CSBStructure)



//  ====================  Index Class  ==============================

DefineClass(CSBIndex)

class CSBIndex : public CStream  {

  public :
    CompoundID compoundID;  // CIF ID of the compound
    int        nAtoms;      // number of atoms in the compound
    int        nBonds;      // number of bonds in the compound
    int        fGraphPos;   // offset for CGraph
    int        fStructPos;  // offset for CSBStructure
    int        loadPos;     // load ordinal number, not in the file
    int        nXTs;        // total number of "XT"-atoms
    pstr       Comp1;       // composition string
    pstr       Comp2;       // composition string with leaving atom

    CSBIndex ();
    CSBIndex ( RPCStream Object );
    ~CSBIndex();

    int   MakeCompositions ( PCSBStructure SBS );

    void  read  ( RCFile f );
    void  write ( RCFile f );

  protected :
    void  SBIndexInit();

};

DefineStreamFunctions(CSBIndex)



//  ==========================  CSBase0  ============================

extern int MakeChirInd     ( char chirality );
extern int MakeElementType ( int ElType, int  Chirality,
                             Boolean Cflag );
extern int MakeElementType ( int ElType, char chirality,
                             Boolean Cflag );


#define SBASE_noHBonds               6
#define SBASE_noDonors               5
#define SBASE_noAcceptors            4
#define SBASE_Incomplete             3
#define SBASE_AlreadyUnloaded        2
#define SBASE_AlreadyLoaded          1
#define SBASE_Ok                     0
#define SBASE_FileNotFound          -1
#define SBASE_StructNotFound        -2
#define SBASE_WrongIndex            -3
#define SBASE_ReadError             -4
#define SBASE_ConnectivityError     -5
#define SBASE_CheckFail             -6
#define SBASE_NoAtomsFound          -7
#define SBASE_NoBonds               -8
#define SBASE_NoAtomData            -9
#define SBASE_EmptyResidue         -10
#define SBASE_NoSimilarity         -11
#define SBASE_SuperpositionFailed  -12
#define SBASE_Fail                 -13
#define SBASE_BrokenBonds          -14
#define SBASE_EmptyResSet          -15
#define SBASE_noCoordHierarchy     -16

#define CMPLF_Hydrogens  0x00000001
#define CMPLF_nonHs      0x00000002
#define CMPLF_XT         0x00000004
#define CMPLF_All        0x00000007


//   SDASelHandles is optionally used in MakeBonds(..), when
// the latter works for hydrogen bond calculations.
DefineStructure(SDASelHandles)
struct SDASelHandles  {
  int selHndDonor;
  int selHndAcceptor;
  int selHndHydrogen;
  int selKey;
  void getNewHandles    ( PCMMDBManager MMDB );
  void makeSelIndexes   ( PCMMDBManager MMDB );
  void deleteSelections ( PCMMDBManager MMDB );
};


DefineClass(CSBase0)

class CSBase0  {

  public :

    CSBase0 ();
    ~CSBase0();

    //   LoadIndex() loads index of the structural database. 'path'
    // must point on the directory containing the database files.
    // The index must be loaded once before retrieving any
    // information from the database.
    //   LoadIndex() may return either SBASE_Ok or SBASE_FileNotFound.
    int  LoadIndex  ( cpstr path   );
    int  LoadIndex1 ( cpstr EnvVar );

    //   LoadStructure(..) reads structure from *.sbase files and
    // stores it in RAM for faster access. There is no special
    // functions to access loaded structures, all requests to
    // *.sbase files and RAM-storage are dispatched automatically.
    int  LoadStructure   ( cpstr compoundID );
    //   UnloadStructure(..) deletes strtucture from RAM and releases
    // its memory. The structure is then accessible in the normal
    // way from *.sbase files, which is slower.
    int  UnloadStructure ( cpstr compoundID );

    //   GetPath() returns full path to a file with file name FName
    // in the database directory.  Length of S should suffice for
    // accomodating the path. The function returns S.
    //   GetPath() will work only after loading the database index.
    pstr GetPath ( pstr & S, cpstr FName );

    //   GetStructFile() creates and open the database structure
    // file and returns its pointer. In the case of errors returns
    // NULL. Application is responsible for deleting this file.
    PCFile GetStructFile();

    //   GetGraphFile() creates and open the database graph
    // file and returns its pointer. In the case of errors returns
    // NULL. Application is responsible for deleting this file.
    PCFile GetGraphFile();

    //   GetStructure(..) returns pointer to the monomer structure
    // identified by 3-letter compoundID. If such structure is not
    // found, the function returns NULL.
    //   The function returns a pointer to a private copy of the
    // structure. Modifying it will not change data in the structural
    // database. The application is responsible for deallocating
    // the structure after use (simply use delete).
    //   See description of CSBStructure for the explanation of
    // its fields.
    PCSBStructure GetStructure ( cpstr compoundID );
    PCSBStructure GetStructure ( int structNo, PCFile structFile );
                                 // 0...nStructures-1

    //   Another form of GetStructure(..) uses an open structure
    // file, which allows to save on opening/closing file if
    // multiple access to SBase structures is required. The file
    // is neither open nor closed by the function
    PCSBStructure GetStructure ( cpstr compoundID,
                                 PCFile structFile );

    PCResidue makeCResidue ( cpstr compoundID, 
                             PCFile     structFile,
                             Boolean    includeHydrogens=False,
                             Boolean    makeTer=False );
    PCResidue makeCResidue ( int        structNo, 
                             PCFile     structFile,
                             Boolean    includeHydrogens=False,
                             Boolean    makeTer=False );


    //   GetGraph(..) retrieves data for chemical structure number
    // structNo (as described in Index) from graph file graphFile,
    // then allocates and builds the corresponding graph, which is
    // returned in G.
    //   If Hflag is set >= 1, all hydrogens are removed from
    // the graph. If Hflag is set to 2, element types of atoms,
    // to which hydrogens are bonded, are modified with flag
    // HYDROGEN_BOND.
    //   Returns SBASE_Ok in case of success. Other return code are
    // SBASE_WrongIndex and SBASE_ReadError.
    int  GetGraph ( PCFile graphFile, int structNo, RPCGraph G,
                    int Hflag );
    int  GetGraph ( PCFile graphFile, RPCGraph G, int Hflag );
    int  GetGraph ( int   structNo  , RPCGraph G, int Hflag );
    int  GetGraph ( cpstr  compoundID, RPCGraph G, int Hflag );

    //   GetStructNo() returns position of the structure with
    // (3-letter) name 'name' as found in the database index.
    //   Non-negative return means success, otherwise
    // SBASE_StructNotFound indicates that the requested structure
    // was not found in the database index.
    int  GetStructNo ( cpstr compoundID );

    int  GetNofAtoms ( cpstr compoundID );
    int  GetNofAtoms ( int   structNo );

    //   GetNofStructures() returns number of structures in the
    // database index.
    int  GetNofStructures() { return nStructures; }

    //   CheckGraph(..) checks graph G against a same-name
    // structure in the database. The name must be passed in
    // G->name as a standard 3-letter code.
    //   If Hflag is set >= 1, all hydrogens are removed from
    // the graph. If Hflag is set to 2, element types of atoms,
    // to which hydrogens are bonded, are modified with flag
    // HYDROGEN_BOND.
    //   If Cflag is set to True, then chirality information is
    // assumed in the input graph G and it is used for the
    // checking. If Cflag is set to False, then chirality
    // information is neither assumed nor used for the checking.
    // If chirality is there, all element IDs in the graph are
    // assigned flag CHIRAL_RIGHT for 'R'-chirtality, CHIRAL_LEFT
    // for 'S'-chirality and no flag if the atom is not a chiral
    // center.
    //   If a same-name structure is found in the database,
    // the function returns the number of matched vertices
    // (nMatched) from those found in the database (nInStructure).
    // The correspondence between the input and database graphs
    // is returned in array match (it should be of sufficient
    // length) such that ith vertex of input graph corresponds
    // to the match[i]th vertex of the database graph. The
    // function then returns SBASE_Ok if the number of matched
    // vertices coincides with nInStructure and nMatched, and
    // the return is SBASE_CheckFail otherwise.
    //   If a same-name structure is not found, the function
    // returns SBASE_StructNotFound or SBASE_FileNotFound.
    int  CheckGraph   ( PCGraph G, int Hflag, Boolean Cflag,
                        int & nInStructure, int & nMatched,
                        ivector match, int minMatchSize=0 );

    //   In the current implementation of CheckResidue, Cflag
    // must be always set False, as the chirality information
    // cannot be calculated (in this version) from 3D coordinates.
    // See the meaning of altLoc in mmdb_graph.h, other parameters
    // are the same as in CheckGraph(..) above.
    int  CheckResidue ( PCResidue R, int Hflag, Boolean Cflag,
                        int & nInResidue, int & nInStructure,
                        int & nMatched,   ivector match,
                        cpstr altLoc=pstr(""),
                        int minMatchSize=0 );



    //   MakeBonds(..) makes bonds between atoms in MMDB's residue R
    // from data found in SBase. Residue R must be associated with
    // coordinate hierarchy. Data is retrieved from SBase on the basis
    // of residue name only. In case of multiple conformations, if
    // altLoc:
    //    NULL  - the highest occupancy atom will be taken
    //            if all occupancies are equal then atom with
    //            first altLoc taken
    //    other - atoms with given altLoc are taken. If such
    //            altLoc is not found, the function does as if
    //            NULL value for altLoc is given.
    //   If selHandles is not NULL, the function also selects atoms
    // in the residue according to their hydrogen bond attributes.
    // This is a special option for hydrogen bond calculations
    //   If ignoreNegSigOcc is set True then the function will ignore
    // atoms with negative occupancy standard deviation. Such atoms
    // may be hydrogens added by CSBase0::AddHydrogen(..) function,
    // in general any atoms added by CSBAtom::MakeCAtom(..) function.
    // Added hydrogens may be ignored if MakeBonds is used in
    // CSbase::CalcHBonds(..) function.
    //   Return:
    //     SBASE_Ok             success
    //     SBASE_FileNotFound   non-initiated SBase
    //     SBASE_StructNotFound the residue's name is not found
    //                          in SBase
    //     SBASE_EmptyResidue   residue R does not contain atoms
    //     SBASE_NoAtomsFound   SBase entry does not contain atoms
    //     SBASE_BrokenBonds    some bonds could not be set up because
    //                          of missing atoms in R. This could be
    //                          a result of residue R named wrongly.
    int  MakeBonds ( PCResidue      R,
                     pstr           altLoc,
                     PCFile         structFile,
                     PSDASelHandles selHandles,
                     Boolean        ignoreNegSigOcc );

    int  GetEnergyTypes ( PCResidue  R,           PCFile structFile );
    int  GetEnergyTypes ( PPCResidue R, int nRes, PCFile structFile );
    int  GetEnergyTypes ( PCChain      chain,     PCFile structFile );
    int  GetEnergyTypes ( PCModel      model,     PCFile structFile );
    int  GetEnergyTypes ( PCMMDBManager MMDB,     PCFile structFile );


    int  AddHydrogens   ( PCResidue        R, PCFile structFile );
    int  AddHydrogens   ( PCChain      chain, PCFile structFile );
    int  AddHydrogens   ( PCModel      model, PCFile structFile );
    int  AddHydrogens   ( PCMMDBManager MMDB, PCFile structFile );


    //   ComplementResidue(..) extracts data from SBase by residue
    // name, then superposes atoms having identical names and
    // adds the residue with atoms that are found in SBase but are
    // absent in the residue. The added atoms are rotated and
    // translated such as to comply with the superposed parts.
    //   complFlag:
    //     CMPLF_Hydrogens complement residue with hydrogens
    //     CMPLF_nonHs     complement residue with non-hydrogens
    //     CMPLF_XT        complement with C-terminus
    //   Return:
    //     SBASE_Ok             success
    //     SBASE_FileNotFound   SBase is not initialized
    //     SBASE_StructNotFound the residue's name is not found
    //                          in SBase
    //     SBASE_EmptyResidue   residue R does not contain atoms
    //     SBASE_NoAtomsFound   SBase entry does not contain atoms
    //     SBASE_NoAtomsData    SBase entry is not complete
    //     SBASE_NoSimilarity   too few coomon atom names in R
    //                          and SBase entry with the same
    //                          structure name
    //     SBASE_SuperpositionFailed  failed residue superposition
    // NOTE: the function rearranges ALL atoms in the residue according
    // to PDB order as written in SBase.
    int  ComplementResidue ( PCResidue R, int complFlag,
                             PCFile structFile=NULL );

    //  The following will return
    //     SBASE_Ok             success
    //     SBASE_FileNotFound   SBase is not initialized
    //     SBASE_Incomplete     some residues were not fully completed
    //                          (warning)
    //     SBASE_Fail           no residues were completed
    int  ComplementChain   ( PCChain chain, int complFlag,
                             PCFile structFile=NULL );
    int  ComplementModel   ( PCModel model, int complFlag,
                             PCFile structFile=NULL );
    int  ComplementFile    ( PCMMDBManager MMDB, int complFlag,
                             PCFile structFile=NULL );

    //   GetAtomNames(...) returns atom names (AtName[i]), total
    // number of atoms (nAtoms) and number of hydrogens (nH) for
    // structure number structNo, as found in the database index.
    // Length of AtName should allow for accomodating all atom
    // names.
    //   The function may return SBASE_Ok, SBASE_FileNotFound,
    // SBASE_WrongIndex and SBASE_ReadError.
    int  GetAtNames  ( int structNo,   PAtomName AtName,
                       int & nAtoms, int & nH );

    //   GetAtomNames(RCFile..) works exactly like its overload
    // version above, however it allows to save time on reopening
    // the database's description file (structFile). The file
    // reference, passed to the function, should be associated with
    // opened description file. The function does not close the file.
    //   The function may return SBASE_Ok, SBASE_WrongIndex and
    // SBASE_ReadError.
    int  GetAtNames  ( PCFile structFile, int structNo,
                       PAtomName  AtName, int & nAtoms, int & nH  );

    //   GetNofAtoms(..) returns number of non-hydrogen atoms
    // (nNonHAtoms) and number of hydrogens (nHAtoms) for structure
    // number structNo, as found in the database index.
    //   The function may return SBASE_Ok or SBASE_WrongIndex.
    int  GetNofAtoms ( int structNo, int & nNonHAtoms, int & nHAtoms );

    //   GetAtoms(...) retrieves the number of non-hydrogen atoms
    // (nNonHAtoms), their names (NonHAtName), number of hydrogens
    // (nHAtoms) and their names (HAtName), hydrogens' connectivity
    // to non-hydrogen atoms (Hconnect), element IDs (Elem) and
    // chiralities (Chiral) for structure named 'name'.
    //   Hydrogen HAtName[i] is connected to non-hydrogen atom
    // NonHAtom[Hconnect[i]], if Hconnect[i]>=0.
    //   The function may return SBASE_Ok, SNASE_StructNotFound,
    // SBASE_FileNotFound, SBASE_ReadError, SBASE_ConnectivityError.
    int  GetAtoms ( cpstr compoundID,
                    int & nNonHAtoms, PAtomName NonHAtName,
                    int & nHAtoms,    PAtomName HAtName,
                    ivector Hconnect, ivector Elem,
                    ivector Chiral );

    //   GetAtoms(...) retrieves the number of atoms (nAtoms) and
    // number of bonds (nBonds[i]) and connectivity (bondPair[i][j])
    // for all atoms in the structure named 'name'.  bondPair[i][j],
    // 0<=i<nAtoms, 0<=j<nBonds[i], gives the number of atom connected
    // to i-th atom. Only pairs i<j are returned.
    //   maxNAtoms is the length of nBonds[] and bondPairs[],
    // maxNBonds is the length of bondPairs[][].
    //   The function may return SBASE_Ok, SBASE_StructNotFound,
    // SBASE_FileNotFound, SBASE_ReadError.
    int  GetBonds ( cpstr   compoundID,
                    ivector nBonds, imatrix bondPair,
                    int &   nAtoms, int     maxNAtoms,
                    int     maxNBonds );


    int  GetHetInfo ( cpstr       name,
                      pstr        Formula,
                      pstr        Hname,
                      pstr        Hsynonym,
                      pstr        Hcharge,
                      PAtomName & ClinkAtom,  // will
                      PElement  & ClinkEle,   //   be
                      PAtomName & SlinkAtom,  //     allocated
                      PElement  & SlinkEle,   //       or NULL
                      int       & nLeavingAtoms );

  protected :
    pstr       dirpath;
    PPCSBIndex Index;
    int        nStructures;

    void InitSBase0 ();
    void FreeMemory0();

  private :
    int            nIAlloc,nLoad,nLAlloc;
    PPCGraph       ldGraph;
    PPCSBStructure ldStructure;

};

#endif
