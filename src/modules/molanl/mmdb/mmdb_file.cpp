//  $Id: mmdb_file.cpp,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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
//    24.03.09   <--  Date of Last Modification.
//                   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//  -----------------------------------------------------------------
//
//  **** Module  :  MMDB_File  <implementation>
//       ~~~~~~~~~
//  **** Project :  MacroMolecular Data Base (MMDB)
//       ~~~~~~~~~
//  **** Classes :  CMMDBFile  ( macromolecular data file class )
//       ~~~~~~~~~
//
//  (C) E. Krissinel 2000-2009
//
//  =================================================================
//

#ifndef  __STRING_H
#include "string.h"
#endif

#ifndef  __STDLIB_H
#include "stdlib.h"
#endif

#ifndef  __MMDB_File__
#include "mmdb_file.h"
#endif

#ifndef  __MMDB_Atom__
#include "mmdb_atom.h"
#endif

#ifndef  __MMDB_MMCIF__
#include "mmdb_mmcif.h"
#endif

#ifndef  __MMDB_Defs__
#include "mmdb_defs.h"
#endif

#ifndef  __MMDB_CIFDefs__
#include "mmdb_cifdefs.h"
#endif

#ifndef  __MMDB_Tables__
#include "mmdb_tables.h"
#endif


//  =====================   CMMDBFile   =======================

CMMDBFile::CMMDBFile() : CUDData()  {
  InitMMDBFile();
}

CMMDBFile::CMMDBFile ( RPCStream Object ) : CUDData(Object)  {
  InitMMDBFile();
}

CMMDBFile::~CMMDBFile()  {
  FreeFileMemory();
}

void  CMMDBFile::InitMMDBFile()  {
  nModels = 0;
  Model   = NULL;
  nAtoms  = 0;
  AtmLen  = 0;
  Atom    = NULL;
  CIF     = NULL;
  crModel = NULL;
  crChain = NULL;
  crRes   = NULL;
  lcount  = 0;
  strcpy ( S,"" );
  Flags   = 0x00000000;           // no special effects
  FType   = MMDB_FILE_Undefined;  // undefined file operation
  Exclude = True;
  ignoreRemarks = False;  // used temporarily
  allowDuplChID = False;  // used temporarily
  modelCnt      = 0;      // used only at reading files
}


void  CMMDBFile::FreeCoordMemory()  {
  //int i;

/*
  //   All atoms are kept in array Atom. Models, chains
  // and residues have only references to Atom and
  // they do not dispose Atoms when disposed themselves.
  //   It is important, however, to dispose Atom at
  // still alive residues, because each atom wipes out
  // reference to itself from the corresponding residue
  // before it dies.
  if (Atom)  {
    for (i=0;i<AtmLen;i++)
      if (Atom[i]) delete Atom[i];
    delete Atom;
  }
  Atom    = NULL;
  AtmLen  = 0;
  nAtoms  = 0;
*/
  DeleteAllModels();
  if (Model)  delete[] Model;
  Model   = NULL;
  nModels = 0;

  crModel = NULL;
  crChain = NULL;
  crRes   = NULL;

  if (Atom)  delete[] Atom;

  Atom    = NULL;
  AtmLen  = 0;
  nAtoms  = 0;

  modelCnt = 0;

}

void  CMMDBFile::FreeFileMemory()  {

  FreeCoordMemory  ();
  Title.FreeMemory ( False );
  Cryst.FreeMemory ();

  SA      .FreeContainer();
  Footnote.FreeContainer();
  SB      .FreeContainer();
  SC      .FreeContainer();

  if (CIF)  delete CIF;
  CIF = NULL;

  lcount = 0;
  S[0]   = char(0);

}

// virtual to be served by MMDB manager classes
void CMMDBFile::ResetManager() {
  Cryst.Reset();
}

void CMMDBFile::SetFlag ( word Flag )  {
  Flags |= Flag;
  ignoreSegID   = (Flags & MMDBF_IgnoreSegID  )!=0;
  ignoreElement = (Flags & MMDBF_IgnoreElement)!=0;
  ignoreCharge  = (Flags & MMDBF_IgnoreCharge )!=0;
  ignoreNonCoorPDBErrors = (Flags & MMDBF_IgnoreNonCoorPDBErrors)!=0;
  ignoreUnmatch = (Flags & MMDBF_IgnoreUnmatch)!=0;
  allowDuplChID = (Flags & MMDBF_AllowDuplChainID )!=0;
} 

void CMMDBFile::RemoveFlag ( word Flag )  {
  Flags &= ~Flag;
  ignoreSegID   = (Flags & MMDBF_IgnoreSegID  )!=0;
  ignoreElement = (Flags & MMDBF_IgnoreElement)!=0;
  ignoreCharge  = (Flags & MMDBF_IgnoreCharge )!=0;
  ignoreNonCoorPDBErrors = (Flags & MMDBF_IgnoreNonCoorPDBErrors)!=0;
  ignoreUnmatch = (Flags & MMDBF_IgnoreUnmatch)!=0;
  allowDuplChID = (Flags & MMDBF_AllowDuplChainID )!=0;
}


int  CMMDBFile::ReadPDBASCII1 ( cpstr PDBLFName,
                                byte gzipMode )  {
pstr FName;
  FName = getenv ( PDBLFName );
  if (FName)  return ReadPDBASCII ( FName,gzipMode );
        else  return Error_NoLogicalName;
}

void CMMDBFile::ReadPDBLine ( RCFile f, pstr L, int maxlen )  {
int     i;
Boolean Done;
  do {
    f.ReadLine ( L,maxlen );
    Done = True;
    if (ignoreRemarks)  {
      if (!strncasecmp(L,"REMARK",6))  Done = False;
    }
    if (Flags & MMDBF_IgnoreBlankLines)  {
      i = 0;
      while (L[i] && (L[i]==' '))  i++;
      if (!L[i])  Done = False;
    }
    if ((Flags & MMDBF_IgnoreHash) && (L[0]=='#'))
      Done = False;
  } while ((!f.FileEnd()) && (!Done));
  PadSpaces  ( L,80 );
}

int  CMMDBFile::ReadPDBASCII ( cpstr PDBFileName,
                               byte gzipMode )  {
CFile f;
int   RC;

  //  open the file as ASCII for reading
  //  opening it in pseudo-binary mode helps reading various
  //  line terminators for files coming from different platforms
  f.assign ( PDBFileName,False,False,gzipMode );

  if (f.reset(True)) {

    RC = ReadPDBASCII ( f );
    f.shut();

  } else  {

    RC =  Error_CantOpenFile;
    ResetManager  ();
    FreeFileMemory();
    FType = MMDB_FILE_PDB;

  }

  return RC;

}


int  CMMDBFile::ReadPDBASCII ( RCFile f )  {
PCContString ContString;
word         cleanKey;
int          RC,modNum;
Boolean      fixSpaceGroup,fend;

  //  remove previous data
  ResetManager  ();
  FreeFileMemory();

  FType = MMDB_FILE_PDB;
  ignoreSegID   = (Flags & MMDBF_IgnoreSegID  )!=0;
  ignoreElement = (Flags & MMDBF_IgnoreElement)!=0;
  ignoreCharge  = (Flags & MMDBF_IgnoreCharge )!=0;
  ignoreNonCoorPDBErrors = (Flags & MMDBF_IgnoreNonCoorPDBErrors)!=0;
  ignoreUnmatch = (Flags & MMDBF_IgnoreUnmatch)!=0;
  ignoreRemarks = False;
  allowDuplChID = (Flags & MMDBF_AllowDuplChainID)!=0;
  fixSpaceGroup = (Flags & MMDBF_FixSpaceGroup   )!=0;

  if (f.FileEnd())  return Error_EmptyFile;

  lcount = 1;  // line counter

  // read title section
  RC = 0;
  ReadPDBLine ( f,S,sizeof(S) );
  if (Flags & MMDBF_EnforceSpaces)  EnforceSpaces ( S );
  do  {
    if (!strncmp(S,"FTNOTE",6))  {
      ContString = new CContString(S);
      Footnote.AddData ( ContString );
    } else  {
      RC = Title.ConvertPDBString(S);
      if ((RC!=Error_WrongSection) && ignoreNonCoorPDBErrors)
        RC = 0; 
      if (RC)  break;
    }
    fend = f.FileEnd();
    if (!fend)  {
      ReadPDBLine ( f,S,sizeof(S) );
      lcount++;
    }
  } while (!fend);

  if (RC!=Error_WrongSection)  return RC;

  ignoreRemarks = (Flags & MMDBF_IgnoreRemarks)!=0;

  // read primary structure section
  SwitchModel ( 1 );
  if (!crModel)  return Error_GeneralError1;
  do {
    if (!strncmp(S,"FTNOTE",6))  {
      ContString = new CContString(S);
      Footnote.AddData ( ContString );
    } else  {
      RC = crModel->ConvertPDBString(S);
      if ((RC!=Error_WrongSection) && ignoreNonCoorPDBErrors)
        RC = 0; 
      if (RC)  break;
    }
    fend = f.FileEnd();
    if (!fend)  {
      ReadPDBLine ( f,S,sizeof(S) );
      Title.TrimInput ( S );
      lcount++;
    }
  } while (!fend);

  if (RC!=Error_WrongSection)  return RC;

  // temporary solution: the rest of file is stored
  // in the form of strings
  while (!f.FileEnd()          && 
         strncmp(S,"CRYST" ,5) &&
         strncmp(S,"ORIGX" ,5) &&
         strncmp(S,"SCALE" ,5) &&
         strncmp(S,"MTRIX" ,5) &&
         strncmp(S,"TVECT" ,5) &&
         strncmp(S,"MODEL ",6) &&
         strncmp(S,"ATOM  ",6) &&
         strncmp(S,"SIGATM",6) &&
         strncmp(S,"ANISOU",6) &&
         strncmp(S,"SIGUIJ",6) &&
         strncmp(S,"TER   ",6) &&
         strncmp(S,"HETATM",6) &&
         strncmp(S,"ENDMDL",6))  {
    if (!strncmp(S,"LINK  ",6))
      crModel->ConvertPDBString(S);
    else if (!strncmp(S,"CISPEP",6)) {
      GetInteger ( modNum,&(S[43]),3 );
      if (modNum<=0)  modNum = 1;
      if (modNum!=1)  SwitchModel ( modNum );
      crModel->ConvertPDBString(S);
      if (modNum!=1)  SwitchModel ( 1 );
    } else  {
      ContString = new CContString(S);
      SA.AddData ( ContString );
    }
    ReadPDBLine ( f,S,sizeof(S) );
    Title.TrimInput ( S );
    lcount++;
  }

  // read crystallographic information section
  do {
    RC = Cryst.ConvertPDBString(S,fixSpaceGroup);
    if ((RC!=Error_WrongSection) && ignoreNonCoorPDBErrors)
      RC = 0; 
    if (RC)  break;
    fend = f.FileEnd();
    if (!fend)  {
      ReadPDBLine ( f,S,sizeof(S) );
      Title.TrimInput ( S );
      lcount++;
    }
  } while (!fend);

  if (!RC)  {
    RC = Cryst.ConvertPDBString(S,fixSpaceGroup);
    if ((RC!=Error_WrongSection) && ignoreNonCoorPDBErrors)
      RC = Error_WrongSection; 
  }

  Cryst.CalcCoordTransforms();
  if (Flags & MMDBF_SimRWBROOK)
    Cryst.RWBROOKReadPrintout();

  if (RC!=Error_WrongSection)  return RC;

  // temporary solution: the rest of file is stored
  // in the form of strings
  while (!f.FileEnd()          && 
         strncmp(S,"MODEL ",6) &&
         strncmp(S,"ATOM  ",6) &&
         strncmp(S,"SIGATM",6) &&
         strncmp(S,"ANISOU",6) &&
         strncmp(S,"SIGUIJ",6) &&
         strncmp(S,"TER   ",6) &&
         strncmp(S,"HETATM",6) &&
         strncmp(S,"ENDMDL",6))  {
    ContString = new CContString(S);
    SB.AddData ( ContString );
    ReadPDBLine ( f,S,sizeof(S) );
    Title.TrimInput ( S );
    lcount++;
  }

  if (Flags & MMDBF_NoCoordRead)  return 0;

  // read coordinate section
  RC = 0;
  do {
    RC = ReadPDBAtom ( S );
    if (RC)  break;
    fend = f.FileEnd();
    if (!fend)  {
      ReadPDBLine ( f,S,sizeof(S) );
      Title.TrimInput ( S );
      lcount++;
    }
  } while (!fend);
//  if (!RC)
//    RC = ReadPDBAtom(S);
//  commented on 28.05.2004, it appears that "CHAIN_ORDER" should not
//  be enforced here
//  cleanKey = PDBCLEAN_ATNAME | PDBCLEAN_CHAIN_ORDER;
  cleanKey = 0x00000000;
  if (Flags & MMDBF_EnforceAtomNames)
    cleanKey = PDBCLEAN_ATNAME;
  if (Flags & MMDBF_AutoSerials)
    cleanKey |= PDBCLEAN_SERIAL;

  if (cleanKey)
    PDBCleanup ( cleanKey );

  if ((!f.FileEnd()) && (RC!=Error_WrongSection))  return RC;

  // temporary solution: the rest of file is stored
  // in the form of strings
  while (!f.FileEnd())  {
    if (strncmp(S,"END   ",6))  {  // END is added automatically
      ContString = new CContString(S);
      SC.AddData ( ContString );
    }
    ReadPDBLine ( f,S,sizeof(S) );
    Title.TrimInput ( S );
    lcount++;
  }
  lcount--;  // last line was not read

  return 0;

}


