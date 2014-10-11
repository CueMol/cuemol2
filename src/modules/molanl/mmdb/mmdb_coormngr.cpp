//  $Id: mmdb_coormngr.cpp,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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
//    26.01.09   <--  Date of Last Modification.
//                   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//  -----------------------------------------------------------------
//
//  **** Module  :  mmdb_coormngr  <implementation>
//       ~~~~~~~~~
//  **** Project :  MacroMolecular Data Base (MMDB)
//       ~~~~~~~~~
//  **** Classes :  CBrick           ( space brick                  )
//       ~~~~~~~~~  CMBrick          ( "multiple" space brick       )
//                  CMMDBCoorManager ( MMDB atom coordinate manager )
//
//  Copyright (C) E. Krissinel 2000-2009
//
//  =================================================================
//

#ifndef  __MATH_H
#include <math.h>
#endif

#ifndef  __STRING_H
#include <string.h>
#endif

#ifndef  __LinAlg__
#include "linalg_.h"
#endif

#ifndef  __MMDB_CoorMngr__
#include "mmdb_coormngr.h"
#endif

#ifndef  __MMDB_Tables__
#include "mmdb_tables.h"
#endif


// ===========================  CBrick  ==============================

CBrick::CBrick()  {
  InitBrick();
}

CBrick::~CBrick()  {
  Clear();
}

void  CBrick::InitBrick()  {
  Atom        = NULL;
  id          = NULL;
  nAtoms      = 0;
  nAllocAtoms = 0;
}

void  CBrick::Clear()  {
  if (Atom)  delete[] Atom;
  FreeVectorMemory ( id,0 );
  Atom        = NULL;
  nAtoms      = 0;
  nAllocAtoms = 0;
}

void  CBrick::AddAtom ( PCAtom A, int atomid )  {
int     i;
PPCAtom Atom1;
ivector id1;
  if (nAtoms>=nAllocAtoms)  {
    nAllocAtoms = nAtoms+10;
    Atom1       = new PCAtom[nAllocAtoms];
    GetVectorMemory ( id1,nAllocAtoms,0 );
    for (i=0;i<nAtoms;i++)  {
      Atom1[i] = Atom[i];
      id1  [i] = id  [i];
    }
    for (i=nAtoms;i<nAllocAtoms;i++)  {
      Atom1[i] = NULL;
      id1  [i] = -1;
    }
    if (Atom)  delete[] Atom;
    FreeVectorMemory ( id,0 );
    Atom = Atom1;
    id   = id1;
  }
  Atom[nAtoms] = A;
  id  [nAtoms] = atomid;
  nAtoms++;
}


// ===========================  CMBrick  =============================

CMBrick::CMBrick ( int nStructures )  {
  InitMBrick ( nStructures );
}

CMBrick::~CMBrick()  {
  Clear();
}

void  CMBrick::InitMBrick ( int nStructures )  {
int i;
  nStruct = nStructures;
  Atom   = new PPCAtom[nStruct];
  id     = new ivector[nStruct];
  GetVectorMemory ( nAtoms,nStruct,0 );
  GetVectorMemory ( nAllocAtoms,nStruct,0 );
  for (i=0;i<nStruct;i++)  {
    Atom       [i] = NULL;
    id         [i] = NULL;
    nAtoms     [i] = 0;
    nAllocAtoms[i] = 0;
  }
}

void  CMBrick::Clear()  {
int i;
  if (Atom)  {
    for (i=0;i<nStruct;i++)
      if (Atom[i])  delete[] Atom[i];
    delete[] Atom;
    Atom = NULL;
  }
  FreeMatrixMemory ( id,nStruct,0,0 );
  FreeVectorMemory ( nAtoms,0 );
  FreeVectorMemory ( nAllocAtoms,0 );
  nStruct = 0;
}

void  CMBrick::AddAtom ( PCAtom A, int structNo, int atomid )  {
int     i,natoms,nalloc;
PPCAtom Atom0,Atom1;
ivector id0,id1;
  natoms = nAtoms     [structNo];
  nalloc = nAllocAtoms[structNo];
  Atom0  = Atom       [structNo];
  id0    = id         [structNo];
  if (natoms>=nalloc)  {
    nalloc = natoms+10;
    Atom1 = new PCAtom[nalloc];
    GetVectorMemory ( id1,nalloc,0 );
    for (i=0;i<natoms;i++)  {
      Atom1[i] = Atom0[i];
      id1  [i] = id0  [i];
    }
    for (i=natoms;i<nalloc;i++)  {
      Atom1[i] = NULL;
      id1  [i] = -1;
    }
    if (Atom0)  delete[] Atom0;
    FreeVectorMemory ( id0,0 );
    Atom[structNo] = Atom1;
    id  [structNo] = id1;
    nAllocAtoms[structNo] = nalloc;
    Atom0 = Atom1;
    id0   = id1;
  }
  Atom0 [natoms]   = A;
  id0   [natoms]   = atomid;
  nAtoms[structNo] = natoms+1;
}



//  ====================  CGenSym  ========================

CGenSym::CGenSym() : CSymOps()  {
  InitGenSym();
}

CGenSym::CGenSym ( RPCStream Object ) : CSymOps(Object)  {
  InitGenSym();
}

CGenSym::~CGenSym()  {}  // virtual FreeMmeory is called by ~CSymOps()

void CGenSym::InitGenSym()  {
  chID1    = NULL;
  chID2    = NULL;
  nChains  = NULL;
  nOpAlloc = 0;
}

void CGenSym::FreeMemory()  {
int i;
  for (i=0;i<nOpAlloc;i++)  {
    if (chID1[i]) delete[] chID1[i];
    if (chID2[i]) delete[] chID2[i];
  }
  if (chID1) delete[] chID1;
  if (chID2) delete[] chID2;
  FreeVectorMemory ( nChains,0 );
  nOpAlloc = 0;
  CSymOps::FreeMemory();
}

int CGenSym::AddSymOp ( cpstr XYZOperation )  {
int        RC,i;
PChainID * ch1ID;
PChainID * ch2ID;
ivector    nChains1;

  RC = CSymOps::AddSymOp ( XYZOperation );
  if (Nops>nOpAlloc)  {
    ch1ID = new PChainID[Nops];
    ch2ID = new PChainID[Nops];
    GetVectorMemory ( nChains1,Nops,0 );
    for (i=0;i<nOpAlloc;i++)  {
      ch1ID[i]    = chID1[i];
      ch2ID[i]    = chID2[i];
      nChains1[i] = nChains[i];
    }
    for (i=nOpAlloc;i<Nops;i++)  {
      ch1ID[i]    = NULL;
      ch2ID[i]    = NULL;
      nChains1[i] = 0;
    }
    if (chID1)  delete[] chID1;
    if (chID2)  delete[] chID2;
    FreeVectorMemory ( nChains,0 );
    chID1    = ch1ID;
    chID2    = ch2ID;
    nChains  = nChains1;
    nOpAlloc = Nops;
  }
  return RC;
}

int  CGenSym::AddRenChain ( int Nop, const ChainID ch1,
                                     const ChainID ch2 )  {
int      i;
PChainID c1,c2;
  if ((0<=Nop) && (Nop<Nops))  {
    c1 = new ChainID[nChains[Nop]+1];
    c2 = new ChainID[nChains[Nop]+1];
    for (i=0;i<nChains[Nop];i++)  {
      strcpy ( c1[i],chID1[Nop][i] );
      strcpy ( c2[i],chID2[Nop][i] );
    }
    strcpy ( c1[nChains[Nop]],ch1 );
    strcpy ( c2[nChains[Nop]],ch2 );
    if (chID1[Nop])  delete[] chID1[Nop];
    if (chID2[Nop])  delete[] chID2[Nop];
    chID1[Nop] = c1;
    chID2[Nop] = c2;
    nChains[Nop]++;
    return SYMOP_Ok;
  } else
    return SYMOP_NoSymOps;
}

void CGenSym::Copy ( PCSymOps GenSym )  {
int i,j;
  CSymOps::Copy ( GenSym );
  if (Nops>0)  {
    nOpAlloc = Nops;
    chID1 = new PChainID[Nops];
    chID2 = new PChainID[Nops];
    GetVectorMemory ( nChains,Nops,0 );
    for (i=0;i<Nops;i++)  {
      nChains[i] = PCGenSym(GenSym)->nChains[i];
      if (nChains[i]<=0)  {
        chID1[i] = NULL;
        chID2[i] = NULL;
      } else  {
        chID1[i] = new ChainID[nChains[i]];
        chID2[i] = new ChainID[nChains[i]];
        for (j=0;j<nChains[i];j++)  {
          strcpy ( chID1[i][j],PCGenSym(GenSym)->chID1[i][j] );
          strcpy ( chID2[i][j],PCGenSym(GenSym)->chID2[i][j] );
        }
      }
    }
  }
}

void  CGenSym::write ( RCFile f )  {
int  i,j;
byte Version=1;
  f.WriteByte ( &Version  );
  CSymOps::write ( f );
  f.WriteInt ( &nOpAlloc );
  for (i=0;i<nOpAlloc;i++)  {
    f.WriteInt ( &(nChains[i]) );
    for (j=0;j<nChains[i];j++)  {
      f.WriteTerLine ( chID1[i][j],False );
      f.WriteTerLine ( chID2[i][j],False );
    }
  }
}

void  CGenSym::read ( RCFile f )  {
int  i,j;
byte Version;
  f.ReadByte ( &Version  );
  CSymOps::read ( f );
  f.ReadInt ( &nOpAlloc );
  if (nOpAlloc>0)  {
    chID1 = new PChainID[nOpAlloc];
    chID2 = new PChainID[nOpAlloc];
    GetVectorMemory ( nChains,nOpAlloc,0 );
    for (i=0;i<nOpAlloc;i++)  {
      f.ReadInt ( &(nChains[i]) );
      if (nChains[i]>0)  {
        chID1[i] = new ChainID[nChains[i]];
        chID2[i] = new ChainID[nChains[i]];
        for (j=0;j<nChains[i];j++)  {
          f.ReadTerLine ( chID1[i][j],False );
          f.ReadTerLine ( chID2[i][j],False );
        }
      } else  {
        chID1[i] = NULL;
        chID2[i] = NULL;
      }
    }
  }
}


MakeStreamFunctions(CGenSym)



// =======================  CContactIndex  ==========================

void SContact::Copy ( RSContact c )  {
  id1   = c.id1;
  id2   = c.id2;
  group = c.group;
  dist  = c.dist;
}

void SContact::Swap ( RSContact c )  {
int      ib;
long     lb;
realtype rb;
  ib = id1;     id1   = c.id1;     c.id1   = ib;
  ib = id2;     id2   = c.id2;     c.id2   = ib;
  lb = group;   group = c.group;   c.group = lb;
  rb = dist;    dist  = c.dist;    c.dist  = rb;
}

DefineClass(CContactIndex)

class CContactIndex  {

  friend class CMMDBSelManager;

  public :

    CContactIndex ( PSContact contact,
                    int       maxlen,
                    int       ncontacts,
                    int       max_alloc );
    ~CContactIndex();

    void AddContact ( int id1, int id2,   realtype dist, int group  );
    void GetIndex   ( RPSContact contact, int & ncontacts );

  protected :

    PSContact contact_index; // contact index
    int       max_index;     // if <=0 then dynamical index
                             // otherwise fixed by max_index
    int       n_contacts;    // number of contacts
    int       alloc_index;   // physical length of contact_index
                             // when dynamical
    int       alloc_max;     // physical limit on allocation

};


CContactIndex::CContactIndex ( PSContact contact,
                               int       maxlen,
                               int       ncontacts,
                               int       max_alloc )  {
  contact_index = contact;
  max_index     = maxlen;
  if (!contact_index)  n_contacts = 0;
                 else  n_contacts = IMax(0,ncontacts);
  alloc_index = n_contacts;
  alloc_max   = n_contacts + max_alloc;
}

CContactIndex::~CContactIndex() {
  if (contact_index)  delete[] contact_index;
  contact_index = NULL;
  n_contacts    = 0;
  alloc_index   = 0;
}

void CContactIndex::AddContact ( int id1, int id2, realtype dist,
                                 int group )  {
PSContact cont1;
int       i;

  if ((alloc_max<=0) || (n_contacts<alloc_max))  {
    if (max_index>0)  {
      if (n_contacts<max_index)  {
        contact_index[n_contacts].id1   = id1;
        contact_index[n_contacts].id2   = id2;
        contact_index[n_contacts].dist  = dist;
        contact_index[n_contacts].group = group;
      }
    } else  {
      if (n_contacts>=alloc_index)  {
        alloc_index = n_contacts+IMax(alloc_index/4+10,10);
        if ((alloc_max>0) && (alloc_index>alloc_max))
          alloc_index = alloc_max;
        cont1 = new SContact[alloc_index];
        for (i=0;i<n_contacts;i++)
          cont1[i].Copy ( contact_index[i] );
        if (contact_index)  delete[] contact_index;
        contact_index = cont1;
      }
      contact_index[n_contacts].id1   = id1;
      contact_index[n_contacts].id2   = id2;
      contact_index[n_contacts].dist  = dist;
      contact_index[n_contacts].group = group;
    }
    n_contacts++;
  }
}

void  CContactIndex::GetIndex ( RPSContact contact, int & ncontacts )  {
  contact       = contact_index;
  ncontacts     = n_contacts;
  contact_index = NULL;
  n_contacts    = 0;
  alloc_index   = 0;
}


// ========================  CMContact  =============================

CMContact::CMContact ( int nStructures )  {
int i;
  nStruct = nStructures;
  if (nStruct>0)  {
    Atom = new PPCAtom[nStruct];
    id   = new ivector[nStruct];
    GetVectorMemory ( nAtoms,nStruct,0 );
    GetVectorMemory ( nAlloc,nStruct,0 );
    for (i=0;i<nStruct;i++)  {
      Atom  [i] = NULL;
      id    [i] = NULL;
      nAtoms[i] = 0;
      nAlloc[i] = 0;
    }
  } else  {
    Atom   = NULL;
    nAtoms = NULL;
    nAlloc = NULL;
  }
}

CMContact::~CMContact()  {
int i;
  if (Atom)  {
    for (i=0;i<nStruct;i++)
      if (Atom[i])  delete[] Atom[i];
    delete[] Atom;
    Atom = NULL;
  }
  FreeMatrixMemory ( id,nStruct,0,0 );
  FreeVectorMemory ( nAtoms,0 );
  FreeVectorMemory ( nAlloc,0 );
  nStruct = 0;
}

void CMContact::AddContact ( PCAtom A, int structNo, int atomid )  {
PPCAtom A1,A2;
ivector id1,id2;
int     nat,nal,i;
  A1  = Atom  [structNo];
  id1 = id    [structNo];
  nat = nAtoms[structNo];
  nal = nAlloc[structNo];
  if (nat>=nal)  {
    nal = nat+10;
    A2  = new PCAtom[nal];
    GetVectorMemory ( id2,nal,0 );
    for (i=0;i<nat;i++)  {
      A2 [i] = A1 [i];
      id2[i] = id1[i];
    }
    for (i=nat;i<nal;i++)  {
      A2 [i] = NULL;
      id2[i] = 0;
    }
    if (A1)  delete[] A1;
    FreeVectorMemory ( id1,0 );
    Atom[structNo] = A2;
    id  [structNo] = id2;
    A1  = A2;
    id1 = id2;
    nAlloc[structNo] = nal;
  }
  A1 [nat] = A;
  id1[nat] = atomid;
  nAtoms[structNo] = nat+1;
}


void  DeleteMContacts ( PPCMContact & mcontact, int nContacts )  {
int i;
  if (mcontact)  {
    for (i=0;i<nContacts;i++)
      if (mcontact[i])  delete mcontact[i];
    delete[] mcontact;
    mcontact = NULL;
  }
}


//  ====================   CMMDBCoorManager   =====================

CMMDBCoorManager::CMMDBCoorManager() : CMMDBFile()  {
  InitMMDBCoorManager();
}

CMMDBCoorManager::CMMDBCoorManager ( RPCStream Object )
                : CMMDBFile(Object)  {
  InitMMDBCoorManager();
}

CMMDBCoorManager::~CMMDBCoorManager()  {
  RemoveBricks ();
  RemoveMBricks();
}

void  CMMDBCoorManager::ResetManager()  {
  CMMDBFile::ResetManager();
  RemoveBricks       ();
  RemoveMBricks      ();
  InitMMDBCoorManager();
}

void  CMMDBCoorManager::InitMMDBCoorManager()  {

  CoorIDCode  = CID_Ok;

  brick_size  = 6.0;  // angstroms
  xbrick_0    = 0.0;
  ybrick_0    = 0.0;
  zbrick_0    = 0.0;
  nbrick_x    = 0;
  nbrick_y    = 0;
  nbrick_z    = 0;
  Brick       = NULL;

  mbrick_size = 6.0;  // angstroms
  xmbrick_0   = 0.0;
  ymbrick_0   = 0.0;
  zmbrick_0   = 0.0;
  nmbrick_x   = 0;
  nmbrick_y   = 0;
  nmbrick_z   = 0;
  MBrick      = NULL;

}


int  CMMDBCoorManager::SetDefaultCoorID ( cpstr CID )  {
  return DefPath.SetPath ( CID );
}

