//  $Id: mmdb_rwbrook.cpp,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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
//    28.07.06   <--  Date of Last Modification.
//                   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//  -----------------------------------------------------------------
//
//  **** Module  :   MMDB_RWBrook  <implementation>
//       ~~~~~~~~~
//  **** Project :   MacroMolecular Data Base (MMDB)
//       ~~~~~~~~~
//  **** Classes :   CChannel     ( I/O unit class                  )
//       ~~~~~~~~~
//  **** Functions : mmdb_f_init_     ( initializer                       )
//       ~~~~~~~~~~~ mmdb_f_quit_     ( disposer                          )
//                   autoserials_     ( switch to the autoserials regime  )
//                   setreadcoords_   ( switch for reading coordinates    )
//                   simrwbrook_      ( simulates old RWBROOK printout    )
//                   mmdb_f_openl_    ( associates a unit with a file     )
//                   mmdb_f_open_     ( associates a unit with a file     )
//                   mmdb_f_copy_     ( copies contents of units          )
//                   mmdb_f_delete_   ( deletes part of a unit            )
//                   mmdb_f_settype_  ( changes type of file and r/w mode )
//                   mmdb_f_setname_  ( changes file name                 )
//                   mmdb_f_write_    ( writes a data structure into file )
//                   mmdb_f_close_    ( closes and disposes a data str-re )
//                   mmdb_f_advance_  ( advances the internal pointer     )
//                   mmdb_f_rewd_     ( sets internal pointer on the top  )
//                   mmdb_f_bksp_     ( shifts int-l pointer 1 atom back  )
//                   mmdb_f_atom_     ( reads/writes atom properties      )
//                   mmdb_f_coord_    ( reads/writes atom coordinates     )
//                   mmdb_f_setcell_  ( sets the crystal cell parameters  )
//                   mmdb_f_wbspgrp_  ( sets the space group              )
//                   mmdb_f_rbspgrp_  ( gets the space group              )
//                   mmdb_f_wbcell_   ( sets the crystal cell parameters  )
//                   mmdb_f_rbcell_   ( gets the crystal cell parameters  )
//                   mmdb_f_rbcelln_  ( gets the crystal cell parameters  )
//                   mmdb_f_rbrcel_   ( gets the recipricol cell          )
//                   mmdb_f_rborf_    ( returns or fill transf. matrices  )
//                   mmdb_f_orthmat_  ( calc. standard othogonalisations  )
//                   mmdb_f_cvanisou_ ( converts between cryst-c units    )
//                   mmdb_f_wremark_  ( writes a remark statement         )
//                   mmdb_f_setter
//                   mmdb_f_sethet
//                   rberrstop_       ( error messenger                   )
//                   rbcheckerr_      ( a simple  error messenger         )
//
//  (C) E. Krissinel 2000-2008
//
//  =================================================================
//
//  Note: what if the orthogonalization code is not defined?
//

#ifndef  __STRING_H
#include "string.h"
#endif

#ifndef  __STDLIB_H
#include "stdlib.h"
#endif

#ifndef  __MATH_H
#include "math.h"
#endif

#ifndef  __MMDB_RWBrook__
#include "mmdb_rwbrook.h"
#endif

#ifndef  __MMDB_Manager__
#include "mmdb_manager.h"
#endif

#ifndef  __MMDB_Tables__
#include "mmdb_tables.h"
#endif


//  ==========================  CChannel  ===========================

DefineClass(CChannel)

class CChannel {

  public :

    int           nUnit;       // unit number
    int           nType;       // unit type: 0- PDB; 1- CIF; 2- binary
    int           nRead;       // 0: input, 1: output
    PCMMDBManager MMDBManager; // MMDB manager
    pstr          FName;       // file name
    int           fPos;        // "position" in the file
    int           ErrCode;     // error code of last operation
    Boolean       FAutoSer;    // autoserials flag for reading PDB
    Boolean       FReadCoords; // flag to read coordinate section
    Boolean       FSimRWBROOK; // flag to simulate old RWBROOK's printout

    CChannel ();
    ~CChannel();

    void     Dispose();
    void     Init   ();

    void     SetFileType ( pstr FType );
    void     SetFileName ( pstr FileName, int FNameLen );
    void     IdentifyFile( pstr ExistingFName );

    Boolean  EndOfFile   ();
    PCAtom * GetAtomArray();
    PCAtom   GetAtomI    ( int index );

    PCMMDBCryst GetCryst ();

    Boolean  areCrystMatrices();
    void     Frac2Orth   (
                realtype x,    realtype y,    realtype z,
                realtype & xx, realtype & yy, realtype & zz );
    void     Orth2Frac   (
                realtype x,    realtype y,    realtype z,
                realtype & xx, realtype & yy, realtype & zz );
    void     Cryst2Orth  ( rvector U );
    void     Orth2Cryst  ( rvector U );
    int      SetCell     ( realtype cell_a,
                           realtype cell_b,
                           realtype cell_c,
                           realtype cell_alpha,
                           realtype cell_beta,
                           realtype cell_gamma,
                           int      OrthCode );
    int      PutCell     ( realtype cell_a,
                           realtype cell_b,
                           realtype cell_c,
                           realtype cell_alpha,
                           realtype cell_beta,
                           realtype cell_gamma,
                           int      OrthCode );
    int      SetSpGroup  ( pstr     spGroup );
    int      GetSpGroup  ( pstr     spGroup );
    int      GetCell     ( realtype & cell_a,
                           realtype & cell_b,
                           realtype & cell_c,
                           realtype & cell_alpha,
                           realtype & cell_beta,
                           realtype & cell_gamma,
                           realtype & cell_v,
                           int      & OrthCode );
    int      GetRCell    ( realtype & cell_as,
                           realtype & cell_bs,
                           realtype & cell_cs,
                           realtype & cell_alphas,
                           realtype & cell_betas,
                           realtype & cell_gammas,
                           realtype & cell_vs );

    void MakeCoordStructure();
    void Read ();
    void Write();

    void GetInputBuffer ( pstr Line, int & count );

  protected :

    void TranslateError();

};

CChannel::CChannel()  {
  Init();
}

CChannel::~CChannel()  {
  Dispose();
}

void CChannel::Init()  {
  nUnit       = -1;
  nType       = -1;
  nRead       = 0;
  MMDBManager = NULL;
  FName       = NULL;
  ErrCode     = 0;
  fPos        = 0;
  FAutoSer    = False;
  FReadCoords = True;
  FSimRWBROOK = False;
}

void CChannel::Dispose()  {
  if (MMDBManager)  delete MMDBManager;
  if (FName)        delete[] FName;
  MMDBManager = NULL;
  FName       = NULL;
  nUnit       = -1;
  nType       = -1;
  nRead       = 0;
  ErrCode     = 0;
  fPos        = 0;
}


void CChannel::SetFileType ( pstr FType )  {
  switch (FType[0])  {
    default  :
    case ' ' :  if (nRead==0)
                     nType = -1;                  // auto at reading
                else if (MMDBManager)
                     nType = MMDBManager->FType;  // auto at writing
                else nType = -1;
              break;
    case 'P' :  nType = 0;   break;  // PDB
    case 'C' :  nType = 1;   break;  // CIF
    case 'B' :  nType = 2;   break;  // BIN
  }
}

void CChannel::IdentifyFile ( pstr ExistingFName )  {
  if (nType==-1)  {
    if (ExistingFName)  {
      if  (isMMDBBIN(ExistingFName)==0)  nType = 2;
      else if (isPDB(ExistingFName,GZM_CHECK,True)==0)
                                         nType = 0;
      else if (isCIF(ExistingFName)==0)  nType = 1;
                                   else  nType = -2;  // unidentified
    } else  {
      if (MMDBManager)  {
        if (MMDBManager->FType<0)
              nType = 0;                  // PDB
        else  nType = MMDBManager->FType; // same as it was on last input
      } else  nType = 0;
    }
  }
}

void CChannel::SetFileName ( pstr FileName, int FNameLen )  {
  if (FName)  delete[] FName;
  FName = new char[FNameLen+1];
  strncpy ( FName,FileName,FNameLen );
  FName[FNameLen] = char(0);
}

void CChannel::MakeCoordStructure()  {
  if (MMDBManager)
    MMDBManager->Delete ( MMDBFCM_All );
  else  {
    MMDBManager = new CMMDBManager();
    MMDBManager->SetFlag ( MMDBF_AllowDuplChainID );
  }
}

void CChannel::Read()  {
int RC;

  ErrCode = -2;
  if (!FName)  return;

  MakeCoordStructure();

  IdentifyFile ( FName );

  if (FAutoSer)     MMDBManager->SetFlag    ( MMDBF_AutoSerials );
           else     MMDBManager->RemoveFlag ( MMDBF_AutoSerials );
  if (FReadCoords)  MMDBManager->RemoveFlag ( MMDBF_NoCoordRead );
              else  MMDBManager->SetFlag    ( MMDBF_NoCoordRead );
  if (FSimRWBROOK)  MMDBManager->SetFlag    ( MMDBF_SimRWBROOK  );
              else  MMDBManager->RemoveFlag ( MMDBF_SimRWBROOK  );

  MMDBManager->SetFlag ( MMDBF_IgnoreDuplSeqNum | 
                         MMDBF_IgnoreBlankLines |
                         MMDBF_IgnoreRemarks    |
                         MMDBF_IgnoreNonCoorPDBErrors |
                         MMDBF_AllowDuplChainID );

  switch (nType)  {
    default : nType   = 0;  // nType=-2: unidentified: try PDB
    case  0 : ErrCode = MMDBManager->ReadPDBASCII ( FName );  break;
    case  1 : ErrCode = MMDBManager->ReadCIFASCII ( FName );  break;
    case  2 : ErrCode = MMDBManager->ReadMMDBF    ( FName );  break;
  }
  if (ErrCode==0)  {
    RC = MMDBManager->CrystReady();
    switch (RC)  {
      case CRRDY_NoTransfMatrices : ErrCode = RWBERR_NoMatrices;   break;
      case CRRDY_Unchecked        : ErrCode = RWBERR_NoCheck;      break;
      case CRRDY_Ambiguous        : ErrCode = RWBERR_Disagreement; break;
      case CRRDY_NoCell           : ErrCode = RWBERR_NoCellParams; break;
      default : ;
    }
  }
  fPos = 0;  // begining of the file
  TranslateError();
}

void CChannel::Write()  {
  ErrCode = -3;
  if ((!MMDBManager) || (!FName))  return;
  IdentifyFile ( FName );
  switch (nType)  {
    default : nType   = 0;  // nType=-2: unidentified: make PDB
    case  0 : ErrCode = MMDBManager->WritePDBASCII ( FName );  break;
    case  1 : ErrCode = MMDBManager->WriteCIFASCII ( FName );  break;
    case  2 : ErrCode = MMDBManager->WriteMMDBF    ( FName );  break;
  }
  // we do not change fPos here!
  TranslateError();
}

void  CChannel::TranslateError()  {

  switch (ErrCode)  {

    case Error_CantOpenFile        : ErrCode = RWBERR_CantOpenFile;     break;
    case Error_UnrecognizedInteger : ErrCode = RWBERR_WrongInteger;     break;
    case Error_NoData             : ErrCode = RWBERR_NotACIFFile;       break;
    case Error_WrongModelNo       : ErrCode = RWBERR_WrongModelNo;      break;
    case Error_DuplicatedModel    : ErrCode = RWBERR_DuplicatedModel;   break;
    case Error_ForeignFile        : ErrCode = RWBERR_ForeignFile;       break;
    case Error_WrongEdition       : ErrCode = RWBERR_WrongEdition;      break;
    case Error_ATOM_Unrecognized  : ErrCode = RWBERR_ATOM_Unrecognd;    break;
    case Error_ATOM_AlreadySet    : ErrCode = RWBERR_ATOM_AlreadySet;   break;
    case Error_ATOM_NoResidue     : ErrCode = RWBERR_ATOM_NoResidue;    break;
    case Error_ATOM_Unmatch       : ErrCode = RWBERR_ATOM_Unmatch;      break;
    case Error_NotACIFFile        : ErrCode = RWBERR_NotACIFFile;       break;
    case Error_UnrecognCIFItems   : ErrCode = RWBERR_UnrecognCIFItems;  break;
    case Error_MissingCIFField    : ErrCode = RWBERR_MissingCIFField;   break;
    case Error_EmptyCIFLoop       : ErrCode = RWBERR_EmptyCIFLoop;      break;
    case Error_UnexpEndOfCIF      : ErrCode = RWBERR_UnexpEndOfCIF;     break;
    case Error_MissgCIFLoopField  : ErrCode = RWBERR_MissgCIFLoopField; break;
    case Error_NotACIFStructure   : ErrCode = RWBERR_NotACIFStructure;  break;
    case Error_NotACIFLoop        : ErrCode = RWBERR_NotACIFLoop;       break;
    case Error_UnrecognizedReal   : ErrCode = RWBERR_WrongReal;         break;

    case Error_Ok                 : ErrCode = RWBERR_Ok;                break;
    case Error_WrongChainID       : ErrCode = RWBERR_WrongChainID;      break;
    case Error_WrongEntryID       : ErrCode = RWBERR_WrongEntryID;      break;
    case Error_SEQRES_serNum      : ErrCode = RWBERR_SEQRES_serNum;     break;
    case Error_SEQRES_numRes      : ErrCode = RWBERR_SEQRES_numRes;     break;
    case Error_SEQRES_extraRes    : ErrCode = RWBERR_SEQRES_exraRes;    break;
    case Error_NCSM_Unrecognized  : ErrCode = RWBERR_NCSM_Unrecogn;     break;
    case Error_NCSM_AlreadySet    : ErrCode = RWBERR_NCSM_AlreadySet;   break;
    case Error_NCSM_WrongSerial   : ErrCode = RWBERR_NCSM_WrongSerial;  break;
    case Error_NCSM_UnmatchIG     : ErrCode = RWBERR_NCSM_UnmatchIG;    break;
    case Error_NoModel            : ErrCode = RWBERR_NoModel;           break;
    case Error_NoSheetID          : ErrCode = RWBERR_NoSheetID;         break;
    case Error_WrongSheetID       : ErrCode = RWBERR_WrongSheetID;      break;
    case Error_WrongStrandNo      : ErrCode = RWBERR_WrongStrandNo;     break;
    case Error_WrongNumberOfStrands : ErrCode = RWBERR_WrongNofStrands; break;
    case Error_WrongSheetOrder    : ErrCode = RWBERR_WrongSheetOrder;   break;
    case Error_HBondInconsistency : ErrCode = RWBERR_HBondInconsis;     break;
    case Error_EmptyResidueName   : ErrCode = RWBERR_EmptyResidueName;  break;
    case Error_DuplicateSeqNum    : ErrCode = RWBERR_DuplicateSeqNum;   break;
    case Error_NoLogicalName      : ErrCode = RWBERR_NoLogicalName;     break;
    case Error_GeneralError1      : ErrCode = RWBERR_GeneralError1;     break;

    default : ;
  }


}

