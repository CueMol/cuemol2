//  $Id: mmdb_tables.h,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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
//  **** Module  :   MMDBF_Tables <interface>
//       ~~~~~~~~~
//  **** Project :   MacroMolecular Data Base (MMDB)
//       ~~~~~~~~~
//
//  **** Functions : 
//       ~~~~~~~~~~~ 
//
//  **** Constants : AName  ( array of 2-character atom names       )
//       ~~~~~~~~~~~ HAName ( array of 2=character heteroatom names )
//                   RName  ( 3-characters amino acid names         )
//                   RName1 ( 1-characters amino acid names         )
//
//
//  (C) E. Krissinel  2000-2009
//
//  =================================================================
//


#ifndef __MMDB_Tables__
#define __MMDB_Tables__


#ifndef __MatType__
#include "mattype_.h"
#endif



//  =================================================================


#define nElementNames  117
#define nElementMetals 91
#define nHydAtomNames  14

extern cpstr    const ElementName   [nElementNames];
extern cpstr    const ElementMetal  [nElementMetals];
extern cpstr    const HydAtomName   [nHydAtomNames];
extern realtype const MolecWeight   [nElementNames];
extern realtype const CovalentRadius[nElementNames];
extern realtype const VdWaalsRadius [nElementNames];
extern realtype const IonicRadius   [nElementNames];

extern Boolean isMetal ( cpstr element );

#define  ELEMENT_UNKNOWN    -1

extern int      getElementNo      ( cpstr element );
extern realtype getMolecWeight    ( cpstr element );
extern realtype getCovalentRadius ( cpstr element );
extern realtype getVdWaalsRadius  ( cpstr element );

#define nResNames  26

extern cpstr const ResidueName [nResNames];
extern char  const ResidueName1[nResNames];

extern int getResidueNo ( cpstr resName );

#define nSolventNames     12
#define nAminoacidNames   23
#define nNucleotideNames  24


DefineStructure(SAAProperty)

struct SAAProperty  {
  char     name[4];
  realtype hydropathy;
  realtype charge;
  realtype relSolvEnergy;
};

extern SAAProperty const AAProperty[nAminoacidNames];

extern realtype GetAAHydropathy ( cpstr resName );  // -4.5...+4.5
extern realtype GetAACharge     ( cpstr resName );
extern realtype GetAASolvationEnergy ( cpstr resName );
extern int      GetAASimilarity ( cpstr resName1,
                                  cpstr resName2 );  // 0..5

extern cpstr const StdSolventName[nSolventNames];
//extern pstr const AminoacidName [nAminoacidNames];
extern cpstr const NucleotideName[nNucleotideNames];

extern Boolean isSolvent    ( cpstr resName );
extern Boolean isAminoacid  ( cpstr resName );
extern Boolean isNucleotide ( cpstr resName );
extern int     isDNARNA     ( cpstr resName ); // 0,1(DNA),2(RNA)
extern Boolean isSugar      ( cpstr resName );

extern void  Get1LetterCode ( cpstr res3name, pstr res1code );


#endif

