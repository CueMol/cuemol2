//  $Id: mmdb_sbase0.cpp,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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
//  **** Module  :  mmdb_sbase0 <implementation>
//       ~~~~~~~~~
//  **** Classes :  CSBase0      ( structure base manager 0     )
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


#ifndef  __LinAlg__
#include "linalg_.h"
#endif

#ifndef  __MMDB_SBase0__
#include "mmdb_sbase0.h"
#endif

#ifndef  __MMDB_Tables__
#include "mmdb_tables.h"
#endif



//  ======================  SB Atom Class  =========================

CSBAtom::CSBAtom() : CStream()  {
  SBAtomInit();
}

CSBAtom::CSBAtom ( RPCStream Object ) : CStream(Object)  {
  SBAtomInit();
}

CSBAtom::~CSBAtom() {}

void CSBAtom::SBAtomInit()  {
  sca_name    [0] = char(0);
  pdb_name    [0] = char(0);
  old_pdb_name[0] = char(0);
  element     [0] = char(0);
  energyType  [0] = char(0);
  x               = -MaxReal;
  y               = -MaxReal;
  z               = -MaxReal;
  x_esd           = 0.0;
  y_esd           = 0.0;
  z_esd           = 0.0;
  ccp4_charge     = 0.0;  // atom charge from ccp4 libs
  sca_charge      = 0.0;  // formal atom charge (MSD)
  partial_charge  = 0.0;  // partial atom charge (MSD)
  vdw_radius      = 0.0;
  vdwh_radius     = 0.0;
  ion_radius      = 0.0;
  valency         = 0;
  chirality       = 'N';
  leaving         = 'N';
  hb_type         = 'N';
}

void CSBAtom::Copy ( PCSBAtom A )  {
  strcpy ( sca_name    ,A->sca_name     );
  strcpy ( pdb_name    ,A->pdb_name     );
  strcpy ( old_pdb_name,A->old_pdb_name );
  strcpy ( element     ,A->element      );
  strcpy ( energyType  ,A->energyType   );
  x              = A->x;
  y              = A->y;
  z              = A->z;
  x_esd          = A->x_esd;
  y_esd          = A->y_esd;
  z_esd          = A->z_esd;
  ccp4_charge    = A->ccp4_charge;
  sca_charge     = A->sca_charge;
  partial_charge = A->partial_charge;
  vdw_radius     = A->vdw_radius;
  vdwh_radius    = A->vdwh_radius;
  ion_radius     = A->ion_radius;
  valency        = A->valency;
  chirality      = A->chirality;
  leaving        = A->leaving;
  hb_type        = A->hb_type;
}

void CSBAtom::makeCAtom ( RPCAtom a )  {
  if (!a)  a = newCAtom();
  a->SetAtomName    ( 0,0,pdb_name,"","",element );
  a->SetCharge      ( ccp4_charge );
  a->SetCoordinates ( x,y,z,1.0,0.0  );
  strcpy ( a->energyType,energyType  );
  a->sigOcc = -1.0;  // signal that atom was added from SBase
}

PCAtom CSBAtom::makeCAtom()  {
PCAtom a;
  a = newCAtom();
  a->SetAtomName    ( 0,0,pdb_name,"","",element );
  a->SetCharge      ( ccp4_charge );
  a->SetCoordinates ( x,y,z,1.0,0.0 );
  strcpy ( a->energyType,energyType );
  a->sigOcc = -1.0;  // signal that atom was added from SBase
  return a;
}


void CSBAtom::write ( RCFile f )  {
int Version=5;
  f.WriteInt  ( &Version                      );
  f.WriteFile ( sca_name    ,sizeof(sca_name)     );
  f.WriteFile ( pdb_name    ,sizeof(pdb_name)     );
  f.WriteFile ( old_pdb_name,sizeof(old_pdb_name) );
  f.WriteFile ( element     ,sizeof(element)      );
  f.WriteFile ( energyType  ,sizeof(energyType)   );
  f.WriteReal ( &x                            );
  f.WriteReal ( &y                            );
  f.WriteReal ( &z                            );
  f.WriteReal ( &x_esd                        );
  f.WriteReal ( &y_esd                        );
  f.WriteReal ( &z_esd                        );
  f.WriteReal ( &ccp4_charge                  );
  f.WriteReal ( &sca_charge                   );
  f.WriteReal ( &partial_charge               );
  f.WriteReal ( &vdw_radius                   );
  f.WriteReal ( &vdwh_radius                  );
  f.WriteReal ( &ion_radius                   );
  f.WriteInt  ( &valency                      );
  f.WriteFile ( &chirality,sizeof(chirality)  );
  f.WriteFile ( &leaving  ,sizeof(leaving)    );
  f.WriteFile ( &hb_type  ,sizeof(hb_type)    );
}

void CSBAtom::read ( RCFile f )  {
int Version;
  f.ReadInt  ( &Version                      );
  f.ReadFile ( sca_name  ,sizeof(sca_name)   );
  f.ReadFile ( pdb_name  ,sizeof(pdb_name)   );
  if (Version>4)
    f.ReadFile ( old_pdb_name,sizeof(old_pdb_name) );
  else  strcpy ( old_pdb_name,pdb_name );
  f.ReadFile ( element   ,sizeof(element)    );
  f.ReadFile ( energyType,sizeof(energyType) );
  f.ReadReal ( &x                            );
  f.ReadReal ( &y                            );
  f.ReadReal ( &z                            );
  f.ReadReal ( &x_esd                        );
  f.ReadReal ( &y_esd                        );
  f.ReadReal ( &z_esd                        );
  if (Version>2)
    f.ReadReal ( &ccp4_charge    );
  if (Version>3)  {
    f.ReadReal ( &sca_charge     );
    f.ReadReal ( &partial_charge );
  }
  if (Version>1)  {
    f.ReadReal ( &vdw_radius  );
    f.ReadReal ( &vdwh_radius );
    f.ReadReal ( &ion_radius  );
    f.ReadInt  ( &valency     );
  }
  f.ReadFile ( &chirality,sizeof(chirality)  );
  f.ReadFile ( &leaving  ,sizeof(leaving)    );
  if (Version>1)
    f.ReadFile ( &hb_type,sizeof(hb_type) );
}

MakeStreamFunctions(CSBAtom)



//  =======================  SB Bond Class  =======================

CSBBond::CSBBond() : CStream()  {
  SBBondInit();
}

CSBBond::CSBBond ( RPCStream Object ) : CStream(Object)  {
  SBBondInit();
}

CSBBond::~CSBBond() {}

void CSBBond::SBBondInit()  {
  atom1      = -1;
  atom2      = -1;
  order      = BOND_SINGLE;
  length     = 0.0;
  length_esd = 0.0;
}

void CSBBond::SetBond ( int at1, int at2, int ord )  {
  atom1 = at1;
  atom2 = at2;
  order = ord;
}

void CSBBond::Copy ( PCSBBond B )  {
  atom1      = B->atom1;
  atom2      = B->atom2;
  order      = B->order;
  length     = B->length;
  length_esd = B->length_esd;
}

void CSBBond::write ( RCFile f )  {
int Version=1;
  f.WriteInt  ( &Version    );
  f.WriteInt  ( &atom1      );
  f.WriteInt  ( &atom2      );
  f.WriteInt  ( &order      );
  f.WriteReal ( &length     );
  f.WriteReal ( &length_esd );
}

void CSBBond::read ( RCFile f )  {
int Version;
  f.ReadInt  ( &Version    );
  f.ReadInt  ( &atom1      );
  f.ReadInt  ( &atom2      );
  f.ReadInt  ( &order      );
  f.ReadReal ( &length     );
  f.ReadReal ( &length_esd );
}


MakeStreamFunctions(CSBBond)



//  =======================  SB Angle Class  =====================

CSBAngle::CSBAngle() : CStream()  {
  SBAngleInit();
}

CSBAngle::CSBAngle ( RPCStream Object ) : CStream(Object)  {
  SBAngleInit();
}

CSBAngle::~CSBAngle() {}

void CSBAngle::SBAngleInit()  {
  atom1     = -1;
  atom2     = -1;
  atom3     = -1;
  angle     = 0.0;
  angle_esd = 0.0;
}

void CSBAngle::Copy ( PCSBAngle G )  {
  atom1     = G->atom1;
  atom2     = G->atom2;
  atom3     = G->atom3;
  angle     = G->angle;
  angle_esd = G->angle_esd;
}

void CSBAngle::write ( RCFile f )  {
int Version=1;
  f.WriteInt  ( &Version   );
  f.WriteInt  ( &atom1     );
  f.WriteInt  ( &atom2     );
  f.WriteInt  ( &atom3     );
  f.WriteReal ( &angle     );
  f.WriteReal ( &angle_esd );
}

void CSBAngle::read ( RCFile f )  {
int Version;
  f.ReadInt  ( &Version   );
  f.ReadInt  ( &atom1     );
  f.ReadInt  ( &atom2     );
  f.ReadInt  ( &atom3     );
  f.ReadReal ( &angle     );
  f.ReadReal ( &angle_esd );
}


MakeStreamFunctions(CSBAngle)



//  ======================  SB Torsion Class  ===================

CSBTorsion::CSBTorsion() : CStream()  {
  SBTorsionInit();
}

CSBTorsion::CSBTorsion ( RPCStream Object ) : CStream(Object)  {
  SBTorsionInit();
}

CSBTorsion::~CSBTorsion() {}

void CSBTorsion::SBTorsionInit()  {
  atom1       = -1;
  atom2       = -1;
  atom3       = -1;
  atom4       = -1;
  torsion     = 0.0;
  torsion_esd = 0.0;
}

void CSBTorsion::Copy ( PCSBTorsion T )  {
  atom1       = T->atom1;
  atom2       = T->atom2;
  atom3       = T->atom3;
  atom4       = T->atom4;
  torsion     = T->torsion;
  torsion_esd = T->torsion_esd;
}

void CSBTorsion::write ( RCFile f )  {
int Version=1;
  f.WriteInt  ( &Version     );
  f.WriteInt  ( &atom1       );
  f.WriteInt  ( &atom2       );
  f.WriteInt  ( &atom3       );
  f.WriteInt  ( &atom4       );
  f.WriteReal ( &torsion     );
  f.WriteReal ( &torsion_esd );
}

void CSBTorsion::read ( RCFile f )  {
int Version;
  f.ReadInt  ( &Version     );
  f.ReadInt  ( &atom1       );
  f.ReadInt  ( &atom2       );
  f.ReadInt  ( &atom3       );
  f.ReadInt  ( &atom4       );
  f.ReadReal ( &torsion     );
  f.ReadReal ( &torsion_esd );
}


MakeStreamFunctions(CSBTorsion)



//  ====================  Structure Class  =========================

CSBStructure::CSBStructure() : CStream()  {
  SBStructureInit();
}

CSBStructure::CSBStructure ( RPCStream Object ) : CStream(Object)  {
  SBStructureInit();
}

CSBStructure::~CSBStructure() {
  FreeMemory();
}

void CSBStructure::Reset()  {
  FreeMemory();
  SBStructureInit();
}

void CSBStructure::FreeMemory()  {
int i;

  if (Formula) delete[] Formula;
  if (Name)    delete[] Name;
  if (Synonym) delete[] Synonym;
  if (Charge)  delete[] Charge;
  Formula = NULL;
  Name    = NULL;
  Synonym = NULL;
  Charge  = NULL;

  FreeVectorMemory ( leavingAtom,0 );
  FreeVectorMemory ( bondedAtom ,0 );
  nLeavingAtoms = 0;

  for (i=0;i<nAAlloc;i++)
    if (Atom[i])  delete Atom[i];
  if (Atom)  delete[] Atom;
  Atom    = NULL;
  nAtoms  = 0;
  nAAlloc = 0;

  for (i=0;i<nBAlloc;i++)
    if (Bond[i])  delete Bond[i];
  if (Bond)  delete[] Bond;
  Bond    = NULL;
  nBonds  = 0;
  nBAlloc = 0;

  for (i=0;i<nGAlloc;i++)
    if (Angle[i])  delete Angle[i];
  if (Angle)  delete[] Angle;
  Angle   = NULL;
  nAngles = 0;
  nGAlloc = 0;

  for (i=0;i<nTAlloc;i++)
    if (Torsion[i])  delete Torsion[i];
  if (Torsion)  delete[] Torsion;
  Torsion   = NULL;
  nTorsions = 0;
  nTAlloc   = 0;

}