int  CMMDBFile::ReadCIFASCII1 ( cpstr CIFLFName, byte gzipMode )  {
pstr FName;
  FName = getenv ( CIFLFName );
  if (FName)  return ReadCIFASCII ( FName,gzipMode );
        else  return Error_NoLogicalName;
}

int  CMMDBFile::ReadCIFASCII ( cpstr CIFFileName, byte gzipMode )  {
CFile f;
int   W;
Boolean fixSpaceGroup;

  //  remove previous data
  ResetManager  ();
  FreeFileMemory();
  FType = MMDB_FILE_CIF;
  ignoreSegID   = (Flags & MMDBF_IgnoreSegID  )!=0;
  ignoreElement = (Flags & MMDBF_IgnoreElement)!=0;
  ignoreCharge  = (Flags & MMDBF_IgnoreCharge )!=0;
  ignoreNonCoorPDBErrors = (Flags & MMDBF_IgnoreNonCoorPDBErrors)!=0;
  ignoreUnmatch = (Flags & MMDBF_IgnoreUnmatch)!=0;
  allowDuplChID = (Flags & MMDBF_AllowDuplChainID)!=0;
  fixSpaceGroup = (Flags & MMDBF_FixSpaceGroup   )!=0;
  
  //  open the file as ASCII for reading
  //  opening it in pseudo-binary mode helps reading various
  //  line terminators for files coming from different platforms
  f.assign ( CIFFileName,False,False,gzipMode );

  if (f.reset(True)) {

    CIFErrorLocation[0] = char(0);  // CIF reading phase

    lcount = 0;  // line counter
    S[0]   = char(0);

    if (f.FileEnd())  {
      f.shut();
      return Error_EmptyFile;
    }

    if (!CIF)  CIF = new CMMCIFData();
    CIF->SetStopOnWarning  ( True );
    CIF->SetPrintWarnings  ( (Flags & MMDBF_PrintCIFWarnings)!=0 );
    W = CIF->ReadMMCIFData ( f,S,lcount );
    f.shut();
    if (W)  {
      if (W==CIFRC_NoDataLine)        return Error_NotACIFFile;
      if (W & CIFW_UnrecognizedItems) return Error_UnrecognCIFItems;
      if (W & CIFW_MissingField)      return Error_MissingCIFField;
      if (W & CIFW_EmptyLoop)         return Error_EmptyCIFLoop;
      if (W & CIFW_UnexpectedEOF)     return Error_UnexpEndOfCIF;
      if (W & CIFW_LoopFieldMissing)  return Error_MissgCIFLoopField;
      if (W & CIFW_NotAStructure)     return Error_NotACIFStructure;
      if (W & CIFW_NotALoop)          return Error_NotACIFLoop;
      return int(W);
    }

    return ReadFromCIF ( CIF,fixSpaceGroup );

  } else
    return Error_CantOpenFile;

}


int CMMDBFile::ReadFromCIF ( PCMMCIFData CIFD,
                             Boolean fixSpaceGroup )  {
PCMMCIFLoop  Loop1,Loop2;
pstr         F,FC;
word         cleanKey;
int          RC,i,l,j,n,retc;

  RC = Title.GetCIF ( CIFD );

  if (RC)  {
    CIFD->Optimize();
    return RC;
  }

  SwitchModel ( 1 );
  if (!crModel)  return Error_GeneralError1;
  RC = crModel->GetCIF ( CIFD );
  if (RC)  {
    CIFD->Optimize();
    return RC;
  }

  RC = Cryst.GetCIF ( CIFD,fixSpaceGroup );
  if (RC)  {
    CIFD->Optimize();
    return RC;
  }
  Cryst.CalcCoordTransforms();
  if (Flags & MMDBF_SimRWBROOK)
    Cryst.RWBROOKReadPrintout();

  RC = ReadCIFAtom ( CIFD );

  Loop1 = CIFD->GetLoop ( CIFCAT_ENTITY      );
  Loop2 = CIFD->GetLoop ( CIFCAT_STRUCT_ASYM );
  if (Loop1 && Loop2)  {
    // make 'Het' atoms
    l = Loop1->GetLoopLength();
    n = Loop2->GetLoopLength();
    for (i=0;i<l;i++)  {
      F = Loop1->GetString ( CIFTAG_TYPE,i,retc );
      if (F && (!retc))  {
        if (!strcasecmp(F,"non-polymer"))  {
          F = Loop1->GetString ( CIFTAG_ID,i,retc );
          if (F && (!retc))
            for (j=0;j<n;j++)  {
              FC = Loop2->GetString ( CIFTAG_ENTITY_ID,j,retc );
              if (FC && (!retc))  {
                if (!strcasecmp(FC,F))  {
                  FC = Loop2->GetString ( CIFTAG_ID,j,retc );
                  if (FC && (!retc))
                    MakeHetAtoms ( FC,True );
                }
              }
            }
        }
      }
    }
  }

  if (!RC)  {
    //  deleting these CIF loops here is a temporary solution
    // taken in order to avoid mess at rewriting the CIF file.
    CIFD->DeleteLoop ( CIFCAT_ATOM_SITE           );
    CIFD->DeleteLoop ( CIFCAT_ATOM_SITE_ANISOTROP );
    CIFD->Optimize   ();
  }

  cleanKey = 0x00000000;
  if (Flags & MMDBF_EnforceAtomNames)
    cleanKey = PDBCLEAN_ATNAME;
  if (Flags & MMDBF_AutoSerials)
    cleanKey |= PDBCLEAN_SERIAL;
  if (cleanKey)
    PDBCleanup ( cleanKey );

  return RC;

}

int CMMDBFile::ReadCoorFile1 ( cpstr LFName, byte gzipMode )  {
pstr FName;
  FName = getenv ( LFName );
  if (FName)  return ReadCoorFile ( FName,gzipMode );
        else  return Error_NoLogicalName;
}

int CMMDBFile::ReadCoorFile ( cpstr CFName, byte gzipMode )  {
// auto format recognition
int     kin;
Boolean IBL;

  kin = isMMDBBIN ( CFName,gzipMode );
  if (kin==Error_EmptyFile)
              return Error_EmptyFile;
  if (kin<0)  return Error_CantOpenFile;

  if (kin==0) return  ReadMMDBF ( CFName,gzipMode );

  IBL = ((Flags & MMDBF_IgnoreBlankLines)!=0);
  if (isPDB(CFName,gzipMode,IBL)==0)
    return ReadPDBASCII ( CFName,gzipMode );
  if (isCIF(CFName,gzipMode)==0)
    return ReadCIFASCII ( CFName,gzipMode );

  return Error_ForeignFile;

}


