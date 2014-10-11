//  $Id: mmdb_atom.cpp,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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
//  **** Module  :  MMDB_Atom  <implementation>
//       ~~~~~~~~~
//  **** Project :  MacroMolecular Data Base (MMDB)
//       ~~~~~~~~~ 
//  **** Classes :  CAtom    ( atom class    )
//       ~~~~~~~~~  CResidue ( residue class )
//
//  Copyright (C) E. Krissinel 2000-2009
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

#ifndef  __MMDB_Chain__
#include "mmdb_chain.h"
#endif

#ifndef  __MMDB_Model__
#include "mmdb_model.h"
#endif

#ifndef  __MMDB_File__
#include "mmdb_file.h"
#endif

#ifndef  __MMDB_Tables__
#include "mmdb_tables.h"
#endif

#ifndef  __MMDB_CIFDefs__
#include "mmdb_cifdefs.h"
#endif

#ifndef IOTBX_PDB_HYBRID_36_C_H
#include "hybrid_36.h"
#endif


//  ================================================================

#define  ASET_ShortBinary   0x10000000
#define  ASET_ShortTer      0x20000000
#define  ASET_ShortHet      0x40000000

Boolean  ignoreSegID            = False;
Boolean  ignoreElement          = False;
Boolean  ignoreCharge           = False;
Boolean  ignoreNonCoorPDBErrors = False;
Boolean  ignoreUnmatch          = False;


//  ==========================  CAtom  =============================

CAtom::CAtom() : CUDData()  {
  InitAtom();
}

CAtom::CAtom ( PCResidue res ) : CUDData()  {
  InitAtom();
  if (res)
    res->AddAtom ( this );
}

CAtom::CAtom ( RPCStream Object ) : CUDData(Object)  {
  InitAtom();
}

CAtom::~CAtom()  {
int     nA;
PPCAtom A;
  FreeMemory();
  if (residue)  {
    A  = NULL;
    nA = 0;
    if (residue->chain)  {
      if (residue->chain->model)  {
        A  = residue->chain->model->GetAllAtoms();
        nA = residue->chain->model->GetNumberOfAllAtoms();
      }
    }
    residue->_ExcludeAtom ( index );
    if ((0<index) && (index<=nA))  A[index-1] = NULL;
  }
}

void  CAtom::InitAtom()  {
  serNum     = -1;         // serial number
  index      = -1;         // index in the file
  name[0]    = char(0);    // atom name
  altLoc[0]  = char(0);    // alternate location indicator
  residue    = NULL;       // reference to residue
  x          = 0.0;        // orthogonal x-coordinate in angstroms
  y          = 0.0;        // orthogonal y-coordinate in angstroms
  z          = 0.0;        // orthogonal z-coordinate in angstroms
  occupancy  = 0.0;        // occupancy
  tempFactor = 0.0;        // temperature factor
  segID[0]   = char(0);    // segment identifier
  strcpy ( element,"  " ); // chemical element symbol - RIGHT JUSTIFIED
  energyType[0] = char(0); // chemical element symbol - RIGHT JUSTIFIED
  charge     = 0.0;        // charge on the atom
  sigX       = 0.0;        // standard deviation of the stored x-coord
  sigY       = 0.0;        // standard deviation of the stored y-coord
  sigZ       = 0.0;        // standard deviation of the stored z-coord
  sigOcc     = 0.0;        // standard deviation of occupancy
  sigTemp    = 0.0;        // standard deviation of temperature factor
  u11        = 0.0;        //
  u22        = 0.0;        // anisotropic
  u33        = 0.0;        //
  u12        = 0.0;        //    temperature 
  u13        = 0.0;        //
  u23        = 0.0;        //        factors
  su11       = 0.0;        //
  su22       = 0.0;        // standard  
  su33       = 0.0;        //    deviations of
  su12       = 0.0;        //       anisotropic
  su13       = 0.0;        //          temperature
  su23       = 0.0;        //             factors
  Het        = False;      // indicator of atom in non-standard groups
  Ter        = False;      // chain terminator
  WhatIsSet  = 0x00000000; // nothing is set
  nBonds     = 0;          // no bonds
  Bond       = NULL;       // empty array of bonds
}

void  CAtom::FreeMemory()  {
  FreeBonds();
}

void  CAtom::FreeBonds()  {
  if (Bond)  delete[] Bond;
  Bond   = NULL;
  nBonds = 0;
}

int CAtom::GetNBonds()  {
  return nBonds & 0x000000FF;
}

void CAtom::GetBonds ( RPSAtomBond AtomBond, int & nAtomBonds )  {
//    This GetBonds(..) returns pointer to the CAtom's
//  internal Bond structure, IT MUST NOT BE DISPOSED. 
  nAtomBonds = nBonds & 0x000000FF;
  AtomBond   = Bond;
}

void CAtom::GetBonds ( RPSAtomBondI AtomBondI, int & nAtomBonds )  {
//    This GetBonds(..) disposes AtomBondI, if it was not set
//  to NULL, allocates AtomBondI[nAtomBonds] and returns its
//  pointer. AtomBondI MUST BE DISPOSED BY APPLICATION.
int i;

  if (AtomBondI)  delete[] AtomBondI;

  nAtomBonds = nBonds & 0x000000FF;

  if (nAtomBonds<=0)
    AtomBondI = NULL;
  else  {
    AtomBondI = new SAtomBondI[nAtomBonds];
    for (i=0;i<nAtomBonds;i++) {
      if (Bond[i].atom)
            AtomBondI[i].index = Bond[i].atom->index;
      else  AtomBondI[i].index = -1;
      AtomBondI[i].order = Bond[i].order;
    }

  }

}

void CAtom::GetBonds ( PSAtomBondI AtomBondI, int & nAtomBonds,
                       int maxlength )  {
//    This GetBonds(..) does not dispose or allocate AtomBond.
//  It is assumed that length of AtomBond is sufficient to
//  accomodate all bonded atoms.
int  i;

  nAtomBonds = IMin(maxlength,nBonds & 0x000000FF);

  for (i=0;i<nAtomBonds;i++)  {
    if (Bond[i].atom)
          AtomBondI[i].index = Bond[i].atom->index;
    else  AtomBondI[i].index = -1;
    AtomBondI[i].order = Bond[i].order;
  }

}


int  CAtom::AddBond ( PCAtom bond_atom, int bond_order,
                      int nAdd_bonds )  {
PSAtomBond B1;
int        i,k,nb,nballoc;

  nb = nBonds & 0x000000FF;
  k  = -1;
  for (i=0;(i<nb) && (k<0);i++)
    if (Bond[i].atom==bond_atom)  k = i;
  if (k>=0)  return -k;

  nballoc = (nBonds >> 8) & 0x000000FF;
  if (nBonds>=nballoc)  {
    nballoc += nAdd_bonds;
    B1 = new SAtomBond[nballoc];
    for (i=0;i<nb;i++)  {
      B1[i].atom  = Bond[i].atom;
      B1[i].order = Bond[i].order;
    }
    if (Bond)  delete[] Bond;
    Bond = B1;
  }
  Bond[nb].atom  = bond_atom;
  Bond[nb].order = bond_order;
  nb++;

  nBonds = nb | (nballoc << 8);

  return nb;

}

void  CAtom::SetResidue ( PCResidue res )  {
  residue = res;
}

void  CAtom::StandardPDBOut ( cpstr Record, pstr S )  {
char N[10];
  strcpy    ( S,Record );
  PadSpaces ( S,80     );
  if (serNum>99999)  {
    hy36encode ( 5,serNum,N );
    strcpy_n   ( &(S[6]),N,5 );
  } else if (serNum>0)
    PutInteger ( &(S[6]),serNum,5 );
  else if (index<=99999)
    PutInteger ( &(S[6]),index,5 );
  else {
    hy36encode ( 5,index,N );
    strcpy_n   ( &(S[6]),N,5 );
  }
  /*
  if (serNum>0)
        PutInteger ( &(S[6]),serNum,5 );
  else  PutInteger ( &(S[6]),index ,5 );
  */
  if (!Ter)  {
    if (altLoc[0])  S[16] = altLoc[0];
    strcpy_n  ( &(S[12]),name   ,4 );
    strcpy_n  ( &(S[72]),segID  ,4 );
    strcpy_nr ( &(S[76]),element,2 );
    if (WhatIsSet & ASET_Charge)  {
      sprintf  ( N,"%+2i",mround(charge) );
      strcpy_n ( &(S[78]),N,2 );
    } else
      strcpy_n ( &(S[78]),"  ",2 );
  }
  strcpy_nr ( &(S[17]),residue->name,3 );
  strcpy_nr ( &(S[20]),residue->chain->chainID,2 );
//  S[21] = residue->chain->chainID[0];
//  if (!S[21])  S[21] = ' ';
  if (residue->seqNum>MinInt4)  {
    if (-999<=residue->seqNum<=9999)
      PutIntIns  ( &(S[22]),residue->seqNum,4,residue->insCode );
    else  {
      hy36encode ( 4,residue->seqNum,N );
      strcpy_n   ( &(S[22]),N,4 );
    }
  }
}

void  CAtom::PDBASCIIDump ( RCFile f )  {
// makes the ASCII PDB  ATOM, HETATM, SIGATOM, ANISOU
// SIGUIJ and TER lines from the class' data
char S[100];
  if (Ter)  {
    if (WhatIsSet & ASET_Coordinates)  {
      StandardPDBOut ( pstr("TER"),S );
      f.WriteLine ( S );
    }
  } else  {
    if (WhatIsSet & ASET_Coordinates)  {
      if (Het)  StandardPDBOut ( pstr("HETATM"),S );
          else  StandardPDBOut ( pstr("ATOM")  ,S );
      PutRealF ( &(S[30]),x,8,3 );
      PutRealF ( &(S[38]),y,8,3 );
      PutRealF ( &(S[46]),z,8,3 );
      if (WhatIsSet & ASET_Occupancy)
        PutRealF ( &(S[54]),occupancy ,6,2 );
      if (WhatIsSet & ASET_tempFactor)
        PutRealF ( &(S[60]),tempFactor,6,2 );
      f.WriteLine ( S );
    }
    if (WhatIsSet & ASET_CoordSigma)  {
      StandardPDBOut ( pstr("SIGATM"),S );
      PutRealF ( &(S[30]),sigX,8,3 );
      PutRealF ( &(S[38]),sigY,8,3 );
      PutRealF ( &(S[46]),sigZ,8,3 );
      if ((WhatIsSet & ASET_OccSigma) &&
          (WhatIsSet & ASET_Occupancy))
        PutRealF ( &(S[54]),sigOcc,6,2 );
      if ((WhatIsSet & ASET_tFacSigma) &&
          (WhatIsSet & ASET_tempFactor))
        PutRealF ( &(S[60]),sigTemp,6,2 );
      f.WriteLine ( S );
    }
    if (WhatIsSet & ASET_Anis_tFac)  {
      StandardPDBOut ( pstr("ANISOU"),S );
      PutInteger  ( &(S[28]),mround(u11*1.0e4),7 );
      PutInteger  ( &(S[35]),mround(u22*1.0e4),7 );
      PutInteger  ( &(S[42]),mround(u33*1.0e4),7 );
      PutInteger  ( &(S[49]),mround(u12*1.0e4),7 );
      PutInteger  ( &(S[56]),mround(u13*1.0e4),7 );
      PutInteger  ( &(S[63]),mround(u23*1.0e4),7 );
      f.WriteLine ( S );
      if (WhatIsSet & ASET_Anis_tFSigma)  {
        StandardPDBOut ( pstr("SIGUIJ"),S );
        PutInteger  ( &(S[28]),mround(su11*1.0e4),7 );
        PutInteger  ( &(S[35]),mround(su22*1.0e4),7 );
        PutInteger  ( &(S[42]),mround(su33*1.0e4),7 );
        PutInteger  ( &(S[49]),mround(su12*1.0e4),7 );
        PutInteger  ( &(S[56]),mround(su13*1.0e4),7 );
        PutInteger  ( &(S[63]),mround(su23*1.0e4),7 );
        f.WriteLine ( S );
      }
    }
  }
}