PCModel CMMDBCoorManager::GetFirstDefinedModel()  {
PCModel mdl;
int     i;
  mdl = NULL;
  for (i=0;(i<nModels) && (!mdl);i++)
    mdl = Model[i];
  return mdl;
}

int CMMDBCoorManager::GetFirstModelNum()  {
PCModel mdl;
int     i;
  mdl = NULL;
  for (i=0;(i<nModels) && (!mdl);i++)
    mdl = Model[i];
  if (mdl)  return mdl->GetSerNum();
  return 1;
}


PCModel CMMDBCoorManager::GetModel ( int modelNo )  {
  if ((modelNo>=1) && (modelNo<=nModels))
        return Model[modelNo-1];
  else  return NULL;
}

PCModel CMMDBCoorManager::GetModel ( cpstr CID )  {
int      modno,sn,rc;
ChainID  chname;
InsCode  ic;
ResName  resname;
AtomName aname;
Element  elname;
AltLoc   aloc;

  CoorIDCode = CID_Ok;
  rc = ParseAtomPath ( CID,modno,chname,sn,ic,resname,
                       aname,elname,aloc,&DefPath );
  if ((rc<0) || (rc & APATH_WC_ModelNo))  {
    CoorIDCode = CID_WrongPath;
    return NULL;
  }

  if ((modno>=1) && (modno<=nModels))
        return Model[modno-1];
  else  return NULL;

}

void CMMDBCoorManager::GetModelTable ( PPCModel & modelTable,
                                       int & NumberOfModels )  {
  NumberOfModels = nModels;
  modelTable     = Model;
}

int CMMDBCoorManager::DeleteModel ( int modelNo )  {
  if ((modelNo>=1) && (modelNo<=nModels))  {
    if (Model[modelNo-1])  {
      Exclude = False;
      delete Model[modelNo-1];
      Model[modelNo-1] = NULL;
      Exclude = True;
      return 1;
    }
  }
  return 0;
}

int CMMDBCoorManager::DeleteModel ( cpstr CID )  {
int      modno,sn,rc;
ChainID  chname;
InsCode  ic;
ResName  resname;
AtomName aname;
Element  elname;
AltLoc   aloc;

  CoorIDCode = CID_Ok;
  rc = ParseAtomPath ( CID,modno,chname,sn,ic,resname,
                       aname,elname,aloc,&DefPath );
  if ((rc<0) || (rc & APATH_WC_ModelNo))  {
    CoorIDCode = CID_WrongPath;
    return 0;
  }

  if ((modno>=1) && (modno<=nModels))  {
    if (Model[modno-1])  {
      Exclude = False;
      delete Model[modno-1];
      Model[modno-1] = NULL;
      Exclude = True;
      return 1;
    }
  }

  return 0;

}


int CMMDBCoorManager::DeleteSolvent()  {
int i,k;
  Exclude = False;
  k = 0;
  for (i=0;i<nModels;i++)
    if (Model[i])  {
      k += Model[i]->DeleteSolvent();
      Model[i]->TrimChainTable();
      if (Model[i]->nChains<=0)  {
        delete Model[i];
        Model[i] = NULL;
      }
    }
  Exclude = True;
  return k;
}


//  ----------------  Adding/Inserting models  ---------------

int  CMMDBCoorManager::AddModel ( PCModel model )  {
PPCModel model1;
int      i,nnat,nat1;

  for (i=0;i<nModels;i++)
    if (Model[i]==model)  return -i;

  nnat = model->GetNumberOfAtoms ( True );
  AddAtomArray ( nnat );         // get space for new atoms

  if (model->GetCoordHierarchy())  {
    SwitchModel ( nModels+1 ); // get one more model at the end
    nat1 = nAtoms;
    Model[nModels-1]->_copy ( model,Atom,nat1 );
    Model[nModels-1]->serNum = nModels;
    nAtoms = nat1;
  } else  {
    model1 = new PCModel[nModels+1];
    for (i=0;i<nModels;i++)
      model1[i] = Model[i];
    if (Model)  delete[] Model;
    Model = model1;
    Model[nModels] = model;
    Model[nModels]->SetMMDBManager ( PCMMDBManager(this),nModels+1 );
    Model[nModels]->CheckInAtoms();
    nModels++;
  }

  return nModels;
  
}

int  CMMDBCoorManager::InsModel ( PCModel model, int modelNo )  {
  AddModel     ( model );
  RotateModels ( modelNo,nModels,1 );
  return nModels;
}

void CMMDBCoorManager::RotateModels ( int modelNo1, int modelNo2,
                                      int rotdir )  {
PCModel model;
PPCAtom A;
int     m1,m2,i11,i12,i21,i22,nat,i,k;

  m1 = IMax ( 0,modelNo1-1 );
  m2 = IMin ( nModels,modelNo2) - 1;
  if (m1>m2)  ISwap ( m1,m2 );

  if (m1!=m2)  {

    if (Model[m1] && Model[m2])  {
      Model[m1]->GetAIndexRange ( i11,i12 );
      Model[m2]->GetAIndexRange ( i21,i22 );
      if ((i11<i12) && (i21<i22) && (i12<i22))  {
        i11--;    i12--;
        i21--;    i22--;
        if (rotdir<0)  {
          //  rotate anticlockwise
          nat = i12-i11+1;
          A = new PCAtom[nat];
          k = 0;
          for (i=i11;i<=i12;i++)
            A[k++] = Atom[i];
          k = i11;
          for (i=i12+1;i<=i22;i++)  {
            Atom[k] = Atom[i];
            if (Atom[k])  Atom[k]->index = k+1;
            k++;
          }
          for (i=0;i<nat;i++)  {
            Atom[k] = A[i];
            if (Atom[k])  Atom[k]->index = k+1;
            k++;
          }
        } else  {
          //  rotate anticlockwise
          nat = i22-i21+1;
          A = new PCAtom[nat];
          k = 0;
          for (i=i21;i<=i22;i++)
            A[k++] = Atom[i];
          k = i22;
          for (i=i21-1;i>=i11;i--)  {
            Atom[k] = Atom[i];
            if (Atom[k])  Atom[k]->index = k+1;
            k--;
          }
          for (i=nat-1;i>=0;i--)  {
            Atom[k] = A[i];
            if (Atom[k])  Atom[k]->index = k+1;
            k--;
          }
        }
        delete[] A;
      }
    }

    if (rotdir<0)  {
      //  rotate anticlockwise
      model = Model[m1];
      for (i=m1;i<m2;i++)  {
        Model[i] = Model[i+1];
        Model[i]->serNum = i+1;
      }
      Model[m2] = model;
      Model[m2]->serNum = m2+1;
    } else  {
      //  rotate clockwise
      model = Model[m2];
      for (i=m2;i>m1;i--)  {
        Model[i] = Model[i-1];
        Model[i]->serNum = i+1;
      }
      Model[m1] = model;
      Model[m1]->serNum = m1+1;
    }

  }

}


void CMMDBCoorManager::SwapModels ( int modelNo1, int modelNo2 )  {
PCModel model;
PPCAtom A;
int     m1,m2,i11,i12,i21,i22,i,k,n;

  m1 = IMax ( 0,modelNo1-1 );
  m2 = IMin ( nModels,modelNo2) - 1;
  if (m1>m2)  ISwap ( m1,m2 );

  if (m1!=m2)  {

    if (Model[m1]) 
      Model[m1]->GetAIndexRange ( i11,i12 );
    else  {
      n = m1;
      while ((!Model[n]) && (n<m2))  n++;
      if (n<m2)  {
        Model[n]->GetAIndexRange ( i11,i12 );
        i12 = i11-1;
      } else
        n = -1;
    }

    if (n>=0)  {
      if (Model[m2]) 
        Model[m2]->GetAIndexRange ( i21,i22 );
      else  {
        n = m2;
        while ((!Model[n]) && (m1<n))  n--;
        if (m1<n)  {
          Model[n]->GetAIndexRange ( i21,i22 );
          i22 = i21-1;
        } else
          n = -1;
      }
    }

    if (n>=0)  {

      i11--;    i12--;
      i21--;    i22--;

      A = new PCAtom[AtmLen];
      k = 0;

      for (i=0     ;i<i11   ;i++)  A[k++] = Atom[i];
      for (i=i21   ;i<=i22  ;i++)  A[k++] = Atom[i];
      for (i=i12+1 ;i<i21   ;i++)  A[k++] = Atom[i];
      for (i=i11   ;i<=i12  ;i++)  A[k++] = Atom[i];

      for (i=0     ;i<nAtoms;i++)  if (A[i]) A[i]->index = i+1;
      for (i=nAtoms;i<AtmLen;i++)  A[i]   = NULL;

      if (Atom)  delete[] Atom;
      Atom = A;

    }

    model     = Model[m2];
    Model[m2] = Model[m1];
    Model[m1] = model;

    Model[m1]->serNum = m1+1;
    Model[m2]->serNum = m2+1;

  }

}




PCChain CMMDBCoorManager::GetChain ( int modelNo, const ChainID chainID )  {
  if ((0<modelNo) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return Model[modelNo-1]->GetChain ( chainID );
  }
  return NULL;
}

PCChain CMMDBCoorManager::GetChain ( int modelNo, int chainNo )  {
  if ((0<modelNo) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return Model[modelNo-1]->GetChain ( chainNo );
  }
  return NULL;
}

PCChain CMMDBCoorManager::GetChain ( cpstr CID )  {
int      modno,sn,rc;
ChainID  chname;
InsCode  ic;
ResName  resname;
AtomName aname;
Element  elname;
AltLoc   aloc;

  CoorIDCode = CID_Ok;
  rc = ParseAtomPath ( CID,modno,chname,sn,ic,resname,
                       aname,elname,aloc,&DefPath );
  if ((rc<0) || (rc & (APATH_WC_ModelNo | APATH_WC_ChainID)))  {
    CoorIDCode = CID_WrongPath;
    return NULL;
  }
  return GetChain ( modno,chname );

}

void  CMMDBCoorManager::GetChainTable ( int modelNo,
                                        PPCChain & chainTable,
                                        int & NumberOfChains )  {
  chainTable     = NULL;
  NumberOfChains = 0;
  if ((0<modelNo) && (modelNo<=nModels))  {
    if (Model[modelNo-1])  {
      chainTable     = Model[modelNo-1]->Chain;
      NumberOfChains = Model[modelNo-1]->nChains;
    }
  }
}

void  CMMDBCoorManager::GetChainTable ( cpstr CID,
                                        PPCChain & chainTable,
                                        int & NumberOfChains )  {
int      modno,sn,rc;
ChainID  chname;
InsCode  ic;
ResName  resname;
AtomName aname;
Element  elname;
AltLoc   aloc;

  chainTable     = NULL;
  NumberOfChains = 0;
  CoorIDCode     = CID_Ok;

  rc = ParseAtomPath ( CID,modno,chname,sn,ic,resname,
                       aname,elname,aloc,&DefPath );
  if ((rc<0) || (rc & APATH_WC_ModelNo))  {
    CoorIDCode = CID_WrongPath;
    return;
  }

  if ((0<modno) && (modno<=nModels))  {
    if (Model[modno-1])  {
      chainTable     = Model[modno-1]->Chain;
      NumberOfChains = Model[modno-1]->nChains;
    }
  }
}


int CMMDBCoorManager::DeleteChain ( int modelNo, const ChainID chID )  {
  if ((modelNo>0) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return Model[modelNo-1]->DeleteChain ( chID );
  }
  return 0;
}

int CMMDBCoorManager::DeleteChain ( int modelNo, int chainNo )  {
  if ((modelNo>0) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return Model[modelNo-1]->DeleteChain ( chainNo );
  }
  return 0;
}

int CMMDBCoorManager::DeleteAllChains ( int modelNo )  {
  if ((modelNo>0) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return Model[modelNo-1]->DeleteAllChains();
  }
  return 0;
}

int CMMDBCoorManager::DeleteAllChains()  {
int i,k;
  k = 0;
  for (i=0;i<nModels;i++)
    if (Model[i])  k += Model[i]->DeleteAllChains();
  return k;
}

int CMMDBCoorManager::AddChain ( int modelNo, PCChain chain )  {
  if ((modelNo>0) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return Model[modelNo-1]->AddChain ( chain );
  }
  return 0;
}


PCResidue CMMDBCoorManager::GetResidue ( int           modelNo,
                                         const ChainID chainID,
                                         int           seqNo,
                                         const InsCode insCode )  {
  if ((0<modelNo) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return Model[modelNo-1]->GetResidue ( chainID,seqNo,insCode );
  }
  return NULL;
}

PCResidue CMMDBCoorManager::GetResidue ( int modelNo, int chainNo,
                                         int seqNo, 
                                         const InsCode insCode )  {
  if ((0<modelNo) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return Model[modelNo-1]->GetResidue ( chainNo,seqNo,insCode );
  }
  return NULL;
}

PCResidue CMMDBCoorManager::GetResidue ( int modelNo,
                                         const ChainID chainID,
                                         int resNo )  {
  if ((0<modelNo) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return Model[modelNo-1]->GetResidue ( chainID,resNo );
  }
  return NULL;
}

PCResidue CMMDBCoorManager::GetResidue ( int modelNo, int chainNo,
                                         int resNo )  {
  if ((0<modelNo) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return Model[modelNo-1]->GetResidue ( chainNo,resNo );
  }
  return NULL;
}

PCResidue CMMDBCoorManager::GetResidue ( cpstr CID )  {
int      modno,sn,rc;
ChainID  chname;
InsCode  ic;
ResName  resname;
AtomName aname;
Element  elname;
AltLoc   aloc;

  CoorIDCode = CID_Ok;
  rc = ParseAtomPath ( CID,modno,chname,sn,ic,resname,
                       aname,elname,aloc,&DefPath );
  if ((rc<0) || (rc & (APATH_WC_ModelNo | APATH_WC_ChainID |
                       APATH_WC_SeqNum  | APATH_WC_InsCode)))  {
    CoorIDCode = CID_WrongPath;
    return NULL;
  }
  return GetResidue ( modno,chname,sn,ic );

}


int CMMDBCoorManager::GetResidueNo ( int           modelNo,
                                     const ChainID chainID,
                                     int           seqNo,
                                     const InsCode insCode )  {
  if ((0<modelNo) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return Model[modelNo-1]->GetResidueNo ( chainID,seqNo,insCode );
  }
  return -3;
}

int CMMDBCoorManager::GetResidueNo ( int modelNo, int chainNo,
                                     int seqNo,
                                     const InsCode insCode )  {
  if ((0<modelNo) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return Model[modelNo-1]->GetResidueNo ( chainNo,seqNo,insCode );
  }
  return -3;
}

void CMMDBCoorManager::GetResidueTable ( PPCResidue & resTable,
                                         int & NumberOfResidues )  {
//    resTable has to be NULL or it will be reallocated. The
//  application is responsible for deallocating the resTable (but not
//  of its residues!). This does not apply to other GetResidueTable
//  functions.
PPCChain   chain;
PPCResidue res;
int        i,j,k,n,nChains,nResidues;

  if (resTable)  {
    delete[] resTable;
    resTable = NULL;
  }

  NumberOfResidues = 0;
  for (i=0;i<nModels;i++)
    if (Model[i])  {
      Model[i]->GetChainTable ( chain,nChains );
      for (j=0;j<Model[i]->nChains;j++)
        if (chain[j])  {
          chain[j]->GetResidueTable ( res,nResidues );
          NumberOfResidues += nResidues;
        }
    }

  if (NumberOfResidues>0)  {
    resTable = new PCResidue[NumberOfResidues];
    k = 0;
    for (i=0;i<nModels;i++)
      if (Model[i])  {
        Model[i]->GetChainTable ( chain,nChains );
        for (j=0;j<Model[i]->nChains;j++)
          if (chain[j])  {
            chain[j]->GetResidueTable ( res,nResidues );
            for (n=0;n<nResidues;n++)
              if (res[n])  resTable[k++] = res[n];
          }
      }
    NumberOfResidues = k;
  }

}

void CMMDBCoorManager::GetResidueTable ( int modelNo,
                                         const ChainID chainID,
                                         PPCResidue & resTable,
                                         int & NumberOfResidues )  {
PCChain chain;
  resTable         = NULL;
  NumberOfResidues = 0;
  if ((0<modelNo) && (modelNo<=nModels))  {
    if (Model[modelNo-1])  {
      chain = Model[modelNo-1]->GetChain ( chainID );
      if (chain)  {
        resTable         = chain->Residue;
        NumberOfResidues = chain->nResidues;
      }
    }
  }
}

void CMMDBCoorManager::GetResidueTable ( int modelNo, int chainNo,
                                         PPCResidue & resTable,
                                         int & NumberOfResidues )  {
PCChain chain;
  resTable         = NULL;
  NumberOfResidues = 0;
  if ((0<modelNo) && (modelNo<=nModels))  {
    if (Model[modelNo-1])  {
      chain = Model[modelNo-1]->GetChain ( chainNo );
      if (chain)  {
        resTable         = chain->Residue;
        NumberOfResidues = chain->nResidues;
      }
    }
  }
}