word  CMMDBFile::PDBCleanup ( word CleanKey )  {
//  cleans coordinate part to comply with PDB standards:
//
//    CleanKey          Action
//  PDBCLEAN_ATNAME  pads atom names with spaces to form 4-symbol names
//  PDBCLEAN_TER     inserts TER cards in the end of each chain
//  PDBCLEAN_CHAIN   generates 1-character chain ids instead of
//                   those many-character
//  PDBCLEAN_CHAIN_STRONG generates 1-character chain ids starting
//                   from 'A' on for all ids, including single-char
//  PDBCLEAN_ALTCODE generates 1-character alternative codes instead
//                   of those many-character
//  PDBCLEAN_ALTCODE_STRONG generates 1-character alternative codes
//                   from 'A' on for all codes, including
//                   single-character ones
//  PDBCLEAN_SERIAL  puts serial numbers in due order
//  PDBCLEAN_INDEX   reorders the internal index of atoms such that
//                   it follows the actual order of atoms in
//                   the object hierarchy
//  PDBCLEAN_SEQNUM  renumbers all residues so that they go
//                   incrementally-by-one without insertion codes
//  PDBCLEAN_CHAIN_ORDER puts chains in order of atom's serial numbers
//  PDBCLEAN_SOLVENT moves solvent chains at the end of each model
//  PDBCLEAN_ELEMENT calculates PDB element names where they are not
//                   found in the chemical element table
//  PDBCLEAN_ELEMENT_STRONG  calculates all chemical element names
//
//  Return codes (as bits):
//  0                Ok
//  PDBCLEAN_CHAIN   too many chains for assigning them 1-letter codes
//  PDBCLEAN_ATNAME  element names were not available
//  PDBCLEAN_ALTCODE too many alternative codes encountered.
//
word      RC;
int       i,j,k,nal,nch,nr, nch1,nch2;
char      c;
AltLoc  * altLoc;
ChainID * chain_ID;
char      aLoc [257];
char      chnID[257];
int       model,modl;
PPCAtom   Atom1;
PPCChain  Chain1,Chain2;
PCModel   crModel0;
PCChain   crChain0;
PCResidue crRes0;
PCAtom    atom;
pstr      chID;
ChainID   chainID;
Boolean   NewChain,Done,Solvent;

  RC = 0;
  if (nAtoms<=0)  return RC;

  if (CleanKey & PDBCLEAN_ATNAME)
    for (i=0;i<nAtoms;i++)
      if (Atom[i])
        if (!Atom[i]->MakePDBAtomName())  RC |= PDBCLEAN_ATNAME;


  if (CleanKey & PDBCLEAN_TER)  {
    model    = -1;
    k        = -1;
    crModel0 = crModel;
    for (i=0;i<nAtoms;i++)
      if (Atom[i])  {
        modl = Atom[i]->GetModelNum();
        chID = Atom[i]->GetChainID ();
        if (model<0)  {
          model = modl;
          SwitchModel ( model );
          if (chID)  strcpy ( chainID,chID );
               else  chainID[0] = char(0);
        } else  {
          if (model!=modl)  NewChain = True;
          else if (chID)    NewChain = strcmp(chID,chainID)!=0;
                      else  NewChain = chainID[0]!=char(0);
          if (NewChain)  {
            if (k>=0)  {
              if ((!Atom[k]->Ter) && (!Atom[k]->Het))  {
                // insert 'Ter' before atom in position 'i'
                PutAtom ( -(i+1),Atom[k]->serNum+1,pstr("TER"),
                          Atom[k]->GetResName(),Atom[k]->GetChainID(),
                          Atom[k]->GetSeqNum (),Atom[k]->GetInsCode(),
                          pstr(" "),pstr(" "),pstr(" ") );
                Atom[i]->MakeTer();
              }
            }
            model = modl;
            SwitchModel ( model );
            if (chID)  strcpy ( chainID,chID );
                 else  chainID[0] = char(0);
          }
        }
        k = i;
      }

    if (k>=0)  {
      if ((!Atom[k]->Ter) && (!Atom[k]->Het))  {  // add last TER
        i = nAtoms;
        SwitchModel ( Atom[k]->GetModelNum() );
        PutAtom ( 0,nAtoms+1,pstr("TER"),Atom[k]->GetResName(),
                  Atom[k]->GetChainID(),Atom[k]->GetSeqNum(),
                  Atom[k]->GetInsCode(),pstr(" "),pstr(" "),
                  pstr(" ") );
        Atom[i]->MakeTer();
      }
    }

    crModel = crModel0;
  }


  if (CleanKey & (PDBCLEAN_CHAIN | PDBCLEAN_CHAIN_STRONG))  {
    chain_ID = new ChainID[256];
    for (i=0;i<nModels;i++)
      if (Model[i])  {
        for (j=0;j<256;j++)  {
          strcpy ( chain_ID[j]," " );
          chnID[j] = char(0);
        }
        chnID[256] = char(0);
        nch = 0;
        for (j=0;j<Model[i]->nChains;j++)  {
          crChain0 = Model[i]->Chain[j];
          if (crChain0)  {
            if (!crChain0->chainID[0])
              strcpy ( crChain0->chainID," " );
            k = 0;
            while ((k<nch) && (strcmp(chain_ID[k],crChain0->chainID)))
              k++;
            if (k>=nch)  {
              if (nch>=255)  RC |= PDBCLEAN_CHAIN;
              else  {
                strcpy ( chain_ID[nch],crChain0->chainID );
                if (!chain_ID[nch][1])
                  chnID[nch] = chain_ID[nch][0];
                nch++;
              }
            }
          }
        }  
        c = 'A';
        if (CleanKey & PDBCLEAN_CHAIN_STRONG)  {
          // rename all chains through from A to Z
          for (k=0;k<nch;k++)  {
            chnID[k] = c;
            c = char(int(c)+1);
          }
        } else  {
          // rename only multi-character chain IDs
          for (j=0;(j<nch) && (k<256);j++)  {
            k = 0;
            do  {
              while ((k<nch) && (chnID[k]!=c))  k++;
              if (k<nch)  c = char(int(c)+1);
            } while (k<nch);
            k = 0;
            while ((k<256) && (chnID[k]))  k++;
            if (k<256)  {
              chnID[k] = c;
              c = char(int(c)+1);
            }
          }
        }
        // assign new chain IDs
        for (j=0;j<Model[i]->nChains;j++)  {
          crChain0 = Model[i]->Chain[j];
          if (crChain0)  {
            k = 0;
            while ((k<nch) && (strcmp(chain_ID[k],crChain0->chainID)))
              k++;
            strcpy ( crChain0->prevChainID,crChain0->chainID );
            crChain0->chainID[0] = chnID[k];
            crChain0->chainID[1] = char(0);
          }
        }
      }
    delete[] chain_ID;
  }


  if (CleanKey & (PDBCLEAN_ALTCODE | PDBCLEAN_ALTCODE_STRONG))  {
    altLoc = new AltLoc[256];
    for (i=0;i<256;i++)  {
      strcpy ( altLoc[i]," " );
      aLoc[i] = char(0);
    }
    aLoc[0]   = ' ';
    aLoc[256] = char(0);
    nal = 1;
    for (i=0;i<nAtoms;i++)
      if (Atom[i])  {
        if (!Atom[i]->altLoc[0])  strcpy ( Atom[i]->altLoc," " );
        else  {
          k = 0;
          while ((k<nal) && (strcmp(altLoc[k],Atom[i]->altLoc)))  k++;
          if (k>=nal)  {
            if (nal>=255)  RC |= PDBCLEAN_ALTCODE;
            else  {
              strcpy ( altLoc[nal],Atom[i]->altLoc );
              if (!altLoc[nal][1])  aLoc[nal] = altLoc[nal][0];
              nal++;
            }
          }
        }  
      }
    c = 'A';
    if (CleanKey & PDBCLEAN_ALTCODE_STRONG)
      for (i=1;i<nal;i++)  {
        aLoc[i] = c;
        c = char(int(c)+1);
      }
    else
      for (i=1;(i<nal) && (k<256);i++)  {
        k = 0;
        do  {
          while ((k<nal) && (aLoc[k]!=c))  k++;
          if (k<nal)  c = char(int(c)+1);
        } while (k<nal);
        k = 0;
        while ((k<256) && (aLoc[k]))  k++;
        if (k<256)  {
          aLoc[k] = c;
          c = char(int(c)+1);
        }
      }
    for (i=0;i<nAtoms;i++)
      if (Atom[i])  {
        k = 0;
        while ((k<nal) && (strcmp(altLoc[k],Atom[i]->altLoc)))  k++;
        Atom[i]->altLoc[0] = aLoc[k];
        Atom[i]->altLoc[1] = char(0);
      }
    delete[] altLoc;
  }


  if (CleanKey & PDBCLEAN_SEQNUM)
    for (i=0;i<nModels;i++)  {
      crModel0 = Model[i];
      if (crModel0)
        for (j=0;j<crModel0->nChains;j++)  {
          crChain0 = crModel0->Chain[j];
          if (crChain0)  {
            nr = 0;
            for (k=0;k<crChain0->nResidues;k++)  {
              crRes0 = crChain0->Residue[k];
              if (crRes0)  {
                nr++;
                crRes0->seqNum     = nr;
                crRes0->insCode[0] = char(0);
              }
            }
          }
        }
    }

  if (CleanKey & PDBCLEAN_SOLVENT)  {
    Atom1 = new PCAtom[nAtoms];
    k = 1;
    for (i=0;i<nModels;i++)
      if (Model[i])  {
        if (Model[i]->nChains>k)  k = Model[i]->nChains;
      }
    Chain1 = new PCChain[k];
    Chain2 = new PCChain[k];
    k = 0;
    for (i=0;i<nModels;i++)  {
      crModel0 = Model[i];
      if (crModel0)  {
        nch1 = 0;
        nch2 = 0;
        for (nch=0;nch<crModel0->nChains;nch++)  {
          crChain0 = crModel0->Chain[nch];
          if (crChain0)  {
            Solvent = False;
            for (nr=0;(nr<crChain0->nResidues) && (!Solvent);nr++)  {
              crRes0 = crChain0->Residue[nr];
              if (crRes0)
                for (j=0;(j<nSolventNames) && (!Solvent);j++)
                  Solvent = !strcmp ( StdSolventName[j],crRes0->name );
            }
            if (Solvent)  Chain2[nch2++] = crChain0;
                    else  Chain1[nch1++] = crChain0;
          }
        }
        for (nch=0;nch<nch1;nch++)  {
          crChain0 = Chain1[nch];
          for (nr=0;nr<crChain0->nResidues;nr++)  {
            crRes0 = crChain0->Residue[nr];
            if (crRes0)
              for (j=0;j<crRes0->nAtoms;j++)
                if (crRes0->atom[j])  {
                  Atom1[k] = crRes0->atom[j];
                  Atom1[k]->index = k+1;
                  k++;
                }
          }
          crModel0->Chain[nch] = Chain1[nch];
        }
        for (nch=0;nch<nch2;nch++)  {
          crChain0 = Chain2[nch];
          for (nr=0;nr<crChain0->nResidues;nr++)  {
            crRes0 = crChain0->Residue[nr];
            if (crRes0)
              for (j=0;j<crRes0->nAtoms;j++)
                if (crRes0->atom[j])  {
                  Atom1[k] = crRes0->atom[j];
                  Atom1[k]->index = k+1;
                  k++;
                }
          }
          crModel0->Chain[nch1++] = Chain2[nch];
        }
        crModel0->nChains = nch1;
      }
    }
    delete[] Chain1;
    delete[] Chain2;
    if (Atom)  delete[] Atom;
    Atom   = Atom1;
    AtmLen = nAtoms;
    nAtoms = k;
  }

  if (CleanKey & (PDBCLEAN_CHAIN_ORDER | PDBCLEAN_CHAIN_ORDER_IX))  {
    for (i=0;i<nModels;i++)  {
      crModel0 = Model[i];
      if (crModel0)  {
        k = 0;
        for (j=0;j<crModel0->nChains;j++)  {
          crChain0 = crModel0->Chain[j];
          if (crChain0)  {
            crChain0->nWeights = 0;
            crChain0->Weight   = 0.0;
            if (k<j)  {
              crModel0->Chain[k] = crModel0->Chain[j];
              crModel0->Chain[j] = NULL;
            }
            k++;
          }
        }
        crModel0->nChains = k;
      }
    }
    if (CleanKey & PDBCLEAN_CHAIN_ORDER)
      for (i=0;i<nAtoms;i++)
        if (Atom[i])  {
          crChain0 = Atom[i]->GetChain();
          crChain0->nWeights++;
          crChain0->Weight += Atom[i]->serNum;
        }
    else
      for (i=0;i<nAtoms;i++)
        if (Atom[i])  {
          crChain0 = Atom[i]->GetChain();
          crChain0->nWeights++;
          crChain0->Weight += Atom[i]->GetIndex();
        }
    for (i=0;i<nModels;i++)  {
      crModel0 = Model[i];
      if (crModel0)  {
        for (j=0;j<crModel0->nChains;j++)  {
          crChain0 = crModel0->Chain[j];
          if (crChain0->nWeights)
            crChain0->Weight /= crChain0->nWeights;
        }
        //  bubble sorting
        do {
          Done = True;
          for (j=1;j<crModel0->nChains;j++)
            if (crModel0->Chain[j-1]->Weight >
                crModel0->Chain[j]->Weight)  {
              crChain0             = crModel0->Chain[j-1];
              crModel0->Chain[j-1] = crModel0->Chain[j];
              crModel0->Chain[j]   = crChain0;
              Done = False;
            }
        } while (!Done);
      }
    }
  }

  if (CleanKey & PDBCLEAN_INDEX)  {
    k = 0;
    for (i=0;i<nModels;i++)  {
      crModel0 = Model[i];
      if (crModel0)  {
        for (nch=0;nch<crModel0->nChains;nch++)  {
          crChain0 = crModel0->Chain[nch];
          if (crChain0)  {
            for (nr=0;nr<crChain0->nResidues;nr++)  {
              crRes0 = crChain0->Residue[nr];
              if (crRes0)  {
                for (j=0;j<crRes0->nAtoms;j++)  {
                  atom = crRes0->atom[j];
                  if (atom)  {
                    Atom[atom->index-1] = Atom[k];
                    if (Atom[k])
                      Atom[k]->index = atom->index;
                    Atom[k] = atom;
                    k++;
                    atom->index = k;
                  }
                }
              }
            }
          }
        }
      }
    }
    nAtoms = k;
  }

  if (CleanKey & PDBCLEAN_SERIAL)  {
    k = 0;
    for (i=0;i<nAtoms;i++)
      if (Atom[i])  {
        if (k<i)  {
          Atom[k] = Atom[i];
          Atom[i] = NULL;
        }
        Atom[k]->index  = k+1;
        Atom[k]->serNum = Atom[k]->index;
        k++;
      }
    nAtoms = k;
  }

  if (CleanKey & PDBCLEAN_ELEMENT)  {
    for (i=0;i<nAtoms;i++)
      if (Atom[i] && (!Atom[i]->Ter))  {
        if (getElementNo(Atom[i]->element)==ELEMENT_UNKNOWN)  {
          strcpy ( Atom[i]->element,"  " );
          Atom[i]->MakePDBAtomName();
        }
      }
  }

  if (CleanKey & PDBCLEAN_ELEMENT_STRONG)  {
    for (i=0;i<nAtoms;i++)
      if (Atom[i] && (!Atom[i]->Ter))  {
        strcpy ( Atom[i]->element,"  " );
        Atom[i]->MakePDBAtomName();
      }
  }

  return RC;

}