void  CAtom::MakeCIF ( PCMMCIFData CIF )  {
PCMMCIFLoop  Loop;
AtomName     AtName;
Element      el;
char         N[10];
int          i,j,RC;
PCChain      chain       = NULL;
PCModel      model       = NULL;
Boolean      singleModel = True;

  if (residue)  chain = residue->chain;
  if (chain)    model = PCModel(chain->model);
  if (model)  {
    if (model->manager)
      singleModel = PCMMDBFile(model->manager)->nModels<=1;
  }

  RC = CIF->AddLoop ( CIFCAT_ATOM_SITE,Loop );
  if (RC!=CIFRC_Ok)  {
    // the category was (re)created, provide tags
    Loop->AddLoopTag ( CIFTAG_GROUP_PDB          ); // ATOM, TER etc.
    Loop->AddLoopTag ( CIFTAG_ID                 ); // serial number
    Loop->AddLoopTag ( CIFTAG_LABEL_ATOM_ID      ); // atom name
    Loop->AddLoopTag ( CIFTAG_LABEL_ALT_ID       ); // alt location
    Loop->AddLoopTag ( CIFTAG_LABEL_COMP_ID      ); // residue name
    Loop->AddLoopTag ( CIFTAG_LABEL_ASYM_ID      ); // chain ID
    Loop->AddLoopTag ( CIFTAG_LABEL_SEQ_ID       ); // res seq number
    Loop->AddLoopTag ( CIFTAG_PDBX_PDB_INS_CODE  ); // insertion code
    Loop->AddLoopTag ( CIFTAG_CARTN_X            ); // x-coordinate
    Loop->AddLoopTag ( CIFTAG_CARTN_Y            ); // y-coordinate
    Loop->AddLoopTag ( CIFTAG_CARTN_Z            ); // z-coordinate
    Loop->AddLoopTag ( CIFTAG_OCCUPANCY          ); // occupancy
    Loop->AddLoopTag ( CIFTAG_B_ISO_OR_EQUIV     ); // temp factor
    Loop->AddLoopTag ( CIFTAG_SEGMENT_ID         ); // segment ID
    Loop->AddLoopTag ( CIFTAG_TYPE_SYMBOL        ); // element symbol
    Loop->AddLoopTag ( CIFTAG_CHARGE             ); // charge on atom
    Loop->AddLoopTag ( CIFTAG_CARTN_X_ESD        ); // x-sigma
    Loop->AddLoopTag ( CIFTAG_CARTN_Y_ESD        ); // y-sigma
    Loop->AddLoopTag ( CIFTAG_CARTN_Z_ESD        ); // z-sigma
    Loop->AddLoopTag ( CIFTAG_OCCUPANCY_ESD      ); // occupancy-sigma
    Loop->AddLoopTag ( CIFTAG_B_ISO_OR_EQUIV_ESD ); // t-factor-sigma
    Loop->AddLoopTag ( CIFTAG_PDBX_PDB_MODEL_NUM ); // model number 
  }

  if (Ter)  {

    if (!(WhatIsSet & ASET_Coordinates))  return;
    Loop->AddString  ( pstr("TER") );
    if (serNum>0)  Loop->AddInteger ( serNum );
             else  Loop->AddInteger ( index  );
    Loop->AddNoData ( CIF_NODATA_QUESTION );  // no atom name
    Loop->AddNoData ( CIF_NODATA_QUESTION );  // no alt code
    if (residue)   Loop->AddString ( residue->name       );
            else   Loop->AddString ( NULL                );
    if (chain)     Loop->AddString ( chain->chainID,True );
          else     Loop->AddString ( NULL                );
    if (residue)  {
      if (residue->seqNum>MinInt4)
           Loop->AddInteger ( residue->seqNum  );
      else Loop->AddNoData  ( CIF_NODATA_DOT   );
      Loop->AddString ( residue->insCode,True );
    } else  {
      Loop->AddNoData ( CIF_NODATA_DOT );
      Loop->AddNoData ( CIF_NODATA_DOT );
    }
    
    for (i=0;i<13;i++)
      Loop->AddNoData ( CIF_NODATA_QUESTION );

  } else if (WhatIsSet & (ASET_Coordinates | ASET_CoordSigma))  {

    if (!WhatIsSet)  return;
    if (Het)  Loop->AddString ( pstr("HETATM") );
        else  Loop->AddString ( pstr("ATOM")   );
    if (serNum>0)  Loop->AddInteger ( serNum );
             else  Loop->AddInteger ( index  );

    if (WhatIsSet & ASET_Coordinates)  {
      strcpy_css ( AtName,name );
      Loop->AddString  ( AtName      );  // atom name
      Loop->AddString  ( altLoc,True );  // alt code
      if (residue)   Loop->AddString ( residue->name       );
              else   Loop->AddNoData ( CIF_NODATA_DOT      );
      if (chain)     Loop->AddString ( chain->chainID,True );
            else     Loop->AddNoData ( CIF_NODATA_DOT      );
      if (residue)  {
        if (residue->seqNum>MinInt4)
             Loop->AddInteger ( residue->seqNum  );
        else Loop->AddNoData  ( CIF_NODATA_DOT   );
        Loop->AddString ( residue->insCode,True );
      } else  {
        Loop->AddNoData ( CIF_NODATA_DOT );
        Loop->AddString ( CIF_NODATA_DOT );
      }
      Loop->AddReal ( x );
      Loop->AddReal ( y );
      Loop->AddReal ( z );
      if (WhatIsSet & ASET_Occupancy)
            Loop->AddReal   ( occupancy );
      else  Loop->AddNoData ( CIF_NODATA_QUESTION );
      if (WhatIsSet & ASET_tempFactor)
            Loop->AddReal   ( tempFactor );
      else  Loop->AddNoData ( CIF_NODATA_QUESTION );
      strcpy_css ( el,element );
      Loop->AddString ( segID ,True );
      Loop->AddString ( el    ,True );
      if (WhatIsSet & ASET_Charge)
            sprintf ( N,"%+2i",mround(charge) );
      else  strcpy  ( N,"  " );
      Loop->AddString ( N,True );
    } else
      for (i=0;i<14;i++)
        Loop->AddNoData ( CIF_NODATA_QUESTION );

    if (WhatIsSet & ASET_CoordSigma)  {
      Loop->AddReal ( sigX );
      Loop->AddReal ( sigY );
      Loop->AddReal ( sigZ );
      if ((WhatIsSet & ASET_OccSigma) &&
          (WhatIsSet & ASET_Occupancy))
            Loop->AddReal   ( sigOcc  );
      else  Loop->AddNoData ( CIF_NODATA_QUESTION );
      if ((WhatIsSet & ASET_tFacSigma) &&
          (WhatIsSet & ASET_tempFactor))
            Loop->AddReal   ( sigTemp );
      else  Loop->AddNoData ( CIF_NODATA_QUESTION );
    } else
      for (i=0;i<5;i++)
        Loop->AddNoData ( CIF_NODATA_QUESTION );

  }

  if (singleModel)  Loop->AddNoData  ( CIF_NODATA_QUESTION );
              else  Loop->AddInteger ( model->serNum       );

  if (WhatIsSet & ASET_Anis_tFac)  {
   
    RC = CIF->AddLoop ( CIFCAT_ATOM_SITE_ANISOTROP,Loop );
    if (RC!=CIFRC_Ok)  {
      // the category was (re)created, provide tags
      Loop->AddLoopTag ( CIFTAG_ID      ); // serial number
      Loop->AddLoopTag ( CIFTAG_U11     ); // component u11
      Loop->AddLoopTag ( CIFTAG_U22     ); // component u22
      Loop->AddLoopTag ( CIFTAG_U33     ); // component u33
      Loop->AddLoopTag ( CIFTAG_U12     ); // component u12
      Loop->AddLoopTag ( CIFTAG_U13     ); // component u13
      Loop->AddLoopTag ( CIFTAG_U23     ); // component u23
      Loop->AddLoopTag ( CIFTAG_U11_ESD ); // component u11 sigma
      Loop->AddLoopTag ( CIFTAG_U22_ESD ); // component u22 sigma
      Loop->AddLoopTag ( CIFTAG_U33_ESD ); // component u33 sigma
      Loop->AddLoopTag ( CIFTAG_U12_ESD ); // component u12 sigma
      Loop->AddLoopTag ( CIFTAG_U13_ESD ); // component u13 sigma
      Loop->AddLoopTag ( CIFTAG_U23_ESD ); // component u23 sigma
      for (i=1;i<index;i++)  {
        Loop->AddInteger ( i );
        for (j=0;j<12;j++)
          Loop->AddString ( NULL );
      }
    }

    if (serNum>0)  Loop->AddInteger ( serNum );
             else  Loop->AddInteger ( index  );
    
    Loop->AddReal ( u11 );
    Loop->AddReal ( u22 );
    Loop->AddReal ( u33 );
    Loop->AddReal ( u12 );
    Loop->AddReal ( u13 );
    Loop->AddReal ( u23 );
    if (WhatIsSet & ASET_Anis_tFSigma)  {
      Loop->AddReal ( su11 );
      Loop->AddReal ( su22 );
      Loop->AddReal ( su33 );
      Loop->AddReal ( su12 );
      Loop->AddReal ( su13 );
      Loop->AddReal ( su23 );
    }

  }

}

int CAtom::ConvertPDBATOM ( int ix, cpstr S )  {
//   Gets data from the PDB ASCII ATOM record.
//   This function DOES NOT check the "ATOM" keyword and
// does not decode the chain and residue parameters! These
// must be treated by calling process, see
// Chain::ConvertPDBASCII().

  index = ix;

  if (WhatIsSet & ASET_Coordinates)
    return Error_ATOM_AlreadySet;

  if (!(GetReal(x,&(S[30]),8) &&
        GetReal(y,&(S[38]),8) &&
        GetReal(z,&(S[46]),8)))
    return Error_ATOM_Unrecognized;

  WhatIsSet |= ASET_Coordinates;
  Het = False;
  Ter = False;

  if (GetReal(occupancy ,&(S[54]),6))  WhatIsSet |= ASET_Occupancy;
  if (GetReal(tempFactor,&(S[60]),6))  WhatIsSet |= ASET_tempFactor;

  if (WhatIsSet & (ASET_CoordSigma | ASET_Anis_tFac |
                   ASET_Anis_tFSigma))  
    // something was already submitted. check complience
    return CheckData ( S );
  else  
    // first data submission. just take the data
    GetData ( S );

  return 0;

}

void  CAtom::SetAtomName ( int            ix,
                           int            sN,
                           const AtomName aName,
                           const AltLoc   aLoc,
                           const SegID    sID,
                           const Element  eName )  {
  index   = ix;
  serNum  = sN;
  strcpy     ( name   ,aName );
  strcpy_css ( altLoc ,pstr(aLoc)  );
  strcpy_css ( segID  ,pstr(sID)   );
  if (!eName[0])  element[0] = char(0);
  else if (!eName[1])  {
    element[0] = ' ';
    strcpy ( &(element[1]),eName );
  } else
    strcpy   ( element,eName );
  WhatIsSet = 0;
}

int CAtom::ConvertPDBSIGATM ( int ix, cpstr S )  {
//   Gets data from the PDB ASCII SIGATM record.
//   This function DOES NOT check the "SIGATM" keyword and
// does not decode the chain and residue parameters! These
// must be treated by the calling process, see
// Chain::ConvertPDBASCII().

  index = ix;

  if (WhatIsSet & ASET_CoordSigma)
    return Error_ATOM_AlreadySet;

  if (!(GetReal(sigX,&(S[30]),8) &&
        GetReal(sigY,&(S[38]),8) &&
        GetReal(sigZ,&(S[46]),8)))
    return Error_ATOM_Unrecognized;

  WhatIsSet |= ASET_CoordSigma;

  if (GetReal(sigOcc ,&(S[54]),6))  WhatIsSet |= ASET_OccSigma;
  if (GetReal(sigTemp,&(S[60]),6))  WhatIsSet |= ASET_tFacSigma;

  if (WhatIsSet & (ASET_Coordinates | ASET_Anis_tFac |
                   ASET_Anis_tFSigma))  
    // something was already submitted. check complience
    return CheckData ( S );
  else  
    // first data submission. just take the data
    GetData ( S );

  return 0;

}

int CAtom::ConvertPDBANISOU ( int ix, cpstr S )  {
//   Gets data from the PDB ASCII ANISOU record.
//   This function DOES NOT check the "ANISOU" keyword and
// does not decode chain and residue parameters! These must
// be treated by the calling process, see
// Chain::ConvertPDBASCII().

  index = ix;

  if (WhatIsSet & ASET_Anis_tFac)
    return Error_ATOM_AlreadySet;

  if (!(GetReal(u11,&(S[28]),7) &&
        GetReal(u22,&(S[35]),7) &&
        GetReal(u33,&(S[42]),7) &&
        GetReal(u12,&(S[49]),7) &&
        GetReal(u13,&(S[56]),7) &&
        GetReal(u23,&(S[63]),7)))
    return Error_ATOM_Unrecognized;

  u11 /= 1.0e4;
  u22 /= 1.0e4;
  u33 /= 1.0e4;
  u12 /= 1.0e4;
  u13 /= 1.0e4;
  u23 /= 1.0e4;

  WhatIsSet |= ASET_Anis_tFac;

  if (WhatIsSet & (ASET_Coordinates | ASET_CoordSigma |
                   ASET_Anis_tFSigma))  
    // something was already submitted. check complience
    return CheckData ( S );
  else  
    // first data submission. just take the data
    GetData ( S );

  return 0;

}