Boolean CChannel::EndOfFile()  {
int nA;
  if (MMDBManager)  {
    nA = MMDBManager->GetNumberOfAtoms();
    if (fPos>nA)  {
      fPos = nA+1;
      return True;
    }
  } else
    return  True;
  return False;
}

PCAtom * CChannel::GetAtomArray()  {
  if (MMDBManager)  return MMDBManager->GetAtomArray();
              else  return NULL;
}

PCAtom CChannel::GetAtomI ( int index )  {
// returns index-th atom, as counted from the
// top of file
  if (MMDBManager)  return MMDBManager->GetAtomI ( index );
              else  return NULL;
}

PCMMDBCryst CChannel::GetCryst()  {
  if (MMDBManager)  return &(MMDBManager->Cryst);
              else  return NULL;
}

Boolean CChannel::areCrystMatrices()  {
  if (MMDBManager)  return MMDBManager->Cryst.areMatrices();
              else  return False;
}

void  CChannel::Frac2Orth (
                realtype x,    realtype y,    realtype z,
                realtype & xx, realtype & yy, realtype & zz )  {
  if (MMDBManager)
    MMDBManager->Cryst.Frac2Orth ( x,y,z,xx,yy,zz );
  else  {
    xx = x;
    yy = y;
    zz = z;
  }
}

void  CChannel::Orth2Frac (
                realtype x,    realtype y,    realtype z,
                realtype & xx, realtype & yy, realtype & zz )  {
  if (MMDBManager)
    MMDBManager->Cryst.Orth2Frac ( x,y,z,xx,yy,zz );
  else  {
    xx = x;
    yy = y;
    zz = z;
  }
}

void  CChannel::Cryst2Orth ( rvector U )  {
  if (MMDBManager)
    MMDBManager->Cryst.Cryst2Orth ( U );
}

void  CChannel::Orth2Cryst ( rvector U )  {
  if (MMDBManager)
    MMDBManager->Cryst.Orth2Cryst ( U );
}


int  CChannel::PutCell ( realtype cell_a,
                         realtype cell_b,
                         realtype cell_c,
                         realtype cell_alpha,
                         realtype cell_beta,
                         realtype cell_gamma,
                         int      OrthCode )  {

  if (MMDBManager)  {
    
    MMDBManager->Cryst.PutCell ( cell_a,cell_b,cell_c,
                                 cell_alpha,cell_beta,cell_gamma,
                                 OrthCode );

    if ((cell_a!=0.0) || (OrthCode>0))  {
      if (MMDBManager->Cryst.CellCheck & CCHK_Disagreement)
        return RWBERR_Disagreement;
      if (MMDBManager->Cryst.CellCheck & CCHK_NoOrthCode)
        return RWBERR_NoOrthCode;
      if (MMDBManager->Cryst.CellCheck & CCHK_Unchecked)
        return RWBERR_NoCheck;
    }

    return RWBERR_Ok;

  } else

    return RWBERR_NoFile;

}


int  CChannel::SetCell ( realtype cell_a,
                         realtype cell_b,
                         realtype cell_c,
                         realtype cell_alpha,
                         realtype cell_beta,
                         realtype cell_gamma,
                         int      OrthCode )  {

  if (MMDBManager)  {
    
    MMDBManager->Cryst.SetCell ( cell_a,cell_b,cell_c,
                                 cell_alpha,cell_beta,cell_gamma,
                                 OrthCode );

    if (MMDBManager->Cryst.CellCheck & CCHK_Disagreement)
      return RWBERR_Disagreement;
    if (MMDBManager->Cryst.CellCheck & CCHK_NoOrthCode)
      return RWBERR_NoOrthCode;
    if (MMDBManager->Cryst.CellCheck & CCHK_Unchecked)
      return RWBERR_NoCheck;

    return RWBERR_Ok;

  } else

    return RWBERR_NoFile;

}


int  CChannel::SetSpGroup ( pstr spGroup )  {
  if (MMDBManager)  {
    MMDBManager->SetSpaceGroup(spGroup);
    return RWBERR_Ok;
  } else
    return RWBERR_NoFile;
}


int  CChannel::GetSpGroup ( pstr spGroup )  {
  if (MMDBManager)  {
    if (MMDBManager->Cryst.WhatIsSet & CSET_SpaceGroup)
          strcpy ( spGroup,MMDBManager->Cryst.spaceGroup );
    else  strcpy ( spGroup," " );
    return RWBERR_Ok;
  } else
    return RWBERR_NoFile;
}


int  CChannel::GetCell ( realtype & cell_a,
                         realtype & cell_b,
                         realtype & cell_c,
                         realtype & cell_alpha,
                         realtype & cell_beta,
                         realtype & cell_gamma,
                         realtype & cell_v,
                         int      & OrthCode )  {

  if (MMDBManager)  {
    cell_a     = MMDBManager->Cryst.a;
    cell_b     = MMDBManager->Cryst.b;
    cell_c     = MMDBManager->Cryst.c;
    cell_alpha = MMDBManager->Cryst.alpha;
    cell_beta  = MMDBManager->Cryst.beta;
    cell_gamma = MMDBManager->Cryst.gamma;
    cell_v     = MMDBManager->Cryst.Vol;
    OrthCode   = MMDBManager->Cryst.NCode;
    if (!(MMDBManager->Cryst.WhatIsSet & CSET_CellParams))
      return RWBERR_NoCellParams;
    if (!(MMDBManager->Cryst.WhatIsSet & CSET_Transforms))
      return RWBERR_NoCheck;
//    if (MMDBManager->Cryst.CellCheck & CCHK_NoOrthCode)
//      return RWBERR_NoOrthCode;

    return RWBERR_Ok;

  } else

    return RWBERR_NoFile;

}

int CChannel::GetRCell ( realtype & cell_as,
                         realtype & cell_bs,
                         realtype & cell_cs,
                         realtype & cell_alphas,
                         realtype & cell_betas,
                         realtype & cell_gammas,
                         realtype & cell_vs )  {
  if (MMDBManager)  {
    MMDBManager->Cryst.GetRCell ( cell_as,cell_bs,cell_cs,
                        cell_alphas,cell_betas,cell_gammas,
                        cell_vs );
    if (!(MMDBManager->Cryst.WhatIsSet & CSET_CellParams))
      return RWBERR_NoCellParams;
    if (!(MMDBManager->Cryst.WhatIsSet & CSET_Transforms))
      return RWBERR_NoCheck;
    return RWBERR_Ok;
  } else
    return RWBERR_NoFile;
}

void CChannel::GetInputBuffer ( pstr Line, int & count )  {
  if (MMDBManager)
    MMDBManager->GetInputBuffer ( Line,count );
  else  {
    strcpy ( Line,"" );
    count = -1;
  }
}



//  ========================  static data  ===========================

static int         nChannels;    // number of channels in processing
static PCChannel * Channel;      // array of channels in processing

static Boolean     FAutoSer;     // flag to automatically generate
                                 // serial numbers at reading PDB files
static Boolean     FReadCoords;  // flag to read coordinates; if set to
                                 // False, only the header of PDB file
                                 // is read
static Boolean     FSimRWBROOK;  // flag to simulate old RWBROOK printout
                                 // as closely as possible

static char        LastFunc[80]; // name of the last called function
static int         LastUnit;     // number of the last unit called
static int         LastRC;       // last return code
static int         LastSer;      // last serial number kept for
                                 // certain warnings


//  ========================  RWBrook API  ===========================


FORTRAN_SUBR ( MMDB_F_INIT, mmdb_f_init,(),(),() )  {
  InitMatType();
  nChannels   = 0;
  Channel     = NULL;
  strcpy ( LastFunc,"MMDB_F_Init" );
  LastUnit    = -1;
  LastRC      = 0;
  LastSer     = 0;
  FAutoSer    = False;
  FReadCoords = True;
  FSimRWBROOK = False;
}


FORTRAN_SUBR ( MMDB_F_QUIT, mmdb_f_quit,(),(),() )  {
int i;
  for (i=0;i<nChannels;i++) 
    if (Channel[i])  delete Channel[i];
  if (Channel) delete[] Channel;
  Channel   = NULL;
  nChannels = 0;
  strcpy ( LastFunc,"MMDB_F_Quit" );
  LastUnit  = -1;
  LastRC    = 0;
  LastSer   = 0;
  FAutoSer  = False;
}


FORTRAN_SUBR ( AUTOSERIALS, autoserials,
               ( int * iOnOff ),
               ( int * iOnOff ),
               ( int * iOnOff ) )  {
  FAutoSer = (*iOnOff!=0);
}


FORTRAN_SUBR ( SETREADCOORDS,setreadcoords,
               ( int * iOnOff ),
               ( int * iOnOff ),
               ( int * iOnOff ) )  {
  FReadCoords = (*iOnOff!=0);
}


FORTRAN_SUBR ( SIMRWBROOK,simrwbrook,
               ( int * iOnOff ),
               ( int * iOnOff ),
               ( int * iOnOff ) )  {
  FSimRWBROOK = (*iOnOff!=0);
}


int GetChannel ( int iUnit )  {
//   Returns serial number of the channle associated with
// unit iUnit.
//   If the channel is not found, returns -1
int i;
  for (i=0;i<nChannels;i++)
    if (Channel[i])  {
      if (Channel[i]->nUnit==iUnit)
        return i;
    }
  return -1;
}


int MakeChannel ( int iUnit )  {
//   If iUnit-th unit already exists, it is
// reinitialized. Otherwise the function looks
// for a not used channel, and if there is one,
// associates the new iUnit-th unit with it.
// If there is no unused channels, the new one
// is created and the new iUnit-th unit is
// associated with it.
//   Returns serial number of the channel
// associated with the newly reinitialized
// or created unit.
int         i,m;
PCChannel * Channel1;

  m = GetChannel ( iUnit );

  if (m>=0)  {  // such channel already exists
    Channel[m]->Dispose();  // clear it first
    Channel[m]->Init();     // reinitialize it
    Channel[m]->nUnit = iUnit;
    return m;
  } 

  for (i=0;i<nChannels;i++)  // look for free channel
    if (!Channel[i])  {
      m = i;  // found!
      break;
    }

  if (m<0)  {  // no free channel
    // create new channel place
    Channel1 = new PCChannel[nChannels+1];
    for (i=0;i<nChannels;i++)
      Channel1[i] = Channel[i];
    if (Channel) delete[] Channel;
    Channel = Channel1;
    m = nChannels;
    nChannels++;  // increase number of channels
  }

  Channel[m] = new CChannel();  // create new channel
  Channel[m]->nUnit = iUnit;

  return m;

}

FORTRAN_SUBR ( MMDB_F_OPEN, mmdb_f_open,
               (    // lengths-at-end list
                fpstr FName,      // file name
                fpstr RWStat,     // "INPUT" or "OUTPUT"
                fpstr FType,      // "PDB", "CIF", "BIN" or " "
                int * iUnit,      // channel number
                int * iRet,       // returns error code
                int   FName_len,  // fortran-hidden length of FName
                int   RWStat_len, // fortran-hidden length of RWStat
                int   FType_len   // fortran-hidden length of FType
               ), ( // lengths-in-structure list
                fpstr FName,  fpstr RWStat, fpstr FType,      
                int * iUnit,  int * iRet       
               ), ( // lengths-follow list
                fpstr FName,   int FName_len,    
                fpstr RWStat,  int RWStat_len,   
                fpstr FType,   int FType_len,   
                int * iUnit,   int * iRet
               ) )  {

int k;
char  L[500];

#ifdef WIN32
 GetStrTerWin32File ( L,FTN_STR(FName),0,sizeof(L),FTN_LEN(FName) );
#else
 GetStrTer ( L,FTN_STR(FName),0,sizeof(L),FTN_LEN(FName) );
#endif

  strcpy ( LastFunc,"MMDB_F_Open" );
  LastUnit = *iUnit;

  if (*iUnit==0)  {  // generate unit number
    *iUnit = 1;
    do {
      k = GetChannel ( *iUnit );
      if (k>=0)  *iUnit = *iUnit+1;
    } while (k>=0);
  }

  // create channel
  k = MakeChannel ( *iUnit );

  if (k>=0)  {

    if (FTN_STR(RWStat)[0]=='I')  {
      Channel[k]->nRead       = 0;
      Channel[k]->FAutoSer    = FAutoSer;
      Channel[k]->FReadCoords = FReadCoords;
      Channel[k]->FSimRWBROOK = FSimRWBROOK;
    } else
      Channel[k]->nRead = 1;

    // store file name
    Channel[k]->SetFileName ( L,sizeof(L) );

    // store unit type
    Channel[k]->SetFileType ( FTN_STR(FType) );
    Channel[k]->IdentifyFile( L );

    if (FSimRWBROOK)  {
      switch (Channel[k]->nType)  {
        default : printf ( "  unknown-format" );  break;
        case  0 : printf ( "  PDB"   );           break;
        case  1 : printf ( "  mmCIF" );           break;
        case  2 : printf ( "  MMDB BINARY" );
      }
      printf ( " file is being opened on unit %i",*iUnit );
      if (FTN_STR(RWStat)[0]=='I')  printf ( " for INPUT.\n\n" );
                              else  printf ( " for OUTPUT.\n\n" );
    }

    if (FTN_STR(RWStat)[0]=='I')  {
      Channel[k]->Read();
      *iRet = Channel[k]->ErrCode;
    } else  {
      Channel[k]->MakeCoordStructure();
      Channel[k]->fPos = 1;
      *iRet = RWBERR_Ok;
    }

  } else
    *iRet = RWBERR_NoChannel;

  LastRC = *iRet;

}