void CSBStructure::SBStructureInit()  {

  compoundID[0] = char(0);

  Formula = NULL;
  Name    = NULL;
  Synonym = NULL;
  Charge  = NULL;

  nLeavingAtoms = 0;
  leavingAtom   = NULL;
  bondedAtom    = NULL;

  Atom      = NULL;
  nAtoms    = 0;
  nAAlloc   = 0;

  Bond      = NULL;
  nBonds    = 0;
  nBAlloc   = 0;

  Angle     = NULL;
  nAngles   = 0;
  nGAlloc   = 0;

  Torsion   = NULL;
  nTorsions = 0;
  nTAlloc   = 0;

  xyz_source = 'N';

}

void CSBStructure::PutFormula ( cpstr F )  {
  CreateCopy ( Formula,F );
}

void CSBStructure::PutName ( cpstr N )  {
  CreateCopy ( Name,N );
}

void CSBStructure::PutSynonym ( cpstr S )  {
  CreateCopy ( Synonym,S );
}

void CSBStructure::PutCharge ( cpstr G )  {
  CreateCopy ( Charge,G );
}

void CSBStructure::AddAtom ( PCSBAtom atom )  {
PPCSBAtom Atom1;
int       i;
  if (nAtoms>=nAAlloc)  {
    nAAlloc += 50;
    Atom1 = new PCSBAtom[nAAlloc];
    for (i=0;i<nAtoms;i++)
      Atom1[i] = Atom[i];
    for (i=nAtoms;i<nAAlloc;i++)
      Atom1[i] = NULL;
    if (Atom)  delete[] Atom;
    Atom = Atom1;
  }
  Atom[nAtoms++] = atom;
}

void CSBStructure::AddBond ( PCSBBond bond )  {
//  should be called after all atoms are set up
PPCSBBond Bond1;
int       i;
  if (nBonds>=nBAlloc)  {
    nBAlloc += 50;
    Bond1 = new PCSBBond[nBAlloc];
    for (i=0;i<nBonds;i++)
      Bond1[i] = Bond[i];
    for (i=nBonds;i<nBAlloc;i++)
      Bond1[i] = NULL;
    if (Bond)  delete[] Bond;
    Bond = Bond1;
  }
  Bond[nBonds++] = bond;
}

void CSBStructure::MakeLeavingAtoms()  {
//  should be called after all atoms and bonds are set up
int i,j;

  FreeVectorMemory ( leavingAtom,0 );
  FreeVectorMemory ( bondedAtom ,0 );

  nLeavingAtoms = 0;
  for (i=0;i<nAtoms;i++)
    if (Atom[i]->leaving=='Y')
      nLeavingAtoms++;

  if (nLeavingAtoms>0)  {
    GetVectorMemory ( leavingAtom,nLeavingAtoms,0 );
    GetVectorMemory ( bondedAtom ,nLeavingAtoms,0 );
    j = 0;
    for (i=0;i<nAtoms;i++)
      if (Atom[i]->leaving=='Y')  {
        leavingAtom[j] = i+1;
        bondedAtom [j] = 0;
        j++;
      }
    for (i=0;i<nLeavingAtoms;i++)
      for (j=0;j<nBonds;j++)  {
        if ((leavingAtom[i]==Bond[j]->atom1) &&
            (strcmp(Atom[Bond[j]->atom2-1]->element," H")))
          bondedAtom[i] = Bond[j]->atom2;
        else if ((leavingAtom[i]==Bond[j]->atom2) &&
            (strcmp(Atom[Bond[j]->atom1-1]->element," H")))
          bondedAtom[i] = Bond[j]->atom1;
      }
  }

}

void CSBStructure::AddAngle ( PCSBAngle angle )  {
PPCSBAngle Angle1;
int        i;
  if (nAngles>=nGAlloc)  {
    nGAlloc += 50;
    Angle1 = new PCSBAngle[nGAlloc];
    for (i=0;i<nAngles;i++)
      Angle1[i] = Angle[i];
    for (i=nAngles;i<nGAlloc;i++)
      Angle1[i] = NULL;
    if (Angle)  delete[] Angle;
    Angle = Angle1;
  }
  Angle[nAngles++] = angle;
}

void CSBStructure::AddTorsion ( PCSBTorsion torsion )  {
PPCSBTorsion Torsion1;
int          i;
  if (nTorsions>=nTAlloc)  {
    nTAlloc += 50;
    Torsion1 = new PCSBTorsion[nTAlloc];
    for (i=0;i<nTorsions;i++)
      Torsion1[i] = Torsion[i];
    for (i=nTorsions;i<nTAlloc;i++)
      Torsion1[i] = NULL;
    if (Torsion)  delete[] Torsion;
    Torsion = Torsion1;
  }
  Torsion[nTorsions++] = torsion;
}

void CSBStructure::RemoveEnergyTypes()  {
int i;
  for (i=0;i<nAtoms;i++)
    if (Atom[i])  Atom[i]->energyType[0] = char(0);
}

int  CSBStructure::SetEnergyType ( cpstr sca_name,
                                   cpstr energyType,
                                   realtype partial_charge )  {
int n;
  n = GetAtomNo ( sca_name );
  if (n>0)  {
    strcpy ( Atom[n-1]->energyType,energyType );
    Atom[n-1]->partial_charge = partial_charge;
  }
  return n;
}

int CSBStructure::GetAtomNo ( cpstr sca_name )  {
int n,i;
  n = 0;
  for (i=0;(i<nAtoms) && (!n);i++)
    if (Atom[i])  {
      if (!strcmp(sca_name,Atom[i]->sca_name))
        n = i+1;
    }
  return n;
}

PCSBAtom CSBStructure::GetAtom ( cpstr sca_name )  {
int n;
  n = GetAtomNo ( sca_name );
  if (n>0)  return Atom[n-1];
      else  return NULL;
}


void CSBStructure::GetAtomTable ( PPCAtom & atomTable,
                                  int & nOfAtoms )  {
int i;
  nOfAtoms = nAtoms;
  if (nAtoms>0)  {
    atomTable = new PCAtom[nAtoms];
    for (i=0;i<nAtoms;i++)  {
      atomTable[i] = NULL;
      if (Atom[i])  Atom[i]->makeCAtom ( atomTable[i] );
    }
  } else
    atomTable = NULL;
}

void CSBStructure::GetAtomNameMatch ( PPCAtom A, int nat, pstr altLoc,
                                      ivector anmatch )  {
//  GetAtomNameMatch(..) returns anmatch[i], i=0..nAtoms-1, equal
// to j such that name(Atom[i])==name(A[j]). Note that atom names
// are similarly aligned and space-padded in both MMDb and SBase.
// If ith atom in the structue is not found in A, anmatch[i] is
// set -1.
//   If array A contains atoms in different alternative conformations,
// the the value of altLoc is interpreted as follows:
//    NULL  - the highest occupancy atom will be taken
//            if all occupancies are equal then atom with
//            first altLoc taken
//    other - atoms with given altLoc are taken. If such
//            altLoc is not found, the function does as if
//            NULL value for altLoc is given.
//   A clean PDB file is anticipated, so that atoms with alternative
// conformations are grouped together.
//   It is Ok to have NULL pointers in A.
int     i,j,k;
Boolean done;

  for (i=0;i<nAtoms;i++)  {
    k    = -1;
    j    = 0;
    done = False;
    while ((j<nat) && (!done))  {
      if (A[j])  {
        if ((!A[j]->Ter) && (!strcmp(A[j]->name,Atom[i]->pdb_name)))  {
          k = j;  // atom found
          // check now for altLocs
          j++;
          while ((j<nat) && (!done))  {
            if (A[j])  {
              done = (A[j]->Ter ||
                      (strcmp(A[j]->name,Atom[i]->pdb_name)));
              if (!done)  {
                if (A[j]->occupancy>A[k]->occupancy)  k = j;
                if (altLoc)  {
                  if (!strcmp(A[j]->altLoc,altLoc))  {
                    k    = j;
                    done = True;
                  }
                } 
              }
            }
            j++;
          }
        }
      }
      j++;
    }
    anmatch[i] = k;
  }

}

int CSBStructure::CheckAtoms()  {
//  CheckAtoms() returns -1 if there is no atoms
//                       -2 if not all atoms are annotated
//                       -3 if not all coordinates are set
//                        0 otherwise
int i,rc;
  if (nAtoms<=0)  return -1;
  for (i=0;i<nAtoms;i++)
    if (!Atom[i])  {
      rc = -2;
      break;
    } else if (Atom[i]->x==-MaxReal)
      rc = -3;
  return rc;
}

PCResidue CSBStructure::makeCResidue ( Boolean includeHydrogens,
                                       Boolean makeTer )  {
PCResidue Res;
int       i;
  Res = newCResidue();
  for (i=0;i<nAtoms;i++)
    if (Atom[i])  {
      if ((makeTer || strcmp(&(Atom[i]->pdb_name[2]),"XT")) &&
          (includeHydrogens || strcmp(Atom[i]->element," H")))
          Res->AddAtom ( Atom[i]->makeCAtom() );
    }
  return Res;
}



int  superpose_atoms ( mat44 & T, PPCSBAtom A1, PPCAtom A2, int nAtoms,
                       rmatrix & A, rmatrix & U, rmatrix & V,
                       rvector & W, rvector & RV1 )  {
//   Given two sets of atoms, A1 and A2, superpose_atoms(...)
// calculates the rotational-translational matrix T such that
// |T*A1 - A2| is minimal in least-square terms. The transfomation
// superposes exactly the atoms A1[0] and A2[0].
realtype det,B;
vect3    vc1,vc2;
int      i,j,k,i1,i2;

  //  1.  Calculate the correlation matrix. The rotation will be
  //      done around

  for (i=1;i<=3;i++)
    for (j=1;j<=3;j++)
      A[i][j] = 0.0;

  for (k=1;k<nAtoms;k++)  {
    vc1[0] = A1[k]->x - A1[0]->x;
    vc1[1] = A1[k]->y - A1[0]->y;
    vc1[2] = A1[k]->z - A1[0]->z;
    vc2[0] = A2[k]->x - A2[0]->x;
    vc2[1] = A2[k]->y - A2[0]->y;
    vc2[2] = A2[k]->z - A2[0]->z;
    for (i=1;i<=3;i++)
      for (j=1;j<=3;j++)
        A[i][j] += vc1[j-1]*vc2[i-1];
  }

  //  2. Calculate transformation matrix (to be applied to A1)

  det = A[1][1]*A[2][2]*A[3][3] + 
        A[1][2]*A[2][3]*A[3][1] +
        A[2][1]*A[3][2]*A[1][3] -
        A[1][3]*A[2][2]*A[3][1] -
        A[1][1]*A[2][3]*A[3][2] -
        A[3][3]*A[1][2]*A[2][1];

  //  2.1 SV-decompose the correlation matrix

  SVD ( 3,3,3,A,U,V,W,RV1,True,True,i );

  if (i!=0)  return SPOSEAT_SVD_Fail;

  //  2.2 Check for parasite inversion and fix it if found

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

  //  2.3 Calculate rotational part of T

  for (j=1;j<=3;j++)
    for (k=1;k<=3;k++)  {
      B = 0.0;
      for (i=1;i<=3;i++)
        B += U[j][i]*V[k][i];
      T[j-1][k-1] = B;
    }

  //  2.4 Add translational part to T

  T[0][3] = A2[0]->x - T[0][0]*A1[0]->x - T[0][1]*A1[0]->y -
                       T[0][2]*A1[0]->z;
  T[1][3] = A2[0]->y - T[1][0]*A1[0]->x - T[1][1]*A1[0]->y -
                       T[1][2]*A1[0]->z;
  T[2][3] = A2[0]->z - T[2][0]*A1[0]->x - T[2][1]*A1[0]->y -
                       T[2][2]*A1[0]->z;

  return SPOSEAT_Ok;

}


