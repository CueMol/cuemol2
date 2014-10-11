//  $Id: mmdb_manager.cpp,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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
//  **** Module  :  mmdb_manager  <implementation>
//       ~~~~~~~~~
//  **** Project :  MacroMolecular Data Base (MMDB)
//       ~~~~~~~~~
//  **** Classes :  CMMDBManager  ( MMDB file manager class )
//       ~~~~~~~~~
//
//  (C) E. Krissinel 2000-2009
//
//  =================================================================
//


#ifndef  __STRING_H
#include <string.h>
#endif

#ifndef  __MMDB_Manager__
#include "mmdb_manager.h"
#endif


//  =====================   CMMDBManager   =======================

CMMDBManager::CMMDBManager() : CMMDBBondManager()  {
}

CMMDBManager::CMMDBManager ( RPCStream Object )
            : CMMDBBondManager(Object)  {
}

CMMDBManager::~CMMDBManager()  {}

void  CMMDBManager::Copy ( PCMMDBManager MMDB, word CopyMask )  {
int i;

  if (CopyMask & MMDBFCM_Flags)  Flags = MMDB->Flags;

  if (CopyMask & MMDBFCM_Title)  Title.Copy ( &(MMDB->Title) );
  if (CopyMask & MMDBFCM_Cryst)  Cryst.Copy ( &(MMDB->Cryst) );

  if (CopyMask & MMDBFCM_Coord)  {

    FreeCoordMemory    ();
    DeleteAllSelections();

    nAtoms = MMDB->nAtoms;
    AtmLen = nAtoms;
    if (nAtoms>0)  {
      Atom = new PCAtom[AtmLen];
      for (i=0;i<nAtoms;i++)  {
        if (MMDB->Atom[i])  {
          Atom[i] = newCAtom();
          Atom[i]->Copy ( MMDB->Atom[i] );
          // the internal atom references are installed
          // by residue classes when they are read in
          // model->chain below
          Atom[i]->SetAtomIndex ( i+1 );
        } else
          Atom[i] = NULL;
      } 
    }

    nModels = MMDB->nModels;
    if (nModels>0)  {
      Model = new PCModel[nModels];
      for (i=0;i<nModels;i++)  {
        if (MMDB->Model[i])  {
          Model[i] = newCModel();
          Model[i]->SetMMDBManager ( this,0 );
          Model[i]->_copy ( MMDB->Model[i] );
        } else
          Model[i] = NULL;
      } 
    }

    crModel = NULL;
    crChain = NULL;
    crRes   = NULL;

    if (MMDB->crModel)  {

      for (i=0;i<nModels;i++)
        if (Model[i])  {
          if (Model[i]->serNum==MMDB->crModel->serNum)  {
            crModel = Model[i];
            break;
          }
        }

      if (crModel && crModel->Chain && MMDB->crChain)
        for (i=0;i<crModel->nChains;i++)
          if (crModel->Chain[i])  {
            if (!strcmp(crModel->Chain[i]->chainID,
                        MMDB->crModel->Chain[i]->chainID))  {
              crChain = crModel->Chain[i];
              break;
            }
          }

      if (crChain && crChain->Residue && MMDB->crRes)
        for (i=0;i<crChain->nResidues;i++)
          if (crChain->Residue[i])  {
            if ((!strcmp(crChain->Residue[i]->name,
                         MMDB->crRes->name))                       &&
                (crChain->Residue[i]->seqNum==MMDB->crRes->seqNum) &&
                (!strcmp(crChain->Residue[i]->insCode,
                         MMDB->crRes->insCode)))  {
              crRes = crChain->Residue[i];
              break;
            }
          }
    }

    /*
    if ((MMDB->nSelections>0) && MMDB->Mask)  {
      nSelections = MMDB->nSelections;
      if (nSelections>0)  {
        Mask      = new PCMask [nSelections];
        SelAtom   = new PPCAtom[nSelections];
        nSelAtoms = new int    [nSelections];
        for (i=0;i<nSelections;i++)  {
          Mask[i] = new CMask();
          Mask[i]->CopyMask ( MMDB->Mask[i] );
          nSelAtoms[i] = MMDB->nSelAtoms[i];
          if (nSelAtoms[i]>0)  {
            SelAtom[i] = new PCAtom[nSelAtoms[i]];
            for (j=0;j<nSelAtoms[i];j++)
              SelAtom[i][j] = Atom[MMDB->SelAtom[i][j]->index];
          } else
            SelAtom[i] = NULL;
        }
      }
    }
    */

  }
 
  if (CopyMask & MMDBFCM_SA)  SA.Copy ( &(MMDB->SA) );
  if (CopyMask & MMDBFCM_SB)  SB.Copy ( &(MMDB->SB) );
  if (CopyMask & MMDBFCM_SC)  SC.Copy ( &(MMDB->SC) );
  if (CopyMask & MMDBFCM_Footnotes)
                       Footnote.Copy ( &(MMDB->Footnote) );

  if (CopyMask & MMDBFCM_Buffer)  {
    lcount = MMDB->lcount;
    strncpy ( S,MMDB->S,sizeof(S) );
  }

} 

