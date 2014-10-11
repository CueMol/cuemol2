//  $Id: mmdb_uddata.h,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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
//  **** Module  :   MMDBF_UDData <interface>
//       ~~~~~~~~~
//  **** Project :   MacroMolecular Data Base (MMDB)
//       ~~~~~~~~~
//
//  **** Classes :   CUDData ( user-defined data )
//       ~~~~~~~~~
//
//   (C) E. Krissinel 2000-2008
//
//  =================================================================
//

#ifndef __MMDB_UDData__
#define __MMDB_UDData__


#ifndef __MMDB_Mask__
#include "mmdb_mask.h"
#endif



//  ========================  CUDRegister  ==========================

#define UDR_ATOM       0
#define UDR_RESIDUE    1
#define UDR_CHAIN      2
#define UDR_MODEL      3
#define UDR_HIERARCHY  4

#define UDRF_ATOM       0x01000000
#define UDRF_RESIDUE    0x02000000
#define UDRF_CHAIN      0x04000000
#define UDRF_MODEL      0x08000000
#define UDRF_HIERARCHY  0x10000000
#define UDRF_MASK       0x00FFFFFF


DefineClass(CUDRegister)
DefineStreamFunctions(CUDRegister)

class CUDRegister : public CStream  {

  public :

    CUDRegister ();
    CUDRegister ( RPCStream Object );
    ~CUDRegister();

    int RegisterUDInteger ( int udr_type, cpstr UDDataID );
    int RegisterUDReal    ( int udr_type, cpstr UDDataID );
    int RegisterUDString  ( int udr_type, cpstr UDDataID );
    int GetUDDHandle      ( int udr_type, cpstr UDDataID );

    void write ( RCFile f );
    void read  ( RCFile f );

  protected :
    int      nIUDR[5],nRUDR[5],nSUDR[5];
    psvector IUDRegister[5];
    psvector RUDRegister[5];
    psvector SUDRegister[5];

    void  InitUDRegister ();
    void  FreeUDRegister ();
    int   RegisterUDData ( psvector & UDRegister,
                           int      & nUDR,
                           cpstr      UDDataID );

};


//  ==========================  CUDData  ============================


#define UDDATA_Ok             0
#define UDDATA_WrongHandle   -1
#define UDDATA_WrongUDRType  -2
#define UDDATA_NoData        -3

DefineClass(CUDData)
DefineStreamFunctions(CUDData)

class CUDData : public CMask  {

  friend class CMMDBSelManager;

  public :

    CUDData ();
    CUDData ( RPCStream Object );
    ~CUDData();

  protected :
    ivector  IUData;
    rvector  RUData;
    psvector SUData;

    void  InitUDData   ();
    void  FreeUDDMemory();
    int   getNofIUData ();
    int   getNofRUData ();
    int   getNofSUData ();
    void  setNofSUData ( int newN );

    int   putUDData ( int UDDhandle, int      iudd );
    int   putUDData ( int UDDhandle, realtype rudd );
    int   putUDData ( int UDDhandle, cpstr    sudd );

    int   getUDData ( int UDDhandle, int      & iudd );
    int   getUDData ( int UDDhandle, realtype & rudd );
    int   getUDData ( int UDDhandle, pstr sudd, int maxLen );
    pstr  getUDData ( int UDDhandle, int * retcode=NULL );
    int   getUDData ( int UDDhandle, pstr     & sudd );

    void  write ( RCFile f );
    void  read  ( RCFile f );

};


#endif

