//  $Id: mmdb_atom.h,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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
//    04.02.09   <--  Date of Last Modification.
//                   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//  -----------------------------------------------------------------
//
//  **** Module  :  MMDB_Atom <interface>
//       ~~~~~~~~~
//  **** Project :  MacroMolecular Data Base (MMDB)
//       ~~~~~~~~~
//  **** Classes :  CAtom     ( atom class    )
//       ~~~~~~~~~  CResidue  ( residue class )
//  **** Functions :  BondAngle
//       ~~~~~~~~~~~
//
//  Copyright (C) E. Krissinel 2000-2009
//
//  =================================================================
//

#ifndef __MMDB_Atom__
#define __MMDB_Atom__


#ifndef  __Stream__
#include "stream_.h"
#endif

#ifndef  __MMDB_Defs__
#include "mmdb_defs.h"
#endif

#ifndef  __MMDB_UDData__
#include "mmdb_uddata.h"
#endif

#ifndef  __MMDB_Utils__
#include "mmdb_utils.h"
#endif


//  ======================  CAtom  ==========================


// constants for the WhatIsSet field
#define  ASET_Coordinates   0x00000001
#define  ASET_Occupancy     0x00000002
#define  ASET_tempFactor    0x00000004
#define  ASET_CoordSigma    0x00000010
#define  ASET_OccSigma      0x00000020
#define  ASET_tFacSigma     0x00000040
#define  ASET_Anis_tFac     0x00000100
#define  ASET_Anis_tFSigma  0x00001000
#define  ASET_Charge        0x00000080
#define  ASET_All           0x000FFFFF


#define  ATOM_NoSeqNum      MinInt4

extern Boolean  ignoreSegID;
extern Boolean  ignoreElement;
extern Boolean  ignoreCharge;
extern Boolean  ignoreNonCoorPDBErrors;
extern Boolean  ignoreUnmatch;


DefineStructure(SAtomStat)

struct SAtomStat  {

  public :
    int       nAtoms;          // number of atoms in statistics

    realtype  xmin,ymin,zmin;  // minimums of coordinates
    realtype  xmax,ymax,zmax;  // maximums of coordinates
    realtype  xm  ,ym  ,zm;    // mediums  of coordinates
    realtype  xm2 ,ym2 ,zm2;   // square mediums of coordinates

    realtype  occ_min,occ_max; // minimum/maximum occupancy
    realtype  occ_m  ,occ_m2;  // medium and square medium occupancy

    realtype  tFmin,tFmax;     // minimum/maximum temperature factor
    realtype  tFm  ,tFm2;      // medium and sq. med. temp. factor

    realtype  u11_min,u11_max; // minimums and
    realtype  u22_min,u22_max; //   maximums of
    realtype  u33_min,u33_max; //     anisotropic
    realtype  u12_min,u12_max; //       temperature
    realtype  u13_min,u13_max; //         factors
    realtype  u23_min,u23_max;

    realtype  u11_m,u11_m2;    // mediums and
    realtype  u22_m,u22_m2;    //   square mediums of
    realtype  u33_m,u33_m2;    //     anisotropic
    realtype  u12_m,u12_m2;    //       temperature
    realtype  u13_m,u13_m2;    //         factors
    realtype  u23_m,u23_m2;

    word      WhatIsSet;       //   mask field

    void  Init  ();
    void  Finish();

    realtype GetMaxSize();

  private : 
    Boolean finished;

};


DefineStructure(SAtomBondI)

struct SAtomBondI  {
  int  index;  // bonded atom index
  byte order;  // bond order
};


DefineStructure(SAtomBond)

struct SAtomBond  {
  PCAtom atom;  // bonded atom pointer
  byte  order;  // bond order
};


DefineFactoryFunctions(CAtom)

class CAtom : public CUDData  {

  friend class CResidue;
  friend class CModel;
  friend class CMMDBFile;
  friend class CMMDBCoorManager;
  friend class CMMDBSelManager;

  public :

