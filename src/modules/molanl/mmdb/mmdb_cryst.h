//  $Id: mmdb_cryst.h,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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
//  **** Module  :  MMDB_Cryst <interface>
//       ~~~~~~~~~
//  **** Project :  MacroMolecular Data Base (MMDB)
//       ~~~~~~~~~
//  **** Classes :  CCrystContainer ( container for cryst. data     )
//       ~~~~~~~~~  CNCSMatrix      ( non-cryst. symm. matrix class )
//                  CTVect          ( translation vector class      )
//                  CMMDBCryst      ( MMDB cryst. section class     )
//
//  (C) E. Krissinel 2000-2008
//
//  =================================================================
//

#ifndef __MMDB_Cryst__
#define __MMDB_Cryst__


#ifndef __Stream__
#include "stream_.h"
#endif

#ifndef  __MMDB_SymOp__
#include "mmdb_symop.h"
#endif

#ifndef  __MMDB_Defs__
#include "mmdb_defs.h"
#endif

#ifndef  __MMDB_Utils__
#include "mmdb_utils.h"
#endif


//  ====================  CCrystContainer  ======================

DefineClass(CCrystContainer)
DefineStreamFunctions(CCrystContainer)

class CCrystContainer : public CClassContainer  {

  public :

    CCrystContainer () : CClassContainer() {}
    CCrystContainer ( RPCStream Object )
                       : CClassContainer ( Object ) {} 
    ~CCrystContainer() {}

    PCContainerClass MakeContainerClass ( int ClassID );

    int AddMTRIXLine ( cpstr S );

};


//  ==================  CNCSMatrix  ========================

#define NCSMSET_Matrix1  0x00000001
#define NCSMSET_Matrix2  0x00000002
#define NCSMSET_Matrix3  0x00000004
#define NCSMSET_All      0x00000007

DefineClass(CNCSMatrix)
DefineStreamFunctions(CNCSMatrix)

class CNCSMatrix : public CContainerClass  {

  friend class CMMDBCryst;

  public :

    int   serNum;   // serial number
    mat33 m;        // non-crystallographic symmetry matrix
    vect3 v;        // translational part of ncs matrix
    int   iGiven;   // iGiven flag (see PDB format)

    CNCSMatrix ();
    CNCSMatrix ( cpstr S );
    CNCSMatrix ( RPCStream Object );
    ~CNCSMatrix();

    Boolean PDBASCIIDump1   ( RCFile f );
    int     ConvertPDBASCII ( cpstr S );
    void    MakeCIF         ( PCMMCIFData CIF, int N );
    void    GetCIF          ( PCMMCIFData CIF, int & Signal );
    
    int     GetClassID      () { return ClassID_NCSMatrix; }

    void    SetNCSMatrix    ( int serialNum,
                              mat33 & ncs_m, vect3 & ncs_v,
                              int i_Given );

    void  Copy  ( PCContainerClass NCSMatrix );

    void  write ( RCFile f );
    void  read  ( RCFile f );

  protected :
    word  WhatIsSet;  //    mask       field
                      //   0x0001    MTRIX1 was converted
                      //   0x0002    MTRIX2 was converted
                      //   0x0004    MTRIX3 was converted
    
    void  Init();

};


//  ==================  CTVect  ========================

DefineClass(CTVect)
DefineStreamFunctions(CTVect)

class CTVect : public CContainerClass  {

  public :

    int   serNum;   // serial number
    vect3 t;        // translation vector
    pstr  comment;  // comment

    CTVect ();
    CTVect ( cpstr S );
    CTVect ( RPCStream Object );
    ~CTVect();

    void  PDBASCIIDump    ( pstr S, int N );
    int   ConvertPDBASCII ( cpstr S );
    void  MakeCIF         ( PCMMCIFData CIF, int N );
    void  GetCIF          ( PCMMCIFData CIF, int & Signal );
    int   GetClassID      () { return ClassID_TVect; }

    void  Copy  ( PCContainerClass TVect );

    void  write ( RCFile f );
    void  read  ( RCFile f );

  protected :
    
    void  Init();

};


//  =================  CMMDBCryst  =======================

DefineClass(CMMDBCryst)
DefineStreamFunctions(CMMDBCryst)

// constants for the CellCheck field
#define CCHK_Ok            0x00000000
#define CCHK_NoCell        0x00000001
#define CCHK_Error         0x00000002
#define CCHK_Disagreement  0x00000004
#define CCHK_NoOrthCode    0x00000008
#define CCHK_Translations  0x00000010
#define CCHK_Unchecked     0x00001000

