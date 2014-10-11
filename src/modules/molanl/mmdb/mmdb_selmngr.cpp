//  $Id: mmdb_selmngr.cpp,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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
//  **** Module  :  mmdb_selmngr  <implementation>
//       ~~~~~~~~~
//  **** Project :  MacroMolecular Data Base (MMDB)
//       ~~~~~~~~~
//  **** Classes :  CMMDBSelManager ( MMDB atom selection manager )
//       ~~~~~~~~~
//
//   (C) E. Krissinel 2000-2008
//
//  =================================================================
//


#ifndef  __STRING_H
#include <string.h>
#endif

#ifndef  __STDLIB_H
#include <stdlib.h>
#endif

#ifndef  __MATH_H
#include <math.h>
#endif

#ifndef  __MMDB_SelMngr__
#include "mmdb_selmngr.h"
#endif



//  ====================   CMMDBSelManager   =====================

CMMDBSelManager::CMMDBSelManager() : CMMDBCoorManager()  {
  InitMMDBSelManager();
}

CMMDBSelManager::CMMDBSelManager ( RPCStream Object )
               : CMMDBCoorManager(Object)  {
  InitMMDBSelManager();
}

CMMDBSelManager::~CMMDBSelManager()  {
  DeleteAllSelections();
}

void  CMMDBSelManager::ResetManager()  {
  CMMDBCoorManager::ResetManager();
  DeleteAllSelections();
  InitMMDBSelManager ();
}

void  CMMDBSelManager::InitMMDBSelManager()  {
  nSelections = 0;     // number of selections
  Mask        = NULL;  // vector of selections
  SelType     = NULL;  // vector of selection types
  nSelItems   = NULL;  // numbers of selected items
  Selection   = NULL;  // vector of selected items
}


// ------------------------  Selection  -----------------------------

int  CMMDBSelManager::NewSelection()  {
int       i,l;
PCMask    M;
PPCMask   Mask1;
PPCMask * Selection1;
ivector   nSelItems1;
ivector   SelType1;

  M = new CMask();
  M->NewMask ( Mask,nSelections );

  i = 0;
  while (i<nSelections) 
    if (!Mask[i])  break;
             else  i++;

  if (i>=nSelections)  {
    l          = nSelections+10;
    Mask1      = new PCMask [l];
    Selection1 = new PPCMask[l];
    nSelItems1 = new int[l];
    SelType1   = new int[l];
    for (i=0;i<nSelections;i++)  {
      Mask1     [i] = Mask     [i];
      Selection1[i] = Selection[i];
      nSelItems1[i] = nSelItems[i];
      SelType1  [i] = SelType  [i];
    }
    for (i=nSelections;i<l;i++)  {
      Mask1     [i] = NULL;
      Selection1[i] = NULL;
      nSelItems1[i] = 0;
      SelType1  [i] = STYPE_UNDEFINED;
    }
    if (Mask)      delete[] Mask;
    if (Selection) delete[] Selection;
    if (nSelItems) delete[] nSelItems;
    if (SelType)   delete[] SelType;
    Mask        = Mask1;
    Selection   = Selection1;
    nSelItems   = nSelItems1;
    SelType     = SelType1;
    i           = nSelections;
    nSelections = l;
  }

  Mask[i] = M;
  if (Selection[i])  delete[] Selection[i];
  Selection[i] = NULL;
  nSelItems[i] = 0;
  SelType  [i] = STYPE_UNDEFINED;

  return i+1;

}

int  CMMDBSelManager::GetSelType ( int selHnd )  {
int k;
  if ((selHnd>0) && (selHnd<=nSelections))  {
    k = selHnd-1;
    if (Mask[k])  return SelType[k];
  }
  return STYPE_INVALID;
}
 
void  CMMDBSelManager::DeleteSelection ( int selHnd )  {
int i,k;
  if ((selHnd>0) && (selHnd<=nSelections))  {
    k = selHnd-1;
    if (Mask[k])  {
      for (i=0;i<nSelItems[k];i++)
        if (Selection[k][i])
          Selection[k][i]->RemoveMask ( Mask[k] );

      //      for (i=0;i<nAtoms;i++)
      //        if (Atom[i])
      //          Atom[i]->RemoveMask ( Mask[k] );

      delete Mask[k];
    }
    Mask[k] = NULL;
    if (Selection[k])  delete[] Selection[k];
    Selection[k] = NULL;
    nSelItems[k] = 0;
    SelType  [k] = STYPE_UNDEFINED;
  }
}


PCMask CMMDBSelManager::GetSelMask ( int selHnd )  {
  if ((selHnd>0) && (selHnd<=nSelections))
       return Mask[selHnd-1];
  else return NULL;
}

void  CMMDBSelManager::DeleteAllSelections()  {
int i;
  if (Mask)  {
    if (Atom)
      for (i=0;i<nAtoms;i++)
        if (Atom[i])
          Atom[i]->ClearMask();
    for (i=0;i<nSelections;i++)  {
      if (Mask     [i])  delete   Mask[i];
      if (Selection[i])  delete[] Selection[i];
    }
    delete[] Mask;
    if (Selection) delete[] Selection;
    if (nSelItems) delete[] nSelItems;
    if (SelType)   delete[] SelType;
  }
  nSelections = 0;
  Mask        = NULL;
  Selection   = NULL;
  nSelItems   = NULL;
  SelType     = NULL;
}

void  CMMDBSelManager::SelectAtoms ( int selHnd, int iSer1, int iSer2,
                                     int selKey )  {
//   SelectAtoms(..) selects atoms in the serial number range
// of iSer1 to iSer2 by adding them to the set of atoms
// marked by the given mask. If iSer1=iSer2=0 then all atoms
// are selected. Each atom may be selected by a number of masks
// simultaneously
int i,s1,s2,k, sk,nsel;

  if ((selHnd<=0) || (selHnd>nSelections) || (nAtoms<=0))  return;

  k  = selHnd-1;
  sk = selKey;

  if ((SelType[k]==STYPE_UNDEFINED) ||
      (selKey==SKEY_NEW))           SelType[k] = STYPE_ATOM;
  else if (SelType[k]!=STYPE_ATOM)  return;

  switch (selKey)  {
    case SKEY_NEW : for (i=0;i<nAtoms;i++)
                      if (Atom[i])  Atom[i]->RemoveMask ( Mask[k] );
                    nSelItems[k] = 0;
                    nsel = 0;
                  break;
    case SKEY_OR  : if (nSelItems[k]==0)  sk = SKEY_NEW;
                    nsel = nSelItems[k];
                  break;
    case SKEY_AND : nsel = 0;             break;
    case SKEY_XOR : nsel = nSelItems[k];  break;
    case SKEY_CLR : nsel = nSelItems[k];
                    if (nsel<=0)  return;
                  break;
  }

  if ((iSer1==0) && (iSer2==0))  {
    for (i=0;i<nAtoms;i++)
      if (Atom[i])  {
        if (!Atom[i]->Ter)
          SelectAtom ( Atom[i],k,sk,nsel );
      }
  } else  {
    if (iSer1<=iSer2)  {
      s1 = iSer1;
      s2 = iSer2;
    } else  {
      s1 = iSer2;
      s2 = iSer1;
    }
    // for a very general use, we allow the serial number
    // to differ from the atom's index, although this is
    // against PDB format. Therefore we apply here the most
    // primitive and less efficient way of selection
    for (i=0;i<nAtoms;i++)
      if (Atom[i])  {
        if (!Atom[i]->Ter)  {
          if ((s1<=Atom[i]->serNum) && (Atom[i]->serNum<=s2))
            SelectAtom ( Atom[i],k,sk,nsel );
          else if (sk==SKEY_AND)
            Atom[i]->RemoveMask ( Mask[k] );
        }
      }
  }

  MakeSelIndex ( selHnd,STYPE_ATOM,nsel );

}


void  CMMDBSelManager::SelectAtoms ( int selHnd, ivector asn, int nsn,
                                     int selKey )  {
//   SelectAtoms(..) selects atoms with serial numbers given in
// vector asn[0..nsn-1].
CQuickSort QS;
ivector    asn1;
int        i,k,nsn1,j,j1,j2, sk,sn,nsel;

  if ((selHnd<=0) || (selHnd>nSelections) || (nAtoms<=0))  return;

  k  = selHnd-1;
  sk = selKey;

  if ((SelType[k]==STYPE_UNDEFINED) ||
      (selKey==SKEY_NEW))           SelType[k] = STYPE_ATOM;
  else if (SelType[k]!=STYPE_ATOM)  return;

  switch (selKey)  {
    case SKEY_NEW : for (i=0;i<nAtoms;i++)
                      if (Atom[i])  Atom[i]->RemoveMask ( Mask[k] );
                    nSelItems[k] = 0;
                    nsel = 0;
                  break;
    case SKEY_OR  : if (nSelItems[k]==0)  sk = SKEY_NEW;
                    nsel = nSelItems[k];
                  break;
    case SKEY_AND : nsel = 0;             break;
    case SKEY_XOR : nsel = nSelItems[k];  break;
    case SKEY_CLR : nsel = nSelItems[k];
                    if (nsel<=0)  return;
                  break;
  }

  GetVectorMemory ( asn1,nsn,0 );
  for (i=0;i<nsn;i++)
    asn1[i] = asn[i];

  QS.Sort ( asn1,nsn );
  nsn1 = nsn-1;

  for (i=0;i<nAtoms;i++)
    if (Atom[i])  {
      if (!Atom[i]->Ter)  {
        sn = Atom[i]->serNum;
        if ((asn1[0]<=sn) && (sn<=asn1[nsn1]))  {
          // binary search
          j1 = 0;
          j2 = nsn1;
          do  {
            j = (j1+j2)/2;
            if (sn<asn1[j])      j2 = j;
            else if (sn>asn1[j]) j1 = j;
                            else j1 = j2;
          } while (j1<j2-1);
          if ((sn==asn1[j]) || (sn==asn1[j1]) || (sn==asn1[j2]))
            SelectAtom ( Atom[i],k,sk,nsel );
          else if (sk==SKEY_AND)
            Atom[i]->RemoveMask ( Mask[k] );
        } else if (sk==SKEY_AND)
          Atom[i]->RemoveMask ( Mask[k] );
      }
    }

  FreeVectorMemory ( asn1,0 );

  MakeSelIndex ( selHnd,STYPE_ATOM,nsel );

}


void  CMMDBSelManager::UnselectAtoms ( int selHnd, int iSer1, int iSer2 )  {
//   UnselectAtoms(..) clears the specified mask for atoms in
// the serial number range of iSer1 to iSer2. If iSer1=iSer2=0
// then all atoms are cleared of the specified mask. If selHnd
// is set to 0, then the atoms are cleared of any mask.
int i,s1,s2,k;

  if ((selHnd<=nSelections) && (nAtoms>0))  {

    k = selHnd-1;

    if (SelType[k]==STYPE_UNDEFINED)  SelType[k] = STYPE_ATOM;
    else if (SelType[k]!=STYPE_ATOM)  return;

    if ((iSer1==0) && (iSer2==0))  {
      if (k<0) {
        for (i=0;i<nAtoms;i++)
          if (Atom[i]) Atom[i]->ClearMask();
      } else  {
        for (i=0;i<nAtoms;i++)
          if (Atom[i]) Atom[i]->RemoveMask ( Mask[k] );
      }
    } else  {
      if (iSer1<=iSer2)  {
        s1 = iSer1;
        s2 = iSer2;
      } else  {
        s1 = iSer2;
        s2 = iSer1;
      }
      // for a very general use, we allow the serial number
      // to differ from the atom's index, although this is
      // against PDB format. Therefore we apply here the most
      // primitive and less efficient way of selection
      if (k<0)  {
        for (i=0;i<nAtoms;i++)
          if (Atom[i])  {
            if ((s1<=Atom[i]->serNum) && (Atom[i]->serNum<=s2))
              Atom[i]->ClearMask();
          }
      } else  {
        for (i=0;i<nAtoms;i++)
          if (Atom[i])  {
            if ((s1<=Atom[i]->serNum) && (Atom[i]->serNum<=s2))
              Atom[i]->RemoveMask ( Mask[k] );
          }
      }
    }

    MakeSelIndex ( selHnd,STYPE_ATOM,-1 );

  }

}


pstr MakeList ( cpstr S )  {
// makes the list of selecting items:
//   1st character - special use,
//       then each item from S embraced by commas
pstr L;
int  i,j;
  i = 0;
  while (S[i]==' ')  i++;
  if (S[i]!='*')  {
    // compile a searchable list
    L = new char[strlen(S)+5];
    if (S[i]=='!')  {
      L[0] = '!';
      i++;
    } else
      L[0] = ' ';
    if (strchr(S,'['))  L[1] = '"';
                  else  L[1] = ' ';
    L[2] = ',';
    j    = 3;
    while (S[i])  {
      while (S[i]==' ')  i++;
      if (S[i]=='[')  {
        while (S[i] && (S[i]!=']'))
          L[j++] = S[i++];
        L[j++] = ']';
        if (S[i]==']')  i++;
      } else
        while (S[i] && (S[i]!=' ') && (S[i]!=','))
          L[j++] = S[i++];
      while (S[i]==' ')  i++;
      L[j++] = ',';
      if (S[i]==',')  {
        i++;
        if (!S[i])  L[j++] = ',';  // blank chain ID at the end assumed
      }
    }
    if (j==3)  L[j++] = ',';
    L[j] = char(0);
  } else
    L = NULL;
  return L;
}

Boolean MatchName ( pstr L, pstr N )  {
char M[MaxMMDBNameLength+5];
int  i,j;
  if (L)  {
    i    = 0;
    M[0] = ',';
    j    = 1;
    while (N[i])
      if (N[i]==' ')  i++;
                else  M[j++] = N[i++];
    M[j++] = ',';
    M[j]   = char(0);
    if (strstr(&(L[2]),M))  return (L[0]!='!');
    else if (L[1]!='"')     return (L[0]=='!');
    else  {
      strcpy ( M,",[" );
      strcat ( M,N    );
      strcat ( M,"]," );
      if (strstr(&(L[2]),M))  return (L[0]!='!');
                        else  return (L[0]=='!');
    }
  } else
    return True;
}