void CMMDBCoorManager::GetResidueTable ( cpstr CID,
                                         PPCResidue & resTable,
                                         int & NumberOfResidues )  {
int      modno,sn,rc;
ChainID  chname;
InsCode  ic;
ResName  resname;
AtomName aname;
Element  elname;
AltLoc   aloc;
PCChain  chain;

  resTable         = NULL;
  NumberOfResidues = 0;
  CoorIDCode       = CID_Ok;

  rc = ParseAtomPath ( CID,modno,chname,sn,ic,resname,
                       aname,elname,aloc,&DefPath );
  if ((rc<0) || (rc & (APATH_WC_ModelNo | APATH_WC_ChainID)))  {
    CoorIDCode = CID_WrongPath;
    return;
  }

  if ((0<modno) && (modno<=nModels))  {
    if (Model[modno-1])  {
      chain = Model[modno-1]->GetChain ( chname );
      if (chain)  {
        resTable         = chain->Residue;
        NumberOfResidues = chain->nResidues;
      }
    }
  }

}


int CMMDBCoorManager::DeleteResidue ( int           modelNo,
                                      const ChainID chainID,
                                      int           seqNo,
                                      const InsCode insCode )  {
  if ((modelNo>0) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return Model[modelNo-1]->DeleteResidue ( chainID,seqNo,insCode );
  }
  return 0;
}

int CMMDBCoorManager::DeleteResidue ( int           modelNo,
                                      const ChainID chainID,
                                      int           resNo )  {
  if ((modelNo>0) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return Model[modelNo-1]->DeleteResidue ( chainID,resNo );
  }
  return 0;
}

int CMMDBCoorManager::DeleteResidue ( int modelNo, int chainNo,
                                      int seqNo,
                                      const InsCode insCode )  {
  if ((modelNo>0) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return Model[modelNo-1]->DeleteResidue ( chainNo,seqNo,insCode );
  }
  return 0;
}

int CMMDBCoorManager::DeleteResidue ( int modelNo, int chainNo,
                                      int resNo )  {
  if ((modelNo>0) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return Model[modelNo-1]->DeleteResidue ( chainNo,resNo );
  }
  return 0;
}

int CMMDBCoorManager::DeleteAllResidues ( int modelNo,
                                          const ChainID chainID )  {
  if ((modelNo>0) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return Model[modelNo-1]->DeleteAllResidues ( chainID );
  }
  return 0;
}

int CMMDBCoorManager::DeleteAllResidues ( int modelNo, int chainNo )  {
  if ((modelNo>0) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return Model[modelNo-1]->DeleteAllResidues ( chainNo );
  }
  return 0;
}

int CMMDBCoorManager::DeleteAllResidues ( int modelNo )  {
  if ((modelNo>0) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return Model[modelNo-1]->DeleteAllResidues();
  }
  return 0;
}

int CMMDBCoorManager::DeleteAllResidues()  {
int i,k;
  k = 0;
  for (i=0;i<nModels;i++)
    if (Model[i])  k += Model[i]->DeleteAllResidues();
  return k;
}

int CMMDBCoorManager::AddResidue ( int modelNo, const ChainID chainID,
                                   PCResidue res )  {
  if ((modelNo>0) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return Model[modelNo-1]->AddResidue ( chainID,res );
  }
  return 0;
}

int CMMDBCoorManager::AddResidue ( int modelNo, int chainNo,
                                   PCResidue res )  {
  if ((modelNo>0) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return Model[modelNo-1]->AddResidue ( chainNo,res );
  }
  return 0;
}



int  CMMDBCoorManager::GetNumberOfChains ( int modelNo )  {
  if ((0<modelNo) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return  Model[modelNo-1]->nChains;
  }
  return 0;
}

int  CMMDBCoorManager::GetNumberOfChains ( cpstr CID )  {
int      modno,sn,rc;
ChainID  chname;
InsCode  ic;
ResName  resname;
AtomName aname;
Element  elname;
AltLoc   aloc;

  CoorIDCode = CID_Ok;
  rc = ParseAtomPath ( CID,modno,chname,sn,ic,resname,
                       aname,elname,aloc,&DefPath );
  if ((rc<0) || (rc & APATH_WC_ModelNo))  {
    CoorIDCode = CID_WrongPath;
    return 0;
  }

  if ((0<modno) && (modno<=nModels))  {
    if (Model[modno-1])
      return  Model[modno-1]->nChains;
  }

  return 0;

}

int  CMMDBCoorManager::GetNumberOfResidues ( int modelNo,
                                             const ChainID chainID )  {
PCChain chain;
  if ((0<modelNo) && (modelNo<=nModels))  {
    if (Model[modelNo-1])  {
      chain = Model[modelNo-1]->GetChain ( chainID );
      if (chain)  return chain->nResidues;
    }
  }
  return 0;
}

int  CMMDBCoorManager::GetNumberOfResidues ( int modelNo, int chainNo )  {
PCChain chain;
  if ((0<modelNo) && (modelNo<=nModels))  {
    if (Model[modelNo-1])  {
      if ((0<=chainNo) && (chainNo<Model[modelNo-1]->nChains))  {
        chain = Model[modelNo-1]->Chain[chainNo];
        if (chain)  return chain->nResidues;
      }
    }
  }
  return 0;
}

int  CMMDBCoorManager::GetNumberOfResidues ( cpstr CID )  {
int      modno,sn,rc;
ChainID  chname;
InsCode  ic;
ResName  resname;
AtomName aname;
Element  elname;
AltLoc   aloc;
PCChain  chain;

  CoorIDCode = CID_Ok;
  rc = ParseAtomPath ( CID,modno,chname,sn,ic,resname,
                       aname,elname,aloc,&DefPath );
  if ((rc<0) || (rc & (APATH_WC_ModelNo | APATH_WC_ChainID)))  {
    CoorIDCode = CID_WrongPath;
    return 0;
  }

  if ((0<modno) && (modno<=nModels))  {
    if (Model[modno-1])  {
      chain = Model[modno-1]->GetChain ( chname );
      if (chain)  return chain->nResidues;
    }
  }

  return 0;

}


int  CMMDBCoorManager::GetNumberOfAtoms ( int           modelNo,
                                          const ChainID chainID,
                                          int           seqNo,
                                          const InsCode insCode )  {
PCChain   chain;
PCResidue res;
  if ((0<modelNo) && (modelNo<=nModels))  {
    if (Model[modelNo-1])  {
      chain = Model[modelNo-1]->GetChain ( chainID );
      if (chain)  {
        res = chain->GetResidue ( seqNo,insCode );
        if (res)  return res->nAtoms;
      }
    }
  }
  return 0;
}

int  CMMDBCoorManager::GetNumberOfAtoms ( int modelNo, int chainNo,
                                          int seqNo, 
                                          const InsCode insCode )  {
PCChain   chain;
PCResidue res;
  if ((0<modelNo) && (modelNo<=nModels))  {
    if (Model[modelNo-1])  {
      if ((0<=chainNo) && (chainNo<Model[modelNo-1]->nChains))  {
        chain = Model[modelNo-1]->Chain[chainNo];
        if (chain)  {
          res = chain->GetResidue ( seqNo,insCode );
          if (res)  return res->nAtoms;
        }
      }
    }
  }
  return 0;
}

int  CMMDBCoorManager::GetNumberOfAtoms ( int           modelNo,
                                          const ChainID chainID,
                                          int           resNo )  {
PCChain   chain;
PCResidue res;
  if ((0<modelNo) && (modelNo<=nModels))  {
    if (Model[modelNo-1])  {
      chain = Model[modelNo-1]->GetChain ( chainID );
      if (chain)  {
        if ((0<=resNo) && (resNo<chain->nResidues))  {
          res = chain->Residue[resNo];
          if (res)  return res->nAtoms;
        }
      }
    }
  }
  return 0;
}

int  CMMDBCoorManager::GetNumberOfAtoms ( int modelNo, int chainNo,
                                          int resNo )  {
PCChain   chain;
PCResidue res;
  if ((0<modelNo) && (modelNo<=nModels))  {
    if (Model[modelNo-1])  {
      if ((0<=chainNo) && (chainNo<Model[modelNo-1]->nChains))  {
        chain = Model[modelNo-1]->Chain[chainNo];
        if (chain)  {
          if ((0<=resNo) && (resNo<chain->nResidues))  {
            res = chain->Residue[resNo];
            if (res)  return res->nAtoms;
          }
        }
      }
    }
  }
  return 0;
}

int  CMMDBCoorManager::GetNumberOfAtoms ( cpstr CID )  {
// returns number of atoms in residues identified by CID
int       modno,sn,rc;
ChainID   chname;
InsCode   ic;
ResName   resname;
AtomName  aname;
Element   elname;
AltLoc    aloc;
PCChain   chain;
PCResidue res;

  CoorIDCode = CID_Ok;
  rc = ParseAtomPath ( CID,modno,chname,sn,ic,resname,
                       aname,elname,aloc,&DefPath );
  if ((rc<0) || (rc & (APATH_WC_ModelNo | APATH_WC_ChainID |
                       APATH_WC_SeqNum  | APATH_WC_InsCode)))  {
    CoorIDCode = CID_WrongPath;
    return 0;
  }

  if ((0<modno) && (modno<=nModels))  {
    if (Model[modno-1])  {
      chain = Model[modno-1]->GetChain ( chname );
      if (chain)  {
        res = chain->GetResidue ( sn,ic );
        if (res)  return res->nAtoms;
      }
    }
  }

  return 0;

}


// --------------------  Extracting atoms  -----------------------

PCAtom  CMMDBCoorManager::GetAtom (
                   int            modelNo, // model serial number 1...
                   const ChainID  chID,    // chain ID
                   int            seqNo,   // residue sequence number
                   const InsCode  insCode, // residue insertion code
                   const AtomName aname,   // atom name
                   const Element  elmnt,   // chemical element code or '*'
                   const AltLoc   aloc     // alternate location indicator
                 )  {
PCModel   mdl;
PCChain   chn;
PCResidue res;
PCAtom    atm;

  if ((1<=modelNo) && (modelNo<=nModels))
        mdl = Model[modelNo-1];
  else  mdl = NULL;
  if (!mdl)  {
    CoorIDCode = CID_NoModel;
    return NULL;
  }

  chn = mdl->GetChain ( chID );  
  if (!chn)  {
    CoorIDCode = CID_NoChain;
    return NULL;
  }

  res = chn->GetResidue ( seqNo,insCode );  
  if (!res)  {
    CoorIDCode = CID_NoResidue;
    return NULL;
  }

  atm = res->GetAtom ( aname,elmnt,aloc );
  if (!atm)  CoorIDCode = CID_NoAtom;
       else  CoorIDCode = CID_Ok;

  return atm;

}

PCAtom CMMDBCoorManager::GetAtom (
                     int           modelNo, // model serial number 1...
                     const ChainID chID,    // chain ID
                     int           seqNo,   // residue sequence number
                     const InsCode insCode, // residue insertion code
                     int           atomNo   // atom number 0..
                 )  {
PCModel   mdl;
PCChain   chn;
PCResidue res;
PCAtom    atm;

  if ((1<=modelNo) && (modelNo<=nModels))
        mdl = Model[modelNo-1];
  else  mdl = NULL;
  if (!mdl)  {
    CoorIDCode = CID_NoModel;
    return NULL;
  }

  chn = mdl->GetChain ( chID );  
  if (!chn)  {
    CoorIDCode = CID_NoChain;
    return NULL;
  }

  res = chn->GetResidue ( seqNo,insCode );  
  if (!res)  {
    CoorIDCode = CID_NoResidue;
    return NULL;
  }

  if ((0<=atomNo) && (atomNo<res->nAtoms))
        atm = res->atom[atomNo];
  else  atm = NULL;
  if (!atm)  CoorIDCode = CID_NoAtom;
       else  CoorIDCode = CID_Ok;

  return atm;

}

PCAtom CMMDBCoorManager::GetAtom (
                     int            modelNo, // model serial number 1...
                     const ChainID  chID,    // chain ID
                     int            resNo,   // residue number 0..
                     const AtomName aname,   // atom name
                     const Element  elmnt,   // chemical element code or '*'
                     const AltLoc   aloc     // alternate location indicator
                 )  {
PCModel   mdl;
PCChain   chn;
PCResidue res;
PCAtom    atm;

  if ((1<=modelNo) && (modelNo<=nModels))
        mdl = Model[modelNo-1];
  else  mdl = NULL;
  if (!mdl)  {
    CoorIDCode = CID_NoModel;
    return NULL;
  }

  chn = mdl->GetChain ( chID );  
  if (!chn)  {
    CoorIDCode = CID_NoChain;
    return NULL;
  }

  if ((0<=resNo) && (resNo<chn->nResidues))
        res = chn->Residue[resNo];  
  else  res = NULL;
  if (!res)  {
    CoorIDCode = CID_NoResidue;
    return NULL;
  }

  atm = res->GetAtom ( aname,elmnt,aloc );
  if (!atm)  CoorIDCode = CID_NoAtom;
       else  CoorIDCode = CID_Ok;

  return atm;

}

PCAtom CMMDBCoorManager::GetAtom (
                     int           modelNo, // model serial number 1...
                     const ChainID chID,    // chain ID
                     int           resNo,   // residue number 0..
                     int           atomNo   // atom number 0..
                 )  {
PCModel   mdl;
PCChain   chn;
PCResidue res;
PCAtom    atm;

  if ((1<=modelNo) && (modelNo<=nModels))
        mdl = Model[modelNo-1];
  else  mdl = NULL;
  if (!mdl)  {
    CoorIDCode = CID_NoModel;
    return NULL;
  }

  chn = mdl->GetChain ( chID );  
  if (!chn)  {
    CoorIDCode = CID_NoChain;
    return NULL;
  }

  if ((0<=resNo) && (resNo<chn->nResidues))
        res = chn->Residue[resNo];  
  else  res = NULL;
  if (!res)  {
    CoorIDCode = CID_NoResidue;
    return NULL;
  }

  if ((0<=atomNo) && (atomNo<res->nAtoms))
        atm = res->atom[atomNo];
  else  atm = NULL;
  if (!atm)  CoorIDCode = CID_NoAtom;
       else  CoorIDCode = CID_Ok;

  return atm;

}

PCAtom CMMDBCoorManager::GetAtom (
                     int            modelNo, // model serial number 1...
                     int            chNo,    // chain number 0..
                     int            seqNo,   // residue sequence number
                     const InsCode  insCode, // residue insertion code
                     const AtomName aname,   // atom name
                     const Element  elmnt,   // chemical element code or '*'
                     const AltLoc   aloc     // alternate location indicator
                 )  {
PCModel   mdl;
PCChain   chn;
PCResidue res;
PCAtom    atm;

  if ((1<=modelNo) && (modelNo<=nModels))
        mdl = Model[modelNo-1];
  else  mdl = NULL;
  if (!mdl)  {
    CoorIDCode = CID_NoModel;
    return NULL;
  }

  if ((0<=chNo) && (chNo<mdl->nChains))
        chn = mdl->Chain[chNo];
  else  chn = NULL;
  if (!chn)  {
    CoorIDCode = CID_NoChain;
    return NULL;
  }

  res = chn->GetResidue ( seqNo,insCode );  
  if (!res)  {
    CoorIDCode = CID_NoResidue;
    return NULL;
  }

  atm = res->GetAtom ( aname,elmnt,aloc );
  if (!atm)  CoorIDCode = CID_NoAtom;
       else  CoorIDCode = CID_Ok;

  return atm;

}

PCAtom CMMDBCoorManager::GetAtom (
                     int           modelNo, // model serial number 1...
                     int           chNo,    // chain number 0...
                     int           seqNo,   // residue sequence number
                     const InsCode insCode, // residue insertion code
                     int           atomNo   // atom number 0...
                 )  {
PCModel   mdl;
PCChain   chn;
PCResidue res;
PCAtom    atm;

  if ((1<=modelNo) && (modelNo<=nModels))
        mdl = Model[modelNo-1];
  else  mdl = NULL;
  if (!mdl)  {
    CoorIDCode = CID_NoModel;
    return NULL;
  }

  if ((0<=chNo) && (chNo<mdl->nChains))
        chn = mdl->Chain[chNo];
  else  chn = NULL;
  if (!chn)  {
    CoorIDCode = CID_NoChain;
    return NULL;
  }

  res = chn->GetResidue ( seqNo,insCode );  
  if (!res)  {
    CoorIDCode = CID_NoResidue;
    return NULL;
  }

  if ((0<=atomNo) && (atomNo<res->nAtoms))
        atm = res->atom[atomNo];
  else  atm = NULL;
  if (!atm)  CoorIDCode = CID_NoAtom;
       else  CoorIDCode = CID_Ok;

  return atm;

}

PCAtom CMMDBCoorManager::GetAtom (
                     int            modelNo, // model serial number 1...
                     int            chNo,    // chain number 0...
                     int            resNo,   // residue number 0...
                     const AtomName aname,   // atom name
                     const Element  elmnt,   // chemical element code or '*'
                     const AltLoc   aloc     // alternate location indicator
                 )  {
PCModel   mdl;
PCChain   chn;
PCResidue res;
PCAtom    atm;

  if ((1<=modelNo) && (modelNo<=nModels))
        mdl = Model[modelNo-1];
  else  mdl = NULL;
  if (!mdl)  {
    CoorIDCode = CID_NoModel;
    return NULL;
  }

  if ((0<=chNo) && (chNo<mdl->nChains))
        chn = mdl->Chain[chNo];
  else  chn = NULL;
  if (!chn)  {
    CoorIDCode = CID_NoChain;
    return NULL;
  }

  if ((0<=resNo) && (resNo<chn->nResidues))
        res = chn->Residue[resNo];  
  else  res = NULL;
  if (!res)  {
    CoorIDCode = CID_NoResidue;
    return NULL;
  }

  atm = res->GetAtom ( aname,elmnt,aloc );
  if (!atm)  CoorIDCode = CID_NoAtom;
       else  CoorIDCode = CID_Ok;

  return atm;

}