void  CMMDBFile::MakeHetAtoms ( cpstr chainID, Boolean Make )  {
//  Makes all atoms in chain 'chainID', in all models, as 'Het' atoms
//  if Make is set True, and makes them 'ordinary' atoms otherwise.
//  'Ter' is automatically removed when converting to 'Het' atoms,
//  and is automatically added when converting to 'ordinary' atoms.
int       i,j,k,l,n;
PCModel   crModel0;
PCChain   crChain0;
PCResidue crRes0;
  crModel0 = crModel;
  for (i=0;i<nModels;i++)
    if (Model[i])
      for (j=0;j<Model[i]->nChains;j++)  {
        crChain0 = Model[i]->Chain[j];
        if (crChain0)  {
          if (!strcmp(crChain0->chainID,chainID))  {
            n = 0;
            for (k=0;k<crChain0->nResidues;k++)  {
              crRes0 = crChain0->Residue[k];
              if (crRes0)
                for (l=0;l<crRes0->nAtoms;l++)
                  if (crRes0->atom[l])  {
                    crRes0->atom[l]->Het = Make;
                    n = crRes0->atom[l]->index;
                  }
            }
            if (n>0)  {
              n--;
              if (Atom[n]->Het && Atom[n]->Ter)  RemoveAtom ( n+1 );
              else if ((!Atom[n]->Het) && (!Atom[n]->Ter))  {
                SwitchModel ( Model[i]->GetSerNum() );
                if (n<nAtoms-1)
                  PutAtom ( -(n+2),Atom[n]->serNum+1,pstr("TER"),
                          Atom[n]->GetResName(),Atom[n]->GetChainID(),
                          Atom[n]->GetSeqNum (),Atom[n]->GetInsCode(),
                          pstr(" "),pstr(" "),pstr(" ") );
                else
                  PutAtom ( 0,nAtoms+1,pstr("TER"),
                          Atom[n]->GetResName(),Atom[n]->GetChainID(),
                          Atom[n]->GetSeqNum (),Atom[n]->GetInsCode(),
                          pstr(" "),pstr(" "),pstr(" ") );
                Atom[n+1]->MakeTer();
              }
            }
          }
        }
      }
  crModel = crModel0;
}


void CMMDBFile::RemoveAtom ( int index )  {
//    Removes atom at the specified index in the Atom array.
// This index is always accessible as Atom[index]->index.
// If this leaves a residue empty, the residue is removed.
// If this leaves an empty chain, the chain is removed as well;
// the same happens to the model.
PCResidue crRes0;
PCChain   crChain0;
PCModel   crModel0;
int       i,j;

  if ((index>0) && (index<=nAtoms))  {
    if (Atom[index-1])  {
      crRes0 = Atom[index-1]->residue;
      if (crRes0)  {
        if (crRes0->_ExcludeAtom(index))  {
          // the residue appears empty after the exclusion
          if (crRes)  {
            if ((crRes->seqNum==crRes0->seqNum) &&
                (!strcmp(crRes->insCode,crRes0->insCode)))
              crRes = NULL;
          }
          crChain0 = crRes0->chain;
          if (crChain0)  {
            if (crChain0->_ExcludeResidue(crRes0->name,crRes0->seqNum,
                                          crRes0->insCode))  {
              // the chain appears empty after the exclusion
              if (crChain)  {
                if (!strcmp(crChain->chainID,crChain0->chainID))
                  crChain = NULL;
              }
              crModel0 = PCModel(crChain0->model);
              if (crModel0)  {
                if (crModel0->_ExcludeChain(crChain0->chainID))  {
                  // the model appears ampty after the exclusion
                  if (crModel)  {
                    if (crModel->serNum==crModel0->serNum)
                      crModel = NULL;
                  }
                  i = crModel0->serNum-1;
                  delete Model[i];
                  Model[i] = NULL;
                }
              }
              delete crChain0;  // it is already excluded from the hierarchy!
            }
          }
          delete crRes0;  // it is already excluded from the hierarchy!
        }
      }
      delete Atom[index-1];  // it is already excluded from the hierarchy!
      Atom[index-1] = NULL;
      // now rearrange and re-index atoms.
      j = 0;
      for (i=0;i<nAtoms;i++)
        if (Atom[i])  {
          if (j<i)  {
            Atom[j] = Atom[i];
            Atom[i] = NULL;
          }
          Atom[j]->index = j+1;
          j++;
        }
      nAtoms = j;
    }
  }
}


int  CMMDBFile::_ExcludeModel ( int serNum )  {
//   _ExcludeModel(..) excludes (but does not dispose!) a model
// from the file. Returns 1 if the file gets empty and 0 otherwise.
int  i,k;

  if (!Exclude)  return 0;

  if ((0<serNum) && (serNum<=nModels))
    Model[serNum-1] = NULL;

  k = 0;
  for (i=0;i<nModels;i++)
    if (Model[i])  {
      if (k<i)  {
        Model[k] = Model[i];
        Model[i] = NULL;
      }
      Model[k]->serNum = k+1;
      k++;
    }

  nModels = k;

  if (nModels<=0)  return 1;
             else  return 0;

}


void  CMMDBFile::FinishStructEdit()  {
// Makes a new atom index after insertion or deletion of atoms.
// This function may change atoms' positions in the index and
// correspondingly the CAtom::index field.
PCResidue res;
PCChain   chain;
PCModel   model;
PPCAtom   Atom1;
int       i,j,k,l,n,index,nAtoms1;

  //  calculate new number of atoms
  nAtoms1 = 0;
  for (i=0;i<nModels;i++)  {
    model = Model[i];
    if (model)  {
      for (j=0;j<model->nChains;j++)  {
        chain = model->Chain[j];
        if (chain)  {
          for (k=0;k<chain->nResidues;k++)  {
            res = chain->Residue[k];
            if (res)  {
              res->TrimAtomTable();
              nAtoms1 += res->nAtoms;
            }
          }
          chain->TrimResidueTable();
        }
      }
      model->TrimChainTable();
    }
  }
  TrimModelTable();

  // compile a new index and null the old one

  if (nAtoms1>0)  Atom1 = new PCAtom[nAtoms1];
            else  Atom1 = NULL;

  n = 0;
  for (i=0;i<nModels;i++)  {
    model = Model[i];
    for (j=0;j<model->nChains;j++)  {
      chain = model->Chain[j];
      for (k=0;k<chain->nResidues;k++)  {
        res = chain->Residue[k];
        for (l=0;l<res->nAtoms;l++)  {
          Atom1[n] = res->atom[l];
          index    = Atom1[n]->index;
          if ((index>0) && (index<=AtmLen))
            Atom[index-1] = NULL;
          Atom1[n]->index = n+1;
          n++;
        }
      }
    }
  }

  if (n!=nAtoms1)  {
    printf ( " ***** PROGRAM ERROR IN CMMDBFile::FinishStructEdit\n" );
    exit ( 1 );
  }

  // check if there are dead atoms in the old index
  for (i=0;i<AtmLen;i++)
    if (Atom[i])  delete Atom[i];

  // dispose old index and replace it with the new one
  if (Atom)  delete[] Atom;

  Atom   = Atom1;
  AtmLen = nAtoms1;
  nAtoms = nAtoms1;

}

void CMMDBFile::TrimModelTable()  {
int i,j;
  j = 0;
  for (i=0;i<nModels;i++)
    if (Model[i])  {
      if (j<i)  {
        Model[j] = Model[i];
        Model[i] = NULL;
      }
      Model[j]->serNum = j+1;
      j++;
    }
  nModels = j;
}


int  CMMDBFile::GenerateNCSMates()  {
//
//   Generates NCS mates according to NCS matrices given
// in Cryst. This will result in generating many-character
// chain names, composed as 'x_n' where 'x' is the original
// name and 'n' is a unique number, which will coincide with
// the symmetry operation (order) number. Another side
// effect will be a disorder in atoms' serial numbers.
//   The hierarchy should therefore be cleaned after
// generating the NCS mates. An appropriate way to do that
// is to issue the following call:
//
//   PDBCleanup ( PDBCLEAN_TER | PDBCLEAN_ALTCODE_STRONG |
//                PDBCLEAN_CHAIN_STRONG | PDBCLEAN_SERIAL );
//
PPCChain chainTable,chain;
PCChain  chn;
mat44    ncs_m;
ChainID  chainID;
int      i,j,k,nNCSOps,nChains,iGiven;

  nNCSOps = Cryst.GetNumberOfNCSMatrices();
  if (nNCSOps<=0)  return 1;

  for (i=0;i<nModels;i++)
    if (Model[i])  {
      Model[i]->GetChainTable ( chainTable,nChains );
      if (nChains>0)  {
        chain = new PCChain[nChains];
        for (j=0;j<nChains;j++)
          chain[j] = chainTable[j];
        for (j=0;j<nChains;j++)
          if (chain[j])  {
            for (k=0;k<nNCSOps;k++)
              if (Cryst.GetNCSMatrix(k,ncs_m,iGiven))  {
                if (!iGiven)  {
                  chn = newCChain();
                  chn->Copy ( chain[j] );
                  sprintf ( chainID,"%s_%i",
                            chain[j]->GetChainID(),k+1 );
                  chn->SetChainID     ( chainID );
                  chn->ApplyTransform ( ncs_m   );
                  Model[i]->AddChain  ( chn     );
                }
              }
          }
        delete[] chain;
      }
    }

  return 0;

}


void  CMMDBFile::ApplyNCSTransform ( int NCSMatrixNo )  {
mat33 t;
vect3 v;
int   i;
  if (!Cryst.GetNCSMatrix(NCSMatrixNo,t,v))  return;
  for (i=0;i<nAtoms;i++)
    if (Atom[i])  Atom[i]->Transform ( t,v );
}


int  CMMDBFile::PutPDBString ( cpstr PDBString )  {
int          RC;
PCContString ContString;

  strcpy    ( S,PDBString );  // maintain the buffer!
  PadSpaces ( S,80 );
  lcount++;

  // belongs to title?
  RC = Title.ConvertPDBString ( S );
  if (RC!=Error_WrongSection)  return RC;

  // belongs to primary structure section?
  SwitchModel ( 1 );
  RC = crModel->ConvertPDBString ( S );
  if (RC!=Error_WrongSection)  return RC;

  // belongs to the crystallographic information section?
  RC = Cryst.ConvertPDBString ( S,False );
  if (RC!=Error_WrongSection)  {
//    if (RC==0)  Cryst.CalcCoordTransforms();
    return RC;
  }

  // belongs to the coordinate section?
  RC = ReadPDBAtom ( S );
  if (RC!=Error_WrongSection)  return RC;

  // temporary solution: the rest of file is stored
  // in the form of strings
  if ((S[0]) && (S[0]!=' ') && (strncmp(S,"END   ",6)))  {
    // END is added automatically
    ContString = new CContString(S);
    SC.AddData ( ContString );
  }

  return 0;

}


int  CMMDBFile::AddPDBASCII1 ( cpstr PDBLFName, byte gzipMode )  {
pstr FName;
  FName = getenv ( PDBLFName );
  if (FName)  return AddPDBASCII ( FName,gzipMode );
        else  return Error_NoLogicalName;
}

int  CMMDBFile::AddPDBASCII ( cpstr PDBFileName, byte gzipMode ) {
int   RC;
CFile f;
  //  open the file as ASCII for reading
  //  opening it in pseudo-binary mode helps reading various
  //  line terminators for files coming from different platforms
  f.assign ( PDBFileName,False,False,gzipMode );
  if (f.reset(True)) {
    lcount = 1;  // line counter
    RC     = 0;
    while ((!f.FileEnd()) && (!RC))  {
      ReadPDBLine ( f,S,sizeof(S) );
      RC = PutPDBString ( S );
    }
    f.shut();
  } else
    RC = Error_CantOpenFile;
  return RC;
}


void CMMDBFile::GetInputBuffer ( pstr Line, int & count )  {
  if (FType==MMDB_FILE_PDB)  {  // PDB File
    strcpy ( Line,S );
    count = lcount;
  } else if (FType==MMDB_FILE_CIF)  {
    if (!CIFErrorLocation[0])  {  // CIF reading phase
      strcpy ( Line,S );
      count = lcount;
    } else  {
      strcpy ( Line,CIFErrorLocation );
      count = -1;  // CIF interpretation phase
    }
  } else {
    Line[0] = char(0);
    count = -2;
  }
}