int CAtom::ConvertPDBSIGUIJ ( int ix, cpstr S )  {
//   Gets data from the PDB ASCII SIGUIJ record.
//   This function DOES NOT check the "SIGUIJ" keyword and
// does not decode the chain and residue parameters! These
// must be treated by the calling process, see
// Chain::ConvertPDBASCII().

  index = ix;

  if (WhatIsSet & ASET_Anis_tFSigma)
    return Error_ATOM_AlreadySet;

  if (!(GetReal(su11,&(S[28]),7) &&
        GetReal(su22,&(S[35]),7) &&
        GetReal(su33,&(S[42]),7) &&
        GetReal(su12,&(S[49]),7) &&
        GetReal(su13,&(S[56]),7) &&
        GetReal(su23,&(S[63]),7)))
    return Error_ATOM_Unrecognized;

  su11 /= 1.0e4;
  su22 /= 1.0e4;
  su33 /= 1.0e4;
  su12 /= 1.0e4;
  su13 /= 1.0e4;
  su23 /= 1.0e4;

  WhatIsSet |= ASET_Anis_tFSigma;

  if (WhatIsSet & (ASET_Coordinates | ASET_CoordSigma |
                   ASET_Anis_tFac))  
    // something was already submitted. check complience
    return CheckData ( S );
  else  
    // first data submission. just take the data
    GetData ( S );

  return 0;

}

int CAtom::ConvertPDBTER ( int ix, cpstr S )  {
//   Gets data from the PDB ASCII TER record.
//   This function DOES NOT check the "TER" keyword and
// does not decode the chain and residue parameters! These
// must be treated by the calling process, see
// Chain::ConvertPDBASCII().

  index = ix;

  if (((S[6]>='0') && (S[6]<='9')) || (S[6]==' '))  { 
    //   Although against strict PDB format, 'TER' is
    // actually allowed not to have a serial number.
    // This negative value implies that the number is
    // not set.
    if (!(GetInteger(serNum,&(S[6]),5)))  serNum = -1;
  } else
    hy36decode ( 5,&(S[6]),5,&serNum );

//  if (!(GetInteger(serNum,&(S[6]),5)))  serNum = -1;

  if (WhatIsSet & ASET_Coordinates)
    return Error_ATOM_AlreadySet;

  WhatIsSet |= ASET_Coordinates;
  Het        = False;
  Ter        = True;
  name[0]    = char(0);
  element[0] = char(0);

  return 0;

}


int CAtom::GetModelNum()  {
  if (residue) {
    if (residue->chain)
      if (residue->chain->model)
        return residue->chain->model->GetSerNum();
  }
  return 0;
}

pstr CAtom::GetChainID()  {
  if (residue) {
    if (residue->chain)  return residue->chain->chainID;
  }
  return  pstr("");
}

pstr  CAtom::GetResName()  {
  if (residue)  return residue->name;
          else  return pstr("");
}

int   CAtom::GetAASimilarity ( const ResName resName )  {
  if (residue)  return  ::GetAASimilarity ( pstr(residue->name),
                                            pstr(resName) );
          else  return -3;
}

int   CAtom::GetAASimilarity ( PCAtom A )  {
  if (residue)  {
    if (A->residue)
          return ::GetAASimilarity ( pstr(residue->name),
                                     pstr(A->residue->name) );
    else  return -4;
  } else
    return -3;
}

realtype CAtom::GetAAHydropathy()  {
  if (residue)  return  ::GetAAHydropathy ( pstr(residue->name) );
          else  return  MaxReal;
}

realtype CAtom::GetOccupancy()  {
  if (WhatIsSet & ASET_Occupancy)  return occupancy;
                             else  return 0.0;
}

int   CAtom::GetSeqNum()  {
  if (residue)  return residue->seqNum;
          else  return ATOM_NoSeqNum;
}

pstr  CAtom::GetInsCode()  {
  if (residue)  return residue->insCode;
          else  return pstr("");
}

pstr  CAtom::GetAtomCharge ( pstr chrg )  {
  if (WhatIsSet & ASET_Charge)  sprintf ( chrg,"%+2i",mround(charge) );
                          else  strcpy  ( chrg,"  " );
  return chrg;
}

PCResidue CAtom::GetResidue()  {
  return residue;
}

PCChain  CAtom::GetChain()  {
  if (residue)  return residue->chain;
          else  return NULL;
}

PCModel  CAtom::GetModel()  {
  if (residue)  {
    if (residue->chain)  return (PCModel)residue->chain->model;
  }
  return NULL;
}

int  CAtom::GetResidueNo()  {
  if (residue)  {
    if (residue->chain)
         return  residue->chain->GetResidueNo ( 
                          residue->seqNum,residue->insCode );
    else  return -2;
  } else
    return -1;
}


void * CAtom::GetCoordHierarchy()  {
  if (residue)  return residue->GetCoordHierarchy();
  return NULL;
}


void  CAtom::GetStat ( realtype   v,
                       realtype & v_min, realtype & v_max,
                       realtype & v_m,   realtype & v_m2 )  {
  if (v<v_min)  v_min = v;
  if (v>v_max)  v_max = v;
  v_m  += v;
  v_m2 += v*v;
}

Boolean CAtom::isMetal()  {
  return  ::isMetal ( element );
}

Boolean CAtom::isSolvent()  {
  if (residue)  return  residue->isSolvent();
  return False;
}

Boolean CAtom::isInSelection ( int selHnd )  {
PCMMDBFile manager = (PCMMDBFile)GetCoordHierarchy();
PCMask     Mask;
  if (manager)  {
    Mask = manager->GetSelMask ( selHnd );
    if (Mask)  return CheckMask ( Mask );
  }
  return False;
}

Boolean CAtom::isNTerminus()  {
  if (residue)  return  residue->isNTerminus();
  return False;
}

Boolean CAtom::isCTerminus()  {
  if (residue)  return  residue->isCTerminus();
  return False;
}

void  CAtom::CalcAtomStatistics ( RSAtomStat AS )  {
//   AS must be initialized. The function only accumulates
// the statistics.

  if (!Ter)  {

    AS.nAtoms++;

    if (AS.WhatIsSet & WhatIsSet & ASET_Coordinates)  {
      GetStat ( x,AS.xmin,AS.xmax,AS.xm,AS.xm2 );
      GetStat ( y,AS.ymin,AS.ymax,AS.ym,AS.ym2 );
      GetStat ( z,AS.zmin,AS.zmax,AS.zm,AS.zm2 );
    } else
      AS.WhatIsSet &= ~ASET_Coordinates;

    if (AS.WhatIsSet & WhatIsSet & ASET_Occupancy)
          GetStat(occupancy,AS.occ_min,AS.occ_max,AS.occ_m,AS.occ_m2);
    else  AS.WhatIsSet &= ~ASET_Occupancy;

    if (AS.WhatIsSet & WhatIsSet & ASET_tempFactor)
          GetStat ( tempFactor,AS.tFmin,AS.tFmax,AS.tFm,AS.tFm2 );
    else  AS.WhatIsSet &= ~ASET_tempFactor;

    if (AS.WhatIsSet & WhatIsSet & ASET_Anis_tFac)  {
      GetStat ( u11,AS.u11_min,AS.u11_max,AS.u11_m,AS.u11_m2 );
      GetStat ( u22,AS.u22_min,AS.u22_max,AS.u22_m,AS.u22_m2 );
      GetStat ( u33,AS.u33_min,AS.u33_max,AS.u33_m,AS.u33_m2 );
      GetStat ( u12,AS.u12_min,AS.u12_max,AS.u12_m,AS.u12_m2 );
      GetStat ( u13,AS.u13_min,AS.u13_max,AS.u13_m,AS.u13_m2 );
      GetStat ( u23,AS.u23_min,AS.u23_max,AS.u23_m,AS.u23_m2 );
    } else
      AS.WhatIsSet &= ~ASET_Anis_tFac;

  }

}


realtype CAtom::GetDist2 ( PCAtom a )  {
realtype dx,dy,dz;
  dx = a->x - x;
  dy = a->y - y;
  dz = a->z - z;
  return  dx*dx + dy*dy + dz*dz;
}

realtype CAtom::GetDist2 ( PCAtom a, mat44 & tm )  {
realtype dx,dy,dz;
  dx = tm[0][0]*a->x + tm[0][1]*a->y + tm[0][2]*a->z + tm[0][3] - x;
  dy = tm[1][0]*a->x + tm[1][1]*a->y + tm[1][2]*a->z + tm[1][3] - y;
  dz = tm[2][0]*a->x + tm[2][1]*a->y + tm[2][2]*a->z + tm[2][3] - z;
  return  dx*dx + dy*dy + dz*dz;
}

realtype CAtom::GetDist2 ( PCAtom a, mat33 & r, vect3 & t )  {
realtype dx,dy,dz;
  dx = r[0][0]*a->x + r[0][1]*a->y + r[0][2]*a->z + t[0] - x;
  dy = r[1][0]*a->x + r[1][1]*a->y + r[1][2]*a->z + t[1] - y;
  dz = r[2][0]*a->x + r[2][1]*a->y + r[2][2]*a->z + t[2] - z;
  return  dx*dx + dy*dy + dz*dz;
}

realtype CAtom::GetDist2 ( realtype ax, realtype ay, realtype az )  {
realtype dx,dy,dz;
  dx = ax - x;
  dy = ay - y;
  dz = az - z;
  return  dx*dx + dy*dy + dz*dz;
}

realtype CAtom::GetCosine ( PCAtom a1, PCAtom a2 )  {
// Calculates cosing of angle a1-this-a2, i.e. that between
// bond [a1,this] and [this,a2].
realtype dx1,dy1,dz1, dx2,dy2,dz2,r;

  dx1 = a1->x - x;
  dy1 = a1->y - y;
  dz1 = a1->z - z;
  r   = dx1*dx1 + dy1*dy1 + dz1*dz1;

  dx2 = a2->x - x;
  dy2 = a2->y - y;
  dz2 = a2->z - z;
  r  *= dx2*dx2 + dy2*dy2 + dz2*dz2;

  if (r>0.0)  return (dx1*dx2 + dy1*dy2 + dz1*dz2)/sqrt(r);
        else  return 0.0;

}


void  CAtom::MakeTer()  {
  WhatIsSet |= ASET_Coordinates;
  Het        = False;
  Ter        = True; 
}


void  CAtom::SetAtomName ( const AtomName atomName )  {
  strcpy ( name,atomName );
}


void  CAtom::SetElementName ( const Element elName )  {
  strcpy ( element,elName );
  if (!element[0])  strcpy ( element,"  " );
  else if ((!element[1]) || (element[1]==' '))  {
    element[2] = char(0);
    element[1] = element[0];
    element[0] = ' ';
  }
}

void  CAtom::SetCharge ( cpstr chrg )  {
pstr p;
  charge = strtod ( chrg,&p );
  if (p!=chrg)  WhatIsSet |= ASET_Charge;
}

void  CAtom::SetCharge ( realtype chrg )  {
  if (chrg<MaxReal)  {
    charge = chrg;
    WhatIsSet |= ASET_Charge;
  }
}

void  CAtom::SetAtomIndex ( int ix )  {
// don't use in your applications!
  index = ix;
}

pstr  CAtom::GetAtomID ( pstr AtomID )  {
char  S[50];
  AtomID[0] = char(0);
  if (residue)  {
    if (residue->chain)  {
      if (residue->chain->model)
            sprintf (AtomID,"/%i/",residue->chain->model->GetSerNum());
      else  strcpy  ( AtomID,"/-/" );
      strcat ( AtomID,residue->chain->chainID );
    } else
      strcpy ( AtomID,"/-/-" );
    ParamStr ( AtomID,pstr("/"),residue->seqNum );
    if (residue->name[0])  {
      strcat ( AtomID,"(" );
      strcat ( AtomID,residue->name );
      strcat ( AtomID,")" );
    }
    if (residue->insCode[0])  {
      strcat ( AtomID,"." );
      strcat ( AtomID,residue->insCode );
    }
    strcat ( AtomID,"/" );
  } else
    strcpy ( AtomID,"/-/-/-/" );
  strcpy_css ( S,name );
  if (!S[0])  strcpy ( S,"-" );
  strcat     ( AtomID,S );
  strcpy_css ( S,element );
  if (S[0])  {
    strcat ( AtomID,"[" );
    strcat ( AtomID,S   );
    strcat ( AtomID,"]" );
  }
  if (altLoc[0])  {
    strcat ( AtomID,":" );
    strcat ( AtomID,altLoc );
  }
  return AtomID;
}