FORTRAN_SUBR ( MMDB_F_OPENL, mmdb_f_openl,
               (    // lengths-at-end list
                fpstr LName,      // logical name
                fpstr RWStat,     // "INPUT" or "OUTPUT"
                fpstr FType,      // "PDB", "CIF", "BIN" or " "
                int * iUnit,      // channel number
                int * iRet,       // returns error code
                int   LName_len,  // fortran-hidden length of LName
                int   RWStat_len, // fortran-hidden length of RWStat
                int   FType_len   // fortran-hidden length of FType
               ), ( // lengths-in-structure list
                fpstr LName,  fpstr RWStat, fpstr FType,
                int * iUnit,  int * iRet
               ), ( // lengths-follow list
                fpstr LName,   int LName_len, 
                fpstr RWStat,  int RWStat_len,
                fpstr FType,   int FType_len,
                int * iUnit,   int * iRet
               ) )  {
char  L[200];
pstr  S;
char_struct(FName)

  strcpy ( LastFunc,"MMDB_F_Openl" );
    
  GetStrTer ( L,FTN_STR(LName),0,sizeof(L),FTN_LEN(LName) );
    
  S = getenv ( L );
    
  if (S)  {

    fill_char_struct(FName,S)
  
  } else if (FTN_STR(RWStat)[0]=='O') {

    // The user may not have assigned a logical
    // for output, so that the program should write file "XYZOUT". This
    // is allowed as a convenience when user is not really interested
    // in output file.
    fill_char_struct(FName,L)

  } else {
    *iRet = RWBERR_NoLogicalName;  
    return;
  }

  printf ( "\n  Logical name: %s  File name: %s\n",L,FName );

  FORTRAN_CALL ( MMDB_F_OPEN, mmdb_f_open, 
                   ( FName,RWStat,FType,iUnit,iRet,
                     FName_len,RWStat_len,FType_len ),
                   ( &FName,RWStat,FType,iUnit,iRet ),
                   ( FName,FName_len,RWStat,RWStat_len,
                     FType,FType_len,iUnit,iRet ) );

}     

FORTRAN_SUBR ( MMDB_F_COPY, mmdb_f_copy,
               (    // lengths-at-end list
                int * iUnit1,    // destination unit
                int * iUnit2,    // source unit
                int * copyKey,   // copy key:
                                 //  = 1  copy all
                                 //  = 2  copy all except coordinates
                                 //  = 3  copy title section only
                                 //  = 4  copy crystallographic
                                 //       section only
                                 //  = 5  copy coordinate section only
                                 // any other value does not do anything
                int * iRet       // return code:
                                 //   =0 if success
                                 //   =RWBERR_NoChannel if a unit
                                 //                   does not exist
               ), ( // lengths-in-structure list
                int * iUnit1,  int * iUnit2,
                int * copyKey, int * iRet
               ), ( // lengths-follow list
                int * iUnit1,  int * iUnit2,
                int * copyKey, int * iRet
               ) )  {
int  k1,k2;
word copyMask;

  strcpy ( LastFunc,"MMDB_F_Copy" );

  LastUnit = *iUnit1;
  k1 = GetChannel ( LastUnit );

  if (k1>=0)  {
    if (Channel[k1]->MMDBManager)  {
      LastUnit = *iUnit2;
      k2 = GetChannel ( LastUnit );
      if (k2>=0)  {
        if (Channel[k2]->MMDBManager)  {
          switch (*copyKey)  {
            case 1  :  copyMask = MMDBFCM_All;    break;
            case 2  :  copyMask = MMDBFCM_Top;    break;
            case 3  :  copyMask = MMDBFCM_Title;  break;
            case 4  :  copyMask = MMDBFCM_Cryst;  break;
            case 5  :  copyMask = MMDBFCM_Coord;  break;
            default :  copyMask = 0x0000;
          }
          Channel[k1]->MMDBManager->Copy ( Channel[k2]->MMDBManager,copyMask );
          *iRet = RWBERR_Ok;
       } else
          *iRet = RWBERR_NoFile;
      } else
        *iRet = RWBERR_NoChannel;
    } else
      *iRet = RWBERR_NoFile;
  } else
    *iRet = RWBERR_NoChannel;

  LastRC = *iRet;

}


FORTRAN_SUBR ( MMDB_F_DELETE, mmdb_f_delete,
               (    // lengths-at-end list
                int * iUnit,     // unit number; *iUnit<=0 means
                                 // "the last mentioned unit"
                int * delKey,    // delete key:
                                 //  = 1  delete all
                                 //  = 2  delete all except coordinates
                                 //  = 3  delete title section only
                                 //  = 4  delete crystallographic
                                 //       section only
                                 //  = 5  delete coordinate section only
                                 // any other value does not do anything
                int * iRet       // return code:
                                 //   =0 if success
                                 //   =RWBERR_NoChannel if a unit
                                 //                   does not exist
                                 //   =RWBERR_NoFile    if a unit
                                 //                   was not opened
               ), ( // lengths-in-structure list
                int * iUnit, int * delKey, int * iRet
               ), ( // lengths-follow list
                int * iUnit, int * delKey, int * iRet
               ) )  {
int  k;
word delMask;

  strcpy ( LastFunc,"MMDB_F_Delete" );

  if (*iUnit>0)
    LastUnit = *iUnit;
  k = GetChannel ( LastUnit );

  if (k>=0)  {
    if (Channel[k]->MMDBManager)  {
      switch (*delKey)  {
        case 1  :  delMask = MMDBFCM_All;    break;
        case 2  :  delMask = MMDBFCM_Top;    break;
        case 3  :  delMask = MMDBFCM_Title;  break;
        case 4  :  delMask = MMDBFCM_Cryst;  break;
        case 5  :  delMask = MMDBFCM_Coord;  break;
        default :  delMask = 0x0000;
      }
      Channel[k]->MMDBManager->Delete ( delMask );
      *iRet = RWBERR_Ok;
    } else
      *iRet = RWBERR_NoFile;
  } else
    *iRet = RWBERR_NoChannel;

  LastRC = *iRet;

}


FORTRAN_SUBR ( MMDB_F_SETTYPE, mmdb_f_settype,
               (    // lengths-at-end list
                int * iUnit,     // unit number
                fpstr FType,     // "PDB", "CIF", "BIN" or " "
                fpstr RWStat,    // "INPUT" or "OUTPUT"
                int * iRet,      // returns -1 if unit not found,
                                 // otherwise 0
                int   FType_len, // fortran-hidden length of FType
                int   RWStat_len // fortran-hidden length of RWStat
               ), ( // lengths-in-structure list
                int * iUnit,  fpstr FType,
                fpstr RWStat, int * iRet
               ), ( // length-follow list
                int * iUnit,     
                fpstr FType,   int FType_len,  
                fpstr RWStat,  int RWStat_len,
                int * iRet
               ) )  {
int k;
  
  strcpy ( LastFunc,"MMDB_F_SetType" );
  if (*iUnit>0)
    LastUnit = *iUnit;

  k = GetChannel ( LastUnit );

  if (k>=0)  {
    // store unit type
    Channel[k]->SetFileType ( FTN_STR(FType) );
    // store unit mode
    if (FTN_STR(RWStat)[0]=='I')  Channel[k]->nRead = 0;
                            else  Channel[k]->nRead = 1;
    *iRet = RWBERR_Ok;
  } else
    *iRet = RWBERR_NoChannel;

  LastRC = *iRet;

}



FORTRAN_SUBR ( MMDB_F_SETNAME, mmdb_f_setname,
               (    // lengths-at-end list
                int * iUnit,    // unit number
                fpstr FName,    // file name
                int * iRet,     // returns -1 if unit not found,
                                // otherwise 0
                int   FName_len // fortran-hidden length of FName
               ), ( // lengths-in-structure list
                int * iUnit, fpstr FName, int * iRet
               ), ( // lengths-follow list
                int * iUnit,
                fpstr FName, int FName_len,
                int * iRet
               ) )  {

int k;

  strcpy ( LastFunc,"MMDB_F_SetName" );
  if (*iUnit>0)
    LastUnit = *iUnit;

  k = GetChannel ( LastUnit );

  if (k<0)
    *iRet = RWBERR_NoChannel;
  else  {
    // store file name
    Channel[k]->SetFileName ( FTN_STR(FName),FTN_LEN(FName) );
    *iRet = RWBERR_Ok;
  }

  LastRC = *iRet;

}


FORTRAN_SUBR ( MMDB_F_WRITE,  mmdb_f_write,
               ( int * iUnit, int * iRet ),
               ( int * iUnit, int * iRet ),
               ( int * iUnit, int * iRet ) )  {
int k;

  strcpy ( LastFunc,"MMDB_F_Write" );
  if (*iUnit>0)
    LastUnit = *iUnit;

  k = GetChannel ( LastUnit );

  if (k<0)
    *iRet = RWBERR_NoChannel;
  else  {
    Channel[k]->Write();
    *iRet = Channel[k]->ErrCode;
  }

  LastRC = *iRet;

}


FORTRAN_SUBR ( MMDB_F_CLOSE, mmdb_f_close,
               ( int * iUnit, int * iRet ),
               ( int * iUnit, int * iRet ),
               ( int * iUnit, int * iRet ) )  {
int k;

  strcpy ( LastFunc,"MMDB_F_Close" );
  if (*iUnit>0)
    LastUnit = *iUnit;

  k = GetChannel ( LastUnit );

  if (k<0)
    *iRet = RWBERR_NoChannel;
  else if (Channel[k]->nRead==1)  {
    Channel[k]->Write();
    *iRet = Channel[k]->ErrCode;
    if (!(*iRet))  { 
      delete Channel[k];
      Channel[k] = NULL;
    }
  } else  {
    delete Channel[k];
    Channel[k] = NULL;
    *iRet = RWBERR_Ok;
  }

  LastRC = *iRet;

}
  


FORTRAN_SUBR ( MMDB_F_ADVANCE, mmdb_f_advance,
               (   // lengths-at-end list
                int * iUnit, // unit number
                int * iOut,  // output echo file
                int * iTer,  // FLAG =1, return iRet=1 if 'ter' card found
                             //      =0, do not return on 'ter' card
                int * iRet   // =0  if normal return
                             // =1  if return on 'ter' card (iTer=1)
                             // =2  if return on end of file
                             // =3  if return on 'hetatm' card
                             // =RWBERR_NoChannel if unit does not exist
                             // =RWBERR_NoAdvance if pointer was not
                             //                   advanced
               ), ( // lengths-in-structure list
                int * iUnit, int * iOut, int * iTer, int * iRet
               ), ( // lengths-follow list
                int * iUnit, int * iOut, int * iTer, int * iRet
               ) )  {
int    k;
PCAtom atom;

  strcpy ( LastFunc,"mmdb_f_advance" );
  LastUnit = *iUnit;

  k = GetChannel ( *iUnit );

  if (k<0)

    *iRet = RWBERR_NoChannel;

  else if (Channel[k]->nRead==0)  {

    // in the input file, try to get pointer on the next atom

    do {
      Channel[k]->fPos++;  // advance the pointer on Atom array
      if (Channel[k]->EndOfFile())  {
        atom = NULL;
        break;
      }
      atom = Channel[k]->GetAtomI ( Channel[k]->fPos );
      if (atom)  {
        if ((atom->Ter) && (*iTer==0))  {
          // ignore 'ter' card if iTer is set to 0
          atom = NULL;
        }
      }
    } while (!atom);

    if (!atom)  *iRet = 2; // no atom found == end of file
    else if (atom->Ter)  *iRet = 1; // 'ter' card encountered
    else if (atom->Het)  *iRet = 3; // 'hetatm' card encountered
                   else  *iRet = 0; // advance ok; normal return

  } else  {

    // in the output file, just advance the pointer

    if (Channel[k]->fPos==0)  {
      Channel[k]->fPos++;
      *iRet = 0;
    } else  {
      atom = Channel[k]->GetAtomI ( Channel[k]->fPos );
      if (atom)  {
        // the previous atom was set -- advance the pointer
        Channel[k]->fPos++;
        *iRet = 0;
      } else
        // no atom was set; make no advancement
        *iRet = RWBERR_NoAdvance;
    }

  }

  LastRC = *iRet;

}