int  CMMDBFile::CrystReady()  {
//    Returns flags:
// CRRDY_Complete       if crystallographic information is complete
// CRRDY_NotPrecise     if cryst. inf-n is not precise
// CRRDY_isTranslation  if cryst. inf-n contains translation
// CRRDY_NoOrthCode     no orthogonalization code
//    Fatal:
// CRRDY_NoTransfMatrices  if transform. matrices were not calculated
// CRRDY_Unchecked         if cryst. inf-n was not checked
// CRRDY_Ambiguous         if cryst. inf-n is ambiguous
// CRRDY_NoCell            if cryst. inf-n is unusable
// CRRDY_NoSpaceGroup      if space group is not set
int k;

  if (!(Cryst.WhatIsSet & CSET_Transforms))
    return CRRDY_NoTransfMatrices;
 
  if ((Cryst.WhatIsSet & CSET_CellParams)!=CSET_CellParams)
    return CRRDY_NoCell;

  if (!(Cryst.WhatIsSet & CSET_SpaceGroup))
    return CRRDY_NoSpaceGroup;

  if (Cryst.CellCheck & CCHK_Unchecked)
    return CRRDY_Unchecked;

  if (Cryst.CellCheck & CCHK_Disagreement)
    return CRRDY_Ambiguous;

  k = 0x0000;
  if (Cryst.CellCheck & CCHK_Error)        k |= CRRDY_NotPrecise;
  if (Cryst.CellCheck & CCHK_Translations) k |= CRRDY_isTranslation;
  if (Cryst.CellCheck & CCHK_NoOrthCode)   k |= CRRDY_NoOrthCode;

  return k;

}


Boolean CMMDBFile::isCrystInfo()  {
  return (((Cryst.WhatIsSet & CSET_CellParams)==CSET_CellParams) &&
           (Cryst.WhatIsSet & CSET_SpaceGroup));
}

Boolean CMMDBFile::isCellInfo()  {
  return ((Cryst.WhatIsSet & CSET_CellParams)==CSET_CellParams);
}

Boolean CMMDBFile::isSpaceGroup()  {
  return (Cryst.WhatIsSet & CSET_SpaceGroup);
}

Boolean CMMDBFile::isTransfMatrix()  {
  return Cryst.areMatrices();
}

Boolean CMMDBFile::isScaleMatrix()  {
  return ((Cryst.WhatIsSet & CSET_ScaleMatrix)==CSET_ScaleMatrix);
}

Boolean CMMDBFile::isNCSMatrix()  {
  return Cryst.isNCSMatrix();
}

int  CMMDBFile::AddNCSMatrix ( mat33 & ncs_m, vect3 & ncs_v,
                               int iGiven )  {
  return Cryst.AddNCSMatrix ( ncs_m,ncs_v,iGiven );
}

int  CMMDBFile::GetNumberOfNCSMatrices()  {
  return Cryst.GetNumberOfNCSMatrices();
}

int  CMMDBFile::GetNumberOfNCSMates()  {
// Returns the number of NCS mates not given in the file (iGiven==0)
  return Cryst.GetNumberOfNCSMates();
}

Boolean  CMMDBFile::GetNCSMatrix ( int NCSMatrixNo, // 0..N-1
                                   mat44 & ncs_m, int & iGiven )  {
  return Cryst.GetNCSMatrix ( NCSMatrixNo,ncs_m,iGiven );
}

int  CMMDBFile::ReadPDBAtom ( cpstr L )  {
//   If string L belongs to the coordinate section
// (records ATOM, SIGATM, ANISOU, SIGUIJ, TER, HETATM),
// the correspondent information is retrieved and
// stored in the dynamic Atom array. In parallel, the
// structures of Model/Chain/Residue are generated and
// referenced to the corresponding Atom.
//   If processing of L was successful, the return is 0,
// otherwise it returns the corresponding Error_XXX
// code.
//   If L does not belong to the coordinate section,
// Error_WrongSection is returned.
int RC,index;

  if (!strncmp(L,"ATOM  ",6)) {

    index = nAtoms+1;  // index for the next atom in Atom array
    RC    = CheckAtomPlace ( index,L );
    if (!RC)  RC = Atom[index-1]->ConvertPDBATOM ( index,L );

  } else if (!strncmp(L,"SIGATM",6)) {

    index = nAtoms;    // keep index!
    RC    = CheckAtomPlace ( index,L );
    if (!RC)  RC = Atom[index-1]->ConvertPDBSIGATM ( index,L );

  } else if (!strncmp(L,"ANISOU",6)) {

    index = nAtoms;    // keep index
    RC    = CheckAtomPlace ( index,L );
    if (!RC)  RC = Atom[index-1]->ConvertPDBANISOU ( index,L );

  } else if (!strncmp(L,"SIGUIJ",6)) {

    index = nAtoms;    // keep index
    RC    = CheckAtomPlace ( index,L );
    if (!RC)  RC = Atom[index-1]->ConvertPDBSIGUIJ ( index,L );

  } else if (!strncmp(L,"TER   ",6)) {

    index = nAtoms+1;  // new place in Atom array
    RC    = CheckAtomPlace ( index,L );
    if (!RC)  RC = Atom[index-1]->ConvertPDBTER ( index,L );

  } else if (!strncmp(L,"HETATM",6)) {

    index = nAtoms+1;  // new place in Atom array
    RC    = CheckAtomPlace ( index,L );
    if (!RC)  RC = Atom[index-1]->ConvertPDBHETATM ( index,L );

  } else if (!strncmp(L,"MODEL ",6)) {

    modelCnt++;
    RC = SwitchModel ( L );
    if (!RC)  {
      if (crModel->serNum!=modelCnt)
        RC = Error_DuplicatedModel;
    }

  } else if (!strncmp(L,"ENDMDL",6)) {

    crModel = NULL;
    crChain = NULL;
    crRes   = NULL;

    RC      = 0;

  } else
    return Error_WrongSection;

  return RC;

}


int  CMMDBFile::ReadCIFAtom ( PCMMCIFData CIFD )  {
PCMMCIFLoop Loop,LoopAnis;
int         RC,i,index,nATS;

  Loop = CIFD->GetLoop ( CIFCAT_ATOM_SITE );
  if (!Loop)  return 0;  // no atom coordinates in the file

  LoopAnis = CIFD->GetLoop ( CIFCAT_ATOM_SITE_ANISOTROP );
  nATS     = Loop->GetLoopLength();

  for (i=1;i<=nATS;i++)  {
    // nAtoms and i should always coincide at this point. This piece
    // of code was however left in order to reach identity with
    // ReadPDBAtom(..).
    index = nAtoms+1;  // index for the next atom in Atom array
    RC    = CheckAtomPlace ( index,Loop );
    if (!RC)  RC = Atom[index-1]->GetCIF ( i,Loop,LoopAnis );
    if (RC && (RC!=Error_CIF_EmptyRow))  return RC;
  }
  if (Flags & MMDBF_AutoSerials)
    PDBCleanup ( PDBCLEAN_SERIAL ); 

  return 0;

}

int  CMMDBFile::PutAtom ( int            index,
                          int            serNum,
                          const AtomName atomName,
                          const ResName  resName,
                          const ChainID  chainID,
                          int            seqNum,
                          const InsCode  insCode,
                          const AltLoc   altLoc,
                          const SegID    segID,
                          const Element  element )  {

//   An atom with the specified properties is put into the
// structure. The current model is used; if no model is
// set (crModel==NULL), one is created. Coordinates and
// other parameters of the atom need to be set separately.
//
//   If index is positive and there is already an atom at
// this position in the system, the new atom will REPLACE
// it. The corresponding residues are automatically
// updated.
//
//   If index is null (=0), the new atom will be put on
// the top of the structure, i.e. it will be put into
// (index=nAtoms+1)-th position.
//
//   If index is negative, then the new atom is INSERTED
// BEFORE the atom in the (-index)th position. For
// saving the computational efforts, this WILL NOT cause
// the recalculation of all atoms' serial numbers
// according to their actual positions. It will be needed
// however to put the things in order by calling
// CMMDBFile::OrderAtoms() at a certain point, especially
// before writing an output ASCII file. NOTE that this
// ordering is never done automatically.
//
//   Limitation: if PutAtom implies creating new
// chains/residues, these are always created on the top
// of existing chains/residues.


int i,kndex,RC;

  kndex = index; 

  if (kndex<0)  {  // the new atom is to be inserted

    kndex = -kndex;
    if (kndex>AtmLen)
      ExpandAtomArray ( kndex+1000-AtmLen );

    if (Atom[kndex-1]!=NULL)  { // the position is occupied

      // expand the array if necessary
      if (nAtoms>=AtmLen)  
        ExpandAtomArray ( IMax(kndex,nAtoms)+1000-AtmLen );

      // now shift all atoms from (kndex-1)th to the end of array.
      // note that this does not affect residues as they keep only
      // pointers on atoms
      for (i=nAtoms;i>=kndex;i--)  {
        Atom[i] = Atom[i-1];
        Atom[i]->index = i+1;  // this is Ok because residues keep
                               // POINTERS rather than indices!
      }  
      Atom[kndex-1] = NULL;
      nAtoms++;

    }

  }

  if (kndex==0)  kndex = nAtoms+1;

  RC = AllocateAtom ( kndex,chainID,resName,seqNum,insCode,True );
  if (!RC)
    Atom[kndex-1]->SetAtomName ( kndex,serNum,atomName,altLoc,
                                 segID,element );
  return RC;

}


int CMMDBFile::PutAtom ( int    index,  // same meaning as above
                         PCAtom A,      // pointer to completed atom
                                        // class
                         int    serNum  // 0 means that the serial
                                        // number will be set equal
                                        // to "index". Otherwise,
                                        // the serial number is set
                                        // to the specified value
                       )  {
int i,kndex,RC,sn;

  if (!A)  return -1;

  kndex = index; 

  if (kndex<0)  {  // the new atom is to be inserted

    kndex = -kndex;

    if (kndex>AtmLen)
      ExpandAtomArray ( kndex+1000-AtmLen );

    if (Atom[kndex-1]!=NULL)  { // the position is occupied

      // expand the array if necessary
      if (nAtoms>=AtmLen)  
        ExpandAtomArray ( IMax(kndex,nAtoms)+1000-AtmLen );
      // now shift all atoms from (kndex-1)th to the end of array.
      // note that this does not affect residues as they keep only
      // pointers on atoms

      for (i=nAtoms;i>=kndex;i--)  {
        Atom[i] = Atom[i-1];
        Atom[i]->index = i+1;  // this is Ok because residues keep
                               // POINTERS rather than indices!
      }

      Atom[kndex-1] = NULL;
      nAtoms++;

    }

  }

  if (kndex==0)  kndex = nAtoms+1;


  RC = AllocateAtom ( kndex,A->GetChainID(),A->GetResName(),
                      A->GetSeqNum(),A->GetInsCode(),True );

  if (serNum<=0)  sn = kndex;
            else  sn = serNum;
  if (!RC)  {
    Atom[kndex-1]->Copy ( A );
    Atom[kndex-1]->serNum = sn;
  }

  return RC;

}

int CMMDBFile::CheckInAtom ( int index, // same meaning as above
                             PCAtom  A  // pointer to completed
                                        // atom class
                           )  {
int i,kndex;

  if (!A)  return -1;

  kndex = index; 

  if (kndex<0)  {  // the new atom is to be inserted

    kndex = -kndex;

    if (kndex>AtmLen)
      ExpandAtomArray ( kndex+1000-AtmLen );

    if (Atom[kndex-1]!=NULL)  { // the position is occupied

      // expand the array if necessary
      if (nAtoms>=AtmLen)  
        ExpandAtomArray ( IMax(kndex,nAtoms)+1000-AtmLen );
      // now shift all atoms from (kndex-1)th to the end of array.
      // note that this does not affect residues as they keep only
      // pointers on atoms

      for (i=nAtoms;i>=kndex;i--)  {
        Atom[i] = Atom[i-1];
        if (Atom[i])
          Atom[i]->index = i+1;  // this is Ok because residues keep
                                 // POINTERS rather than indices!
      }

    }

    nAtoms++;

  } else  {
    if (kndex==0)      kndex = nAtoms + 1;  // add atom on the very top
    if (kndex>AtmLen)  ExpandAtomArray ( kndex+1000-AtmLen );
    if (kndex>nAtoms)  nAtoms = kndex;
    if (Atom[kndex-1]) delete Atom[kndex-1];
  }

  Atom[kndex-1] = A;
  A->index = kndex;

  return 0;

}