pstr  CAtom::GetAtomIDfmt ( pstr AtomID )  {
int  n;
char S[50];
  AtomID[0] = char(0);
  if (residue)  {
    if (residue->chain)  {
      if (residue->chain->model)  {
        n = residue->chain->model->GetNumberOfModels();
	if      (n<10)   strcpy ( S,"/%1i/" );
	else if (n<100)  strcpy ( S,"/%2i/" );
	else if (n<1000) strcpy ( S,"/%3i/" );
                    else strcpy ( S,"/%i/"  );
        sprintf ( AtomID,S,residue->chain->model->GetSerNum() );
      } else
        strcpy  ( AtomID,"/-/" );
      strcat ( AtomID,residue->chain->chainID );
    } else
      strcpy ( AtomID,"/-/-" );
    if ((-999<=residue->seqNum) && (residue->seqNum<=9999))
          sprintf ( S,"/%4i",residue->seqNum );
    else  sprintf ( S,"/%i" ,residue->seqNum );
    strcat  ( AtomID,S );
    sprintf ( S,"(%3s).%1s/",residue->name,residue->insCode );
    strcat  ( AtomID,S );
  } else
    strcpy ( AtomID,"/-/-/----(---).-/" );
  sprintf ( S,"%4s[%2s]:%1s",name,element,altLoc );
  strcat  ( AtomID,S );
  return AtomID;
}
  


int CAtom::ConvertPDBHETATM ( int ix, cpstr S )  {
//   Gets data from the PDB ASCII HETATM record.
//   This function DOES NOT check the "HETATM" keyword and
// does not decode the chain and residue parameters! These
// must be treated by the calling process, see
// Chain::ConvertPDBASCII().
int RC;
  RC  = ConvertPDBATOM ( ix,S );
  Het = True;
  return RC;
}

void CAtom::GetData ( cpstr S )  {
pstr p;

  if (((S[6]>='0') && (S[6]<='9')) || (S[6]==' '))  { 
    //   Here we forgive cards with unreadable serial numbers
    // as we always have index (ix) for the card. For the sake
    // of strict PDB syntax we would have to return
    // Error_UnrecognizedInteger .
    if (!(GetInteger(serNum,&(S[6]),5)))  serNum = -1;
  } else
    hy36decode ( 5,&(S[6]),5,&serNum );

//  if (!(GetInteger(serNum,&(S[6]),5)))  serNum = index;

  altLoc[0] = S[16];
  if (altLoc[0]==' ')  altLoc[0] = char(0);
                 else  altLoc[1] = char(0);
  GetString   ( name   ,&(S[12]),4 );
  strcpy_ncss ( segID  ,&(S[72]),4 );
  GetString   ( element,&(S[76]),2 );
  charge = strtod ( &(S[78]),&p );
  if ((charge!=0.0) && (p!=&(S[78])))
    WhatIsSet |= ASET_Charge;

}

int  CAtom::CheckData ( cpstr S )  {
int      sN;
AltLoc   aloc;
SegID    sID;
Element  elmnt;
pstr     p;
realtype achrg;

  aloc[0] = S[16];
  if (aloc[0]==' ')  aloc[0] = char(0);
               else  aloc[1] = char(0);
  strcpy_ncss ( sID  ,&(S[72]),4 );
  GetString   ( elmnt,&(S[76]),2 );
  if (ignoreCharge)  achrg = charge;
               else  achrg = strtod ( &(S[78]),&p );
  if (!(GetInteger(sN,&(S[6]),5)))  sN = index;
  if (ignoreSegID)  {
    if (segID[0])  strcpy ( sID,segID );
             else  strcpy ( segID,sID );
  }
  if (ignoreElement)  {
    if (element[0])  strcpy ( elmnt,element );
               else  strcpy ( element,elmnt );
  }

  if (ignoreUnmatch)  return 0;

  //   Here we forgive cards with unreadable serial numbers
  // as we always have index (ix) for the card. For the sake
  // of strict PDB syntax we would have to return
  // Error_UnrecognizedInteger .
  if ((sN!=serNum)                  || 
      (strcmp (altLoc ,aloc      )) ||
      (strncmp(name   ,&(S[12]),4)) ||
      (strcmp (segID  ,sID       )) ||
      (strcmp (element,elmnt     )) ||
      (charge!=achrg))  {
    /*
char name1[100];
strncpy ( name1,&(S[12]),4 );  name1[4] = char(0);
    printf ( "\n  serNum   %5i  %5i\n"
             "  residue  '%s' '%s'\n" 
             "  altLoc   '%s' '%s'\n" 
             "  name     '%s' '%s'\n" 
             "  segId    '%s' '%s'\n" 
             "  element  '%s' '%s'\n" 
             "  charge   '%s' '%s'\n",
             sN,serNum, res->name,residue->name,
             altLoc ,aloc,  name,name1,
	     segID  ,sID,
      element,elmnt,
	     charge ,achrg );
    if (res!=residue)  printf (" it's a residue\n" );
    */
    return Error_ATOM_Unmatch;
  }

  return 0;

}


int CAtom::GetCIF ( int ix, PCMMCIFLoop Loop,
                    PCMMCIFLoop LoopAnis )  {
char PDBGroup[30];
int  k;
int  RC;

  index = ix;

  if (WhatIsSet & ASET_Coordinates)
    return Error_ATOM_AlreadySet;

  k = ix-1;
  CIFGetString ( PDBGroup,Loop,CIFTAG_GROUP_PDB,k,
                 sizeof(PDBGroup),pstr("") );

  Ter = !strcmp(PDBGroup,pstr("TER")   );
  Het = !strcmp(PDBGroup,pstr("HETATM"));

  RC = CIFGetInteger1 ( serNum,Loop,CIFTAG_ID,k );
  if (RC)  {
    if (Ter) 
      serNum = -1;
    else if (RC==Error_NoData)
      serNum = index;
    else 
      return RC;
  }

  if (Ter)  {
    Loop->DeleteRow ( k );
    WhatIsSet |= ASET_Coordinates;
    return 0;
  }

  CIFGetString ( name  ,Loop,CIFTAG_LABEL_ATOM_ID,k,
                        sizeof(name)  ,pstr("") );
  CIFGetString ( altLoc,Loop,CIFTAG_LABEL_ALT_ID ,k,
                        sizeof(altLoc),pstr("") );

  RC = CIFGetReal1 ( x,Loop,CIFTAG_CARTN_X,k );
  if (!RC) RC = CIFGetReal1 ( y,Loop,CIFTAG_CARTN_Y,k );
  if (!RC) RC = CIFGetReal1 ( z,Loop,CIFTAG_CARTN_Z,k );
  if (RC)  return Error_ATOM_Unrecognized;
  WhatIsSet |= ASET_Coordinates;

  if (!CIFGetReal1(occupancy,Loop,CIFTAG_OCCUPANCY,k))
    WhatIsSet |= ASET_Occupancy;
  if (!CIFGetReal1(tempFactor,Loop,CIFTAG_B_ISO_OR_EQUIV,k))
    WhatIsSet |= ASET_tempFactor;

  CIFGetString ( segID,Loop,CIFTAG_SEGMENT_ID,k,
                       sizeof(segID) ,pstr("") );
  if (!CIFGetReal1(charge,Loop,CIFTAG_CHARGE,k))
    WhatIsSet |= ASET_Charge;
  RC = CIFGetString ( element,Loop,CIFTAG_TYPE_SYMBOL,k,
                              sizeof(element),pstr("  ") );
  if (RC)
    CIFGetString ( element,Loop,CIFTAG_ATOM_TYPE_SYMBOL,k,
                        sizeof(element),pstr("  ") );
  //  MakePDBAtomName();

  RC = CIFGetReal1 ( sigX,Loop,CIFTAG_CARTN_X_ESD,k );
  if (!RC) RC = CIFGetReal1 ( sigY,Loop,CIFTAG_CARTN_Y_ESD,k );
  if (!RC) RC = CIFGetReal1 ( sigZ,Loop,CIFTAG_CARTN_Z_ESD,k );
  if (RC==Error_UnrecognizedReal)
    return RC;
  if (!RC) WhatIsSet |= ASET_CoordSigma;

  if (!CIFGetReal1(sigOcc,Loop,CIFTAG_OCCUPANCY_ESD,k))
    WhatIsSet |= ASET_OccSigma;
  if (!CIFGetReal1(sigTemp,Loop,CIFTAG_B_ISO_OR_EQUIV_ESD,k))
    WhatIsSet |= ASET_tFacSigma;
  
  Loop->DeleteRow ( k );

  if (LoopAnis)  {

    RC = CIFGetReal1 ( u11,LoopAnis,CIFTAG_U11,k );
    if (!RC) RC = CIFGetReal1 ( u22,LoopAnis,CIFTAG_U22,k );
    if (!RC) RC = CIFGetReal1 ( u33,LoopAnis,CIFTAG_U33,k );
    if (!RC) RC = CIFGetReal1 ( u13,LoopAnis,CIFTAG_U13,k );
    if (!RC) RC = CIFGetReal1 ( u12,LoopAnis,CIFTAG_U12,k );
    if (!RC) RC = CIFGetReal1 ( u23,LoopAnis,CIFTAG_U23,k );
    if (RC==Error_UnrecognizedReal)
      return RC;
    if (!RC) WhatIsSet |= ASET_Anis_tFac;

    RC = CIFGetReal1 ( su11,LoopAnis,CIFTAG_U11_ESD,k );
    if (!RC) RC = CIFGetReal1 ( su22,LoopAnis,CIFTAG_U22_ESD,k );
    if (!RC) RC = CIFGetReal1 ( su33,LoopAnis,CIFTAG_U33_ESD,k );
    if (!RC) RC = CIFGetReal1 ( su13,LoopAnis,CIFTAG_U13_ESD,k );
    if (!RC) RC = CIFGetReal1 ( su12,LoopAnis,CIFTAG_U12_ESD,k );
    if (!RC) RC = CIFGetReal1 ( su23,LoopAnis,CIFTAG_U23_ESD,k );
    if (RC==Error_UnrecognizedReal)
      return RC;
    if (!RC) WhatIsSet |= ASET_Anis_tFSigma;

    LoopAnis->DeleteRow ( k );

  }

  return 0;

}

Boolean CAtom::MakePDBAtomName()  {
int     i,k;
  if (Ter)  {
    name[0]    = char(0);
    element[0] = char(0);
    return False;
  }
  UpperCase ( name    );
  UpperCase ( element );
  if ((element[0]==' ') && (element[1]==' '))  {
    // element name not given, make one from the atom name
    if ((name[0]>='A') && (name[0]<='Z'))  {
      if (!name[1])  {
        name[4] = char(0);
        name[3] = ' ';
        name[2] = ' ';
        name[1] = name[0];
        name[0] = ' ';
      }
      /* the commented part looks like a wrong inheritance
         from FORTRAN RWBrook. Commented on 04.03.2004,
         to be removed.
      else if ((name[0]=='C') && (name[1]=='A'))  {
        name[4] = char(0);
        name[3] = name[2];
        name[2] = name[1];
        name[1] = name[0];
        name[0] = ' ';
      }
      */
      element[0] = name[0];
      element[1] = name[1];
    } else  {
      element[0] = ' ';
      element[1] = name[1];
    }
    element[2] = char(0);
    return False;
  } else if ((name[0]>='A') && (name[0]<='Z'))  {
    if (!element[1])  {
      element[2] = char(0);
      element[1] = element[0];
      element[0] = ' ';
      k = strlen(name);
      if (k<4)  {
        for (i=3;i>0;i--)
          name[i] = name[i-1];
        name[0] = ' ';
        k++;
        while (k<4)
          name[k++] = ' ';
        name[k] = char(0);
      }
    } else if ((element[0]==' ') && (element[1]!=name[1]))  {
      for (i=3;i>0;i--)
        name[i] = name[i-1];
      name[0] = ' ';
      k = strlen(name);
      while (k<4)
        name[k++] = ' ';
      name[k] = char(0);
    }
  }
  return True;
}

void  CAtom::SetCoordinates ( realtype xx,  realtype yy, realtype zz,
                              realtype occ, realtype tFac )  {
  x = xx;
  y = yy;
  z = zz;
  occupancy  = occ;
  tempFactor = tFac;
  WhatIsSet |= ASET_Coordinates | ASET_Occupancy | ASET_tempFactor;
}

void  CAtom::Transform ( mat33 & tm, vect3 & v ) {
realtype  x1,y1,z1;
  x1 = tm[0][0]*x + tm[0][1]*y + tm[0][2]*z + v[0];
  y1 = tm[1][0]*x + tm[1][1]*y + tm[1][2]*z + v[1];
  z1 = tm[2][0]*x + tm[2][1]*y + tm[2][2]*z + v[2];
  x = x1;
  y = y1;
  z = z1;
}

void  CAtom::Transform ( mat44 & tm ) {
realtype  x1,y1,z1;
  x1 = tm[0][0]*x + tm[0][1]*y + tm[0][2]*z + tm[0][3];
  y1 = tm[1][0]*x + tm[1][1]*y + tm[1][2]*z + tm[1][3];
  z1 = tm[2][0]*x + tm[2][1]*y + tm[2][2]*z + tm[2][3];
  x = x1;
  y = y1;
  z = z1;
}

void  CAtom::TransformCopy ( mat44    & tm,
                             realtype & xx,
                             realtype & yy,
                             realtype & zz )  {
  xx = tm[0][0]*x + tm[0][1]*y + tm[0][2]*z + tm[0][3];
  yy = tm[1][0]*x + tm[1][1]*y + tm[1][2]*z + tm[1][3];
  zz = tm[2][0]*x + tm[2][1]*y + tm[2][2]*z + tm[2][3];
}