Boolean MatchCharge ( pstr L, PCAtom atom )  {
char N[100];
  if (L)  {
    if (atom->WhatIsSet & ASET_Charge)  {
      sprintf ( N,"%+2i",mround(atom->charge) );
      return MatchName ( L,N );
    } else
      return False;
  } else
    return True;
}


void CMMDBSelManager::SelectAtom ( int selHnd, PCAtom A, int selKey,
                                   Boolean makeIndex )  {
int i, k, sk, nsel;

  if ((selHnd<=0) || (selHnd>nSelections))  return;

  k  = selHnd-1;
  sk = selKey;

  if ((SelType[k]==STYPE_UNDEFINED) ||
      (selKey==SKEY_NEW))           SelType[k] = STYPE_ATOM;
  else if (SelType[k]!=STYPE_ATOM)  return;

  switch (selKey)  {
    case SKEY_NEW : for (i=0;i<nSelItems[k];i++)
                      if (Selection[k][i])
                          Selection[k][i]->RemoveMask ( Mask[k] );
                    nSelItems[k] = 0;
                    nsel = 0;
                  break;
    case SKEY_OR  : if (nSelItems[k]==0)  sk = SKEY_NEW;
                    nsel = nSelItems[k];
                  break;
    case SKEY_AND : if (nSelItems[k]==0)  return;
                    nsel = 0;
                  break;
    case SKEY_XOR : nsel = nSelItems[k];
                  break;
    case SKEY_CLR : nsel = nSelItems[k];
                    if (nsel<=0)  return;
                  break;
  }

  SelectAtom ( A,k,sk,nsel);
  if (makeIndex)  MakeSelIndex ( selHnd,STYPE_ATOM,nsel );

}


void CMMDBSelManager::SelectResidue ( int selHnd, PCResidue Res,
                                      int selType, int selKey,
                                      Boolean makeIndex )  {
//  Selects residue Res or all its atoms depending on selType
PPCAtom A;
int     i, k, sk, nsel, nat;

  if ((selHnd<=0) || (selHnd>nSelections))  return;

  k  = selHnd-1;
  sk = selKey;

  if ((SelType[k]==STYPE_UNDEFINED) ||
      (selKey==SKEY_NEW))           SelType[k] = selType;
  else if (SelType[k]!=selType)  return;

  switch (selKey)  {
    case SKEY_NEW : for (i=0;i<nSelItems[k];i++)
                      if (Selection[k][i])
                          Selection[k][i]->RemoveMask ( Mask[k] );
                    nSelItems[k] = 0;
                    nsel = 0;
                  break;
    case SKEY_OR  : if (nSelItems[k]==0)  sk = SKEY_NEW;
                    nsel = nSelItems[k];
                  break;
    case SKEY_AND : if (nSelItems[k]==0)  return;
                    nsel = 0;
                  break;
    case SKEY_XOR : nsel = nSelItems[k];
                  break;
    case SKEY_CLR : nsel = nSelItems[k];
                    if (nsel<=0)  return;
                  break;
  }

  switch (selType)  {
    case STYPE_ATOM    :  Res->GetAtomTable ( A,nat );
                          for (i=0;i<nat;i++)
                            if (A[i])  {
                              if (!A[i]->Ter)
                                SelectAtom ( A[i],k,sk,nsel);
                            }
                        break ;
    case STYPE_RESIDUE :  SelectObject ( Res,k,sk,nsel );
                        break ;
    default : ;
  }

  if (makeIndex)  MakeSelIndex ( selHnd,selType,nsel );

}


void CMMDBSelManager::SelectChain ( int selHnd, PCChain Chain,
                                    int selType, int selKey,
                                    Boolean makeIndex )  {
//  Selects chain Chain or all its residues or atoms depending on selType
PPCAtom    A;
PPCResidue Res;
int        i,j, k, sk, nsel, nat,nres;

  if ((selHnd<=0) || (selHnd>nSelections))  return;

  k  = selHnd-1;
  sk = selKey;

  if ((SelType[k]==STYPE_UNDEFINED) ||
      (selKey==SKEY_NEW))           SelType[k] = selType;
  else if (SelType[k]!=selType)  return;

  switch (selKey)  {
    case SKEY_NEW : for (i=0;i<nSelItems[k];i++)
                      if (Selection[k][i])
                          Selection[k][i]->RemoveMask ( Mask[k] );
                    nSelItems[k] = 0;
                    nsel = 0;
                  break;
    case SKEY_OR  : if (nSelItems[k]==0)  sk = SKEY_NEW;
                    nsel = nSelItems[k];
                  break;
    case SKEY_AND : if (nSelItems[k]==0)  return;
                    nsel = 0;
                  break;
    case SKEY_XOR : nsel = nSelItems[k];
                  break;
    case SKEY_CLR : nsel = nSelItems[k];
                    if (nsel<=0)  return;
                  break;
  }

  switch (selType)  {
    case STYPE_ATOM    :  Chain->GetResidueTable ( Res,nres );
                          for (i=0;i<nres;i++)
                            if (Res[i])  {
                              Res[i]->GetAtomTable ( A,nat );
                              for (j=0;j<nat;j++)
                                if (A[j])  {
                                  if (!A[j]->Ter)
                                    SelectAtom ( A[j],k,sk,nsel);
                                }
                            }
                        break ;
    case STYPE_RESIDUE :  Chain->GetResidueTable ( Res,nres );
                          for (i=0;i<nres;i++)
                            if (Res[i])
                              SelectObject ( Res[i],k,sk,nsel );
                        break ;
    case STYPE_CHAIN   :  SelectObject ( Chain,k,sk,nsel );
                        break ;
    default : ;
  }

  if (makeIndex)  MakeSelIndex ( selHnd,selType,nsel );

}


void CMMDBSelManager::SelectModel ( int selHnd, PCModel model,
                                    int selType, int selKey,
                                    Boolean makeIndex )  {
//  Selects model or all its chains or residues or atoms depending
// on selType
PPCAtom    A;
PPCResidue Res;
PPCChain   Chain;
int        i,j,n, k, sk, nsel, nat,nres,nch;

  if ((selHnd<=0) || (selHnd>nSelections))  return;

  k  = selHnd-1;
  sk = selKey;

  if ((SelType[k]==STYPE_UNDEFINED) ||
      (selKey==SKEY_NEW))           SelType[k] = selType;
  else if (SelType[k]!=selType)  return;

  switch (selKey)  {
    case SKEY_NEW : for (i=0;i<nSelItems[k];i++)
                      if (Selection[k][i])
                          Selection[k][i]->RemoveMask ( Mask[k] );
                    nSelItems[k] = 0;
                    nsel = 0;
                  break;
    case SKEY_OR  : if (nSelItems[k]==0)  sk = SKEY_NEW;
                    nsel = nSelItems[k];
                  break;
    case SKEY_AND : if (nSelItems[k]==0)  return;
                    nsel = 0;
                  break;
    case SKEY_XOR : nsel = nSelItems[k];
                  break;
    case SKEY_CLR : nsel = nSelItems[k];
                    if (nsel<=0)  return;
                  break;
  }

  switch (selType)  {
    case STYPE_ATOM    :  model->GetChainTable ( Chain,nch );
                          for (i=0;i<nch;i++)
                            if (Chain[i])  {
                              Chain[i]->GetResidueTable ( Res,nres );
                              for (j=0;j<nres;j++)
                                if (Res[j])  {
                                  Res[j]->GetAtomTable ( A,nat );
                                  for (n=0;n<nat;n++)
                                    if (A[n])  {
                                      if (!A[n]->Ter)
                                        SelectAtom ( A[n],k,sk,nsel);
                                    }
                                }
                            }
                        break ;
    case STYPE_RESIDUE :  model->GetChainTable ( Chain,nch );
                          for (i=0;i<nch;i++)
                            if (Chain[i])  {
                              Chain[i]->GetResidueTable ( Res,nres );
                              for (j=0;j<nres;j++)
                                if (Res[j])
                                  SelectObject ( Res[j],k,sk,nsel );
                            }
                        break ;
    case STYPE_CHAIN   :  model->GetChainTable ( Chain,nch );
                          for (i=0;i<nch;i++)
                            if (Chain[i])
                              SelectObject ( Chain[i],k,sk,nsel );
                        break ;
    case STYPE_MODEL   :  SelectObject ( model,k,sk,nsel );
                        break ;
    default : ;
  }

  if (makeIndex)  MakeSelIndex ( selHnd,selType,nsel );

}


int CMMDBSelManager::MakeSelIndex ( int selHnd )  {
int k;
  if ((selHnd<=0) || (selHnd>nSelections))  return 0;
  k = selHnd-1;
  if (SelType[k]==STYPE_UNDEFINED)  return 0;
  MakeSelIndex ( selHnd,SelType[k],-1 );
  return nSelItems[k];
}

void CMMDBSelManager::MakeAllSelIndexes()  {
int k;
  for (k=0;k<nSelections;k++)
    if (SelType[k]!=STYPE_UNDEFINED)
      MakeSelIndex ( k+1,SelType[k],-1 );
}

void  CMMDBSelManager::SelectAtoms (
             int   selHnd,   // must be obtained from NewSelection()
             int   iModel,   // model number; iModel=0 means
                             // 'any models'
             cpstr Chains,   // may be several chains "A,B,W";
                             // "*" means 'any chain' (in model)
             int   ResNo1,   // starting residue number
             cpstr Ins1,     // starting residue insertion code;
                             // "*" means 'any code'
             int   ResNo2,   // ending residue number.
                             // ResNo1=ResNo2=ANY_RES
                             // means 'any residue number'
                             // (in chain)
             cpstr Ins2,     // ending residue insertion code
                             // "*" means 'any code'
             cpstr RNames,   // may be several residue names
                             // "ALA,GLU,CIS"; "*" means
                             // 'any residue name'
             cpstr ANames,   // may be several names "CA,CB";
                             // "*" means 'any atom' (in residue)
             cpstr Elements, // may be several element types like
                             // "H,C,O,CU"; "*" means 'any element'
             cpstr altLocs,  // may be several alternative
                             // locations 'A,B'; "*" means 'any
                             // alternative location'
             cpstr Segments, // may be several segment IDs like
                             // "S1,S2,A234"; "*" means 'any
                             // segment'
             cpstr Charges,  // may be several charges like
                             // "+1,-2,  "; "*" means 'any charge'
             realtype occ1,  // lowest occupancy
             realtype occ2,  // highest occupancy;
                             // occ1=occ2<0.0 means
                             // "any occupancy"
             realtype x0,    // reference x-point
             realtype y0,    // reference y-point
             realtype z0,    // reference z-point
             realtype d0,    // selection distance from the reference
                             // reference point; d0<=0.0 means
                             // 'any distance" and values of 
                             // x0, y0 and z0 are ignored
             int  selKey     // selection key
                    )  {

  Select ( selHnd,STYPE_ATOM,iModel,Chains,ResNo1,Ins1,ResNo2,Ins2,
           RNames,ANames,Elements,altLocs,Segments,Charges,
           occ1,occ2,x0,y0,z0,d0,selKey );

}


#define  hetIndicator '@'

