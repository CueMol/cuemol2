//  $Id: mmdb_sbase.cpp,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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

#ifndef  __STDLIB_H
#include <stdlib.h>
#endif

#ifndef  __STRING_H
#include <string.h>
#endif

#ifndef  __MMDB_SBase__
#include "mmdb_sbase.h"
#endif


//  =========================  CSBase  =============================

CSBase::CSBase() : CSBase0()  {
  InitSBase();
}


CSBase::~CSBase()  {
  FreeMemory();
}

void CSBase::InitSBase()  {
  minDAdist  = 2.0;
  maxDAdist  = 3.9;  // max distance for H-bonds
  maxSBdist  = 4.0;  // max distance for salt bridges
  maxHAdist2 = 2.5*2.5;
  maxDHAcos  = 0.0;
  maxHAAcos  = 0.0;
  maxDAAcos  = 0.0;
  maxDDAcos  = 0.0;
}

void CSBase::FreeMemory()  {
}

void addAtomPair ( PCAtom a1, PCAtom a2,
                   PSAtomPair & Pair, int & nPairs, int & nPAlloc )  {
PSAtomPair AP;
int        i,i1,i2,j1,j2;
Boolean    Found;

  Found = False;
  i1    = a1->GetIndex();
  i2    = a2->GetIndex();
  for (i=0;(i<nPairs) && (!Found);i++)  {
    j1 = Pair[i].a1->GetIndex();
    j2 = Pair[i].a2->GetIndex();
    Found = (((i1==j1) && (i2==j2)) ||
             ((i1==j2) && (i2==j1)));
  }

  if (!Found)  {
    if (nPairs>=nPAlloc)  {
      nPAlloc = nPairs+20;
      AP = new SAtomPair[nPAlloc];
      for (i=0;i<nPairs;i++)  {
        AP[i].a1 = Pair[i].a1;
        AP[i].a2 = Pair[i].a2;
      }
      if (Pair)  delete[] Pair;
      Pair = AP;
    }
    Pair[nPairs].a1 = a1;
    Pair[nPairs].a2 = a2;
    nPairs++;
  }

}