void  CAtom::TransformSet ( mat44  & tm,
                            realtype xx,
                            realtype yy,
                            realtype zz ) {
  x = tm[0][0]*xx + tm[0][1]*yy + tm[0][2]*zz + tm[0][3];
  y = tm[1][0]*xx + tm[1][1]*yy + tm[1][2]*zz + tm[1][3];
  z = tm[2][0]*xx + tm[2][1]*yy + tm[2][2]*zz + tm[2][3];
}


// -------  user-defined data handlers

int  CAtom::PutUDData ( int UDDhandle, int iudd )  {
  if (UDDhandle & UDRF_ATOM)
        return  CUDData::putUDData ( UDDhandle,iudd );
  else  return  UDDATA_WrongUDRType;
}

int  CAtom::PutUDData ( int UDDhandle, realtype rudd )  {
  if (UDDhandle & UDRF_ATOM)
        return  CUDData::putUDData ( UDDhandle,rudd );
  else  return  UDDATA_WrongUDRType;
}

int  CAtom::PutUDData ( int UDDhandle, cpstr sudd )  {
  if (UDDhandle & UDRF_ATOM)
        return  CUDData::putUDData ( UDDhandle,sudd );
  else  return  UDDATA_WrongUDRType;
}

int  CAtom::GetUDData ( int UDDhandle, int & iudd )  {
  if (UDDhandle & UDRF_ATOM)
        return  CUDData::getUDData ( UDDhandle,iudd );
  else  return  UDDATA_WrongUDRType;
}

int  CAtom::GetUDData ( int UDDhandle, realtype & rudd )  {
  if (UDDhandle & UDRF_ATOM)
        return  CUDData::getUDData ( UDDhandle,rudd );
  else  return  UDDATA_WrongUDRType;
}

int  CAtom::GetUDData ( int UDDhandle, pstr sudd, int maxLen )  {
  if (UDDhandle & UDRF_ATOM)
        return  CUDData::getUDData ( UDDhandle,sudd,maxLen );
  else  return  UDDATA_WrongUDRType;
}

int  CAtom::GetUDData ( int UDDhandle, pstr & sudd )  {
  if (UDDhandle & UDRF_ATOM)
        return  CUDData::getUDData ( UDDhandle,sudd );
  else  return  UDDATA_WrongUDRType;
}


void  CAtom::Copy ( PCAtom atom )  {
// this does not make any references in residues and does
// not change indices!! it does change serial numbers, though.

  serNum     = atom->serNum;
  x          = atom->x;
  y          = atom->y;
  z          = atom->z;
  occupancy  = atom->occupancy;
  tempFactor = atom->tempFactor;
  sigX       = atom->sigX;
  sigY       = atom->sigY;
  sigZ       = atom->sigZ;
  sigOcc     = atom->sigOcc;
  sigTemp    = atom->sigTemp;
  u11        = atom->u11;
  u22        = atom->u22;
  u33        = atom->u33;
  u12        = atom->u12;
  u13        = atom->u13;
  u23        = atom->u23;
  su11       = atom->su11;
  su22       = atom->su22;
  su33       = atom->su33;
  su12       = atom->su12;
  su13       = atom->su13;
  su23       = atom->su23;
  Het        = atom->Het;
  Ter        = atom->Ter;
  WhatIsSet  = atom->WhatIsSet;

  strcpy ( name      ,atom->name       );
  strcpy ( altLoc    ,atom->altLoc     );
  strcpy ( segID     ,atom->segID      );
  strcpy ( element   ,atom->element    );
  strcpy ( energyType,atom->energyType );
  charge = atom->charge;

}

int CAtom::CheckID ( const AtomName aname, const Element elname,
                     const AltLoc aloc )  {
pstr p1,p2;
  if (aname)  {
    if (aname[0]!='*')  {
      p1 = name;
      while (*p1==' ') p1++;
      p2 = pstr(aname);
      while (*p2==' ') p2++;
      while ((*p2) && (*p1) && (*p1!=' ') && (*p2!=' '))  {
        if (*p1!=*p2)  return 0;
        p1++;
        p2++;
      }
      if (*p1!=*p2)  {
        if (((*p1) && (*p1!=' ')) ||
            ((*p2) && (*p2!=' ')))  return 0;
      }
    }
  }
  if (elname)  {
    if (elname[0]!='*')  {
      p1 = element;
      while (*p1==' ')  p1++;
      p2 = pstr(elname);
      while (*p2==' ')  p2++;
      while ((*p2) && (*p1) && (*p1!=' ') && (*p2!=' '))  {
        if (*p1!=*p2)  return 0;
        p1++;
        p2++;
      }
      if (*p1!=*p2)  return 0;
    }
  }
  if (aloc)  {
    if ((aloc[0]!='*') && (strcmp(aloc,altLoc)))   return 0;
  }
  return 1;
}

int CAtom::CheckIDS ( cpstr ID )  {
AtomName aname;
Element  elname;
AltLoc   aloc;
pstr     p;
  p = strrchr ( ID,'/' );
  if (p)  p++;
    else  p = pstr(ID);
  ParseAtomID ( p,aname,elname,aloc );
  return  CheckID ( aname,elname,aloc );
}

void  CAtom::SetShortBinary()  {
  WhatIsSet |= ASET_ShortBinary;
}

void  CAtom::write ( RCFile f )  {
int  i,k;
byte Version=1;
byte nb;

  f.WriteWord ( &WhatIsSet );
  if (WhatIsSet & ASET_ShortBinary)  {
    if (Ter)  WhatIsSet |= ASET_ShortTer;
    if (Het)  WhatIsSet |= ASET_ShortHet;
    f.WriteInt     ( &index        );
    f.WriteTerLine ( name   ,False );
    f.WriteTerLine ( altLoc ,False );
    f.WriteTerLine ( element,False );
    if (WhatIsSet & ASET_Coordinates)  {
      f.WriteFloat ( &x );
      f.WriteFloat ( &y );
      f.WriteFloat ( &z );
    }
    return;
  }

  f.WriteByte  ( &Version );

  CUDData::write ( f );

  f.WriteInt     ( &serNum );
  f.WriteInt     ( &index  );
  f.WriteTerLine ( name      ,False );
  f.WriteTerLine ( altLoc    ,False );
  f.WriteTerLine ( segID     ,False );
  f.WriteTerLine ( element   ,False );
  f.WriteTerLine ( energyType,False );
  f.WriteFloat   ( &charge );
  f.WriteBool    ( &Het    );
  f.WriteBool    ( &Ter    );

  if (WhatIsSet & ASET_Coordinates)  {
    f.WriteFloat ( &x );
    f.WriteFloat ( &y );
    f.WriteFloat ( &z );
    if (WhatIsSet & ASET_Occupancy)
      f.WriteFloat ( &occupancy  );
    if (WhatIsSet & ASET_tempFactor)
      f.WriteFloat ( &tempFactor );
  }

  if (WhatIsSet & ASET_CoordSigma)  {
    f.WriteFloat ( &sigX );
    f.WriteFloat ( &sigY );
    f.WriteFloat ( &sigZ );
    if ((WhatIsSet & ASET_Occupancy) &&
        (WhatIsSet & ASET_OccSigma))
      f.WriteFloat ( &sigOcc );
    if ((WhatIsSet & ASET_tempFactor) &&
        (WhatIsSet & ASET_tFacSigma))
      f.WriteFloat ( &sigTemp ); 
  }

  if (WhatIsSet & ASET_Anis_tFac)  {
    f.WriteFloat ( &u11 );
    f.WriteFloat ( &u22 );
    f.WriteFloat ( &u33 );
    f.WriteFloat ( &u12 );
    f.WriteFloat ( &u13 );
    f.WriteFloat ( &u23 );
    if (WhatIsSet & ASET_Anis_tFSigma)  {
      f.WriteFloat ( &su11 );
      f.WriteFloat ( &su22 );
      f.WriteFloat ( &su33 );
      f.WriteFloat ( &su12 );
      f.WriteFloat ( &su13 );
      f.WriteFloat ( &su23 );
    }
  }

  nb = byte(nBonds & 0x000000FF);
  f.WriteByte ( &nb );
  for (i=0;i<nb;i++)
    if (Bond[i].atom)  {
      f.WriteInt  ( &(Bond[i].atom->index) );
      f.WriteByte ( &(Bond[i].order)       );
    } else  {
      k = -1;
      f.WriteInt  ( &k );
    }

}

void  CAtom::read ( RCFile f ) {
int  i,k;
byte nb,Version;

  FreeMemory();

  f.ReadWord ( &WhatIsSet );
  if (WhatIsSet & ASET_ShortBinary)  {
    f.ReadInt     ( &index        );
    f.ReadTerLine ( name   ,False );
    f.ReadTerLine ( altLoc ,False );
    f.ReadTerLine ( element,False );
    if (WhatIsSet & ASET_Coordinates)  {
      f.ReadFloat ( &x );
      f.ReadFloat ( &y );
      f.ReadFloat ( &z );
    }
    serNum     = index;
    Ter        = WhatIsSet & ASET_ShortTer;
    Het        = WhatIsSet & ASET_ShortHet;
    name   [4] = char(0);
    altLoc [1] = char(0);
    element[2] = char(0);
    segID  [0] = char(0);
    charge     = 0.0;
    WhatIsSet &= ASET_All;
    return;
  }

  f.ReadByte  ( &Version );

  CUDData::read ( f );

  f.ReadInt     ( &serNum );
  f.ReadInt     ( &index  );
  f.ReadTerLine ( name      ,False );
  f.ReadTerLine ( altLoc    ,False );
  f.ReadTerLine ( segID     ,False );
  f.ReadTerLine ( element   ,False );
  f.ReadTerLine ( energyType,False );
  f.ReadFloat   ( &charge );
  f.ReadBool    ( &Het    );
  f.ReadBool    ( &Ter    );

  if (WhatIsSet & ASET_Coordinates)  {
    f.ReadFloat ( &x );
    f.ReadFloat ( &y );
    f.ReadFloat ( &z );
    if (WhatIsSet & ASET_Occupancy)  f.ReadFloat ( &occupancy  );
                               else  occupancy = 0.0;
    if (WhatIsSet & ASET_tempFactor) f.ReadFloat ( &tempFactor );
                               else  tempFactor = 0.0;
  } else  {
    x          = 0.0;
    y          = 0.0;
    z          = 0.0;
    occupancy  = 0.0;
    tempFactor = 0.0;
  }

  if (WhatIsSet & ASET_CoordSigma)  {
    f.ReadFloat ( &sigX );
    f.ReadFloat ( &sigY );
    f.ReadFloat ( &sigZ );
    if ((WhatIsSet & ASET_Occupancy) &&
        (WhatIsSet & ASET_OccSigma))
          f.ReadFloat ( &sigOcc );
    else  sigOcc = 0.0;
    if ((WhatIsSet & ASET_tempFactor) &&
        (WhatIsSet & ASET_tFacSigma))
          f.ReadFloat ( &sigTemp ); 
    else  sigTemp = 0.0;
  } else  {
    sigX    = 0.0;
    sigY    = 0.0;
    sigZ    = 0.0;
    sigOcc  = 0.0;
    sigTemp = 0.0;
  }

  if (WhatIsSet & ASET_Anis_tFac)  {
    f.ReadFloat ( &u11 );
    f.ReadFloat ( &u22 );
    f.ReadFloat ( &u33 );
    f.ReadFloat ( &u12 );
    f.ReadFloat ( &u13 );
    f.ReadFloat ( &u23 );
    if (WhatIsSet & ASET_Anis_tFSigma)  {
      f.ReadFloat ( &su11 );
      f.ReadFloat ( &su22 );
      f.ReadFloat ( &su33 );
      f.ReadFloat ( &su12 );
      f.ReadFloat ( &su13 );
      f.ReadFloat ( &su23 );
    } else  {
      su11 = 0.0;
      su22 = 0.0;
      su33 = 0.0;
      su12 = 0.0;
      su13 = 0.0;
      su23 = 0.0;
    }
  } else  {
    u11  = 0.0;
    u22  = 0.0;
    u33  = 0.0;
    u12  = 0.0;
    u13  = 0.0;
    u23  = 0.0;
    su11 = 0.0;
    su22 = 0.0;
    su33 = 0.0;
    su12 = 0.0;
    su13 = 0.0;
    su23 = 0.0;
  }

  f.ReadByte ( &nb );
  if (nb>0)  {
    Bond = new SAtomBond[nb];
    for (i=0;i<nb;i++)  {
      f.ReadInt  ( &k );
      if (k>0)  f.ReadByte ( &(Bond[i].order) );
          else  Bond[i].order = 0;
      // we place *index* of bonded atom temporary on the place
      // of its pointer, and the pointer will be calculated
      // after CResidue::read calls _setBonds(..).
      memcpy ( &(Bond[i].atom),&k,4 );
    }
  }
  nBonds = nb;
  nBonds = nBonds | (nBonds << 8);

}