    int        serNum;         // serial number
    AtomName   name;           // atom name (ALIGNED)
    AltLoc     altLoc;  // alternative location indicator ("" for none)
    PCResidue  residue;        // reference to residue
    realtype   x,y,z;          // orthogonal coordinates in angstroms
    realtype   occupancy;      // occupancy
    realtype   tempFactor;     // temperature factor
    SegID      segID;          // segment identifier
    Element    element;        // element symbol (ALIGNED)
    EnergyType energyType;     // energy type (without spaces)
    realtype   charge;         // charge on the atom
    realtype   sigX,sigY,sigZ; // standard deviations of the coords
    realtype   sigOcc;         // standard deviation of occupancy
    realtype   sigTemp;        // standard deviation of temp. factor
    realtype   u11,u22,u33;    // anisotropic temperature
    realtype   u12,u13,u23;    //    factors
    realtype   su11,su22,su33; // standard deviations of
    realtype   su12,su13,su23; //    anisotropic temperature factors
    Boolean    Het;            // indicator of het atom
    Boolean    Ter;            // chain terminator

    word       WhatIsSet;      //   mask      field
                        //  0x0001   atomic coordinates
                        //  0x0002   occupancy
                        //  0x0004   temperature factor
                        //  0x0010   coordinate standard deviations
                        //  0x0020   deviation of occupancy
                        //  0x0040   deviation of temperature factor
                        //  0x0100   anisotropic temperature factors
                        //  0x1000   anis. temp. fact-s st-d deviations

    CAtom ();
    CAtom ( PCResidue res    );
    CAtom ( RPCStream Object );
    ~CAtom();

    void  SetResidue   ( PCResidue   res );
    void  PDBASCIIDump ( RCFile      f   );
    void  MakeCIF      ( PCMMCIFData CIF );

    //    AddBond(...) adds a bond to the atom, that is a pointer
    //  to the bonded atom and the bond order. nAdd_bonds allows
    //  one to minimize the memory reallocations, if number of
    //  bonds is known apriori: CAtom adds space for nAdd_bonds
    //  if currently allocated space is exchausted.
    //    Return:  <=0  - error: bond_atom is already "bonded"
    //              >0  - Ok, returns current number of bonds
    int   AddBond  ( PCAtom bond_atom, int bond_order,
                                       int nAdd_bonds=1 );
    int   GetNBonds();

    //    This GetBonds(..) returns pointer to the CAtom's
    //  internal Bond structure, IT MUST NOT BE DISPOSED. 
    void  GetBonds ( RPSAtomBond AtomBond, int & nAtomBonds );
    void  FreeBonds();

    //    This GetBonds(..) disposes AtomBondI, if it was not set
    //  to NULL, allocates AtomBondI[nAtomBonds] and returns its
    //  pointer. AtomBondI MUST BE DISPOSED BY APPLICATION.
    void  GetBonds ( RPSAtomBondI AtomBondI, int & nAtomBonds );

    //    This GetBonds(..) does not dispose or allocate AtomBondI.
    //  It is assumed that length of AtomBondI is sufficient to
    //  accomodate all bonded atoms.
    void  GetBonds ( PSAtomBondI AtomBondI, int & nAtomBonds,
                     int maxlength );


    //   ConvertPDBxxxxxx() gets data from the PDB ASCII xxxxxx
    // record (xxxxxx stands for ATOM, SIGATM, ANISOU, SIGUIJ,
    // TER or HETATM).
    //   These functions DO NOT check the xxxxxx keyword and
    // do not decode the chain and residue parameters! These
    // must be treated by the calling process, see
    // CMMDBFile::ReadPDBAtom().
    //   The atom reference is updated in the corresponding
    // residue.
    int ConvertPDBATOM   ( int ix, cpstr S );
    int ConvertPDBSIGATM ( int ix, cpstr S );
    int ConvertPDBANISOU ( int ix, cpstr S );
    int ConvertPDBSIGUIJ ( int ix, cpstr S );
    int ConvertPDBTER    ( int ix, cpstr S );
    int ConvertPDBHETATM ( int ix, cpstr S );

    int GetCIF           ( int ix, PCMMCIFLoop Loop,
                           PCMMCIFLoop LoopAnis );
    Boolean MakePDBAtomName();

    void  SetAtomName    ( int            ix,      // index
                           int            sN,      // serial number
                           const AtomName aName,   // atom name
                           const AltLoc   aLoc, // alternative location
                           const SegID    sID,     // segment ID
                           const Element  eName ); // element name

    //  This only renames the atom
    void  SetAtomName    ( const AtomName atomName );
    void  SetElementName ( const Element  elName   );
    void  SetCharge      ( cpstr          chrg     );
    void  SetCharge      ( realtype       chrg     );