PCAtom CMMDBCoorManager::GetAtom (
                     int modelNo, // model serial number 1...
                     int chNo,    // chain number 0...
                     int resNo,   // residue number 0...
                     int atomNo   // atom number 0...
                 )  {
PCModel   mdl;
PCChain   chn;
PCResidue res;
PCAtom    atm;

  if ((1<=modelNo) && (modelNo<=nModels))
        mdl = Model[modelNo-1];
  else  mdl = NULL;
  if (!mdl)  {
    CoorIDCode = CID_NoModel;
    return NULL;
  }

  if ((0<=chNo) && (chNo<mdl->nChains))
        chn = mdl->Chain[chNo];
  else  chn = NULL;
  if (!chn)  {
    CoorIDCode = CID_NoChain;
    return NULL;
  }

  if ((0<=resNo) && (resNo<chn->nResidues))
        res = chn->Residue[resNo];  
  else  res = NULL;
  if (!res)  {
    CoorIDCode = CID_NoResidue;
    return NULL;
  }

  if ((0<=atomNo) && (atomNo<res->nAtoms))
        atm = res->atom[atomNo];
  else  atm = NULL;
  if (!atm)  CoorIDCode = CID_NoAtom;
       else  CoorIDCode = CID_Ok;

  return atm;

}


PCAtom CMMDBCoorManager::GetAtom ( cpstr CID )  {
int      modno,sn,rc;
ChainID  chname;
InsCode  ic;
ResName  resname;
AtomName aname;
Element  elname;
AltLoc   aloc;

  CoorIDCode = CID_Ok;
  rc = ParseAtomPath ( CID,modno,chname,sn,ic,resname,
                       aname,elname,aloc,&DefPath );
  if ((rc<0) || (rc & APATH_Incomplete))  {
    CoorIDCode = CID_WrongPath;
    return NULL;
  }

  return GetAtom ( modno,chname,sn,ic,aname,elname,aloc );

}


void CMMDBCoorManager::GetAtomTable ( PPCAtom & atomTable,
                                      int & NumberOfAtoms )  {
  atomTable     = Atom;
  NumberOfAtoms = nAtoms;
}

void CMMDBCoorManager::GetAtomTable ( int           modelNo,
                                      const ChainID chainID,
                                      int           seqNo,
                                      const InsCode insCode,
                                      PPCAtom &     atomTable,
                                      int &         NumberOfAtoms )  {
PCResidue res;
  atomTable     = NULL;
  NumberOfAtoms = 0;
  if ((0<modelNo) && (modelNo<=nModels))  {
    if (Model[modelNo-1])  {
      res = Model[modelNo-1]->GetResidue ( chainID,seqNo,insCode );
      if (res)  {
        atomTable     = res->atom;
        NumberOfAtoms = res->nAtoms;
      }
    }
  }
}

void CMMDBCoorManager::GetAtomTable ( int           modelNo,
                                      int           chainNo,
                                      int           seqNo,
                                      const InsCode insCode,
                                      PPCAtom &     atomTable,
                                      int &         NumberOfAtoms )  {
PCResidue res;
  atomTable     = NULL;
  NumberOfAtoms = 0;
  if ((0<modelNo) && (modelNo<=nModels))  {
    if (Model[modelNo-1])  {
      res = Model[modelNo-1]->GetResidue ( chainNo,seqNo,insCode );
      if (res)  {
        atomTable     = res->atom;
        NumberOfAtoms = res->nAtoms;
      }
    }
  }
}

void CMMDBCoorManager::GetAtomTable ( int           modelNo,
                                      const ChainID chainID,
                                      int           resNo,
                                      PPCAtom &     atomTable,
                                      int &         NumberOfAtoms )  {
PCResidue res;
  atomTable     = NULL;
  NumberOfAtoms = 0;
  if ((0<modelNo) && (modelNo<=nModels))  {
    if (Model[modelNo-1])  {
      res = Model[modelNo-1]->GetResidue ( chainID,resNo );
      if (res)  {
        atomTable     = res->atom;
        NumberOfAtoms = res->nAtoms;
      }
    }
  }
}

void CMMDBCoorManager::GetAtomTable ( int modelNo, int chainNo,
                                      int resNo, PPCAtom & atomTable,
                                      int & NumberOfAtoms )  {
PCResidue res;
  atomTable     = NULL;
  NumberOfAtoms = 0;
  if ((0<modelNo) && (modelNo<=nModels))  {
    if (Model[modelNo-1])  {
      res = Model[modelNo-1]->GetResidue ( chainNo,resNo );
      if (res)  {
        atomTable     = res->atom;
        NumberOfAtoms = res->nAtoms;
      }
    }
  }
}

void CMMDBCoorManager::GetAtomTable ( cpstr CID,
                                      PPCAtom & atomTable,
                                      int & NumberOfAtoms )  {
int       modno,sn,rc;
ChainID   chname;
InsCode   ic;
ResName   resname;
AtomName  aname;
Element   elname;
AltLoc    aloc;
PCResidue res;

  atomTable     = NULL;
  NumberOfAtoms = 0;

  CoorIDCode = CID_Ok;
  rc = ParseAtomPath ( CID,modno,chname,sn,ic,resname,
                       aname,elname,aloc,&DefPath );
  if ((rc<0) || (rc & (APATH_WC_ModelNo | APATH_WC_ChainID |
                       APATH_WC_SeqNum  | APATH_WC_InsCode)))  {
    CoorIDCode = CID_WrongPath;
    return;
  }

  res = GetResidue ( modno,chname,sn,ic );
  if (res)  {
    atomTable     = res->atom;
    NumberOfAtoms = res->nAtoms;
  }

}


void CMMDBCoorManager::GetAtomTable1 ( PPCAtom & atomTable,
                                       int & NumberOfAtoms )  {
int i,j;
  if (atomTable)  delete[] atomTable;
  if (nAtoms>0)  {
    atomTable = new PCAtom[nAtoms];
    j = 0;
    for (i=0;i<nAtoms;i++)
      if (Atom[i])  {
        if (!Atom[i]->Ter)
          atomTable[j++] = Atom[i];
      }
    NumberOfAtoms = j;
  } else  {
    atomTable     = NULL;
    NumberOfAtoms = 0;
  }
}

void CMMDBCoorManager::GetAtomTable1 ( int           modelNo,
                                       const ChainID chainID,
                                       int           seqNo,
                                       const InsCode insCode,
                                       PPCAtom &     atomTable,
                                       int &         NumberOfAtoms )  {
PCResidue res;
  res = NULL;
  if ((0<modelNo) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      res = Model[modelNo-1]->GetResidue ( chainID,seqNo,insCode );
  }
  if (res)
    res->GetAtomTable1 ( atomTable,NumberOfAtoms );
  else  {
    if (atomTable)  delete[] atomTable;
    atomTable     = NULL;
    NumberOfAtoms = 0;
  }
}

void CMMDBCoorManager::GetAtomTable1 ( int           modelNo,
                                       int           chainNo,
                                       int           seqNo,
                                       const InsCode insCode,
                                       PPCAtom &     atomTable,
                                       int &         NumberOfAtoms )  {
PCResidue res;
  res = NULL;
  if ((0<modelNo) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      res = Model[modelNo-1]->GetResidue ( chainNo,seqNo,insCode );
  }
  if (res)
    res->GetAtomTable1 ( atomTable,NumberOfAtoms );
  else  {
    if (atomTable)  delete[] atomTable;
    atomTable     = NULL;
    NumberOfAtoms = 0;
  }
}

void CMMDBCoorManager::GetAtomTable1 ( int           modelNo,
                                       const ChainID chainID,
                                       int           resNo,
                                       PPCAtom &     atomTable,
                                       int &         NumberOfAtoms )  {
PCResidue res;
  res = NULL;
  if ((0<modelNo) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      res = Model[modelNo-1]->GetResidue ( chainID,resNo );
  }
  if (res)
    res->GetAtomTable1 ( atomTable,NumberOfAtoms );
  else  {
    if (atomTable)  delete[] atomTable;
    atomTable     = NULL;
    NumberOfAtoms = 0;
  }
}

void CMMDBCoorManager::GetAtomTable1 ( int modelNo, int chainNo,
                                       int resNo,
                                       PPCAtom & atomTable,
                                       int & NumberOfAtoms )  {
PCResidue res;
  res = NULL;
  if ((0<modelNo) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      res = Model[modelNo-1]->GetResidue ( chainNo,resNo );
  }
  if (res)
    res->GetAtomTable1 ( atomTable,NumberOfAtoms );
  else  {
    if (atomTable)  delete[] atomTable;
    atomTable     = NULL;
    NumberOfAtoms = 0;
  }
}

void CMMDBCoorManager::GetAtomTable1 ( cpstr CID, PPCAtom & atomTable,
                                       int & NumberOfAtoms )  {
int       modno,sn,rc;
ChainID   chname;
InsCode   ic;
ResName   resname;
AtomName  aname;
Element   elname;
AltLoc    aloc;
PCResidue res;

  atomTable     = NULL;
  NumberOfAtoms = 0;

  CoorIDCode = CID_Ok;
  rc = ParseAtomPath ( CID,modno,chname,sn,ic,resname,
                       aname,elname,aloc,&DefPath );
  if ((rc<0) || (rc & (APATH_WC_ModelNo | APATH_WC_ChainID |
                       APATH_WC_SeqNum  | APATH_WC_InsCode)))  {
    CoorIDCode = CID_WrongPath;
    return;
  }

  res = GetResidue ( modno,chname,sn,ic );
  if (res)
    res->GetAtomTable1 ( atomTable,NumberOfAtoms );
  else  {
    if (atomTable)  delete[] atomTable;
    atomTable     = NULL;
    NumberOfAtoms = 0;
  }

}



int CMMDBCoorManager::DeleteAtom ( int            modelNo,
                                   const ChainID  chID,
                                   int            seqNo,
                                   const InsCode  insCode,
                                   const AtomName aname,
                                   const Element  elmnt,
                                   const AltLoc   aloc )  {
  if ((modelNo>0) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return Model[modelNo-1]->DeleteAtom ( chID,seqNo,insCode,
                                            aname,elmnt,aloc );
  }
  return 0;
}

int CMMDBCoorManager::DeleteAtom ( int           modelNo,
                                   const ChainID chID,
                                   int           seqNo,
                                   const InsCode insCode,
                                   int           atomNo )  {
  if ((modelNo>0) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return Model[modelNo-1]->DeleteAtom ( chID,seqNo,insCode,atomNo );
  }
  return 0;
}

int CMMDBCoorManager::DeleteAtom ( int            modelNo,
                                   const ChainID  chID,
                                   int            resNo,
                                   const AtomName aname,
                                   const Element  elmnt,
                                   const AltLoc   aloc )  {
  if ((modelNo>0) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return Model[modelNo-1]->DeleteAtom ( chID,resNo,
                                            aname,elmnt,aloc );
  }
  return 0;
}

int CMMDBCoorManager::DeleteAtom ( int           modelNo,
                                   const ChainID chID,
                                   int           resNo,
                                   int           atomNo )  {
  if ((modelNo>0) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return Model[modelNo-1]->DeleteAtom ( chID,resNo,atomNo );
  }
  return 0;
}

int CMMDBCoorManager::DeleteAtom ( int modelNo, int chNo, int seqNo,
                                   const InsCode  insCode,
                                   const AtomName aname,
                                   const Element  elmnt,
                                   const AltLoc   aloc )  {
  if ((modelNo>0) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return Model[modelNo-1]->DeleteAtom ( chNo,seqNo,insCode,
                                            aname,elmnt,aloc );
  }
  return 0;
}

int CMMDBCoorManager::DeleteAtom ( int modelNo, int chNo, int seqNo,
                                   const InsCode insCode, int atomNo )  {
  if ((modelNo>0) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return Model[modelNo-1]->DeleteAtom ( chNo,seqNo,insCode,atomNo );
  }
  return 0;
}

int CMMDBCoorManager::DeleteAtom ( int modelNo, int chNo, int resNo,
                                   const AtomName aname,
                                   const Element  elmnt,
                                   const AltLoc   aloc )  {
  if ((modelNo>0) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return Model[modelNo-1]->DeleteAtom ( chNo,resNo,
                                            aname,elmnt,aloc );
  }
  return 0;
}

int CMMDBCoorManager::DeleteAtom ( int modelNo, int chNo, int resNo,
                                   int atomNo )  {
  if ((modelNo>0) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return Model[modelNo-1]->DeleteAtom ( chNo,resNo,atomNo );
  }
  return 0;
}

int CMMDBCoorManager::DeleteAllAtoms ( int           modelNo,
                                       const ChainID chID,
                                       int           seqNo,
                                       const InsCode insCode )  {
  if ((modelNo>0) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return Model[modelNo-1]->DeleteAllAtoms ( chID,seqNo,insCode );
  }
  return 0;
}

int CMMDBCoorManager::DeleteAllAtoms ( int modelNo, const ChainID chID,
                                       int resNo )  {
  if ((modelNo>0) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return Model[modelNo-1]->DeleteAllAtoms ( chID,resNo );
  }
  return 0;
}

int CMMDBCoorManager::DeleteAllAtoms ( int modelNo, const ChainID chID )  {
  if ((modelNo>0) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return Model[modelNo-1]->DeleteAllAtoms ( chID );
  }
  return 0;
}

int CMMDBCoorManager::DeleteAllAtoms ( int modelNo, int chNo, int seqNo,
                                       const InsCode insCode )  {
  if ((modelNo>0) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return Model[modelNo-1]->DeleteAllAtoms ( chNo,seqNo,insCode );
  }
  return 0;
}

int CMMDBCoorManager::DeleteAllAtoms ( int modelNo, int chNo,
                                       int resNo )  {
  if ((modelNo>0) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return Model[modelNo-1]->DeleteAllAtoms ( chNo,resNo );
  }
  return 0;
}

int CMMDBCoorManager::DeleteAllAtoms ( int modelNo, int chNo )  {
  if ((modelNo>0) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return Model[modelNo-1]->DeleteAllAtoms ( chNo );
  }
  return 0;
}

int CMMDBCoorManager::DeleteAllAtoms ( int modelNo )  {
  if ((modelNo>0) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return Model[modelNo-1]->DeleteAllAtoms();
  }
  return 0;
}

int CMMDBCoorManager::DeleteAllAtoms()  {
int i,k;
  k = 0;
  for (i=0;i<nModels;i++)
    if (Model[i])  k += Model[i]->DeleteAllAtoms();
  return k;
}


/*
int CMMDBCoorManager::DeleteAltLocs()  {
//  This function leaves only alternative location with maximal
// occupancy, if those are equal or unspecified, the one with
// "least" alternative location indicator.
//  The function returns the number of deleted atoms and optimizes
// the atom index.
ChainID  chID;
ResName  rName;
InsCode  iCode;
AtomName aname;
AltLoc   aLoc,aL;
realtype occupancy,occ;
int      seqNum;
int      i,j,k,i1,i2,n;

  k = 0;
  n = 0;
  i = 0;
  while (i<nAtoms)  {

    if (Atom[i])  {
      seqNum    = Atom[i]->GetSeqNum   ();
      occupancy = Atom[i]->GetOccupancy();
      strcpy ( chID ,Atom[i]->GetChainID() );
      strcpy ( rName,Atom[i]->GetResName() );
      strcpy ( iCode,Atom[i]->GetInsCode() );
      strcpy ( aname,Atom[i]->name   );
      strcpy ( aLoc ,Atom[i]->altLoc );
      j  = i+1;
      i1 = -1;
      i2 = i;
      while (j<nAtoms)
        if (Atom[j])  {
          if ((Atom[j]->GetSeqNum()==seqNum)         &&
              (!strcmp(Atom[j]->name,aname))         &&
              (!strcmp(Atom[j]->GetInsCode(),iCode)) &&
              (!strcmp(Atom[j]->GetResName(),rName)) &&
              (!strcmp(Atom[j]->GetChainID(),chID )))  {
            occ = Atom[j]->GetOccupancy();
            if (occ>occupancy)  {
              occupancy = occ;
              i1 = j;
            }
            if (aLoc[0])  {
              strcpy ( aL,Atom[j]->altLoc );
              if (!aL[0])  {
                aLoc[0] = char(0);
                i2 = j;
              } else if (strcmp(aL,aLoc)<0)  {
                strcpy ( aLoc,aL );
                i2 = j;
              }
            }
            j++;
          } else
            break;
        } else
          j++;
      if (i1<0)  {
        if (Atom[i]->WhatIsSet & ASET_Occupancy)  i1 = i;
                                            else  i1 = i2;
      }
      while (i<j)  {
        if (Atom[i])  {
          if (i!=i1)  {
            delete Atom[i];
            Atom[i] = NULL;
            n++;
          } else  {
            if (k<i)  {
              Atom[k] = Atom[i];
              Atom[k]->index = k+1;
            }
            k++;
          }
        }
        i++;
      }

    } else
      i++;

  }

  nAtoms = k;
  return n;

}
*/