void CAtom::_setBonds ( PPCAtom A )  {
int i,k,nb;
  nb = nBonds & 0x000000FF;
  for (i=0;i<nb;i++)  {
    memcpy ( &k,&(Bond[i].atom),4 );
    if (k>0)  Bond[i].atom = A[k];
        else  Bond[i].atom = NULL;
  }
}


MakeFactoryFunctions(CAtom)



//  ===========================  CResidue  ===========================


void  SAtomStat::Init()  {

  nAtoms = 0;

  xmin = MaxReal;   xmax = MinReal;    xm = 0.0;  xm2 = 0.0;
  ymin = MaxReal;   ymax = MinReal;    ym = 0.0;  ym2 = 0.0;
  zmin = MaxReal;   zmax = MinReal;    zm = 0.0;  zm2 = 0.0;

  occ_min = MaxReal;  occ_max = MinReal;  occ_m = 0.0;  occ_m2 = 0.0;
  tFmin   = MaxReal;  tFmax   = MinReal;  tFm   = 0.0;  tFm2   = 0.0;

  u11_min = MaxReal;  u11_max = MinReal;  u11_m = 0.0;  u11_m2 = 0.0;
  u22_min = MaxReal;  u22_max = MinReal;  u22_m = 0.0;  u22_m2 = 0.0;
  u33_min = MaxReal;  u33_max = MinReal;  u33_m = 0.0;  u33_m2 = 0.0;
  u12_min = MaxReal;  u12_max = MinReal;  u12_m = 0.0;  u12_m2 = 0.0;
  u13_min = MaxReal;  u13_max = MinReal;  u13_m = 0.0;  u13_m2 = 0.0;
  u23_min = MaxReal;  u23_max = MinReal;  u23_m = 0.0;  u23_m2 = 0.0;

  WhatIsSet = ASET_All;

  finished = False;

}

void  SAtomStat::Finish()  {
realtype v;

  if (!finished)  {

    finished = True;

    if (nAtoms>0)  {

      v      = nAtoms;

      xm    /= v;    xm2    /= v;
      ym    /= v;    ym2    /= v;
      zm    /= v;    zm2    /= v;

      occ_m /= v;    occ_m2 /= v;
      tFm   /= v;    tFm2   /= v;

      u11_m /= v;    u11_m2 /= v;
      u22_m /= v;    u22_m2 /= v;
      u33_m /= v;    u33_m2 /= v;
      u12_m /= v;    u12_m2 /= v;
      u13_m /= v;    u13_m2 /= v;
      u23_m /= v;    u23_m2 /= v;
    }
  }

}

realtype  SAtomStat::GetMaxSize()  {
realtype  r;
  r = RMax(xmax-xmin,ymax-ymin);
  r = RMax(r,zmax-zmin);
  return RMax(r,0.0);
}


// ----------------------------------------------------------------


CResidue::CResidue() : CUDData()  {
  InitResidue();
}

CResidue::CResidue ( PCChain Chain_Owner ) : CUDData()  {
  InitResidue();
  if (Chain_Owner)
    Chain_Owner->AddResidue ( this );
}

CResidue::CResidue ( PCChain       Chain_Owner,
                     const ResName resName,
                     int           sqNum,
                     const InsCode ins ) : CUDData()  {
  InitResidue();
  seqNum = sqNum;
  strcpy_css ( name,pstr(resName) );
  strcpy_css ( insCode,pstr(ins) );
  if (Chain_Owner)
    Chain_Owner->AddResidue ( this );
}

CResidue::CResidue ( RPCStream Object ) : CUDData(Object)  {
  InitResidue();
}

CResidue::~CResidue()  {
  FreeMemory();
  if (chain)  chain->_ExcludeResidue ( name,seqNum,insCode );
}

void  CResidue::InitResidue()  {
  strcpy ( name,"---"  );  // residue name
  seqNum  = -MaxInt;       // residue sequence number
  strcpy ( insCode,"" );   // residue insertion code
  chain   = NULL;          // reference to chain
  index   = -1;            // undefined index in chain
  nAtoms  = 0;             // number of atoms in the residue
  AtmLen  = 0;             // length of atom array
  atom    = NULL;          // array of atoms
  Exclude = True;
  SSE     = SSE_None;
}

void  CResidue::SetChain ( PCChain Chain_Owner )  {
  chain = Chain_Owner;
}


int  CResidue::GetResidueNo()  {
  if (chain)  return  chain->GetResidueNo ( seqNum,insCode );
        else  return  -1;
}

void CResidue::SetChainID ( const ChainID chID )  {
  if (chain)
    chain->SetChainID ( chID );
}


int  CResidue::GetCenter ( realtype & x, realtype & y,
                           realtype & z )  {
int i,k;
  x = 0.0;
  y = 0.0;
  z = 0.0;
  k = 0;
  for (i=0;i<nAtoms;i++)
    if (atom[i])  {
      if (!atom[i]->Ter)  {
        x += atom[i]->x;
        y += atom[i]->y;
        z += atom[i]->z;
        k++;
      }
    }
  if (k>0)  {
    x /= k;
    y /= k;
    z /= k;
    return 0;
  }
  return 1;
}

void * CResidue::GetCoordHierarchy()  {
  if (chain)  return chain->GetCoordHierarchy();
  return NULL;
}

void  CResidue::GetAltLocations ( int     & nAltLocs, 
                                  PAltLoc & aLoc,
                                  rvector & occupancy,
                                  int     & alflag )  {
int      i,j,k, nal,nal1;
realtype occ1;
Boolean  B;
PAltLoc  aL;
rvector  occ;
bvector  alv;

  aLoc      = NULL;
  occupancy = NULL;
  nAltLocs  = 0;
  alflag    = ALF_NoAltCodes;

  if (nAtoms>0)  {

    // temporary array for altcodes
    aL = new AltLoc[nAtoms];
    // temporary array for occupancies
    GetVectorMemory ( occ,nAtoms,0 );
    // temporary array for checking altcodes
    GetVectorMemory ( alv,nAtoms,0 );
    for (i=0;i<nAtoms;i++)
      alv[i] = False;

    k   = 0;  // counts unique alternation codes
    nal = 0;
    for (i=0;i<nAtoms;i++)
      if (atom[i])  {
        if (!atom[i]->Ter)  {
          // Find if the alternation code of ith atom is
          // a new one.
          B = False;
          for (j=0;(j<k) && (!B);j++)
            B = !strcmp(atom[i]->altLoc,aL[j]);
          if (!B)  {
            // that's a new altcode, get its occupancy
            if (atom[i]->WhatIsSet & ASET_Occupancy)
                 occ[k] = atom[i]->occupancy;
            else occ[k] = -1.0;
            // store new altcode in temporary array
            strcpy ( aL[k],atom[i]->altLoc );
            // check consistency of the altcode data if:
            //   a) the data was not found wrong so far
            //   b) this atom name has not been checked before
            //   c) altcode is not the "empty"-altcode
            if ((!(alflag & ALF_Mess)) && (!alv[i]) && 
                (atom[i]->altLoc[0]))  {
              B    = False; // will be set True if "empty"-altcode
                            // is found for current atom name
              nal1 = 0;     // counts the number of different altcodes
                            // for current atom name
              occ1 = 0.0;   // will count the sum of occupancies for
                            // current atom name
              for (j=0;j<nAtoms;j++)
                if (atom[j])  {
                  if ((!atom[j]->Ter) && 
                      (!strcmp(atom[j]->name,atom[i]->name)))  {
                    if (atom[j]->WhatIsSet & ASET_Occupancy)
                      occ1 += atom[j]->occupancy;
                    if (!atom[j]->altLoc[0])  B = True;
                    alv[j] = True;  // mark it as "checked"
                    nal1++;
                  }
                }
              if (!(alflag & (ALF_EmptyAltLoc | ALF_NoEmptyAltLoc)))  {
                if (B)  alflag |= ALF_EmptyAltLoc;
                  else  alflag |= ALF_NoEmptyAltLoc;
              } else if (((alflag & ALF_EmptyAltLoc) && (!B)) ||
                         ((alflag & ALF_NoEmptyAltLoc) && (B)))
                alflag |= ALF_Mess;
              if ((occ[k]>=0) && (fabs(1.0-occ1)>0.01))
                alflag |= ALF_Occupancy;
              if (nal==0)    // first time just remember the number
                nal = nal1;  // of different altcodes
              else if (nal!=nal1)   // check if number of different altcodes
                alflag |= ALF_Mess; // is not the same through the residue
            }
            k++;
          }
        }
      }
    if (k>0)  {
      aLoc = new AltLoc[k];
      GetVectorMemory ( occupancy,k,0 );
      for (i=0;i<k;i++) {
        strcpy ( aLoc[i],aL[i] );
        occupancy[i] = occ[i];
      }
      nAltLocs = k;
    }

    delete[] aL;
    FreeVectorMemory ( occ,0 );
    FreeVectorMemory ( alv,0 );

  }

}

int CResidue::GetNofAltLocations() {
int     i,j,k;
Boolean B;
  k = 0;
  for (i=0;i<nAtoms;i++)
    if (atom[i])  {
      if (!atom[i]->Ter)  {
        B = False;
        for (j=0;(j<i) && (!B);j++)
          if (atom[j])  {
            if (!atom[j]->Ter)
              B = !strcmp(atom[i]->altLoc,atom[j]->altLoc);
          }
        if (!B)  k++;
      }
    }
  return k;
}

void  CResidue::SetResID ( const ResName resName, int sqNum,
                           const InsCode ins )  {
  strcpy_css ( name,pstr(resName) );
  seqNum = sqNum;
  strcpy_css ( insCode,pstr(ins) );
}

void  CResidue::FreeMemory()  {
//   NOTE: individual atoms are disposed here as well!
  DeleteAllAtoms();
  if (atom)  delete[] atom;
  atom   = NULL;
  nAtoms = 0;
  AtmLen = 0;
}

void CResidue::ExpandAtomArray ( int nAdd )  {
int     i;
PPCAtom atom1;
  AtmLen += abs(nAdd);
  atom1   = new PCAtom[AtmLen];
  for (i=0;i<nAtoms;i++)
    atom1[i] = atom[i];
  for (i=nAtoms;i<AtmLen;i++)
    atom1[i] = NULL;
  if (atom)  delete[] atom;
  atom = atom1;
}

int  CResidue::_AddAtom ( PCAtom atm )  {
// Adds atom to the residue
int i;
  for (i=0;i<nAtoms;i++)
    if (atom[i]==atm)  return -i;  // this atom is already there
  if (nAtoms>=AtmLen)
    ExpandAtomArray ( nAtoms+10-AtmLen );
  atom[nAtoms] = atm;
  atom[nAtoms]->residue = this;
  nAtoms++;
  return 0;
}

int  CResidue::AddAtom ( PCAtom atm )  {
//   AddAtom(..) adds atom to the residue. If residue is associated
// with a coordinate hierarchy, and atom 'atm' is not, the latter
// is checked in automatically. If atom 'atm' belongs to any
// coordinate hierarchy (even though that of the residue), it is
// *copied* rather than simply taken over, and is checked in.
//   If residue is not associated with a coordinate hierarchy, all
// added atoms will be checked in automatically once the residue
// is checked in.
PCMMDBFile manager;
PCResidue  res;
int        i;

  for (i=0;i<nAtoms;i++)
    if (atom[i]==atm)  return -i;  // this atom is already there

  if (nAtoms>=AtmLen)
    ExpandAtomArray ( nAtoms+10-AtmLen );

  if (atm->GetCoordHierarchy()) {
    atom[nAtoms] = newCAtom();
    atom[nAtoms]->Copy ( atm );
  } else  {
    res = atm->GetResidue();
    if (res)
      for (i=0;i<res->nAtoms;i++)
        if (res->atom[i]==atm)  {
          res->atom[i] = NULL;
          break;
        }
    atom[nAtoms] = atm;
  }

  atom[nAtoms]->residue = this;
  manager = PCMMDBFile(GetCoordHierarchy());
  if (manager)
    manager->CheckInAtom ( 0,atom[nAtoms] );

  nAtoms++;

  return nAtoms;

}