    void  SetAtomIndex   ( int ix ); // don't use in your applications!

    void  MakeTer();  // converts atom into 'ter'

    void  SetCoordinates ( realtype xx,  realtype yy, realtype zz,
                           realtype occ, realtype tFac );

    int   GetModelNum();
    pstr  GetChainID ();
    pstr  GetResName ();
    int   GetAASimilarity ( const ResName resName );
    int   GetAASimilarity ( PCAtom  A );
    realtype GetAAHydropathy();
    realtype GetOccupancy   ();
    int   GetSeqNum  ();
    pstr  GetInsCode ();
    pstr  GetAtomName   () { return name;    }
    pstr  GetElementName() { return element; }
    pstr  GetAtomCharge ( pstr chrg );

    Boolean isTer         () { return Ter; }
    Boolean isMetal       ();
    Boolean isSolvent     ();  // works only for atom in a residue!
    Boolean isInSelection ( int selHnd );
    Boolean isNTerminus   ();
    Boolean isCTerminus   ();

    void  CalcAtomStatistics ( RSAtomStat AS );
    realtype GetDist2 ( PCAtom a );
    realtype GetDist2 ( PCAtom a, mat44 & tm );  // tm applies to A
    realtype GetDist2 ( PCAtom a, mat33 & r, vect3 & t );// tm applies to A
    realtype GetDist2 ( realtype ax, realtype ay, realtype az );

    // GetCosine(a1,a2) calculates cosine of angle a1-this-a2,
    // i.e. that between vectors [a1,this] and [this,a2].
    realtype GetCosine ( PCAtom a1, PCAtom a2 );

    PCResidue GetResidue  ();
    PCChain   GetChain    ();
    PCModel   GetModel    ();
    int       GetResidueNo();
    void *    GetCoordHierarchy();  // PCMMDBFile

    //  GetAtomID(..) generates atom ID in the form
    //     /m/c/r(rn).i/n[e]:a
    //  where  m  - model number
    //         c  - chain ID
    //         r  - residue sequence number
    //         rn - residue name
    //         i  - insertion code
    //         n  - atom name
    //         e  - chemical element specification
    //         a  - alternate location indicator
    //  If any of the fields is undefined, it is replaced by
    //  hyphen  '-'.
    //    No checks on the sufficiency of string buffer AtomID
    //  is made.
    //    GetAtomID returns AtomID.
    pstr  GetAtomID ( pstr AtomID );

    pstr  GetAtomIDfmt ( pstr AtomID );

    // -------  checking atom ID
    // CheckID(..) returns 1 if atom is identified, and 0 otherwise.
    //   Parameters:
    //     aname   - atom name. It may or may not be aligned (as in
    //               a PDB file), only first word of the name will
    //               be taken ("CA", " CA" and " CA B" are all
    //               considered as "CA"). aname may be set to NULL
    //               or '*', then this parameter is ignored.
    //     elname  - element code. It will work only if element code
    //               is supplied (which might not be the case if
    //               the atom was created in a tricky way). elname
    //               should be used to distinguih between, e.g.
    //               "Ca" and "C_alpha"). elname may be set to NULL,
    //               or '*', then this parameter is ignored.
    //     aloc    - the alternate location code. aloc may be set to
    //               NULL or '*', then this parameter is ignored.
    //  IMPORTANT: comparison is case-sensitive.
    //  The atom is considered as identified, if all non-NULL
    //  parameters do match. If all parameters are set NULL, any atom
    //  is identified.
    //  DEFAULT values correspond to 'any element' and
    //                 'no alternate location code'
    //  NOTE that " " is not an empty item.
    int   CheckID ( const AtomName aname, const Element elname=NULL,
                    const AltLoc aloc=pstr("") );