int CMMDBCoorManager::DeleteAltLocs()  {
//  This function leaves only alternative location with maximal
// occupancy, if those are equal or unspecified, the one with
// "least" alternative location indicator.
//  The function returns the number of deleted atoms. All tables
// remain untrimmed, so that explicit trimming or calling
// FinishStructEdit() at some point is required.
int i,n;

  n = 0;
  for (i=0;i<nModels;i++)
    if (Model[i])  n += Model[i]->DeleteAltLocs();

  return n;

}

int CMMDBCoorManager::AddAtom ( int           modelNo,
                                const ChainID chID,
                                int           seqNo,
                                const InsCode insCode,
                                PCAtom atom )  {
  if ((modelNo>0) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return Model[modelNo-1]->AddAtom ( chID,seqNo,insCode,atom );
  }
  return 0;
}

int CMMDBCoorManager::AddAtom ( int modelNo, const ChainID chID,
                                int resNo, PCAtom atom )  {
  if ((modelNo>0) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return Model[modelNo-1]->AddAtom ( chID,resNo,atom );
  }
  return 0;
}

int CMMDBCoorManager::AddAtom ( int modelNo, int chNo,
                                int seqNo, const InsCode insCode,
                                PCAtom atom )  {
  if ((modelNo>0) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return Model[modelNo-1]->AddAtom ( chNo,seqNo,insCode,atom );
  }
  return 0;
}

int CMMDBCoorManager::AddAtom ( int modelNo, int chNo,
                                int resNo, PCAtom atom )  {
  if ((modelNo>0) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return Model[modelNo-1]->AddAtom ( chNo,resNo,atom );
  }
  return 0;
}


void  CMMDBCoorManager::RemoveBricks()  {
int i,j,k;
  if (Brick)  {
    for (i=0;i<nbrick_x;i++)
      if (Brick[i])  {
        for (j=0;j<nbrick_y;j++)
          if (Brick[i][j])  {
            for (k=0;k<nbrick_z;k++)
              if (Brick[i][j][k])  delete Brick[i][j][k];
            delete[] Brick[i][j];
          }
        delete[] Brick[i];
      }
    delete[] Brick;
  }
  Brick = NULL;
  nbrick_x = 0;
  nbrick_y = 0;
  nbrick_z = 0;
}

void  CMMDBCoorManager::GetBrickCoor ( PCAtom A,
                                       int & nx, int & ny, int & nz ) {
  nx = (int)floor((A->x-xbrick_0)/brick_size);
  ny = (int)floor((A->y-ybrick_0)/brick_size);
  nz = (int)floor((A->z-zbrick_0)/brick_size);
  if ((ny<0) || (nz<0) || (nx>=nbrick_x) ||
      (ny>=nbrick_y) || (nz>=nbrick_z))  nx = -1;
}

void  CMMDBCoorManager::GetBrickCoor ( realtype x, realtype y,
                                       realtype z, int & nx,
                                       int & ny, int & nz ) {
  nx = (int)floor((x-xbrick_0)/brick_size);
  ny = (int)floor((y-ybrick_0)/brick_size);
  nz = (int)floor((z-zbrick_0)/brick_size);
  if ((ny<0) || (nz<0) || (nx>=nbrick_x) ||
      (ny>=nbrick_y) || (nz>=nbrick_z))  nx = -1;
}

void  CMMDBCoorManager::GetBrickDimension ( 
                      int & nxmax, int & nymax, int & nzmax )  {
  if (!Brick)  {
    nxmax = 0;  nymax = 0;  nzmax = 0;
  } else  {
    nxmax = nbrick_x;
    nymax = nbrick_y;
    nzmax = nbrick_z;
  }
}

PCBrick CMMDBCoorManager::GetBrick ( int nx, int ny, int nz )  {
  if (!Brick)  return NULL;
  if ((nx>=0) && (nx<nbrick_x) &&
      (ny>=0) && (ny<nbrick_y) &&
      (nz>=0) && (nz<nbrick_z))  {
    if (!Brick[nx])     return NULL;
    if (!Brick[nx][ny]) return NULL;
    return Brick[nx][ny][nz];
  }
  return NULL;
}

void  CMMDBCoorManager::MakeBricks ( PPCAtom  atmvec,  int avlen,
                                     realtype Margin,
                                     realtype BrickSize )  {
//    Makes bricking for atoms contained in vector atmvec of length
// avlen, with brick size BrickSize (in angstroms). The previous
// bricking, if there was any, is removed.
int      i,j, nx,ny,nz, alen;
realtype x1,x2, y1,y2, z1,z2, dx,dy,dz;
PPCAtom  A;

  RemoveBricks();

  brick_size = BrickSize;

  if (atmvec)  {
    A    = atmvec;
    alen = avlen;
  } else  {
    A    = Atom;
    alen = nAtoms;
  }

  if (alen>0)  {
    //  find the range of coordinates
    x1 = MaxReal;
    x2 = -x1;
    y1 = MaxReal;
    y2 = -y1;
    z1 = MaxReal;
    z2 = -z1;
    for (i=0;i<alen;i++)
      if (A[i])  {
        if ((!A[i]->Ter) && (A[i]->WhatIsSet & ASET_Coordinates))  {
          if (A[i]->x<x1)  x1 = A[i]->x;
          if (A[i]->x>x2)  x2 = A[i]->x;
          if (A[i]->y<y1)  y1 = A[i]->y;
          if (A[i]->y>y2)  y2 = A[i]->y;
          if (A[i]->z<z1)  z1 = A[i]->z;
          if (A[i]->z>z2)  z2 = A[i]->z;
        }
      }
    if (x1<MaxReal)  {
      x1 -= Margin; x2 += Margin;
      y1 -= Margin; y2 += Margin;
      z1 -= Margin; z2 += Margin;
      dx = x2-x1;  nbrick_x = mround(dx/brick_size+0.0001)+1;
      dy = y2-y1;  nbrick_y = mround(dy/brick_size+0.0001)+1;
      dz = z2-z1;  nbrick_z = mround(dz/brick_size+0.0001)+1;
      xbrick_0 = x1 - (nbrick_x*brick_size-dx)/2.0;
      ybrick_0 = y1 - (nbrick_y*brick_size-dy)/2.0;
      zbrick_0 = z1 - (nbrick_z*brick_size-dz)/2.0;
      for (i=0;i<alen;i++)
        if (A[i])  {
          if ((!A[i]->Ter) && (A[i]->WhatIsSet & ASET_Coordinates))  {
            GetBrickCoor ( A[i],nx,ny,nz );
            if (nx>=0)  {
              if (!Brick)  {
                Brick = new PPPCBrick[nbrick_x];
                for (j=0;j<nbrick_x;j++)
                  Brick[j] = NULL;
              }
              if (!Brick[nx])  {
                Brick[nx] = new PPCBrick[nbrick_y];
                for (j=0;j<nbrick_y;j++)
                  Brick[nx][j] = NULL;
              }
              if (!Brick[nx][ny])  {
                Brick[nx][ny] = new PCBrick[nbrick_z];
                for (j=0;j<nbrick_z;j++)
                  Brick[nx][ny][j] = NULL;
              }
              if (!Brick[nx][ny][nz])
                Brick[nx][ny][nz] = new CBrick();
              Brick[nx][ny][nz]->AddAtom ( A[i],i );
            } else
              printf ( " error in "
                       "CMMDBCoorManager::MakeBricks!!!\n" );
          }
        }
    }
  }

}


void  CMMDBCoorManager::RemoveMBricks()  {
int i,j,k;
  if (MBrick)  {
    for (i=0;i<nmbrick_x;i++)
      if (MBrick[i])  {
        for (j=0;j<nmbrick_y;j++)
          if (MBrick[i][j])  {
            for (k=0;k<nmbrick_z;k++)
              if (MBrick[i][j][k])  delete MBrick[i][j][k];
            delete[] MBrick[i][j];
          }
        delete[] MBrick[i];
      }
    delete[] MBrick;
  }
  MBrick = NULL;
  nmbrick_x = 0;
  nmbrick_y = 0;
  nmbrick_z = 0;
}

void  CMMDBCoorManager::GetMBrickCoor ( PCAtom A,
                                     int & nx, int & ny, int & nz )  {
  nx = (int)floor((A->x-xmbrick_0)/mbrick_size);
  ny = (int)floor((A->y-ymbrick_0)/mbrick_size);
  nz = (int)floor((A->z-zmbrick_0)/mbrick_size);
  if ((ny<0) || (nz<0) || (nx>=nmbrick_x) ||
      (ny>=nmbrick_y)  || (nz>=nmbrick_z))  nx = -nx-1;
}

void  CMMDBCoorManager::GetMBrickCoor (
                                realtype x, realtype y, realtype z,
                                int   & nx, int   & ny, int   & nz )  {
  nx = (int)floor((x-xmbrick_0)/mbrick_size);
  ny = (int)floor((y-ymbrick_0)/mbrick_size);
  nz = (int)floor((z-zmbrick_0)/mbrick_size);
  if ((ny<0) || (nz<0) || (nx>=nmbrick_x) ||
        (ny>=nmbrick_y) || (nz>=nmbrick_z))  nx = -nx-1;
}

void  CMMDBCoorManager::GetMBrickDimension ( 
                      int & nxmax, int & nymax, int & nzmax )  {
  if (!Brick)  {
    nxmax = 0;  nymax = 0;  nzmax = 0;
  } else  {
    nxmax = nmbrick_x;
    nymax = nmbrick_y;
    nzmax = nmbrick_z;
  }
}

PCMBrick CMMDBCoorManager::GetMBrick ( int nx, int ny, int nz )  {
  if (!MBrick)  return NULL;
  if ((nx>=0) && (nx<nmbrick_x) &&
      (ny>=0) && (ny<nmbrick_y) &&
      (nz>=0) && (nz<nmbrick_z))  {
    if (!MBrick[nx])     return NULL;
    if (!MBrick[nx][ny]) return NULL;
    return MBrick[nx][ny][nz];
  }
  return NULL;
}

void  CMMDBCoorManager::MakeMBricks ( PPCAtom * atmvec,  ivector avlen,
                                      int nStructures, realtype Margin,
                                      realtype BrickSize )  {
//    Makes bricking for atoms contained in vectors atmvec with lengths
// given in avlen, with brick size BrickSize (in angstroms).
// The previous bricking, if there was any, is removed.
int      i,j,k, nx,ny,nz;
realtype x1,x2, y1,y2, z1,z2, dx,dy,dz;
PCAtom   A;

  RemoveMBricks();

  mbrick_size = BrickSize;

  //  find the range of coordinates
  x1 = MaxReal;
  x2 = -x1; 
  y1 = MaxReal;
  y2 = -y1;
  z1 = MaxReal;
  z2 = -z1;
  for (i=0;i<nStructures;i++)
    for (j=0;j<avlen[i];j++)  {
      A = atmvec[i][j];
      if (A)  {
        if ((!A->Ter) && (A->WhatIsSet & ASET_Coordinates))  {
          if (A->x<x1)  x1 = A->x;
          if (A->x>x2)  x2 = A->x;
          if (A->y<y1)  y1 = A->y;
          if (A->y>y2)  y2 = A->y;
          if (A->z<z1)  z1 = A->z;
          if (A->z>z2)  z2 = A->z;
        }
      }
    }
  if (x1<MaxReal)  {
    x1 -= Margin; x2 += Margin;
    y1 -= Margin; y2 += Margin;
    z1 -= Margin; z2 += Margin; 
    dx = x2-x1;  nmbrick_x = mround(dx/mbrick_size+0.0001)+1;
    dy = y2-y1;  nmbrick_y = mround(dy/mbrick_size+0.0001)+1;
    dz = z2-z1;  nmbrick_z = mround(dz/mbrick_size+0.0001)+1;
    xmbrick_0 = x1 - (nmbrick_x*mbrick_size-dx)/2.0;
    ymbrick_0 = y1 - (nmbrick_y*mbrick_size-dy)/2.0;
    zmbrick_0 = z1 - (nmbrick_z*mbrick_size-dz)/2.0;
    /*
    MBrick = new PPPCMBrick[nmbrick_x];
    for (i=0;i<nmbrick_x;i++)  {
      MBrick[i] = new PPCMBrick[nmbrick_y];
      for (j=0;j<nmbrick_y;j++)  {
        MBrick[i][j] = new PCMBrick[nmbrick_z];
        for (k=0;k<nmbrick_z;k++)
          MBrick[i][j][k] = new CMBrick(nStructures);
      }
    }
    */
    for (i=0;i<nStructures;i++)
      for (j=0;j<avlen[i];j++)  {
        A = atmvec[i][j];
        if (A)  {
          if ((!A->Ter) && (A->WhatIsSet & ASET_Coordinates))  {
            GetMBrickCoor ( A,nx,ny,nz );
            if (nx>=0)  {
              if (!MBrick)  {
                MBrick = new PPPCMBrick[nmbrick_x];
                for (k=0;k<nmbrick_x;k++)
                  MBrick[k] = NULL;
              }
              if (!MBrick[nx])  {
                MBrick[nx] = new PPCMBrick[nmbrick_y];
                for (k=0;k<nmbrick_y;k++)
                  MBrick[nx][k] = NULL;
              }
              if (!MBrick[nx][ny])  {
                MBrick[nx][ny] = new PCMBrick[nmbrick_z];
                for (k=0;k<nmbrick_z;k++)
                  MBrick[nx][ny][k] = NULL;
              }
              if (!MBrick[nx][ny][nz])
                MBrick[nx][ny][nz] = new CMBrick(nStructures);
              MBrick[nx][ny][nz]->AddAtom ( A,i,j );
            } else
              printf ( " error in "
                       "CMMDBCoorManager::MakeMBricks!!!\n" );
          }
        }
      }
  }

}


int  CMMDBCoorManager::GenerateSymMates ( PCGenSym GenSym )  {
//
//   The function generates symmetry mates according to symmetry
// operations found in GenSym. Results of first symmetry operation
// (number 0) always replaces the existing set of atoms, others
// are added as additional sets.
//   If GenSym is set to NULL, the function generates all
// symmetry mates for the unit cell taking the symmetry information
// from Cryst.SymOps.
//   The newly generated chains are added to each model. These
// chains have many-character chain names, composed as 'x_n',
// where 'x' is the original name and 'n' is a unique number, which
// coincides with the symmetry operation (order) number; number '_0'
// (for the very first symmetry operatyion) is missing. Another
// side effect is the disorder in atoms' serial numbers.
//   The hierarchy should therefore be cleaned after
// generating the symmetry mates. An appropriate way to do
// that is to issue the following call:
//
//   PDBCleanup ( PDBCLEAN_TER | PDBCLEAN_ALTCODE_STRONG |
//                PDBCLEAN_CHAIN_STRONG | PDBCLEAN_SERIAL );
//
PPCMMDBCoorManager Mate;
int                i,j,k,n,nMates,nMates1,nAtoms1;
PPCAtom            Atom1;
PPCModel           Model1;

  if (GenSym)  nMates = GenSym->GetNofSymOps();
         else  nMates = Cryst.GetNumberOfSymOps();
  if (nMates<=0)  return GSM_NoSymOps;

  if (!Cryst.areMatrices())       return GSM_NoTransfMatrices;
  if (!Cryst.isCellParameters())  return GSM_NoCell;

  nMates1 = nMates-1;
  if (nMates1>0)  {

    //  Generate symmetry mates in parallel hierarchies
    Mate = new PCMMDBCoorManager[nMates1];
    for (i=0;i<nMates1;i++)  {
      Mate[i] = new CMMDBCoorManager();
      Mate[i]->Copy ( this );
      Mate[i]->ApplySymTransform ( i+1,GenSym );
    }

    //  apply 1st symmetry operation:
    if (GenSym)  ApplySymTransform ( 0,GenSym );

    //  Gather all symmetry mates in 'this' hierarchy
    nAtoms1 = nMates*nAtoms;        // new number of atoms
    Atom1   = new PCAtom[nAtoms1];  // new array of atoms

    if (nModels>0)  Model1 = new PCModel[nModels];  // new array of
              else  Model1 = NULL;                  // models

    k = 0;  // index of collected atoms
    for (i=0;i<nModels;i++)
      if (Model[i])  {
        Model1[i] = newCModel();
        Model1[i]->SetMMDBManager ( PCMMDBManager(this),i+1 );
        for (j=0;j<Model[i]->nChains;j++)
          Model1[i]->MoveChain ( Model[i]->Chain[j],Atom,Atom1,k,0 );
        for (n=0;n<nMates1;n++)
          for (j=0;j<Model[i]->nChains;j++)
            Model1[i]->MoveChain ( Mate[n]->Model[i]->Chain[j],
                                   Mate[n]->Atom,Atom1,k,n+1 );
      } else
        Model1[i] = NULL;

    if (Model) delete[] Model;
    Model = Model1;

    for (i=0;i<nAtoms;i++)
      if (Atom[i])  delete Atom[i];  // should never happen
    if (Atom)  delete[] Atom;
    Atom   = Atom1;
    AtmLen = nAtoms1;   // length of Atom array
    nAtoms = k;

    //  Dispose parallel hierarchies
    for (i=0;i<nMates1;i++)
      delete Mate[i];
    delete[] Mate;

  } else  {
    //  just apply the only symmetry operation:
    if (GenSym)  ApplySymTransform ( 0,GenSym );
  }

  return GSM_Ok;

}