int CMMDBFile::CheckInAtoms ( int index, // same meaning as above
                              PPCAtom A, // array of atoms to check in
                              int natms  // number of atoms to check in
                            )  {
PPCAtom A1;
int     i,j,k,k1,kndex;

  if (!A)  return -1;

  kndex = index; 

  if (kndex<0)  {  // the new atoms are to be inserted

    kndex = -kndex;

    if (nAtoms+natms>=AtmLen)  
      ExpandAtomArray ( IMax(kndex,nAtoms)+1000+natms-AtmLen );

    if (kndex<nAtoms)
    A1 = new PCAtom[natms];
    k = kndex-1;
    j = 0;
    for (i=0;i<natms;i++)
      if (A[i])  {
        if (Atom[k])  A1[j++] = Atom[k];
        Atom[k] = A[i];
        Atom[k]->index = k+1;
        k++;
      }

    if (j>0)  {
      // insert removed atoms into the gap
      nAtoms += j;
      k1      = k+j;
      for (i=nAtoms-1;i>=k1;i--)  {
        Atom[i] = Atom[i-j];
        if (Atom[i])
          Atom[i]->index = i+1;  // this is Ok because residues keep
                                 // POINTERS rather than indices!
      }
      for (i=0;i<j;i++)  {
        Atom[k] = A1[i];
        Atom[k]->index = k+1;
        k++;
      }
    }

    delete[] A1;

  } else  {

    if (kndex==0)      kndex = nAtoms + 1;  // add atom on the very top
    k = kndex + natms;
    if (k>AtmLen)  ExpandAtomArray ( k+1000-AtmLen );
    kndex--;
    for (i=0;i<natms;i++)
      if (A[i])  {
        if (Atom[kndex]) delete Atom[kndex];
        Atom[kndex] = A[i];
        Atom[kndex]->index = kndex+1;
        kndex++;
      }
    nAtoms = IMax(nAtoms,kndex);

  }

  return 0;

}


int CMMDBFile::SwitchModel ( cpstr L )  {
int nM;

  if (!GetInteger(nM,&(L[10]),4))
    return Error_UnrecognizedInteger;

  return SwitchModel ( nM );

}

int CMMDBFile::SwitchModel ( int nM )  {
PPCModel Mdl;
int      i;
Boolean  Transfer;

  if (nM<=0)
    return Error_WrongModelNo;

  if (nM>nModels)  {
    if ((nModels==1) && Model[0])  Transfer = (nAtoms<=0);
                             else  Transfer = False;
    Mdl = new PCModel[nM];
    for (i=0;i<nModels;i++)
      Mdl[i] = Model[i];
    for (i=nModels;i<nM;i++)
      Mdl[i] = NULL;
    if (Model) delete[] Model;
    Model   = Mdl;
    nModels = nM;
    if (Transfer)  {
      Model[nM-1] = Model[0];
      Model[0]    = NULL;
    }
  }

  if (!Model[nM-1])
    Model[nM-1] = newCModel();
  Model[nM-1]->SetMMDBManager ( PCMMDBManager(this),nM );

  crModel = Model[nM-1];
  crChain = NULL;  // new model - new chain
  crRes   = NULL;  // new chain - new residue

  return 0;

}

int CMMDBFile::CheckAtomPlace ( int index, cpstr L )  {
//   This function gets the residue/chain information stored
// in PDB string L (the records should start with the
// keywords ATOM, SIGATM, ANISOU, SIGUIJ, TER, HETATM) and
// sets the pointers crChain and crRes to the respective.
// chain and residue. If there is no chain/residue to place
// the atom in, these will be created.
//   The function prepares place for the atom in the index-th
// cell of the Atom array, expanding it as necessary. If the
// corresponding element in the Atom array was not initialized,
// a CAtom class is created with reference to the current
// residue.
//   This function DOES NOT check the PDB string L for
// atom keywords.
ResName  resName;
int      seqNum;
ChainID  chainID;
InsCode  insCode;

  // get the residue sequence number/ insert code
  if (!GetIntIns(seqNum,insCode,&(L[22]),4))  {
    if (strncmp(L,"TER   ",6))
          return Error_UnrecognizedInteger;
    else  { // we allow for empty TER card here
      seqNum  = 0;
      insCode[0] = char(1);  // unprintable symbol! used as
                             // flag that TER card does not
                             // have serial number
      insCode[1] = char(0);
    }
  }

  // get chain ID
  if (L[20]!=' ')  {
    chainID[0] = L[20];
    chainID[1] = L[21];
    chainID[2] = char(0);
  } else if (L[21]!=' ')  {
    chainID[0] = L[21];
    chainID[1] = char(0);
  } else
    chainID[0] = char(0);

  // get residue name
  strcpy_ncss ( resName,&(L[17]),3 );
  if ((!resName[0]) && (!strncmp(L,"TER   ",6)))  {
    insCode[0] = char(1);
    insCode[1] = char(0);
  }

  return AllocateAtom ( index ,chainID,resName,
                        seqNum,insCode,False );
 
}

int CMMDBFile::CheckAtomPlace ( int index, PCMMCIFLoop Loop )  {
//   Version of CheckAtomPlace(..) for reading from CIF file.
ResName  resName;
int      seqNum,RC,k,nM;
ChainID  chainID;
InsCode  insCode;
pstr     F;

  // Get the residue sequence number/insert code. They are
  // removed from the file after reading.
  k = index-1;
  if (!CIFGetInteger1(seqNum,Loop,CIFTAG_LABEL_SEQ_ID,k))
    CIFGetString  ( insCode,Loop,CIFTAG_NDB_INS_CODE,k,
                    sizeof(InsCode),pstr("") );
  else  {
    F = Loop->GetString ( CIFTAG_GROUP_PDB,k,RC );
    if ((!F) || (RC)) return  Error_CIF_EmptyRow;
    if (strcmp(F,"TER"))  {
      seqNum = MinInt4;  // only at reading CIF we allow this
      CIFGetString ( insCode,Loop,CIFTAG_NDB_INS_CODE,k,
                     sizeof(InsCode),pstr("") );
    } else  { // we allow for empty TER card here
      seqNum     = 0;
      insCode[0] = char(1);  // unprintable symbol! used as
                             // flag that TER card does not
                             // have serial number
      insCode[1] = char(0);
    }
  }

  // get chain/residue ID
  CIFGetString ( chainID,Loop,CIFTAG_LABEL_ASYM_ID,k,
                 sizeof(ChainID),pstr("") );
  CIFGetString ( resName,Loop,CIFTAG_LABEL_COMP_ID,k,
                 sizeof(ResName),pstr("") );

  if (!CIFGetInteger1(nM,Loop,CIFTAG_PDBX_PDB_MODEL_NUM,k))  {
    if (crModel)  {
      if (nM!=crModel->serNum)  SwitchModel ( nM );
    } else
      SwitchModel ( nM );
  }

  return AllocateAtom ( index ,chainID,resName,
                        seqNum,insCode,False );
 
}


int  CMMDBFile::AllocateAtom ( int           index,
                               const ChainID chainID,
                               const ResName resName,
                               int           seqNum,
                               const InsCode insCode,
                               Boolean       Replace )  {

  if ((!resName[0]) && (insCode[0]!=char(1)))
    return Error_EmptyResidueName;

  // check if there is a pointer to model
  if (!crModel)  {
    // the model pointer was not set. Check if there are
    // models already defined
    if (!Model)
         SwitchModel ( 1 );  // creates a model
    else return Error_NoModel;
  }

  if (crChain && (insCode[0]!=char(1)))  {
    //   If crChain is not NULL, the model pointer was not
    // changed and we may try to keep using crChain as
    // pointer to the being-read chain. However, we must
    // check that the record still belongs to the same chain.
    //   All this does not work if insCode[0] is set to 1
    // which indicates a special case of 'TER' card without
    // parameters.
    if (strcmp(chainID,crChain->chainID))
      crChain = NULL;  // the chain has to be changed
  }
  if (!crChain) {
    // either the model or chain was changed  -- get a new chain
    if (allowDuplChID)  crChain = crModel->CreateChain    ( chainID );
                  else  crChain = crModel->GetChainCreate ( chainID );
    crRes = NULL;  // new chain - new residue
  }

  if (crRes && (insCode[0]!=char(1)))  {
    //   If crRes is not NULL, neither the model nor chain were
    // changed. Check if this record still belongs to the
    // same residue.
    //   All this does not work if insCode[0] is set to 1
    // which indicates a special case of 'TER' card without
    // parameters.
    if ((seqNum!=crRes->seqNum)         ||
         strcmp(insCode,crRes->insCode) ||
         strcmp(resName,crRes->name))
      crRes = NULL;  // the residue has to be changed
  }
  if (!crRes)  {
    // either the chain or residue was changed -- get a new residue
    crRes = crChain->GetResidueCreate ( resName,seqNum,insCode,
                                      Flags & MMDBF_IgnoreDuplSeqNum );
    if (!crRes)  return  Error_DuplicateSeqNum;
  }

  // now check if there is place in the Atom array
  if (index>AtmLen)
    // there is no place, expand Atom by 1000 atom places at once
    ExpandAtomArray ( index+1000-AtmLen );
  nAtoms = IMax(nAtoms,index);

  // delete the to-be-replaced atom if there is any
  if (Replace && Atom[index-1])  {
    delete Atom[index-1];
    Atom[index-1] = NULL;
  }
  if (!Atom[index-1])  {
    Atom[index-1] = newCAtom();
    crRes->_AddAtom ( Atom[index-1] );
    Atom[index-1]->index = index;
  }

  return 0;

}

void CMMDBFile::ExpandAtomArray ( int inc )  {
// Expands the Atom array by adding more inc positions.
// The length of Atom array is increased unconditionally.
PPCAtom Atom1;
int     i;
  AtmLen += inc;
  Atom1   = new PCAtom[AtmLen];
  for (i=0;i<nAtoms;i++)      
    Atom1[i] = Atom[i];
  for (i=nAtoms;i<AtmLen;i++)
    Atom1[i] = NULL;
  if (Atom) delete[] Atom;
  Atom = Atom1;
}

void CMMDBFile::AddAtomArray ( int inc )  {
// Checks if 'inc' atoms may be added into Atom array,
// and if not, expands the Atom array such that to
// allocate exactly 'inc' atoms more than is currently
// contained.
PPCAtom Atom1;
int     i;
  if (nAtoms+inc>AtmLen)  {
    AtmLen = nAtoms+inc;
    Atom1  = new PCAtom[AtmLen];
    for (i=0;i<nAtoms;i++)      
      Atom1[i] = Atom[i];
    for (i=nAtoms;i<AtmLen;i++)
      Atom1[i] = NULL;
    if (Atom) delete[] Atom;
    Atom = Atom1;
  }
}


int  CMMDBFile::WritePDBASCII1 ( cpstr PDBLFName, byte gzipMode )  {
pstr FName;
  FName = getenv ( PDBLFName );
  if (FName)  return WritePDBASCII ( FName,gzipMode );
        else  return Error_NoLogicalName;
}

int  CMMDBFile::WritePDBASCII ( cpstr PDBFileName, byte gzipMode )  {
CFile f;

  //  opening it in pseudo-text mode ensures that the line terminators
  //  will correspond to the system MMDB is running on
  f.assign ( PDBFileName,True,False,gzipMode );
  FType = MMDB_FILE_PDB;

  if (f.rewrite())  {
    WritePDBASCII ( f );
    f.shut();
  } else
    return Error_CantOpenFile;

  return 0;

}


void  CMMDBFile::WritePDBASCII ( RCFile f )  {
int  i;

  FType = MMDB_FILE_PDB;

  Title.PDBASCIIDump ( f );

  i = 0;
  while (i<nModels)
    if (Model[i])  break;
             else  i++;
  if (i<nModels)
    Model[i]->PDBASCIIDumpPS ( f );

  // output cispep records
  for (i=0;i<nModels;i++)
    if (Model[i])
      Model[i]->PDBASCIIDumpCP ( f );

  SA      .PDBASCIIDump ( f );
  Footnote.PDBASCIIDump ( f );
  Cryst   .PDBASCIIDump ( f );
  SB      .PDBASCIIDump ( f );

  for (i=0;i<nModels;i++)
    if (Model[i])
      Model[i]->PDBASCIIDump ( f );

  SC.PDBASCIIDump ( f );

  f.WriteLine ( pstr("END") );

}