    // CheckIDS(..) works exactly like CheckID(..), but it takes
    // the only parameter, the atom ID, which is of the form:
    //    {name} {[element]} {:altcode}
    // Here {} means that the item may be omitted. Any item may be
    // represented by a wildcard '*', which means 'any value'. Just 
    // absence of an item means 'empty', which makes sense only for
    // alternate location code. Missing name or element therefore
    // mean 'any name' or 'any element', correspondingly (same as a
    // wildcard). There should be no spaces in ID except for leading
    // spaces; any following space will terminate parsing.
    // The followings are perfectly valid IDs:
    //   CA[C]:A     (carbon C_alpha in location A)
    //   CA[*]:A     (either C_alpha or Ca in location A)
    //   CA:A        (same as above)
    //   CA          (either C_alpha or Ca with no location indicator)
    //   CA[]        (same as above)
    //   CA[C]:      (C_alpha with no location indicator)
    //   [C]         (any carbon with no location indicator)
    //   [C]:*       (any carbon with any location indicator)
    //   *[C]:*      (same as above)
    //   :A          (any atom in location A)
    //   *[*]:A      (same as above)
    //   *[*]:*      (any atom)
    //   *           (any atom with no alternate location indicator)
    int   CheckIDS ( cpstr ID );


    // -------  transform coordinates: x := m*x + v
    void  Transform     ( mat33 & tm, vect3 & v );
    void  Transform     ( mat44 & tm );
    void  TransformCopy ( mat44 & tm,
                         realtype & xx, realtype & yy, realtype & zz );
    void  TransformSet  ( mat44 & tm,
                          realtype xx, realtype yy, realtype zz );


    // -------  user-defined data handlers
    int   PutUDData ( int UDDhandle, int      iudd );
    int   PutUDData ( int UDDhandle, realtype rudd );
    int   PutUDData ( int UDDhandle, cpstr    sudd );

    int   GetUDData ( int UDDhandle, int      & iudd );
    int   GetUDData ( int UDDhandle, realtype & rudd );
    int   GetUDData ( int UDDhandle, pstr sudd, int maxLen );
    int   GetUDData ( int UDDhandle, pstr     & sudd );


    int   GetIndex()  { return index; }

    virtual void Copy ( PCAtom atom );  // without references in
                                        // residues

    void  SetShortBinary();  // leaves only coordinates in binary files
    void  write ( RCFile f );
    void  read  ( RCFile f );

  protected :
    int        index;   // index in the file
    int        nBonds;  // number of bonds in the lowest byte (!)
    PSAtomBond Bond;    // atom bonds

    void  InitAtom       ();
    void  FreeMemory     ();
    void  StandardPDBOut ( cpstr Record, pstr S );
    void  GetData        ( cpstr S );
    int   CheckData      ( cpstr S );
    void  GetStat        ( realtype   v,
                           realtype & v_min, realtype & v_max,
                           realtype & v_m,   realtype & v_m2 );
    void  _setBonds ( PPCAtom A ); // used only in CResidue

};


//  ======================  CResidue  ==========================

#define ALF_NoAltCodes    0x00000000
#define ALF_EmptyAltLoc   0x00000001
#define ALF_NoEmptyAltLoc 0x00000002
#define ALF_Mess          0x00000004
#define ALF_Occupancy     0x00000008

#define SSE_None          0
#define SSE_Strand        1
#define SSE_Bulge         2
#define SSE_3Turn         3
#define SSE_4Turn         4
#define SSE_5Turn         5
#define SSE_Helix         6


DefineFactoryFunctions(CResidue)

class CResidue : public CUDData  {

  friend class CAtom;
  friend class CChain;
  friend class CMMDBFile;

  public :

    ResName  name;     // residue name - all spaces cut
    int      seqNum;   // residue sequence number
    InsCode  insCode;  // residue insertion code
    PCChain  chain;    // reference to chain
    int      index;    // index in the chain
    int      nAtoms;   // number of atoms in the residue
    PPCAtom  atom;     // array of atoms
    byte     SSE;      // SSE type
    
    CResidue ();
    CResidue ( PCChain Chain_Owner );
    CResidue ( PCChain Chain_Owner, const ResName resName,
               int     sqNum,       const InsCode ins );
    CResidue ( RPCStream Object    );
    ~CResidue();

    void  SetChain ( PCChain Chain_Owner );
    void  SetResID ( const ResName resName, int sqNum,
                     const InsCode ins );
    void  SetChainID ( const ChainID chID );

    void  PDBASCIIAtomDump ( RCFile f        );
    void  MakeAtomCIF      ( PCMMCIFData CIF );

    PCChain GetChain();
    PCModel GetModel();