void  CMMDBManager::Delete ( word DelMask )  {
PPCModel model;
PPCChain chain;
int      i,j,nm, nchains;

  if (DelMask & MMDBFCM_Flags)  Flags = 0;

  if (DelMask & MMDBFCM_Title)        Title.Copy ( NULL );
  if (DelMask & MMDBFCM_TitleKeepBM)  Title.FreeMemory ( True );
  if (DelMask & MMDBFCM_Cryst)        Cryst.Copy ( NULL );

  if (DelMask & MMDBFCM_Coord)  {
    FreeCoordMemory    ();
    DeleteAllSelections();
  }

  if (DelMask & MMDBFCM_SecStruct)  {
    GetModelTable ( model,nm );
    if (model)
      for (i=0;i<nm;i++)
        if (model[i])
          model[i]->RemoveSecStructure();
  }

  if (DelMask & MMDBFCM_HetInfo)  {
    GetModelTable ( model,nm );
    if (model)
      for (i=0;i<nm;i++)
        if (model[i])
          model[i]->RemoveHetInfo();
  }

  if (DelMask & MMDBFCM_Links)  {
    GetModelTable ( model,nm );
    if (model)
      for (i=0;i<nm;i++)
        if (model[i])
          model[i]->RemoveLinks();
  }

  if (DelMask & MMDBFCM_CisPeps)  {
    GetModelTable ( model,nm );
    if (model)
      for (i=0;i<nm;i++)
        if (model[i])
          model[i]->RemoveCisPeps();
  }

  if (DelMask & MMDBFCM_ChainAnnot)  {
    nm = GetNumberOfModels();
    for (i=1;i<=nm;i++)  {
      GetChainTable ( i,chain,nchains );
      if (chain)
        for (j=0;j<nchains;j++)
          if (chain[j])
            chain[j]->FreeAnnotations();
    }
  }
 
  if (DelMask & MMDBFCM_SA)        SA.FreeContainer();
  if (DelMask & MMDBFCM_SB)        SB.FreeContainer();
  if (DelMask & MMDBFCM_SC)        SC.FreeContainer();
  if (DelMask & MMDBFCM_Footnotes) Footnote.FreeContainer();

  if (DelMask & MMDBFCM_Buffer)  {
    lcount = 0;
    S[0]   = char(0);
  }

}

PCTitleContainer CMMDBManager::GetRemarks()  {
  return Title.GetRemarks();
}

realtype CMMDBManager::GetResolution()  {
  return Title.GetResolution();
}

int CMMDBManager::ParseBiomolecules()  {
  return Title.ParseBiomolecules();
}

int CMMDBManager::GetNofBiomolecules()  {
  return Title.GetNofBiomolecules();
}

void CMMDBManager::GetBiomolecules ( PPCBiomolecule & BM,
                                     int & nBMs )  {
  Title.GetBiomolecules ( BM,nBMs );
}

PCBiomolecule CMMDBManager::GetBiomolecule ( int bmNo )  {
  return Title.GetBiomolecule ( bmNo );
}

PCMMDBManager CMMDBManager::MakeBiomolecule ( int bmNo, int modelNo ) {
PCMMDBManager M;
PPCChain      ch;
PCChain       chain;
PCModel       model;
PCBiomolecule BM;
int           i,j,k,n,n0,nChains;

  BM = Title.GetBiomolecule ( bmNo );
  if (!BM)  return NULL;

  GetChainTable ( modelNo,ch,nChains );
  if ((!ch) || (nChains<=0))  return NULL;

  n0    = 0;
  model = new CModel();

  for (i=0;(i<BM->nBMAs) && (n0>=0);i++)
    if (BM->BMApply[i])  {
      for (j=0;(j<BM->BMApply[i]->nMatrices) && (n0>=0);j++)
        for (k=0;(k<BM->BMApply[i]->nChains) && (n0>=0);k++)  {
          n0 = -1;
          for (n=0;(n<nChains) && (n0<0);n++)
            if (!strcmp(ch[n]->GetChainID(),BM->BMApply[i]->chain[k]))
              n0 = n;
          if (n0>=0)  {
            chain = new CChain();
            chain->Copy ( ch[n0] );
            chain->ApplyTransform ( BM->BMApply[i]->tm[j] );
            model->AddChain ( chain );
          }
        }
    }

  if (n0>=0)  {
    M = new CMMDBManager();
    M->AddModel ( model );
    M->PDBCleanup ( PDBCLEAN_SERIAL | PDBCLEAN_INDEX );
  } else  {
    delete model;
    M = NULL;
  }

  return M;

}


//  -------------------  Stream functions  ----------------------


void  CMMDBManager::write ( RCFile f )  {
byte Version=1;
  f.WriteByte ( &Version );
  CMMDBBondManager::write ( f );
}

void  CMMDBManager::read ( RCFile f )  {
byte Version;
  f.ReadByte ( &Version );
  CMMDBBondManager::read ( f );
}


MakeStreamFunctions(CMMDBManager)