void  CMMDBSelManager::Select (
             int   selHnd,   // must be obtained from NewSelection()
             int   selType,  // selection type STYPE_XXXXX
             int   iModel,   // model number; iModel=0 means
                             // 'any models'
             cpstr Chains,   // may be several chains "A,B,W";
                             // "*" means 'any chain' (in model)
             int   ResNo1,   // starting residue number
             cpstr Ins1,     // starting residue insertion code;
                             // "*" means 'any code'
             int   ResNo2,   // ending residue number.
                             // ResNo1=ResNo2=ANY_RES means 'any
                             // residue number' (in chain)
             cpstr Ins2,     // ending residue insertion code
                             // "*" means 'any code'
             cpstr RNames,   // may be several residue names
                             // "ALA,GLU,CIS"; "*" means 'any
                             // residue name'
             cpstr ANames,   // may be several names "CA,CB";"*"
                             // means 'any atom' (in residue)
             cpstr Elements, // may be several element types like
                             // "H,C,O,CU"; "*" means 'any element'
             cpstr altLocs,  // may be several alternative
                             // locations 'A,B'; "*" means 'any
                             // alternative location'
             cpstr Segments, // may be several segment IDs like
                             // "S1,S2,A234"; "*" means 'any
                             // segment'
             cpstr Charges,  // may be several charges like
                             // "+1,-2,  "; "*" means 'any charge'
             realtype occ1,  // lowest occupancy
             realtype occ2,  // highest occupancy;
                             // occ1=occ2<0.0 means
                             // "any occupancy"
             realtype x0,    // reference x-point
             realtype y0,    // reference y-point
             realtype z0,    // reference z-point
             realtype d0,    // selection distance from the reference
                             // reference point; d0<=0.0 means
                             // 'any distance" and values of 
                             // x0, y0 and z0 are ignored
             int  selKey     // selection key
                    )  {
int       i,j,k,n,m1,m2,c, sk,nsel;
realtype  dx,dy,dz,d02;
Boolean   noRes,Occ,Dist,Sel,selAND;
Boolean   modelSel,chainSel,resSel;
PCModel   model;
PCChain   chain;
PCResidue res;
PCAtom    atom;
pstr      chain_l;
pstr      res_l;
pstr      atom_l;
pstr      elem_l;
pstr      altLocs1;
pstr      aloc_l;
pstr      segm_l;
pstr      charge_l;

  if ((selHnd<=0) || (selHnd>nSelections) || (nAtoms<=0))  return;

  k  = selHnd-1;
  sk = selKey;

  if ((SelType[k]==STYPE_UNDEFINED) ||
      (selKey==SKEY_NEW))        SelType[k] = selType;
  else if (SelType[k]!=selType)  return;

  // if something goes wrong, sk should be assigned SKEY_OR if
  // selKey is set to SKEY_NEW or SKEY_OR below
  switch (selKey)  {
    case SKEY_NEW : for (i=0;i<nSelItems[k];i++)
                      if (Selection[k][i])
                          Selection[k][i]->RemoveMask ( Mask[k] );
                    nSelItems[k] = 0;
                    nsel = 0;
                  break;
    case SKEY_OR  : if (nSelItems[k]==0)  sk = SKEY_NEW;
                    nsel = nSelItems[k];
                  break;
    case SKEY_AND : nsel = 0;             break;
    case SKEY_XOR : nsel = nSelItems[k];  break;
    case SKEY_CLR : nsel = nSelItems[k];
                    if (nsel<=0)  return;
                  break;
    default       : return;
  }

  selAND   = (selKey==SKEY_AND);

  altLocs1 = NULL;
  if (altLocs)  {
    if (strchr(altLocs,hetIndicator))  {
      CreateCopy ( altLocs1,altLocs );
      DelSpaces  ( altLocs1 );
      aloc_l = strchr ( altLocs1,hetIndicator );
      aloc_l[0] = ' ';
      if (aloc_l[1])  aloc_l[1] = ' ';  // instead of comma
      else if (aloc_l!=altLocs1)  {
        aloc_l--;
        aloc_l[0] = ' ';
      }
      DelSpaces  ( altLocs1 );
      aloc_l = MakeList ( altLocs1 );
    } else
      aloc_l = MakeList ( altLocs );
  } else
    aloc_l = MakeList ( altLocs );

  chain_l  = MakeList ( Chains   );
  res_l    = MakeList ( RNames   );
  atom_l   = MakeList ( ANames   );
  elem_l   = MakeList ( Elements );
  segm_l   = MakeList ( Segments );
  charge_l = MakeList ( Charges  );

  //  noRes==True means no residue restrictions
  noRes = (ResNo1==ResNo2)   && (ResNo1==ANY_RES) &&
          (Ins1[0]==Ins2[0]) && (Ins1[0]=='*');

  Occ  = (occ1>=0.0) || (occ2>=0.0);
  Dist = (d0>0.0);
  d02  = d0*d0;

  m1   = iModel-1;

  if (m1>=0)
    m2 = m1+1;     // will take only this model
  else  { 
    m1 = 0;        // will take
    m2 = nModels;  //   all models
  }

  if (m1>=nModels)  return;

  for (n=0;n<nModels;n++)  {
    model = Model[n];
    if (model)  {  // check for safety
      if ((m1<=n) && (n<m2))  {
        modelSel = False; // will be True on any selection in the model
        for (c=0;c<model->nChains;c++)  {
          chain = model->Chain[c];
          if (chain)  {   // again check for safety
            if (MatchName(chain_l,chain->chainID))  {
              // the chain has to be taken
              i = 0;
              if (!noRes)
                while (i<chain->nResidues)  {
                  res = chain->Residue[i];
                  if (res)  {
                    if ((res->seqNum==ResNo1) &&
                        MatchName(res_l,res->name) &&
                        ((Ins1[0]=='*') ||
                         (!strcmp(res->insCode,Ins1))))
                      break;
                    else if (selAND)  {
                      if (selType==STYPE_ATOM)
                        res->UnmaskAtoms ( Mask[k] );
                      else if (selType==STYPE_RESIDUE)
                        res->RemoveMask ( Mask[k] );
                    }
                  }
                  i++;
                }
              while (i<chain->nResidues)  {
                res = chain->Residue[i];
                if (res)  {
                  resSel = False; // will be True on 1st sel-n in the res-e
                  if (MatchName(res_l,res->name))  {
                    for (j=0;j<res->nAtoms;j++)  {
                      atom = res->atom[j];
                      if (atom)  {
                        if ((!atom->Ter)                      &&
                            MatchName(atom_l  ,atom->name   ) &&
                            MatchName(elem_l  ,atom->element) &&
                            MatchName(aloc_l  ,atom->altLoc ) &&
                            MatchName(segm_l  ,atom->segID  ) &&
                            MatchCharge(charge_l,atom       ) &&
                            ((!altLocs1) || atom->Het))  {
                          Sel = True;
                          if (Occ)
                            Sel = ((occ1<=atom->occupancy) &&
                                   (atom->occupancy<=occ2));
                          if (Dist)  {
                            dx  = atom->x - x0;
                            dy  = atom->y - y0;
                            dz  = atom->z - z0;
                            Sel = Sel && ((dx*dx+dy*dy+dz*dz)<=d02);  
                          }
                        } else
                          Sel = False;
                        if (Sel)  {
                          SelectObject ( selType,atom,k,sk,nsel );
                          resSel   = True;
                          chainSel = True;
                          modelSel = True;
                        } else if (selAND && (selType==STYPE_ATOM))
                          atom->RemoveMask ( Mask[k] );
                      }
                      if (resSel && (selType!=STYPE_ATOM))  break;
                    }
                  } else if (selAND && (selType==STYPE_ATOM))
                      res->UnmaskAtoms ( Mask[k] );
                  if ((!resSel) && selAND && (selType==STYPE_RESIDUE))
                    res->RemoveMask ( Mask[k] );
                  if (chainSel && (selType>STYPE_RESIDUE))  break;
                  if (!noRes)  {
                    if ((res->seqNum==ResNo2) &&
                        ((Ins2[0]=='*') || (!strcmp(res->insCode,Ins2)))
                       )  break;
                  }
                }
                i++;
              }
              if (selAND)  {
                if (selType==STYPE_ATOM)
                  while (i<chain->nResidues)  {
                    res = chain->Residue[i];
                    if (res)  res->UnmaskAtoms ( Mask[k] );
                    i++;
                  }
                if (selType==STYPE_RESIDUE)
                  while (i<chain->nResidues)  {
                    res = chain->Residue[i];
                    if (res)  res->RemoveMask ( Mask[k] );
                    i++;
                  }
              }
            } else if (selAND)
              switch (selType)  {
                case STYPE_ATOM    : chain->UnmaskAtoms    ( Mask[k] ); break;
                case STYPE_RESIDUE : chain->UnmaskResidues ( Mask[k] ); break;
                case STYPE_CHAIN   : chain->RemoveMask     ( Mask[k] ); break;
                default            : ;
              }
            if ((!chainSel) && selAND && (selType==STYPE_CHAIN))
              chain->RemoveMask ( Mask[k] );
            if (modelSel && (selType>STYPE_CHAIN))  break;
          }
        }
      } else if (selAND)
        switch (selType)  {
          case STYPE_ATOM    : model->UnmaskAtoms    ( Mask[k] ); break;
          case STYPE_RESIDUE : model->UnmaskResidues ( Mask[k] ); break;
          case STYPE_CHAIN   : model->UnmaskChains   ( Mask[k] ); break;
          default            : ;
        }
      if ((!modelSel) && selAND && (selType==STYPE_MODEL))
        model->RemoveMask ( Mask[k] );
    }
  }

  // release dynamic memory
  if (chain_l)  delete[] chain_l;
  if (res_l)    delete[] res_l;
  if (atom_l)   delete[] atom_l;
  if (elem_l)   delete[] elem_l;
  if (altLocs1) delete[] altLocs1;
  if (aloc_l)   delete[] aloc_l;
  if (segm_l)   delete[] segm_l;
  if (charge_l) delete[] charge_l;

  MakeSelIndex ( selHnd,STYPE_ATOM,nsel );

}


void  CMMDBSelManager::SelectAtoms (
             int   selHnd,   // must be obtained from NewSelection()
             int   iModel,   // model number; iModel=0 means
                             // 'any models'
             cpstr Chains,   // may be several chains "A,B,W";
                             // "*" means 'any chain' (in model)
             int   ResNo1,   // starting residue number
             cpstr Ins1,     // starting residue insertion code;
                             // "*" means 'any code'
             int   ResNo2,   // ending residue number.
                             // ResNo1=ResNo2=ANY_RES means 'any
                             // residue number' (in chain)
             cpstr Ins2,     // ending residue insertion code
                             // "*" means 'any code'
             cpstr RNames,   // may be several residue names
                             // "ALA,GLU,CIS"; "*" means 'any
                             // residue name'
             cpstr ANames,   // may be several names "CA,CB"; "*"
                             // means 'any atom' (in residue)
             cpstr Elements, // may be several element types like
                             // "H,C,O,CU"; "*" means 'any
                             // element'
             cpstr altLocs,  // may be several alternative
                             // locations 'A,B'; "*" means 'any
                             // alternative location'
             int   selKey    // selection key
                    )  {
  Select ( selHnd,STYPE_ATOM,iModel,Chains,ResNo1,Ins1,ResNo2,Ins2,
           RNames,ANames,Elements,altLocs,selKey );
}


int  CMMDBSelManager::Select (
             int   selHnd,  // must be obtained from NewSelection()
             int   selType, // selection type STYPE_XXXXX
             cpstr CID,     // coordinate ID
             int   selKey   // selection key
                    )  {
int     iModel,l,RC;
pstr    Chains;
int     seqNum1 ,seqNum2;
InsCode insCode1,insCode2;
pstr    RNames;
pstr    ANames;
pstr    Elements;
pstr    altLocs;

  l = IMax(10,strlen(CID))+1;
  Chains   = new char[l];
  RNames   = new char[l];
  ANames   = new char[l];
  Elements = new char[l];
  altLocs  = new char[l];

  RC = ParseSelectionPath ( CID,iModel,Chains,seqNum1,insCode1,
                            seqNum2,insCode2,RNames,ANames,
                            Elements,altLocs );

  if (!RC)  {
    Select ( selHnd,selType,iModel,Chains,seqNum1,insCode1,
             seqNum2,insCode2,RNames,ANames,Elements,altLocs,selKey );
    RC = 0;
  }

  delete[] Chains;
  delete[] RNames;
  delete[] ANames;
  delete[] Elements;
  delete[] altLocs;

  return RC;

}