    int   GetModelNum ();
    pstr  GetChainID  ();
    pstr  GetResName  ();
    int   GetAASimilarity ( const ResName resName );
    int   GetAASimilarity ( PCResidue res );
    realtype GetAAHydropathy();
    void  SetResName  ( const ResName resName );
    int   GetSeqNum   ();
    pstr  GetInsCode  ();
    int   GetResidueNo();
    int   GetCenter   ( realtype & x, realtype & y, realtype & z );
    void * GetCoordHierarchy();  // PCMMDBFile

    void  GetAtomStatistics  ( RSAtomStat AS );
    void  CalcAtomStatistics ( RSAtomStat AS );

    pstr  GetResidueID ( pstr ResidueID );

    //   GetAltLocations(..) returns the number of different
    // alternative locations in nAltLocs, the locations themselves
    // - in aLoc and the corresponding occupancies - in occupancy.
    //   aLoc and occupancy are allocated dynamically; it is
    // responsibility of the application to deallocate aLoc prior
    // calling GetAltLocations(..) if they were previously allocated.
    // Either, the application is responsible for deallocating aLoc and
    // occupancy after use.
    //   occupancy[i] may return -1.0 if occupancies were not read
    // from coordinate file.
    //   alflag returns ALF_NoAltCodes if no alt codes was found,
    // otherwise the output is decoded according to bits:
    //   ALF_EmptyAltLoc   alternative locations include the
    //                     "no alt loc indicator" ("" for
    //                     CAtom::altLoc).
    //                     This means that each atom that has alt locs
    //                     different of "", also includes one marked as
    //                     "".
    //  ALF_NoEmptyAltLoc  alternative locations do not include the
    //                     "no alt loc indicator" ("" for
    //                     CAtom::altLoc).
    //                     This means that each atom has either ""
    //                     alt loc or at least two alt locs different
    //                     of "".
    //  ALF_Mess           incorrect residue: it mixes both
    //                     ""-including and not-""-including schemes
    //  ALF_Occupancy      warning that sum of occupancies for alt
    //                     located atoms differ from 1.0 by more
    //                     than 0.01.
    void  GetAltLocations   ( int & nAltLocs, PAltLoc & aLoc,
                              rvector & occupancy, int & alflag );
    int   GetNofAltLocations();

    Boolean isAminoacid   ();
    Boolean isNucleotide  ();
    int     isDNARNA      (); // 0(neither),1(DNA),2(RNA)
    Boolean isSugar       ();
    Boolean isSolvent     ();
    Boolean isModRes      ();
    Boolean isInSelection ( int selHnd );
    Boolean isNTerminus   ();
    Boolean isCTerminus   ();

    // -------  checking residue ID
    // CheckID(..) returns 1 if residue is identified, and 0 otherwise.
    //   Parameters:
    //     sname   - pointer to sequence number; if NULL then ignored.
    //     inscode - insertion code; if NULL or '*' then ignored.
    //     resname - residue name; if NULL or '*' then ignored.
    //  IMPORTANT: comparison is case-sensitive.
    //  The residue is considered as identified, if all non-NULL
    //  parameters do match. If all parameters are set NULL, any
    //  residue is identified.
    //  DEFAULT values correspond to 'any residue name' and
    //                 'no insertion code'
    //  NOTE that " " is not an empty item.
    int   CheckID ( int * snum, const InsCode inscode=pstr(""),
                    const ResName resname=NULL );

    // CheckIDS(..) works exactly like CheckID(..), but it takes
    // the only parameter, the residue ID, which is of the form:
    //    {seqnum} {(name)} {.inscode}
    // Here {} means that the item may be omitted. Any item may be
    // represented by a wildcard '*', which means 'any value'. Just
    // absence of a value means 'empty', which is meaningful only for
    // the insertion code. Missing sequence number or residue name
    // therefore mean 'any sequence number' or 'any residue name',
    // correspondingly (same as a wildcard).  There should be no
    // spaces in ID except for leading spaces; any following space will
    // terminate parsing. The followings are perfectly valid IDs:
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
    int  CheckIDS ( cpstr ID );


    //  --------------------  Extracting atoms  ----------------------

    int  GetNumberOfAtoms ();
    int  GetNumberOfAtoms ( Boolean countTers );

    PCAtom GetAtom ( const AtomName aname, const Element elname=NULL,
                     const AltLoc aloc=cpstr("") );
    PCAtom GetAtom ( int atomNo );

