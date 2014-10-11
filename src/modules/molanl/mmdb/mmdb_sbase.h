//  $Id: mmdb_sbase.h,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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
//    21.02.06   <--  Date of Last Modification.
//                   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//  -----------------------------------------------------------------
//
//  **** Module  :  mmdb_sbase  <implementation>
//       ~~~~~~~~~
//  **** Classes :  CSBase       ( structure base manager       )
//       ~~~~~~~~~  CSBAtom      ( SB atom class                )
//                  CSBBond      ( SB bond class                )
//                  CSBStructure ( SB structure (monomer) class )
//                  CSBIndex     ( SB index class               )
//
//   (C) E. Krissinel 2000-2008
//
//  =================================================================
//

#ifndef  __MMDB_SBase__
#define  __MMDB_SBase__

#ifndef  __MMDB_Manager__
#include "mmdb_manager.h"
#endif

#ifndef  __MMDB_SBase0__
#include "mmdb_sbase0.h"
#endif



//  ===========================  CSBase  ============================

DefineStructure(SAtomPair)

struct SAtomPair  {
  PCAtom a1,a2;
};


DefineClass(CSBase)

class CSBase : public CSBase0  {

  public :

    CSBase ();
    ~CSBase();

    //   CalcHBonds(..) calculates hydrogen bonds and salt bridges
    // between atoms of residues given in Res1[0..nres1-1] and
    // Res2[0..nres2-1]. H-bonds are returned in HBond[0..nHBonds-1]
    // and salt bridges are returned in SBridge[0..nSBridges-1].
    //
    //   On input:
    //     Res1, Res2         must belong to the same MMDB
    //     HBond, SBridge     should be set NULL, otherwise the
    //                        function attempts to deallocate them
    //     nHBonds, nSBridges ignored
    //     structFile         may be a pointer to open SBase stucture
    //                        file in order to save on file open
    //                        operation. If structFile is set NULL,
    //                        the function will open the SBase
    //                        structure file by itself
    //     altLoc             specifies the alternative location for
    //                        donors and acceptors.
    //                          altLoc==NULL  the highest occupancy
    //                                        atoms are taken. If all
    //                                        occupancies are equal
    //                                        equal then atom with
    //                                        first altLoc taken
    //                          altLoc!=NULL  atoms with given altLoc
    //                                        are taken. If such
    //                                        altLoc is not found,
    //                                        the function acts as
    //                                        if NULL value for altLoc
    //                                        were given.
    //     ignoreNegSigOcc    if it is set True, then the function
    //                        ignores atoms with negative occupancy
    //                        standard deviation. Such atoms may be
    //                        hydrogens added by
    //                        CSBase0::AddHydrogen(..) function, in
    //                        general any atoms added by
    //                        CSBAtom::MakeCAtom(..) function. Such
    //                        added hydrogens are note guaranteed to
    //                        be in correct place, therefore the
    //                        function may mistake on some hydrogen
    //                        bonds if they are not neglected.
    //
    //   On output:
    //     Allocated arrays HBond[0..nHBonds-1] and
    //     SBridge[0..nSBridges-1]. If no bonds/bridges were found,
    //     the corresponding array is not allocated and set NULL.
    //     Application is responsible for deallocation of the arrays,
    //     when not needed, using statements
    //       if (HBond)    delete[] HBond;
    //       if (SBridge)  delete[] SBridge;
    //     HBond[i].a1, SBridge[i].a1 always refer atom from Res1[],
    //     and HBond[i].a2, SBridge[i].a2 always refer atom from
    //     Res2[].
    //
    int  CalcHBonds ( PPCResidue Res1, int nres1,
                      PPCResidue Res2, int nres2,
                      RPSAtomPair   HBond, int & nHBonds,
                      RPSAtomPair SBridge, int & nSBridges,
                      PCFile structFile=NULL, pstr altLoc=NULL,
                      Boolean ignoreNegSigOcc=False );

  protected :
    // Geometry parameters for H-bond calculations
    realtype minDAdist,maxSBdist,maxDAdist,maxHAdist2;
    realtype maxDHAcos,maxHAAcos,maxDAAcos,maxDDAcos;

    void InitSBase ();
    void FreeMemory();

};

#endif