FORTRAN_SUBR ( MMDB_F_REWD, mmdb_f_rewd,
               ( int * iUnit, int * iRet ),
               ( int * iUnit, int * iRet ),
               ( int * iUnit, int * iRet ) )  {
int k;

  strcpy ( LastFunc,"MMDB_F_Rewd" );
  LastUnit = *iUnit;

  k = GetChannel ( *iUnit );
  if (k>=0)  {
    Channel[k]->fPos = 0;
    if (Channel[k]->nRead!=0)  *iRet = RWBWAR_RewOutput;
                         else  *iRet = RWBERR_Ok;
  } else
    *iRet = RWBERR_NoChannel;

  LastRC = *iRet;

}



FORTRAN_SUBR ( MMDB_F_BKSP, mmdb_f_bksp,
               ( int * iUnit, int * iRet ),
               ( int * iUnit, int * iRet ),
               ( int * iUnit, int * iRet ) )  {
int k;

  strcpy ( LastFunc,"MMDB_F_BkSp" );
  LastUnit = *iUnit;

  k = GetChannel ( *iUnit );
  if (k>=0)  {
    *iRet = RWBERR_Ok;
    if (Channel[k]->fPos==0)  *iRet |= RWBWAR_FileTop;
                        else  Channel[k]->fPos--;
    if (Channel[k]->nRead!=0) *iRet |= RWBWAR_RewOutput;
  } else
    *iRet = RWBERR_NoChannel;

  LastRC = *iRet;

}



FORTRAN_SUBR ( MMDB_F_SEEK, mmdb_f_seek,
               (    // lengths-at-end list
                int * iUnit,  // unit number
                int * fPos,   // position to set
                int * iRet    // return code:
                              //  0   Ok
                              //  1   'ter' card met
                              //  2   end of file
                              //  3   'hetatm' card met
                              //  <0 error:
                              //  RWBERR_NoChannel
                              //      iUnit was not
                              //      initialized
                              //  RWBERR_EmptyPointer
                              //      fPos-th position
               ), ( // lengths-in-structure list
                int * iUnit, int * fPos, int * iRet
               ), ( // lengths-follow list
                int * iUnit, int * fPos, int * iRet
               ) )  {
int    k;
PCAtom atom;

  strcpy ( LastFunc,"MMDB_F_Seek" );
  LastUnit = *iUnit;

  k = GetChannel ( *iUnit );

  if (k<0)

    *iRet = RWBERR_NoChannel;

  else  {

    // set the pointer
    Channel[k]->fPos = IMax(0,*fPos);
    if (*fPos==0)  *iRet = RWBWAR_FileTop;
             else  *iRet = RWBERR_Ok;

    if (Channel[k]->nRead==0)  {

      // in the input file, check the end-of-file state
      // and analyze the atom

      if (Channel[k]->EndOfFile())  *iRet = 2;

      atom = Channel[k]->GetAtomI ( Channel[k]->fPos );

      if (!atom)          *iRet = RWBERR_EmptyPointer; // empty place
      else if (atom->Ter) *iRet = 1;  // 'ter' card encountered
      else if (atom->Het) *iRet = 3;  // 'hetatm' card encountered

    }

    // in the output file, there is nothing to do

  }

  LastRC = *iRet;

}


void  Make_AN_ID_IZ ( PCAtom atom, pstr AtNam, int AtNam_L,
                      pstr ID, int ID_L, int * IZ, int * iRet )  {
char chrg[10];
int  i,k;

  if (atom->Ter)  {

    strcpy_ns ( AtNam,pstr(" "),AtNam_L );
    strcpy_ns ( ID   ,pstr(" "),ID_L    );
    *IZ = 7;

  } else  {

    if (atom->name[0]==' ')  strcpy_ns ( AtNam,&(atom->name[1]),4 );
                       else  strcpy_ns ( AtNam,atom->name,4 );

    // first try to identify the atom with the element name
    strcpy_ns ( ID,atom->element,ID_L );  // not more than ID_L symbols
                                // from element until but not including
                                // the terminated null are copied into
                                // ID, and the latter is padded with
                                // spaces up to the length of ID_L

    if (ID_L>3)  {  // if length permits, add ID with atom charge
                    // (always 2 symbols).
      atom->GetAtomCharge(chrg);
      ID[2] = chrg[0];
      ID[3] = chrg[1];
    }

    k = 0;
    while ((k<nElementNames) && 
           ((atom->element[0]!=ElementName[k][0]) ||
            (atom->element[1]!=ElementName[k][1])))  k++;

    if (k>=nElementNames)  {
      
      // no match for atom ID -- make sure to set it blank
      strcpy_ns ( ID,pstr(" "),ID_L );

      //  try to identify the atom using the atom name
      k = 0;
      while ((k<nElementNames) && 
             ((atom->name[0]!=ElementName[k][0]) ||
              (atom->name[1]!=ElementName[k][1])))  k++;

      // try to identify a heteroatom
      i = 0;
      while ((i<nHydAtomNames) && (k>=nElementNames))  {
        if ((atom->name[0]==HydAtomName[i][0]) && 
            (atom->name[1]==HydAtomName[i][1]))
          k = 0;
        i++;
      }

      if (k>=nElementNames)  {
        // unknown or ambiguous formfactor
        k = -1;
        if ((atom->name[0]==' ') && 
            (atom->name[1]=='A'))  k = 6;
        if (k==-1)  *iRet |= RWBWAR_UnkFormFactor;
       	      else  *iRet |= RWBWAR_AmbFormFactor;
      }

    }

    *IZ = k+1;
    if (*IZ==0)
      strcpy_ns ( ID,pstr(" "),ID_L );
    else  {
      if (ID_L>3)  {
        if (ID[0]==' ')  {
          if ((AtNam[2]=='+') ||
              (AtNam[2]=='-'))  {
            ID[2] = AtNam[2];
            ID[3] = AtNam[3];
          }
        } else if ((ID[2]!='+') && (ID[2]!='-'))  {
          ID[2] = ' ';
          ID[3] = ' ';
        }
      }
      strcpy_ns ( ID,ElementName[k],IMin(2,ID_L) );
    }

  }

}



FORTRAN_SUBR ( MMDB_F_ATOM,  mmdb_f_atom,
           (    // lengths-at-end list
            int * iUnit,    // unit number
            int * iSer,     // atom serial number
            fpstr AtNam,    // atom name (left justified)
            fpstr ResNam,   // residue name
            fpstr ChnNam,   // chain name
            int * iResN,    // residue number as an integer
            fpstr ResNo,    // residue number as character (input only)
            fpstr InsCod,   // the insertion code
            fpstr AltCod,   // the alternate conformation code
            fpstr segID,    // segment ID
            int * IZ,       // atomic number (input only, returned as
                            // 7 from ambiguous atoms)
            fpstr ID,       // atomic ID related to atomic number
                            // (element symbol right justified), plus
                            // the ionic state +2, +3 etc..
                            //
            int * iRet,     // returns
                            //  RWBERR_NoChannel     if iUnit was not
                            //                       initialized
                            //  RWBERR_EmptyPointer  if atom was not
                            //                       advanced
                            //  RWBERR_Error1        internal error #1
                            //  RWBERR_Error2        internal error #2
                            //  RWBERR_Error3        internal error #3
                            //
                            //  >=0 : success, warning flags:
                            //  RWBWAR_WrongSerial   if serial number
                            //               differs from the position
                            //               number in the file
                            //  RWBWAR_UnkFormFactor unknown formfactor 
                            //  RWBWAR_AmbFormFactor ambiguous formfactor
                            //
            int AtNam_len,  // fortran-hidden length of AtNam
            int ResNam_len, // fortran-hidden length of ResNam
            int ChnNam_len, // fortran-hidden length of ChnNam
            int ResNo_len,  // fortran-hidden length of ResNo
            int InsCod_len, // fortran-hidden length of InsCod
            int AltCod_len, // fortran-hidden length of AltCod
            int segID_len,  // fortran-hidden length of SegID
            int ID_len      // fortran-hidden length of ID
           ), ( // lengths-in-structure list
            int * iUnit,  int * iSer,  fpstr AtNam,  fpstr ResNam,
            fpstr ChnNam, int * iResN, fpstr ResNo,  fpstr InsCod,
            fpstr AltCod, fpstr segID, int * IZ,     fpstr ID,
            int * iRet
           ), ( // lengths-follow list
            int * iUnit,  int * iSer,
            fpstr AtNam,  int   AtNam_len,
            fpstr ResNam, int   ResNam_len,
            fpstr ChnNam, int   ChnNam_len,
            int * iResN,
            fpstr ResNo,  int   ResNo_len,
            fpstr InsCod, int   InsCod_len,
            fpstr AltCod, int   AltCod_len,
            fpstr segID,  int   segID_len,
            int * IZ,
            fpstr ID,     int   ID_len,
            int * iRet
           ) )  {
int      k,i,RC;
ChainID  chainID;
ResName  resName;
InsCode  insCode;
AtomName atomName;
AltLoc   altLoc;
SegID    sgID;
Element  element;
PCAtom   atom;
pstr     p;
char     charge[10];

  strcpy ( LastFunc,"MMDB_F_Atom" );
  LastUnit = *iUnit;

  k = GetChannel ( *iUnit );
  if (k<0)  {
    *iRet  = RWBERR_NoChannel;
    LastRC = *iRet;
    return;
  }

  *iRet = RWBERR_Ok;

  if (Channel[k]->nRead==0)  {

    // reading the atom characteristics

    atom = Channel[k]->GetAtomI ( Channel[k]->fPos );
    if (!atom)  {
      // atom position was not advanced properly
      *iRet  = RWBERR_EmptyPointer;
      LastRC = *iRet;
      return;
    }

    *iSer = atom->serNum;
    if (*iSer!=Channel[k]->fPos)  *iRet |= RWBWAR_WrongSerial;
    LastSer = *iSer;
    Make_AN_ID_IZ ( atom,FTN_STR(AtNam),FTN_LEN(AtNam),
                    FTN_STR(ID),FTN_LEN(ID),IZ,iRet );
    if (atom->residue)  {
      strcpy_ns  ( FTN_STR(ResNam),atom->residue->name,FTN_LEN(ResNam) );
      *iResN = atom->residue->seqNum;
      PutInteger ( FTN_STR(ResNo),*iResN,IMin(4,FTN_LEN(ResNo)) );
      strcpy_ns  ( FTN_STR(InsCod),atom->residue->insCode,FTN_LEN(InsCod) );
      strcpy_ns  ( &(FTN_STR(ResNo)[4]),FTN_STR(InsCod),FTN_LEN(ResNo)-4 );
      strcpy_ns  ( FTN_STR(ChnNam),atom->GetChainID(),FTN_LEN(ChnNam) );
    } else  {
      strcpy_ns  ( FTN_STR(ResNam),pstr("   "),FTN_LEN(ResNam) );
      strcpy_ns  ( FTN_STR(ChnNam),pstr(" ")  ,FTN_LEN(ChnNam) );
      *iResN = 0;
      strcpy_ns  ( FTN_STR(ResNo) ,pstr("0")  ,FTN_LEN(ResNo)  );
      strcpy_ns  ( FTN_STR(InsCod),pstr(" ")  ,FTN_LEN(InsCod) );
    }
    strcpy_ns ( FTN_STR(AltCod),atom->altLoc,FTN_LEN(AltCod) );
    strcpy_ns ( FTN_STR(segID) ,atom->segID ,FTN_LEN(segID)  );
 
  } else  {

    // storing the atom characteristics

    if (!Channel[k]->MMDBManager)  {
      *iRet  = RWBERR_Error1;   // should never happen
      LastRC = *iRet;
      return;
    }

    GetStrTer ( chainID,FTN_STR(ChnNam),1,sizeof(chainID),FTN_LEN(ChnNam) );
    GetStrTer ( resName,FTN_STR(ResNam),3,sizeof(resName),FTN_LEN(ResNam) );
    GetStrTer ( insCode,FTN_STR(InsCod),1,sizeof(insCode),FTN_LEN(InsCod) );
    GetStrTer ( altLoc ,FTN_STR(AltCod),1,sizeof(altLoc) ,FTN_LEN(AltCod) );
    GetStrTer ( sgID   ,FTN_STR(segID) ,4,sizeof(sgID)   ,FTN_LEN(segID)  );
    element[0] = FTN_STR(ID)[0];
    element[1] = FTN_STR(ID)[1];
    element[2] = char(0);
    if (FTN_LEN(ID)>3)  {
      charge [0] = FTN_STR(ID)[2];
      charge [1] = FTN_STR(ID)[3];
      charge [2] = char(0);
    } else
      charge [0] = char(0);

/*
    if (FTN_STR(ID)[0]==' ')  {
      atomName[0] = char(0);
      if ((FTN_STR(AtNam)[1]=='H') ||
          ((FTN_STR(AtNam)[1]=='D') && (FTN_STR(ID)[2]=='D')))  {
        i = 0;
        while ((i<nHydAtomNames) && 
               (FTN_STR(AtNam)[0]!=HydAtomName[i][0])) i++;
        if (i<nHydAtomNames)
          GetStrTer ( atomName,FTN_STR(AtNam),4,5,FTN_LEN(AtNam) );
      }
      if (!atomName[0])  {
        atomName[0] = ' ';
        GetStrTer ( &(atomName[1]),FTN_STR(AtNam),3,4,FTN_LEN(AtNam) );
      }
    } else
*/
      GetStrTer ( atomName,FTN_STR(AtNam),4,5,4 );


    RC = Channel[k]->MMDBManager->PutAtom ( Channel[k]->fPos,*iSer,
                              atomName,resName,chainID,*iResN,
                              insCode,altLoc,sgID,element );

    if (RC)  {
      *iRet  = RWBERR_Error2;  // should never happen
      LastRC = *iRet;
      return;
    }

    DelSpaces ( charge );
    if (charge[0])  {
      atom  = Channel[k]->GetAtomI ( Channel[k]->fPos );
      if (!atom)  {
        *iRet  = RWBERR_EmptyPointer; // should never be so
        LastRC = *iRet;
        return;
      }
      atom->SetCharge ( charge );
    }

    if (*iSer!=Channel[k]->fPos)  {
      *iRet |= RWBWAR_WrongSerial; // this is not the right thing at all
      atom  = Channel[k]->GetAtomI ( Channel[k]->fPos );
      if (!atom)  {
        *iRet  = RWBERR_EmptyPointer; // should never be so
        LastRC = *iRet;
        return;
      }
      //      atom->serNum = *iSer;        // - we allow for a mess in serials
    }

    LastSer = *iSer;

  }

  LastRC = *iRet;

}