int CSBStructure::AddHydrogens ( PCResidue R )  {
//
//   Return:
//     SBASE_Ok             success
//     SBASE_EmptyResidue   residue R does not contain atoms
//     SBASE_NoAtomsFound   SBStructure does not contain atoms
//     SBASE_NoBonds        SBStructure does not contain bonds
//     SBASE_NoAtomsData    SBStructure is not complete
//     SBASE_NoSimilarity   too few coomon atom names in R and SBase
//                          entry with the same structure name
//     SBASE_SuperpositionFailed  failed residue superposition
//
// NOTE1: the function does not rearranges existing atoms in the
// residue, but places the hydrogens on top of them (leaving the
// Ter pseudoatom, if found, on top of the list).
//
// NOTE2: in case of alternative locations, the first one in the
// residue is chosen.
//
PPCAtom  H;
PCSBAtom sa1[10];
PCAtom   sa2[10];
rmatrix  D,U,V;
rvector  W,RV1;
imatrix  c;
ivector  A,nb;
mat44    T;
int      i,j,k,m,n,mm,nTer,nH;

  //  1.  Make simple checks

  if (nAtoms<=2)          return SBASE_NoAtomsFound;
  if (nBonds<=0)          return SBASE_NoBonds;
  if (R->nAtoms<=2)       return SBASE_EmptyResidue;
  if (nAtoms==R->nAtoms)  return SBASE_Ok;

  //  2.  Map existing atoms from the residue onto a local array

  GetVectorMemory ( A,nAtoms,0 );
  nTer = 20000;
  for (i=0;i<nAtoms;i++)  {
    A[i] = -1;  // signal "no atom"
    for (j=0;(j<R->nAtoms) && (A[i]<0);j++)
      if (R->atom[j])  {
        if (R->atom[j]->Ter)
          nTer = j;
        else if (!strcmp(Atom[i]->pdb_name,R->atom[j]->name))
          A[i] = j;  // here is the place to check for altlocs
      }
  }

  //  3.  Make bond matrix

  GetMatrixMemory ( c ,nAtoms,10,0,0 );
  GetVectorMemory ( nb,nAtoms,0 );

  for (i=0;i<nAtoms;i++)
    nb[i] = 0;  // number of bonds at ith atom

  for (i=0;i<nBonds;i++)  {
    j = Bond[i]->atom1-1;
    k = Bond[i]->atom2-1;
    c[j][nb[j]] = k;
    c[k][nb[k]] = j;
    nb[j]++;
    nb[k]++;
  }

  //  4.  Loop over all hydrogens. Locate core atoms bonded to
  //      hydrogen in SBStructure and superpose them with the
  //      corresponding atoms in the residue. Using the superposition
  //      matrix, add hydrogens to the residue.

  GetMatrixMemory ( D  ,3,3,1,1 );
  GetMatrixMemory ( U  ,3,3,1,1 );
  GetMatrixMemory ( V  ,3,3,1,1 );
  GetVectorMemory ( W  ,3,1 );
  GetVectorMemory ( RV1,3,1 );

  H  = new PCAtom[nAtoms];
  nH = 0;

  for (i=0;i<nAtoms;i++)
    if ((!strcmp(Atom[i]->element," H")) && (A[i]<0) && (nb[i]>0) &&
        (Atom[i]->x>-MaxReal)) {
      // ith atom is a hydrogen which is not found in the residue.
      // Find 3+ core atoms that are most closely bonded to this one.
      n = c[i][0];  // core atom bonded to the hydrogen
      if (A[n]>=0)  {
        sa1[0] = Atom[n];
        sa2[0] = R->atom[A[n]];
        mm = 1;
        m  = 1;
        while ((m<3) && (mm<2))  {
          k = n;
          for (j=0;(j<nb[k]) && (m<10);j++)  {
            n = c[k][j];
            if (A[n]>=0)  {
              sa1[m] = Atom[n];
              sa2[m] = R->atom[A[n]];
              m++;
            }
          }
          mm++;
        }
        if (m>=3)  {
          // superpose atoms and add the hydrogen to the residue
          k = superpose_atoms ( T,sa1,sa2,m,D,U,V,W,RV1 );
          if (k==SPOSEAT_Ok)  {
            H[nH] = Atom[i]->makeCAtom();
            H[nH]->Transform ( T );
            nH++;
          }
        }
      }
    }

  //  5.  Put hydrogens into the residue

  for (i=0;i<nH;i++)  {
    R->InsertAtom ( H[i],nTer );
    nTer++;
  }

  //  6.  Release memory and return

  if (H)  delete[] H;
  FreeVectorMemory ( A,0 );

  FreeVectorMemory ( RV1,1 );
  FreeVectorMemory ( W  ,1 );
  FreeMatrixMemory ( V  ,3,1,1 );
  FreeMatrixMemory ( U  ,3,1,1 );
  FreeMatrixMemory ( D  ,3,1,1 );

  FreeVectorMemory ( nb,0 );
  FreeMatrixMemory ( c ,nAtoms,0,0 );

  return SBASE_Ok;

}

void CSBStructure::Copy ( PCSBStructure S )  {
int i;

  FreeMemory();

  strcpy     ( compoundID,S->compoundID );
  CreateCopy ( Formula   ,S->Formula    );
  CreateCopy ( Name      ,S->Name       );
  CreateCopy ( Synonym   ,S->Synonym    );
  CreateCopy ( Charge    ,S->Charge     );
  xyz_source = S->xyz_source;

  nLeavingAtoms = S->nLeavingAtoms;
  if (nLeavingAtoms>0)  {
    GetVectorMemory ( leavingAtom,nLeavingAtoms,0 );
    GetVectorMemory ( bondedAtom ,nLeavingAtoms,0 );
    for (i=0;i<nLeavingAtoms;i++)  {
      leavingAtom[i] = S->leavingAtom[i];
      bondedAtom [i] = S->bondedAtom [i];
    }
  }

  nAtoms  = S->nAtoms;
  nAAlloc = nAtoms;
  if (nAtoms>0) {
    Atom = new PCSBAtom[nAtoms];
    for (i=0;i<nAtoms;i++)  {
      Atom[i] = new CSBAtom();
      Atom[i]->Copy ( S->Atom[i] );
    }
  }

  nBonds  = S->nBonds;
  nBAlloc = nBonds;
  if (nBonds>0)  {
    Bond = new PCSBBond[nBonds];
    for (i=0;i<nBonds;i++)  {
      Bond[i] = new CSBBond();
      Bond[i]->Copy ( S->Bond[i] );
    }
  }

  nAngles = S->nAngles;
  nGAlloc = nAngles;
  if (nAngles>0)  {
    Angle = new PCSBAngle[nAngles];
    for (i=0;i<nAngles;i++)  {
      Angle[i] = new CSBAngle();
      Angle[i]->Copy ( S->Angle[i] );
    }
  }

  nTorsions = S->nTorsions;
  nTAlloc   = nTorsions;
  if (nTorsions>0)  {
    Torsion = new PCSBTorsion[nTorsions];
    for (i=0;i<nTorsions;i++)  {
      Torsion[i] = new CSBTorsion();
      Torsion[i]->Copy ( S->Torsion[i] );
    }
  }

}


void CSBStructure::write ( RCFile f )  {
int i,Version=1;

  f.WriteInt    ( &Version );

  f.WriteFile   ( compoundID,sizeof(compoundID) );
  f.CreateWrite ( Formula  );
  f.CreateWrite ( Name     );
  f.CreateWrite ( Synonym  );
  f.CreateWrite ( Charge  );
  f.WriteFile   ( &xyz_source,sizeof(xyz_source) );

  f.WriteInt    ( &nLeavingAtoms );
  for (i=0;i<nLeavingAtoms;i++)  {
    f.WriteInt ( &(leavingAtom[i]) );
    f.WriteInt ( &(bondedAtom [i]) );
  }

  f.WriteInt ( &nAtoms );
  for (i=0;i<nAtoms;i++)
    StreamWrite ( f,Atom[i] );

  f.WriteInt ( &nBonds );
  for (i=0;i<nBonds;i++)
    StreamWrite ( f,Bond[i] );

  f.WriteInt ( &nAngles );
  for (i=0;i<nAngles;i++)
    StreamWrite ( f,Angle[i] );

  f.WriteInt ( &nTorsions );
  for (i=0;i<nTorsions;i++)
    StreamWrite ( f,Torsion[i] );

}

void CSBStructure::read ( RCFile f )  {
int i,Version;

  FreeMemory();

  f.ReadInt    ( &Version );

  f.ReadFile   ( compoundID,sizeof(compoundID) );
  f.CreateRead ( Formula  );
  f.CreateRead ( Name     );
  f.CreateRead ( Synonym  );
  f.CreateRead ( Charge  );
  f.ReadFile   ( &xyz_source,sizeof(xyz_source) );

  f.ReadInt ( &nLeavingAtoms );
  if (nLeavingAtoms>0)  {
    GetVectorMemory ( leavingAtom,nLeavingAtoms,0 );
    GetVectorMemory ( bondedAtom ,nLeavingAtoms,0 );
    for (i=0;i<nLeavingAtoms;i++)  {
      f.ReadInt ( &(leavingAtom[i]) );
      f.ReadInt ( &(bondedAtom [i]) );
    }
  }

  f.ReadInt ( &nAtoms );
  nAAlloc = nAtoms;
  if (nAtoms>0) {
    Atom = new PCSBAtom[nAtoms];
    for (i=0;i<nAtoms;i++)  {
      Atom[i] = NULL;
      StreamRead ( f,Atom[i] );
    }
  }

  f.ReadInt ( &nBonds );
  nBAlloc = nBonds;
  if (nBonds>0)  {
    Bond = new PCSBBond[nBonds];
    for (i=0;i<nBonds;i++)  {
      Bond[i] = NULL;
      StreamRead ( f,Bond[i] );
    }
  }

  f.ReadInt ( &nAngles );
  nGAlloc = nAngles;
  if (nAngles>0)  {
    Angle = new PCSBAngle[nAngles];
    for (i=0;i<nAngles;i++)  {
      Angle[i] = NULL;
      StreamRead ( f,Angle[i] );
    }
  }

  f.ReadInt ( &nTorsions );
  nTAlloc = nTorsions;
  if (nTorsions>0)  {
    Torsion = new PCSBTorsion[nTorsions];
    for (i=0;i<nTorsions;i++)  {
      Torsion[i] = NULL;
      StreamRead ( f,Torsion[i] );
    }
  }

}

MakeStreamFunctions(CSBStructure)



//  ====================  Index Class  ==============================

CSBIndex::CSBIndex() : CStream()  {
  SBIndexInit();
}

CSBIndex::CSBIndex ( RPCStream Object ) : CStream(Object)  {
  SBIndexInit();
}

CSBIndex::~CSBIndex() {
  if (Comp1)  delete[] Comp1;
  if (Comp2)  delete[] Comp2;
}

void CSBIndex::SBIndexInit ()  {
  compoundID[0] = char(0);
  nAtoms        = 0;
  nBonds        = 0;
  fGraphPos     = -1;
  fStructPos    = -1;
  loadPos       = -1;   // -1 <=> not loaded
  nXTs          = 0;    // total number of "XT"-atoms
  Comp1         = NULL;
  Comp2         = NULL;
}