int  CMMDBFile::WriteCIFASCII1 ( cpstr CIFLFName, byte gzipMode )  {
pstr FName;
  FName = getenv ( CIFLFName );
  if (FName)  return WriteCIFASCII ( FName,gzipMode );
        else  return Error_NoLogicalName;
}

int  CMMDBFile::WriteCIFASCII ( cpstr CIFFileName, byte gzipMode )  {
int  i;

  if (!CIF)  CIF = new CMMCIFData();
  CIF->SetStopOnWarning ( True );
  CIF->SetPrintWarnings ( (Flags & MMDBF_PrintCIFWarnings)!=0 );
  FType = MMDB_FILE_CIF;

  Title.MakeCIF ( CIF );

  i = 0;
  while (i<nModels)
    if (Model[i])  break;
             else  i++;
  if (i<nModels)
    Model[i]->MakePSCIF ( CIF );

  Cryst.MakeCIF ( CIF );

  for (i=0;i<nModels;i++)
    if (Model[i])
      Model[i]->MakeAtomCIF ( CIF );

  CIF->Optimize();
  CIF->WriteMMCIFData ( CIFFileName,gzipMode );

  return 0;

}


PCAtom  CMMDBFile::GetAtomI ( int index )  {
  if (index>nAtoms)  return NULL;
  if (index<1)       return NULL;
  if (!Atom)         return NULL;
  return Atom[index-1];
}


#define MMDBFLabel  "**** This is MMDB binary file ****"
#define Edition     1

int  CMMDBFile::ReadMMDBF1 ( cpstr MMDBLFName, byte gzipMode )  {
pstr FName;
  FName = getenv ( MMDBLFName );
  if (FName)  return ReadCoorFile ( FName,gzipMode );
        else  return Error_NoLogicalName;
}

int  CMMDBFile::ReadMMDBF ( cpstr MMDBFileName, byte gzipMode )  {
char  Label[100];
byte  Version;
CFile f;

  f.assign ( MMDBFileName,False,True,gzipMode );
  FType = MMDB_FILE_Binary;
  if (f.reset(True))  {
    f.ReadFile ( Label,sizeof(MMDBFLabel) );
    if (strncmp(Label,MMDBFLabel,sizeof(MMDBFLabel)))  {
      f.shut();
      return Error_ForeignFile;
    }
    f.ReadByte ( &Version );
    if (Version>Edition)  {
      f.shut();
      return Error_WrongEdition;
    }
    read ( f );
    f.shut();
  } else
    return Error_CantOpenFile;

  return 0;

}


int  CMMDBFile::WriteMMDBF1 ( cpstr MMDBLFName, byte gzipMode )  {
pstr FName;
  FName = getenv ( MMDBLFName );
  if (FName)  return WriteMMDBF ( FName,gzipMode );
        else  return Error_NoLogicalName;
}

int  CMMDBFile::WriteMMDBF ( cpstr MMDBFileName, byte gzipMode )  {
char  Label[100];
byte  Version=Edition;
CFile f;

  f.assign ( MMDBFileName,False,True,gzipMode );
  FType = MMDB_FILE_Binary;
  if (f.rewrite())  {
    strcpy ( Label,MMDBFLabel );
    f.WriteFile ( Label,sizeof(MMDBFLabel) );
    f.WriteByte ( &Version );
    write ( f );
    f.shut();
  } else
    return Error_CantOpenFile;

  return 0;

}


pstr  CMMDBFile::GetEntryID()  {
  return Title.idCode;
}

void  CMMDBFile::SetEntryID ( const IDCode idCode )  {
  strcpy ( Title.idCode,idCode );
}

void CMMDBFile::SetSyminfoLib ( cpstr syminfo_lib )  {
  Cryst.SetSyminfoLib ( syminfo_lib );
}

pstr CMMDBFile::GetSyminfoLib()  {
  return Cryst.GetSyminfoLib();
}

int CMMDBFile::SetSpaceGroup ( cpstr spGroup )  {
  return Cryst.SetSpaceGroup ( spGroup );
}

pstr CMMDBFile::GetSpaceGroup()  {
  return Cryst.GetSpaceGroup();
}

pstr CMMDBFile::GetSpaceGroupFix()  {
  return Cryst.GetSpaceGroupFix();
}

void  CMMDBFile::GetAtomStatistics ( RSAtomStat AS )  {
int i;
  AS.Init();
  for (i=0;i<nModels;i++)
    if (Model[i])  Model[i]->CalcAtomStatistics ( AS );
  AS.Finish();
}

void CMMDBFile::SetIgnoreSCALEi ( Boolean ignoreScalei )  {
  Cryst.ignoreScalei = ignoreScalei;
}

void CMMDBFile::SetCell ( realtype cell_a,
                          realtype cell_b,
                          realtype cell_c,
                          realtype cell_alpha,
                          realtype cell_beta,
                          realtype cell_gamma,
                          int      OrthCode )  {
  Cryst.SetCell ( cell_a,cell_b,cell_c,cell_alpha,cell_beta,
                  cell_gamma,OrthCode );
}

void CMMDBFile::PutCell ( realtype cell_a,
                          realtype cell_b,
                          realtype cell_c,
                          realtype cell_alpha,
                          realtype cell_beta,
                          realtype cell_gamma,
                          int      OrthCode )  {
  Cryst.PutCell ( cell_a,cell_b,cell_c,cell_alpha,cell_beta,
                  cell_gamma,OrthCode );
}

int  CMMDBFile::GetCell ( realtype & cell_a,
                          realtype & cell_b,
                          realtype & cell_c,
                          realtype & cell_alpha,
                          realtype & cell_beta,
                          realtype & cell_gamma,
                          realtype & vol,
                          int      & OrthCode )  {
  if (Cryst.WhatIsSet & CSET_CellParams)  {
    Cryst.GetCell ( cell_a,cell_b,cell_c,cell_alpha,cell_beta,
                    cell_gamma,vol );
    OrthCode = Cryst.NCode + 1;
    return 1;
  } else {
    cell_a     = 0.0;    cell_b    = 0.0;    cell_c     = 0.0;
    cell_alpha = 0.0;    cell_beta = 0.0;    cell_gamma = 0.0;
    vol        = 0.0;    OrthCode  = 0;
    return 0;
  }
}

int  CMMDBFile::GetRCell ( realtype & cell_as,
                           realtype & cell_bs,
                           realtype & cell_cs,
                           realtype & cell_alphas,
                           realtype & cell_betas,
                           realtype & cell_gammas,
                           realtype & vols,
                           int      & OrthCode )  {
  if (Cryst.WhatIsSet & CSET_CellParams)  {
    Cryst.GetRCell ( cell_as,cell_bs,cell_cs,cell_alphas,cell_betas,
                     cell_gammas,vols );
    OrthCode = Cryst.NCode + 1;
    return 1;
  } else {
    cell_as     = 0.0;    cell_bs    = 0.0;    cell_cs     = 0.0;
    cell_alphas = 0.0;    cell_betas = 0.0;    cell_gammas = 0.0;
    vols        = 0.0;    OrthCode   = 0;
    return 0;
  }
}

int CMMDBFile::GetNumberOfSymOps()  {
  if (Cryst.WhatIsSet & CSET_SpaceGroup)
        return Cryst.GetNumberOfSymOps();
  else  return 0;
}

pstr CMMDBFile::GetSymOp ( int Nop )  {
  return Cryst.GetSymOp ( Nop );
}


void CMMDBFile::GetROMatrix ( mat44 & RO )  {
  Mat4Copy ( Cryst.RO,RO );
}

int CMMDBFile::GetTMatrix ( mat44 & TMatrix, int Nop,
                            int cellshift_a, int cellshift_b,
                            int cellshift_c )  {
//  GetTMatrix(..) calculates and returns the coordinate transformation
//  matrix, which converts orthogonal coordinates according to
//  the symmetry operation number Nop and places them into unit cell
//  shifted by cellshift_a a's, cellshift_b b's and cellshift_c c's.
//
//  Return 0 means everything's fine,
//         1 there's no symmetry operation Nop defined
//         2 fractionalizing/orthogonalizing matrices were not
//           calculated
//         3 cell parameters were not set up.
  return Cryst.GetTMatrix ( TMatrix,Nop,cellshift_a,cellshift_b,
                            cellshift_c,NULL );
}


int CMMDBFile::GetUCTMatrix ( mat44 & TMatrix, int Nop,
                              realtype x, realtype y, realtype z,
                              int cellshift_a, int cellshift_b,
                              int cellshift_c )  {
//  GetUCTMatrix(..) calculates and returns the coordinate
//  transformation matrix, which converts orthogonal coordinates
//  according to the symmetry operation number Nop. Translation
//  part of the resulting matrix is being chosen such that point
//  (x,y,z) has least distance to the center of primary (333)
//  unit cell, and then it is shifted by cellshift_a a's,
//  cellshift_b b's and cellshift_c c's.
//
//  Return 0 means everything's fine,
//         1 there's no symmetry operation Nop defined
//         2 fractionalizing/orthogonalizing matrices were not
//           calculated
//         3 cell parameters were not set up.
  return Cryst.GetUCTMatrix ( TMatrix,Nop,x,y,z,
                              cellshift_a,cellshift_b,cellshift_c,
                              NULL );
}


int CMMDBFile::GetFractMatrix ( mat44 & TMatrix, int Nop,
                                int cellshift_a, int cellshift_b,
                                int cellshift_c )  {
//  GetFractMatrix(..) calculates and returns the coordinate
//  transformation matrix, which converts fractional coordinates
//  according to the symmetry operation number Nop and places them
//  into unit cell shifted by cellshift_a a's, cellshift_b b's and
//  cellshift_c c's.
//
//  Return 0 means everything's fine,
//         1 there's no symmetry operation Nop defined
//         2 fractionalizing/orthogonalizing matrices were not
//           calculated
//         3 cell parameters were not set up.
  return Cryst.GetFractMatrix ( TMatrix,Nop,cellshift_a,cellshift_b,
                                cellshift_c,NULL );
}

int  CMMDBFile::GetSymOpMatrix ( mat44 & TMatrix, int Nop )  {
//
//  GetSymOpMatrix(..) returns the transformation matrix for
//  Nop-th symmetry operator in the space group
//
//  Return 0 means everything's fine,
//         1 there's no symmetry operation Nop defined
//         2 fractionalizing/orthogonalizing matrices were not
//           calculated
//         3 cell parameters were not set up.
//
  return Cryst.GetSymOpMatrix ( TMatrix,Nop );
}

//  -------------  User-Defined Data  ------------------------

int  CMMDBFile::RegisterUDInteger ( int udr_type, cpstr UDDataID )  {
  return UDRegister.RegisterUDInteger ( udr_type,UDDataID );
}

int  CMMDBFile::RegisterUDReal ( int udr_type, cpstr UDDataID )  {
  return UDRegister.RegisterUDReal ( udr_type,UDDataID );
}

int  CMMDBFile::RegisterUDString ( int udr_type, cpstr UDDataID )  {
  return UDRegister.RegisterUDString ( udr_type,UDDataID );
}

int  CMMDBFile::GetUDDHandle ( int udr_type, cpstr UDDataID )  {
  return UDRegister.GetUDDHandle ( udr_type,UDDataID );
}



//  ----------------------------------------------------------

int CMMDBFile::DeleteAllModels()  {
int i,k;
  Exclude = False;
  k = 0;
  for (i=0;i<nModels;i++)  {
    if (Model[i])  {
      delete Model[i];
      Model[i] = NULL;
      k++;
    }
  }
  Exclude = True;
  FinishStructEdit();
  return k;
}

Boolean CMMDBFile::GetNewChainID ( int modelNo, ChainID chID,
                                   int length )  {
  if ((modelNo>=1) && (modelNo<=nModels))  {
    if (Model[modelNo-1])
      return  Model[modelNo-1]->GetNewChainID ( chID,length );
  }
  return False;
}