FORTRAN_SUBR ( MMDB_F_SETTER, mmdb_f_setter,
               ( int * iUnit, int * iRet ),
               ( int * iUnit, int * iRet ),
               ( int * iUnit, int * iRet ) )  {
int    k;
PCAtom atom;

  strcpy ( LastFunc,"MMDB_F_SetTer" );
  LastUnit = *iUnit;

  k = GetChannel ( *iUnit );
  if (k<0)  {
    *iRet  = RWBERR_NoChannel;
    LastRC = *iRet;
    return;
  }

  atom  = Channel[k]->GetAtomI ( Channel[k]->fPos );
  *iRet = RWBERR_Ok;

  if (!atom)  {
    *iRet  = RWBERR_EmptyPointer;  // atom position was not advanced properly
    LastRC = *iRet;
    return;
  }

  atom->Ter       = True;
  atom->WhatIsSet |= ASET_Coordinates;

}



FORTRAN_SUBR ( MMDB_F_SETHET, mmdb_f_sethet,
               ( int * iUnit, int * iRet ),
               ( int * iUnit, int * iRet ),
               ( int * iUnit, int * iRet ) )  {
int    k;
PCAtom atom;

  strcpy ( LastFunc,"MMDB_F_SetHet" );
  LastUnit = *iUnit;

  k = GetChannel ( *iUnit );
  if (k<0)  {
    *iRet  = RWBERR_NoChannel;
    LastRC = *iRet;
    return;
  }

  atom  = Channel[k]->GetAtomI ( Channel[k]->fPos );
  *iRet = RWBERR_Ok;

  if (!atom)  {
    *iRet  = RWBERR_EmptyPointer;  // atom position was not advanced properly
    LastRC = *iRet;
    return;
  }

  atom->Het = True;
  atom->WhatIsSet |= ASET_Coordinates;

}

FORTRAN_SUBR ( MMDB_F_GETHET, mmdb_f_gethet,
               ( int * iUnit, int * isHet, int * iRet ),
               ( int * iUnit, int * isHet, int * iRet ),
               ( int * iUnit, int * isHet, int * iRet ) )  {
int    k;
PCAtom atom;

  strcpy ( LastFunc,"MMDB_F_GetHet" );
  LastUnit = *iUnit;

  *isHet = 0;  //  no HETATM record
    
  k = GetChannel ( *iUnit );
  if (k<0)  {
    *iRet  = RWBERR_NoChannel;
    LastRC = *iRet;
    return;
  }

  atom  = Channel[k]->GetAtomI ( Channel[k]->fPos );
  *iRet = RWBERR_Ok;

  if (!atom)  {
    *iRet  = RWBERR_EmptyPointer;  // atom position was not advance properly
    LastRC = *iRet;
    return;
  }

  if (atom->Het)  *isHet = 1;      // HETATM
    
}


FORTRAN_SUBR ( MMDB_F_COPYATOM, mmdb_f_copyatom,
               ( int * iUnit1, int * iUnit2, int * iRet ),
               ( int * iUnit1, int * iUnit2, int * iRet ),
               ( int * iUnit1, int * iUnit2, int * iRet ) )  {
int    k1,k2,RC;
PCAtom atom;

  strcpy ( LastFunc,"mmdb_f_copyatom" );
  LastUnit = *iUnit1;

  k1 = GetChannel ( *iUnit1 );
  if (k1<0)  {
    *iRet  = RWBERR_NoChannel;
    LastRC = *iRet;
    return;
  }

  k2 = GetChannel ( *iUnit2 );
  if (k2<0)  {
    *iRet  = RWBERR_NoChannel;
    LastRC = *iRet;
    return;
  }

  atom = Channel[k1]->GetAtomI ( Channel[k1]->fPos );
  *iRet = RWBERR_Ok;

  if (!atom)  {
    *iRet  = RWBERR_EmptyPointer;  // atom position was not advanced
                                   // properly
    LastRC = *iRet;
    return;
  }

  RC = Channel[k2]->MMDBManager->PutAtom ( Channel[k2]->fPos,atom,
					   atom->serNum );
  if (RC)  {
    *iRet  = RWBERR_Error2;  // should never happen
    LastRC = *iRet;
    return;
  }

  LastSer = atom->serNum;

}


FORTRAN_SUBR ( MMDB_F_COORD, mmdb_f_coord,
               (    // lengths-at-end list
                int * iUnit,    // unit number
                fpstr XFlag,    // "F" or "O" flag for the fractional
                                // or orthogonal coordinates x,y,z
                                // for output files XFlag may also be
                                // set to "HF" or "HO", where "F" and
                                // "O" have the same meaning as before
                                // and "H" indicates that the atom
                                // should be marked as heteroatom
                fpstr BFlag ,   // "F" or "O" flag for temperature
                                // factor in fractional or orthogonal
                                // Us
                apireal * x,    // x-coordinate
                apireal * y,    // y-coordinate
                apireal * z,    // z-coordinate
                apireal * occ,  // occupancy
                apireal * BIso, // isotropic temperature factor
                apireal * U,    // array(6) of the anisotr. t-factor
                int * iRet,     // returns
                                //  RWBERR_NoChannel     if iUnit was not
                                //                       initialized
                                //  RWBERR_EmptyPointer  if atom was not
                                //                       advanced
                                //  RWBERR_NoMatrices    if transformation
                                //                       matrices are
                                //                       undefined
                                //  RWBERR_NoCoordinates if coordinates were
                                //                       not set in the atom
                                //
                                //  >=0 : success, warning flags:
                                //  RWBERR_NoOccupancy   if occupancy was  
                                //                       not set in the atom
                                //  RWBERR_NoTempFactor  if temp. factor was
                                //                       not set in the atom
                                //
                int XFlag_len,  // fortran-hidden length of XFlag
                int BFlag_len   // fortran-hidden length of BFlag
               ), ( // lengths-in-structure list
                int * iUnit,   fpstr XFlag,    fpstr BFlag,
                apireal * x,   apireal * y,    apireal * z,
                apireal * occ, apireal * BIso, apireal * U,
                int * iRet
               ), ( // lengths-follow list
                int * iUnit,
                fpstr XFlag,   int XFlag_len,
                fpstr BFlag,   int BFlag_len,
                apireal * x,   apireal * y,    apireal * z,
                apireal * occ, apireal * BIso, apireal * U,
                int * iRet
               ) )  {
realtype AU[6];
realtype xx,yy,zz;
int      k,i,m;
PCAtom   atom;

  strcpy ( LastFunc,"MMDB_F_Coord" );
  LastUnit = *iUnit;

  k = GetChannel ( *iUnit );
  if (k<0)  {
    *iRet  = RWBERR_NoChannel;
    LastRC = *iRet;
    return;
  }

  atom  = Channel[k]->GetAtomI ( Channel[k]->fPos );
  *iRet = RWBERR_Ok;

  if (!atom)  {
    *iRet  = RWBERR_EmptyPointer;  // atom position was not advanced properly
    LastRC = *iRet;
    return;
  }

  if ((FTN_STR(XFlag)[0]=='H') ||
      (FTN_STR(XFlag)[0]=='h'))  m = 1;
                           else  m = 0;

  if (Channel[k]->nRead==0)  {

    // reading the atomic coordinates

    if (atom->Ter)  {
      *x    = 0.0;
      *y    = 0.0;
      *z    = 0.0;
      *occ  = 1.0;
      *BIso = 1.0;
      U[0]  = 1.0;
      U[1]  = 0.0;
      U[2]  = 0.0;
      U[3]  = 0.0;
      U[4]  = 0.0;
      U[5]  = 0.0;
    } else  {

      if (atom->WhatIsSet & ASET_Coordinates)  {
        if ((FTN_STR(XFlag)[m]=='F') ||
            (FTN_STR(XFlag)[m]=='f'))  {
          //  receive fractional coordinates
          if (Channel[k]->areCrystMatrices())  {
            Channel[k]->Orth2Frac ( atom->x,atom->y,atom->z,xx,yy,zz );
            *x = (apireal)xx;
            *y = (apireal)yy;
            *z = (apireal)zz;
          } else  {
            *x = (apireal)atom->x;
            *y = (apireal)atom->y;
            *z = (apireal)atom->z;
            *iRet = RWBERR_NoMatrices;
          }
        } else  {
          // receive orthogonal coordinates
          *x = (apireal)atom->x;
          *y = (apireal)atom->y;
          *z = (apireal)atom->z;
        }
      } else  {
        *x = 0.0;
        *y = 0.0;
        *z = 0.0;
        *iRet = RWBERR_NoCoordinates;
      }
 
      // calculate isotropic Uf from Uo, and convert it
      // if necessary
      if (atom->WhatIsSet & ASET_Anis_tFac)  {
        AU[0] = atom->u11;  // this intermediate array is
        AU[1] = atom->u22;  // required because of possible
        AU[2] = atom->u33;  // type difference between
        AU[3] = atom->u12;  // 'apireal' and 'realtype'
        AU[4] = atom->u13;
        AU[5] = atom->u23;
        *BIso = (apireal)(8.0*Pi*Pi*(AU[0]+AU[1]+AU[2])/3.0);
        if ((FTN_STR(BFlag)[0]=='F') ||
            (FTN_STR(BFlag)[0]=='f'))  {
          if (Channel[k]->areCrystMatrices())
             Channel[k]->Orth2Cryst ( AU );
          else if (*iRet==RWBERR_Ok)
             *iRet = RWBERR_NoMatrices;
        }
        for (i=0;i<6;i++)
          U[i] = (apireal)AU[i];
      } else  {
        for (i=0;i<6;i++)
          U[i] = 0.0;
        if (atom->WhatIsSet & ASET_tempFactor)
          U[0] = (apireal)atom->tempFactor;
        else if (*iRet>=RWBERR_Ok)
          *iRet |= RWBWAR_NoTempFactor;
        *BIso = U[0];
      }

      // get occupancy now
      if (atom->WhatIsSet & ASET_Occupancy)
        *occ = (apireal)atom->occupancy;
      else  {
        *occ = 0.0;
        if (*iRet>=RWBERR_Ok)  *iRet |= RWBWAR_NoOccupancy;
      }

    }

  } else  {

    // storing the atomic coordinates

    if (atom->Ter)  {
      atom->x = 0.0;
      atom->y = 0.0;
      atom->z = 0.0;
      atom->WhatIsSet |= ASET_Coordinates;
      atom->occupancy  = 1.0;
      atom->tempFactor = 1.0;
      atom->u11 = 0.0;
      atom->u22 = 0.0;
      atom->u33 = 0.0;
      atom->u12 = 0.0;
      atom->u13 = 0.0;
      atom->u23 = 0.0;
    } else  {

      if ((FTN_STR(XFlag)[m]=='F') ||
          (FTN_STR(XFlag)[m]=='f'))  {
        //  convert fractional coordinates
        if (Channel[k]->areCrystMatrices())  {
          xx = *x;
          yy = *y;
          zz = *z;
          Channel[k]->Frac2Orth ( xx,yy,zz,atom->x,atom->y,atom->z );
          atom->WhatIsSet |= ASET_Coordinates;
        } else  {
          atom->x = *x;
          atom->y = *y;
          atom->z = *z;
          *iRet   = RWBERR_NoMatrices;
          atom->WhatIsSet &= ~ASET_Coordinates;
        }
      } else  {
        // store orthogonal coordinates
        atom->x = *x;
        atom->y = *y;
        atom->z = *z;
        atom->WhatIsSet |= ASET_Coordinates;
      }

      atom->Het = (m>0);
 
      // calculate isotropic Uf from Uo, and convert it
      // if necessary
      if ((U[1]!=0.0) || (U[2]!=0.0))  {
        for (i=0;i<6;i++)
          AU[i] = U[i];
        if ((FTN_STR(BFlag)[0]=='F') ||
            (FTN_STR(BFlag)[0]=='f'))  {
          if (Channel[k]->areCrystMatrices())
                Channel[k]->Cryst2Orth ( AU );
          else  *iRet = RWBERR_NoMatrices;
        }
        *BIso = (apireal)(8.0*Pi*Pi*(AU[0]+AU[1]+AU[2])/3.0);
        atom->tempFactor = *BIso;
        atom->u11 = AU[0]; 
        atom->u22 = AU[1];  
        atom->u33 = AU[2];  
        atom->u12 = AU[3];  
        atom->u13 = AU[4];
        atom->u23 = AU[5];
        atom->WhatIsSet |= ASET_tempFactor | ASET_Anis_tFac;
      } else  {
        *BIso = U[0];
        atom->tempFactor = *BIso;
        atom->u11 = 0.0;
        atom->u22 = 0.0;
        atom->u33 = 0.0;
        atom->u12 = 0.0;
        atom->u13 = 0.0;
        atom->u23 = 0.0;
        atom->WhatIsSet |= ASET_tempFactor;
      }

      // store occupancy now
      atom->occupancy = *occ;
      atom->WhatIsSet |= ASET_Occupancy;

    }

  }

  LastRC = *iRet;

}