void  CMMDBCoorManager::ApplyTransform ( mat44 & TMatrix )  {
// simply transforms all coordinates by multiplying with matrix TMatrix
int i;
  for (i=0;i<nAtoms;i++)
    if (Atom[i])  {
      if (!Atom[i]->Ter)  Atom[i]->Transform ( TMatrix );
    }
}

void  CMMDBCoorManager::ApplySymTransform ( int      SymOpNo,
                                            PCGenSym GenSym )  {
//    This procedure applies the symmetry operation number SymOpNo
// (starting from 0 on) and renames chains as specified in
// GenSym.
//    The chains don't have to be renamed. The number of chains
// to be renamed is obtained as GenSym->nChains[SymOpNo], their
// old names - as GenSym->chID1[SymOpNo][j], and their new names
// - as GenSym->chID2[SymOpNo][j],  0<=j<GenSym->nChains[SymOpNo].
mat44    tmat;
int      i,j,k,nChn;
PPCChain chain;
  if (Cryst.GetTMatrix(tmat,SymOpNo,0,0,0,PCSymOps(GenSym))
       ==SYMOP_Ok)  {
    for (i=0;i<nAtoms;i++)
      if (Atom[i])  {
        if (!Atom[i]->Ter)  Atom[i]->Transform ( tmat );
      }
    if (GenSym)
      for (i=0;i<nModels;i++)
        if (Model[i])  {
          Model[i]->GetChainTable ( chain,nChn );
          for (j=0;j<GenSym->nChains[SymOpNo];j++)
            for (k=0;k<nChn;k++)
              if (!strcmp(chain[k]->chainID,GenSym->chID1[SymOpNo][j]))
                chain[k]->SetChainID ( GenSym->chID2[SymOpNo][j] );
        }
  }
}


void  GetEulerRotMatrix ( mat33 & erm,
                          realtype alpha, 
                          realtype beta, 
                          realtype gamma )  {
//  Calculates the Euler rotation matrix for rotation:
//                   1) about z-axis by angle alpha (0..2*Pi)
//                   2) about new y-axis by angle beta (0..Pi)
//                   3) about new z-axis by angle gamma (0..2*Pi)
realtype ca,cb,cg, sa,sb,sg;

  ca = cos(alpha);
  sa = sin(alpha);
  cb = cos(beta);
  sb = sin(beta);
  cg = cos(gamma);
  sg = sin(gamma);

  erm[0][0] =  ca*cb*cg - sa*sg;
  erm[0][1] =  cb*cg*sa + ca*sg;
  erm[0][2] = -cg*sb;

  erm[1][0] = -cg*sa - ca*cb*sg;
  erm[1][1] =  ca*cg - cb*sa*sg;
  erm[1][2] =  sb*sg;

  erm[2][0] =  ca*sb;
  erm[2][1] =  sa*sb;
  erm[2][2] =  cb;

}



void  GetEulerTMatrix ( mat44 & erm,
                        realtype alpha, 
                        realtype beta, 
                        realtype gamma,
                        realtype x0,
                        realtype y0,
                        realtype z0 )  {
//  Calculates the Euler rotation-translation matrix for rotation:
//                   1) about z-axis by angle alpha
//                   2) about new y-axis by angle beta
//                   3) about new z-axis by angle gamma
//  Point (x0,y0,z0) is the center of rotation.
mat33 m;

  m[0][0] = 1.0;
  GetEulerRotMatrix ( m,alpha,beta,gamma );

  erm[0][0] = m[0][0];  erm[0][1] = m[0][1];  erm[0][2] = m[0][2];
  erm[1][0] = m[1][0];  erm[1][1] = m[1][1];  erm[1][2] = m[1][2];
  erm[2][0] = m[2][0];  erm[2][1] = m[2][1];  erm[2][2] = m[2][2];
  erm[3][0] = 0.0;      erm[3][1] = 0.0;      erm[3][2] = 0.0;

  erm[3][3] = 1.0;
  
  erm[0][3] = x0 - m[0][0]*x0 - m[0][1]*y0 - m[0][2]*z0;
  erm[1][3] = y0 - m[1][0]*x0 - m[1][1]*y0 - m[1][2]*z0;
  erm[2][3] = z0 - m[2][0]*x0 - m[2][1]*y0 - m[2][2]*z0;

}


void  EulerRotation ( PPCAtom  A,
                      int      nA,
                      realtype alpha, 
                      realtype beta, 
                      realtype gamma,
                      realtype x0,
                      realtype y0,
                      realtype z0 )  {
//  Euler rotation:  1) about z-axis by angle alpha
//                   2) about new y-axis by angle beta
//                   3) about new z-axis by angle gamma
//  Point (x0,y0,z0) is the center of rotation.
mat33    m;
realtype x,y,z;
int      i;

  m[0][0] = 1.0;
  GetEulerRotMatrix ( m,alpha,beta,gamma );

  for (i=0;i<nA;i++)
    if (A[i])  {
      if ((!A[i]->Ter) && (A[i]->WhatIsSet & ASET_Coordinates))  {
        x = A[i]->x - x0;
        y = A[i]->y - y0;
        z = A[i]->z - z0;
        A[i]->x = m[0][0]*x + m[0][1]*y + m[0][2]*z + x0;
        A[i]->y = m[1][0]*x + m[1][1]*y + m[1][2]*z + y0;
        A[i]->z = m[2][0]*x + m[2][1]*y + m[2][2]*z + z0;
      }
    }

}


void  GetVecRotMatrix ( mat33 & vrm,
                        realtype alpha, 
                        realtype vx, 
                        realtype vy,
                        realtype vz )  {
//   Calculates the rotation matrix for rotation by angle alpha about
// arbitrary vector directed as (vx,vy,vz) = (vx2-vx1,vy2-vy1,vz2-vz1).
realtype ca,sa, rx,ry,rz, vl;

  ca = cos(alpha);
  sa = sin(alpha);

  vl = sqrt ( vx*vx + vy*vy + vz*vz );
  if (vl<=0.0)  return;
  rx = vx/vl;
  ry = vy/vl;
  rz = vz/vl;

  vrm[0][0] = rx*rx*(1.0-ca) + ca;
  vrm[0][1] = rx*ry*(1.0-ca) - rz*sa;
  vrm[0][2] = rx*rz*(1.0-ca) + ry*sa;

  vrm[1][0] = ry*rx*(1.0-ca) + rz*sa;
  vrm[1][1] = ry*ry*(1.0-ca) + ca;
  vrm[1][2] = ry*rz*(1.0-ca) - rx*sa;

  vrm[2][0] = rz*rx*(1.0-ca) - ry*sa;
  vrm[2][1] = rz*ry*(1.0-ca) + rx*sa;
  vrm[2][2] = rz*rz*(1.0-ca) + ca;

}


void  GetRotParameters ( mat33    & vrm,
                         realtype & alpha, 
                         realtype & vx, 
                         realtype & vy,
                         realtype & vz )  {
//    Given the rotation matrix vrm, GetRotParameters(..)
//  returns the rotation angle alpha and the normalized
//  rotation axis vector (vx,vy,vz).
//    The rotation angle and vector are determined up to
//  their sign (however correlated, so that being substituted
//  into GetVecRotMatrix(..) they yield the same rotation
//  matrix).
//    The function does not check for vrm to be a valid
//  rotation matrix.
realtype ca,sa,vl;
  ca = (vrm[0][0]+vrm[1][1]+vrm[2][2]-1.0)/2.0;
  if (ca<-1.0) ca = -1.0;  // does not work if rotation
  if (ca>1.0)  ca =  1.0;  //   matrix is correct
  sa = sqrt(1.0-ca*ca);
  if (sa>0.0)  {
    alpha = acos(ca);
    // coefficient of 2 is corrected by normalization below
    vx    = (vrm[2][1]-vrm[1][2])/sa;
    vy    = (vrm[0][2]-vrm[2][0])/sa;
    vz    = (vrm[1][0]-vrm[0][1])/sa;
    // the following code is formally redundant if rotation
    // matrix is correct, however it eliminates the round-offs
    vl    = sqrt(vx*vx+vy*vy+vz*vz);
    vx   /= vl;
    vy   /= vl;
    vz   /= vl;
  } else  {
    // zero rotation, arbitrary axis would do
    alpha = 0.0;
    vx    = 1.0;
    vy    = 0.0;
    vz    = 0.0;
  }
}


void  GetVecTMatrix ( mat44 & vrm,
                      realtype alpha, 
                      realtype vx, 
                      realtype vy,
                      realtype vz,
                      realtype x0,
                      realtype y0,
                      realtype z0 )  {
//   Calculates the rotation-translation matrix for rotation by angle
// alpha about arbitrary vector directed as (vx,vy,vz) =
// (vx2-vx1,vy2-vy1,vz2-vz1). Point (x0,y0,z0) is the center of
// rotation -- actually a point belonging to the rotation axis.
mat33 m;

  GetVecRotMatrix ( m,alpha,vx,vy,vz );

  vrm[0][0] = m[0][0];  vrm[0][1] = m[0][1];  vrm[0][2] = m[0][2];
  vrm[1][0] = m[1][0];  vrm[1][1] = m[1][1];  vrm[1][2] = m[1][2];
  vrm[2][0] = m[2][0];  vrm[2][1] = m[2][1];  vrm[2][2] = m[2][2];
  vrm[3][0] = 0.0;      vrm[3][1] = 0.0;      vrm[3][2] = 0.0;

  vrm[3][3] = 1.0;
  
  vrm[0][3] = x0 - m[0][0]*x0 - m[0][1]*y0 - m[0][2]*z0;
  vrm[1][3] = y0 - m[1][0]*x0 - m[1][1]*y0 - m[1][2]*z0;
  vrm[2][3] = z0 - m[2][0]*x0 - m[2][1]*y0 - m[2][2]*z0;

}


void  VectorRotation ( PPCAtom  A,
                       int      nA,
                       realtype alpha, 
                       realtype vx, 
                       realtype vy,
                       realtype vz,
                       realtype x0,
                       realtype y0,
                       realtype z0 )  {
//   Vector rotation is rotation by angle alpha about arbitrary
// vector directed as (vx,vy,vz) = (vx2-vx1,vy2-vy1,vz2-vz1).
// Point (x0,y0,z0) is the center of rotation -- actually
// a point belonging to the rotation axis.
mat33    m;
realtype x,y,z;
int      i;

  GetVecRotMatrix ( m, alpha,vx,vy,vz );

  for (i=0;i<nA;i++)
    if (A[i])  {
      if ((!A[i]->Ter) && (A[i]->WhatIsSet & ASET_Coordinates))  {
        x = A[i]->x - x0;
        y = A[i]->y - y0;
        z = A[i]->z - z0;
        A[i]->x = m[0][0]*x + m[0][1]*y + m[0][2]*z + x0;
        A[i]->y = m[1][0]*x + m[1][1]*y + m[1][2]*z + y0;
        A[i]->z = m[2][0]*x + m[2][1]*y + m[2][2]*z + z0;
      }
    }

}


void  GetMassCenter ( PPCAtom    A,   int        nA,
                      realtype & xmc, realtype & ymc, 
                      realtype & zmc )  {
realtype w,mass;
int      i,k;

  xmc  = 0.0;
  ymc  = 0.0;
  zmc  = 0.0;
  mass = 0.0;

  for (i=0;i<nA;i++)
    if (A[i])  {
      if ((!A[i]->Ter) && (A[i]->WhatIsSet & ASET_Coordinates))  {
        k = getElementNo ( A[i]->element );
        if (k>=0)  w = MolecWeight[k];
             else  w = 1.0;
        xmc  += w*A[i]->x;
        ymc  += w*A[i]->y;
        zmc  += w*A[i]->z;
        mass += w;
      }
    }

  if (mass>0.0)  {
    xmc /= mass;
    ymc /= mass;
    zmc /= mass;
  }

}

int CMMDBCoorManager::BringToUnitCell()  {
// brings all chains into 0th unit cell
PCChain   chain;
PPCAtom   atom;
realtype  x0,y0,z0, x,y,z, xf,yf,zf, sx,sy,sz;
realtype  dx,dy,dz, d,d0;
int       nAtoms;
int       i,j,k,n,m,nt, ic,jc,kc, is,js,ks;

  if (!Cryst.areMatrices())  return -1;

  Cryst.Frac2Orth ( 0.5,0.5,0.5, x0,y0,z0 );

  nt = 0;
  for (i=0;i<nModels;i++)
    if (Model[i])  {
      for (j=0;j<Model[i]->nChains;j++)  {
        chain = Model[i]->Chain[j];
        if (chain)  {

          x = 0.0;
          y = 0.0;
          z = 0.0;
          m = 0;
          for (k=0;k<chain->nResidues;k++)
            if (chain->Residue[k])  {
              chain->Residue[k]->GetAtomTable ( atom,nAtoms );
              for (n=0;n<nAtoms;n++)
                if (atom[n])  {
                  if (!atom[n]->Ter)  {
                    x += atom[n]->x;
                    y += atom[n]->y;
                    z += atom[n]->z;
                    m++;
                  }
                }
            }
          x /= m;
          y /= m;
          z /= m;

          Cryst.Orth2Frac ( x,y,z, xf,yf,zf );
          sx = frac ( xf );
          sy = frac ( yf );
          sz = frac ( zf );
          d0 = MaxReal;
          for (ic=-3;ic<3;ic++)
            for (jc=-3;jc<3;jc++)
              for (kc=-3;kc<3;kc++)  {
                Cryst.Frac2Orth ( sx+ic,sy+jc,sz+kc, dx,dy,dz );
                dx -= x0;
                dy -= y0;
                dz -= z0;
                d = dx*dx + dy*dy + dz*dz;
                if (d<d0)  {
                  d0 = d;
                  is = ic;
                  js = jc;
                  ks = kc;
                }
              }

          sx = xf - (sx+is);
          sy = yf - (sy+js);
          sz = zf - (sz+ks);

          if ((fabs(sx)>1.0e-10) || (fabs(sy)>1.0e-10)
                                 || (fabs(sz)>1.0e-10))  {
            nt++;
            for (k=0;k<chain->nResidues;k++)
              if (chain->Residue[k])  {
                chain->Residue[k]->GetAtomTable ( atom,nAtoms );
                for (n=0;n<nAtoms;n++)
                  if (atom[n])  {
                    if (!atom[n]->Ter)  {
                      Cryst.Orth2Frac ( atom[n]->x,atom[n]->y,
                                        atom[n]->z,
                                        xf,yf,zf );
                      Cryst.Frac2Orth ( xf-sx,yf-sy,zf-sz,
                                        atom[n]->x,atom[n]->y,
                                        atom[n]->z );
                    }
                  }
              }
          }

        }
      }  
    }

  return nt;  // number of converted chains

}


Boolean CMMDBCoorManager::Frac2Orth (
              realtype   xfrac, realtype   yfrac, realtype   zfrac,
              realtype & xorth, realtype & yorth, realtype & zorth )  {
  return Cryst.Frac2Orth ( xfrac,yfrac,zfrac, xorth,yorth,zorth );
}

Boolean CMMDBCoorManager::Orth2Frac (
              realtype   xorth, realtype   yorth, realtype   zorth,
              realtype & xfrac, realtype & yfrac, realtype & zfrac )  {
  return Cryst.Orth2Frac ( xorth,yorth,zorth, xfrac,yfrac,zfrac );
}


Boolean CMMDBCoorManager::Frac2Orth ( mat44 & F, mat44 & T )  {
  return Cryst.Frac2Orth ( F,T );
}

Boolean CMMDBCoorManager::Orth2Frac ( mat44 & T, mat44 & F )  {
  return Cryst.Orth2Frac ( T,F );
}



//  ------------------------  Contacts  -------------------------------


#define  CA_CA_Dist2  16.0

void  CMMDBCoorManager::FindSeqSection ( PCAtom atom, int seqDist,
                                         int  & seq1, int & seq2 )  {
PCAtom    a;
PCResidue res;
PCChain   chain;
realtype  x0,y0,z0, x,y,z, dx,dy,dz, d2;
int       i1;
Boolean   B0,B;

  res = atom->residue;
  if ((!res) || (seqDist<=0))  {
    seq1 = MaxInt4;
    seq2 = MinInt4;
    return;
  }

  chain = res->chain;
  if (!chain)  {
    seq1 = MaxInt4;
    seq2 = MinInt4;
    return;
  }

  if (seqDist==1)  {
    seq1 = res->index;
    seq2 = seq1;
    return;
  }

  a = res->GetAtom ( pstr("CA"),pstr("C"),NULL );
  if (a)  {
    x0 = a->x;
    y0 = a->y;
    z0 = a->z;
    B0 = True;
  } else
    B0 = False;
  if (B0)  {
    x = x0;
    y = y0;
    z = z0;
  }

  B    = B0;
  seq2 = res->index;
  i1   = IMin(chain->nResidues,seq2+seqDist)-1;
  while (seq2<i1)  {
    seq2++;
    if (chain->Residue[seq2])  {
      a = chain->Residue[seq2]->GetAtom ( pstr("CA"),pstr("C"),NULL );
      if (a && B)  {
        dx = x-a->x;
        dy = y-a->y;
        dz = z-a->z;
        d2 = dx*dx + dy*dy + dz*dz;
        if (d2>CA_CA_Dist2)  {
          seq2--;
          break;
        }
      }
      if (a)  {
        x = a->x;
        y = a->y;
        z = a->z;
        B = True;
      } else
        B = False;
    }
  }

  if (B0)  {
    x = x0;
    y = y0;
    z = z0;
  }
  B    = B0;
  seq1 = res->index;
  i1   = IMax(0,seq1-seqDist+1);
  while (seq1>i1)  {
    seq1--;
    if (chain->Residue[seq1])  {
      a = chain->Residue[seq1]->GetAtom ( pstr("CA"),pstr("C"),NULL );
      if (a && B)  {
        dx = x-a->x;
        dy = y-a->y;
        dz = z-a->z;
        d2 = dx*dx + dy*dy + dz*dz;
        if (d2>CA_CA_Dist2)  {
          seq1++;
          break;
        }
      }
      if (a)  {
        x = a->x;
        y = a->y;
        z = a->z;
        B = True;
      } else
        B = False;
    }
  }

}