//  -------------------------------------------------------------

PCMask CMMDBFile::GetSelMask ( int selHnd )  {
  return NULL;
}

//  -------------------------------------------------------------

int  CMMDBFile::GetNofExpDataRecs()  {
  return Title.ExpData.Length();
}

pstr  CMMDBFile::GetExpDataRec ( int recNo )  {
PCExpData  expData;
  expData = PCExpData(Title.ExpData.GetContainerClass(recNo));
  if (expData)  return expData->Line;
  return NULL;
}


//  -------------------  Stream functions  ----------------------

void  CMMDBFile::Copy ( PCMMDBFile MMDBFile )  {
int i;

  Title.Copy ( &MMDBFile->Title );
  Cryst.Copy ( &MMDBFile->Cryst );

  //   It is important to copy atoms _before_ models,
  // residues and chains!
  Flags  = MMDBFile->Flags;
  nAtoms = MMDBFile->nAtoms;
  AtmLen = nAtoms;
  if (nAtoms>0)  {
    Atom = new PCAtom[AtmLen];
    for (i=0;i<nAtoms;i++)
      if (MMDBFile->Atom[i])  {
        Atom[i] = newCAtom();
        Atom[i]->Copy ( MMDBFile->Atom[i] );
        Atom[i]->index = i+1;
        // the internal atom references are installed
        // by residue classes when they are copied in
        // model->chain below
      } else
        Atom[i] = NULL;
  }

  nModels = MMDBFile->nModels;
  if (nModels>0)  {
    Model = new PCModel[nModels];
    for (i=0;i<nModels;i++)  {
      if (MMDBFile->Model[i])  {
        Model[i] = newCModel();
        Model[i]->SetMMDBManager ( PCMMDBManager(this),i+1 );
        Model[i]->_copy ( MMDBFile->Model[i] );
      } else
        Model[i] = NULL;
    } 
  }
 
  SA      .Copy ( &MMDBFile->SA       );
  Footnote.Copy ( &MMDBFile->Footnote );
  SB      .Copy ( &MMDBFile->SB       );
  SC      .Copy ( &MMDBFile->SC       );

  if (MMDBFile->CIF)  {
    CIF = new CMMCIFData;
    CIF->Copy ( MMDBFile->CIF );
  }

}



// -------  user-defined data handlers

int  CMMDBFile::PutUDData ( int UDDhandle, int iudd )  {
  if (UDDhandle & UDRF_HIERARCHY)
        return  CUDData::putUDData ( UDDhandle,iudd );
  else  return  UDDATA_WrongUDRType;
}

int  CMMDBFile::PutUDData ( int UDDhandle, realtype rudd )  {
  if (UDDhandle & UDRF_HIERARCHY)
        return  CUDData::putUDData ( UDDhandle,rudd );
  else  return  UDDATA_WrongUDRType;
}

int  CMMDBFile::PutUDData ( int UDDhandle, cpstr sudd )  {
  if (UDDhandle & UDRF_HIERARCHY)
        return  CUDData::putUDData ( UDDhandle,sudd );
  else  return  UDDATA_WrongUDRType;
}

int  CMMDBFile::GetUDData ( int UDDhandle, int & iudd )  {
  if (UDDhandle & UDRF_HIERARCHY)
        return  CUDData::getUDData ( UDDhandle,iudd );
  else  return  UDDATA_WrongUDRType;
}

int  CMMDBFile::GetUDData ( int UDDhandle, realtype & rudd )  {
  if (UDDhandle & UDRF_HIERARCHY)
        return  CUDData::getUDData ( UDDhandle,rudd );
  else  return  UDDATA_WrongUDRType;
}

int  CMMDBFile::GetUDData ( int UDDhandle, pstr sudd, int maxLen )  {
  if (UDDhandle & UDRF_HIERARCHY)
        return  CUDData::getUDData ( UDDhandle,sudd,maxLen );
  else  return  UDDATA_WrongUDRType;
}

int  CMMDBFile::GetUDData ( int UDDhandle, pstr & sudd )  {
  if (UDDhandle & UDRF_HIERARCHY)
        return  CUDData::getUDData ( UDDhandle,sudd );
  else  return  UDDATA_WrongUDRType;
}


pstr CMMDBFile::GetStructureTitle ( pstr & L )  {
  return Title.GetStructureTitle ( L );
}

void  CMMDBFile::SetShortBinary()  {
// leaves only coordinates in binary files
int i;
  for (i=0;i<nAtoms;i++)
    if (Atom[i])  Atom[i]->SetShortBinary();
}


void  CMMDBFile::write ( RCFile f )  {
int  i,k;
byte Version=1;

  f.WriteByte ( &Version );

  CUDData::write ( f );

  Title     .write ( f );
  Cryst     .write ( f );
  UDRegister.write ( f );
  DefPath   .write ( f );

  f.WriteWord ( &Flags  );
  f.WriteInt  ( &nAtoms );
  for (i=0;i<nAtoms;i++)  {
    if (Atom[i])  k = 1;
            else  k = 0;
    f.WriteInt ( &k );
    if (Atom[i]) Atom[i]->write ( f );
  }

  f.WriteInt ( &nModels );
  for (i=0;i<nModels;i++)  {
    if (Model[i])  k = 1;
             else  k = 0;
    f.WriteInt ( &k );
    if (Model[i]) Model[i]->write ( f );
  }

  SA      .write ( f );
  Footnote.write ( f );
  SB      .write ( f );
  SC      .write ( f );

  StreamWrite ( f,CIF );

}

void  CMMDBFile::read ( RCFile f )  {
int  i,k;
byte Version;

  ResetManager  ();
  FreeFileMemory();

  f.ReadByte ( &Version );

  CUDData::read ( f );

  Title     .read ( f );
  Cryst     .read ( f );
  UDRegister.read ( f );
  DefPath   .read ( f );

  //   It is important to read atoms before models,
  // residues and chains!
  f.ReadWord ( &Flags  );
  f.ReadInt  ( &nAtoms );
  AtmLen = nAtoms;
  if (nAtoms>0)  {
    Atom = new PCAtom[AtmLen];
    for (i=0;i<nAtoms;i++)  {
      f.ReadInt ( &k );
      if (k)  {
        Atom[i] = newCAtom();
        Atom[i]->read ( f );
        // the internal atom references are installed
        // by residue classes when they are read in
        // model->chain below
      } else
        Atom[i] = NULL;
    } 
  }

  f.ReadInt ( &nModels );
  if (nModels>0)  {
    Model = new PCModel[nModels];
    for (i=0;i<nModels;i++)  {
      f.ReadInt ( &k );
      if (k)  {
        Model[i] = newCModel();
        Model[i]->SetMMDBManager ( PCMMDBManager(this),0 );
        Model[i]->read ( f );
      } else
        Model[i] = NULL;
    } 
  }

  SA      .read ( f );
  Footnote.read ( f );
  SB      .read ( f );
  SC      .read ( f );

  StreamRead ( f,CIF );

}


MakeStreamFunctions(CMMDBFile)



int isMMDBBIN ( cpstr FName, byte gzipMode )  {
char  Label[100];
byte  Version;
CFile f;

  f.assign ( FName,False,True,gzipMode );
  if (f.reset(True))  {
    if (f.FileEnd())  {
      f.shut();
      return Error_EmptyFile;
    }
    f.ReadFile ( Label,sizeof(MMDBFLabel) );
    if (strncmp(Label,MMDBFLabel,sizeof(MMDBFLabel)))  {
      f.shut();
      return 1;
    }
    f.ReadByte ( &Version );
    f.shut();
    if (Version>Edition)  return 2;
                    else  return 0;
  } else
    return -1;

}


int isPDB ( cpstr FName, byte gzipMode, Boolean IgnoreBlankLines )  {
CFile   f;
char    S[256];
int     i;
Boolean Done;

  //  opening it in pseudo-binary mode helps reading various
  //  line terminators for files coming from different platforms
  f.assign ( FName,False,False,gzipMode );
  if (f.reset(True))  {
    if (f.FileEnd())  {
      f.shut();
      return Error_EmptyFile;
    }
    do {
      Done = True;
      f.ReadLine ( S,sizeof(S)-1 );
      if (IgnoreBlankLines)  {
        i = 0;
        while (S[i] && (S[i]==' '))  i++;
        if (!S[i])  Done = False;
      }
    } while ((!f.FileEnd()) && (!Done));
    f.shut();
    PadSpaces  ( S,80 );
    if (!strncasecmp(S,"HEADER",6))  return 0;
    if (!strncasecmp(S,"OBSLTE",6))  return 0;
    if (!strncasecmp(S,"TITLE ",6))  return 0;
    if (!strncasecmp(S,"CAVEAT",6))  return 0;
    if (!strncasecmp(S,"COMPND",6))  return 0;
    if (!strncasecmp(S,"SOURCE",6))  return 0;
    if (!strncasecmp(S,"KEYWDS",6))  return 0;
    if (!strncasecmp(S,"EXPDTA",6))  return 0;
    if (!strncasecmp(S,"AUTHOR",6))  return 0;
    if (!strncasecmp(S,"REVDAT",6))  return 0;
    if (!strncasecmp(S,"SPRSDE",6))  return 0;
    if (!strncasecmp(S,"JRNL  ",6))  return 0;
    if (!strncasecmp(S,"REMARK",6))  return 0;
    if (!strncasecmp(S,"DBREF ",6))  return 0;
    if (!strncasecmp(S,"SEQADV",6))  return 0;
    if (!strncasecmp(S,"SEQRES",6))  return 0;
    if (!strncasecmp(S,"MODRES",6))  return 0;
    if (!strncasecmp(S,"HET   ",6))  return 0;
    if (!strncasecmp(S,"HETNAM",6))  return 0;
    if (!strncasecmp(S,"HETSYN",6))  return 0;
    if (!strncasecmp(S,"FORMUL",6))  return 0;
    if (!strncasecmp(S,"HELIX ",6))  return 0;
    if (!strncasecmp(S,"SHEET ",6))  return 0;
    if (!strncasecmp(S,"TURN  ",6))  return 0;
    if (!strncasecmp(S,"SSBOND",6))  return 0;
    if (!strncasecmp(S,"LINK  ",6))  return 0;
    if (!strncasecmp(S,"HYDBND",6))  return 0;
    if (!strncasecmp(S,"SLTBRG",6))  return 0;
    if (!strncasecmp(S,"CISPEP",6))  return 0;
    if (!strncasecmp(S,"SITE  ",6))  return 0;
    if (!strncasecmp(S,"CRYST1",6))  return 0;
    if (!strncasecmp(S,"CRYST ",6))  return 0;
    if (!strncasecmp(S,"ORIGX1",6))  return 0;
    if (!strncasecmp(S,"ORIGX2",6))  return 0;
    if (!strncasecmp(S,"ORIGX3",6))  return 0;
    if (!strncasecmp(S,"SCALE1",6))  return 0;
    if (!strncasecmp(S,"SCALE2",6))  return 0;
    if (!strncasecmp(S,"SCALE3",6))  return 0;
    if (!strncasecmp(S,"MTRIX1",6))  return 0;
    if (!strncasecmp(S,"MTRIX2",6))  return 0;
    if (!strncasecmp(S,"MTRIX3",6))  return 0;
    if (!strncasecmp(S,"TVECT ",6))  return 0;
    if (!strncasecmp(S,"MODEL ",6))  return 0;
    if (!strncasecmp(S,"ATOM  ",6))  return 0;
    if (!strncasecmp(S,"SIGATM",6))  return 0;
    if (!strncasecmp(S,"ANISOU",6))  return 0;
    if (!strncasecmp(S,"SIGUIJ",6))  return 0;
    if (!strncasecmp(S,"TER   ",6))  return 0;
    if (!strncasecmp(S,"HETATM",6))  return 0;
    if (!strncasecmp(S,"ENDMDL",6))  return 0;
    if (!strncasecmp(S,"CONECT",6))  return 0;
    if (!strncasecmp(S,"MASTER",6))  return 0;
    if (!strncasecmp(S,"END   ",6))  return 0;
    if (!strncasecmp(S,"USER  ",6))  return 0;
    return  1;
  } else
    return -1;

}