FORTRAN_SUBR ( MMDB_F_SETCELL, mmdb_f_setcell,
               (   //   lengths-at-end list
                int     * iUnit,    // unit number
                apireal * a,        // cell parameter a, angstroms
                apireal * b,        // cell parameter b, angstroms
                apireal * c,        // cell parameter c, angstroms
                apireal * alpha,    // cell parameter alpha, degrees
                apireal * beta,     // cell parameter beta,  degrees
                apireal * gamma,    // cell parameter gamma, degrees
                int     * ArgNCode, // orthogonalization code, 1-6
                int     * iRet      // return code:
                                    //   RWBERR_Ok  - success
                                    //   RWBERR_NoChannel     if unit
                                    //              iUnit was not
                                    //              initialized
                                    //   RWBERR_NoFile        if unit
                                    //              has been disposed
                                    //   RWBERR_Disagreement  if a
                                    //              disagreement in
		                    //              cell parameters
		                    //              was found
		                    //   RWBERR_NoOrthCode    if no
                                    //              orthogonalization
		                    //              code was found
		                    //   RWBERR_NoCheck       if check
		                    //              of cell parameters
		                    //              has failed.
                                    //   The last three returns would
		                    // rather indicate a programming
		                    // error in mmdb_rwbrook.cpp
               ), ( // lengths-in-structure list
                int     * iUnit,
                apireal * a,        apireal * b,    apireal * c,
                apireal * alpha,    apireal * beta, apireal * gamma,
                int     * ArgNCode, int     * iRet
               ), ( // lengths-follow list
                int     * iUnit,
                apireal * a,        apireal * b,    apireal * c,
                apireal * alpha,    apireal * beta, apireal * gamma,
                int     * ArgNCode, int     * iRet
               ) )  {
int  k;

  strcpy ( LastFunc,"MMDB_F_SetCell" );
  if (*iUnit>0)
    LastUnit = *iUnit;

  k = GetChannel ( LastUnit );
  if (k<0)  
    *iRet = RWBERR_NoChannel;
  else  
    *iRet = Channel[k]->SetCell ( *a,*b,*c,*alpha,*beta,*gamma,
                                  *ArgNCode );

  LastRC = *iRet;

}


FORTRAN_SUBR ( MMDB_F_WBSPGRP, mmdb_f_wbspgrp,
               (   //   lengths-at-end list
                int   * iUnit,  // unit number; *iUnit<=0 means
                                // "the last mentioned unit"
                fpstr spGroup,  // space group
                int   * iRet,   // return code:
                                //   RWBERR_Ok  - success
                                //   RWBERR_NoChannel     if unit
                                //              iUnit was not
                                //              initialized
                                //   RWBERR_NoFile        if unit
                                //              has been disposed
                int spGroup_len // fortran-hidden length of spGroup
               ), ( // lengths-in-structure list
                int * iUnit, fpstr spGroup, int * iRet
               ), ( // lengths-follow list
                int * iUnit, fpstr spGroup, int spGroup_len,
                int * iRet
               )
	     )  {
int      k;
SymGroup spaceGroup;

  strcpy ( LastFunc,"MMDB_F_WBSpGrp" );
  if (*iUnit>0)
    LastUnit = *iUnit;

  k = GetChannel ( LastUnit );
  if (k<0)  
    *iRet = RWBERR_NoChannel;
  else  {
//    GetStrTer ( spaceGroup,FTN_STR(spGroup),0,
//                sizeof(spaceGroup),FTN_LEN(spGroup) );
    strcpy_ncss(spaceGroup,FTN_STR(spGroup),IMin(FTN_LEN(spGroup),
                 sizeof(spaceGroup)-1) );
    *iRet = Channel[k]->SetSpGroup ( spaceGroup );
  }

  LastRC = *iRet;

}



FORTRAN_SUBR ( MMDB_F_RBSPGRP, mmdb_f_rbspgrp,
               (   //   lengths-at-end list
                int   * iUnit,  // unit number; *iUnit<=0 means
                                // "the last mentioned unit"
                fpstr spGroup,  // space group
                int   * iRet,   // return code:
                                //   RWBERR_Ok  - success
                                //   RWBERR_NoChannel     if unit
                                //              iUnit was not
                                //              initialized
                                //   RWBERR_NoFile        if unit
                                //              has been disposed
                int spGroup_len // fortran-hidden length of spGroup
               ), ( // lengths-in-structure list
                int * iUnit, fpstr spGroup, int * iRet
               ), ( // lengths-follow list
                int * iUnit, fpstr spGroup, int spGroup_len,
                int * iRet
               )
	     )  {
int  k;
char SpaceGroup[100];

  strcpy ( LastFunc,"MMDB_F_RBSpGrp" );
  if (*iUnit>0)
    LastUnit = *iUnit;

  SpaceGroup[0] = char(0);
  k = GetChannel ( LastUnit );
  if (k<0)  *iRet = RWBERR_NoChannel;
      else  *iRet = Channel[k]->GetSpGroup ( SpaceGroup );

// all extra "superficial spaces" are killed in the following
  CutSpaces ( SpaceGroup,SCUTKEY_BEGEND );
  strcpy_ns ( FTN_STR(spGroup),SpaceGroup,FTN_LEN(spGroup) );

  LastRC = *iRet;

}



FORTRAN_SUBR ( MMDB_F_WBCELL , mmdb_f_wbcell,
               (    // lengths-at-end list
                int     * iUnit,    // unit number; *iUnit<=0 means
                                    // "the last mentioned unit"
                apireal * ArgCell,  // array to accept the cell parameters
                                    // if ArgCell(1) is set to 0, then
                                    // the cell does not change
                int     * ArgNCode, // orthogonalisation code
                                    // if ArgNCode is set to 0, then
                                    // the orthogonalisation matrices
                                    // do not change
                int     * iRet      // return code
                                    //   RWBERR_Ok  - success
                                    //   RWBERR_NoChannel     if unit
                                    //              iUnit was not
                                    //              initialized
                                    //   RWBERR_NoFile        if unit
                                    //              has been disposed
               ), ( // lengths-in-structure list
                int * iUnit,    apireal * ArgCell,
                int * ArgNCode, int     * iRet
               ), ( // lengths-follow list
                int * iUnit,    apireal * ArgCell,
                int * ArgNCode, int     * iRet
               )
             )  {
int k;

  strcpy ( LastFunc,"MMDB_F_WBCell" );
  if (*iUnit>0)
    LastUnit = *iUnit;

  k = GetChannel ( LastUnit );
  if (k<0)  
    *iRet = RWBERR_NoChannel;
  else  
    *iRet = Channel[k]->PutCell ( ArgCell[0],ArgCell[1],ArgCell[2],
                                  ArgCell[3],ArgCell[4],ArgCell[5],
                                  *ArgNCode );

  LastRC = *iRet;

}



FORTRAN_SUBR ( MMDB_F_RBCELL, mmdb_f_rbcell,
               (    // lengths-at-end list
                int     * iUnit,    // unit number
                apireal * celld,    // array to accept the cell parameters
                apireal * cvol,     // returns the cell volume
                int     * iRet      // return code
		                    //   RWBERR_Ok  - success
		                    //   RWBERR_NoChannel     if unit
		                    //              iUnit was not
		                    //              initialized
		                    //   RWBERR_NoFile        if unit
		                    //              has been disposed
		                    //   RWBERR_Parameters    if the
		                    //              cell parameters
		                    //              were not set
		                    //   RWBERR_NoOrthCode    if no
                                    //              orthogonalization
		                    //              code was found
		                    //   RWBERR_NoCheck       if check
		                    //              of cell parameters
		                    //              has failed.
                                    //   The last three returns would
		                    // rather indicate a programming
		                    // error in mmdb_rwbrook.cpp
               ), ( // lengths-in-structure list
                int     * iUnit,  apireal * celld,
                apireal * cvol,   int     * iRet
               ), ( // lengths-follow list
                int     * iUnit,  apireal * celld,
                apireal * cvol,   int     * iRet
               ) )  {
realtype p[6];
realtype v;
int      k,i,nc;

  strcpy ( LastFunc,"MMDB_F_RBCell" );
  if (*iUnit>0)
    LastUnit = *iUnit;

  k = GetChannel ( LastUnit );
  if (k<0)  {
    *iRet  = RWBERR_NoChannel;
    LastRC = *iRet;
    return;
  }

  *iRet = Channel[k]->GetCell ( p[0],p[1],p[2],p[3],p[4],p[5],v,nc );

  if (*iRet==RWBERR_Ok)  {
    for (i=0;i<6;i++)
      celld[i] = (apireal)p[i];
    *cvol = (apireal)v;
  }

  LastRC = *iRet;

}



FORTRAN_SUBR ( MMDB_F_RBCELLN, mmdb_f_rbcelln,
               (    // lengths-at-end list
                int     * iUnit,    // unit number
                apireal * celld,    // array to accept the cell parameters
                apireal * cvol,     // returns the cell volume
                int     * ArgNCode, // returns the orthogonalization code, 1-6
                int     * iRet      // return code
		                    //   RWBERR_Ok  - success
		                    //   RWBERR_NoChannel     if unit
		                    //              iUnit was not
		                    //              initialized
		                    //   RWBERR_NoFile        if unit
		                    //              has been disposed
		                    //   RWBERR_Parameters    if the
		                    //              cell parameters
		                    //              were not set
		                    //   RWBERR_NoOrthCode    if no
                                    //              orthogonalization
		                    //              code was found
		                    //   RWBERR_NoCheck       if check
		                    //              of cell parameters
		                    //              has failed.
                                    //   The last three returns would
		                    // rather indicate a programming
		                    // error in mmdb_rwbrook.cpp
               ), ( // lengths-in-structure list
                int * iUnit,    apireal * celld, apireal * cvol,
                int * ArgNCode, int     * iRet
               ), ( // lengths-follow list
                int * iUnit,    apireal * celld, apireal * cvol,
                int * ArgNCode, int     * iRet
               ) )  {
realtype p[6];
realtype v;
int      k,i,nc;

  strcpy ( LastFunc,"MMDB_F_RBCellN" );
  if (*iUnit>0)
    LastUnit = *iUnit;

  k = GetChannel ( LastUnit );
  if (k<0)  {
    *iRet  = RWBERR_NoChannel;
    LastRC = *iRet;
    return;
  }
  
  *iRet = Channel[k]->GetCell ( p[0],p[1],p[2],p[3],p[4],p[5],v,nc );
  if (*iRet==RWBERR_Ok)  {
    for (i=0;i<6;i++)
      celld[i] = (apireal)p[i];
    *cvol     = (apireal)v;
    *ArgNCode = nc;
  }

  LastRC = *iRet;

}



FORTRAN_SUBR ( MMDB_F_RBRCEL, mmdb_f_rbrcel,
               (    // lengths-at-end list
                int     * iUnit,    // unit number
                apireal * rcell,    // array to accept the reciprocal
                                    // cell parameters
                apireal * rvol,     // returns the reciprocal cell volume
                int     * iRet      // return code
		                    //   RWBERR_Ok  - success
		                    //   RWBERR_NoChannel     if unit
		                    //              iUnit was not
		                    //              initialized
		                    //   RWBERR_NoFile        if unit
		                    //              has been disposed
		                    //   RWBERR_Parameters    if the
		                    //              cell parameters
		                    //              were not set
		                    //   RWBERR_NoOrthCode    if no
                                    //              orthogonalization
		                    //              code was found
		                    //   RWBERR_NoCheck       if check
		                    //              of cell parameters
		                    //              has failed.
                                    //   The last three returns would
		                    // rather indicate a programming
		                    // error in mmdb_rwbrook.cpp
               ), ( // lengths-in-structure list
                int * iUnit,    apireal * rcell, apireal * rvol,
                int * iRet
               ), ( // lengths-follow list
                int * iUnit,    apireal * rcell, apireal * rvol,
                int * iRet
               ) )  {
realtype p[6];
realtype v;
int      k,i;

  strcpy ( LastFunc,"MMDB_F_RBRCel" );
  if (*iUnit>0)
    LastUnit = *iUnit;

  k = GetChannel ( LastUnit );
  if (k<0)  {
    *iRet  = RWBERR_NoChannel;
    LastRC = *iRet;
    return;
  }
  
  *iRet = Channel[k]->GetRCell ( p[0],p[1],p[2],p[3],p[4],p[5],v );
  if (*iRet==RWBERR_Ok)  {
    for (i=0;i<6;i++)
      rcell[i] = (apireal)p[i];
    *rvol = (apireal)v;
  }

  LastRC = *iRet;

}