Boolean  CMMDBCoorManager::isContact ( PCAtom    a1, PCAtom    a2,
                                       int     seq1, int     seq2,
                                       realtype  dd, realtype d12,
                                       realtype d22, realtype & d2 )  {
//  seq1..seq2 is forbidden region for residue sequence numbers
PCResidue  res1,res2;
PCChain    chain1,chain2;
realtype   dx,dy,dz;

  if (a2->Ter)  return False;

  dx = fabs(a2->x-a1->x);
  if (dx<=dd)  {
    dy = fabs(a2->y-a1->y);
    if (dy<=dd)  {
      dz = fabs(a2->z-a1->z);
      if (dz<=dd)  {
        d2 = dx*dx + dy*dy + dz*dz;
        if ((d12<=d2) && (d2<=d22))  {
          if (seq1<=seq2)  {
            res1 = a1->residue;
            res2 = a2->residue;
            if (res1 && res2)  {
              chain1 = res1->chain;
              chain2 = res2->chain;
              if (chain1 && chain2)  {
                if (!strcmp(chain1->chainID,chain2->chainID))  {
                  if ((seq1<=res2->index) && (res2->index<=seq2))
                    return False;
                }
              }
            }
          }
          return True;
        }
      }
    }
  }

  return False;

}

Boolean  CMMDBCoorManager::isContact ( realtype   x, realtype   y,
                                       realtype   z, PCAtom    a2,
                                       realtype  dd, realtype d12,
                                       realtype d22, realtype & d2 )  {
realtype dx,dy,dz;

  if (a2->Ter)  return False;

  dx = fabs(a2->x-x);
  if (dx<=dd)  {
    dy = fabs(a2->y-y);
    if (dy<=dd)  {
      dz = fabs(a2->z-z);
      if (dz<=dd)  {
        d2 = dx*dx + dy*dy + dz*dz;
        if ((d12<=d2) && (d2<=d22))  return True;
      }
    }
  }

  return False;

}


void  CMMDBCoorManager::SeekContacts ( PPCAtom    AIndex,
                                       int        ilen,
                                       int        atomNum,
                                       realtype   dist1,
                                       realtype   dist2,
                                       int        seqDist,
                                       RPSContact contact,
                                       int &      ncontacts,
                                       int        maxlen,
                                       long       group )  {
PCContactIndex ContactIndex;
realtype       d12,d22,d2;
int            i,seq1,seq2;

  if (!AIndex)              return;
  if (dist2<dist1)          return;
  if (!AIndex[atomNum])     return;
  if (AIndex[atomNum]->Ter) return;

  ContactIndex = new CContactIndex ( contact,maxlen,ncontacts,ilen );

  FindSeqSection ( AIndex[atomNum],seqDist,seq1,seq2 );

  d12 = dist1*dist1;
  d22 = dist2*dist2;

  for (i=0;i<ilen;i++)
    if ((i!=atomNum) && AIndex[i])  {
      if (isContact(AIndex[atomNum],AIndex[i],seq1,seq2,dist2,
                    d12,d22,d2))
         ContactIndex->AddContact ( atomNum,i,sqrt(d2),group );
    }

  ContactIndex->GetIndex ( contact,ncontacts );

  delete ContactIndex;

}


void  CMMDBCoorManager::SeekContacts ( PCAtom     A,
                                       PPCAtom    AIndex,
                                       int        ilen,
                                       realtype   dist1,
                                       realtype   dist2,
                                       int        seqDist,
                                       RPSContact contact,
                                       int &      ncontacts,
                                       int        maxlen,
                                       long       group
                                     )  {
PCContactIndex ContactIndex;
realtype       d12,d22,d2;
int            i,seq1,seq2;

  if (!AIndex)     return;
  if (dist2<dist1) return;
  if (!A)          return;
  if (A->Ter)      return;

  ContactIndex = new CContactIndex ( contact,maxlen,ncontacts,ilen );

  FindSeqSection ( A,seqDist,seq1,seq2 );

  d12 = dist1*dist1;
  d22 = dist2*dist2;

  for (i=0;i<ilen;i++)
    if ((AIndex[i]!=A) && AIndex[i])  {
      if (isContact(A,AIndex[i],seq1,seq2,dist2,d12,d22,d2))
        ContactIndex->AddContact ( -1,i,sqrt(d2),group );
    }

  ContactIndex->GetIndex ( contact,ncontacts );

  delete ContactIndex;

}


void  CMMDBCoorManager::SeekContacts ( PPCAtom    AIndex1,
                                       int        ilen1,
                                       PPCAtom    AIndex2,
                                       int        ilen2,
                                       realtype   dist1,
                                       realtype   dist2,
                                       int        seqDist,
                                       RPSContact contact,
                                       int &      ncontacts,
                                       int        maxlen,
                                       mat44 *    TMatrix,
                                       long       group,
                                       int        bricking,
                                       Boolean    doSqrt
                                     )  {
//  It is Ok to have NULL pointers in AIndex1 and AIndex2
PCContactIndex ContactIndex;
PPCAtom        A1,A2;
rvector        sx0,sy0,sz0;
rvector        dx0,dy0,dz0;
realtype       d12,d22,d2, eps;
int            l1,l2, i,j, nx,ny,nz, dn;
int            ix1,ix2, iy1,iy2, iz1,iz2, ix,iy,iz;
int            seq1,seq2;
PCBrick        B;
Boolean        swap,UnitT;

  if ((dist2<dist1) || (!AIndex1) || (!AIndex2))  return;

  ContactIndex = new CContactIndex ( contact,maxlen,ncontacts,
                                     ilen1*ilen2 );

  sx0   = NULL;
  sy0   = NULL;
  sz0   = NULL;
  dx0   = NULL;
  dy0   = NULL;
  dz0   = NULL;
  UnitT = True;
  if (TMatrix)  {
    // Transformation matrix is given. Check that that is not
    // the unit one.
    eps = 1.0e-6;
    for (i=0;(i<3) && UnitT;i++)
      for (j=0;(j<4) && UnitT;j++)
        if (i==j)  UnitT = fabs(1.0-(*TMatrix)[i][j])<eps;
             else  UnitT = fabs((*TMatrix)[i][j])<eps;
    if (!UnitT)  {
      // A non-unit transformation to AIndex2 is required.
      // As AIndex1 and AIndex2 may overlap, we have to save
      // the original AIndex1 coordinates
      GetVectorMemory ( sx0,ilen1,0 );
      GetVectorMemory ( sy0,ilen1,0 );
      GetVectorMemory ( sz0,ilen1,0 );
      for (i=0;i<ilen1;i++)
        if (AIndex1[i])  {
          sx0[i] = AIndex1[i]->x;
          sy0[i] = AIndex1[i]->y;
          sz0[i] = AIndex1[i]->z;
        }
      // Save original AIndex2 coordinates and modify the index
      GetVectorMemory ( dx0,ilen2,0 );
      GetVectorMemory ( dy0,ilen2,0 );
      GetVectorMemory ( dz0,ilen2,0 );
      for (i=0;i<ilen2;i++)
        if (AIndex2[i])  {
          dx0[i] = AIndex2[i]->x;
          dy0[i] = AIndex2[i]->y;
          dz0[i] = AIndex2[i]->z;
          AIndex2[i]->Transform ( *TMatrix );
        }
    }
  }

  // choose A2 as the largest atom set convenient for
  // bricking (bricking on larger set is more efficient)
  if (bricking & BRICK_ON_1)  {
    A1   = AIndex2;
    A2   = AIndex1;
    l1   = ilen2;
    l2   = ilen1;
    swap = True;
  } else if (bricking & BRICK_ON_2)  {
    A1   = AIndex1;
    A2   = AIndex2;
    l1   = ilen1;
    l2   = ilen2;
    swap = False;
  } else if (ilen1<=ilen2)  {
    A1   = AIndex1;
    A2   = AIndex2;
    l1   = ilen1;
    l2   = ilen2;
    swap = False;
  } else  {
    A1   = AIndex2;
    A2   = AIndex1;
    l1   = ilen2;
    l2   = ilen1;
    swap = True;
  }

  d12 = dist1*dist1;
  d22 = dist2*dist2;

  if (((bricking & BRICK_READY)==0) || (!Brick))
    MakeBricks ( A2,l2,dist2*1.5 );

  dn = mround(dist2/brick_size)+1;

  if (Brick)
    for (i=0;i<l1;i++)
      if (A1[i])  {
        if (!A1[i]->Ter)  {
          if (UnitT)  {
            // No transformation -- AIndex1 and AIndex2 are unmodified.
            // Calculate the forbidden sequence region
            FindSeqSection ( A1[i],seqDist,seq1,seq2 );
            // And the brick location
            GetBrickCoor   ( A1[i],nx,ny,nz );
          } else  {
            // AIndex2 and AIndex1 are modified, but the sequence
            // distance does not apply to physically different chains
            // (meaning that transformation of A2 effectively makes
            // a different chain). Use unmodified atom coordinates
            // of 1st set for calculating the brick location.
            if (swap) GetBrickCoor ( A1[i],nx,ny,nz ); // A1 is AIndex2
                 else GetBrickCoor ( sx0[i],sy0[i],sz0[i],nx,ny,nz );
        }
        if (nx>=0)  {
          ix1 = IMax ( 0,nx-dn );
          iy1 = IMax ( 0,ny-dn );
          iz1 = IMax ( 0,nz-dn );
          ix2 = IMin ( nbrick_x,nx+dn+1 );
          iy2 = IMin ( nbrick_y,ny+dn+1 );
          iz2 = IMin ( nbrick_z,nz+dn+1 );
          if (UnitT)  {
            // AIndex1 unmodified, use it
            for (ix=ix1;ix<ix2;ix++)
              if (Brick[ix])
                for (iy=iy1;iy<iy2;iy++)
                  if (Brick[ix][iy])
                    for (iz=iz1;iz<iz2;iz++)  {
                      B = Brick[ix][iy][iz];
                      if (B)
                        for (j=0;j<B->nAtoms;j++)
                          if (B->Atom[j]!=A1[i])  {
                            if (isContact(A1[i],B->Atom[j],seq1,seq2,
                                          dist2,d12,d22,d2))  {
                              if (doSqrt)  d2 = sqrt(d2);
                              if (swap)  ContactIndex->AddContact (
                                           B->id[j],i,d2,group );
                                   else  ContactIndex->AddContact (
                                           i,B->id[j],d2,group );
                            }
                          }
                    }
          } else if (swap)  {
            // A1 stands for AIndex2, it is modified and we need to use
            // the modified coordinates
            for (ix=ix1;ix<ix2;ix++)
              if (Brick[ix])
                for (iy=iy1;iy<iy2;iy++)
                  if (Brick[ix][iy])
                    for (iz=iz1;iz<iz2;iz++)  {
                      B = Brick[ix][iy][iz];
                      if (B)
                        for (j=0;j<B->nAtoms;j++)
                          if (isContact(A1[i]->x,A1[i]->y,A1[i]->z,
                                        B->Atom[j], dist2,d12,d22,d2))  {
                            if (doSqrt)  d2 = sqrt(d2);
                            ContactIndex->AddContact ( B->id[j],i,d2,group );
                          }
                    }
          } else  {
            // A1 stands for AIndex1, it may be modified (if AIndex1
            // and AIndex2 overlap) -- use its unmodified coordinates
            // instead.
            for (ix=ix1;ix<ix2;ix++)
              if (Brick[ix])
                for (iy=iy1;iy<iy2;iy++)
                  if (Brick[ix][iy])
                    for (iz=iz1;iz<iz2;iz++)  {
                      B = Brick[ix][iy][iz];
                      if (B)
                        for (j=0;j<B->nAtoms;j++)
                          if (isContact(sx0[i],sy0[i],sz0[i],
                                        B->Atom[j],dist2,d12,d22,d2))  {
                            if (doSqrt)  d2 = sqrt(d2);
                            ContactIndex->AddContact ( i,B->id[j],d2,group );
                          }
                    }
          }
        }
      }
    }


  if (!UnitT)  {
    // restore original coordinates
    for (i=0;i<ilen1;i++)
      if (AIndex1[i])  {
        AIndex1[i]->x = sx0[i];
        AIndex1[i]->y = sy0[i];
        AIndex1[i]->z = sz0[i];
      }
    for (i=0;i<ilen2;i++)
      if (AIndex2[i])  {
        AIndex2[i]->x = dx0[i];
        AIndex2[i]->y = dy0[i];
        AIndex2[i]->z = dz0[i];
      }
    FreeVectorMemory ( sx0,0 );
    FreeVectorMemory ( sy0,0 );
    FreeVectorMemory ( sz0,0 );
    FreeVectorMemory ( dx0,0 );
    FreeVectorMemory ( dy0,0 );
    FreeVectorMemory ( dz0,0 );
  }

  ContactIndex->GetIndex ( contact,ncontacts );

  delete ContactIndex;

}


void  CMMDBCoorManager::SeekContacts ( PPCAtom   AIndex1,
                                       int       ilen1,
                                       PPCAtom   AIndex2,
                                       int       ilen2,
                                       realtype  contDist,
                                       PSContact contact,
                                       int &     ncontacts,
                                       int       bricking
                                     )  {
//  Simplified optimized for speed version:
//    - no NULL pointers and Ters in AIndex1 and AIndex2
//    - no checks for identity atoms in AIndex1 and AIndex2
//    - contact must be pre-allocated with at least ilen1*ilen2 elements
//    - contact returns square distances
//    - ncontacts is always reset
PPCAtom   A1,A2;
realtype  contDist2, dx,dy,dz, d2;
int       l1,l2, i,j, nx,ny,nz, dn;
int       ix1,ix2, iy1,iy2, iz1,iz2, ix,iy,iz;
PCBrick   B;
Boolean   swap;

  // choose A2 as the largest atom set convenient for
  // bricking (bricking on larger set is more efficient)
  if (bricking & BRICK_ON_1)  {
    A1   = AIndex2;
    A2   = AIndex1;
    l1   = ilen2;
    l2   = ilen1;
    swap = True;
  } else if (bricking & BRICK_ON_2)  {
    A1   = AIndex1;
    A2   = AIndex2;
    l1   = ilen1;
    l2   = ilen2;
    swap = False;
  } else if (ilen1<=ilen2)  {
    A1   = AIndex1;
    A2   = AIndex2;
    l1   = ilen1;
    l2   = ilen2;
    swap = False;
  } else  {
    A1   = AIndex2;
    A2   = AIndex1;
    l1   = ilen2;
    l2   = ilen1;
    swap = True;
  }

  contDist2 = contDist*contDist;

  if (((bricking & BRICK_READY)==0) || (!Brick))
    MakeBricks ( A2,l2,contDist*1.5 );
    
  ncontacts = 0;
  
  if (!Brick)  return;

  dn = (int)floor(contDist/brick_size)+1;

  if (swap)  {

    for (i=0;i<l1;i++)  {
      // Find brick location
      GetBrickCoor ( A1[i],nx,ny,nz );
      if (nx>=0)  {
        ix1 = IMax ( 0,nx-dn );
        iy1 = IMax ( 0,ny-dn );
        iz1 = IMax ( 0,nz-dn );
        ix2 = IMin ( nbrick_x,nx+dn+1 );
        iy2 = IMin ( nbrick_y,ny+dn+1 );
        iz2 = IMin ( nbrick_z,nz+dn+1 );
        for (ix=ix1;ix<ix2;ix++)
          if (Brick[ix])
            for (iy=iy1;iy<iy2;iy++)
              if (Brick[ix][iy])
                for (iz=iz1;iz<iz2;iz++)  {
                  B = Brick[ix][iy][iz];
                  if (B)
                    for (j=0;j<B->nAtoms;j++)  {
                      dx = A1[i]->x - B->Atom[j]->x;
                      dy = A1[i]->y - B->Atom[j]->y;
                      dz = A1[i]->z - B->Atom[j]->z;
                      d2 = dx*dx + dy*dy + dz*dz;
                      if (d2<=contDist2)  {
                        contact[ncontacts].id1  = B->id[j];
                        contact[ncontacts].id2  = i;
                        contact[ncontacts].dist = d2;
                        ncontacts++;
                      }
                    }
                }
      }
    }

  } else  {

    for (i=0;i<l1;i++)  {
      // Find brick location
      GetBrickCoor ( A1[i],nx,ny,nz );
      if (nx>=0)  {
        ix1 = IMax ( 0,nx-dn );
        iy1 = IMax ( 0,ny-dn );
        iz1 = IMax ( 0,nz-dn );
        ix2 = IMin ( nbrick_x,nx+dn+1 );
        iy2 = IMin ( nbrick_y,ny+dn+1 );
        iz2 = IMin ( nbrick_z,nz+dn+1 );
        for (ix=ix1;ix<ix2;ix++)
          if (Brick[ix])
            for (iy=iy1;iy<iy2;iy++)
              if (Brick[ix][iy])
                for (iz=iz1;iz<iz2;iz++)  {
                  B = Brick[ix][iy][iz];
                  if (B)
                    for (j=0;j<B->nAtoms;j++)  {
                      dx = A1[i]->x - B->Atom[j]->x;
                      dy = A1[i]->y - B->Atom[j]->y;
                      dz = A1[i]->z - B->Atom[j]->z;
                      d2 = dx*dx + dy*dy + dz*dz;
                      if (d2<=contDist2)  {
                        contact[ncontacts].id1  = i;
                        contact[ncontacts].id2  = B->id[j];
                        contact[ncontacts].dist = d2;
                        ncontacts++;
                      }
                    }
                }
      }
    }

  }

}