int CSBIndex::MakeCompositions ( PCSBStructure SBS )  {
//    MakeCompositions(..) makes the compositions strings for the
//  given structure.
//    A composition string consists of records E(N), where E stands
//  for chemical element name, and N - for the number of atoms of this
//  element in the structure. The records E(N) follow in alphabetical
//  order of E without spaces and contain no spaces, records with N=0
//  are excluded.
//    Comp2 differs of Comp1 only if there are leaving atoms and
//  represents the composition with leaving atoms taken into account.
//  If there is no leaving atoms, Comp2==Comp1.
//    The function returns the number of leaving atoms in the.
//  structure.
char    Cmp1[1000];
char    Cmp2[1000];
char    N[50];
ivector elem;
int     i,k,x,l,nl;
short   n0,n;

  nAtoms = SBS->nAtoms;
  nBonds = SBS->nBonds;

  strcpy ( Cmp1,"" );
  strcpy ( Cmp2,"" );

  GetVectorMemory ( elem,nAtoms,0 );
  for (i=0;i<nAtoms;i++)
    elem[i] = getElementNo ( SBS->Atom[i]->element );

  n0 = -1;
  n  = 0;
  nl = 0;
  for (i=0;(i<nAtoms) && (n<nElementNames);i++)  {
    n = 10000;
    for (k=0;k<nAtoms;k++)
      if ((elem[k]>n0) && (elem[k]<n))  n = elem[k];
    if (n<nElementNames)   {
      x = 0;
      l = 0;
      for (k=0;k<nAtoms;k++)
        if (elem[k]==n)  {
          x++;
          if (SBS->Atom[k]->leaving=='Y')  l++;
        }
      nl += l;
      sprintf ( N,"%s(%i)",ElementName[n-1],x );
      strcat  ( Cmp1,N );
      sprintf ( N,"%s(%i)",ElementName[n-1],x-l );
      strcat  ( Cmp2,N );
      n0 = n;
    }
  }

  FreeVectorMemory ( elem,0 );

  CreateCopy ( Comp1,Cmp1 );
  CreateCopy ( Comp2,Cmp2 );

  return nl;

}


void CSBIndex::write ( RCFile f )  {
int Version=1;
  f.WriteInt    ( &Version    );
  f.WriteFile   ( compoundID,sizeof(compoundID) );
  f.WriteInt    ( &nAtoms     );
  f.WriteInt    ( &nBonds     );
  f.WriteInt    ( &fGraphPos  );
  f.WriteInt    ( &fStructPos );
  f.WriteInt    ( &nXTs       );
  f.CreateWrite ( Comp1       );
  f.CreateWrite ( Comp2       );
}

void CSBIndex::read ( RCFile f )  {
int Version;
  f.ReadInt    ( &Version    );
  f.ReadFile   ( compoundID,sizeof(compoundID) );
  f.ReadInt    ( &nAtoms     );
  f.ReadInt    ( &nBonds     );
  f.ReadInt    ( &fGraphPos  );
  f.ReadInt    ( &fStructPos );
  f.ReadInt    ( &nXTs       );
  f.CreateRead ( Comp1       );
  f.CreateRead ( Comp2       );
}

MakeStreamFunctions(CSBIndex)



//  =========================  CSBase0  ============================

CSBase0::CSBase0()  {
  InitSBase0();
}


CSBase0::~CSBase0()  {
  FreeMemory0();
}

void CSBase0::InitSBase0()  {
  dirpath     = NULL;
  Index       = NULL;
  nStructures = 0;
  nIAlloc     = 0;
  nLoad       = 0;
  nLAlloc     = 0;
  ldGraph     = NULL;
  ldStructure = NULL;
}

void CSBase0::FreeMemory0()  {
int i;
  if (dirpath)  delete[] dirpath;
  dirpath = NULL;
  if (Index)  {
    for (i=0;i<nStructures;i++)
      delete Index[i];
    delete[] Index;
  }
  Index       = NULL;
  nStructures = 0;
  nIAlloc     = 0;
  for (i=0;i<nLAlloc;i++)  {
    if (ldGraph[i])      delete ldGraph[i];
    if (ldStructure[i])  delete ldStructure[i];
  }
  if (ldGraph)     delete[] ldGraph;
  if (ldStructure) delete[] ldStructure;
  nLoad       = 0;
  nLAlloc     = 0;
  ldGraph     = NULL;
  ldStructure = NULL;
}

pstr CSBase0::GetPath ( pstr & S, cpstr FName )  {
  if (dirpath)  {
    if (S)  delete[] S;
    S = new char[strlen(dirpath)+strlen(FName)+10];
    strcpy ( S,dirpath );
    strcat ( S,FName   );
  } else
    CreateCopy ( S,FName );
  return S;
}

int CSBase0::LoadIndex1 ( cpstr EnvVar )  {
  return LoadIndex ( getenv(EnvVar) );
}

int CSBase0::LoadIndex ( cpstr path )  {
CFile      f;
pstr       S;
int        i;
PPCSBIndex Index1;

  FreeMemory0();

  if (path)  {
    i = strlen(path);
    dirpath = new char[i+10];
    strcpy ( dirpath,path );
    if (i>0)  {
      if (dirpath[i-1]!='/')  strcat ( dirpath,"/" );
    }
  }

  S = NULL;
  f.assign ( GetPath(S,sbIndexFile),False,True );
  if (S)  delete[] S;

  if (f.reset(True))  {
    while ((!f.FileEnd()) && f.Success())  {
      if (nStructures>=nIAlloc)  {
        nIAlloc += 5000;
        Index1   = new PCSBIndex[nIAlloc];
        for (i=0;i<nStructures;i++)
          Index1[i] = Index[i];
        for (i=nStructures;i<nIAlloc;i++)
          Index1[i] = NULL;
        if (Index)  delete[] Index;
        Index = Index1;
      }
      Index[nStructures] = new CSBIndex();
      StreamRead ( f,Index[nStructures] );
      if (!f.Success())  {
        delete Index[nStructures];
        Index[nStructures] = NULL;
      } else
        nStructures++;
    }
    f.shut();
    return SBASE_Ok;
  } else
    return SBASE_FileNotFound;

}


int CSBase0::LoadStructure ( cpstr compoundID )  {
//   LoadStructure(..) reads structure from *.sbase files and
// stores it in RAM for faster access. There are no special
// functions to access loaded structures, all requests to
// *.sbase files and RAM-storage are dispatched automatically.
PCFile         structFile,graphFile;
PCGraph        G;
PCSBStructure  SBS;
PPCGraph       ldG;
PPCSBStructure ldS;
int            structNo,i,k,RC;

  SBS      = NULL;
  G        = NULL;
  RC       = SBASE_Ok;
  structNo = GetStructNo ( compoundID );

  if (structNo!=SBASE_StructNotFound)  {
    if (Index[structNo]->loadPos>=0)
      RC = SBASE_AlreadyLoaded;
    else  {
      structFile = GetStructFile();
      if (structFile)  {
        structFile->seek ( Index[structNo]->fStructPos );
        StreamRead       ( *structFile,SBS );
        structFile->shut ();
        delete structFile;
        if (!SBS)  RC = SBASE_ReadError;
      } else
        RC = SBASE_FileNotFound;
    }
    if (RC==SBASE_Ok) {
      graphFile = GetGraphFile();
      if (graphFile)  {
        graphFile->seek ( Index[structNo]->fGraphPos );
        StreamRead      ( *graphFile,G );
        graphFile->shut ();
        if (!G)  RC = SBASE_ReadError;
        delete graphFile;
      } else
        RC = SBASE_FileNotFound;
    }
  } else 
    RC = SBASE_StructNotFound;

  if (RC==SBASE_Ok)  {
    k = -1;
    for (i=0;(i<nLAlloc) && (k<0);i++)
      if (!ldStructure[i])  k = i;
    if (k<0)  {
      nLAlloc += 100;
      ldS = new PCSBStructure[nLAlloc];
      ldG = new PCGraph      [nLAlloc];
      for (i=0;i<nLoad;i++)  {
        ldS[i] = ldStructure[i];
        ldG[i] = ldGraph    [i];
      }
      for (i=nLoad;i<nLAlloc;i++)  {
        ldS[i] = NULL;
        ldG[i] = NULL;
      }
      if (ldStructure)  delete[] ldStructure;
      if (ldGraph)      delete[] ldGraph;
      ldStructure = ldS;
      ldGraph     = ldG;
      k           = nLoad;
    }
    ldStructure[k] = SBS;
    ldGraph    [k] = G;
    Index[structNo]->loadPos = k;
  } else  {
    if (SBS) delete SBS;
    if (G)   delete G;
  }

  return RC;

}

int  CSBase0::UnloadStructure ( cpstr compoundID )  {
//   UnloadStructure(..) deletes strtucture from RAM and releases
// its memory. The structure is then accessible through a normal
// way from *.sbase files, which is slower.
int  structNo,ldPos;
  structNo = GetStructNo ( compoundID );
  if (structNo==SBASE_StructNotFound)
    return structNo;
  else   {
    ldPos = Index[structNo]->loadPos;
    if (ldPos<0) return SBASE_AlreadyUnloaded;
    if (ldStructure[ldPos])  {
      delete ldStructure[ldPos];
      ldStructure[ldPos] = NULL;
    }
    if (ldGraph[ldPos])  {
      delete ldGraph[ldPos];
      ldGraph[ldPos] = NULL;
    }
    Index[structNo]->loadPos = -1;
  }
  return SBASE_Ok;
}


int MakeChirInd ( char chirality )  {
  if (chirality=='S')  return -1;
  if (chirality=='R')  return +1;
  return 0;
}

int MakeElementType ( int ElType, int Chirality, Boolean Cflag )  {
  if (Cflag)  {
    if (Chirality<0)  return ElType | CHIRAL_LEFT;
    if (Chirality>0)  return ElType | CHIRAL_RIGHT;
  }
  return ElType;
}

int MakeElementType ( int ElType, char chirality, Boolean Cflag )  {
  if (Cflag)  {
    if (chirality=='S')  return ElType | CHIRAL_LEFT;
    if (chirality=='R')  return ElType | CHIRAL_RIGHT;
  }
  return ElType;
}


int CSBase0::GetStructNo ( cpstr compoundID )  {
int  l1,l2,l,k;
char id[20];
  strcpy_css ( id,compoundID );
  l1 = 0;
  l2 = nStructures-1;
  while (l1<l2-1)  {
    l = (l1+l2)/2;
    k = strcasecmp ( Index[l]->compoundID,id );
    if (k<0)       l1 = l;
    else if (k>0)  l2 = l;
    else {
      l1 = l;
      l2 = l;
    }
  }
  if (k==0)  return l;
  else if (l==l1)  {
    if (!strcasecmp(Index[l2]->compoundID,id))  return l2;
  } else if (l==l2)  {
    if (!strcasecmp(Index[l1]->compoundID,id))  return l1;
  }
  return SBASE_StructNotFound;
}

PCFile CSBase0::GetStructFile()  {
PCFile structFile;
pstr   S;
  structFile = new CFile();
  S = NULL;
  structFile->assign ( GetPath(S,sbStructFile),False,True );
  if (S)  delete[] S;
  if (!structFile->reset(True))  {
    delete structFile;
    structFile = NULL;
  }
  return structFile;
}

PCFile CSBase0::GetGraphFile()  {
PCFile graphFile;
pstr   S;
  graphFile = new CFile();
  S = NULL;
  graphFile->assign ( GetPath(S,sbGraphFile),False,True );
  if (S)  delete[] S;
  if (!graphFile->reset(True))  {
    delete graphFile;
    graphFile = NULL;
  }
  return graphFile;
}


PCSBStructure CSBase0::GetStructure ( cpstr compoundID )  {
//   GetStructure returns pointer to the monomer structure
// identified by 3-letter compoundID. If such structure is not
// found, the function returns NULL.
//   The function returns a pointer to a private copy of the
// structure. Modifying it will not change data in the structural
// database. The application is responsible for deallocating
// the structure after use (simply use delete).
//   See description of CSBStructure for the explanation of
// its fields.
PCFile        structFile;
PCSBStructure SBS;
int           structNo;
  SBS      = NULL;
  structNo = GetStructNo ( compoundID );
  if (structNo!=SBASE_StructNotFound)  {
    if (Index[structNo]->loadPos>=0)  {
      SBS = new CSBStructure();
      SBS->Copy ( ldStructure[Index[structNo]->loadPos] );
    } else  {
      structFile = GetStructFile();
      if (structFile)  {
        structFile->seek ( Index[structNo]->fStructPos );
        StreamRead       ( *structFile,SBS );
        structFile->shut ();
        delete structFile;
      }
    }
  }
  return SBS;
}