FORTRAN_SUBR ( MMDB_F_RBORF, mmdb_f_rborf,
               (     // lengths-at-end list
                int     * iUnit, // unit number
                apireal * RO,    // array for orthogonalising matrix
                apireal * RF,    // array for fractionalising matrix
                int     * LCode, // buffer for orthogonalisation code
                int     * iRet   // return code:
                                 //   RWBERR_Ok  - success
                                 //   RWBERR_NoChannel     if unit
                                 //              iUnit was not
                                 //              initialized
                                 //   RWBERR_NoFile        if unit
                                 //              has been disposed
                                 //   RWBERR_NoMatrices    if the
                                 //              orthogonalisation
                                 //              matrices were not
                                 //              calculated 
               ), (  // lengths-in-structure list
                int * iUnit, apireal * RO, apireal * RF,
                int * LCode, int * iRet
               ), (  // lengths-follow list
                int * iUnit, apireal * RO, apireal * RF,
                int * LCode, int * iRet )
               )  {
int         i,j,k,l;
PCMMDBCryst Cryst;

  strcpy ( LastFunc,"MMDB_F_RBORF" );
  if (*iUnit>0)
    LastUnit = *iUnit;

  k = GetChannel ( LastUnit );
  if (k<0)  {
    *iRet  = RWBERR_NoChannel;
    LastRC = *iRet;
    return;
  }

  Cryst = Channel[k]->GetCryst();
  if (Cryst==NULL)  {
    *iRet  = RWBERR_NoFile;
    LastRC = *iRet;
    return;
  }

  *iRet = RWBERR_Ok;

  l = 0;

  if (RO[0]<=0.0000000001)  {
    for (j=0;j<4;j++)
      for (i=0;i<4;i++)  {
        RF[l] = (apireal)Cryst->RF[i][j];
        RO[l] = (apireal)Cryst->RO[i][j];
        l++;
      }
    *LCode = Cryst->NCode;
    if (!(Cryst->WhatIsSet & CSET_Transforms))
      *iRet = RWBERR_NoMatrices;
  } else  {
    for (j=0;j<4;j++)
      for (i=0;i<4;i++)  {
        Cryst->RF[i][j] = RF[l];
        Cryst->RO[i][j] = RO[l];
        l++;
      }
    Cryst->NCode = *LCode;
    Cryst->WhatIsSet |= CSET_Transforms;
  }

  LastRC = *iRet;

}


FORTRAN_SUBR ( MMDB_F_ORTHMAT, mmdb_f_orthmat,
               (     // lengths-at-end list
                int     * iUnit, // unit number; *iUnit<=0 means
                                 // "the last mentioned unit"
                apireal * Cell,  // array of cell parameters:
                                 //  Cell(1) - a   Cell(4) - alpha
                                 //  Cell(2) - b   Cell(5) - beta
                                 //  Cell(3) - c   Cell(6) - gamma
                apireal * Vol,   // returns cell volume
                apireal * RRR,   // array (3,3,6), returns
                                 // orthogonalisation matrices
                int     * iRet   // return code:
                                 //   RWBERR_Ok  - success
                                 //   RWBERR_NoChannel     if unit
                                 //              iUnit was not
                                 //              initialized
                                 //   RWBERR_NoFile        if unit
                                 //              has been disposed
                                 //   RWBERR_NoMatrices    if the
                                 //              orthogonalisation
                                 //              matrices were not
                                 //              calculated
               ), ( // lengths-in-structure list
                int     * iUnit, apireal * Cell, apireal * Vol,
                apireal * RRR,   int * iRet
               ), ( // lengths-follow list
                int     * iUnit, apireal * Cell, apireal * Vol,
                apireal * RRR,   int * iRet
               )
             )  {
int         i,j,k,l,m;
PCMMDBCryst Cryst;
realtype    CelDel;

  strcpy ( LastFunc,"MMDB_F_OrthMat" );
  if (*iUnit>0)
    LastUnit = *iUnit;

  k = GetChannel ( LastUnit );
  if (k<0)  {
    *iRet  = RWBERR_NoChannel;
    LastRC = *iRet;
    return;
  }

  Cryst = Channel[k]->GetCryst();
  if (Cryst==NULL)  {
    *iRet  = RWBERR_NoFile;
    LastRC = *iRet;
    return;
  }

  CelDel = 0.0;
  if (Cell[0]>0.0)  {
    if ((Cryst->WhatIsSet & CSET_CellParams)==CSET_CellParams)  {
      CelDel = fabs((Cell[0]-Cryst->a)/Cell[0]);
      if (Cell[1]!=0.0)
        CelDel = RMax(CelDel,fabs((Cell[1]-Cryst->b)/Cell[1]));
      if (Cell[2]!=0.0)
        CelDel = RMax(CelDel,fabs((Cell[2]-Cryst->c)/Cell[2]));
      if (Cell[3]!=0.0)
        CelDel = RMax(CelDel,fabs((Cell[3]-Cryst->alpha)/Cell[3]));
      if (Cell[4]!=0.0)
        CelDel = RMax(CelDel,fabs((Cell[4]-Cryst->beta )/Cell[4]));
      if (Cell[5]!=0.0)
        CelDel = RMax(CelDel,fabs((Cell[5]-Cryst->gamma)/Cell[5]));
      if (FSimRWBROOK && (CelDel>0.01))
        printf ( "\n Inconsistency in Cell Dimensions"
                 " - replacing old:\n"
                 " Old cell:   "
                 "%10.5f%10.5f%10.5f%10.5f%10.5f%10.5f\n"
                 " New cell:   "
                 "%10.5f%10.5f%10.5f%10.5f%10.5f%10.5f\n",
                 Cryst->a,Cryst->b,Cryst->c,
                 Cryst->alpha,Cryst->beta,Cryst->gamma,
                 Cell[0],Cell[1],Cell[2],Cell[3],Cell[4],Cell[5] );
    }
    Cryst->a     = Cell[0];
    Cryst->b     = Cell[1];
    Cryst->c     = Cell[2];
    Cryst->alpha = Cell[3];
    Cryst->beta  = Cell[4];
    Cryst->gamma = Cell[5];
    Cryst->WhatIsSet |= CSET_CellParams;
  } else  {
    Cell[0] = (apireal)Cryst->a;
    Cell[1] = (apireal)Cryst->b;
    Cell[2] = (apireal)Cryst->c;
    Cell[3] = (apireal)Cryst->alpha;
    Cell[4] = (apireal)Cryst->beta;
    Cell[5] = (apireal)Cryst->gamma;
  }

  if ((Cryst->WhatIsSet & CSET_CellParams)!=CSET_CellParams)  {
    *iRet  = RWBERR_NoCellParams;
    LastRC = *iRet;
    return;
  }

  *iRet  = RWBERR_Ok;

  //  Cryst->CalcOrthMatrices();  <-- old version, changed 09.01.2004
  Cryst->CalcCoordTransforms();
  Cryst->WhatIsSet |= CSET_Transforms;

  if (CelDel>0.01)  *Vol = -(apireal)Cryst->Vol;
              else  *Vol =  (apireal)Cryst->Vol;

  l = 0;
  for (j=0;j<3;j++)
    for (i=0;i<3;i++)
      for (m=0;m<6;m++)
        RRR[l++] = (apireal)Cryst->RR[m][j][i];

  LastRC = *iRet;

}


FORTRAN_SUBR ( MMDB_F_CVANISOU, mmdb_f_cvanisou,
               (     // lengths-at-end list
                int     * iUnit, // unit number; *iUnit<=0 means
                                 // "the last mentioned unit"
                apireal * U,     // array of coordinates to convert
                int     * iFlag, // =0: convert from fract. to orthog.
                                 // =1: convert from orthog. to fract.
                int     * iRet   // return code:
                                 //   RWBERR_Ok  - success
                                 //   RWBERR_NoChannel     if unit
                                 //              iUnit was not
                                 //              initialized
                                 //   RWBERR_NoFile        if unit
                                 //              has been disposed
                                 //   RWBERR_NoMatrices    if the
                                 //              orthogonalisation
                                 //              matrices were not
                                 //              calculated
               ), ( // lengths-in-structure list
                int * iUnit, apireal * U, int * iFlag, int * iRet
               ), ( // lengths-follow list
                int * iUnit, apireal * U, int * iFlag, int * iRet
               )
             )  {
int         k,i;
PCMMDBCryst Cryst;
realtype    U1[6];

  strcpy ( LastFunc,"MMDB_F_CVAnisou" );
  if (*iUnit>0)
    LastUnit = *iUnit;

  k = GetChannel ( LastUnit );
  if (k<0)  {
    *iRet  = RWBERR_NoChannel;
    LastRC = *iRet;
    return;
  }

  Cryst = Channel[k]->GetCryst();
  if (Cryst==NULL)  {
    *iRet  = RWBERR_NoFile;
    LastRC = *iRet;
    return;
  }

  *iRet = RWBERR_Ok;
  for (i=0;i<6;i++)
    U1[i] = U[i];

  if (iFlag==0)  {
    if (!Cryst->Cryst2Orth(U1))  *iRet = RWBERR_NoMatrices;
  } else  {
    if (!Cryst->Orth2Cryst(U1))  *iRet = RWBERR_NoMatrices;
  }

  if (*iRet==RWBERR_Ok)
    for (i=0;i<6;i++)
      U[i] = (apireal)U1[i];

  LastRC = *iRet;

}



FORTRAN_SUBR ( MMDB_F_WREMARK, mmdb_f_wremark,
               (    // lengths-at-end list
                int     * iUnit, // unit number; *iUnit<=0 means
                                 // "the last mentioned unit"
                fpstr     Line,  // line to be added
                int     * iRet,  // return code:
                                 //   RWBERR_Ok  - success
                                 //   RWBERR_NoChannel     if unit
                                 //              iUnit was not
                                 //              initialized
                                 //   RWBERR_NoFile        if unit
                                 //              has been disposed
                                 // other return codea are those
                                 // returned by xyzopen1_(..)
                int    Line_len  // fortran-hidden length of Line
               ), ( // lengths-in-structure list
                int * iUnit, fpstr Line, int * iRet
               ), ( // lengths-follow list
                int * iUnit, fpstr Line, int Line_len, int *iRet
               )
             )  {
int  k;
char S[500];

  strcpy ( LastFunc,"MMDB_F_WRemark" );
  if (*iUnit>0)
    LastUnit = *iUnit;

  k = GetChannel ( LastUnit );
  if (k<0)  {
    *iRet  = RWBERR_NoChannel;
    LastRC = *iRet;
    return;
  }

  if (Channel[k]->MMDBManager)  {
    GetStrTer ( S,FTN_STR(Line),FTN_LEN(Line),sizeof(S),FTN_LEN(Line) );
    *iRet =  Channel[k]->MMDBManager->PutPDBString ( S );
  } else
    *iRet = RWBERR_NoFile;

  LastRC = *iRet;
  
}


/*
FORTRAN_SUBR ( RBRINV, rbrinv,
               ( apireal * A, apireal * AI ),
               ( apireal * A, apireal * AI ),
               ( apireal * A, apireal * AI ) )  {
mat44  A1,AI1;
int    i,j,k;

  k = 0;
  for (j=0;j<4;j++)
    for (i=0;i<4;i++)
      A1[j][i] = A[k++];

  Mat4Inverse ( A1,AI1 );

  k = 0;
  for (j=0;j<4;j++)
    for (i=0;i<4;i++)
      AI[k++] = AI1[j][i];

}
*/
/*
FORTRAN_SUBR ( RES3TO1, res3to1,
               (     // lengths-at-end list
                fpstr ResNm3,   // 3-char name, 4th char
                                // will be set blank
                fpstr ResNm1,   // 1-char name
                int ResNm3_len, // fortran-hidden length of ResNm3
                int ResNm1_len  // fortran-hidden length of ResNm3
               ), ( // lengths-in-structure list
                fpstr ResNm3, fpstr ResNm1
               ), ( // lengths-follow list
                fpstr ResNm3, int ResNm3_len,
                fpstr ResNm1, int ResNm1_len
               )
             )  {
int i;

  if (FTN_STR(ResNm3)[0]==' ')  {
    for (i=0;i<nResNames;i++)
      if ((FTN_STR(ResNm3)[0]==ResidueName[i][0]) &&
          (FTN_STR(ResNm3)[1]==ResidueName[i][1]) &&
          (FTN_STR(ResNm3)[2]==ResidueName[i][2]))  {
        FTN_STR(ResNm1)[0] = ResidueName1[i];
        return;
      }
    FTN_STR(ResNm1)[0] = ResidueName1[nResNames-1];
    return;
  }

  if (FTN_STR(ResNm1)[0]==' ')  {
    for (i=0;i<nResNames;i++)
      if (FTN_STR(ResNm1)[0]==ResidueName1[i])  {
        FTN_STR(ResNm3)[0] = ResidueName[i][0];
        FTN_STR(ResNm3)[1] = ResidueName[i][1];
        FTN_STR(ResNm3)[2] = ResidueName[i][2];
        FTN_STR(ResNm3)[3] = ' ';
        return;
      }
    FTN_STR(ResNm3)[0] = ResidueName[nResNames-1][0];
    FTN_STR(ResNm3)[1] = ResidueName[nResNames-1][1];
    FTN_STR(ResNm3)[2] = ResidueName[nResNames-1][2];
    FTN_STR(ResNm3)[3] = ' ';
    return;
  }

}
*/

static pstr MSG_NoChannel       = pstr("unassigned unit");
static pstr MSG_NoFile          = pstr("unassigned unit or disposed file");
static pstr MSG_NoLogicalName   = pstr("logical name does not exist");

static pstr MSG_CantOpenFile    = pstr("cannot open a file");
static pstr MSG_WrongInteger    = pstr("unrecognized integer at reading a file");
static pstr MSG_WrongModelNo    = pstr("wrong model number read from a file");
static pstr MSG_DuplicatedModel = pstr("duplicated model number");
static pstr MSG_ForeignFile     = pstr("unknown file format");
static pstr MSG_WrongEdition    = pstr("unknown file version");