// constants for the WhatIsSet field
#define CSET_CellParams1   0x00000001
#define CSET_CellParams2   0x00000002
#define CSET_CellParams    0x00000003
#define CSET_SpaceGroup    0x00000004
#define CSET_ZValue        0x00000008
#define CSET_CrystCard     0x0000000F
#define CSET_OrigMatrix1   0x00000010
#define CSET_OrigMatrix2   0x00000020
#define CSET_OrigMatrix3   0x00000040
#define CSET_OrigMatrix    0x00000070
#define CSET_ScaleMatrix1  0x00000080
#define CSET_ScaleMatrix2  0x00000100
#define CSET_ScaleMatrix3  0x00000200
#define CSET_ScaleMatrix   0x00000380
#define CSET_Transforms    0x00000400
#define CSET_DummyCell     0x00001000

extern cpstr OrthCode[6];

class CMMDBCryst : public CStream  {

  friend class CChannel;

  public :

    realtype  a,b,c;            // cell parameters
    realtype  alpha,beta,gamma; // cell parameters
    mat44     RO,RF;            // orthogonal-fractional recalculation
                                //   matrices
    mat44     ROU,RFU;          // ort-frac recalc matrices for
                                //   anisotr. t-fac
    mat633    RR;               // standard orthogonalizations
    realtype  Vol;              // cell volume
    int       NCode;            // code of orthogonalization matrix
    SymGroup  spaceGroup;       // group of space symmetry as read
                                //    from file
    SymGroup  spaceGroupFix;    // actually used space group
    int       Z;                // Z-value

    mat33     o;                // orthogonal transformation matrix
    vect3     t;                // translation orthogonal vector 
    mat33     s;                // scale matrix
    vect3     u;                // translation part of the scale matrix

    word      CellCheck;        // 0x0000 - Ok
                                // 0x0001 - no cell stored
                                // 0x0002 - some error in cell volume
                                // 0x0004 - disagreement between
                                //           cell and PDB
                                // 0x0008 - no orth code derived
                                // 0x0010 - translations also specified
                                // 0x1000 - the check was not done
    word      WhatIsSet;        // indicator of the fields set
    Boolean   ignoreScalei;     // flag to ignore SCALEi cards

    CMMDBCryst ();
    CMMDBCryst ( RPCStream Object );
    ~CMMDBCryst();

    void  FreeMemory();
    void  Reset     ();

    //   ConvertPDBString(..) interprets an ASCII PDB line and fills
    // the corresponding data fields. It returns zero if the line was
    // successfully converted, otherwise returns a non-negative value
    // of Error_XXXX.
    //   PDBString must be not shorter than 81 characters.
    int   ConvertPDBString ( pstr PDBString, Boolean fixSpaceGroup );

    //   RWBROOKReadPrintout() may be invoked after reading PDB file
    // for simulating the old RWBROOK messages and warnings
    void  RWBROOKReadPrintout();

    void  SetCell ( realtype cell_a,
                    realtype cell_b,
                    realtype cell_c,
                    realtype cell_alpha,
                    realtype cell_beta,
                    realtype cell_gamma,
                    int      OrthCode );
    void  PutCell ( realtype cell_a,
                    realtype cell_b,
                    realtype cell_c,
                    realtype cell_alpha,
                    realtype cell_beta,
                    realtype cell_gamma,
                    int      OrthCode );

    void  GetCell ( realtype & cell_a,
                    realtype & cell_b,
                    realtype & cell_c,
                    realtype & cell_alpha,
                    realtype & cell_beta,
                    realtype & cell_gamma,
                    realtype & vol );

    void  GetRCell ( realtype & cell_as,
                     realtype & cell_bs,
                     realtype & cell_cs,
                     realtype & cell_alphas,
                     realtype & cell_betas,
                     realtype & cell_gammas,
                     realtype & vols );

    void  SetSyminfoLib ( cpstr syminfoLib );
    pstr  GetSyminfoLib ();

    int   SetSpaceGroup ( cpstr spGroup );
    pstr  GetSpaceGroup ();
    pstr  GetSpaceGroupFix();

    //   CalcCoordTransforms() should be called once after all data
    // relevant to the crystallographic information, are read and
    // converted. Field CellCheck will then have bits set if there
    // are errors, e.g. bit CCHK_NoCell means that the coordinate
    // transformations cannot be performed.
    void  CalcCoordTransforms();

    // A PDB ASCII dump
    void  PDBASCIIDump ( RCFile f );

    int   GetCIF  ( PCMMCIFData CIF, Boolean fixSpaceGroup );
    void  MakeCIF ( PCMMCIFData CIF );

    Boolean areMatrices();  // returns True if the orthogonal-to-
                            // fractional and fractional-to-orthogonal
                            // matrices are defined

    //   Frac2Orth(..) and Orth2Frac(..) transform between fractional
    // and orthogonal coordinates, if areMatrices() returns True.
    // If the transformation matrices were not set, the functions just
    // copy the coordinates.  Returns True if the transformation was
    // done; False return means that transformation matrices were not
    // calculated
    Boolean Frac2Orth (
              realtype x,    realtype y,    realtype z,
              realtype & xx, realtype & yy, realtype & zz );
    Boolean Orth2Frac (
              realtype x,    realtype y,    realtype z,
              realtype & xx, realtype & yy, realtype & zz );