int  CResidue::InsertAtom ( PCAtom atm, int position )  {
//   InsertAtom(..) inserts atom into the specified position of
// the residue. If residue is associated with a coordinate hierarchy,
// and atom 'atm' is not, the latter is checked in automatically.
// If atom 'atm' belongs to any coordinate hierarchy (even though
// that of the residue), it is *copied* rather than simply taken
// over, and is checked in.
//   If residue is not associated with a coordinate hierarchy, all
// added atoms will be checked in automatically once the residue
// is checked in.
PCMMDBFile manager;
PCResidue  res;
int        i,pos;

  for (i=0;i<nAtoms;i++)
    if (atom[i]==atm)  return -i;  // this atom is already there

  if (nAtoms>=AtmLen)
    ExpandAtomArray ( nAtoms+10-AtmLen );

  pos = IMin(position,nAtoms);
  for (i=nAtoms;i>pos;i--)
    atom[i] = atom[i-1];

  if (atm->GetCoordHierarchy()) {
    atom[pos] = newCAtom();
    atom[pos]->Copy ( atm );
  } else  {
    res = atm->GetResidue();
    if (res)
      for (i=0;i<res->nAtoms;i++)
        if (res->atom[i]==atm)  {
          res->atom[i] = NULL;
          break;
        }
    atom[pos] = atm;
  }

  atom[pos]->residue = this;
  manager = PCMMDBFile(GetCoordHierarchy());
  if (manager)
    manager->CheckInAtom ( 0,atom[pos] );

  nAtoms++;

  return nAtoms;

}

int  CResidue::InsertAtom ( PCAtom atm, const AtomName aname )  {
//   This version inserts before the atom with given name. If such
// name is not found, the atom is appended to the end.
int i;
  i = 0;
  while (i<nAtoms)
    if (!atom[i])  i++;
    else if (!strcmp(aname,atom[i]->name))  break;
    else i++;
  return InsertAtom ( atm,i );
}


void  CResidue::CheckInAtoms()  {
PCMMDBFile manager;
int        i;
  manager = PCMMDBFile(GetCoordHierarchy());
  if (manager)
    for (i=0;i<nAtoms;i++)
      if (atom[i])  {
        if (atom[i]->index<0)
          manager->CheckInAtom ( 0,atom[i] );
      }
}


int  CResidue::_ExcludeAtom ( int kndex )  {
//  deletes atom from the residue
int  i,k;

  if (!Exclude)  return 0;

  k = -1;
  for (i=0;(i<nAtoms) && (k<0);i++)
    if (atom[i])  {
      if (atom[i]->index==kndex)  k = i;
    }

  if (k>=0)  {
    for (i=k+1;i<nAtoms;i++)
      atom[i-1] = atom[i];
    nAtoms--;
  }

  if (nAtoms<=0)  return 1;
            else  return 0;

}


void  CResidue::PDBASCIIAtomDump ( RCFile f )  {
int i;
  for (i=0;i<nAtoms;i++)
    if (atom[i])
      atom[i]->PDBASCIIDump ( f );
}

void  CResidue::MakeAtomCIF ( PCMMCIFData CIF )  {
int i;
  for (i=0;i<nAtoms;i++)
    if (atom[i])
      atom[i]->MakeCIF ( CIF );
}


void  CResidue::Copy ( PCResidue res )  {
//
//  Modify CResidue::Copy and both CResidues::_copy methods
//  simultaneously!
//
//  This function will nake a copy of residue res in 'this' one.
//  All atoms are copied, none is moved regardless to the association
//  with coordinate hierarchy. If 'this' residue is associated with
//  a coordinate hierarchy, all atoms are checked in.
PCMMDBFile manager;
int        i;

  FreeMemory();

  seqNum = res->seqNum;
  index  = res->index;
  AtmLen = res->nAtoms;
  strcpy ( name   ,res->name    );
  strcpy ( insCode,res->insCode );
  SSE    = res->SSE;

  if (AtmLen>0)  {
    atom   = new PCAtom[AtmLen];
    nAtoms = 0;
    for (i=0;i<res->nAtoms;i++)
      if (res->atom[i])  {
        atom[nAtoms] = newCAtom();
        atom[nAtoms]->Copy ( res->atom[i] );
        atom[nAtoms]->SetResidue ( this );
        nAtoms++;
      }
    for (i=nAtoms;i<AtmLen;i++)
      atom[i] = NULL;
    manager = PCMMDBFile(GetCoordHierarchy());
    if (manager)
      manager->CheckInAtoms ( 0,atom,nAtoms );
  }

}


void  CResidue::_copy ( PCResidue res )  {
//  Modify both CResidue::_copy and CResidue::Copy methods
//  simultaneously!
//
//  will work properly only if atomic arrays
//  this->chain->model->GetAtom() and
//  res->chain->model->GetAtom() are identical
//
int     i;
PPCAtom A;

  FreeMemory();

  seqNum = res->seqNum;
  index  = res->index;
  nAtoms = res->nAtoms;
  strcpy ( name   ,res->name    );
  strcpy ( insCode,res->insCode );
  SSE    = res->SSE;

  AtmLen = nAtoms;
  A      = NULL;
  if (chain)  {
    if (chain->model)
      A = chain->model->GetAllAtoms();
  }
  if ((nAtoms>0) && (A))  {
    atom = new PCAtom[nAtoms];
    for (i=0;i<nAtoms;i++)  {
      atom[i] = A[res->atom[i]->index-1];
      atom[i]->SetResidue ( this );
    }
  } else  {
    nAtoms = 0;
    AtmLen = 0;
  }

}

void  CResidue::_copy ( PCResidue res, PPCAtom atm,
                        int & atom_index )  {
//  modify both CResidue::_copy and CResidue::Copy methods
// simultaneously!
//
//  This function physically copies the atoms, creating new atom
// instances and putting them into array 'atm' sequentially from
// 'atom_index' position. 'atom_index' is modified (advanced).
//
int i;

  FreeMemory();

  seqNum = res->seqNum;
  index  = res->index;
  nAtoms = res->nAtoms;
  strcpy ( name   ,res->name    );
  strcpy ( insCode,res->insCode );
  SSE    = res->SSE;

  AtmLen = nAtoms;
  if (AtmLen>0)  {
    atom = new PCAtom[AtmLen];
    for (i=0;i<nAtoms;i++)
      if (res->atom[i])  {
        if (!atm[atom_index])  atm[atom_index] = newCAtom();
        atm[atom_index]->Copy ( res->atom[i] );
        atm[atom_index]->residue = this;
        atm[atom_index]->index = atom_index+1;
        atom[i] = atm[atom_index];
        atom_index++;
      } else
        atom[i] = NULL;
  }
  
}


void  CResidue::GetAtomStatistics ( RSAtomStat AS )  {
  AS.Init();
  CalcAtomStatistics ( AS );
  AS.Finish();
}

void  CResidue::CalcAtomStatistics ( RSAtomStat AS )  {
//   AS must be initialized. The function only accumulates
// the statistics.
int i;
  for (i=0;i<nAtoms;i++)
    if (atom[i])
      atom[i]->CalcAtomStatistics ( AS );
}


PCChain  CResidue::GetChain()  {
  return chain;
}

PCModel  CResidue::GetModel()  {
  if (chain) return (PCModel)chain->model;
        else return NULL;
}


int CResidue::GetModelNum()  {
  if (chain)  {
    if (chain->model)
      return chain->model->GetSerNum();
  }
  return 0;
}

pstr CResidue::GetChainID()  {
  if (chain)  return chain->chainID;
  return  pstr("");
}

pstr  CResidue::GetResName()  {
  return name;
}

int   CResidue::GetAASimilarity ( const ResName resName )  {
  return  ::GetAASimilarity ( pstr(name),pstr(resName) );
}

int   CResidue::GetAASimilarity ( PCResidue res )  {
  return  ::GetAASimilarity ( name,res->name );
}

realtype CResidue::GetAAHydropathy()  {
  return  ::GetAAHydropathy ( name );
}

void  CResidue::SetResName ( const ResName resName )  {
  strcpy ( name,resName );
}

int   CResidue::GetSeqNum()  {
  return seqNum;
}

pstr  CResidue::GetInsCode()  {
  return insCode;
}

Boolean CResidue::isAminoacid ()  {
  return ::isAminoacid ( name );
}

Boolean CResidue::isNucleotide()  {
  return ::isNucleotide ( name );
}

int CResidue::isDNARNA()  {
  return ::isDNARNA ( name );
}

Boolean CResidue::isSugar()  {
  return ::isSugar ( name );
}

Boolean CResidue::isSolvent()  {
  return ::isSolvent ( name );
}

Boolean CResidue::isModRes()  {
PCChain  chn;
PCModRes modRes;
int      nModRes,i;
  chn = GetChain();
  if (chn)  {
    nModRes = chn->GetNofModResidues();
    for (i=0;i<nModRes;i++)  {
      modRes = chn->GetModResidue ( i );
      if (modRes)  {
        if ((!strcmp(modRes->resName,name)) &&
            (modRes->seqNum==seqNum)     &&
            (!strcmp(modRes->insCode,insCode)))
          return True;
      }
    }

  }
  return False;
}

Boolean CResidue::isInSelection ( int selHnd )  {
PCMMDBFile manager = (PCMMDBFile)GetCoordHierarchy();
PCMask     Mask;
  if (manager)  {
    Mask = manager->GetSelMask ( selHnd );
    if (Mask)  return CheckMask ( Mask );
  }
  return False;
}


Boolean CResidue::isNTerminus()  {
PPCResidue Res;
int        i,j,nRes;
  if (chain)  {
    chain->GetResidueTable ( Res,nRes );
    i = 0;
    j = -1;
    while ((i<nRes) && (j<0))  {
      if (Res[i])  j = i;
      i++;
    }
    if (j>=0)
      return (Res[j]->index==index);
  }
  return False;
}

Boolean CResidue::isCTerminus()  {
PPCResidue Res;
int        i,j,nRes;
  if (chain)  {
    chain->GetResidueTable ( Res,nRes );
    i = nRes-1;
    j = -1;
    while ((i>=0) && (j<0))  {
      if (Res[i])  j = i;
      i--;
    }
    if (j>=0)
      return (Res[j]->index==index);
  }
  return False;
}


pstr  CResidue::GetResidueID ( pstr ResidueID )  {
  ResidueID[0] = char(0);
  if (chain)  {
    if (chain->model)
          sprintf ( ResidueID,"/%i/",chain->model->GetSerNum() );
    else  strcpy  ( ResidueID,"/-/" );
    strcat ( ResidueID,chain->chainID );
  } else
    strcpy ( ResidueID,"/-/-" );
  ParamStr ( ResidueID,pstr("/"),seqNum );
  strcat ( ResidueID,"(" );
  strcat ( ResidueID,name );
  strcat ( ResidueID,")" );
  if (insCode[0])  {
    strcat ( ResidueID,"." );
    strcat ( ResidueID,insCode );
  }
  return ResidueID;
}


int CResidue::CheckID ( int * snum,
                        const InsCode inscode,
                        const ResName resname )  {
  if (snum)  {
    if (*snum!=seqNum)  return 0;
  }
  if (inscode)  {
    if ((inscode[0]!='*') && (strcmp(inscode,insCode)))  return 0;
  }
  if (!resname)        return 1;
  if ((resname[0]!='*') && (strcmp(resname,name))) return 0;
  return 1;
}

int CResidue::CheckIDS ( cpstr CID )  {
ChainID  chn;
InsCode  inscode;
ResName  resname;
AtomName atm;
Element  elm;
AltLoc   aloc;
pstr     p1,p2;
int      mdl,sn,rc;

  rc = ParseAtomPath ( CID,mdl,chn,sn,inscode,resname,
                       atm,elm,aloc,NULL );
 //  rc = ParseResID ( CID,sn,inscode,resname );

  if (rc>=0)  {
    p1 = NULL;
    p2 = NULL;
    if (inscode[0]!='*')  p1 = inscode;
    if (resname[0]!='*')  p2 = resname;
    if (!rc)  return  CheckID ( &sn ,p1,p2 );
        else  return  CheckID ( NULL,p1,p2 );
  }
  return 0;

}


//  --------------------  Extracting atoms  -------------------------

int  CResidue::GetNumberOfAtoms()  {
  return nAtoms;
}

int  CResidue::GetNumberOfAtoms ( Boolean countTers )  {
int i,na;
  na = 0;
  for (i=0;i<nAtoms;i++)
    if (atom[i])  {
      if (countTers || (!atom[i]->Ter))  na++;
    }
  return na;
}

PCAtom CResidue::GetAtom ( const AtomName aname,
                           const Element  elname,
                           const AltLoc   aloc )  {
int i;
  for (i=0;i<nAtoms;i++)
    if (atom[i])  {
      if (atom[i]->CheckID(aname,elname,aloc))
        return atom[i];
    }
  return NULL;
}

PCAtom CResidue::GetAtom ( int atomNo )  {
  if ((0<=atomNo) && (atomNo<nAtoms))
    return atom[atomNo];
  return NULL;
}

void CResidue::GetAtomTable ( PPCAtom & atomTable, int & NumberOfAtoms )  {
  atomTable     = atom;
  NumberOfAtoms = nAtoms;
}

void CResidue::GetAtomTable1 ( PPCAtom & atomTable, int & NumberOfAtoms )  {
int i,j;
  if (atomTable)  delete[] atomTable;
  if (nAtoms>0)  {
    atomTable = new PCAtom[nAtoms];
    j = 0;
    for (i=0;i<nAtoms;i++)
      if (atom[i])  {
        if (!atom[i]->Ter)
          atomTable[j++] = atom[i];
      }
    NumberOfAtoms = j;
  } else  {
    atomTable     = NULL;
    NumberOfAtoms = 0;
  }
}