PCSBStructure CSBase0::GetStructure ( int structNo,
                                      PCFile structFile )  {
PCFile        sFile;
PCSBStructure SBS;
  SBS = NULL;
  if ((0<=structNo) && (structNo<nStructures))  {
    if (Index[structNo]->loadPos>=0)  {
      SBS = new CSBStructure();
      SBS->Copy ( ldStructure[Index[structNo]->loadPos] );
    } else  {
      if (!structFile)  sFile = GetStructFile();
                  else  sFile = structFile;
      if (sFile)  {
        sFile->seek ( Index[structNo]->fStructPos );
        StreamRead  ( *sFile,SBS );
        if (!structFile)  delete sFile;
      }
    }
  }
  return SBS;
}

PCSBStructure CSBase0::GetStructure ( cpstr compoundID,
                                      PCFile structFile )  {
//   Another form of GetStructure(..) uses an open structure
// file, which allows to save on opening/closing file if
// multiple access to SBase structures is required.
PCFile        sFile;
PCSBStructure SBS;
int           structNo;
  SBS      = NULL;
  structNo = GetStructNo ( compoundID );
  if (structNo!=SBASE_StructNotFound)  {
    if (Index[structNo]->loadPos>=0)  {
      SBS = new CSBStructure();
      SBS->Copy ( ldStructure[Index[structNo]->loadPos] );
    } else  {
      if (!structFile)  sFile = GetStructFile();
                  else  sFile = structFile;
      if (sFile)  {
        sFile->seek ( Index[structNo]->fStructPos );
        StreamRead  ( *sFile,SBS );
        if (!structFile)  delete sFile;
      }
    }
  }
  return SBS;
}


PCResidue CSBase0::makeCResidue ( cpstr compoundID, 
                                  PCFile     structFile,
                                  Boolean    includeHydrogens,
                                  Boolean    makeTer )  {
PCSBStructure SBS;
PCResidue     Res;
  SBS = GetStructure ( compoundID,structFile );
  if (SBS)  {
    Res = SBS->makeCResidue ( includeHydrogens,makeTer );
    delete SBS;
    return Res;
  } else
    return NULL;
}

PCResidue CSBase0::makeCResidue ( int     structNo, 
                                  PCFile  structFile,
                                  Boolean includeHydrogens,
                                  Boolean makeTer )  {
PCSBStructure SBS;
PCResidue     Res;
  SBS = GetStructure ( structNo,structFile );
  if (SBS)  {
    Res = SBS->makeCResidue ( includeHydrogens,makeTer );
    delete SBS;
    return Res;
  } else
    return NULL;
}


int  CSBase0::GetNofAtoms ( int  structNo )  {
  if ((0<=structNo) && (structNo<nStructures))
        return Index[structNo]->nAtoms;
  else  return SBASE_StructNotFound;
}

int  CSBase0::GetNofAtoms ( cpstr compoundID )  {
int  structNo;
  structNo = GetStructNo ( compoundID );
  if (structNo!=SBASE_StructNotFound)
        return GetNofAtoms(structNo);
  else  return SBASE_StructNotFound;
}

int  CSBase0::GetGraph ( PCFile graphFile, int structNo, RPCGraph G,
                         int Hflag )  {
//   GetGraph(..) retrieves data for chemical structure number structNo
// (as described in Index) from graph file graphFile, then allocates
// and builds the corresponding graph, which is returned in G.
//   If Hflag is set to 1, all hydrogens are removed from the graph.
//   If Hflag is set to 2, element types of atoms, to which hydrogens
// are bonded, are modified with flag HYDROGEN_BOND and moved to
// the end.
//   Returns 0 in case of success.
int rc,htype;

  if ((structNo<0) || (structNo>=nStructures))
    return SBASE_WrongIndex;

  rc = SBASE_Ok;

  if (Index[structNo]->loadPos>=0)  {

    if (!G)  G = new CGraph();
    G->Copy ( ldGraph[Index[structNo]->loadPos] );

  } else  {

    graphFile->seek ( Index[structNo]->fGraphPos );
    graphFile->SetSuccess();
    StreamRead ( *graphFile,G );

    if (!graphFile->Success())  {
      rc = SBASE_ReadError;
      if (G)  delete G;
      G = NULL;
    }

  }

  if (G)  {
    G->MakeVertexIDs();
    if (Hflag>=1)  {
      htype = getElementNo(pstr("H"));
      if (Hflag==2)  G->HideType    ( htype );
               else  G->ExcludeType ( htype );
    }
    G->Build ( False );
  }

  return rc;

}

int  CSBase0::GetGraph ( PCFile graphFile, RPCGraph G, int Hflag )  {
//   GetGraph(..) retrieves data for chemical structure, which is
// next in the graph file, then allocates and builds the corresponding
// graph, which is returned in G.
//   If Hflag is set to 1, all hydrogens are removed from the graph.
//   If Hflag is set to 2, element types of atoms, to which hydrogens
// are bonded, are modified with flag HYDROGEN_BOND and moved to
// the end.
//   Returns 0 in case of success.
int rc,htype;

  rc = 0;

  graphFile->SetSuccess();
  StreamRead ( *graphFile,G );

  if (!graphFile->Success())  {
    rc = SBASE_ReadError;
    if (G)  delete G;
    G = NULL;
  }

  if (G)  {
    G->MakeVertexIDs();
    if (Hflag>=1)  {
      htype = getElementNo(pstr("H"));
      if (Hflag==2)  G->HideType    ( htype );
               else  G->ExcludeType ( htype );
    }
    G->Build ( False );
  }

  return rc;

}

int  CSBase0::GetGraph ( int structNo, RPCGraph G, int Hflag )  {
PCFile graphFile;
int    htype;

  if ((0<=structNo) && (structNo<nStructures))  {
    if (Index[structNo]->loadPos>=0)  {
      if (!G) G = new CGraph();
      G->Copy ( ldGraph[Index[structNo]->loadPos] );
    } else  {
      graphFile = GetGraphFile();
      if (graphFile)  {
        graphFile->seek ( Index[structNo]->fGraphPos );
        StreamRead  ( *graphFile,G );
        graphFile->shut ();
        delete graphFile;
      } else  {
        if (G)  delete G;
        G = NULL;
        return SBASE_FileNotFound;
      }
    }
  } else  {
    if (G)  delete G;
    G = NULL;
    return SBASE_WrongIndex;
  }

  if (G)  {
    G->MakeVertexIDs();
    if (Hflag>=1)  {
      htype = getElementNo(pstr("H"));
      if (Hflag==2)  G->HideType    ( htype );
               else  G->ExcludeType ( htype );
    }
    G->Build ( False );
  }

  return SBASE_Ok;

  /*
  graphFile = GetGraphFile();
  if (graphFile)  {
    rc = GetGraph ( graphFile,G,Hflag );
    graphFile->shut();
    delete graphFile;
    return rc;
  } else  {
    if (G)  delete G;
    G = NULL;
    return SBASE_FileNotFound;
  }
  */

}

int  CSBase0::GetGraph ( cpstr compoundID, RPCGraph G,
                         int Hflag )  {
PCFile graphFile;
int    structNo,htype;

  structNo = GetStructNo ( compoundID );

  if (structNo!=SBASE_StructNotFound)  {
    if (Index[structNo]->loadPos>=0)  {
      if (!G )  G = new CGraph();
      G->Copy ( ldGraph[Index[structNo]->loadPos] );
    } else  {
      graphFile = GetGraphFile();
      if (graphFile)  {
        graphFile->seek ( Index[structNo]->fGraphPos );
        StreamRead      ( *graphFile,G );
        graphFile->shut ();
        delete graphFile;
      } else  {
        if (G)  delete G;
        G = NULL;
        return SBASE_FileNotFound;
      }
    }
  }

  if (G)  {
    G->MakeVertexIDs();
    if (Hflag>=1)  {
      htype = getElementNo(pstr("H"));
      if (Hflag==2)  G->HideType    ( htype );
               else  G->ExcludeType ( htype );
    }
    G->Build ( False );
  }

  return  structNo;

  /*
  if (structNo!=SBASE_StructNotFound)  {
    return  GetGraph ( structNo,G,Hflag );
  } else  {
    if (G)  delete G;
    G = NULL;
    return  structNo;
  }
  */

}

int  CSBase0::CheckGraph ( PCGraph G, int Hflag,
                           Boolean Cflag,
                           int & nInStructure,
                           int & nMatched,
                           ivector match,
                           int minMatchSize )  {
//   CheckGraph(..) checks graph G against the same-name
// structure in the database. The name must be passed in
// G->name as a standard 3-letter code.
//   If Hflag is set >= 1, all hydrogens are removed from the graph.
// If Hflag is set to 2, element types of atoms, to which hydrogens
// are bonded, are modified with flag HYDROGEN_BOND.
//   If Cflag is set to True, then chirality information is
// assumed in the input graph G and it is used for the
// checking. If Cflag is set to False, then chirality
// information is neither assumed nor used for the checking.
//   If a same-name structure is found in the database,
// the function returns the number of matched vertices
// (nMatched) from those found in the database (nInStructure).
// The correspondence between the input and database graphs
// is returned in array match (it should be of sufficient
// length) such that ith vertex of input graph corresponds
// to the match[i]th vertex of the database graph. The
// function then returns SBASE_Ok if the number of matched
// vertices coincides with nInStructure and nMatched, and
// the return is SBASE_CheckFail otherwise.
//   If a same-name structure is not found, the function
// returns SBASE_StructNotFound or SBASE_FileNotFound.
PCFile       graphFile;
PCGraphMatch U;
PCGraph      G1;
PAtomName    atName;
ivector      F1,F2;
realtype     p1,p2;
int          structNo,rc,j,k, nAtoms,nH, minMatch;

  nMatched     = 0;
  nInStructure = 0;

  structNo = GetStructNo ( G->GetName() );
  if (structNo==SBASE_StructNotFound)
    return  SBASE_StructNotFound;

  if (Index[structNo]->loadPos<0)  {
    graphFile = GetGraphFile();
    if (!graphFile)  return SBASE_FileNotFound;
  } else
    graphFile = NULL;

  G1 = NULL;
  rc = GetGraph ( graphFile,structNo,G1,Hflag );
  if ((!G1) || (rc!=SBASE_Ok))  return rc;

  if (graphFile)  {
    graphFile->shut();
    delete graphFile;
  }

  if (!Cflag)  G1->RemoveChirality();

  nInStructure = G1->GetNofVertices();

  if (minMatchSize>0)
       minMatch = minMatchSize;
  else minMatch = nInStructure - Index[structNo]->nXTs;

  U = new CGraphMatch();
  U->MatchGraphs ( G,G1,minMatch );
  k = U->GetNofMatches();
  if (k>0)  {
    U->GetMatch ( 0,F1,F2,nMatched,p1,p2 );
    for (j=1;j<=nMatched;j++)
      match[F1[j]-1] = F2[j]-1;
  }

  if ((nInStructure==G->GetNofVertices()) &&
      (nInStructure==nMatched))  {
    rc = SBASE_Ok;
  } else if (nMatched>0)  {
    // check if atoms that were not matched are the
    // teminating ones ("-XT")
    atName = new AtomName[nInStructure*2+1];
    if (Hflag>=1)  nH = -1;  // remove hydrogens
             else  nH =  0;
    k = 1;
    if (GetAtNames(structNo,atName,nAtoms,nH)==SBASE_Ok)  {
      for (j=1;j<=nMatched;j++)
        atName[F2[j]-1][0] = char(0);
      k = 0;
      for (j=0;(j<nInStructure) && (!k);j++)
        if (atName[j][0] && (strcmp(&(atName[j][2]),"XT")))  k = 1;
    }
    if (!k)  rc = SBASE_Ok;
       else  rc = SBASE_CheckFail;
    delete[] atName;
  } else
    rc = SBASE_CheckFail;

  delete U;
  delete G1;

  return rc;

}