int  CSBase::CalcHBonds ( PPCResidue Res1, int nres1,
                          PPCResidue Res2, int nres2,
                          RPSAtomPair   HBond, int & nHBonds,
                          RPSAtomPair SBridge, int & nSBridges,
                          PCFile structFile, pstr altLoc,
                          Boolean ignoreNegSigOcc )  {
PCFile        sFile;
PCMMDBManager MMDB;
PPCAtom       Donor1,Acceptor1, Donor2,Acceptor2;
PCAtom        D,A,H;
PSContact     Contact;
PSAtomBond    ABond,DBond;
SDASelHandles selHandles1,selHandles2;
pstr          resName;
int           nDonors1,nAcceptors1, nDonors2,nAcceptors2, nContacts;
int           i,j,k,nDBonds,nABonds,nHBAlloc,nSBAlloc;
Boolean       isHBond,isSBridge;

  if (HBond)  {
    delete[] HBond;
    HBond = NULL;
  }
  nHBonds  = 0;
  nHBAlloc = 0;

  if (SBridge)  {
    delete[] SBridge;
    SBridge = NULL;
  }
  nSBridges = 0;
  nSBAlloc  = 0;

  //  1. Calculate bonds between atoms in given residues and
  //     select donors and acceptors

  i = 0;
  while ((i<nres1) && (!Res1[i]))  i++;
  if (i>=nres1)  return SBASE_EmptyResSet;

  MMDB = PCMMDBManager(Res1[i]->GetCoordHierarchy());
  if (!MMDB)  return SBASE_noCoordHierarchy;

  if (structFile)  sFile = structFile;
             else  sFile = GetStructFile();

  if (!sFile)  return SBASE_FileNotFound;

  selHandles1.getNewHandles ( MMDB );
  for (i=0;i<nres1;i++)
    if (Res1[i])
      MakeBonds ( Res1[i],altLoc,sFile,&selHandles1,ignoreNegSigOcc );
  selHandles1.makeSelIndexes ( MMDB );

  selHandles2.getNewHandles ( MMDB );
  for (i=0;i<nres2;i++)
    if (Res2[i])
      MakeBonds ( Res2[i],altLoc,sFile,&selHandles2,ignoreNegSigOcc );
  selHandles2.makeSelIndexes ( MMDB );

  if (!structFile)  delete sFile;

  // 2. Calculate contacts between donors and acceptors as
  //    potential hydrogen bond contacts

  MMDB->GetSelIndex ( selHandles1.selHndDonor,Donor1,nDonors1 );
  MMDB->GetSelIndex ( selHandles2.selHndDonor,Donor2,nDonors2 );
  if ((nDonors1<=0) && (nDonors2<=0))  {
    selHandles1.deleteSelections ( MMDB );
    selHandles2.deleteSelections ( MMDB );
    return SBASE_noDonors;
  }

  MMDB->GetSelIndex(selHandles1.selHndAcceptor,Acceptor1,nAcceptors1);
  MMDB->GetSelIndex(selHandles2.selHndAcceptor,Acceptor2,nAcceptors2);
  if ((nAcceptors1<=0) && (nAcceptors2<=0))  {
    selHandles1.deleteSelections ( MMDB );
    selHandles2.deleteSelections ( MMDB );
    return SBASE_noAcceptors;
  }

  if ((nDonors1*nAcceptors2<=0) && (nDonors2*nAcceptors1<=0))  {
    selHandles1.deleteSelections ( MMDB );
    selHandles2.deleteSelections ( MMDB );
    return SBASE_noHBonds;
  }

  //   We now calculate contacts such that 1st contacting atom, either
  // acceptor or donor, belongs to 1st set of residues, and the second
  // one - to 2nd set of residues. Therefore we run SeekContacts on
  // two sets of donors and acceptors, identified by different group
  // id, merging the array of contacts for convenience.
  Contact   = NULL;
  nContacts = 0;
  MMDB->SeekContacts ( Donor1,nDonors1,Acceptor2,nAcceptors2,
                       minDAdist,RMax(maxDAdist,maxSBdist),0,Contact,
                       nContacts,0,NULL,1,0 );
  MMDB->SeekContacts ( Acceptor1,nAcceptors1,Donor2,nDonors2,
                       minDAdist,RMax(maxDAdist,maxSBdist),0,Contact,
                       nContacts,0,NULL,2,0 );
  if (nContacts<=0)  {
    selHandles1.deleteSelections ( MMDB );
    selHandles2.deleteSelections ( MMDB );
    return SBASE_noHBonds;
  }


  // 3. Check all contacts for h-bond geometry

  // merge all hydrogens into one selection as it is used
  // for checking with only
  MMDB->Select ( selHandles1.selHndHydrogen,STYPE_ATOM,
                 selHandles2.selHndHydrogen,SKEY_OR );

  for (i=0;i<nContacts;i++)  {
    if (Contact[i].group<=1)  {
      D = Donor1   [Contact[i].id1];
      A = Acceptor2[Contact[i].id2];
    } else  {
      A = Acceptor1[Contact[i].id1];
      D = Donor2   [Contact[i].id2];
    }
    if (Contact[i].dist<=maxDAdist)  {
      // Check for H-bond
      D->GetBonds ( DBond,nDBonds );
      A->GetBonds ( ABond,nABonds );
      if (nABonds>0)  {
        // Check whether there are hydrogens bound to the donor,
        // and if they are then calculate h-bonds using them
        H = NULL;
        for (j=0;j<nDBonds;j++)
          if ((DBond[j].atom->occupancy>0.0)  &&
               DBond[j].atom->isInSelection(
                                selHandles1.selHndHydrogen))  {
            H = DBond[j].atom;
            if ((H->GetDist2(A)<maxHAdist2) && 
                (H->GetCosine(D,A)<=maxDHAcos))  {
              // Check angles with all acceptor neighbours
              isHBond = True;
              for (k=0;(k<nABonds) && isHBond;k++)
                isHBond = (A->GetCosine(H,ABond[k].atom)<=maxHAAcos);
              if (isHBond)  {
                if (Contact[i].group<=1)
                      addAtomPair ( H,A,HBond,nHBonds,nHBAlloc );
                else  addAtomPair ( A,H,HBond,nHBonds,nHBAlloc );
              }
            }
          }
        if ((!H) && (nDBonds>0))  {
          // There were no hydrogens bonded to donor, assume that
          // the structure is incomplete and check donor-acceptor
          // geometry for possible h-bonding.
          isHBond = True;
          for (j=0;(j<nDBonds) && isHBond;j++)
            isHBond = (D->GetCosine(DBond[j].atom,A)<=maxDDAcos);
          for (j=0;(j<nABonds) && isHBond;j++)
            isHBond = (A->GetCosine(D,ABond[j].atom)<=maxDAAcos);
          if (isHBond)  {
            if (Contact[i].group<=1)
                  addAtomPair ( D,A,HBond,nHBonds,nHBAlloc );
            else  addAtomPair ( A,D,HBond,nHBonds,nHBAlloc );
          }
        }
      }
    }
    if ((Contact[i].dist<=maxSBdist)       && 
        (D->GetResidue()!=A->GetResidue()) &&
        (!strcmp(D->element," N")) && (!strcmp(A->element," O")))  {
      // Check for salt bridge, which may be formed only by N-O
      // pairs of aminoacid atoms at distances less then maxSBdist
      if (!strcmp(D->name," N  "))  {
        // mainchain nitrogen can form salt bridge only at N-terminus
        isSBridge = D->isNTerminus();
      } else  {
        // other nitrogens can form salt bridge only in LYS, ARG
        // and HIS
        resName   = D->GetResName();
        isSBridge = ((!strcmp(resName,"LYS")) ||
                     (!strcmp(resName,"ARG")) ||
                     (!strcmp(resName,"HIS")));
      }
      if (isSBridge)  {
        if ((!strcmp(A->name," O  ")) || (!strcmp(A->name," OXT")))  {
          // mainchain oxygens can form salt bridge only at C-terminus
          isSBridge = A->isCTerminus();
        } else  {
          // other oxygens can form salt bridge only in GLU and ASP
          resName   = A->GetResName();
          isSBridge = ((!strcmp(resName,"GLU")) ||
                       (!strcmp(resName,"ASP")));
        }
        if (isSBridge)  {
          if (Contact[i].group<=1)
                addAtomPair ( D,A,SBridge,nSBridges,nSBAlloc );
          else  addAtomPair ( A,D,SBridge,nSBridges,nSBAlloc );
        }
      }
    }
  }

  if (Contact)  delete[] Contact;

  selHandles1.deleteSelections ( MMDB );
  selHandles2.deleteSelections ( MMDB );

  return SBASE_Ok;

}