static pstr MSG_ATOM_Unrecognd  = pstr("unrecognized data in coordinate section");
static pstr MSG_ATOM_AlreadySet = pstr("duplicate atom serial number");
static pstr MSG_ATOM_NoResidue  = pstr("residue for atom cannot be found");
static pstr MSG_ATOM_Unmatch    = pstr("ambiguous data in coordinate section");

static pstr MSG_NoAdvance       = pstr("atom position was not advanced");
static pstr MSG_EmptyPointer    = pstr("atom was not allocated");
static pstr MSG_NoMatrices      = pstr("no coordinate transformation matrices");

static pstr MSG_NoCoordinates   = pstr("no atom coordinates set");

static pstr MSG_Disagreement    = pstr("ambiguous cell parameters");
static pstr MSG_NoOrthCode      = pstr("no orthogonalization code");
static pstr MSG_NoCheck         = pstr("missing check of cell parameters");

static pstr MSG_NoCellParams    = pstr("no cell parameters");

static pstr MSG_NotACIFFile     = pstr("not a CIF file: 'data_' tag missing");
static pstr MSG_NoData          = pstr("expected data is not met at reading a file");
static pstr MSG_UnrecognCIFItems  = pstr("unrecognized CIF items (syntax error?)");
static pstr MSG_MissingCIFField   = pstr("missing CIF data field");
static pstr MSG_EmptyCIFLoop      = pstr("CIF loop does not contain any data");
static pstr MSG_UnexpEndOfCIF     = pstr("unexpected end of CIF file");
static pstr MSG_MissgCIFLoopField = pstr("CIF loop is incomplete");
static pstr MSG_NotACIFStructure  = pstr("wrong use of CIF structure (as a loop?)");
static pstr MSG_NotACIFLoop       = pstr("wrong use of CIF loop (as a structure?)");
static pstr MSG_WrongReal         = pstr("unrecognized real at reading a file");

static pstr MSG_WrongChainID      = pstr("Wrong or inconsistent chain ID");
static pstr MSG_WrongEntryID      = pstr("Wrong or insonsistent entry ID");
static pstr MSG_SEQRES_serNum     = pstr("Wrong serial number in SEQRES");
static pstr MSG_SEQRES_numRes     = pstr("Wrong number of residues in SEQRES");
static pstr MSG_SEQRES_extraRes   = pstr("Extra residues in SEQRES");
static pstr MSG_NCSM_Unrecogn     = pstr("Unrecognized item in NCSM cards");
static pstr MSG_NCSM_AlreadySet   = pstr("Attempt to reset NCSM");
static pstr MSG_NCSM_WrongSerial  = pstr("Wrong serial number in NCSM cards");
static pstr MSG_NCSM_UnmatchIG    = pstr("Unmatched IG parameter in NCSM cards");
static pstr MSG_NoModel           = pstr("MMDB's error in structuring models");
static pstr MSG_NoSheetID         = pstr("No sheet ID on SHEET card(s)");
static pstr MSG_WrongSheetID      = pstr("Wrong sheet ID on SHEET card(s)");
static pstr MSG_WrongStrandNo     = pstr("Wrong strand no. on SHEET card(s)");
static pstr MSG_WrongNofStrands   = pstr("Wrong number of strands in sheet");
static pstr MSG_WrongSheetOrder   = pstr("Wrong sheet ordering");
static pstr MSG_HBondInconsistency = pstr("Inconsistency in H-bonds");
static pstr MSG_EmptyResidueName  = pstr("No (blank) residue name");
static pstr MSG_DuplicateSeqNum   = pstr("Duplicated sequence number and insertion code");
static pstr MSG_GeneralError1     = pstr("MMDB's general error #1");


static pstr MSG_Error1          = pstr("internal error #1 -- report to developer");
static pstr MSG_Error2          = pstr("internal error #2 -- report to developer");
static pstr MSG_Error3          = pstr("internal error #3 -- report to developer");

static pstr MSG_Unknown         = pstr("unknown return code");


#define nWarnings  7

static int RWBWarCode[nWarnings] = {
  RWBWAR_RewOutput,
  RWBWAR_FileTop,
  RWBWAR_WrongSerial,
  RWBWAR_UnkFormFactor,
  RWBWAR_AmbFormFactor,
  RWBWAR_NoOccupancy,
  RWBWAR_NoTempFactor
};

static pstr RWBWarning[nWarnings] = {
  pstr("output file rewind"),
  pstr("rewind or backspace at top of file"),
  pstr("atom serial number does not match position"),
  pstr("unknown form factor encountered"),
  pstr("ambiguous form factor encountered"),
  pstr("occupancy was not set"),
  pstr("temperature factor was not set")
};



FORTRAN_SUBR ( RBERRSTOP, rberrstop,
               (   //    lengths-at-end list
                int * iPlace, // (unique) identificator inside an application
                int * iRet,   // return code to check
                int * iUnit,  // unit number
                int * iStop   // if 0 then stop if error
               ), ( // lengths-in-structure list
                int * iPlace, int * iRet,
                int * iUnit,  int * iStop
               ), ( // lengths-follow list
                int * iPlace, int * iRet,
                int * iUnit,  int * iStop
               ) )  {
int  i,k,lcount;
pstr Msg;
char ErrLine[500];

  strcpy ( ErrLine,"" );
  lcount = -11;
  k      = GetChannel(*iUnit);

  switch (*iRet)  {

    case RWBERR_Ok                : return;

    case RWBERR_NoChannel         : Msg = MSG_NoChannel;          break;
    case RWBERR_NoFile            : Msg = MSG_NoFile;             break;
    case RWBERR_NoLogicalName     : Msg = MSG_NoLogicalName;      break;
    case RWBERR_CantOpenFile      : Msg = MSG_CantOpenFile;       break;


    case RWBERR_WrongInteger      : Msg = MSG_WrongInteger;       break;
    case RWBERR_WrongModelNo      : Msg = MSG_WrongModelNo;       break;
    case RWBERR_DuplicatedModel   : Msg = MSG_DuplicatedModel;    break;

    case RWBERR_ForeignFile       : Msg = MSG_ForeignFile;        break;
    case RWBERR_WrongEdition      : Msg = MSG_WrongEdition;       break;

    case RWBERR_ATOM_Unrecognd    : Msg = MSG_ATOM_Unrecognd;     break;
    case RWBERR_ATOM_AlreadySet   : Msg = MSG_ATOM_AlreadySet;    break;
    case RWBERR_ATOM_NoResidue    : Msg = MSG_ATOM_NoResidue;     break;
    case RWBERR_ATOM_Unmatch      : Msg = MSG_ATOM_Unmatch;       break;

    case RWBERR_NoAdvance         : Msg = MSG_NoAdvance;          break;
    case RWBERR_EmptyPointer      : Msg = MSG_EmptyPointer;       break;
    case RWBERR_NoMatrices        : Msg = MSG_NoMatrices;         break;

    case RWBERR_NoCoordinates     : Msg = MSG_NoCoordinates;      break;

    case RWBERR_Disagreement      : Msg = MSG_Disagreement;       break;
    case RWBERR_NoOrthCode        : Msg = MSG_NoOrthCode;         break;
    case RWBERR_NoCheck           : Msg = MSG_NoCheck;            break;

    case RWBERR_NoCellParams      : Msg = MSG_NoCellParams;       break; 

    case RWBERR_NotACIFFile       : Msg = MSG_NotACIFFile;        break;
    case RWBERR_NoData            : Msg = MSG_NoData;             break;
    case RWBERR_UnrecognCIFItems  : Msg = MSG_UnrecognCIFItems;   break;
    case RWBERR_MissingCIFField   : Msg = MSG_MissingCIFField;    break;
    case RWBERR_EmptyCIFLoop      : Msg = MSG_EmptyCIFLoop;       break;
    case RWBERR_UnexpEndOfCIF     : Msg = MSG_UnexpEndOfCIF;      break;
    case RWBERR_MissgCIFLoopField : Msg = MSG_MissgCIFLoopField;  break;
    case RWBERR_NotACIFStructure  : Msg = MSG_NotACIFStructure;   break;
    case RWBERR_NotACIFLoop       : Msg = MSG_NotACIFLoop;        break;
    case RWBERR_WrongReal         : Msg = MSG_WrongReal;          break;

    case RWBERR_WrongChainID      : Msg = MSG_WrongChainID;       break;
    case RWBERR_WrongEntryID      : Msg = MSG_WrongEntryID;       break;
    case RWBERR_SEQRES_serNum     : Msg = MSG_SEQRES_serNum;      break;
    case RWBERR_SEQRES_numRes     : Msg = MSG_SEQRES_numRes;      break;
    case RWBERR_SEQRES_exraRes    : Msg = MSG_SEQRES_extraRes;    break;
    case RWBERR_NCSM_Unrecogn     : Msg = MSG_NCSM_Unrecogn;      break;
    case RWBERR_NCSM_AlreadySet   : Msg = MSG_NCSM_AlreadySet;    break;
    case RWBERR_NCSM_WrongSerial  : Msg = MSG_NCSM_WrongSerial;   break;
    case RWBERR_NCSM_UnmatchIG    : Msg = MSG_NCSM_UnmatchIG;     break;
    case RWBERR_NoModel           : Msg = MSG_NoModel;            break;
    case RWBERR_NoSheetID         : Msg = MSG_NoSheetID;          break;
    case RWBERR_WrongSheetID      : Msg = MSG_WrongSheetID;       break;
    case RWBERR_WrongStrandNo     : Msg = MSG_WrongStrandNo;      break;
    case RWBERR_WrongNofStrands   : Msg = MSG_WrongNofStrands;    break;
    case RWBERR_WrongSheetOrder   : Msg = MSG_WrongSheetOrder;    break;
    case RWBERR_HBondInconsis     : Msg = MSG_HBondInconsistency; break;
    case RWBERR_EmptyResidueName  : Msg = MSG_EmptyResidueName;   break;
    case RWBERR_DuplicateSeqNum   : Msg = MSG_DuplicateSeqNum;    break;
    case RWBERR_GeneralError1     : Msg = MSG_GeneralError1;      break;

    case RWBERR_Error1            : Msg = MSG_Error1;             break;
    case RWBERR_Error2            : Msg = MSG_Error2;             break;
    case RWBERR_Error3            : Msg = MSG_Error3;             break;
  
    default                     :
      if ((*iRet & RWBWAR_Warning)==RWBWAR_Warning)  {
        Msg = NULL;
        printf ( "\n \n *** Warning(s): point code unit    function\n" );
        printf ( " ***             %5i %4i %4i    %s\n",
                           *iPlace,*iRet,*iUnit,LastFunc );
        if (k>=0) 
          printf ( " *** file   : %s\n",Channel[k]->FName );
        for (i=0;i<nWarnings;i++)
          if ((*iRet & RWBWarCode[i])==RWBWarCode[i])  {
            Msg = RWBWarning[i];
            printf ( " *** warning: %s\n",Msg );
            if ((*iRet & RWBWAR_WrongSerial)==RWBWAR_WrongSerial)  {
              if (k>0)
                printf ( " *** position %i, serial number %i\n",
                         Channel[k]->fPos,LastSer );
              else
                printf ( " *** position unavailable, serial number %i\n",
                         LastSer );
	    }
          }
        if (!Msg)
          printf ( " *** warning: unknown warning code" );
        return;
      } else
        Msg = MSG_Unknown;
  }

  if ((k>=0) && (
      ((*iRet<=RWBERR_WrongInteger)   && (*iRet>=RWBERR_DuplicatedModel)) ||
      ((*iRet<=RWBERR_ATOM_Unrecognd) && (*iRet>=RWBERR_ATOM_Unmatch))    ||
      ((*iRet<=RWBERR_NoData)         && (*iRet>=RWBERR_DuplicateSeqNum))
     ))
    Channel[k]->GetInputBuffer ( ErrLine,lcount );

  printf ( " \n *** RWBROOK error: point code unit    function\n"    );
  printf ( " ***                %5i %4i %4i    %s\n",*iPlace,*iRet,
                                                     *iUnit,LastFunc );
  k = GetChannel(*iUnit);
  if (k>=0) 
    printf ( " *** file   : %s\n",Channel[k]->FName );

  printf ( " *** reason : %s\n",Msg );
  if (lcount>=0)
    printf ( " ***          at input line #%i:\n"
             " %s\n",lcount,ErrLine );
  else if (lcount==-1) 
    printf ( " ***          at taking the following data from CIF:\n"
             "              %s\n",ErrLine );

  if (*iStop==0)  {  // will stop it
    printf ( " *** Execution stopped.\n \n" );
    FORTRAN_CALL ( MMDB_F_QUIT, mmdb_f_quit,(),(),() );
    // xyzquit_();
    exit(0);
  } else     // just warn, but no guarantee that it will not crash
    printf ( " *** continue running, may crash ...\n \n" );

}



FORTRAN_SUBR ( RBCHECKERR, rbcheckerr,
               (   //    lengths-at-end list
                int * iPlace, // (unique) identificator inside an application
                int * iStop   // if 0 then stop if error
               ), ( // lengths-in-structure list
                int * iPlace, int * iStop
               ), ( // lengths-follow list
                int * iPlace, int * iStop
               ) )  {
  FORTRAN_CALL ( RBERRSTOP, rberrstop,
                 ( iPlace,&LastRC,&LastUnit,iStop ),
                 ( iPlace,&LastRC,&LastUnit,iStop ),
                 ( iPlace,&LastRC,&LastUnit,iStop ) );
}