int CSBase0::CheckResidue ( PCResidue R,
                            int Hflag, Boolean Cflag,
                            int & nInResidue, int & nInStructure,
                            int & nMatched,   ivector match,
                            cpstr altLoc, int minMatchSize )  {
PCGraph G;
int     rc,htype;

  G = new CGraph ( R,altLoc );

  if (Hflag>=1) {
    htype = getElementNo(pstr("H"));
    if (Hflag==2)  G->HideType    ( htype );
             else  G->ExcludeType ( htype );
  }

  G->Build ( False );

  nInResidue = G->GetNofVertices();
  if (nInResidue<=0)  {
    rc = SBASE_NoAtomsFound;
    nInStructure = 0;
    nMatched     = 0;
  } else
    rc = CheckGraph ( G,Hflag,Cflag,nInStructure,nMatched,match,
                      minMatchSize );
  delete G;

  return rc;

}


void SDASelHandles::getNewHandles ( PCMMDBManager MMDB )  {
  selHndDonor    = MMDB->NewSelection();
  selHndAcceptor = MMDB->NewSelection();
  selHndHydrogen = MMDB->NewSelection();
  selKey = SKEY_OR;
}

void SDASelHandles::makeSelIndexes ( PCMMDBManager MMDB )  {
  MMDB->MakeSelIndex ( selHndDonor    );
  MMDB->MakeSelIndex ( selHndAcceptor );
  MMDB->MakeSelIndex ( selHndHydrogen );
}

void SDASelHandles::deleteSelections ( PCMMDBManager MMDB )  {
  MMDB->DeleteSelection ( selHndDonor    );
  MMDB->DeleteSelection ( selHndAcceptor );
  MMDB->DeleteSelection ( selHndHydrogen );
}


int CSBase0::MakeBonds ( PCResidue R, pstr altLoc,
                         PCFile         structFile,
                         PSDASelHandles selHandles,
                         Boolean     ignoreNegSigOcc )  {
//   MakeBonds(..) makes bonds between atoms in MMDB's residue R
// from data found in SBase. Residue R must be associated with
// coordinate hierarchy. Data is retrieved from SBase on the basis
// of residue name only. In case of multiple conformations, if
// altLoc:
//    NULL  - the highest occupancy atom will be taken
//            if all occupancies are equal then atom with
//            first altLoc taken
//    other - atoms with given altLoc are taken. If such
//            altLoc is not found, the function does as if
//            NULL value for altLoc is given.
//   If selHandles is not NULL, the function also selects atoms
// in the residue according to their hydrogen bond attributes.
// This is a special option for hydrogen bond calculations.
//   If ignoreNegSigOcc is set True then the function will ignore
// atoms with negative occupancy standard deviation. Such atoms
// may be hydrogens added by CSBase0::AddHydrogens(..) function,
// in general any atoms added by CSBAtom::MakeCAtom(..) function.
// Added hydrogens may be ignored if MakeBonds is used in
// CSbase::CalcHBonds(..) function.
//   Return:
//     SBASE_Ok             success
//     SBASE_FileNotFound   non-initiated SBase
//     SBASE_StructNotFound the residue's name is not found in SBase
//     SBASE_EmptyResidue   residue R does not contain atoms
//     SBASE_NoAtomsFound   SBase entry does not contain atoms
//     SBASE_BrokenBonds    some bonds could not be set up because
//                          of missing atoms in R. This could be
//                          a result of residue R named wrongly.
PCSBStructure SBS;
PCMMDBManager MMDB;
PPCAtom       A;
ivector       anmatch;
int           natoms,i,i1,i2,rc;

  R->GetAtomTable ( A,natoms );
  if (!A)  return SBASE_EmptyResidue;

  for (i=0;i<natoms;i++)
    if (A[i])  A[i]->FreeBonds();

  SBS = GetStructure ( R->GetResName(),structFile );
  if (!SBS)  return SBASE_StructNotFound;

  if (SBS->nAtoms<=0)  {
    delete SBS;
    return SBASE_NoAtomsFound;
  }

  GetVectorMemory ( anmatch,SBS->nAtoms,0 );
  SBS->GetAtomNameMatch ( A,natoms,altLoc,anmatch );
  if (ignoreNegSigOcc)
    for (i=0;i<SBS->nAtoms;i++)  {
      i1 = anmatch[i];
      if (i1>=0)  {
        if (A[i1]->sigOcc<0.0)  anmatch[i] = -1;
      }
    }

  if (selHandles)  {
    MMDB = PCMMDBManager(R->GetCoordHierarchy());
    if (MMDB)  {
      i2 = selHandles->selKey;
      for (i=0;i<SBS->nAtoms;i++)  {
        i1 = anmatch[i];
        if (i1>=0)
          switch (SBS->Atom[i]->hb_type)  {
            case 'D' :  MMDB->SelectAtom ( selHandles->selHndDonor,
                                           A[i1],i2,False );
                      break;
            case 'A' :  MMDB->SelectAtom ( selHandles->selHndAcceptor,
                                           A[i1],i2,False );
                      break;
            case 'B' :  MMDB->SelectAtom ( selHandles->selHndDonor,
                                           A[i1],i2,False );
                        MMDB->SelectAtom ( selHandles->selHndAcceptor,
                                           A[i1],i2,False );
                      break;
            case 'H' :  MMDB->SelectAtom ( selHandles->selHndHydrogen,
                                           A[i1],i2,False );
                      break;
            default  :
            case 'N' : ;
          }
      }
    }
  }

  rc = SBASE_Ok;
  for (i=0;i<SBS->nBonds;i++)  {
    i1 = anmatch[SBS->Bond[i]->atom1-1];
    i2 = anmatch[SBS->Bond[i]->atom2-1];
    if ((i1>=0) && (i2>=0))  {
      A[i1]->AddBond ( A[i2],SBS->Bond[i]->order,2 );
      A[i2]->AddBond ( A[i1],SBS->Bond[i]->order,2 );
    } else
      rc = SBASE_BrokenBonds;
  }

  FreeVectorMemory ( anmatch,0 );
  delete SBS;

  return rc;

}


int CSBase0::GetEnergyTypes ( PCResidue R, PCFile structFile )  {
PCSBStructure SBS;
PPCAtom       A;
int           i,j,rc,natoms;

  R->GetAtomTable ( A,natoms );
  if (!A)  return SBASE_EmptyResidue;

  for (i=0;i<natoms;i++)
    if (A[i])  A[i]->energyType[0] = char(0);

  SBS = GetStructure ( R->GetResName(),structFile );
  if (SBS)  {
    if (SBS->nAtoms>0)  {
      for (i=0;i<natoms;i++)
        if (A[i])  {
          for (j=0;j<SBS->nAtoms;j++)
            if (SBS->Atom[j]) {
              if (!strcmp(A[i]->name,SBS->Atom[j]->pdb_name))  {
                strcpy ( A[i]->energyType,SBS->Atom[j]->energyType );
                A[i]->charge = SBS->Atom[j]->ccp4_charge;
              }
            }
        }
      rc = SBASE_Ok;
    } else
      rc =  SBASE_NoAtomsFound;
    delete SBS;
  } else  
    rc = SBASE_StructNotFound;

  return rc;

}


int CSBase0::GetEnergyTypes ( PPCResidue R, int nRes,
                              PCFile structFile )  {
PCFile        sFile;
PCSBStructure SBS;
PPCAtom       A;
bvector       B;
int           i,j,k,n,natoms;

  GetVectorMemory ( B,nRes,0 );
  for (i=0;i<nRes;i++)
    B[i] = (!R[i]);

  if (structFile)  sFile = structFile;
             else  sFile = GetStructFile();
  if (!sFile)  return SBASE_FileNotFound;

  i = 0;
  while (i<nRes)  {
    while (i<nRes)
      if (B[i])  i++;
           else  break;
    if (i<nRes)  {
      SBS = GetStructure ( R[i]->GetResName(),sFile );
      j   = i;
      while (j<nRes)  {
        B[j] = True;
        R[j]->GetAtomTable ( A,natoms );
        if (A)  {
          for (k=0;k<natoms;k++)
            if (A[k])  A[k]->energyType[0] = char(0);
          if (SBS)  {
            if (SBS->nAtoms>0)  {
              for (k=0;k<natoms;k++)
                if (A[k])  {
                  for (n=0;n<SBS->nAtoms;n++)
                    if (SBS->Atom[n]) {
                      if (!strcmp(A[k]->name,SBS->Atom[n]->pdb_name)) {
                        strcpy ( A[k]->energyType,
                                 SBS->Atom[n]->energyType );
                        A[k]->charge = SBS->Atom[n]->ccp4_charge;
                      }
                    }
                }
            }
          } 
        }
        j++;
        while (j<nRes)
          if (!B[j])  {
            if (!strcmp(R[i]->name,R[j]->name))  break;
                                           else  j++;
          } else
            j++;
      }
      if (SBS)  {
        delete SBS;
        SBS = NULL;
      }
      i++;
    }
  }

  if (!structFile)  delete sFile;
  FreeVectorMemory ( B,0 );

  return SBASE_Ok;

}


int CSBase0::GetEnergyTypes ( PCChain chain, PCFile structFile )  {
PPCResidue Res;
int        nRes;
  chain->GetResidueTable ( Res,nRes );
  if (nRes>0)
        return GetEnergyTypes ( Res,nRes,structFile );
  else  return SBASE_EmptyResSet;
}

int CSBase0::GetEnergyTypes ( PCModel model, PCFile structFile )  {
PPCResidue    Res;
PPCChain      chain;
PCMMDBManager MMDB;
int           rc,selHnd,i,nRes,nChains;
 
  rc   = SBASE_Ok;
  MMDB = PCMMDBManager(model->GetCoordHierarchy());

  if (MMDB)  {

    selHnd = MMDB->NewSelection();
    MMDB->Select ( selHnd,STYPE_RESIDUE,model->GetSerNum(),
                   "*",ANY_RES,"*",ANY_RES,"*",
                   "*","*","*","*",SKEY_NEW );
    MMDB->GetSelIndex ( selHnd,Res,nRes );
    if (nRes>0)  rc = GetEnergyTypes ( Res,nRes,structFile );
           else  rc = SBASE_EmptyResSet;
    MMDB->DeleteSelection ( selHnd );

  } else  {

    model->GetChainTable ( chain,nChains );
    for (i=0;i<nChains;i++)
      if (chain[i])  {
        chain[i]->GetResidueTable ( Res,nRes );
        if (nRes>0) GetEnergyTypes ( Res,nRes,structFile );
      }

  }

  return rc;

}

int CSBase0::GetEnergyTypes ( PCMMDBManager MMDB, PCFile structFile ) {
PPCResidue Res;
int        rc,selHnd,nRes;

  rc = SBASE_Ok;

  selHnd = MMDB->NewSelection();
  MMDB->Select ( selHnd,STYPE_RESIDUE,0,
                 "*",ANY_RES,"*",ANY_RES,"*",
                 "*","*","*","*",SKEY_NEW );
  MMDB->GetSelIndex ( selHnd,Res,nRes );
  if (nRes>0)  rc = GetEnergyTypes ( Res,nRes,structFile );
         else  rc = SBASE_EmptyResSet;

  MMDB->DeleteSelection ( selHnd );

  return rc;

}

