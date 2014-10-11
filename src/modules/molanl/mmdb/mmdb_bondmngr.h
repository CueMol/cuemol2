//  $Id: mmdb_bondmngr.h,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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
//    17.11.00   <--  Date of Last Modification.
//                   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//  -----------------------------------------------------------------
//
//  **** Module  :  mmdb_bondmngr <interface>
//       ~~~~~~~~~
//       Project :  MacroMolecular Data Base (MMDB)
//       ~~~~~~~~~
//  **** Classes :  CMMDBBondManager ( MMDB bonds maker )
//       ~~~~~~~~~
//
//  (C) E. Krissinel 2000-2008
//
//  =================================================================
//

#ifndef __MMDB_BondMngr__
#define __MMDB_BondMngr__

#ifndef  __MMDB_SelMngr__
#include "mmdb_selmngr.h"
#endif


// =======================  CMMDBBondManager  =======================


DefineClass(CMMDBBondManager)
DefineStreamFunctions(CMMDBBondManager)

class CMMDBBondManager : public CMMDBSelManager  {

  public :

    CMMDBBondManager ();
    CMMDBBondManager ( RPCStream Object );
    ~CMMDBBondManager();

    void  MakeBonds  ( Boolean calc_only );
    void  RemoveBonds();

  protected :
    void  write ( RCFile f );
    void  read  ( RCFile f );

};

#endif