void CResidue::TrimAtomTable()  {
int i,j;
  j = 0;
  for (i=0;i<nAtoms;i++)
    if (atom[i])  {
      if (j<i)  {
        atom[j] = atom[i];
        atom[i] = NULL;
      }
      j++;
    }
  nAtoms = j;
}


//  ---------------------  Deleting atoms  --------------------------

int CResidue::DeleteAtom ( const AtomName aname,
                           const Element  elname,
                           const AltLoc   aloc )  {
// apply CMMDBFile::FinishStructEdit() after all editings are done!
// returns number of deleted atoms
int     i,k,nA,kndex;
PPCAtom A;

  A  = NULL;
  nA = 0;
  if (chain)  {
    if (chain->model)  {
      A  = chain->model->GetAllAtoms();
      nA = chain->model->GetNumberOfAllAtoms();
    }
  }

  k = 0;
  for (i=0;i<nAtoms;i++)
    if (atom[i])  {
      if (atom[i]->CheckID(aname,elname,aloc))  {
        k++;
        kndex = atom[i]->index;
        if ((0<kndex) && (kndex<=nA))   A[kndex-1] = NULL;
        Exclude = False;
        delete atom[i];
        atom[i] = NULL;
        Exclude = True;
      }
    }

  return k;

}

int CResidue::DeleteAtom ( int atomNo )  {
// apply CMMDBFile::FinishStructEdit() after all editings are done!
// returns number of deleted atoms
int     kndex,nA;
PPCAtom A;

  if ((0<=atomNo) && (atomNo<nAtoms))  {
    if (atom[atomNo])  {
      A  = NULL;
      nA = 0;
      if (chain)  {
        if (chain->model)  {
          A  = chain->model->GetAllAtoms();
          nA = chain->model->GetNumberOfAllAtoms();
        }
      }
      kndex = atom[atomNo]->index;
      if ((0<kndex) && (kndex<=nA))   A[kndex-1] = NULL;
      Exclude = False;
      delete atom[atomNo];
      atom[atomNo] = NULL;
      Exclude = True;
      return 1;
    }
  }

  return 0;

}


int  CResidue::DeleteAllAtoms()  {
int     i,k,nA,kndex;
PPCAtom A;

  Exclude = False;

  A  = NULL;
  nA = 0;
  if (chain)  {
    if (chain->model)  {
      A  = chain->model->GetAllAtoms();
      nA = chain->model->GetNumberOfAllAtoms();
    }
  }

  k = 0;
  for (i=0;i<nAtoms;i++)
    if (atom[i])  {
      k++;
      kndex = atom[i]->index;
      if ((0<kndex) && (kndex<=nA))  A[kndex-1] = NULL;
      delete atom[i];
      atom[i] = NULL;
    }
  nAtoms  = 0;

  Exclude = True;

  return k;

}


int CResidue::DeleteAltLocs()  {
//   This function leaves only alternative location with maximal
// occupancy, if those are equal or unspecified, the one with
// "least" alternative location indicator.
//   The function returns the number of deleted atoms. The atom
// table remains untrimmed, so that nAtoms are wrong until that
// is done. Tables are trimmed by FinishStructEdit() or
// explicitely.
PPCAtom  A;
AtomName aname;
AltLoc   aLoc,aL;
realtype occupancy,occ;
int      nA,i,i1,i2,j,k,n,kndex;

  A  = NULL;
  nA = 0;
  if (chain)  {
    if (chain->model)  {
      A  = chain->model->GetAllAtoms();
      nA = chain->model->GetNumberOfAllAtoms();
    }
  }
  Exclude = False;

  n = 0;
  for (i=0;i<nAtoms;i++)

    if (atom[i])  {
      if (!atom[i]->Ter)  {
        occupancy = atom[i]->GetOccupancy();
        strcpy ( aname,atom[i]->name );
        strcpy ( aLoc ,atom[i]->altLoc );
        i1 = -1;
        i2 = i;
        k  = 0;
        for (j=i+1;j<nAtoms;j++)
          if (atom[j])  {
            if ((!atom[j]->Ter) && (!strcmp(atom[j]->name,aname)))  {
              k++;
              occ = atom[j]->GetOccupancy();
              if (occ>occupancy)  {
                occupancy = occ;
                i1 = j;
              }
              if (aLoc[0])  {
                strcpy ( aL,atom[j]->altLoc );
                if (!aL[0])  {
                  aLoc[0] = char(0);
                  i2 = j;
                } else if (strcmp(aL,aLoc)<0)  {
                  strcpy ( aLoc,aL );
                  i2 = j;
                }
              }
            }
          }
        if (k>0)  {
          if (i1<0)  {
            if (atom[i]->WhatIsSet & ASET_Occupancy)  i1 = i;
                                                else  i1 = i2;
          }
          for (j=i;j<nAtoms;j++)
            if ((j!=i1) && atom[j])  {
              if ((!atom[j]->Ter) && (!strcmp(atom[j]->name,aname)))  {
                n++;
                kndex = atom[j]->index;
                if ((0<kndex) && (kndex<=nA))  A[kndex-1] = NULL;
                delete atom[j];
                atom[j] = NULL;
              }
            }
        }
      }
    }

  Exclude = True;

  return n;

}

void  CResidue::ApplyTransform ( mat44 & TMatrix )  {
// transforms all coordinates by multiplying with matrix TMatrix
int i;
  for (i=0;i<nAtoms;i++)
    if (atom[i])  {
      if (!atom[i]->Ter)
        atom[i]->Transform ( TMatrix );
    }
}



//  -----------------------------------------------------------------


void  CResidue::MaskAtoms ( PCMask Mask )  {
int i;
  for (i=0;i<nAtoms;i++)
     if (atom[i])  atom[i]->SetMask ( Mask );
}

void  CResidue::UnmaskAtoms ( PCMask Mask )  {
int i;
  for (i=0;i<nAtoms;i++)
     if (atom[i])  atom[i]->RemoveMask ( Mask );
}



// -------  user-defined data handlers

int  CResidue::PutUDData ( int UDDhandle, int iudd )  {
  if (UDDhandle & UDRF_RESIDUE)
        return  CUDData::putUDData ( UDDhandle,iudd );
  else  return  UDDATA_WrongUDRType;
}

int  CResidue::PutUDData ( int UDDhandle, realtype rudd )  {
  if (UDDhandle & UDRF_RESIDUE)
        return  CUDData::putUDData ( UDDhandle,rudd );
  else  return  UDDATA_WrongUDRType;
}

int  CResidue::PutUDData ( int UDDhandle, cpstr sudd )  {
  if (UDDhandle & UDRF_RESIDUE)
        return  CUDData::putUDData ( UDDhandle,sudd );
  else  return  UDDATA_WrongUDRType;
}

int  CResidue::GetUDData ( int UDDhandle, int & iudd )  {
  if (UDDhandle & UDRF_RESIDUE)
        return  CUDData::getUDData ( UDDhandle,iudd );
  else  return  UDDATA_WrongUDRType;
}

int  CResidue::GetUDData ( int UDDhandle, realtype & rudd )  {
  if (UDDhandle & UDRF_RESIDUE)
        return  CUDData::getUDData ( UDDhandle,rudd );
  else  return  UDDATA_WrongUDRType;
}

int  CResidue::GetUDData ( int UDDhandle, pstr sudd, int maxLen )  {
  if (UDDhandle & UDRF_RESIDUE)
        return  CUDData::getUDData ( UDDhandle,sudd,maxLen );
  else  return  UDDATA_WrongUDRType;
}

int  CResidue::GetUDData ( int UDDhandle, pstr & sudd )  {
  if (UDDhandle & UDRF_RESIDUE)
        return  CUDData::getUDData ( UDDhandle,sudd );
  else  return  UDDATA_WrongUDRType;
}


/*  commented on 18.03.2004,  to be deleted

realtype  BondAngle ( PCAtom A, PCAtom B, PCAtom C )  {
realtype abx,aby,abz;
realtype acx,acy,acz;
realtype bcx,bcy,bcz;
realtype absq,acsq,bcsq;

  abx = B->x - A->x;
  aby = B->y - A->y;
  abz = B->z - A->z;

  acx = A->x - C->x;
  acy = A->y - C->y;
  acz = A->z - C->z;

  bcx = C->x - B->x;
  bcy = C->y - B->y;
  bcz = C->z - B->z;

  absq = abx*abx + aby*aby + abz*abz;
  acsq = acx*acx + acy*acy + acz*acz;
  bcsq = bcx*bcx + bcy*bcy + bcz*bcz;

  return  acos ( (bcsq + absq - acsq)/(2.0*sqrt(bcsq*absq)) );

}

#define  NOmaxdist2   12.25

Boolean CResidue::isMainchainHBond ( PCResidue res ) {
//  Test if there is main chain Hbond between PCRes1 (donor) and
//  PCRes2 (acceptor).
//  As defined Kabsch & Sanders
//  This probably need the option of supporting alternative criteria
PCAtom   NAtom,OAtom,CAtom;
realtype dx,dy,dz;

  NAtom = GetAtom      ( "N" );
  OAtom = res->GetAtom ( "O" );
  CAtom = res->GetAtom ( "C" );

  if (NAtom && OAtom && CAtom)  {
     dx = fabs ( NAtom->x - OAtom->x );
     dy = fabs ( NAtom->y - OAtom->y );
     dz = fabs ( NAtom->z - OAtom->z );
     return ((dx*dx+dy*dy+dz*dz<=NOmaxdist2) &&
             (BondAngle(NAtom,OAtom,CAtom)>=Pi/2.0));
  }

  return  False;

}

*/


#define  NOmaxdist2   12.25

Boolean CResidue::isMainchainHBond ( PCResidue res ) {
//  Test if there is main chain Hbond between PCRes1 (donor) and
//  PCRes2 (acceptor).
//  As defined Kabsch & Sanders
//  This probably needs the option of supporting alternative criteria
PCAtom   NAtom,OAtom,CAtom;
realtype abx,aby,abz;
realtype acx,acy,acz;
realtype bcx,bcy,bcz;
realtype absq,acsq,bcsq;

  NAtom = GetAtom      ( "N" );
  OAtom = res->GetAtom ( "O" );
  CAtom = res->GetAtom ( "C" );

  if (NAtom && OAtom && CAtom)  {

    abx = OAtom->x - NAtom->x;
    aby = OAtom->y - NAtom->y;
    abz = OAtom->z - NAtom->z;
    absq = abx*abx + aby*aby + abz*abz;


    if (absq<=NOmaxdist2)  {

      acx = NAtom->x - CAtom->x;
      acy = NAtom->y - CAtom->y;
      acz = NAtom->z - CAtom->z;

      bcx = CAtom->x - OAtom->x;
      bcy = CAtom->y - OAtom->y;
      bcz = CAtom->z - OAtom->z;

      acsq = acx*acx + acy*acy + acz*acz;
      bcsq = bcx*bcx + bcy*bcy + bcz*bcz;

      return (acos((bcsq+absq-acsq)/(2.0*sqrt(bcsq*absq)))>=Pi/2.0);

    }

  }

  return  False;

}

    
void  CResidue::write ( RCFile f )  {
int  i;
byte Version=1;

  CUDData::write ( f );

  f.WriteByte    ( &Version );
  f.WriteInt     ( &seqNum  );
  f.WriteInt     ( &index   );
  f.WriteInt     ( &nAtoms  );
  f.WriteByte    ( &SSE     );
  f.WriteTerLine ( name   ,False );
  f.WriteTerLine ( insCode,False );
  for (i=0;i<nAtoms;i++)
    f.WriteInt ( &(atom[i]->index) );

}

void  CResidue::read ( RCFile f ) {
//   IMPORTANT: array Atom in CMMDBFile class should be
// read prior calling this function!
PPCAtom A;
int     i,k;
byte    Version;

  FreeMemory ();

  CUDData::read ( f );

  f.ReadByte    ( &Version );
  f.ReadInt     ( &seqNum  );
  f.ReadInt     ( &index   );
  f.ReadInt     ( &nAtoms  );
  f.ReadByte    ( &SSE     );
  f.ReadTerLine ( name   ,False );
  f.ReadTerLine ( insCode,False );
  AtmLen = nAtoms;
  A      = NULL;
  if (chain) {
    if (chain->model)
      A = chain->model->GetAllAtoms();
  }
  if ((nAtoms>0) && (A))  {
    atom = new PCAtom[nAtoms];
    for (i=0;i<nAtoms;i++)  {
      f.ReadInt ( &k );
      atom[i] = A[k-1];
      atom[i]->SetResidue ( this );
      atom[i]->_setBonds  ( A );
    }
  } else  {
    for (i=0;i<nAtoms;i++)
      f.ReadInt ( &k );
    nAtoms = 0;
    AtmLen = 0;
  }
}


MakeFactoryFunctions(CResidue)