void  CMMDBSelManager::Select (
             int   selHnd,   // must be obtained from NewSelection()
             int   selType,  // selection type STYPE_XXXXX
             int   iModel,   // model number; iModel=0 means
                             // 'any model'
             cpstr Chains,   // may be several chains "A,B,W";
                             // "*" means 'any chain' (in model)
             int   ResNo1,   // starting residue number
             cpstr Ins1,     // starting residue insertion code;
                             // "*" means 'any code'
             int   ResNo2,   // ending residue number.
                             // ResNo1=ResNo2=ANY_RES means 'any
                             // residue number' (in chain)
             cpstr Ins2,     // ending residue insertion code
                             // "*" means 'any code'
             cpstr RNames,   // may be several residue names
                             // "ALA,GLU,CIS"; "*" means 'any
                             // residue name'
             cpstr ANames,   // may be several names "CA,CB"; "*"
                             // means 'any atom' (in residue)
             cpstr Elements, // may be several element types like
                             // "H,C,O,CU"; "*" means 'any element'
             cpstr altLocs,  // may be several alternative
                             // locations 'A,B'; "*" means 'any
                             // alternative location'
             int   selKey    // selection key
                    )  {
int       i,j,k,n,m1,m2,c, sk,nsel;
Boolean   noRes,modelSel,chainSel,resSel,selAND;
PCModel   model;
PCChain   chain;
PCResidue res;
PCAtom    atom;
pstr      chain_l;
pstr      res_l;
pstr      atom_l;
pstr      elem_l;
pstr      altLocs1;
pstr      aloc_l;

  if ((selHnd<=0) || (selHnd>nSelections) || (nAtoms<=0))  return;

  k  = selHnd-1;
  sk = selKey;

  if ((SelType[k]==STYPE_UNDEFINED) ||
      (selKey==SKEY_NEW))        SelType[k] = selType;
  else if (SelType[k]!=selType)  return;

  // if something goes wrong, sk should be assigned SKEY_OR if
  // selKey is set to SKEY_NEW or SKEY_OR below
  switch (selKey)  {
    case SKEY_NEW : for (i=0;i<nSelItems[k];i++)
                      if (Selection[k][i])
                          Selection[k][i]->RemoveMask ( Mask[k] );
                    nSelItems[k] = 0;
                    nsel = 0;
                  break;
    case SKEY_OR  : if (nSelItems[k]==0)  sk = SKEY_NEW;
                    nsel = nSelItems[k];
                  break;
    case SKEY_AND : nsel = 0;             break;
    case SKEY_XOR : nsel = nSelItems[k];  break;
    case SKEY_CLR : nsel = nSelItems[k];
                    if (nsel<=0)  return;
                  break;
    default       : return;
  }

  selAND  = (selKey==SKEY_AND);

  altLocs1 = NULL;
  if (altLocs)  {
    if (strchr(altLocs,hetIndicator))  {
      CreateCopy ( altLocs1,altLocs );
      DelSpaces  ( altLocs1 );
      aloc_l = strchr ( altLocs1,hetIndicator );
      aloc_l[0] = ' ';
      if (aloc_l[1])  aloc_l[1] = ' ';  // instead of comma
      else if (aloc_l!=altLocs1)  {
        aloc_l--;
        aloc_l[0] = ' ';
      }
      DelSpaces  ( altLocs1 );
      aloc_l = MakeList ( altLocs1 );
    } else
      aloc_l = MakeList ( altLocs );
  } else
    aloc_l = MakeList ( altLocs );

  chain_l = MakeList ( Chains   );
  res_l   = MakeList ( RNames   );
  atom_l  = MakeList ( ANames   );
  elem_l  = MakeList ( Elements );

  //  noRes==True means no residue restrictions
  noRes   = (ResNo1==ResNo2) && (ResNo1==ANY_RES) &&
            (Ins1[0]=='*')   && (Ins2[0]=='*');

  m1      = iModel-1;
  if (m1>=0)
    m2 = m1+1;     // will take only this model
  else  { 
    m1 = 0;        // will take
    m2 = nModels;  //   all models
  }

  if (m1>=nModels)  return;

  for (n=0;n<nModels;n++)  {
    model = Model[n];
    if (model)  {  // check for safety
      if ((m1<=n) && (n<m2))  {
        modelSel = False; // will be True on any selection in the model
        for (c=0;c<model->nChains;c++)  {
          chain = model->Chain[c];
          if (chain)  {  // again check for safety
            chainSel = False; // will be True on 1st sel-n in the chain
            if (MatchName(chain_l,chain->chainID))  {
              // the chain is to be taken
              i = 0;
              if (!noRes)  // skip "leading" residues
                while (i<chain->nResidues)  {
                  res = chain->Residue[i];
                  if (res)  {
                    if ((res->seqNum==ResNo1) &&
                        MatchName(res_l,res->name) &&
                        ((Ins1[0]=='*') ||
                         (!strcmp(res->insCode,Ins1))))
                      break;
                    else if (selAND)  {
                      if (selType==STYPE_ATOM)
                        res->UnmaskAtoms ( Mask[k] );
                      else if (selType==STYPE_RESIDUE)
                        res->RemoveMask ( Mask[k] );
                    }
                  }
                  i++;
                }
              while (i<chain->nResidues)  {
                res = chain->Residue[i];
                i++;
                if (res)  {
                  resSel = False; // will be True on 1st selection
                                  // in the residue
                  if (MatchName(res_l,res->name))  {
                    for (j=0;j<res->nAtoms;j++)  {
                      atom = res->atom[j];
                      if (atom)  {
                        if ((!atom->Ter)                    &&
                            MatchName(atom_l,atom->name   ) &&
                            MatchName(elem_l,atom->element) &&
                            MatchName(aloc_l,atom->altLoc ) &&
                            ((!altLocs1) || atom->Het))  {
                          SelectObject ( selType,atom,k,sk,nsel );
                          resSel   = True;
                          chainSel = True;
                          modelSel = True;
                        } else if (selAND && (selType==STYPE_ATOM))
                          atom->RemoveMask ( Mask[k] );
                      }
                      if (resSel && (selType!=STYPE_ATOM))  break;
                    }
                  } else if (selAND && (selType==STYPE_ATOM))
                      res->UnmaskAtoms ( Mask[k] );
                  if ((!resSel) && selAND && (selType==STYPE_RESIDUE))
                    res->RemoveMask ( Mask[k] );
                  if (chainSel && (selType>STYPE_RESIDUE))  break;
                  if (!noRes)  {
                    if ((res->seqNum==ResNo2) &&
                        ((Ins2[0]=='*') || (!strcmp(res->insCode,Ins2)))
                       ) break;
                  }
                }
              }
              if (selAND)  {
                if (selType==STYPE_ATOM)
                  while (i<chain->nResidues)  {
                    res = chain->Residue[i];
                    if (res)  res->UnmaskAtoms ( Mask[k] );
                    i++;
                  }
                if (selType==STYPE_RESIDUE)
                  while (i<chain->nResidues)  {
                    res = chain->Residue[i];
                    if (res)  res->RemoveMask ( Mask[k] );
                    i++;
                  }
              }
            } else if (selAND)
              switch (selType)  {
                case STYPE_ATOM    : chain->UnmaskAtoms    ( Mask[k] ); break;
                case STYPE_RESIDUE : chain->UnmaskResidues ( Mask[k] ); break;
                default            : ;
              }
            if ((!chainSel) && selAND && (selType==STYPE_CHAIN))
              chain->RemoveMask ( Mask[k] );
            if (modelSel && (selType>STYPE_CHAIN))  break;
          }
        }
      } else if (selAND)
        switch (selType)  {
          case STYPE_ATOM    : model->UnmaskAtoms    ( Mask[k] ); break;
          case STYPE_RESIDUE : model->UnmaskResidues ( Mask[k] ); break;
          case STYPE_CHAIN   : model->UnmaskChains   ( Mask[k] ); break;
          default            : ;
        }
      if ((!modelSel) && selAND && (selType==STYPE_MODEL))
        model->RemoveMask ( Mask[k] );
    }
  }

  // release dynamic memory
  if (chain_l)  delete[] chain_l;
  if (res_l)    delete[] res_l;
  if (atom_l)   delete[] atom_l;
  if (elem_l)   delete[] elem_l;
  if (altLocs1) delete[] altLocs1;
  if (aloc_l)   delete[] aloc_l;

  MakeSelIndex ( selHnd,selType,nsel );

}


#define SKEY_XAND  100

void CMMDBSelManager::Select (
             int  selHnd1, // destination, must be obtained from
                           //   NewSelection()
             int  selType, // selection type STYPE_XXXXX
             int  selHnd2, // source, must be obtained from
                           // NewSelection() and have been used
                           // for selection
             int  selKey   // selection key
                             )  {
//  SKEY_XOR works only downward the hierarchy!
int       k1,k2,sk,i,j,l,n,nsel;
PCAtom    atom;
PCResidue res;
PCChain   chain;
PCModel   model;

  if ((selHnd1<=0) || (selHnd1>nSelections) ||
      (selHnd2<=0) || (selHnd2>nSelections) || (nAtoms<=0))  return;

  k1 = selHnd1-1;
  k2 = selHnd2-1;
  sk = selKey;

  if ((SelType[k1]==STYPE_UNDEFINED) ||
      (selKey==SKEY_NEW))         SelType[k1] = selType;
  else if (SelType[k1]!=selType)  return;

  if (SelType[k2]==STYPE_UNDEFINED)  return;

  switch (selKey)  {
    case SKEY_NEW : for (i=0;i<nSelItems[k1];i++)
                      if (Selection[k1][i])
                          Selection[k1][i]->RemoveMask ( Mask[k1] );
                    nSelItems[k1] = 0;
                    sk   = SKEY_OR;
                    nsel = 0;
                  break;
    case SKEY_OR  : if (nSelItems[k1]==0)  sk = SKEY_NEW;
                    nsel = nSelItems[k1];
                  break;
    case SKEY_AND : if (nSelItems[k1]==0)  return;
                    sk   = SKEY_XAND;
                    nsel = 0;
                  break;
    case SKEY_XOR : nsel = nSelItems[k1];  break;
    case SKEY_CLR : nsel = nSelItems[k1];
                    if (nsel<=0)  return;
                  break;
    default       : return;
  }


  switch (SelType[k2])  {

    case STYPE_ATOM    :
        for (i=0;i<nSelItems[k2];i++)  {
          atom = (PCAtom)Selection[k2][i];
          if (atom)  {
            if (!atom->Ter)
              SelectObject ( selType,atom,k1,sk,nsel );
          }
        }
      break;

    case STYPE_RESIDUE :
        for (i=0;i<nSelItems[k2];i++)  {
          res = (PCResidue)Selection[k2][i];
          if (res)
            switch (selType)  {
	    case STYPE_ATOM  :   for (j=0;j<res->nAtoms;j++)  {
                                   atom = res->atom[j];
                                   if (atom)  {
                                     if (!atom->Ter)
                                       SelectObject (atom,k1,sk,nsel);
                                   }
                                 }
                               break;
              case STYPE_RESIDUE : //if (res->chain)
                                   SelectObject ( res,k1,sk,nsel );
                               break;
              case STYPE_CHAIN : if (res->chain)
                                   SelectObject ( res->chain,k1,
                                                  sk,nsel );
                               break;
              case STYPE_MODEL : if (res->chain)  {
                                   if (res->chain->model)
                                     SelectObject ( res->chain->model,
                                                    k1,sk,nsel );
                                 }
              default          : ;
            }
        }
      break;

    case STYPE_CHAIN   :
        for (i=0;i<nSelItems[k2];i++)  {
          chain = (PCChain)Selection[k2][i];
          if (chain)
            switch (selType)  {
              case STYPE_ATOM    : for (j=0;j<chain->nResidues;j++)  {
                                     res = chain->Residue[j];
                                     if (res)
                                       for (l=0;l<res->nAtoms;l++)  {
                                         atom = res->atom[l];
                                         if (atom)  {
                                           if (!atom->Ter)
                                             SelectObject ( atom,k1,
                                                             sk,nsel );
                                         }
                                       }
                                   }
                               break;
              case STYPE_RESIDUE : for (j=0;j<chain->nResidues;j++)  {
                                     res = chain->Residue[j];
                                     if (res)
                                       SelectObject ( res,k1,sk,nsel );
                                   }
                               break;
              case STYPE_CHAIN   : //if (chain->model)
                                     SelectObject ( chain,k1,sk,nsel );
                               break;
              case STYPE_MODEL   : if (chain->model)
                                     SelectObject ( chain->model,k1,
                                                    sk,nsel );
              default            : ;
            }
        }
      break;

    case STYPE_MODEL   :
        for (i=0;i<nSelItems[k2];i++)  {
          model = (PCModel)Selection[k2][i];
          if (model)
            switch (selType)  {
              case STYPE_ATOM    :
                        for (j=0;j<model->nChains;j++)  {
                          chain = model->Chain[j];
                          if (chain)
                            for (l=0;l<chain->nResidues;l++) {
                              res = chain->Residue[l];
                              if (res)
                                for (n=0;n<res->nAtoms;n++)  {
                                  atom = res->atom[n];
                                  if (atom)  {
                                    if (!atom->Ter)
                                      SelectObject ( atom,k1,sk,nsel );
                                  }
                                }
                            }
                        }
                      break;
              case STYPE_RESIDUE :
                        for (j=0;j<model->nChains;j++)  {
                          chain = model->Chain[j];
                          if (chain)
                            for (l=0;l<chain->nResidues;l++)  {
                              res = chain->Residue[j];
                              if (res)
                                SelectObject ( res,k1,sk,nsel );
                            }
                        }
                      break;
              case STYPE_CHAIN   : for (j=0;j<model->nChains;j++)  {
                                     chain = model->Chain[j];
                                     if (chain)
                                       SelectObject (chain,k1,sk,nsel);
                                   }
                               break;
              case STYPE_MODEL   : SelectObject ( model,k1,sk,nsel );
              default            : ;
            }
        }
      break;

    default : ;

  }

  if (selKey==SKEY_AND)
    for (i=0;i<nSelItems[k1];i++)
      if (Selection[k1][i])
        Selection[k1][i]->XadMask ( Mask[k1] );

  MakeSelIndex ( selHnd1,selType,nsel );

}

void  CMMDBSelManager::SelectProperty (
                  int  selHnd, // must be obtained from NewSelection()
                  int propKey, // property key: 0 Solvent 1 Aminoacid
                  int selType, // selection type STYPE_XXXXX
                  int  selKey  // selection key
                )  {
PCModel   model;
PCChain   chain;
PCResidue res;
int       i,k,selHnd1,sk,nsel, m,c,r;
Boolean   doSelect;

  if ((selHnd<=0) || (selHnd>nSelections) || (nAtoms<=0))  return;

  k  = selHnd-1;
  if ((SelType[k]==STYPE_UNDEFINED) ||
      (selKey==SKEY_NEW))        SelType[k] = selType;
  else if (SelType[k]!=selType)  return;

  if (selType!=STYPE_RESIDUE)  {
    selHnd1 = NewSelection();
    if ((selKey==SKEY_AND) || (selKey==SKEY_CLR))
      Select ( selHnd1,STYPE_RESIDUE,selHnd,SKEY_NEW );
  } else
    selHnd1 = selHnd;

  k          = selHnd1-1;
  SelType[k] = STYPE_RESIDUE;
  sk         = selKey;

  switch (selKey)  {
    case SKEY_NEW : for (i=0;i<nSelItems[k];i++)
                      if (Selection[k][i])
                          Selection[k][i]->RemoveMask ( Mask[k] );
                    nSelItems[k] = 0;
                    sk   = SKEY_OR;
                    nsel = 0;
                  break;
    case SKEY_OR  : if (nSelItems[k]==0)  sk = SKEY_NEW;
                    nsel = nSelItems[k];
                  break;
    case SKEY_AND : if (nSelItems[k]==0)  return;
                    sk   = SKEY_XAND;
                    nsel = 0;
                  break;
    case SKEY_XOR : nsel = nSelItems[k];  break;
    case SKEY_CLR : nsel = nSelItems[k];
                    if (nsel<=0)  return;
                  break;
    default       : return;
  }

  if ((selKey==SKEY_AND) || (selKey==SKEY_CLR))  {

    for (i=0;i<nSelItems[k];i++)  {
      res = (PCResidue)Selection[k][i];
      if (res)  {
        switch (propKey)  {
          case SELPROP_Solvent    : doSelect = res->isSolvent();
                                  break;
          case SELPROP_Aminoacid  : doSelect = res->isAminoacid();
                                  break;
          case SELPROP_Nucleotide : doSelect = res->isNucleotide();
                                  break;
          case SELPROP_Sugar      : doSelect = res->isSugar();
                                  break;
          case SELPROP_ModRes     : doSelect = res->isModRes();
                                  break;
          default : doSelect = False;
        }
        if (doSelect)  SelectObject ( res,k,sk,nsel );
      }
    }

    if (selKey==SKEY_AND)
      for (i=0;i<nSelItems[k];i++)
        if (Selection[k][i])
          Selection[k][i]->XadMask ( Mask[k] );

  } else  {

    for (m=0;m<nModels;m++)  {
      model = Model[m];
      if (model)  {
        for (c=0;c<model->nChains;c++)  {
          chain = model->Chain[c];
          if (chain)  {
            for (r=0;r<chain->nResidues;r++)  {
              res = chain->Residue[r];
              if (res)  {
                switch (propKey)  {
                  case SELPROP_Solvent    : doSelect = res->isSolvent();
                                         break;
                  case SELPROP_Aminoacid  : doSelect = res->isAminoacid();
                                         break;
                  case SELPROP_Nucleotide : doSelect = res->isNucleotide();
                                         break;
                  case SELPROP_Sugar      : doSelect = res->isSugar();
                                         break;
                  case SELPROP_ModRes     : doSelect = res->isModRes();
                                         break;
                  default : doSelect = False;
                }
                if (doSelect)  SelectObject ( res,k,sk,nsel );
              }
            }
          }
        }
      }
    }

  }


  MakeSelIndex ( selHnd1,STYPE_RESIDUE,nsel );

  if (selType!=STYPE_RESIDUE)  {
    Select ( selHnd,selType,selHnd1,SKEY_NEW );
    DeleteSelection ( selHnd1 );
  }

}


