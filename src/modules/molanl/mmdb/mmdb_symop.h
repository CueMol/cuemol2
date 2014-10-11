//  $Id: mmdb_symop.h,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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
//  **** Module  :   MMDB_SymOp <interface>
//       ~~~~~~~~~
//  **** Project :   MacroMolecular Data Base (MMDB)
//       ~~~~~~~~~
//
//  **** Classes :   CSymOp  ( symmetry operators )
//       ~~~~~~~~~   CSymOps ( container of symmetry operators )
//
//   (C) E. Krissinel 2000-2008
//
//  =================================================================
//

#ifndef __MMDB_SymOp__
#define __MMDB_SymOp__


#ifndef __Stream__
#include "stream_.h"
#endif

#ifndef __MMDB_Defs__
#include "mmdb_defs.h"
#endif



//  ====================  CSymOp  ========================

DefineClass(CSymOp)
DefineStreamFunctions(CSymOp)

class CSymOp : public CStream  {

  public :

    CSymOp ();
    CSymOp ( RPCStream Object );
    ~CSymOp();

    int     SetSymOp  ( cpstr XYZOperation );
    pstr    GetSymOp  ();

    void    Transform ( realtype & x, realtype & y, realtype & z );

    void    GetTMatrix ( mat44 & TMatrix );  // copies T to TMatrix
    void    SetTMatrix ( mat44 & TMatrix );  // copies TMatrix to T

    Boolean CompileOpTitle ( pstr S );  // makes XYZOp from matrix T
    Boolean CompileOpTitle ( pstr S, mat44 symMat, Boolean compare );
    void    Print          ();          // prints operation and matrix

    void Copy  ( PCSymOp SymOp );

    void write ( RCFile f );
    void read  ( RCFile f );

  protected :

    pstr  XYZOp;
    mat44 T;

    void InitSymOp    ();
    void FreeMemory   ();
    int  GetOperation ( int n );

};


//  ====================  CSymOps  ========================

#define SYMOP_Ok                   0
#define SYMOP_NoLibFile           -1
#define SYMOP_UnknownSpaceGroup   -2
#define SYMOP_NoSymOps            -3
#define SYMOP_WrongSyntax         -4
#define SYMOP_NotAnOperation      -5
#define SYMOP_ZeroDenominator     -6


DefineClass(CSymOps)
DefineStreamFunctions(CSymOps)

class CSymOps : public CStream  {

  public :

    CSymOps ();
    CSymOps ( RPCStream Object );
    ~CSymOps();

    virtual void FreeMemory();

    int  SetGroupSymopLib ( cpstr SpaceGroup,
                            cpstr symop_lib=NULL );
      // Space Group is taken from symop.lib. Return Code:
      // SYMOP_Ok <=> success

    int  SetGroup ( cpstr SpaceGroup,
                    cpstr syminfo_lib=NULL );
      // Space Group is taken from syminfo.lib. Return Code:
      // SYMOP_Ok <=> success

    void Reset           ();        // removes all symmetry operations
    virtual int AddSymOp ( cpstr XYZOperation ); // adds a sym.
                                                      // operation
    void PutGroupName    ( cpstr SpGroupName  );

    //  GetNofSymOps()  returns Nops -- the number of sym. operations
    int  GetNofSymOps ();
    pstr GetSymOp     ( int Nop );

    //  Transform(..) transforms the coordinates according to the
    // symmetry operation Nop. The return code is non-zero if
    // Nop is a wrong operation number (must range from 0 to Nops-1).
    int  Transform ( realtype & x, realtype & y, realtype & z,
                     int Nop );

    //  GetTMatrix(..) returns the coordinate transformation matrix
    // for the symmetry operation Nop. The return code is non-zero if
    // Nop is a wrong operation number (must range from 0 to Nops-1).
    int  GetTMatrix ( mat44 & TMatrix, int Nop );

    void Print ();

    virtual void Copy ( PCSymOps SymOps );

    void write ( RCFile f );
    void read  ( RCFile f );

  protected :

    pstr     SpGroup;
    int      Nops;
    PPCSymOp SymOp;

    void InitSymOps();

};


// extern void TestSymOps();

#endif

