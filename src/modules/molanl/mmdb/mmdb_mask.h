//  $Id: mmdb_mask.h,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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
//  **** Module  :   MMDBF_Mask <interface>
//       ~~~~~~~~~
//  **** Project :   MacroMolecular Data Base (MMDB)
//       ~~~~~~~~~
//
//  **** Classes :   CMask  ( atom selection mask )
//       ~~~~~~~~~
//
//  (C) E. Krissinel 2000-2008
//
//  =================================================================
//

#ifndef __MMDB_Mask__
#define __MMDB_Mask__


#ifndef __Stream__
#include "stream_.h"
#endif



//  ====================  CMask  ========================

DefineClass(CMask)
DefineStreamFunctions(CMask)

class CMask : public CStream  {

  public :

    CMask ();
    CMask ( RPCStream Object );
    ~CMask();

    void SetMaskBit ( int   BitNo );
    void NewMask    ( PPCMask Mask, int nMasks );

    void CopyMask   ( PCMask Mask );   //  this = Mask
    void SetMask    ( PCMask Mask );   //  this = this | Mask
    void RemoveMask ( PCMask Mask );   //  this = this & (~Mask)
    void SelMask    ( PCMask Mask );   //  this = this & Mask
    void XadMask    ( PCMask Mask );   //  this = this ^ Mask
    void ClearMask  ();                //  this = NULL
    void NegMask    ();                //  this = ~this

    Boolean CheckMask ( PCMask Mask ); //  True if the bit is on
    Boolean isMask    ();              // true if any mask bit is on

    pstr Print ( pstr S ); // returns binary string

    void write ( RCFile f );
    void read  ( RCFile f );

  protected :
    int     mlen;
    wvector m;

    void InitMask();
    void Expand  ( int n );

};


#endif

