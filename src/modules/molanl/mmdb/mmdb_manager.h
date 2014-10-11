//  $Id: mmdb_manager.h,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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
//  **** Module  :  mmdb_manager <interface>
//       ~~~~~~~~~
//       Project :  MacroMolecular Data Base (MMDB)
//       ~~~~~~~~~
//  **** Classes :  CMMDBManager  ( MMDB file manager )
//       ~~~~~~~~~
//
//  (C) E. Krissinel 2000-2009
//
//  =================================================================
//

#ifndef __MMDB_Manager__
#define __MMDB_Manager__

#ifndef  __MMDB_BondMngr__
#include "mmdb_bondmngr.h"
#endif


// =======================  CMMDBManager  ===========================


// copy masks
#define MMDBFCM_All            0xFFFFFFFF
#define MMDBFCM_Title          0x00000001
#define MMDBFCM_TitleKeepBM    0x00000002
#define MMDBFCM_Cryst          0x00000004
#define MMDBFCM_Coord          0x00000008
#define MMDBFCM_SecStruct      0x00000010
#define MMDBFCM_HetInfo        0x00000020
#define MMDBFCM_Links          0x00000040
#define MMDBFCM_CisPeps        0x00000080
#define MMDBFCM_SA             0x00000100
#define MMDBFCM_SB             0x00000200
#define MMDBFCM_SC             0x00000400
#define MMDBFCM_Footnotes      0x00000800
#define MMDBFCM_ChainAnnot     0x00001000
#define MMDBFCM_Flags          0x00002000
#define MMDBFCM_Buffer         0x80000000
#define MMDBFCM_Top            0xFFFFFFF7

DefineStreamFunctions(CMMDBManager)

class CMMDBManager : public CMMDBBondManager  {

  public :

    CMMDBManager ();
    CMMDBManager ( RPCStream Object );
    ~CMMDBManager();


    //  ---------------  Copying/Deleting  -----------------------

    //   Copy(..) will transfer different sort of information
    // between two MMDB's according to the copy mask given
    // (cf. MMDBFCM_XXXXX values). Note that the copying content
    // replaces the corresponding information (e.g. copying
    // coordinates will replace existing coordinates rather than
    // add to them).
    void  Copy   ( PCMMDBManager MMDB, word CopyMask );

    //   Delete(..) deletes different sort of information from
    // the MMDB according to the delete mask given.
    void  Delete ( word DelMask );  // DelMask is the same as CopyMask

    PCTitleContainer GetRemarks();

    realtype GetResolution(); // -1.0 means no resolution record in file

    int   ParseBiomolecules(); // returns the number of biomolecules,
                               // -2 for general format error
                               // -3 for errors in BIOMT records
    int   GetNofBiomolecules();
    void  GetBiomolecules   ( PPCBiomolecule & BM, int & nBMs );

    PCBiomolecule GetBiomolecule ( int bmNo ); // bmno=0,1,..
                               // returns NULL if bmNo is incorrect
    PCMMDBManager MakeBiomolecule ( int bmNo, int modelNo=1 );

  protected :

    //  ---------------  Stream I/O  -----------------------------
    void  write  ( RCFile f );
    void  read   ( RCFile f );

};

#endif