void CMMDBSelManager::SelectUDD ( 
             int    selHnd, // must be obtained from NewSelection()
             int   selType, // selection type STYPE_XXXXX
             int UDDhandle, // UDD handle
             int    selMin, // lower selection boundary
             int    selMax, // upper selection boundary
             int    selKey  // selection key
           )  {
PCModel   model;
PCChain   chain;
PCResidue res;
PCAtom    atom;
int       i,k,sk,nsel,iudd, n,c,r,a;
Boolean   selAND;

  k  = selHnd-1;
  sk = selKey;

  if ((SelType[k]==STYPE_UNDEFINED) ||
      (selKey==SKEY_NEW))        SelType[k] = selType;
  else if (SelType[k]!=selType)  return;


  if ((selHnd<=0) || (selHnd>nSelections))  return;

  switch (selType)  {
    case STYPE_ATOM    : if ((UDDhandle & UDRF_ATOM)==0)    return;
                      break;
    case STYPE_RESIDUE : if ((UDDhandle & UDRF_RESIDUE)==0) return;
                      break;
    case STYPE_CHAIN   : if ((UDDhandle & UDRF_CHAIN)==0)   return;
                      break;
    case STYPE_MODEL   : if ((UDDhandle & UDRF_MODEL)==0)   return;
                      break;
    default            : return;
  }


  // if something goes wrong, sk should be assigned SKEY_OR if
  // selKey is set to SKEY_NEW or SKEY_OR below
  switch (selKey)  {
    case SKEY_NEW : for (i=0;i<nSelItems[k];i++)
                      if (Selection[k][i])
                          Selection[k][i]->RemoveMask ( Mask[k] );
                    nSelItems[k] = 0;
                    nsel = 0;
                  break;
    case SKEY_OR  : if (nSelItems[k]==0)  sk = SKEY_NEW;
                    nsel = nSelItems[k];
                  break;
    case SKEY_AND : if (nSelItems[k]==0)  return;
                    nsel = 0;
                  break;
    case SKEY_XOR : nsel = nSelItems[k];  break;
    case SKEY_CLR : nsel = nSelItems[k];
                    if (nsel<=0)  return;
                  break;
    default       : return;
  }

  selAND = (selKey==SKEY_AND);


  for (n=0;n<nModels;n++)  {

    model = Model[n];
    if (model)  {  // check for safety

      if (selType==STYPE_MODEL)  {

        model->getUDData ( UDDhandle,iudd );
        if ((selMin<=iudd) && (iudd<=selMax))
          SelectObject ( model,k,sk,nsel );
        else if (selAND)
          model->RemoveMask ( Mask[k] );

      } else  {

        for (c=0;c<model->nChains;c++)  {

          chain = model->Chain[c];
          if (chain)  {   // again check for safety

            if (selType==STYPE_CHAIN)  {
              chain->getUDData ( UDDhandle,iudd );
              if ((selMin<=iudd) && (iudd<=selMax))
                SelectObject ( chain,k,sk,nsel );
              else if (selAND)
                chain->RemoveMask ( Mask[k] );

            } else  {

              for (r=0;r<chain->nResidues;r++)  {

                res = chain->Residue[r];
                if (res)  {

                  if (selType==STYPE_RESIDUE)  {
                    res->getUDData ( UDDhandle,iudd );
                    if ((selMin<=iudd) && (iudd<=selMax))
                      SelectObject ( res,k,sk,nsel );
                    else if (selAND)
                      res->RemoveMask ( Mask[k] );

                  } else  {

                    for (a=0;a<res->nAtoms;a++)  {
                      atom = res->atom[a];
                      if (atom)  {
                        if (!atom->Ter)  {
                          atom->getUDData ( UDDhandle,iudd );
                          if ((selMin<=iudd) && (iudd<=selMax))
                            SelectObject ( atom,k,sk,nsel );
                          else if (selAND)
                            atom->RemoveMask ( Mask[k] );
                        }
                      }

                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  MakeSelIndex ( selHnd,selType,nsel );

}                          


void CMMDBSelManager::SelectUDD ( 
             int      selHnd, // must be obtained from NewSelection()
             int     selType, // selection type STYPE_XXXXX
             int   UDDhandle, // UDD handle
             realtype selMin, // lower selection boundary
             realtype selMax, // upper selection boundary
             int      selKey  // selection key
           )  {
PCModel   model;
PCChain   chain;
PCResidue res;
PCAtom    atom;
realtype  rudd;
int       i,k,sk,nsel, n,c,r,a;
Boolean   selAND;

  k  = selHnd-1;
  sk = selKey;

  if ((SelType[k]==STYPE_UNDEFINED) ||
      (selKey==SKEY_NEW))        SelType[k] = selType;
  else if (SelType[k]!=selType)  return;


  if ((selHnd<=0) || (selHnd>nSelections))  return;

  switch (selType)  {
    case STYPE_ATOM    : if ((UDDhandle & UDRF_ATOM)==0)    return;
                      break;
    case STYPE_RESIDUE : if ((UDDhandle & UDRF_RESIDUE)==0) return;
                      break;
    case STYPE_CHAIN   : if ((UDDhandle & UDRF_CHAIN)==0)   return;
                      break;
    case STYPE_MODEL   : if ((UDDhandle & UDRF_MODEL)==0)   return;
                      break;
    default            : return;
  }


  // if something goes wrong, sk should be assigned SKEY_OR if
  // selKey is set to SKEY_NEW or SKEY_OR below
  switch (selKey)  {
    case SKEY_NEW : for (i=0;i<nSelItems[k];i++)
                      if (Selection[k][i])
                          Selection[k][i]->RemoveMask ( Mask[k] );
                    nSelItems[k] = 0;
                    nsel = 0;
                  break;
    case SKEY_OR  : if (nSelItems[k]==0)  sk = SKEY_NEW;
                    nsel = nSelItems[k];
                  break;
    case SKEY_AND : if (nSelItems[k]==0)  return;
                    nsel = 0;
                  break;
    case SKEY_XOR : nsel = nSelItems[k];  break;
    case SKEY_CLR : nsel = nSelItems[k];
                    if (nsel<=0)  return;
                  break;
    default       : return;
  }

  selAND = (selKey==SKEY_AND);


  for (n=0;n<nModels;n++)  {

    model = Model[n];
    if (model)  {  // check for safety

      if (selType==STYPE_MODEL)  {

        model->getUDData ( UDDhandle,rudd );
        if ((selMin<=rudd) && (rudd<=selMax))
          SelectObject ( model,k,sk,nsel );
        else if (selAND)
          model->RemoveMask ( Mask[k] );

      } else  {

        for (c=0;c<model->nChains;c++)  {

          chain = model->Chain[c];
          if (chain)  {   // again check for safety

            if (selType==STYPE_CHAIN)  {
              chain->getUDData ( UDDhandle,rudd );
              if ((selMin<=rudd) && (rudd<=selMax))
                SelectObject ( chain,k,sk,nsel );
              else if (selAND)
                chain->RemoveMask ( Mask[k] );

            } else  {

              for (r=0;r<chain->nResidues;r++)  {

                res = chain->Residue[r];
                if (res)  {

                  if (selType==STYPE_RESIDUE)  {
                    res->getUDData ( UDDhandle,rudd );
                    if ((selMin<=rudd) && (rudd<=selMax))
                      SelectObject ( res,k,sk,nsel );
                    else if (selAND)
                      res->RemoveMask ( Mask[k] );

                  } else  {

                    for (a=0;a<res->nAtoms;a++)  {
                      atom = res->atom[a];
                      if (atom)  {
                        if (!atom->Ter)  {
                          atom->getUDData ( UDDhandle,rudd );
                          if ((selMin<=rudd) && (rudd<=selMax))
                            SelectObject ( atom,k,sk,nsel );
                          else if (selAND)
                            atom->RemoveMask ( Mask[k] );
                        }
                      }

                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  MakeSelIndex ( selHnd,selType,nsel );

}                          


Boolean selSUDD ( cpstr sudd, cpstr selStr, int cmpRule, int ssLen )  {
  if (!sudd)  return False;
  switch (cmpRule)  {
    case UDSCR_LT        : return (strcmp(sudd,selStr)<0);
    case UDSCR_LE        : return (strcmp(sudd,selStr)<=0);
    case UDSCR_EQ        : return (strcmp(sudd,selStr)==0);
    case UDSCR_NE        : return (strcmp(sudd,selStr)!=0);
    case UDSCR_GE        : return (strcmp(sudd,selStr)>=0);
    case UDSCR_GT        : return (strcmp(sudd,selStr)>=0);
    case UDSCR_LTcase    : return (strcasecmp(sudd,selStr)<0);
    case UDSCR_LEcase    : return (strcasecmp(sudd,selStr)<=0);
    case UDSCR_EQcase    : return (strcasecmp(sudd,selStr)==0);
    case UDSCR_NEcase    : return (strcasecmp(sudd,selStr)!=0);
    case UDSCR_GEcase    : return (strcasecmp(sudd,selStr)>=0);
    case UDSCR_GTcase    : return (strcasecmp(sudd,selStr)>=0);
    case UDSCR_LTn       : return (strncmp(sudd,selStr,ssLen)<0);
    case UDSCR_LEn       : return (strncmp(sudd,selStr,ssLen)<=0);
    case UDSCR_EQn       : return (strncmp(sudd,selStr,ssLen)==0);
    case UDSCR_NEn       : return (strncmp(sudd,selStr,ssLen)!=0);
    case UDSCR_GEn       : return (strncmp(sudd,selStr,ssLen)>=0);
    case UDSCR_GTn       : return (strncmp(sudd,selStr,ssLen)>=0);
    case UDSCR_LTncase   : return (strncasecmp(sudd,selStr,ssLen)<0);
    case UDSCR_LEncase   : return (strncasecmp(sudd,selStr,ssLen)<=0);
    case UDSCR_EQncase   : return (strncasecmp(sudd,selStr,ssLen)==0);
    case UDSCR_NEncase   : return (strncasecmp(sudd,selStr,ssLen)!=0);
    case UDSCR_GEncase   : return (strncasecmp(sudd,selStr,ssLen)>=0);
    case UDSCR_GTncase   : return (strncasecmp(sudd,selStr,ssLen)>=0);
    case UDSCR_Substr    : return (strstr(sudd,selStr)!=NULL);
    case UDSCR_NoSubstr  : return (strstr(sudd,selStr)==NULL);
    case UDSCR_Substr1   : return (strstr(selStr,sudd)!=NULL);
    case UDSCR_NoSubstr1 : return (strstr(selStr,sudd)==NULL);
    default              : return False;
  }
}


void CMMDBSelManager::SelectUDD ( 
             int   selHnd,    // must be obtained from NewSelection()
             int   selType,   // selection type STYPE_XXXXX
             int   UDDhandle, // UDD handle
             cpstr selStr,    // selection string
             int   cmpRule,   // comparison rule
             int   selKey     // selection key
           )  {
PCModel   model;
PCChain   chain;
PCResidue res;
PCAtom    atom;
int       i,k,sk,nsel,ssLen, n,c,r,a;
Boolean   selAND;

  k  = selHnd-1;
  sk = selKey;

  if ((SelType[k]==STYPE_UNDEFINED) ||
      (selKey==SKEY_NEW))        SelType[k] = selType;
  else if (SelType[k]!=selType)  return;


  if ((selHnd<=0) || (selHnd>nSelections))  return;

  switch (selType)  {
    case STYPE_ATOM    : if ((UDDhandle & UDRF_ATOM)==0)    return;
                      break;
    case STYPE_RESIDUE : if ((UDDhandle & UDRF_RESIDUE)==0) return;
                      break;
    case STYPE_CHAIN   : if ((UDDhandle & UDRF_CHAIN)==0)   return;
                      break;
    case STYPE_MODEL   : if ((UDDhandle & UDRF_MODEL)==0)   return;
                      break;
    default            : return;
  }


  // if something goes wrong, sk should be assigned SKEY_OR if
  // selKey is set to SKEY_NEW or SKEY_OR below
  switch (selKey)  {
    case SKEY_NEW : for (i=0;i<nSelItems[k];i++)
                      if (Selection[k][i])
                          Selection[k][i]->RemoveMask ( Mask[k] );
                    nSelItems[k] = 0;
                    nsel = 0;
                  break;
    case SKEY_OR  : if (nSelItems[k]==0)  sk = SKEY_NEW;
                    nsel = nSelItems[k];
                  break;
    case SKEY_AND : if (nSelItems[k]==0)  return;
                    nsel = 0;
                  break;
    case SKEY_XOR : nsel = nSelItems[k];  break;
    case SKEY_CLR : nsel = nSelItems[k];
                    if (nsel<=0)  return;
                  break;
    default       : return;
  }

  selAND = (selKey==SKEY_AND);
  ssLen = strlen ( selStr );

  for (n=0;n<nModels;n++)  {

    model = Model[n];
    if (model)  {  // check for safety

      if (selType==STYPE_MODEL)  {

        if (selSUDD(model->getUDData(UDDhandle),selStr,
                                          cmpRule,ssLen))
          SelectObject ( model,k,sk,nsel );
        else if (selAND)
          model->RemoveMask ( Mask[k] );

      } else  {

        for (c=0;c<model->nChains;c++)  {

          chain = model->Chain[c];
          if (chain)  {   // again check for safety

            if (selType==STYPE_CHAIN)  {
              if (selSUDD(chain->getUDData(UDDhandle),selStr,
                                                cmpRule,ssLen))
                SelectObject ( chain,k,sk,nsel );
              else if (selAND)
                chain->RemoveMask ( Mask[k] );

            } else  {

              for (r=0;r<chain->nResidues;r++)  {

                res = chain->Residue[r];
                if (res)  {

                  if (selType==STYPE_RESIDUE)  {
                    if (selSUDD(res->getUDData(UDDhandle),selStr,
                                                    cmpRule,ssLen))
                      SelectObject ( res,k,sk,nsel );
                    else if (selAND)
                      res->RemoveMask ( Mask[k] );

                  } else  {

                    for (a=0;a<res->nAtoms;a++)  {
                      atom = res->atom[a];
                      if (atom)  {
                        if (!atom->Ter)  {
                          if (selSUDD(atom->getUDData(UDDhandle),selStr,
                                                           cmpRule,ssLen))
                            SelectObject ( atom,k,sk,nsel );
                          else if (selAND)
                            atom->RemoveMask ( Mask[k] );
                        }
                      }

                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  MakeSelIndex ( selHnd,selType,nsel );

}                          


void CMMDBSelManager::SelectSphere (
             int  selHnd, // must be obtained from NewSelection()
             int selType, // selection type STYPE_XXXXX
             realtype  x, // x-coordinate of the sphere's center
             realtype  y, // y-coordinate of the sphere's center
             realtype  z, // z-coordinate of the sphere's center
             realtype  r, // radius of the sphere
             int  selKey  // selection key
           )  {
//  Selecting a sphere
int       i,k, nat,sk,nsel, im,ic,ir;
realtype  dx,dy,dz, r2;
Boolean   ASel, resSel,chainSel,modelSel,selAND;
PPCAtom   A;
PCAtom    atom;
PCResidue res;
PCChain   chain;
PCModel   model;

  if ((selHnd<=0) || (selHnd>nSelections) || (r<=0.0))  return;

  k   = selHnd-1;
  sk  = selKey;
  A   = Atom;
  nat = nAtoms;

  if ((SelType[k]==STYPE_UNDEFINED) ||
      (selKey==SKEY_NEW))        SelType[k] = selType;
  else if (SelType[k]!=selType)  return;

  // if something goes wrong, sk should be assigned SKEY_OR if
  // selKey is set to SKEY_NEW or SKEY_OR below
  switch (selKey)  {
    case SKEY_NEW : for (i=0;i<nSelItems[k];i++)
                      if (Selection[k][i])
                          Selection[k][i]->RemoveMask ( Mask[k] );
                    nSelItems[k] = 0;
                    nsel = 0;
                  break;
    case SKEY_OR  : if (nSelItems[k]==0)  sk = SKEY_NEW;
                    nsel = nSelItems[k];
                  break;
    case SKEY_AND : nsel = 0;
                    nat  = nSelItems[k];
                    A    = (PPCAtom)Selection[k];
                  break;
    case SKEY_XOR : nsel = nSelItems[k];
                  break;
    case SKEY_CLR : nsel = nSelItems[k];
                    nat  = nSelItems[k];
                    A    = (PPCAtom)Selection[k];
                  break;
    default       : return;
  }

  selAND = selType==SKEY_AND;

  if ((nat<=0) || (!A))  return;

  r2 = r*r;

  if (selType==STYPE_ATOM)  {

    for (i=0;i<nat;i++)
      if (A[i])  {
        ASel = sk!=SKEY_AND;
        if ((!A[i]->Ter) && (A[i]->WhatIsSet & ASET_Coordinates))  {
          dx = fabs(A[i]->x-x);
          if (dx<=r)  {
            dy = fabs(A[i]->y-y);
            if (dy<=r)  {
              dz = fabs(A[i]->z-z);
              if (dz<=r)  {
                if (dx*dx+dy*dy+dz*dz<=r2)  {
                  ASel = True;
                  SelectAtom ( A[i],k,sk,nsel ); 
                }
              }
            }
          }
        } 
        if (!ASel)  A[i]->RemoveMask ( Mask[k] );
      }

  } else  {

    for (im=0;im<nModels;im++)  {
      model = Model[im];
      if (model)  {
        modelSel = False;
        for (ic=0;ic<model->nChains;ic++)  {
          chain = model->Chain[ic];
          if (chain)  {
            chainSel = False;
            for (ir=0;ir<chain->nResidues;ir++)  {
              res = chain->Residue[ir];
              if (res)  {
                resSel = False;
                for (i=0;i<res->nAtoms;i++)  {
                  atom = res->atom[i];
                  if (atom) {
                    ASel = False;
                    if ((!atom->Ter) && 
                        (atom->WhatIsSet & ASET_Coordinates))  {
                      dx = fabs(atom->x-x);
                      if (dx<=r)  {
                        dy = fabs(atom->y-y);
                        if (dy<=r)  {
                          dz = fabs(atom->z-z);
                          if (dz<=r)  {
                            if (dx*dx+dy*dy+dz*dz<=r2)  {
                              SelectObject ( selType,atom,k,sk,nsel );
                              ASel     = True;
                              resSel   = True;
                              chainSel = True;
                              modelSel = True;
                            }
                          }
                        }
                      }
                    }
                    if (ASel)  break;  // selType>=STYPE_RESIDUE
                  }
                }
                if ((!resSel) && selAND && (selType==STYPE_RESIDUE))
                  res->RemoveMask ( Mask[k] );
                if (chainSel && (selType>STYPE_RESIDUE))  break;
              }
            }
            if ((!chainSel) && selAND && (selType==STYPE_CHAIN))
              chain->RemoveMask ( Mask[k] );
            if (modelSel && (selType>STYPE_CHAIN))  break;
          }
        }
        if ((!modelSel) && selAND && (selType==STYPE_MODEL))
          model->RemoveMask ( Mask[k] );
      }
    }

  }

  MakeSelIndex ( selHnd,selType,nsel );

}


void CMMDBSelManager::SelectCylinder (
             int  selHnd, // must be obtained from NewSelection()
             int selType, // selection type STYPE_XXXXX
             realtype x1, // x-coordinate of the cylinder axis' 1st end
             realtype y1, // y-coordinate of the cylinder axis' 1st end
             realtype z1, // z-coordinate of the cylinder axis' 1st end
             realtype x2, // x-coordinate of the cylinder axis' 2nd end
             realtype y2, // y-coordinate of the cylinder axis' 2nd end
             realtype z2, // z-coordinate of the cylinder axis' 2nd end
             realtype  r, // radius of the cylinder
             int  selKey  // selection key
           )  {
//
//  Selecting a cylinder
//
//  Method : given a line running through (x1,y1,z1) to (x2,y2,z2) on,
//  a point (x,y,z) is then projected on it at distance
//
//              c1 = (c^2-a^2+b^2)/(2c),
//
//  from (x1,y1,z1), where
//      'a' is the distance between (x,y,z) and (x2,y2,z2)
//      'b' is the distance between (x,y,z) and (x1,y1,z1)
//      'c' is the distance between (x1,y1,z1) and (x2,y2,z2).
//  The distance between point (x,y,z) and line is determined as
//
//              h^2 = b^2 - c1^2
//
//  If c1>=0 and c1<=c and h^2<=r^2  then point (x,y,z) is inside
//  a cylinder of radius 'r' with axis running from point
//  (x1,y1,z1) to (x2,y2,z2).
//
int       i,k, nat,sk,nsel, im,ic,ir;
realtype  dx,dy,dz, c,dc,c1,c2, a2,b2, r2;
Boolean   resSel,chainSel,modelSel,selAND;
PPCAtom   A;
PCAtom    atom;
PCResidue res;
PCChain   chain;
PCModel   model;

  if ((selHnd<=0) || (selHnd>nSelections) || (r<=0.0))  return;

  dx = x1-x2;
  dy = y1-y2;
  dz = z1-z2;
  c2 = dx*dx + dy*dy + dz*dz;
  if (c2<=0.0)  return;
  c  = sqrt(c2);
  dc = 2.0*c;
  r2 = r*r;

  k   = selHnd-1;
  sk  = selKey;
  A   = Atom;
  nat = nAtoms;

  if ((SelType[k]==STYPE_UNDEFINED) ||
      (selKey==SKEY_NEW))        SelType[k] = selType;
  else if (SelType[k]!=selType)  return;

  // if something goes wrong, sk should be assigned SKEY_OR if
  // selKey is set to SKEY_NEW or SKEY_OR below
  switch (selKey)  {
    case SKEY_NEW : for (i=0;i<nSelItems[k];i++)
                      if (Selection[k][i])
                          Selection[k][i]->RemoveMask ( Mask[k] );
                    nSelItems[k] = 0;
                    nsel = 0;
                  break;
    case SKEY_OR  : if (nSelItems[k]==0)  sk = SKEY_NEW;
                    nsel = nSelItems[k];
                  break;
    case SKEY_AND : nsel = 0;
                    nat  = nSelItems[k];
                    A    = (PPCAtom)Selection[k];
                  break;
    case SKEY_XOR : nsel = nSelItems[k];
                  break;
    case SKEY_CLR : nsel = nSelItems[k];
                    nat  = nSelItems[k];
                    A    = (PPCAtom)Selection[k];
                  break;
    default       : return;
  }

  selAND = selType==SKEY_AND;

  if ((nat<=0) || (!A))  return;

  if (selType==STYPE_ATOM)  {

    for (i=0;i<nat;i++)
      if (A[i])  {
        if ((!A[i]->Ter) && (A[i]->WhatIsSet & ASET_Coordinates))  {
          dx = fabs(A[i]->x-x1);
          dy = fabs(A[i]->y-y1);
          dz = fabs(A[i]->z-z1);
          a2 = dx*dx + dy*dy + dz*dz;
          dx = fabs(A[i]->x-x2);
          dy = fabs(A[i]->y-y2);
          dz = fabs(A[i]->z-z2);
          b2 = dx*dx + dy*dy + dz*dz;
          c1 = (c2-a2+b2)/dc;
          if ((0.0<=c1) && (c1<=c) && (b2-c1*c1<=r2))
            SelectAtom ( A[i],k,sk,nsel ); 
          else if (sk==SKEY_AND)
            A[i]->RemoveMask ( Mask[k] );
        }
      }

  } else  {

    for (im=0;im<nModels;im++)  {
      model = Model[im];
      if (model)  {
        modelSel = False;
        for (ic=0;ic<model->nChains;ic++)  {
          chain = model->Chain[ic];
          if (chain)  {
            chainSel = False;
            for (ir=0;ir<chain->nResidues;ir++)  {
              res = chain->Residue[ir];
              if (res)  {
                resSel = False;
                for (i=0;i<res->nAtoms;i++)  {
                  atom = res->atom[i];
                  if (atom) {
                    if ((!atom->Ter) && 
                        (atom->WhatIsSet & ASET_Coordinates))  {
                      dx = fabs(atom->x-x1);
                      dy = fabs(atom->y-y1);
                      dz = fabs(atom->z-z1);
                      a2 = dx*dx + dy*dy + dz*dz;
                      dx = fabs(atom->x-x2);
                      dy = fabs(atom->y-y2);
                      dz = fabs(atom->z-z2);
                      b2 = dx*dx + dy*dy + dz*dz;
                      c1 = (c2-a2+b2)/dc;
                      if ((0.0<=c1) && (c1<=c) && (b2-c1*c1<=r2))  {
                        SelectObject ( selType,atom,k,sk,nsel );
                        resSel   = True;
                        chainSel = True;
                        modelSel = True;
                        break;  // selType>=STYPE_RESIDUE
                      }
                    }
                  }
                }
                if ((!resSel) && selAND && (selType==STYPE_RESIDUE))
                  res->RemoveMask ( Mask[k] );
                if (chainSel && (selType>STYPE_RESIDUE))  break;
              }
            }
            if ((!chainSel) && selAND && (selType==STYPE_CHAIN))
              chain->RemoveMask ( Mask[k] );
            if (modelSel && (selType>STYPE_CHAIN))  break;
          }
        }
        if ((!modelSel) && selAND && (selType==STYPE_MODEL))
          model->RemoveMask ( Mask[k] );
      }
    }

  }

  MakeSelIndex ( selHnd,selType,nsel );

}


void CMMDBSelManager::SelectSlab (
             int  selHnd, // must be obtained from NewSelection()
             int selType, // selection type STYPE_XXXXX
             realtype  a, // a-parameter of the plane  ax+by+cz=d
             realtype  b, // b-parameter of the plane  ax+by+cz=d
             realtype  c, // c-parameter of the plane  ax+by+cz=d
             realtype  d, // d-parameter of the plane  ax+by+cz=d
             realtype  r, // distance to the plane
             int  selKey  // selection key
           )  {
//
//  Selecting all atoms on a given distance from a plane
//
//  Method : the distance between a point (x0,y0,z0) and a plane
//  defined by equation
//
//              a*x + b*y + c*z = d
//
//  is found as
//  
//              h = (d-a*x0-b*y0-c*z0)/sqrt(a^2+b^2+c^2)
//  
//  If |h|<d then point (x0,y0,z0) belongs to the slab.
//
int       i,k, nat,sk,nsel, im,ic,ir;
realtype  v,h;
Boolean   resSel,chainSel,modelSel,selAND;
PPCAtom   A;
PCAtom    atom;
PCResidue res;
PCChain   chain;
PCModel   model;

  if ((selHnd<=0) || (selHnd>nSelections) || (r<=0.0))  return;

  v   = sqrt(a*a + b*b + c*c);
  if (v<=0.0)  return;

  k   = selHnd-1;
  sk  = selKey;
  A   = Atom;
  nat = nAtoms;

  if ((SelType[k]==STYPE_UNDEFINED) ||
      (selKey==SKEY_NEW))        SelType[k] = selType;
  else if (SelType[k]!=selType)  return;

  // if something goes wrong, sk should be assigned SKEY_OR if
  // selKey is set to SKEY_NEW or SKEY_OR below
  switch (selKey)  {
    case SKEY_NEW : for (i=0;i<nSelItems[k];i++)
                      if (Selection[k][i])
                          Selection[k][i]->RemoveMask ( Mask[k] );
                    nSelItems[k] = 0;
                    nsel = 0;
                  break;
    case SKEY_OR  : if (nSelItems[k]==0)  sk = SKEY_NEW;
                    nsel = nSelItems[k];
                  break;
    case SKEY_AND : nsel = 0;
                    nat  = nSelItems[k];
                    A    = (PPCAtom)Selection[k];
                  break;
    case SKEY_XOR : nsel = nSelItems[k];
                  break;
    case SKEY_CLR : nsel = nSelItems[k];
                    nat  = nSelItems[k];
                    A    = (PPCAtom)Selection[k];
                  break;
    default       : return;
  }

  selAND = selType==SKEY_AND;

  if ((nat<=0) || (!A))  return;

  if (selType==STYPE_ATOM)  {

    for (i=0;i<nat;i++)
      if (A[i])  {
        if ((!A[i]->Ter) && (A[i]->WhatIsSet & ASET_Coordinates))  {
          h = fabs(d-a*A[i]->x-b*A[i]->y-c*A[i]->z)/v;
          if (h<=r)
            SelectAtom ( A[i],k,sk,nsel ); 
          else if (sk==SKEY_AND)
            A[i]->RemoveMask ( Mask[k] );
        }
      }

  } else  {

    for (im=0;im<nModels;im++)  {
      model = Model[im];
      if (model)  {
        modelSel = False;
        for (ic=0;ic<model->nChains;ic++)  {
          chain = model->Chain[ic];
          if (chain)  {
            chainSel = False;
            for (ir=0;ir<chain->nResidues;ir++)  {
              res = chain->Residue[ir];
              if (res)  {
                resSel = False;
                for (i=0;i<res->nAtoms;i++)  {
                  atom = res->atom[i];
                  if (atom) {
                    if ((!atom->Ter) && 
                        (atom->WhatIsSet & ASET_Coordinates))  {
                      h = fabs(d-a*A[i]->x-b*A[i]->y-c*A[i]->z)/v;
                      if (h<=r)  {
                        SelectObject ( selType,atom,k,sk,nsel );
                        resSel   = True;
                        chainSel = True;
                        modelSel = True;
                        break;  // selType>=STYPE_RESIDUE
                      }
                    }
                  }
                }
                if ((!resSel) && selAND && (selType==STYPE_RESIDUE))
                  res->RemoveMask ( Mask[k] );
                if (chainSel && (selType>STYPE_RESIDUE))  break;
              }
            }
            if ((!chainSel) && selAND && (selType==STYPE_CHAIN))
              chain->RemoveMask ( Mask[k] );
            if (modelSel && (selType>STYPE_CHAIN))  break;
          }
        }
        if ((!modelSel) && selAND && (selType==STYPE_MODEL))
          model->RemoveMask ( Mask[k] );
      }
    }

  }

  MakeSelIndex ( selHnd,selType,nsel );

}


void CMMDBSelManager::SelectNeighbours (
             int  selHnd, // must be obtained from NewSelection()
             int selType, // selection type STYPE_XXXXX
             PPCAtom  sA, // array of already selected atoms
             int    alen, // length of A
             realtype d1, // minimal distance to already selected atoms
             realtype d2, // maximal distance to already selected atoms
             int  selKey  // selection key
                                       )  {
// Selecting all atoms on a given distance from already selected
int       i,j,k, dn, nx,ny,nz, nat,sk,nsel, im,ic,ir;
int       ix1,ix2,ix, iy1,iy2,iy, iz1,iz2,iz;
realtype  x,y,z, dx,dy,dz, dst, d12,d22;
PPCAtom   A;
PCBrick   B;
PCAtom    atom;
PCResidue res;
PCChain   chain;
PCModel   model;
Boolean   ASel,resSel,chainSel,modelSel,selAND;

  if ((selHnd<=0) || (selHnd>nSelections) ||
      (d2<=0.0)   || (d2<d1))  return;

  k   = selHnd-1;
  sk  = selKey;
  A   = Atom;
  nat = nAtoms;
  d12 = d1*d1;
  d22 = d2*d2;

  if ((SelType[k]==STYPE_UNDEFINED) ||
      (selKey==SKEY_NEW))        SelType[k] = selType;
  else if (SelType[k]!=selType)  return;

  if ((alen<1) || (!sA))  {
    if ((selKey==SKEY_NEW) || (selKey==SKEY_AND))  {
      for (i=0;i<nSelItems[k];i++)
        if (Selection[k][i])
          Selection[k][i]->RemoveMask ( Mask[k] );
      nSelItems[k] = 0;
    }
    return;
  }

  // if something goes wrong, sk should be assigned SKEY_OR if
  // selKey is set to SKEY_NEW or SKEY_OR below
  switch (selKey)  {
    case SKEY_NEW : for (i=0;i<nSelItems[k];i++)
                      if (Selection[k][i])
                          Selection[k][i]->RemoveMask ( Mask[k] );
                    nSelItems[k] = 0;
                    nsel = 0;
                  break;
    case SKEY_OR  : if (nSelItems[k]==0)  sk = SKEY_NEW;
                    nsel = nSelItems[k];
                  break;
    case SKEY_AND : nsel = 0;
                    nat  = nSelItems[k];
                    A    = (PPCAtom)Selection[k];
                  break;
    case SKEY_XOR : nsel = nSelItems[k];
                  break;
    case SKEY_CLR : nsel = nSelItems[k];
                    nat  = nSelItems[k];
                    A    = (PPCAtom)Selection[k];
                  break;
    default       : return;
  }

  selAND = (sk==SKEY_AND);

  if ((nat<=0) || (!A))  return;

  MakeBricks ( sA,alen,d2*1.5 );
  dn = mround(d2/brick_size)+1;

  if (Brick && (selType==STYPE_ATOM))  {

    for (i=0;i<nat;i++)
      if (A[i])  {
        if (!A[i]->Ter)  {
          ASel = False;
          GetBrickCoor ( A[i],nx,ny,nz );
          if (nx<0) nx++;
          ix1 = IMax ( 0,nx-dn );
          iy1 = IMax ( 0,ny-dn );
          iz1 = IMax ( 0,nz-dn );
          ix2 = IMin ( nbrick_x,nx+dn+1 );
          iy2 = IMin ( nbrick_y,ny+dn+1 );
          iz2 = IMin ( nbrick_z,nz+dn+1 );
          x   = A[i]->x;
          y   = A[i]->y;
          z   = A[i]->z;
          for (ix=ix1;(ix<ix2) && (!ASel);ix++)
            if (Brick[ix])
              for (iy=iy1;(iy<iy2) && (!ASel);iy++)
                if (Brick[ix][iy])
                  for (iz=iz1;(iz<iz2) && (!ASel);iz++)  {
                    B = Brick[ix][iy][iz];
                    if (B)
                      for (j=0;(j<B->nAtoms) && (!ASel);j++)
                        if (B->Atom[j]!=A[i])  {
                          dx = fabs(x-B->Atom[j]->x);
                          if (dx<=d2)  {
                            dy = fabs(y-B->Atom[j]->y);
                            if (dy<=d2)  {
                              dz = fabs(z-B->Atom[j]->z);
                              if (dz<=d2)  {
                                dst = dx*dx+dy*dy+dz*dz;
                                if ((dst>=d12) && (dst<=d22))  {
                                  ASel = True;
                                  SelectAtom ( A[i],k,sk,nsel );
                                }
                              }
                            }
                          }
                        }
                  }
          if ((!ASel) && selAND)  A[i]->RemoveMask ( Mask[k] );
        }
      }

  } else if (Brick)  {

    for (im=0;im<nModels;im++)  {
      model = Model[im];
      if (model)  {
        modelSel = False;
        for (ic=0;ic<model->nChains;ic++)  {
          chain = model->Chain[ic];
          if (chain)  {
            chainSel = False;
            for (ir=0;ir<chain->nResidues;ir++)  {
              res = chain->Residue[ir];
              if (res)  {
                resSel = False;
                for (i=0;(i<res->nAtoms) && (!resSel);i++)  {
                  atom = res->atom[i];
                  if (atom) {
                    if ((!atom->Ter) && 
                        (atom->WhatIsSet & ASET_Coordinates))  {
                      GetBrickCoor ( atom,nx,ny,nz );
                      if (nx<0) nx++;
                      ix1 = IMax ( 0,nx-dn );
                      iy1 = IMax ( 0,ny-dn );
                      iz1 = IMax ( 0,nz-dn );
                      ix2 = IMin ( nbrick_x,nx+dn+1 );
                      iy2 = IMin ( nbrick_y,ny+dn+1 );
                      iz2 = IMin ( nbrick_z,nz+dn+1 );
                      x   = atom->x;
                      y   = atom->y;
                      z   = atom->z;
                      for (ix=ix1;(ix<ix2) && (!resSel);ix++)
                        if (Brick[ix])
                          for (iy=iy1;(iy<iy2) && (!resSel);iy++)
                            if (Brick[ix][iy])
                              for (iz=iz1;(iz<iz2) && (!resSel);iz++) {
                                B = Brick[ix][iy][iz];
                                if (B)
                                  for (j=0;(j<B->nAtoms) &&
                                           (!resSel);j++)
                                    if (B->Atom[j]!=atom)  {
                                      dx = fabs(x-B->Atom[j]->x);
                                      if (dx<=d2)  {
                                        dy = fabs(y-B->Atom[j]->y);
                                        if (dy<=d2)  {
                                          dz = fabs(z-B->Atom[j]->z);
                                          if (dz<=d2)  {
                                            dst = dx*dx+dy*dy+dz*dz;
                                            if ((dst>=d12) &&
                                                (dst<=d22))  {
                                              SelectObject ( selType,
                                                      atom,k,sk,nsel );
                                              resSel   = True;
                                              chainSel = True;
                                              modelSel = True;
                                            }
                                          }
                                        }
                                      }
                                    }
                              }

                    }
                  }
                }
                if ((!resSel) && selAND && (selType==STYPE_RESIDUE))
                  res->RemoveMask ( Mask[k] );
                if (chainSel && (selType>STYPE_RESIDUE))  break;
              }
            }
            if ((!chainSel) && selAND && (selType==STYPE_CHAIN))
              chain->RemoveMask ( Mask[k] );
            if (modelSel && (selType>STYPE_CHAIN))  break;
          }
        }
        if ((!modelSel) && selAND && (selType==STYPE_MODEL))
          model->RemoveMask ( Mask[k] );
      }
    }

  }

  MakeSelIndex ( selHnd,selType,nsel );

}



int TakeChainID ( pstr & p, pstr chainID )  {
int RC,k;
  chainID[0] = char(0);
  if (*p)  {
    RC = 0;
    if (*p==':')  {
      // starts with colon <=> empty chain ID
      chainID[0] = char(0);
      p++;  // advance to residue number
    } else if (p[1]==':')  {
      // second symbol is colon <=> regular chain ID
      chainID[0] = *p;
      chainID[1] = char(0);
      p++;
      p++;  // advance to residue number
    } else if (*p=='\'')  {
      // starts with a strip <=> assume empty chain ID
      chainID[0] = char(0);
      p++;
      if (*p=='\'')  {
        // closing strip must be followed by colon
        p++;
        if (*p!=':')  RC = -1;
      } else  {
        // no concluding strip <=> could be a strip chain ID,
        // although this must be captured by 2nd "if"
        chainID[0] = '\'';
        chainID[1] = char(0);
        // assume that residue number is following the strip
      }
    } else if ((int(*p)>=int('0')) && (int(*p)<=int('9')))  {
      // a digit without following semicolon looks very much
      // like residue number with unspecified empty chain ID
      chainID[0] = char(0);
      // assume that p already points on residue number
    } else  {
      // assume a long chain ID
      k = 0;
      while (*p && (*p!=':') && (k<sizeof(ChainID)-1)) {
        chainID[k++] = *p;
        p++;
      }
      if (*p==':')  {
        chainID[k] = char(0);
      } else  {
        // a mistake
        chainID[0] = char(0);
        RC = -1;
      }
    }
    while (*p==' ')  p++;
  } else
    RC = 1;
  return RC;
}

int TakeResID( pstr & p, int & seqNum, pstr inscode )  {
char N[100];
int  i,RC;
pstr endptr;
  RC = 1;
  inscode[0] = '*';
  inscode[1] = char(0);
  seqNum     = ANY_RES;
  if ((*p) && 
      ((int(*p)>=int('0')) && (int(*p)<=int('9'))) || (*p=='-'))  {
    N[0] = *p;
    p++;
    i = 1;
    while ((*p) && (int(*p)>=int('0')) && (int(*p)<=int('9')))  {
      N[i++] = *p;
      p++;
    }
    N[i] = char(0);
    seqNum = mround(strtod(N,&endptr));
    if ((seqNum==0) && (endptr==N))
      RC = -1;
    else  {
      RC = 0;
      if ((*p) && (*p!='-') && (*p!=',') && (*p!=' '))  {
        inscode[0] = *p;
        inscode[1] = char(0);
        p++;
      } else
        inscode[0] = char(0);
      if ((*p=='-') || (*p==','))  p++;
    }
    while (*p==' ')  p++;
  }
  return RC;
}


int  CMMDBSelManager::SelectDomain ( int selHnd , cpstr domainRange,
                                     int selType, int   selKey,
                                     int modelNo )  {
// domainRange is of the following format:
//    "*", "(all)"            - take all file
//    "-"                     - take chain without chain ID
//    "a:Ni-Mj,b:Kp-Lq,..."   - take chain a residue number N
//                              insertion code i to residue number M
//                              insertion code j plus chain b
//                              residue number K insertion code p to
//                              residue number L insertion code q and
//                              so on.
//    "a:,b:..."              - take whole chains a and b and so on
//    "a:,b:Kp-Lq,..."        - any combination of the above.
ChainID chainID;
InsCode insCode1,insCode2;
pstr    S,p;
int     seqNum1,seqNum2,rc,selKey1;

  if ((selHnd<=0) || (selHnd>nSelections))  return 1;

  // leave only required residues

  rc = 1;
  if (!domainRange)  rc = 0;
  else if ((!domainRange[0]) || (domainRange[0]=='*'))  rc = 0;
  else if (!strcasecmp(domainRange,"(all)"))  rc = 0;
  if (!rc)  {
    // select all
    Select ( selHnd,selType,modelNo,"*",ANY_RES,"*",ANY_RES,"*",
                                    "*","*","*","*",selKey );
    return 0;
  }
  if (!strcasecmp(domainRange,"-"))  {
    // select chain without chain ID
    Select ( selHnd,selType,modelNo,"",ANY_RES,"*",ANY_RES,"*",
                                    "*","*","*","*",selKey );
    return 0;
  }

  S = new char[strlen(domainRange)+10];
  strcpy    ( S,domainRange );
  DelSpaces ( S );
//  UpperCase ( S );

  p  = S;
  rc = 0;

  selKey1 = selKey;

  while ((*p) && (!rc))  {

    if (TakeChainID(p,chainID)<0)             rc = -1;
    else if (TakeResID(p,seqNum1,insCode1)<0) rc = -2;
    else if (TakeResID(p,seqNum2,insCode2)<0) rc = -3;
    else  {
      Select ( selHnd,selType,modelNo,chainID,
               seqNum1,insCode1,seqNum2,insCode2,
               "*","*","*","*",selKey1 );
      if (*p==',')  p++;
      if (selKey1==SKEY_NEW)  selKey1 = SKEY_OR;
    }

  }

  delete[] S;

  return rc;

}


int CMMDBSelManager::GetSelLength ( int selHnd )  {
  if ((selHnd>0) && (selHnd<=nSelections))
        return nSelItems[selHnd-1];
  else  return 0;
}


void CMMDBSelManager::GetSelIndex ( int       selHnd,
                                    PPCAtom & SelAtom,
                                    int &     nSelAtoms )  {
  if ((selHnd>0) && (selHnd<=nSelections))  {
    if (SelType[selHnd-1]!=STYPE_ATOM)  {
      SelAtom   = NULL;
      nSelAtoms = 0;
    } else  {
      SelAtom   = (PPCAtom)Selection[selHnd-1];
      nSelAtoms = nSelItems[selHnd-1];
    }
  } else  {
    SelAtom   = NULL;
    nSelAtoms = 0;
  }
}

void CMMDBSelManager::GetSelIndex ( int          selHnd,
                                    PPCResidue & SelResidue,
                                    int &        nSelResidues )  {
  if ((selHnd>0) && (selHnd<=nSelections))  {
    if (SelType[selHnd-1]!=STYPE_RESIDUE)  {
      SelResidue   = NULL;
      nSelResidues = 0;
    } else  {
      SelResidue   = (PPCResidue)Selection[selHnd-1];
      nSelResidues = nSelItems[selHnd-1];
    }
  } else  {
    SelResidue   = NULL;
    nSelResidues = 0;
  }
}

void CMMDBSelManager::GetSelIndex ( int        selHnd,
                                    PPCChain & SelChain,
                                    int &      nSelChains )  {
  if ((selHnd>0) && (selHnd<=nSelections))  {
    if (SelType[selHnd-1]!=STYPE_CHAIN)  {
      SelChain   = NULL;
      nSelChains = 0;
    } else  {
      SelChain   = (PPCChain)Selection[selHnd-1];
      nSelChains = nSelItems[selHnd-1];
    }
  } else  {
    SelChain   = NULL;
    nSelChains = 0;
  }
}

void CMMDBSelManager::GetSelIndex ( int        selHnd,
                                    PPCModel & SelModel,
                                    int &      nSelModels )  {
  if ((selHnd>0) && (selHnd<=nSelections))  {
    if (SelType[selHnd-1]!=STYPE_MODEL)  {
      SelModel   = NULL;
      nSelModels = 0;
    } else  {
      SelModel   = (PPCModel)Selection[selHnd-1];
      nSelModels = nSelItems[selHnd-1];
    }
  } else  {
    SelModel   = NULL;
    nSelModels = 0;
  }
}


void CMMDBSelManager::GetAtomStatistics ( int selHnd, RSAtomStat AS )  {
int  i,k;
  AS.Init();
  if ((selHnd>0) && (selHnd<=nSelections))  {
    k = selHnd-1;
    switch (SelType[k])  {
      case STYPE_MODEL   : if (Selection[k])
                             for (i=0;i<nSelItems[k];i++)
                               ((PCModel)Selection[k][i])->
                                 CalcAtomStatistics ( AS );
                       break;
      case STYPE_CHAIN   : if (Selection[k])
                             for (i=0;i<nSelItems[k];i++)
                               ((PCChain)Selection[k][i])->
                                 CalcAtomStatistics ( AS );
                       break;
      case STYPE_RESIDUE : if (Selection[k])
                             for (i=0;i<nSelItems[k];i++)
                               ((PCResidue)Selection[k][i])->
                                 CalcAtomStatistics ( AS );
                       break;
      case STYPE_ATOM    : if (Selection[k])
                             for (i=0;i<nSelItems[k];i++)
                               ((PCAtom)Selection[k][i])->
                                 CalcAtomStatistics ( AS );
                       break;
      default            : break;
    }
  }
  AS.Finish();
}


void CMMDBSelManager::SelectAtom ( PCAtom atom, int   maskNo,
                                   int  selKey, int & nsel )  {
Boolean ASel;
  ASel = atom->CheckMask ( Mask[maskNo] );
  switch (selKey)  {
    default       :
    case SKEY_NEW :
    case SKEY_OR  : if (!ASel)  {
                      atom->SetMask ( Mask[maskNo] );
                      nsel++;
                    }
                  break;
    case SKEY_AND : if (ASel)  nsel++;
                  break;
    case SKEY_XOR : if (ASel)  {
                      atom->RemoveMask ( Mask[maskNo] );
                      nsel--;
                    } else  {
                      atom->SetMask ( Mask[maskNo] );
                      nsel++;
                    }
                  break;
    case SKEY_CLR : if (ASel)  {
                      atom->RemoveMask ( Mask[maskNo] );
                      nsel--;
                    }
  }
}


void CMMDBSelManager::SelectObject ( int selType, PCAtom atom,
                                     int maskNo,  int  selKey,
                                     int & nsel )  {
PCMask  object;
  switch (selType)  {
    default :
    case STYPE_UNDEFINED : return;
    case STYPE_ATOM      : object = atom;                break;
    case STYPE_RESIDUE   : object = atom->GetResidue();  break;
    case STYPE_CHAIN     : object = atom->GetChain  ();  break;
    case STYPE_MODEL     : object = atom->GetModel  ();  break;
  }
  if (!object)  return;
  SelectObject ( object,maskNo,selKey,nsel );
}


void CMMDBSelManager::SelectObject ( PCMask object, int maskNo,
                                     int    selKey, int & nsel )  {
Boolean ASel;
  ASel = object->CheckMask ( Mask[maskNo] );
  switch (selKey)  {
    default        :
    case SKEY_NEW  :
    case SKEY_OR   : if (!ASel)  {
                       object->SetMask ( Mask[maskNo] );
                       nsel++;
                     }
                  break;
    case SKEY_AND  : if (ASel)  nsel++;
                  break;
    case SKEY_XOR  : if (ASel)  {
                       object->RemoveMask ( Mask[maskNo] );
                       nsel--;
                     } else  {
                       object->SetMask ( Mask[maskNo] );
                       nsel++;
                     }
                  break;
    case SKEY_CLR  : if (ASel)  {
                       object->RemoveMask ( Mask[maskNo] );
                       nsel--;
                     }
                  break;
    case SKEY_XAND : if (ASel)  {
                       object->RemoveMask ( Mask[maskNo] );
                       nsel++;
                     }
  }
}


void  CMMDBSelManager::DeleteSelObjects ( int selHnd )  {
PPCModel   model;
PPCChain   chain;
PPCResidue res;
PPCAtom    atom;
int        i,k,nSel;

  if ((selHnd>0) && (selHnd<=nSelections))  {

    k    = selHnd-1;
    nSel = nSelItems[k];
    switch (SelType[k])  {

      case STYPE_MODEL   : model = (PPCModel)Selection[k];
                           for (i=0;i<nSel;i++)
                             delete model[i];
                        break;

      case STYPE_CHAIN   : chain = (PPCChain)Selection[k];
                           for (i=0;i<nSel;i++)
                             delete chain[i];
                        break;

      case STYPE_RESIDUE : res   = (PPCResidue)Selection[k];
                           for (i=0;i<nSel;i++)
                             delete res[i];
                        break;

      case STYPE_ATOM    : atom  = (PPCAtom)Selection[k];
                           for (i=0;i<nSel;i++)
                             delete atom[i];
                        break;

      default : ;

    }

    if (Selection[k])  delete[] Selection[k];
    Selection[k] = NULL;
    nSelItems[k] = 0;

  }

}

// ------------------------------------------------------------------------

void CMMDBSelManager::MakeSelIndex ( int selHnd, int selType, int nsel )  {
// if nsel is less than 0, the number of selected atoms will
// be calculated.
int       k,i,j,n,ns,k1,k2, nns;
PCModel   model;
PCChain   chain;
PCResidue res;

  if ((selHnd>0) && (selHnd<=nSelections))  {
    k1 = selHnd-1;
    k2 = k1+1;
  } else  {
    k1 = 0;
    k2 = nSelections;
  }

  for (k=k1;k<k2;k++)  {
    if (nsel<0)  {
      ns = 0;
      switch (selType)  {
        case STYPE_ATOM    : for (i=0;i<nAtoms;i++)
                               if (Atom[i])
                                 if (Atom[i]->CheckMask(Mask[k]))  ns++;
                          break;
        case STYPE_RESIDUE : for (n=0;n<nModels;n++)  {
                               model = Model[n];
                               if (model)
                                 for (i=0;i<model->nChains;i++) {
                                   chain = model->Chain[i];
                                   if (chain)
                                     for (j=0;j<chain->nResidues;j++) {
                                       res = chain->Residue[j];
                                       if (res)
                                         if (res->CheckMask(Mask[k]))  ns++;
                                     }
                                 }
                             }
                          break;
        case STYPE_CHAIN   : for (i=0;i<nModels;i++)  {
                               model = Model[i];
                               if (model)
                                 for (j=0;j<model->nChains;j++) {
                                   chain = model->Chain[j];
                                   if (chain)
                                     if (chain->CheckMask(Mask[k]))  ns++;
                                 }
                             }
                          break;
        case STYPE_MODEL   : for (i=0;i<nModels;i++)
                               if (Model[i])
                                 if (Model[i]->CheckMask(Mask[k]))  ns++;
                          break;
        default : ;
      }
    } else
      ns = nsel;
    if (Selection[k])  delete[] Selection[k];
    if (ns>0)  {
      Selection[k] = new PCMask[ns];
      nns = 0;
      switch (selType)  {
        case STYPE_ATOM    : for (i=0;i<nAtoms;i++)
                               if (Atom[i])  {
                                 if (Atom[i]->CheckMask(Mask[k]))  {
                                   Selection[k][nns++] = Atom[i];
                                   if (nns>=ns)  nns = ns-1;
                                 }
                               }
                          break;
        case STYPE_RESIDUE : for (n=0;n<nModels;n++)  {
                               model = Model[n];
                               if (model)
                                 for (i=0;i<model->nChains;i++) {
                                   chain = model->Chain[i];
                                   if (chain)
                                     for (j=0;j<chain->nResidues;j++)  {
                                       res = chain->Residue[j];
                                       if (res)
                                         if (res->CheckMask(Mask[k]))  {
                                           Selection[k][nns++] = res;
                                           if (nns>=ns)  nns = ns-1;
                                         }
                                     }
                                 }
                             }
                          break;
        case STYPE_CHAIN   : for (i=0;i<nModels;i++)  {
                               model = Model[i];
                               if (model)
                                 for (j=0;j<model->nChains;j++) {
                                   chain = model->Chain[j];
                                   if (chain)
                                     if (chain->CheckMask(Mask[k]))  {
                                       Selection[k][nns++] = chain;
                                       if (nns>=ns)  nns = ns-1;
                                     }
                                 }
                             }
                          break;
        case STYPE_MODEL   : for (i=0;i<nModels;i++)
                               if (Model[i])
                                 if (Model[i]->CheckMask(Mask[k]))  {
                                   Selection[k][nns++] = Model[i];
                                   if (nns>=ns)  nns = ns-1;
                                 }
                          break;
        default : ;
      }

    } else
      Selection[k] = NULL;

    nSelItems[k] = ns;
  }

}


//  -------------------  Stream functions  ----------------------


void  CMMDBSelManager::write ( RCFile f )  {
int  i;
byte Version=1;

  f.WriteByte ( &Version );

  CMMDBCoorManager::write ( f );

  f.WriteInt ( &nSelections );
  for (i=0;i<nSelections;i++)  {
    StreamWrite ( f,Mask[i]       );
    f.WriteInt  ( &(nSelItems[i]) );
    f.WriteInt  ( &(SelType[i])   );
  }

}

void  CMMDBSelManager::read ( RCFile f )  {
int  i;
byte Version;

  f.ReadByte ( &Version );

  DeleteAllSelections();

  CMMDBCoorManager::read ( f );

  f.ReadInt ( &nSelections );
  if (nSelections>0)  {
    Mask      = new PCMask [nSelections];
    Selection = new PPCMask[nSelections];
    nSelItems = new int    [nSelections];
    SelType   = new int    [nSelections];
    for (i=0;i<nSelections;i++)  {
      Mask[i] = NULL;
      StreamRead   ( f,Mask[i]         );
      f.ReadInt    ( &(nSelItems[i])   );
      f.ReadInt    ( &(SelType[i])     );
      Selection[i] = NULL;
      if (Mask[i])
           MakeSelIndex ( i+1,SelType[i],-1 );
      else nSelItems[i] = 0;
    }
  }

}


MakeStreamFunctions(CMMDBSelManager)