int CSBase0::AddHydrogens ( PCResidue R, PCFile structFile )  {
//   Return:
//     SBASE_Ok             success
//     SBASE_EmptyResidue   residue R does not contain atoms
//     SBASE_NoAtomsFound   SBStructure does not contain atoms
//     SBASE_NoBonds        SBStructure does not contain bonds
//     SBASE_NoAtomsData    SBStructure is not complete
//     SBASE_NoSimilarity   too few coomon atom names in R and SBase
//                          entry with the same structure name
//     SBASE_SuperpositionFailed  failed residue superposition
// NOTE: the function does not rearranges existing atoms in the
// residue, but places the hydrogens on top of them (leaving the
// Ter pseudoatom, if found, on top of the list)
PCFile        sFile;
PCSBStructure SBS;
int           rc;

  if (structFile)  sFile = structFile;
             else  sFile = GetStructFile();

  if (!sFile)  return SBASE_FileNotFound;

  SBS = GetStructure ( R->GetResName(),sFile );
  if (!structFile)  delete sFile;

  if (!SBS)  return SBASE_StructNotFound;

  rc = SBS->AddHydrogens ( R );

  delete SBS;

  return rc;

}

int CSBase0::AddHydrogens ( PCChain chain, PCFile structFile )  {
PCFile     sFile;
PPCResidue Res;
int        i,k,nRes,rc;
Boolean    B;

  if (structFile)  sFile = structFile;
             else  sFile = GetStructFile();

  if (!sFile)  return SBASE_FileNotFound;

  rc = SBASE_Ok;
  B  = False;
  chain->GetResidueTable ( Res,nRes );
  for (i=0;i<nRes;i++)
    if (Res[i])  {
      k = AddHydrogens ( Res[i],sFile );
      if (k==SBASE_Ok)  B = True;
                  else  rc = SBASE_Incomplete;
    }
  if (!B)  rc = SBASE_Fail;

  if (!structFile)  delete sFile;

  return rc;

}


int CSBase0::AddHydrogens ( PCModel model, PCFile structFile )  {
PCFile     sFile;
PPCChain   chain;
PPCResidue Res;
int        i,j,k,nChains,nRes,rc;
Boolean    B;

  if (structFile)  sFile = structFile;
             else  sFile = GetStructFile();

  if (!sFile)  return SBASE_FileNotFound;

  rc = SBASE_Ok;
  B  = False;
  model->GetChainTable ( chain,nChains );
  for (i=0;i<nChains;i++)
    if (chain[i])  {
      chain[i]->GetResidueTable ( Res,nRes );
      for (j=0;j<nRes;j++)
        if (Res[j])  {
          k = AddHydrogens ( Res[j],sFile );
          if (k==SBASE_Ok)  B = True;
                      else  rc = SBASE_Incomplete;
        }
    }
  if (!B)  rc = SBASE_Fail;

  if (!structFile)  delete sFile;

  return rc;

}

int CSBase0::AddHydrogens ( PCMMDBManager MMDB, PCFile structFile )  {
PCFile     sFile;
PPCModel   model;
PPCChain   chain;
PPCResidue Res;
int        i,j,n,k,nModels,nChains,nRes,rc;
Boolean    B;

  if (structFile)  sFile = structFile;
             else  sFile = GetStructFile();

  if (!sFile)  return SBASE_FileNotFound;

  rc = SBASE_Ok;
  B  = False;
  MMDB->GetModelTable ( model,nModels );
  for (i=0;i<nModels;i++)
    if (model[i])  {
      model[i]->GetChainTable ( chain,nChains );
      for (j=0;j<nChains;j++)
        if (chain[j])  {
          chain[j]->GetResidueTable ( Res,nRes );
          for (n=0;n<nRes;n++)
            if (Res[n])  {
              k = AddHydrogens ( Res[n],sFile );
              if (k==SBASE_Ok)  B = True;
                          else  rc = SBASE_Incomplete;
            }
        }
    }
  if (!B)  rc = SBASE_Fail;

  if (!structFile)  delete sFile;

  return rc;

}



int CSBase0::ComplementResidue ( PCResidue R, int complFlag,
                                 PCFile structFile )  {
//   ComplementResidue(..) extracts data from SBase by residue
// name, then superposes atoms having identical names and
// adds the residue with atoms that are found in SBase but are
// absent in the residue. The added atoms are rotated and translated
// such as to comply with the superposed parts.
//   complFlag:
//     CMPLF_Hydrogens complement residue with hydrogens
//     CMPLF_nonHs     complement residue with non-hydrogens
//     CMPLF_XT        complement with C-terminus
//   Return:
//     SBASE_Ok             success
//     SBASE_FileNotFound   non-initiated SBase
//     SBASE_StructNotFound the residue's name is not found in SBase
//     SBASE_EmptyResidue   residue R does not contain atoms
//     SBASE_NoAtomsFound   SBase entry does not contain atoms
//     SBASE_NoAtomsData    SBase entry is not complete
//     SBASE_NoSimilarity   too few coomon atom names in R and SBase
//                          entry with the same structure name
//     SBASE_SuperpositionFailed  failed residue superposition
// NOTE: the function rearranges ALL atoms in the residue according
// to PDB order as written in SBase.
PCFile        sFile;
PCSBStructure SBS;
PPCAtom       A1,A2,A3;
ivector       c,x;
mat44         T;
Element       Hydrogen;
pstr          aname;
int           i,j,k,natoms1,natoms2,rc;
Boolean       complH,complNH,complXT;

  if (structFile)  sFile = structFile;
             else  sFile = GetStructFile();

  if (!sFile)  return SBASE_FileNotFound;

  SBS = GetStructure ( R->GetResName(),sFile );
  if (!structFile)  delete sFile;

  if (!SBS)  return SBASE_StructNotFound;

  /*  ---  temporary commented because of incompleteness of data
           in SBase files
  if (SBS->CheckAtoms()<0)  {
    delete SBS;
    return SBASE_NoAtomData;
  }
  ---------- */

  rc = SBASE_Ok;

  SBS->GetAtomTable ( A1,natoms1 );
  if (!A1)  {
    delete SBS;
    return SBASE_NoAtomsFound;
  }

  /*  --- temporary fix, simply neglect atoms that do not have
          coordinates. This code should be removed and the
          code above uncommented  ----------- */
  j = 0;
  for (i=0;i<natoms1;i++)
    if (A1[i]->x==-MaxReal)  delete A1[i];
    else {
      if (j<i)  A1[j] = A1[i];
      j++;
    }
  natoms1 = j;
  for (i=j;i<natoms1;i++)
    A1[i] = NULL;

  /* ---------------------------------------- */

  A2 = NULL;
  R->GetAtomTable ( A2,natoms2 );
  if (!A2)  {
    delete SBS;
    return SBASE_EmptyResidue;
  }

  GetVectorMemory ( c,natoms1,0 );
  GetVectorMemory ( x,natoms2,0 );
  for (j=0;j<natoms2;j++)
    x[j] = -1;

  k = 0;
  for (i=0;i<natoms1;i++)  {
    c[i] = -1;
    for (j=0;j<natoms2;j++)
      if (A2[j])  {
        if ((!A2[j]->isTer()) &&
            (!strcmp(A1[i]->GetAtomName(),A2[j]->GetAtomName())))  {
          if (c[i]<0) {
            c[i] = j;
            k++;
          }
          x[j] = i;
        }
      }
  }

  if (k>2)  {

    // the rotational-translational matrix T such that |T*A1 - A2| is
    // as A1[i] <-> A2[C[i]] only for those i that C[i]>=0 .
    // The default
    k = SuperposeAtoms ( T,A1,natoms1,A2,c );
    if (k!=SPOSEAT_Ok)  rc = SBASE_SuperpositionFailed;
    else  {
      complH  = ((complFlag & CMPLF_Hydrogens)!=0);
      complNH = ((complFlag & CMPLF_nonHs)!=0);
      complXT = ((complFlag & CMPLF_XT)!=0);
      strcpy ( Hydrogen,ElementName[0] );
      CutSpaces ( Hydrogen,SCUTKEY_BEGEND );
      A3 = new PCAtom[natoms1+natoms2+1];
      k  = 0;
      for (i=0;i<natoms1;i++)
        if (c[i]>=0)  {
          A3[k] = A1[i];
          A3[k]->Copy ( A2[c[i]] );
          A1[i] = NULL;
          k++;
          // check for altlocs
          for (j=c[i]+1;j<natoms2;j++)
            if (x[j]==i)  {
              A3[k] = newCAtom();
              A3[k]->Copy ( A2[j] );
              k++;
            }
        } else  {
          A3[k] = NULL;
          aname = A1[i]->GetAtomName();
          if (strcmp(A1[i]->GetElementName(),Hydrogen))  {
            //  a non-hydrogen atom, check if it should be added
            if (complNH &&  
                     (complXT || (strcmp(aname," OXT"))))
              A3[k] = A1[i];
          } else if (complH)  {
            //  a hydrogen and hydrogens are to be added
            if (complXT)
              A3[k] = A1[i];  // add unconditionally
            else if (!strcmp(aname," HXT"))  {
              // add HXT only if OXT is present in the residue
              for (j=0;(j<natoms2) && (!A3[k]);j++)
                if (A2[j])  {
                  if ((!A2[j]->isTer()) &&
                      (!strcmp(A2[j]->GetAtomName()," OXT")))
                    A3[k] = A1[i];
                }
            } else  // add non-HXT anyway
              A3[k] = A1[i];
          }
          if (A3[k])  {
            A3[k]->Transform ( T );
            A1[i] = NULL;
            k++;
          }
        }
      // add all atoms of original residue which were not superposed;
      // these include Ter, if any is present
      for (j=0;j<natoms2;j++)
        if (x[j]<0)  {
          A3[k] = newCAtom();
          A3[k]->Copy ( A2[j] );
          k++;
        }
      R->DeleteAllAtoms();
      for (i=0;i<k;i++)
        R->AddAtom ( A3[i] );
      delete[] A3;
    }

  } else
    rc = SBASE_NoSimilarity;

  FreeVectorMemory ( x,0 );
  FreeVectorMemory ( c,0 );
  for (i=0;i<natoms1;i++)
    if (A1[i])  delete A1[i];
  delete[] A1;
  delete   SBS;

  return rc;

}

int CSBase0::ComplementChain ( PCChain chain, int complFlag,
                               PCFile structFile )  {
PCFile     sFile;
PPCResidue Res;
int        i,k,nRes,rc;
Boolean    B;

  if (structFile)  sFile = structFile;
             else  sFile = GetStructFile();

  if (!sFile)  return SBASE_FileNotFound;

  rc = SBASE_Ok;
  B  = False;
  chain->GetResidueTable ( Res,nRes );
  for (i=0;i<nRes;i++)
    if (Res[i])  {
      k = ComplementResidue ( Res[i],complFlag,sFile );
      if (k==SBASE_Ok)  B = True;
                  else  rc = SBASE_Incomplete;
    }
  if (!B)  rc = SBASE_Fail;

  if (!structFile)  delete sFile;

  return rc;

}

int CSBase0::ComplementModel ( PCModel model, int complFlag,
                               PCFile structFile )  {
PCFile     sFile;
PPCChain   chain;
PPCResidue Res;
int        i,j,k,nChains,nRes,rc;
Boolean    B;

  if (structFile)  sFile = structFile;
             else  sFile = GetStructFile();

  if (!sFile)  return SBASE_FileNotFound;

  rc = SBASE_Ok;
  B  = False;
  model->GetChainTable ( chain,nChains );
  for (i=0;i<nChains;i++)
    if (chain[i])  {
      chain[i]->GetResidueTable ( Res,nRes );
      for (j=0;j<nRes;j++)
        if (Res[j])  {
          k = ComplementResidue ( Res[j],complFlag,sFile );
          if (k==SBASE_Ok)  B = True;
                      else  rc = SBASE_Incomplete;
        }
    }
  if (!B)  rc = SBASE_Fail;

  if (!structFile)  delete sFile;

  return rc;

}