    void GetAtomTable  ( PPCAtom & atomTable, int & NumberOfAtoms );

    //   GetAtomTable1(..) returns atom table without TER atoms and
    // without NULL atom pointers. NumberOfAtoms returns the actual
    // number of atom pointers in atomTable.
    //   atomTable is allocated withing the function. If it was
    // not set to NULL before calling the function, the latter will
    // attempt to deallocate it first.
    //   The application is responsible for deleting atomTable,
    // however it must not touch atom pointers, i.e. use simply
    // "delete[] atomTable;". Never pass atomTable from GetAtomTable()
    // into this function, unless you set it to NULL before doing that.
    void GetAtomTable1 ( PPCAtom & atomTable, int & NumberOfAtoms );


    //  ---------------------  Deleting atoms  -----------------------

    int  DeleteAtom ( const AtomName aname, const Element elname=NULL,
                      const AltLoc aloc=cpstr("") );
    int  DeleteAtom ( int atomNo );
    int  DeleteAllAtoms();

    //   DeleteAltLocs() leaves only alternative location with maximal
    // occupancy, if those are equal or unspecified, the one with
    // "least" alternative location indicator.
    //   The function returns the number of deleted atoms. The atom
    // table remains untrimmed, so that nAtoms are wrong until that
    // is done. Tables are trimmed by FinishStructEdit() or
    // explicitely.
    int  DeleteAltLocs ();

    void TrimAtomTable ();

    //  ----------------------  Adding atoms  ------------------------

    //   AddAtom(..) adds atom to the residue. If residue is associated
    // with a coordinate hierarchy, and atom 'atm' is not, the latter
    // is checked in automatically. If atom 'atm' belongs to any
    // coordinate hierarchy (even though that of the residue), it is
    // *copied* rather than simply taken over, and is checked in.
    //   If residue is not associated with a coordinate hierarchy, all
    // added atoms will be checked in automatically once the residue
    // is checked in.
    int  AddAtom ( PCAtom atm );

    //   InsertAtom(..) inserts atom into the specified position of
    // the residue. If residue is associated with a coordinate
    // hierarchy, and atom 'atm' is not, the latter is checked in
    // automatically. If atom 'atm' belongs to any coordinate
    // hierarchy (even though that of the residue), it is *copied*
    // rather than simply taken over, and is checked in.
    //   If residue is not associated with a coordinate hierarchy, all
    // added atoms will be checked in automatically once the residue
    // is checked in.
    int  InsertAtom ( PCAtom atm, int position );

    //   This version inserts before the atom with given name. If such
    // name is not found, the atom is appended to the end.
    int  InsertAtom ( PCAtom atm, const AtomName aname );

    //  --------------------------------------------------------------

    void  ApplyTransform ( mat44 & TMatrix );  // transforms all
                                               // coordinates by
                                               // multiplying with
                                               // matrix TMatrix

    void  MaskAtoms   ( PCMask Mask );
    void  UnmaskAtoms ( PCMask Mask );


    // -------  user-defined data handlers
    int   PutUDData ( int UDDhandle, int      iudd );
    int   PutUDData ( int UDDhandle, realtype rudd );
    int   PutUDData ( int UDDhandle, cpstr    sudd );

    int   GetUDData ( int UDDhandle, int      & iudd );
    int   GetUDData ( int UDDhandle, realtype & rudd );
    int   GetUDData ( int UDDhandle, pstr sudd, int maxLen );
    int   GetUDData ( int UDDhandle, pstr     & sudd );


    Boolean isMainchainHBond ( PCResidue res );

    void  Copy  ( PCResidue res );

    void  write ( RCFile f );
    void  read  ( RCFile f );

  protected :

    int      AtmLen;   // length of atom array
    Boolean  Exclude;  // used internally
    
    void  InitResidue  ();
    void  FreeMemory   ();
    int   _AddAtom     ( PCAtom atm );
    int   _ExcludeAtom ( int  kndex );  // 1: residue gets empty,
                                        // 0 otherwise
    void  _copy ( PCResidue res );
    void  _copy ( PCResidue res, PPCAtom atm, int & atom_index );
    void  ExpandAtomArray ( int nAdd );
    void  CheckInAtoms ();

};


extern realtype  BondAngle ( PCAtom A, PCAtom B, PCAtom C );


#endif