    //   Below, F and T are transformation matrices in fractional and
    // orthogonal coordinates, respectively.
    Boolean Frac2Orth ( mat44 & F, mat44 & T );
    Boolean Orth2Frac ( mat44 & T, mat44 & F );


    //   Cryst2Orth(..) and Orth2Cryst(..) transform between fractional
    // and orthogonal anisotropic temperature factors, if areMatrices()
    // returns True. If the transformation matrices were not set, the
    // functions leave the factors unchanged.
    //   Vector U is composed as follows:
    //      U[0]=u11   U[1]=u22   U[2]=u33
    //      U[3]=u12   U[4]=u13   U[5]=u23
    // Returns True if the transformation was done; False retuen
    // means that transformation matrices were not calculated
    Boolean Cryst2Orth ( rvector U );
    Boolean Orth2Cryst ( rvector U );

    void  CalcOrthMatrices();  // calculates RR, AC, cella's and Vol

    Boolean  isNCSMatrix     ();
    Boolean  isScaleMatrix   ();
    Boolean  isCellParameters();

    int      GetNumberOfSymOps();
    pstr     GetSymOp ( int Nop );

    int      GetNumberOfNCSMatrices();
    int      GetNumberOfNCSMates   ();  // Returns the number of
                                        // NCS mates not given in
                                        // the file (iGiven==0)

    Boolean  GetNCSMatrix ( int NCSMatrixNo, mat33 & ncs_m,
                            vect3 & ncs_v );
    Boolean  GetNCSMatrix ( int NCSMatrixNo, mat44 & ncs_m,
                            int & iGiven ); // no=0..N-1
    int      AddNCSMatrix ( mat33 & ncs_m, vect3 & ncs_v, int iGiven );

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
    int   GetTMatrix ( mat44 & TMatrix, int Nop,
                       int cellshift_a, int cellshift_b,
                       int cellshift_c, PCSymOps symOpers=NULL );

    //  GetUCTMatrix(..) calculates and returns the coordinate
    //  transformation matrix, which converts orthogonal coordinates
    //  according to the symmetry operation Nop. Translation part
    //  of the matrix is  being chosen such that point (x,y,z) has
    //  least distance to the center of primary (333) unit cell,
    //  and then it is shifted by cellshift_a a's, cellshift_b b's
    //  and cellshift_c c's.
    //
    //  Return 0 means everything's fine,
    //         1 there's no symmetry operation Nop defined
    //         2 fractionalizing/orthogonalizing matrices were not
    //           calculated
    //         3 cell parameters were not set up.
    //
    int   GetUCTMatrix ( mat44 & TMatrix, int Nop,
                         realtype x, realtype y, realtype z,
                         int cellshift_a, int cellshift_b,
                         int cellshift_c, PCSymOps symOpers=NULL );

    //  GetFractMatrix(..) calculates and returns the coordinate
    //  transformation matrix, which converts fractional coordinates
    //  according to the symmetry operation number Nop and places them
    //  into unit cell shifted by cellshift_a a's, cellshift_b b's and
    //  cellshift_c c's.
    //
    //  Return 0 means everything's fine,
    //         1 there's no symmetry operation Nop defined
    //         2 fractionalizing/orthogonalizing matrices were not
    //           calculated
    //         3 cell parameters were not set up.
    int   GetFractMatrix ( mat44 & TMatrix, int Nop,
                           int cellshift_a, int cellshift_b,
                           int cellshift_c, PCSymOps symOpers=NULL );

    //  GetSymOpMatrix(..) returns the transformation matrix for
    //  Nop-th symmetry operator in the space group
    //
    //  Return 0 means everything's fine,
    //         1 there's no symmetry operation Nop defined
    //         2 fractionalizing/orthogonalizing matrices were not
    //           calculated
    //         3 cell parameters were not set up.
    //
    int   GetSymOpMatrix ( mat44 & TMatrix, int Nop );

    void  Copy  ( PCMMDBCryst Cryst );

    void  write ( RCFile f );    // writes header to PDB binary file
    void  read  ( RCFile f );    // reads header from PDB binary file

  protected :

    CCrystContainer NCSMatrix;      // non-cryst. symm. matrices
    CCrystContainer TVect;          // translation vectors

    realtype  as,bs,cs;             // calculated 'cell parameters'
    realtype  alphas,betas,gammas;  // calculated 'cell parameters'
    realtype  AC[6];
    realtype  VolChk,VolErr;

    pstr      syminfo_lib;          // path to syminfo.lib
    CSymOps   SymOps;               // symmetry operations

    void  Init ( Boolean fullInit );
    int   FixSpaceGroup();

};

extern cpstr getOrthCodeName ( int NCode );

/*
extern void  TestCryst();  //  reads from 'in.cryst', writes into 
                           //  'out.cryst' and 'abin.cryst'
*/

#endif