int CSBase0::ComplementFile ( PCMMDBManager MMDB, int complFlag,
                              PCFile structFile )  {
PCFile     sFile;
PPCModel   model;
PPCChain   chain;
PPCResidue Res;
int        i,j,n,k,nModels,nChains,nRes,rc;
Boolean    B;

  if (structFile)  sFile = structFile;
             else  sFile = GetStructFile();

  if (!sFile)  return SBASE_FileNotFound;

  rc = SBASE_Ok;
  B  = False;
  MMDB->GetModelTable ( model,nModels );
  for (i=0;i<nModels;i++)
    if (model[i])  {
      model[i]->GetChainTable ( chain,nChains );
      for (j=0;j<nChains;j++)
        if (chain[j])  {
          chain[j]->GetResidueTable ( Res,nRes );
          for (n=0;n<nRes;n++)
            if (Res[n])  {
              k = ComplementResidue ( Res[n],complFlag,sFile );
              if (k==SBASE_Ok)  B = True;
                          else  rc = SBASE_Incomplete;
            }
        }
    }
  if (!B)  rc = SBASE_Fail;

  if (!structFile)  delete sFile;

  return rc;

}


int CSBase0::GetAtNames ( int structNo, PAtomName AtName,
                          int & nAtoms, int & nH )  {
int    rc;
PCFile structFile;
  if ((structNo<0) || (structNo>=nStructures))
    return SBASE_WrongIndex;
  if (Index[structNo]->loadPos>=0)  {
    rc = GetAtNames ( NULL,structNo,AtName,nAtoms,nH );
  } else  {
    structFile = GetStructFile();
    if (structFile)  {
      rc = GetAtNames ( structFile,structNo,AtName,nAtoms,nH );
      structFile->shut();
      delete structFile;
    } else
      return SBASE_FileNotFound;
  }
  return rc;
}


int CSBase0::GetAtNames ( PCFile structFile, int structNo,
                          PAtomName AtName,
                          int & nAtoms, int & nH )  {
PCSBStructure SBS;
PCSBAtom      atom;
int           i,j;
pstr          p1,p2;
Boolean       removeHydrogens;

  if ((structNo<0) || (structNo>=nStructures))
    return SBASE_WrongIndex;

  removeHydrogens = (nH==-1);

  if (Index[structNo]->loadPos>=0)  {

    SBS = ldStructure[Index[structNo]->loadPos];

  } else  {

    structFile->seek ( Index[structNo]->fStructPos );
    SBS = NULL;
    StreamRead ( *structFile,SBS );

    if ((!SBS) || (!structFile->Success()))  {
      if (SBS)  delete SBS;
      return SBASE_ReadError;
    }

  }

  nAtoms = Index[structNo]->nAtoms;
  nH     = 0;
  if (Index[structNo]->Comp1)  {
    p1 = strstr ( Index[structNo]->Comp1,"H(" );
    if (p1)  {
      p1 += 2;
      p2  = p1;
      while ((*p2) && (*p2!=')'))  p2++;
      if (*p2==')')  {
        *p2 = char(0);
        nH  = mround(strtod(p1,NULL));
        *p2 = ')';
      }
    }
  }

  if (removeHydrogens)  {
    j = 0;
    for (i=0;i<nAtoms;i++)  {
      atom = SBS->Atom[i];
      if (atom)  {
        if ((atom->element[0]!='H') || (atom->element[1]))
          strcpy ( AtName[j++],atom->pdb_name );
      }
    }
  } else  {
    for (i=0;i<nAtoms;i++)  {
      atom = SBS->Atom[i];
      if (atom)
        strcpy ( AtName[i],atom->pdb_name );
    }
  }

  if (Index[structNo]->loadPos<0)  delete SBS;

  return SBASE_Ok;

}

int FindName ( PAtomName Nams, pstr N, int len )  {
int      i;
AtomName Nam;
  i = 0;
  while (i<len)  {
    strcpy ( Nam,Nams[i] );
    if (!strcmp(N,Nam))  break;
    i++;
  }
  if (i>=len)  i = -1;
  return i;
}

int CSBase0::GetNofAtoms ( int structNo,  int & nNonHAtoms,
                           int & nHAtoms )  {
pstr  p1,p2;

  nNonHAtoms = 0;
  nHAtoms    = 0;

  if ((structNo<0) || (structNo>=nStructures))
    return SBASE_WrongIndex;

  nNonHAtoms = Index[structNo]->nAtoms;
  nHAtoms    = 0;
  if (Index[structNo]->Comp1)  {
    p1 = strstr ( Index[structNo]->Comp1,"H(" );
    if (p1)  {
      p1 += 2;
      p2  = p1;
      while ((*p2) && (*p2!=')'))  p2++;
      if (*p2==')')  {
        *p2 = char(0);
        nHAtoms = mround(strtod(p1,NULL));
        *p2 = ')';
      }
    }
  }

  nNonHAtoms -= nHAtoms;

  return SBASE_Ok;

}

int CSBase0::GetAtoms ( cpstr name,
                        int & nNonHAtoms, PAtomName NonHAtName,
                        int & nHAtoms,    PAtomName HAtName,
                        ivector Hconnect, ivector Elem,
                        ivector Chiral )  {
PCSBStructure SBS;
PCSBAtom      atom,atom2;
PCSBBond      bond;
int           i,j,structNo,rc;
PCFile        structFile;

  nNonHAtoms = 0;
  nHAtoms    = 0;

  structNo = GetStructNo ( name );
  if (structNo<0)  return SBASE_StructNotFound;

  if (Index[structNo]->loadPos>=0)  {

    SBS = ldStructure[Index[structNo]->loadPos];

  } else  {
  
    structFile = GetStructFile();
    if (!structFile)  return SBASE_FileNotFound;

    SBS = NULL;
    structFile->seek ( Index[structNo]->fStructPos );
    StreamRead       ( *structFile,SBS );
    structFile->shut ();

    if ((!SBS) || (!structFile->Success()))  {
      if (SBS)  delete SBS;
      delete structFile;
      return SBASE_ReadError;
    }
    delete structFile;

  }

  rc = SBASE_Ok;

  for (i=0;i<Index[structNo]->nAtoms;i++)  {
    atom = SBS->Atom[i];
    if (atom)  {
      Elem[i] = getElementNo ( atom->element );
      if ((atom->element[0]==' ') && (atom->element[1]=='H') &&
          (!atom->element[2]))  {
        strcpy ( HAtName[nHAtoms],atom->pdb_name );
        nHAtoms++;
      } else  {
        strcpy ( NonHAtName[nNonHAtoms],atom->pdb_name );
        nNonHAtoms++;
      }
      Chiral[i] = MakeChirInd ( atom->chirality );
    }
  }

  if (nHAtoms>0)  {
    for (j=0;j<nHAtoms;j++)
      Hconnect[j] = -1;
    for (i=0;i<Index[structNo]->nBonds;i++)  {
      bond = SBS->Bond[i];
      if (bond)  {
        atom  = SBS->Atom[bond->atom1-1];
        atom2 = SBS->Atom[bond->atom2-1];
        if (atom && atom2)  {
          j = FindName ( HAtName,atom->pdb_name,nHAtoms );
          if (j>=0)
            Hconnect[j] = FindName ( NonHAtName,atom2->pdb_name,
                                     nNonHAtoms );
          else  {
            j = FindName ( HAtName,atom2->pdb_name,nHAtoms );
            if (j>=0)
              Hconnect[j] = FindName ( NonHAtName,atom->pdb_name,
                                       nNonHAtoms );
          }
        }
      }
    }
    j = 0;
    while ((j<nHAtoms) && (Hconnect[j]>=0)) j++;
    if (j<nHAtoms) 
      rc = SBASE_ConnectivityError;
  }

  if (Index[structNo]->loadPos<0)  delete SBS;

  return rc;

}


int  CSBase0::GetBonds ( cpstr    name,
                         ivector nBonds, imatrix bondPair,
                         int &   nAtoms, int     maxNAtoms,
                         int     maxNBonds )  {
PCGraph G;
PCEdge  edge;
PCFile  graphFile;
int     structNo,i, a1,a2;

  for (i=0;i<maxNAtoms;i++)
    nBonds[i] = 0;

  nAtoms = 0;

  structNo = GetStructNo ( name );
  if (structNo<0)  return SBASE_StructNotFound;

  nAtoms = Index[structNo]->nAtoms;
  if (nAtoms<=0)  return SBASE_Ok;

  if (Index[structNo]->loadPos>=0)  {

    G = ldGraph[Index[structNo]->loadPos];

  } else  {

    graphFile = GetGraphFile();
    if (!graphFile)  return SBASE_FileNotFound;

    G = NULL;
    graphFile->seek ( Index[structNo]->fGraphPos );
    StreamRead      ( *graphFile,G );
    graphFile->shut ();

    if ((!G) || (!graphFile->Success()))  {
      if (G)  delete G;
      delete graphFile;
      return SBASE_ReadError;
    }
    delete graphFile;

  }

  for (i=0;i<G->nEdges;i++) {
    edge = G->Edge[i];
    if (edge)  {
      if (edge->v1<edge->v2)  {
        a1 = edge->v1;  a2 = edge->v2;
      } else  {
        a1 = edge->v2;  a2 = edge->v1;
      }
      a1--;  a2--;
      if (nBonds[a1]<maxNBonds)  {
        bondPair[a1][nBonds[a1]] = a2;
        nBonds[a1]++;
      }
    }
  }
  
  if (Index[structNo]->loadPos<0)  delete G;

  return SBASE_Ok;

}


int  CSBase0::GetHetInfo ( cpstr       name,
                           pstr        Formula,
                           pstr        Hname,
                           pstr        Hsynonym,
                           pstr        Hcharge,
                           PAtomName & ClinkAtom,
                           PElement  & ClinkEle,
                           PAtomName & SlinkAtom,
                           PElement  & SlinkEle,
                           int       & nLeavingAtoms )  {
PCSBStructure SBS;
PCFile        structFile;
int           i,structNo;

  Formula [0] = char(0);
  Hname   [0] = char(0);
  Hsynonym[0] = char(0);
  Hcharge [0] = char(0);
  ClinkAtom   = NULL;
  ClinkEle    = NULL;
  SlinkAtom   = NULL;
  SlinkEle    = NULL;
  nLeavingAtoms = 0;

  structNo = GetStructNo ( name );
  if (structNo<0)  return SBASE_StructNotFound;

  structFile = GetStructFile();
  if (!structFile)  return SBASE_FileNotFound;

  SBS = NULL;
  structFile->seek ( Index[structNo]->fStructPos );
  StreamRead       ( *structFile,SBS );
  structFile->shut ();

  if ((!SBS) || (!structFile->Success()))  {
    if (SBS)  delete SBS;
    delete structFile;
    return SBASE_ReadError;
  }
  delete structFile;

  if (SBS->Formula) strcpy ( Formula ,SBS->Formula );
  if (SBS->Synonym) strcpy ( Hsynonym,SBS->Synonym );
  if (SBS->Name)    strcpy ( Hname   ,SBS->Name    );
  if (SBS->Charge)  strcpy ( Hcharge ,SBS->Charge  );

  nLeavingAtoms = SBS->nLeavingAtoms;
  if (nLeavingAtoms>0)  {
    SlinkAtom = new AtomName[nLeavingAtoms];
    SlinkEle  = new Element [nLeavingAtoms];
    ClinkAtom = new AtomName[nLeavingAtoms];
    ClinkEle  = new Element [nLeavingAtoms];
    for (i=0;i<nLeavingAtoms;i++)  {
      strcpy (SlinkAtom[i],SBS->Atom[SBS->leavingAtom[i]-1]->pdb_name);
      strcpy (SlinkEle [i],SBS->Atom[SBS->leavingAtom[i]-1]->element );
      if (SBS->bondedAtom[i]>0)  {
        strcpy(ClinkAtom[i],SBS->Atom[SBS->bondedAtom[i]-1]->pdb_name);
        strcpy(ClinkEle [i],SBS->Atom[SBS->bondedAtom[i]-1]->element );
      } else  {
        ClinkAtom[i][0] = char(0);
        ClinkEle [i][0] = char(0);
      }
    }
  }

  delete SBS;

  return SBASE_Ok;

}