void  CMMDBCoorManager::SeekContacts ( PPCAtom     AIndex1,
                                       int         ilen1,
                                       PPCAtom *   AIndex2,
                                       ivector     ilen2,
                                       int         nStructures,
                                       realtype    dist1,
                                       realtype    dist2,
                                       PPCMContact & contact,
                                       int         bricking
                                     )  {
//  It is Ok to have NULL pointers in AIndex1 and AIndex2
PCMBrick B;
PCAtom   A;
realtype d12,d22,d2;
int      dn, i,j,k, nx,ny,nz, ix1,iy1,iz1, ix2,iy2,iz2;
int      ix,iy,iz;

  if (dist2<dist1)              return;
  if ((!AIndex1) || (!AIndex2)) return;

  d12 = dist1*dist1;
  d22 = dist2*dist2;

  if (((bricking & BRICK_READY)==0) || (!MBrick))
    MakeMBricks ( AIndex2,ilen2,nStructures,dist2*1.5 );

  contact = new PCMContact[ilen1];

  dn = mround(dist2/brick_size)+1;

  if (MBrick)
    for (i=0;i<ilen1;i++)  {
      A = AIndex1[i];
      contact[i] = NULL;
      if (A)  {
        if (!A->Ter)  {
          contact[i] = new CMContact(nStructures);
          contact[i]->contactID = i;
          //  Calculate the brick location
          GetMBrickCoor ( A,nx,ny,nz );
          if (nx>=0)  {
            ix1 = IMax ( 0,nx-dn );
            iy1 = IMax ( 0,ny-dn );
            iz1 = IMax ( 0,nz-dn );
            ix2 = IMin ( nmbrick_x,nx+dn+1 );
            iy2 = IMin ( nmbrick_y,ny+dn+1 );
            iz2 = IMin ( nmbrick_z,nz+dn+1 );
            for (ix=ix1;ix<ix2;ix++)
              if (MBrick[ix])
                for (iy=iy1;iy<iy2;iy++)
                  if (MBrick[ix][iy])
                    for (iz=iz1;iz<iz2;iz++)  {
                      B = MBrick[ix][iy][iz];
                      if (B)
                        for (j=0;j<nStructures;j++)
                          for (k=0;k<B->nAtoms[j];k++)
                            if (B->Atom[j][k]!=A)  {
                              if (isContact(A,B->Atom[j][k],
                                            MaxInt4,MinInt4,
                                            dist2,d12,d22,d2))
                                contact[i]->AddContact (
                                       B->Atom[j][k],j,B->id[j][k] );
                            }
                    }
          }
        }
      }
    }
  else
    for (i=0;i<ilen1;i++)
      contact[i] = NULL;

}



DefineClass(CSortContacts)

class CSortContacts : public CQuickSort  {
  public :
    CSortContacts() : CQuickSort() {}
    int  Compare ( int i, int j );
    void Swap    ( int i, int j );
    void Sort    ( PSContact contact, int ncontacts, int sortmode );
  protected :
    int  mode;
};

int CSortContacts::Compare ( int i, int j )  {
Boolean gt,lt;
  switch (mode)  {
    default          :
    case CNSORT_1INC : gt = (((PSContact)data)[i].id1 >
                             ((PSContact)data)[j].id1);
                       lt = (((PSContact)data)[i].id1 <
                             ((PSContact)data)[j].id1);
                   break;
    case CNSORT_1DEC : gt = (((PSContact)data)[j].id1 >
                             ((PSContact)data)[i].id1);
                       lt = (((PSContact)data)[j].id1 <
                             ((PSContact)data)[i].id1);
                   break;
    case CNSORT_2INC : gt = (((PSContact)data)[i].id2 >
                             ((PSContact)data)[j].id2);
                       lt = (((PSContact)data)[i].id2 <
                             ((PSContact)data)[j].id2);
                   break;
    case CNSORT_2DEC : gt = (((PSContact)data)[j].id2 >
                             ((PSContact)data)[i].id2);
                       lt = (((PSContact)data)[j].id2 <
                             ((PSContact)data)[i].id2);
                   break;
    case CNSORT_DINC : gt = (((PSContact)data)[i].dist >
                             ((PSContact)data)[j].dist);
                       lt = (((PSContact)data)[i].dist <
                             ((PSContact)data)[j].dist);
                   break;
    case CNSORT_DDEC : gt = (((PSContact)data)[j].dist >
                             ((PSContact)data)[i].dist);
                       lt = (((PSContact)data)[j].dist <
                             ((PSContact)data)[i].dist);
                   break;
  }
  if (gt)  return  1;
  if (lt)  return -1;
  return 0;
}

void CSortContacts::Swap ( int i, int j )  {
  ((PSContact)data)[i].Swap ( ((PSContact)data)[j] );
}


void CSortContacts::Sort ( PSContact contact, int ncontacts,
                           int sortmode )  {
  mode = sortmode;
  if (mode!=CNSORT_OFF)
    CQuickSort::Sort ( &(contact[0]),ncontacts );
}


void  SortContacts ( PSContact contact, int ncontacts,
                     int sortmode )  {
CSortContacts SC;
  if (sortmode!=CNSORT_OFF)
    SC.Sort ( contact,ncontacts,sortmode );
}


/*
void  SortContacts ( PSContact contact, int ncontacts, int sortmode )  {
int     i,l1,l2, m1,m2;
Boolean swap;

  if (sortmode==CNSORT_OFF)  return;

  l1 = 1;
  l2 = ncontacts;
  do  {
    m1   = -1;
    m2   = -1;
    for (i=l1;i<l2;i++)  {
      switch (sortmode)  {
        default          :
        case CNSORT_1INC : swap = (contact[i-1].id1>contact[i].id1);   break;
        case CNSORT_1DEC : swap = (contact[i-1].id1<contact[i].id1);   break;
        case CNSORT_2INC : swap = (contact[i-1].id2>contact[i].id2);   break;
        case CNSORT_2DEC : swap = (contact[i-1].id2<contact[i].id2);   break;
        case CNSORT_DINC : swap = (contact[i-1].dist>contact[i].dist); break;
        case CNSORT_DDEC : swap = (contact[i-1].dist<contact[i].dist); break;
      }
      if (swap)  {
        if (m1<0)  m1 = i;
        m2 = i;
        ISwap ( contact[i-1].id1  ,contact[i].id1   );
        ISwap ( contact[i-1].id2  ,contact[i].id2   );
        RSwap ( contact[i-1].dist ,contact[i].dist  );
        LSwap ( contact[i-1].group,contact[i].group );
      }
    }
    l1 = IMax(1,m1-1);
    l2 = m2+1;
  } while (l2>0);

}
*/




//  -------------------  Stream functions  ----------------------


void  CMMDBCoorManager::write ( RCFile f )  {
byte Version=1;
  f.WriteByte ( &Version    );
  CMMDBFile::write ( f );
  f.WriteInt  ( &CoorIDCode );
  f.WriteReal ( &brick_size );
  f.WriteReal ( &xbrick_0   );
  f.WriteReal ( &ybrick_0   );
  f.WriteReal ( &zbrick_0   );
  f.WriteInt  ( &nbrick_x   );
  f.WriteInt  ( &nbrick_y   );
  f.WriteInt  ( &nbrick_z   );
}

void  CMMDBCoorManager::read ( RCFile f )  {
byte Version;
  f.ReadByte ( &Version    );
  CMMDBFile::read ( f );
  f.ReadInt  ( &CoorIDCode );
  f.ReadReal ( &brick_size );
  f.ReadReal ( &xbrick_0   );
  f.ReadReal ( &ybrick_0   );
  f.ReadReal ( &zbrick_0   );
  f.ReadInt  ( &nbrick_x   );
  f.ReadInt  ( &nbrick_y   );
  f.ReadInt  ( &nbrick_z   );
}


MakeStreamFunctions(CMMDBCoorManager)




// ===================================================================

int  SuperposeAtoms ( mat44 & T, PPCAtom A1, int nA, PPCAtom A2,
                      ivector C )  {
realtype xc1,yc1,zc1, xc2,yc2,zc2, det,B;
rmatrix  A,U,V;
rvector  W,RV1;
vect3    vc1,vc2;
int      i,j,k,i1,i2,nat;


  //  1. Set unit matrix as "default" return

  for (i=0;i<4;i++)  {
    for (j=0;j<4;j++)
      T[i][j] = 0.0;
    T[i][i] = 1.0;
  }


  //  2. Calculate mass centers

  xc1 = 0.0;
  yc1 = 0.0;
  zc1 = 0.0;
  xc2 = 0.0;
  yc2 = 0.0;
  zc2 = 0.0;

  nat = 0;
  if (C)  {

    for (i1=0;i1<nA;i1++)
      if (!A1[i1]->Ter)  {
        i2 = C[i1];
        if (i2>=0)  {
          xc1 += A1[i1]->x;
          yc1 += A1[i1]->y;
          zc1 += A1[i1]->z;
          xc2 += A2[i2]->x;
          yc2 += A2[i2]->y;
          zc2 += A2[i2]->z;
          nat++;
        }
      }

  } else  {

    for (i=0;i<nA;i++)
      if ((!A1[i]->Ter) && (!A2[i]->Ter))  {
        xc1 += A1[i]->x;
        yc1 += A1[i]->y;
        zc1 += A1[i]->z;
        xc2 += A2[i]->x;
        yc2 += A2[i]->y;
        zc2 += A2[i]->z;
        nat++;
      }

  }

  if (nat>1)  {
    xc1 /= nat;
    yc1 /= nat;
    zc1 /= nat;
    xc2 /= nat;
    yc2 /= nat;
    zc2 /= nat;
  } else if (nat>0)  {
    T[0][3] = xc2 - xc1;
    T[1][3] = yc2 - yc1;
    T[2][3] = zc2 - zc1;
    return SPOSEAT_Ok;
  } else
    return SPOSEAT_NoAtoms;


  //  3.  Calculate the correlation matrix

  GetMatrixMemory ( A,3,3,1,1 );

  for (i=1;i<=3;i++)
    for (j=1;j<=3;j++)
      A[i][j] = 0.0;

  if (C)  {

    for (i1=0;i1<nA;i1++)
      if (!A1[i1]->Ter)  {
        i2 = C[i1];
        if (i2>=0)  {
          vc1[0] = A1[i1]->x - xc1;
          vc1[1] = A1[i1]->y - yc1;
          vc1[2] = A1[i1]->z - zc1;
          vc2[0] = A2[i2]->x - xc2;
          vc2[1] = A2[i2]->y - yc2;
          vc2[2] = A2[i2]->z - zc2;
          for (i=1;i<=3;i++)
            for (j=1;j<=3;j++)
              A[i][j] += vc1[j-1]*vc2[i-1];
        }
      }

  } else  {

    for (k=0;k<nA;k++)
      if ((!A1[k]->Ter) && (!A2[k]->Ter))  {
        vc1[0] = A1[k]->x - xc1;
        vc1[1] = A1[k]->y - yc1;
        vc1[2] = A1[k]->z - zc1;
        vc2[0] = A2[k]->x - xc2;
        vc2[1] = A2[k]->y - yc2;
        vc2[2] = A2[k]->z - zc2;
        for (i=1;i<=3;i++)
          for (j=1;j<=3;j++)
            A[i][j] += vc1[j-1]*vc2[i-1];
      }

  }


  //  4. Calculate transformation matrix (to be applied to A1)

  det = A[1][1]*A[2][2]*A[3][3] + 
        A[1][2]*A[2][3]*A[3][1] +
        A[2][1]*A[3][2]*A[1][3] -
        A[1][3]*A[2][2]*A[3][1] -
        A[1][1]*A[2][3]*A[3][2] -
        A[3][3]*A[1][2]*A[2][1];

  //  4.1 SV-decompose the correlation matrix

  GetMatrixMemory ( U  ,3,3,1,1 );
  GetMatrixMemory ( V  ,3,3,1,1 );
  GetVectorMemory ( W  ,3,1 );
  GetVectorMemory ( RV1,3,1 );

  SVD ( 3,3,3,A,U,V,W,RV1,True,True,i );

  if (i!=0)  {
    FreeVectorMemory ( RV1,1 );
    FreeVectorMemory ( W  ,1 );
    FreeMatrixMemory ( V  ,3,1,1 );
    FreeMatrixMemory ( U  ,3,1,1 );
    FreeMatrixMemory ( A  ,3,1,1 );
    return SPOSEAT_SVD_Fail;
  }

  //  4.2 Check for parasite inversion and fix it if found

  if (det<=0.0)  {
    k = 0;
    B = MaxReal;
    for (j=1;j<=3;j++)
      if (W[j]<B)  {
        B = W[j];
        k = j;
      }
    for (j=1;j<=3;j++)
      V[j][k] = -V[j][k];
  }

  //  4.3 Calculate rotational part of T

  for (j=1;j<=3;j++)
    for (k=1;k<=3;k++)  {
      B = 0.0;
      for (i=1;i<=3;i++)
        B += U[j][i]*V[k][i];
      T[j-1][k-1] = B;
    }


  //  4.4 Add translational part to T

  T[0][3] = xc2 - T[0][0]*xc1 - T[0][1]*yc1 - T[0][2]*zc1;
  T[1][3] = yc2 - T[1][0]*xc1 - T[1][1]*yc1 - T[1][2]*zc1;
  T[2][3] = zc2 - T[2][0]*xc1 - T[2][1]*yc1 - T[2][2]*zc1;


  //  5. Release memory and quit

  FreeVectorMemory ( RV1,1 );
  FreeVectorMemory ( W  ,1 );
  FreeMatrixMemory ( V  ,3,1,1 );
  FreeMatrixMemory ( U  ,3,1,1 );
  FreeMatrixMemory ( A  ,3,1,1 );

  return SPOSEAT_Ok;

}

realtype getPhi ( PPCAtom A )  {
//
//   A0    A1    A2    A3
//   o-----o-----o-----o
//            |
//           Phi
//
//  -Pi <= Phi <= +Pi
//
vect3    U,W,V, a,b,c;
realtype Wmag,S,T;

  U[0] = A[0]->x - A[1]->x;
  U[1] = A[0]->y - A[1]->y;
  U[2] = A[0]->z - A[1]->z;

  W[0] = A[2]->x - A[1]->x;
  W[1] = A[2]->y - A[1]->y;
  W[2] = A[2]->z - A[1]->z;

  V[0] = A[3]->x - A[2]->x;
  V[1] = A[3]->y - A[2]->y;
  V[2] = A[3]->z - A[2]->z;

  a[0] = U[1]*W[2] - W[1]*U[2];
  a[1] = U[2]*W[0] - W[2]*U[0];
  a[2] = U[0]*W[1] - W[0]*U[1];

  b[0] = V[1]*W[2] - W[1]*V[2];
  b[1] = V[2]*W[0] - W[2]*V[0];
  b[2] = V[0]*W[1] - W[0]*V[1];

  c[0] = a[1]*b[2] - b[1]*a[2];
  c[1] = a[2]*b[0] - b[2]*a[0];
  c[2] = a[0]*b[1] - b[0]*a[1];

  Wmag = sqrt(W[0]*W[0]+W[1]*W[1]+W[2]*W[2]);

  S    = c[0]*W[0] + c[1]*W[1] + c[2]*W[2];
  T    = a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
  T   *= Wmag;

  if ((S==0.0) && (T==0.0))  return NO_TORSION;
                       else  return atan2(S,T);

}

realtype getPsi ( PPCAtom A )  {
vect3    v1,v2;
realtype l1,l2;

  v1[0] = A[0]->x - A[1]->x;
  v1[1] = A[0]->y - A[1]->y;
  v1[2] = A[0]->z - A[1]->z;

  v2[0] = A[2]->x - A[1]->x;
  v2[1] = A[2]->y - A[1]->y;
  v2[2] = A[2]->z - A[1]->z;

  l1 = v1[0]*v1[0] + v1[1]*v1[1] + v1[2]*v1[2];
  if (l1==0.0)  l1 = 1.0;
  l2 = v2[0]*v2[0] + v2[1]*v2[1] + v2[2]*v2[2];
  if (l2==0.0)  l2 = 1.0;

  return  acos((v1[0]*v2[0]+v1[1]*v2[1]+v1[2]*v2[2])/sqrt(l1*l2));

}

