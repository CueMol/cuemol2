//  $Id: mmdb_model.cpp,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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
//  **** Module  :  MMDB_Model  <implementation>
//       ~~~~~~~~~
//  **** Project :  MacroMolecular Data Base (MMDB)
//       ~~~~~~~~~ 
//  **** Classes :  CHetCompound  ( description of het compounds    )
//       ~~~~~~~~~  CHetCompounds ( HETNAM, HETSYN, FORMULA records )
//                  CSSContainer  ( container for helixes and turns )
//                  CHelix        ( helix info                      )
//                  CStrand       ( strand info                     )
//                  CSheet        ( sheet info                      )
//                  CSheets       ( container for sheets            )
//                  CTurn         ( turn info                       )
//                  CLinkContainer   ( container for link data      )
//                  CLink            ( link data                    )
//                  CCisPepContainer ( container for CisPep data    )
//                  CCisPep          ( CisPep data                  )
//                  CModel        ( PDB model                       )
//
//  Copyright (C) E. Krissinel 2000-2008
//
//  =================================================================
//

#ifndef  __STRING_H
#include <string.h>
#endif

#ifndef  __STDLIB_H
#include <stdlib.h>
#endif

#ifndef  __MMDB_Model__
#include "mmdb_model.h"
#endif

#ifndef  __MMDB_Manager__
#include "mmdb_manager.h"
#endif

#ifndef  __MMDB_CIFDefs__
#include "mmdb_cifdefs.h"
#endif



//  ===================  CHetCompound  =========================


CHetCompound::CHetCompound ( cpstr HetName ) : CStream()  {
  InitHetCompound ( HetName );
}

CHetCompound::CHetCompound ( RPCStream Object ) : CStream(Object)  {
  InitHetCompound ( pstr("---") );
}

CHetCompound::~CHetCompound() {
  FreeMemory();
}

void  CHetCompound::InitHetCompound ( cpstr HetName )  {
  strcpy_n0 ( hetID,HetName,sizeof(ResName) );
  comment    = NULL;
  nSynonyms  = 0;
  hetSynonym = NULL;
  compNum    = MinInt4;
  wc         = ' ';
  Formula    = NULL;
}

void  CHetCompound::FreeMemory()  {
int i;
  if (comment)  {
    delete[] comment;
    comment = NULL;
  }
  if (hetSynonym)  {
    for (i=0;i<nSynonyms;i++)
      if (hetSynonym[i])  delete[] hetSynonym[i];
    delete[] hetSynonym;
    hetSynonym = NULL;
  }
  nSynonyms = 0;
  if (Formula)  {
    delete[] Formula;
    Formula = NULL;
  }
}

void  CHetCompound::AddKeyWord ( cpstr W, Boolean Closed )  {
psvector HS1;
int      i;
  if (Closed || (!hetSynonym))  {
    // first synonym orthe previous synonym was closed by semicolon
    // -- add a new one
    HS1 = new pstr[nSynonyms+1];
    for (i=0;i<nSynonyms;i++)
      HS1[i] = hetSynonym[i];
    if (hetSynonym)  delete[] hetSynonym;
    hetSynonym = HS1;
    hetSynonym[nSynonyms] = NULL;
    CreateCopy ( hetSynonym[nSynonyms],W );
    nSynonyms++;
  } else  {
    // just add W to the last synonym
    CreateConcat ( hetSynonym[nSynonyms-1],pstr(" "),W );
  }
}


void CHetCompound::HETNAM_PDBDump ( RCFile f )  {
char S[100];
pstr p1,p2;
char c;
int  N,i;
  if (!comment)  return;
  N  = 0;
  p1 = comment;
  do  {
    N++;
    if (N==1)  sprintf ( S,"HETNAM     %3s " ,hetID   );
         else  sprintf ( S,"HETNAM  %2i %3s ",N,hetID );
    while (*p1==' ')  p1++;
    p2 = strchr(p1,'\n');
    if (p2)  {
      c   = *p2;
      *p2 = char(0);
    } else if (strlen(p1)>53)  {
      i = 0;
      while (p1[i] && (i<53) && (p1[i]!=' '))  i++;
      p2  = &(p1[i]);
      c   = *p2;
      *p2 = char(0);
    }
    if (*p1)  {
      strcat      ( S,p1 );
      PadSpaces   ( S,80 );
      f.WriteLine ( S );
    } else
      N--;
    if (p2)  {
      *p2 = c;
      if (c)  p1 = p2+1;
        else  p2 = NULL;
    }
  } while (p2);
}


void CHetCompound::HETSYN_PDBDump ( RCFile f )  {
char S[100];
pstr p;
char c;
int  N,k,i,l;
  if (!hetSynonym)  return;
  N = 0;
  k = 0;
  p = &(hetSynonym[0][0]);
  do  {
    N++;
    if (N==1)  sprintf ( S,"HETSYN     %3s " ,hetID   );
         else  sprintf ( S,"HETSYN  %2i %3s ",N,hetID );
    i = 0;
    do  {
      l = strlen(p)+2;
      if (i+l<54)  {
        strcat ( S,p );
        if (k<nSynonyms-1) strcat ( S,"; " );
        k++;
        i += l;
        if (k<nSynonyms)  p = &(hetSynonym[k][0]);
                    else  i = 60;  // break loop
      } else  {
        if (i==0)  {
          // too long synonym, has to be split over several lines
          i = l-3;
          while (i>51)  {
            i--;
            while ((i>0) && (p[i]!=' '))  i--;
          }
          if (i<2)  i = 51;  // no spaces!
          c    = p[i];
          p[i] = char(0);
          strcat ( S,p );
          p[i] = c;
          p    = &(p[i]);
          while (*p==' ')  p++;
        }
        i = 60;  // break loop
      }
    } while (i<54);
    PadSpaces ( S,80 );
    f.WriteLine ( S );
  } while (k<nSynonyms);
}


void CHetCompound::FORMUL_PDBDump ( RCFile f )  {
char S[100];
pstr p1,p2;
char c;
int  N,i;
  if (!Formula)  return;
  N  = 0;
  p1 = Formula;
  do  {
    N++;
    if (compNum>MinInt4)  {
      if (N==1)  sprintf ( S,"FORMUL  %2i  %3s    " ,compNum,hetID   );
           else  sprintf ( S,"FORMUL  %2i  %3s %2i ",compNum,hetID,N );
    } else  {
      if (N==1)  sprintf ( S,"FORMUL      %3s    " ,hetID   );
           else  sprintf ( S,"FORMUL      %3s %2i ",hetID,N );
    }
    S[18] = wc;
    p2 = strchr(p1,'\n');
    if (p2)  {
      c   = *p2;
      *p2 = char(0);
    } else if (strlen(p1)>50)  {
      while (*p1==' ')  p1++;
      i = 0;
      while (p1[i] && (i<50) && (p1[i]!=' '))  i++;
      p2  = &(p1[i]);
      c   = *p2;
      *p2 = char(0);
    }
    strcat ( S,p1 );
    if (p2)  {
      *p2 = c;
      p1  = p2+1;
    }
    PadSpaces ( S,80 );
    f.WriteLine ( S );
  } while (p2);
}


void  CHetCompound::FormComString ( pstr & F )  {
pstr p;
int  i;
  if (F)  {
    delete[] F;
    F = NULL;
  }
  if (comment)  {
    CreateCopy ( F,comment );
    i = 0;
    p = comment;
    while (*p)  {
      p++;
      if (*p=='\n')  i = 0;
               else  i++;
      if (i>68)  {
        F[i] = char(0);
        CreateConcat ( F,pstr("\n"),p );
        i = 0;
      }
    }
  }
}


void  CHetCompound::FormSynString ( pstr & F )  {
pstr p;
char c;
int  i,k,l;
  if (F)  {
    delete[] F;
    F = NULL;
  }
  if (hetSynonym)  {
    CreateCopy ( F,pstr("  ") );
    k = 0;
    p = &(hetSynonym[0][0]);
    do  {
      l = strlen(p)+2;
      if (l<=60)  {
        if (k<nSynonyms-1)  CreateConcat ( F,p,pstr(";\n  ") );
                      else  CreateConcat ( F,p );
        k++;
        if (k<nSynonyms)  p = &(hetSynonym[k][0]);
      } else  {
        // too long synonym, has to be split over several lines
        i = l-3;
        while (i>60)  {
          i--;
          while ((i>0) && (p[i]!=' '))  i--;
        }
        if (i<2)  i = 60;  // no spaces!
        c    = p[i];
        p[i] = char(0);
        CreateConcat ( F,p,pstr("\n  ") );
        p[i] = c;
        p    = &(p[i]);
        while (*p==' ')  p++;
      }
    } while (k<nSynonyms);
  }
}

void  CHetCompound::FormForString ( pstr & F )  {
pstr p;
int  i;
  if (F)  {
    delete[] F;
    F = NULL;
  }
  if (Formula)  {
    CreateCopy ( F,Formula );
    i = 0;
    p = &(Formula[0]);
    while (*p)  {
      p++;
      if (*p=='\n')  i = 0;
               else  i++;
      if (i>68)  {
        F[i] = char(0);
        CreateConcat ( F,pstr("\n"),p );
        i = 0;
      }
    }
  }
}


void  CHetCompound::Copy ( PCHetCompound HetCompound )  {
int i;
  FreeMemory ();
  strcpy     ( hetID  ,HetCompound->hetID   );
  CreateCopy ( comment,HetCompound->comment );
  nSynonyms = HetCompound->nSynonyms;
  if (nSynonyms>0) {
    hetSynonym = new pstr[nSynonyms];
    for (i=0;i<nSynonyms;i++)  {
      hetSynonym[i] = NULL;
      CreateCopy ( hetSynonym[i],HetCompound->hetSynonym[i] );
    }
  }
  compNum = HetCompound->compNum;
  wc      = HetCompound->wc;
  CreateCopy ( Formula,HetCompound->Formula );
}

void  CHetCompound::write ( RCFile f )  {
int  i;
byte Version=1;
  f.WriteByte    ( &Version    );
  f.WriteTerLine ( hetID,False );
  f.CreateWrite  ( comment     );
  f.WriteInt     ( &nSynonyms  );
  for (i=0;i<nSynonyms;i++)
    f.CreateWrite ( hetSynonym[i] );
  f.WriteInt    ( &compNum       );
  f.WriteFile   ( &wc,sizeof(wc) );
  f.CreateWrite ( Formula        );
}

void  CHetCompound::read ( RCFile f )  {
int  i;
byte Version;
  FreeMemory();
  f.ReadByte    ( &Version    );
  f.ReadTerLine ( hetID,False );
  f.CreateRead  ( comment     );
  f.ReadInt     ( &nSynonyms  );
  if (nSynonyms>0) {
    hetSynonym = new pstr[nSynonyms];
    for (i=0;i<nSynonyms;i++)  {
      hetSynonym[i] = NULL;
      f.CreateRead ( hetSynonym[i] );
    }
  }
  f.ReadInt    ( &compNum       );
  f.ReadFile   ( &wc,sizeof(wc) );
  f.CreateRead ( Formula        );
}



//  ====================  CHetCompounds  =======================


CHetCompounds::CHetCompounds() : CStream()  {
  InitHetCompounds();
}

CHetCompounds::CHetCompounds ( RPCStream Object ) : CStream(Object)  {
  InitHetCompounds();
}

CHetCompounds::~CHetCompounds() {
  FreeMemory();
}

void  CHetCompounds::InitHetCompounds()  {
  nHets       = 0;
  hetCompound = NULL;
  Closed      = False;
}

void  CHetCompounds::FreeMemory()  {
int i;
  if (hetCompound)  {
    for (i=0;i<nHets;i++)
      if (hetCompound[i])  delete hetCompound[i];
    delete[] hetCompound;
    hetCompound = NULL;
  }
  nHets = 0;
}

void  CHetCompounds::ConvertHETNAM ( cpstr S )  {
ResName hetID;
char    L[100];
int     l,i;
  l = strlen(S);
  if (l>12)  {
    strcpy_n0 ( hetID,&(S[11]),3 );
    i = AddHetName ( hetID );
    if (l>15)  {
      if (hetCompound[i]->comment)  strcpy ( L,"\n" );
                              else  L[0] = char(0);
      strcat       ( L,&(S[15])    );
      CutSpaces    ( L,SCUTKEY_END );
      CreateConcat ( hetCompound[i]->comment,L );
    }
  }
}

void  CHetCompounds::ConvertHETSYN ( cpstr S )  {
ResName hetID;
char    L[100];
//pstr    p1,p2;
char    c;
int     l,i,j,k;
  l = strlen(S);
  if (l>12)  {
    strcpy_n0 ( hetID,&(S[11]),3 );
    i = AddHetName ( hetID );
    if (l>15)  {
      j = 15;
      do {
        while (S[j]==' ')  j++;
        k = 0;
        if (S[j])  {
          while (S[j] && (S[j]!=';'))
            L[k++] = S[j++];
          L[k--] = char(0);
          while ((k>0) && (L[k]==' '))  L[k--] = char(0);
          if (L[0])  {
            hetCompound[i]->AddKeyWord ( L,Closed );
            Closed = (S[j]==';');
          }
          if (S[j])  j++;
        }
      } while (S[j]);
      /*
      p1 = &(S[15]);
      do  {
        p2 = strchr ( p1,';' );
        if (p2)  {
          c   = *p2;
          *p2 = char(0);
        }
        strcpy_css ( L,p1 );
        if (L[0])
          hetCompound[i]->AddKeyWord ( L,Closed );
        if (p2) {
          if (L[0]) Closed = True;
          *p2 = c;
          p1 = p2+1;
        } else if (L[0])
          Closed = False;
      } while (p2);
      */
    }
  }
}

void  CHetCompounds::ConvertFORMUL ( cpstr S )  {
ResName hetID;
char    L[100];
int     l,i;
  l = strlen(S);
  if (l>13)  {
    strcpy_n0 ( hetID,&(S[12]),3 );
    i = AddHetName ( hetID );
    if (l>18) {
      GetInteger ( hetCompound[i]->compNum,&(S[9]),2 );
      hetCompound[i]->wc = S[18];
      if (strlen(S)>19)  {
        if (hetCompound[i]->Formula)  strcpy ( L,"\n" );
                                else  L[0] = char(0);
        strcat       ( L,&(S[19])    );
        CutSpaces    ( L,SCUTKEY_END );
        CreateConcat ( hetCompound[i]->Formula,L );
      }
    }
  }
}
int  CHetCompounds::AddHetName ( cpstr H )  {
PPCHetCompound HC1;
int            i;
  i = 0;
  while (i<nHets)  {
    if (hetCompound[i])  {
      if (!strcmp(hetCompound[i]->hetID,H))  break;
    }
    i++;
  }
  if (i>=nHets)  {
    HC1 = new PCHetCompound[nHets+1];
    for (i=0;i<nHets;i++)
      HC1[i] = hetCompound[i];
    if (hetCompound)  delete[] hetCompound;
    hetCompound = HC1;
    hetCompound[nHets] = new CHetCompound ( H );
    i = nHets;
    nHets++;
  }
  return i;
}

void CHetCompounds::PDBASCIIDump ( RCFile f )  {
int  i;

  for (i=0;i<nHets;i++)
    if (hetCompound[i])
      hetCompound[i]->HETNAM_PDBDump ( f );

  for (i=0;i<nHets;i++)
    if (hetCompound[i])
      hetCompound[i]->HETSYN_PDBDump ( f );

  for (i=0;i<nHets;i++)
    if (hetCompound[i])
      hetCompound[i]->FORMUL_PDBDump ( f );

}


void  CHetCompounds::MakeCIF ( PCMMCIFData CIF )  {
PCMMCIFLoop Loop;
pstr        F;
int         RC;
int         i;

  if (!hetCompound)  return;

  RC = CIF->AddLoop ( CIFCAT_CHEM_COMP,Loop );
  if (RC!=CIFRC_Ok)  {
    Loop->AddLoopTag ( CIFTAG_ID               );
    Loop->AddLoopTag ( CIFTAG_NAME             );
    Loop->AddLoopTag ( CIFTAG_NDB_SYNONYMS     );
    Loop->AddLoopTag ( CIFTAG_NDB_COMPONENT_NO );
    Loop->AddLoopTag ( CIFTAG_FORMULA          );
  }

  F = NULL;
  for (i=0;i<nHets;i++)
    if (hetCompound[i])  {
      Loop->AddString ( hetCompound[i]->hetID );
      hetCompound[i]->FormComString ( F );
      Loop->AddString ( F );
      hetCompound[i]->FormSynString ( F );
      Loop->AddString ( F );
      if (hetCompound[i]->compNum>MinInt4)
            Loop->AddInteger ( hetCompound[i]->compNum );
      else  Loop->AddNoData  ( CIF_NODATA_QUESTION     );
      hetCompound[i]->FormForString ( F );
      Loop->AddString ( F );
    }

  if (F)  delete[] F;

}

void  CHetCompounds::GetCIF ( PCMMCIFData CIF )  {
PCMMCIFLoop Loop;
char        L[100];
ResName     hetID;
pstr        F,p1,p2;
char        c;
int         i,l,k,RC;

  FreeMemory();

  Loop = CIF->GetLoop ( CIFCAT_CHEM_COMP );
  if (!Loop)  return;

  l = Loop->GetLoopLength();
  F = NULL;

  for (i=0;i<l;i++)  {
    CIFGetString    ( hetID,Loop,CIFTAG_ID,i,sizeof(hetID),
                      pstr("---") );
    k = AddHetName  ( hetID );
    Loop->GetString ( hetCompound[k]->comment,CIFTAG_NAME,i,True );
    RC = Loop->GetInteger ( hetCompound[k]->compNum,
                                     CIFTAG_NDB_COMPONENT_NO,i,True );
    if (RC)  hetCompound[i]->compNum = MinInt4;
    Loop->GetString ( hetCompound[k]->Formula,CIFTAG_FORMULA,i,True );
    RC = Loop->GetString ( F,CIFTAG_NDB_SYNONYMS,i,True );
    if ((!RC) && F )  {
      p1 = &(F[0]);
      while (*p1)  {
        if (*p1=='\n')  *p1 = ' ';
        p1++;
      }
      p1 = &(F[0]);
      do  {
        p2 = strchr ( p1,';' );
        if (p2)  {
          c   = *p2;
          *p2 = char(0);
        }
        strcpy_css ( L,p1 );
        hetCompound[i]->AddKeyWord ( L,True );
        if (p2) {
          *p2 = c;
          p1 = p2+1;
        }
      } while (p2);
    }
    hetCompound[i]->wc = ' ';
  }

  if (F)  delete[] F;

}

void  CHetCompounds::Copy ( PCHetCompounds HetCompounds )  {
int i;
  FreeMemory();
  nHets = HetCompounds->nHets;
  if (nHets>0)  {
    hetCompound = new PCHetCompound[nHets];
    for (i=0;i<nHets;i++)  {
      hetCompound[i] = new CHetCompound ( "" );
      hetCompound[i]->Copy ( HetCompounds->hetCompound[i] );
    }
  }
}

void  CHetCompounds::write ( RCFile f )  {
int  i;
byte Version=1;
  f.WriteByte ( &Version );
  f.WriteInt  ( &nHets   );
  for (i=0;i<nHets;i++)
    hetCompound[i]->write ( f );
}

void  CHetCompounds::read ( RCFile f )  {
int  i;
byte Version;
  FreeMemory();
  f.ReadByte ( &Version );
  f.ReadInt  ( &nHets   );
  if (nHets>0)  {
    hetCompound = new PCHetCompound[nHets];
    for (i=0;i<nHets;i++)  {
      hetCompound[i] = new CHetCompound ( "---" );
      hetCompound[i]->read ( f );
    }
  }
}

MakeStreamFunctions(CHetCompounds)



//  ====================  CSSContainer  =========================

PCContainerClass CSSContainer::MakeContainerClass ( int ClassID )  {
  switch (ClassID)  {
    default :
    case ClassID_Template : return
                        CClassContainer::MakeContainerClass(ClassID);
    case ClassID_Helix    : return new CHelix();
    case ClassID_Turn     : return new CTurn ();
  }
}

MakeStreamFunctions(CSSContainer)



//  ================  CHelix  ===================

CHelix::CHelix() : CContainerClass()  {
  InitHelix();
}

CHelix::CHelix ( cpstr S ) : CContainerClass()  {
  InitHelix();
  ConvertPDBASCII ( S );
}

CHelix::CHelix ( RPCStream Object ) : CContainerClass(Object)  {
  InitHelix();
}

CHelix::~CHelix() {
  if (comment)  delete[] comment;
}

void  CHelix::InitHelix()  {

  serNum = 0;                   // serial number
  strcpy ( helixID    ,"---" ); // helix ID
  strcpy ( initResName,"---" ); // name of the helix's initial residue
  strcpy ( initChainID,""    ); // chain ID for the chain
                                // containing the helix
  initSeqNum = 0;               // sequence number of the initial
                                //    residue
  strcpy ( initICode  ,""    ); // insertion code of the initial
                                //    residue
  strcpy ( endResName ,"---" ); // name of the helix's terminal residue
  strcpy ( endChainID ,""    ); // chain ID for the chain
                                // containing the helix
  endSeqNum  = 0;               // sequence number of the terminal
                                //    residue
  strcpy ( endICode   ,""    ); // insertion code of the terminal
                                //    residue
  helixClass = 0;               // helix class
  comment    = NULL;            // comment about the helix
  length     = 0;               // length of the helix

}

void  CHelix::PDBASCIIDump ( pstr S, int N )  {
//  makes the ASCII PDB OBSLTE line number N
//  from the class' data
  strcpy     ( S,"HELIX" );
  PadSpaces  ( S,80 );
  PutInteger ( &(S[7]) ,serNum     ,3  );
  strcpy_n1  ( &(S[11]),helixID    ,3  );
  strcpy_n1  ( &(S[15]),initResName,3  );
  if (initChainID[0])  S[19] = initChainID[0];
  PutIntIns  ( &(S[21]),initSeqNum ,4,initICode );
  strcpy_n1  ( &(S[27]),endResName ,3  );
  if (endChainID[0])   S[31] = endChainID[0];
  PutIntIns  ( &(S[33]),endSeqNum  ,4,endICode  );
  PutInteger ( &(S[38]),helixClass ,2  );
  if (comment)
    strcpy_n ( &(S[40]),comment    ,30 );
  PutInteger ( &(S[71]),length     ,5  );
}

void AddStructConfTags ( PCMMCIFLoop Loop )  {
  Loop->AddLoopTag ( CIFTAG_CONF_TYPE_ID               );
  Loop->AddLoopTag ( CIFTAG_ID                         );
  Loop->AddLoopTag ( CIFTAG_PDB_ID                     );
  Loop->AddLoopTag ( CIFTAG_BEG_LABEL_COMP_ID          );
  Loop->AddLoopTag ( CIFTAG_BEG_LABEL_ASYM_ID          );
  Loop->AddLoopTag ( CIFTAG_BEG_LABEL_SEQ_ID           );
  Loop->AddLoopTag ( CIFTAG_NDB_BEG_LABEL_INS_CODE_PDB );
  Loop->AddLoopTag ( CIFTAG_END_LABEL_COMP_ID          );
  Loop->AddLoopTag ( CIFTAG_END_LABEL_ASYM_ID          );
  Loop->AddLoopTag ( CIFTAG_END_LABEL_SEQ_ID           );
  Loop->AddLoopTag ( CIFTAG_NDB_END_LABEL_INS_CODE_PDB );
  Loop->AddLoopTag ( CIFTAG_NDB_HELIX_CLASS_PDB        );
  Loop->AddLoopTag ( CIFTAG_DETAILS                    );
  Loop->AddLoopTag ( CIFTAG_NDB_LENGTH                 );
}

#define  HelixTypeID  "HELX_P"

void  CHelix::MakeCIF ( PCMMCIFData CIF, int N )  {
PCMMCIFLoop Loop;
int         RC;
  RC = CIF->AddLoop ( CIFCAT_STRUCT_CONF,Loop );
  if (RC!=CIFRC_Ok) 
    // the category was (re)created, provide tags
    AddStructConfTags ( Loop );
  Loop->AddString  ( pstr(HelixTypeID) );
  Loop->AddInteger ( serNum      );
  Loop->AddString  ( helixID     );
  Loop->AddString  ( initResName );
  Loop->AddString  ( initChainID );
  Loop->AddInteger ( initSeqNum  );
  Loop->AddString  ( initICode,True );
  Loop->AddString  ( endResName  );
  Loop->AddString  ( endChainID  );
  Loop->AddInteger ( endSeqNum   );
  Loop->AddString  ( endICode ,True );
  Loop->AddInteger ( helixClass  );
  Loop->AddString  ( comment     );
  Loop->AddInteger ( length      );
}

int CHelix::ConvertPDBASCII ( cpstr S )  {
char L[100];
  GetInteger  ( serNum     ,&(S[7]) ,3  );
  strcpy_ncss ( helixID    ,&(S[11]),3  );
  strcpy_ncss ( initResName,&(S[15]),3  );
  strcpy_ncss ( initChainID,&(S[19]),1  );
  GetIntIns   ( initSeqNum,initICode,&(S[21]),4  );
  strcpy_ncss ( endResName ,&(S[27]),3  );
  strcpy_ncss ( endChainID ,&(S[31]),1  );
  GetIntIns   ( endSeqNum ,endICode ,&(S[33]),4  );
  GetInteger  ( helixClass ,&(S[38]),2  );
  strcpy_ncss ( L          ,&(S[40]),30 );
  CreateCopy  ( comment    ,L           );
  GetInteger  ( length     ,&(S[71]),5  );
  return 0;
}

void  CHelix::GetCIF ( PCMMCIFData CIF, int & Signal )  {
PCMMCIFLoop Loop;
int         RC,l;
pstr        F;
Boolean     Done;

  Loop = CIF->GetLoop ( CIFCAT_STRUCT_CONF );
  if (!Loop)  {
    Signal = -1;  // signal to finish processing of this structure
    return;
  }

  l    = Loop->GetLoopLength();
  Done = Signal>=l;
  while (!Done) {
    F = Loop->GetString ( CIFTAG_CONF_TYPE_ID,Signal,RC );
    if ((!RC) && F)  Done = (strcmp(F,HelixTypeID)==0);
               else  Done = False;
    if (!Done)  {
      Signal++;
      Done = Signal>=l;
    }
  }

  if (Signal>=l)  {
    Signal = -1;  // finish processing of Helix
    return;
  }

  Loop->DeleteField ( CIFTAG_CONF_TYPE_ID,Signal );

  if (CIFGetInteger(serNum,Loop,CIFTAG_ID,Signal)) return;


  CIFGetString ( helixID    ,Loop,CIFTAG_PDB_ID,
                             Signal,sizeof(helixID),pstr("   ") );

  CIFGetString ( initResName,Loop,CIFTAG_BEG_LABEL_COMP_ID,
                             Signal,sizeof(initResName),pstr("   ") );
  CIFGetString ( initChainID,Loop,CIFTAG_BEG_LABEL_ASYM_ID,
                             Signal,sizeof(initChainID),pstr("") );
  CIFGetString ( initICode  ,Loop,CIFTAG_NDB_BEG_LABEL_INS_CODE_PDB,
                             Signal,sizeof(initICode),pstr("") );
  if (CIFGetInteger(initSeqNum,Loop,CIFTAG_BEG_LABEL_SEQ_ID,Signal))
    return;

  CIFGetString ( endResName,Loop,CIFTAG_END_LABEL_COMP_ID,
                            Signal,sizeof(endResName),pstr("   ") );
  CIFGetString ( endChainID,Loop,CIFTAG_END_LABEL_ASYM_ID,
                            Signal,sizeof(endChainID),pstr("") );
  CIFGetString ( endICode  ,Loop,CIFTAG_NDB_END_LABEL_INS_CODE_PDB,
                            Signal,sizeof(endICode),pstr("") );
  if (CIFGetInteger(endSeqNum,Loop,CIFTAG_END_LABEL_SEQ_ID,Signal))
    return;

  if (CIFGetInteger(helixClass,Loop,
                    CIFTAG_NDB_HELIX_CLASS_PDB,Signal)) return;
  CreateCopy     ( comment,Loop->GetString(CIFTAG_DETAILS,Signal,RC));
  Loop->DeleteField ( CIFTAG_DETAILS,Signal );
  if (CIFGetInteger(length,Loop,CIFTAG_NDB_LENGTH,Signal)) return;

  Signal++;

}

void  CHelix::Copy ( PCContainerClass Helix )  {
  serNum     = PCHelix(Helix)->serNum;
  initSeqNum = PCHelix(Helix)->initSeqNum;
  endSeqNum  = PCHelix(Helix)->endSeqNum;
  helixClass = PCHelix(Helix)->helixClass;
  length     = PCHelix(Helix)->length;
  strcpy ( helixID    ,PCHelix(Helix)->helixID     );
  strcpy ( initResName,PCHelix(Helix)->initResName );
  strcpy ( initChainID,PCHelix(Helix)->initChainID );
  strcpy ( initICode  ,PCHelix(Helix)->initICode   );
  strcpy ( endResName ,PCHelix(Helix)->endResName  );
  strcpy ( endChainID ,PCHelix(Helix)->endChainID  );
  strcpy ( endICode   ,PCHelix(Helix)->endICode    );
  CreateCopy ( comment,PCHelix(Helix)->comment );
}
    
void  CHelix::write ( RCFile f )  {
byte Version=1;
  f.WriteByte ( &Version    );
  f.WriteInt  ( &serNum     );
  f.WriteInt  ( &initSeqNum );
  f.WriteInt  ( &endSeqNum  );
  f.WriteInt  ( &helixClass );
  f.WriteInt  ( &length     );
  f.WriteTerLine ( helixID    ,False );
  f.WriteTerLine ( initResName,False );
  f.WriteTerLine ( initChainID,False );
  f.WriteTerLine ( initICode  ,False );
  f.WriteTerLine ( endResName ,False );
  f.WriteTerLine ( endChainID ,False );
  f.WriteTerLine ( endICode   ,False );
  f.CreateWrite ( comment );
}

void  CHelix::read  ( RCFile f ) {
byte Version;
  f.ReadByte ( &Version );
  f.ReadInt  ( &serNum     );
  f.ReadInt  ( &initSeqNum );
  f.ReadInt  ( &endSeqNum  );
  f.ReadInt  ( &helixClass );
  f.ReadInt  ( &length     );
  f.ReadTerLine ( helixID    ,False );
  f.ReadTerLine ( initResName,False );
  f.ReadTerLine ( initChainID,False );
  f.ReadTerLine ( initICode  ,False );
  f.ReadTerLine ( endResName ,False );
  f.ReadTerLine ( endChainID ,False );
  f.ReadTerLine ( endICode   ,False );
  f.CreateRead ( comment );
}

MakeStreamFunctions(CHelix)



//  ================  CStrand  =====================

CStrand::CStrand () : CStream()  {
  InitStrand();
}

CStrand::CStrand ( RPCStream Object ) : CStream(Object)  {
  InitStrand();
}

CStrand::~CStrand() {
}

void  CStrand::InitStrand()  {
  initSeqNum = MinInt4;
  endSeqNum  = MinInt4;
  sense      = 0;
  curResSeq  = MinInt4;
  prevResSeq = MinInt4;
  strandNo   = 0;
  strcpy ( sheetID    ,"sheet_0"  );
  strcpy ( initResName,"   "      );
  strcpy ( initChainID,""         );
  strcpy ( initICode  ,""         );
  strcpy ( endResName ,"   "      );
  strcpy ( endChainID ,""         );
  strcpy ( endICode   ,""         );
  strcpy ( curAtom    ," "        );
  strcpy ( curResName ,"   "      );
  strcpy ( curChainID ,""         );
  strcpy ( curICode   ,""         );
  strcpy ( prevAtom   ," "        );
  strcpy ( prevResName,"   "      );
  strcpy ( prevChainID,""         );
  strcpy ( prevICode  ,""         );
}

void  CStrand::PDBASCIIDump ( pstr S )  {
//   Finishes making the ASCII PDB SHEET line number N
// from the class' data. Making is initiated by CSheet.

  strcpy_n1  ( &(S[17]),initResName,3 );
  if (initChainID[0])  S[21] = initChainID[0];
  PutIntIns  ( &(S[22]),initSeqNum ,4,initICode );

  strcpy_n1  ( &(S[28]),endResName ,3 );
  if (endChainID[0])   S[32] = endChainID[0];
  PutIntIns  ( &(S[33]),endSeqNum  ,4,endICode  );

  PutInteger ( &(S[38]),sense      ,2 );

  strcpy_n1  ( &(S[41]),curAtom    ,4 );
  strcpy_n1  ( &(S[45]),curResName ,3 );
  if (curChainID[0])   S[49] = curChainID[0];
  PutIntIns  ( &(S[50]),curResSeq  ,4,curICode  );

  strcpy_n1  ( &(S[56]),prevAtom   ,4 );
  strcpy_n1  ( &(S[60]),prevResName,3 );
  if (prevChainID[0])  S[64] = prevChainID[0];
  PutIntIns  ( &(S[65]),prevResSeq ,4,prevICode );

}


void  CStrand::MakeCIF ( PCMMCIFData CIF )  {
PCMMCIFLoop Loop;
int         RC;

  RC = CIF->AddLoop ( CIFCAT_STRUCT_SHEET_RANGE,Loop );
  if (RC!=CIFRC_Ok)  {
    // the category was (re)created, provide tags
    Loop->AddLoopTag ( CIFTAG_SHEET_ID                   );
    Loop->AddLoopTag ( CIFTAG_ID                         );
    Loop->AddLoopTag ( CIFTAG_BEG_LABEL_COMP_ID          );
    Loop->AddLoopTag ( CIFTAG_BEG_LABEL_ASYM_ID          );
    Loop->AddLoopTag ( CIFTAG_BEG_LABEL_SEQ_ID           );
    Loop->AddLoopTag ( CIFTAG_NDB_BEG_LABEL_INS_CODE_PDB );
    Loop->AddLoopTag ( CIFTAG_END_LABEL_COMP_ID          );
    Loop->AddLoopTag ( CIFTAG_END_LABEL_ASYM_ID          );
    Loop->AddLoopTag ( CIFTAG_END_LABEL_SEQ_ID           );
    Loop->AddLoopTag ( CIFTAG_NDB_END_LABEL_INS_CODE_PDB );
  }
  Loop->AddString  ( sheetID     );
  Loop->AddInteger ( strandNo    );
  Loop->AddString  ( initResName );
  Loop->AddString  ( initChainID );
  Loop->AddInteger ( initSeqNum  );
  Loop->AddString  ( initICode,True );
  Loop->AddString  ( endResName  );
  Loop->AddString  ( endChainID  );
  Loop->AddInteger ( endSeqNum   ); 
  Loop->AddString  ( endICode ,True );

}


int CStrand::ConvertPDBASCII ( cpstr S )  { 

  GetInteger  ( strandNo   ,&(S[7])  ,3 );
  strcpy_ncss ( sheetID    ,&(S[11]) ,3 );

  strcpy_ncss ( initResName,&(S[17]) ,3 );
  strcpy_ncss ( initChainID,&(S[21]) ,1 );
  GetIntIns   ( initSeqNum ,initICode,&(S[22]),4 );

  strcpy_ncss ( endResName ,&(S[28]) ,3 );
  strcpy_ncss ( endChainID ,&(S[32]) ,1 );
  GetIntIns   ( endSeqNum  ,endICode ,&(S[33]),4 );

  GetInteger  ( sense      ,&(S[38]) ,2 );

  GetString   ( curAtom    ,&(S[41]) ,4 );
  strcpy_ncss ( curResName ,&(S[45]) ,3 );
  strcpy_ncss ( curChainID ,&(S[49]) ,1 );
  GetIntIns   ( curResSeq  ,curICode ,&(S[50]),4 );

  GetString   ( prevAtom   ,&(S[56]) ,4 );
  strcpy_ncss ( prevResName,&(S[60]) ,3 );
  strcpy_ncss ( prevChainID,&(S[64]) ,1 );
  GetIntIns   ( prevResSeq ,prevICode,&(S[65]),4 );

  return 0;

}

int  CStrand::GetCIF ( PCMMCIFData CIF, cpstr sheet_id )  {
PCMMCIFLoop Loop; 
int         RC,l,i,sNo;
pstr        F;

  Loop = CIF->GetLoop ( CIFCAT_STRUCT_SHEET_RANGE );
  if (Loop)  {
    l = Loop->GetLoopLength();
    i = 0;
    while (i<l)  {
      F = Loop->GetString ( CIFTAG_SHEET_ID,i,RC );
      if (F && (!RC))  {
        if (!strcmp(F,sheet_id))  {
          strcpy ( sheetID,sheet_id );
          if (CIFGetInteger(sNo,Loop,CIFTAG_ID,i))  return i;
          if (sNo==strandNo)  {
            CIFGetString ( initResName,Loop,CIFTAG_BEG_LABEL_COMP_ID,
                           i,sizeof(initResName),pstr("   ") );
            CIFGetString ( initChainID,Loop,CIFTAG_BEG_LABEL_ASYM_ID,
                           i,sizeof(initChainID),pstr("") );
            CIFGetString ( initICode,Loop,
                           CIFTAG_NDB_BEG_LABEL_INS_CODE_PDB,
                           i,sizeof(initICode),pstr("") );
            if (CIFGetInteger(initSeqNum,Loop,
                           CIFTAG_BEG_LABEL_SEQ_ID,i))
              return i;
            CIFGetString ( endResName,Loop,CIFTAG_END_LABEL_COMP_ID,
                           i,sizeof(endResName),pstr("   ") );
            CIFGetString ( endChainID,Loop,CIFTAG_END_LABEL_ASYM_ID,
                           i,sizeof(endChainID),pstr("") );
            CIFGetString ( endICode  ,Loop,
                           CIFTAG_NDB_END_LABEL_INS_CODE_PDB,
                           i,sizeof(endICode),pstr("") );
            if (CIFGetInteger(endSeqNum,Loop,
                           CIFTAG_END_LABEL_SEQ_ID,i))
              return i;
            Loop->DeleteRow ( i );
            i = l+100;  // break the loop
          }
        }
      }
      i++;
    }
  }

  return 0;

}

void  CStrand::Copy ( PCStrand Strand )  {
  initSeqNum = Strand->initSeqNum;
  endSeqNum  = Strand->endSeqNum;
  sense      = Strand->sense;
  curResSeq  = Strand->curResSeq;
  prevResSeq = Strand->prevResSeq;
  strcpy ( initResName,Strand->initResName );
  strcpy ( initChainID,Strand->initChainID );
  strcpy ( initICode  ,Strand->initICode   );
  strcpy ( endResName ,Strand->endResName  );
  strcpy ( endChainID ,Strand->endChainID  );
  strcpy ( endICode   ,Strand->endICode    );
  strcpy ( curAtom    ,Strand->curAtom     );
  strcpy ( curResName ,Strand->curResName  );
  strcpy ( curChainID ,Strand->curChainID  );
  strcpy ( curICode   ,Strand->curICode    );
  strcpy ( prevAtom   ,Strand->prevAtom    );
  strcpy ( prevResName,Strand->prevResName );
  strcpy ( prevChainID,Strand->prevChainID );
  strcpy ( prevICode  ,Strand->prevICode   );
}
    
void  CStrand::write ( RCFile f )  {
byte Version=1;
  f.WriteByte ( &Version    );
  f.WriteInt  ( &initSeqNum );
  f.WriteInt  ( &endSeqNum  );
  f.WriteInt  ( &sense      );
  f.WriteInt  ( &curResSeq  );
  f.WriteInt  ( &prevResSeq );
  f.WriteTerLine ( initResName,False );
  f.WriteTerLine ( initChainID,False );
  f.WriteTerLine ( initICode  ,False );
  f.WriteTerLine ( endResName ,False );
  f.WriteTerLine ( endChainID ,False );
  f.WriteTerLine ( endICode   ,False );
  f.WriteTerLine ( curAtom    ,False );
  f.WriteTerLine ( curResName ,False );
  f.WriteTerLine ( curChainID ,False );
  f.WriteTerLine ( curICode   ,False );
  f.WriteTerLine ( prevAtom   ,False );
  f.WriteTerLine ( prevResName,False );
  f.WriteTerLine ( prevChainID,False );
  f.WriteTerLine ( prevICode  ,False );
}

void  CStrand::read  ( RCFile f ) {
byte Version;
  f.ReadByte ( &Version    );
  f.ReadInt  ( &initSeqNum );
  f.ReadInt  ( &endSeqNum  );
  f.ReadInt  ( &sense      );
  f.ReadInt  ( &curResSeq  );
  f.ReadInt  ( &prevResSeq );
  f.ReadTerLine ( initResName,False );
  f.ReadTerLine ( initChainID,False );
  f.ReadTerLine ( initICode  ,False );
  f.ReadTerLine ( endResName ,False );
  f.ReadTerLine ( endChainID ,False );
  f.ReadTerLine ( endICode   ,False );
  f.ReadTerLine ( curAtom    ,False );
  f.ReadTerLine ( curResName ,False );
  f.ReadTerLine ( curChainID ,False );
  f.ReadTerLine ( curICode   ,False );
  f.ReadTerLine ( prevAtom   ,False );
  f.ReadTerLine ( prevResName,False );
  f.ReadTerLine ( prevChainID,False );
  f.ReadTerLine ( prevICode  ,False );
}

MakeStreamFunctions(CStrand)




//  ================  CSheet  ===================

CSheet::CSheet() : CStream()  {
  InitSheet();
}

CSheet::CSheet ( RPCStream Object ) : CStream(Object)  {
  InitSheet();
}

CSheet::~CSheet()  {
  FreeMemory();
}

void  CSheet::InitSheet()  {
  nStrands   = 0;
  sheetID[0] = char(0);
  Strand     = NULL;
}

void  CSheet::FreeMemory()  {
int i;
  if (Strand)  {
    for (i=0;i<nStrands;i++)
      if (Strand[i])  delete Strand[i];
    delete[] Strand;
    Strand = NULL;
  }
  nStrands   = 0;
  sheetID[0] = char(0);
}

void  CSheet::PDBASCIIDump ( RCFile f )  {
char  S[100];
int   i;
  if (Strand)  
    for (i=0;i<nStrands;i++)
      if (Strand[i])  {
        strcpy      ( S,"SHEET"           );
        PadSpaces   ( S,80                );
        PutInteger  ( &(S[7]) ,i+1     ,3 );
        strcpy_n1   ( &(S[11]),sheetID ,3 );
        PutInteger  ( &(S[14]),nStrands,2 );
        Strand[i]->PDBASCIIDump ( S       );
        f.WriteLine ( S                   );
      }
}

void  CSheet::OrderSheet()  {
int        i,k;
PPCStrand  Strand1;
  k = 0;
  for (i=0;i<nStrands;i++)
    if (Strand[i])  k++;
  if (k<nStrands)  {
    Strand1 = new PCStrand[k];
    k = 0;
    for (i=0;i<nStrands;i++)
      if (Strand[i])  Strand1[k++] = Strand[i];
    if (Strand)  delete[] Strand;
    Strand   = Strand1;
    nStrands = k;
  }
}

void  CSheet::MakeCIF ( PCMMCIFData CIF )  {
PCMMCIFLoop Loop;
int         RC;
int         i;
Boolean     isSense;

  OrderSheet();

  RC = CIF->AddLoop ( CIFCAT_STRUCT_SHEET,Loop );
  if (RC!=CIFRC_Ok)  {
    // the category was (re)created, provide tags
    Loop->AddLoopTag ( CIFTAG_SHEET_ID       );
    Loop->AddLoopTag ( CIFTAG_NUMBER_STRANDS );
  }
  Loop->AddString  ( sheetID  );
  Loop->AddInteger ( nStrands );

  for (i=0;i<nStrands;i++)  {
    Strand[i]->MakeCIF ( CIF );
    if (Strand[i]->sense!=0)  isSense = True;
  }

  if (nStrands>1)  {
  
    if (isSense)  {
      RC = CIF->AddLoop ( CIFCAT_STRUCT_SHEET_ORDER,Loop );
      if (RC!=CIFRC_Ok)  {
        // the category was (re)created, provide tags
        Loop->AddLoopTag ( CIFTAG_SHEET_ID   );
        Loop->AddLoopTag ( CIFTAG_RANGE_ID_1 );
        Loop->AddLoopTag ( CIFTAG_RANGE_ID_2 );
        Loop->AddLoopTag ( CIFTAG_SENSE      );
      }
      for (i=1;i<nStrands;i++)  {
        Loop->AddString  ( sheetID               );
        Loop->AddInteger ( Strand[i-1]->strandNo );
        Loop->AddInteger ( Strand[i]  ->strandNo );
        if (Strand[i]->sense>0)
              Loop->AddString ( pstr("parallel")      );
        else  Loop->AddString ( pstr("anti-parallel") );
      }
    }

    RC = CIF->AddLoop ( CIFCAT_STRUCT_SHEET_HBOND,Loop );
    if (RC!=CIFRC_Ok)  {
      // the category was (re)created, provide tags
      Loop->AddLoopTag ( CIFTAG_SHEET_ID                       );
      Loop->AddLoopTag ( CIFTAG_RANGE_ID_1                     );
      Loop->AddLoopTag ( CIFTAG_RANGE_ID_2                     );
      Loop->AddLoopTag ( CIFTAG_RANGE_1_BEG_LABEL_ATOM_ID      );
      Loop->AddLoopTag ( CIFTAG_NDB_RANGE_1_BEG_LABEL_COMP_ID  );
      Loop->AddLoopTag ( CIFTAG_NDB_RANGE_1_BEG_LABEL_ASYM_ID  );
      Loop->AddLoopTag ( CIFTAG_RANGE_1_BEG_LABEL_SEQ_ID       );
      Loop->AddLoopTag ( CIFTAG_NDB_RANGE_1_BEG_LABEL_INS_CODE );
      Loop->AddLoopTag ( CIFTAG_RANGE_1_END_LABEL_ATOM_ID      );
      Loop->AddLoopTag ( CIFTAG_NDB_RANGE_1_END_LABEL_COMP_ID  );
      Loop->AddLoopTag ( CIFTAG_NDB_RANGE_1_END_LABEL_ASYM_ID  );
      Loop->AddLoopTag ( CIFTAG_RANGE_1_END_LABEL_SEQ_ID       );
      Loop->AddLoopTag ( CIFTAG_NDB_RANGE_1_END_LABEL_INS_CODE );
    }
    for (i=1;i<nStrands;i++)  {
      Loop->AddString  ( sheetID                );
      Loop->AddInteger ( Strand[i-1]->strandNo  );
      Loop->AddInteger ( Strand[i]->strandNo    );
      Loop->AddString  ( Strand[i]->curAtom     );
      Loop->AddString  ( Strand[i]->curResName  );
      Loop->AddString  ( Strand[i]->curChainID  );
      Loop->AddInteger ( Strand[i]->curResSeq   );
      Loop->AddString  ( Strand[i]->curICode ,True );
      Loop->AddString  ( Strand[i]->prevAtom    );
      Loop->AddString  ( Strand[i]->prevResName );
      Loop->AddString  ( Strand[i]->prevChainID );
      Loop->AddInteger ( Strand[i]->prevResSeq  );
      Loop->AddString  ( Strand[i]->prevICode,True );
    }
  }

}


int CSheet::ConvertPDBASCII ( cpstr S )  {
int        i,k,ns;
SheetID    SID;
PPCStrand  Strand1;

  GetInteger  ( k  ,&(S[7]) ,3 );
  strcpy_ncss ( SID,&(S[11]),3 );
  GetInteger  ( ns ,&(S[14]),2 );

//  if (!SID[0])  return  Error_NoSheetID;
  if (!sheetID[0])  strcpy ( sheetID,SID );
  else if (strcmp(sheetID,SID))
                return  Error_WrongSheetID;

  if (k<=0)     return  Error_WrongStrandNo;

  ns = IMax(k,ns);
  if (!Strand)  {
    Strand = new PCStrand[ns];
    for (i=0;i<ns;i++)
      Strand[i] = NULL;
  } else if (ns>nStrands)  {
    Strand1 = new PCStrand[ns];
    for (i=0;i<nStrands;i++)
      Strand1[i] = Strand[i];
    for (i=nStrands;i<ns;i++)
      Strand1[i] = NULL;
    if (Strand)  delete[] Strand;
    Strand = Strand1;
  }
  nStrands = ns;

  k--;
  if (!Strand[k])  Strand[k] = new CStrand();

  return  Strand[k]->ConvertPDBASCII ( S );

}

void  CSheet::TryStrand ( int strand_no )  {
int       i,k;
PPCStrand Strand1;
  k = -1;
  for (i=0;(i<nStrands) && (k<0);i++)  
    if (Strand[i]) 
      if (Strand[i]->strandNo==strand_no)  k = i;
  if (k<0)  {
    Strand1 = new PCStrand[nStrands+1];
    for (i=0;i<nStrands;i++)
      Strand1[i] = Strand[i];
    if (Strand) delete[] Strand;
    Strand = Strand1;
    Strand[nStrands] = new CStrand();
    Strand[nStrands]->strandNo = strand_no;
    nStrands++;
  }
}


void  CSheet::CIFFindStrands ( PCMMCIFData CIF, cpstr Category ) {
// just look for all strands mentioned for the sheet
PCMMCIFLoop Loop;
pstr        F;
int         RC,i,l,sNo;
  Loop = CIF->GetLoop ( Category );
  if (Loop)  {
    l = Loop->GetLoopLength();
    for (i=0;i<l;i++)  {
      F = Loop->GetString ( CIFTAG_SHEET_ID,i,RC );
      if (F && (!RC))  {
        if (!strcmp(F,sheetID))  {
          if (!Loop->GetInteger(sNo,CIFTAG_ID,i))
            TryStrand ( sNo );
          if (!Loop->GetInteger(sNo,CIFTAG_RANGE_ID_1,i))
            TryStrand ( sNo );
          if (!Loop->GetInteger(sNo,CIFTAG_RANGE_ID_2,i))
            TryStrand ( sNo );
        }
      }
    }
  }
}

int  CSheet::GetStrand ( int strand_no )  {
int i;
  for (i=0;i<nStrands;i++)
    if (Strand[i])  {
      if (Strand[i]->strandNo==strand_no)
        return i;
    }
  return -1;
}

int CSheet::GetCIF ( PCMMCIFData CIF )  {
PCMMCIFLoop Loop;
int         i,ns,l,k,k2,RC,sNo;
pstr        F;
ivector     pair;
Boolean     Ok;

  pair = NULL;

  //    First find all strands and create
  // the corresponding classes. The CIF fields
  // are not removed at this stage.

  CIFFindStrands ( CIF,CIFCAT_STRUCT_SHEET_ORDER );
  CIFFindStrands ( CIF,CIFCAT_STRUCT_SHEET_RANGE );
  CIFFindStrands ( CIF,CIFCAT_STRUCT_SHEET_HBOND );

  //  Check number of strands
  Loop = CIF->GetLoop ( CIFCAT_STRUCT_SHEET );
  if (Loop)  {
    l = Loop->GetLoopLength();
    i = 0;
    while (i<l)  {
      F = Loop->GetString ( CIFTAG_SHEET_ID,i,RC );
      if (F && (!RC))  {
        if (!strcmp(F,sheetID))  {
          RC = CIFGetInteger1 ( ns,Loop,CIFTAG_NUMBER_STRANDS,i );
          if ((!RC) && (ns!=nStrands))
            return  Error_WrongNumberOfStrands;
          Loop->DeleteRow ( i );
          i = l+100;  // break loop
        }
      }
      i++;
    }
  }

  //  Read each strand
  RC = 0;
  for (i=0;(i<nStrands) && (!RC);i++) 
    RC = Strand[i]->GetCIF ( CIF,sheetID );

  if (RC)  return RC;

  if (nStrands>1)  {

    GetVectorMemory ( pair,nStrands,0 );
    for (i=0;i<nStrands;i++)
      pair[i] = -1;

    Loop = CIF->GetLoop ( CIFCAT_STRUCT_SHEET_ORDER );
    if (Loop)  {
      Ok = True;
      l  = Loop->GetLoopLength();
      for (i=0;(i<l) && Ok;i++)  {
        F = Loop->GetString ( CIFTAG_SHEET_ID,i,RC );
        if (F && (!RC))  {
          if (!strcmp(F,sheetID))  {
            if (!Loop->GetInteger(sNo,CIFTAG_RANGE_ID_1,i))  {
              k = GetStrand ( sNo );
              if ((k>=0) &&
                  (!Loop->GetInteger(sNo,CIFTAG_RANGE_ID_2,i)))  {
                pair[k] = GetStrand ( sNo );
                if (pair[k]>=0)  {
                  F = Loop->GetString ( CIFTAG_SENSE,i,RC );
                  if (F && (!RC))  {
                    if (!strcasecmp(F,"anti-parallel"))
                      Strand[pair[k]]->sense = -1;
                    else if (!strcasecmp(F,"parallel"))
                      Strand[pair[k]]->sense =  1;
                  }
                  Loop->DeleteRow ( i );
                } else
                  Ok = False;
              } else
                Ok = False;
            } else
              Ok = False;
          }
        }
      }
      if (!Ok)  {
        FreeVectorMemory ( pair,0 );
        return Error_WrongSheetOrder;
      }
    }
  
    Loop = CIF->GetLoop ( CIFCAT_STRUCT_SHEET_HBOND );
    if (Loop)  {
      Ok = True;
      l  = Loop->GetLoopLength();
      for (i=0;(i<l) && Ok;i++)  {
        F = Loop->GetString ( CIFTAG_SHEET_ID,i,RC );
        if (F && (!RC))  {
          if (!strcmp(F,sheetID))  {
            if (!Loop->GetInteger(sNo,CIFTAG_RANGE_ID_1,i))  {
              k = GetStrand ( sNo );
              if ((k>=0) &&
                  (!Loop->GetInteger(sNo,CIFTAG_RANGE_ID_1,i)))  {
                k2 = GetStrand ( sNo );
                if (k2>=0)  {
                  if (pair[k]==k2)  {
                    CIFGetString ( Strand[k2]->curAtom,Loop,
                              CIFTAG_RANGE_1_BEG_LABEL_ATOM_ID,
                              i,sizeof(Strand[k2]->curAtom),
                              pstr("    ") );
                    CIFGetString ( Strand[k2]->curResName,Loop,
                              CIFTAG_NDB_RANGE_1_BEG_LABEL_COMP_ID,
                              i,sizeof(Strand[k2]->curResName),
                              pstr("   ") );
                    CIFGetString ( Strand[k2]->curChainID,Loop,
                              CIFTAG_NDB_RANGE_1_BEG_LABEL_ASYM_ID,
                              i,sizeof(Strand[k2]->curChainID),
                              pstr(" ") );
                    if (CIFGetInteger(Strand[k2]->curResSeq,Loop,
                              CIFTAG_RANGE_1_BEG_LABEL_SEQ_ID,i))  {
                      FreeVectorMemory ( pair,0 );
                      return i;
                    }
                    CIFGetString ( Strand[k2]->curICode,Loop,
                              CIFTAG_NDB_RANGE_1_BEG_LABEL_INS_CODE,
                              i,sizeof(Strand[k2]->curICode),
                              pstr(" ") );
                    CIFGetString ( Strand[k2]->prevAtom,Loop,
                              CIFTAG_RANGE_1_END_LABEL_ATOM_ID,
                              i,sizeof(Strand[k2]->prevAtom),
                              pstr("    ") );
                    CIFGetString ( Strand[k2]->prevResName,Loop,
                              CIFTAG_NDB_RANGE_1_END_LABEL_COMP_ID,
                              i,sizeof(Strand[k2]->prevResName),
                              pstr("   ") );
                    CIFGetString ( Strand[k2]->prevChainID,Loop,
                              CIFTAG_NDB_RANGE_1_END_LABEL_ASYM_ID,
                              i,sizeof(Strand[k2]->prevChainID),
                              pstr(" ") );
                    if (CIFGetInteger(Strand[k2]->prevResSeq,Loop,
                              CIFTAG_RANGE_1_END_LABEL_SEQ_ID,i))  {
                      FreeVectorMemory ( pair,0 );
                      return i;
                    }
                    CIFGetString ( Strand[k2]->prevICode,Loop,
                              CIFTAG_NDB_RANGE_1_END_LABEL_INS_CODE,
                              i,sizeof(Strand[k2]->prevICode),
                              pstr(" ") );
                    Loop->DeleteRow ( i );
                  } else
                      Ok = False;
                } else
                  Ok = False;
              } else
                Ok = False;
            } else
              Ok = False;
          }
        }
      }
      if (!Ok)  {
        FreeVectorMemory ( pair,0 );
        return Error_HBondInconsistency;
      }
    }
  }

  FreeVectorMemory ( pair,0 );

  return 0;

}


void  CSheet::Copy ( PCSheet Sheet )  {
int i;
  FreeMemory();
  nStrands = Sheet->nStrands;
  if (nStrands>0)  {
    Strand = new PCStrand[nStrands];
    for (i=0;i<nStrands;i++)
      if (Sheet->Strand[i])  {
        Strand[i] = new CStrand();
        Strand[i]->Copy ( Sheet->Strand[i] );
      } else
        Strand[i] = NULL;
  }
  strcpy ( sheetID,Sheet->sheetID );
}
    
void  CSheet::write ( RCFile f )  {
int  i;
byte Version=1;
  f.WriteByte ( &Version  );
  f.WriteInt  ( &nStrands );
  for (i=0;i<nStrands;i++)
    StreamWrite ( f,Strand[i] );
  f.WriteTerLine ( sheetID,False );
}

void  CSheet::read  ( RCFile f ) {
int  i;
byte Version;
  FreeMemory();
  f.ReadByte ( &Version  );
  f.ReadInt  ( &nStrands );
  if (nStrands>0)  {
    Strand = new PCStrand[nStrands];
    for (i=0;i<nStrands;i++)  {
      Strand[i] = NULL;
      StreamRead ( f,Strand[i] );
    }
  }
  f.ReadTerLine ( sheetID,False );
}

MakeStreamFunctions(CSheet)



//  ====================  CSheets  ============================


CSheets::CSheets() : CStream()  {
  InitSheets();
}


CSheets::CSheets ( RPCStream Object ) : CStream ( Object )  {
  InitSheets();
}


CSheets::~CSheets()  {
  FreeMemory();
}


void  CSheets::InitSheets()  {
  nSheets = 0;
  Sheet   = NULL;
}


void  CSheets::FreeMemory()  {
int i;
  if (Sheet)  {
    for (i=0;i<nSheets;i++)
      if (Sheet[i])  delete Sheet[i];
    delete[] Sheet;
    Sheet = NULL;
  }
  nSheets = 0;
}


void  CSheets::PDBASCIIDump ( RCFile f )  {
int i;
  if (Sheet) 
    for (i=0;i<nSheets;i++)
      if (Sheet[i])  Sheet[i]->PDBASCIIDump ( f );
}


void  CSheets::MakeCIF ( PCMMCIFData CIF )  {
int i;
  if (Sheet) 
    for (i=0;i<nSheets;i++)
      if (Sheet[i])  Sheet[i]->MakeCIF ( CIF );
}


int   CSheets::ConvertPDBASCII ( cpstr S )  {
SheetID  sheetID;
int      i,k;
PPCSheet Sheet1;
  strcpy_ncss ( sheetID,&(S[11]),3 );
  //  if (!sheetID[0]) return  Error_NoSheetID;
  k = -1;
  for (i=0;i<nSheets;i++)
    if (Sheet[i])  {
      if (!strcmp(sheetID,Sheet[i]->sheetID))  {
        k = i;
        break;
      }
    }  
  if (k<0)  {
    Sheet1 = new PCSheet[nSheets+1];
    for (i=0;i<nSheets;i++)
      Sheet1[i] = Sheet[i];
    if (Sheet) delete[] Sheet;
    Sheet = Sheet1;
    Sheet[nSheets] = new CSheet();
    k = nSheets;
    nSheets++;
  }
  return  Sheet[k]->ConvertPDBASCII ( S );
}


void  CSheets::CIFFindSheets ( PCMMCIFData CIF, cpstr Category ) {
PCMMCIFLoop Loop;
int         RC,i,j,k,l;
pstr        F;
PPCSheet    Sheet1;
  Loop = CIF->GetLoop ( Category );
  if (Loop)  {
    l = Loop->GetLoopLength();
    for (i=0;i<l;i++)  {
      F = Loop->GetString ( CIFTAG_SHEET_ID,i,RC );
      if (F && (!RC))  {
        k = -1;
        j = 0;
        while ((j<nSheets) && (k<0))  {
          if (Sheet[j])  { 
            if (!strcmp(F,Sheet[j]->sheetID))  k = j;
          }
          j++;
        }
        if (k<0)  {
          Sheet1 = new PCSheet[nSheets+1];
          for (i=0;i<nSheets;i++)
            Sheet1[i] = Sheet[i];
          if (Sheet) delete[] Sheet;
          Sheet = Sheet1;
          Sheet[nSheets] = new CSheet();
          strcpy ( Sheet[nSheets]->sheetID,F );
          nSheets++;
	}
      }
    }
  }
}

int CSheets::GetCIF ( PCMMCIFData CIF )  {
int i,RC;

  FreeMemory();
  
  //  First find all sheet names and create
  // the corresponding classes. The CIF fields
  // are not removed at this stage.

  CIFFindSheets ( CIF,CIFCAT_STRUCT_SHEET       );
  CIFFindSheets ( CIF,CIFCAT_STRUCT_SHEET_ORDER );
  CIFFindSheets ( CIF,CIFCAT_STRUCT_SHEET_RANGE );
  CIFFindSheets ( CIF,CIFCAT_STRUCT_SHEET_HBOND );

  //  Read each sheet
  i  = 0;
  RC = 0;
  while ((i<nSheets) && (!RC))  {
    RC = Sheet[i]->GetCIF ( CIF );
    i++;
  }

  return RC;

}


void  CSheets::Copy ( PCSheets Sheets )  {
int i;
  FreeMemory();
  if (Sheets->nSheets>0)  {
    nSheets = Sheets->nSheets;
    Sheet = new PCSheet[nSheets];
    for (i=0;i<nSheets;i++)
      if (Sheets->Sheet[i]) {
        Sheet[i] = new CSheet();
        Sheet[i]->Copy ( Sheets->Sheet[i] );
      } else
        Sheet[i] = NULL;
  }
}


void  CSheets::write ( RCFile f )  {
int  i;
byte Version=1;
  f.WriteByte ( &Version );
  f.WriteInt  ( &nSheets );
  for (i=0;i<nSheets;i++)
    StreamWrite ( f,Sheet[i] );
}


void  CSheets::read ( RCFile f )  {
int  i;
byte Version;
  FreeMemory();
  f.ReadByte ( &Version );
  f.ReadInt  ( &nSheets );
  if (nSheets>0)  {
    Sheet = new PCSheet[nSheets];
    for (i=0;i<nSheets;i++)  {
      Sheet[i] = NULL;
      StreamRead ( f,Sheet[i] );
    }
  }
}


MakeStreamFunctions(CSheets)



//  ================  CTurn  ===================

CTurn::CTurn() : CContainerClass()  {
  InitTurn();
}

CTurn::CTurn ( cpstr S ) : CContainerClass()  {
  InitTurn();
  ConvertPDBASCII ( S );
}

CTurn::CTurn ( RPCStream Object ) : CContainerClass(Object)  {
  InitTurn();
}

CTurn::~CTurn() {
  if (comment)  delete[] comment;
}

void  CTurn::InitTurn()  {
  serNum = 0;                   // serial number
  strcpy ( turnID     ,"---" ); // turn ID
  strcpy ( initResName,"---" ); // name of the turn's initial residue
  strcpy ( initChainID," "   ); // chain ID for the chain
                                // containing the turn
  initSeqNum = 0;               // sequence number of the initial
                                //    residue
  strcpy ( initICode  ," "   ); // insertion code of the initial
                                //    residue
  strcpy ( endResName ,"---" ); // name of the turn's terminal residue
  strcpy ( endChainID ," "   ); // chain ID for the chain
                                // containing the turn
  endSeqNum  = 0;               // sequence number of the terminal
                                //    residue
  strcpy ( endICode   ," "   ); // insertion code of the terminal
                                //    residue
  comment    = NULL;            // comment about the helix
}

void  CTurn::PDBASCIIDump ( pstr S, int N )  {
//  makes the ASCII PDB OBSLTE line number N
//  from the class' data
  strcpy     ( S,"TURN" );
  PadSpaces  ( S,80 );
  PutInteger ( &(S[7]) ,serNum     ,3  );
  strcpy_n1  ( &(S[11]),turnID     ,3  );
  strcpy_n1  ( &(S[15]),initResName,3  );
  strcpy_n1  ( &(S[19]),initChainID,1  );
  PutIntIns  ( &(S[20]),initSeqNum ,4,initICode );
  strcpy_n1  ( &(S[26]),endResName ,3  );
  strcpy_n1  ( &(S[30]),endChainID ,1  );
  PutIntIns  ( &(S[31]),endSeqNum  ,4,endICode  );
  if (comment)
    strcpy_n ( &(S[40]),comment    ,30 );
}


#define  TurnTypeID  "TURN_P"

void  CTurn::MakeCIF ( PCMMCIFData CIF, int N )  {
PCMMCIFLoop Loop;
int         RC;
  RC = CIF->AddLoop ( CIFCAT_STRUCT_CONF,Loop );
  if (RC!=CIFRC_Ok) 
    // the category was (re)created, provide tags
    AddStructConfTags ( Loop );
  Loop->AddString  ( pstr(TurnTypeID) );
  Loop->AddInteger ( serNum      );
  Loop->AddString  ( turnID      );
  Loop->AddString  ( initResName );
  Loop->AddString  ( initChainID );
  Loop->AddInteger ( initSeqNum  );
  Loop->AddString  ( initICode,True );
  Loop->AddString  ( endResName  );
  Loop->AddString  ( endChainID  );
  Loop->AddInteger ( endSeqNum   );
  Loop->AddString  ( endICode ,True );
  Loop->AddNoData  ( CIF_NODATA_QUESTION );
  Loop->AddString  ( comment     );
  Loop->AddNoData  ( CIF_NODATA_QUESTION );
}

int CTurn::ConvertPDBASCII ( cpstr S )  {
char L[100];
  GetInteger   ( serNum     ,&(S[7]) ,3  );
  strcpy_ncss  ( turnID     ,&(S[11]),3  );
  strcpy_ncss  ( initResName,&(S[15]),3  );
  strcpy_ncss  ( initChainID,&(S[19]),1  );
  GetIntIns    ( initSeqNum,initICode,&(S[20]),4 ); 
  strcpy_ncss  ( endResName ,&(S[26]),3  );
  strcpy_ncss  ( endChainID ,&(S[30]),1  );
  GetIntIns    ( endSeqNum ,endICode ,&(S[31]),4 ); 
  strcpy_ncss  ( L          ,&(S[40]),30 );
  CreateCopy   ( comment    ,L           );
  return 0;
}

void  CTurn::GetCIF ( PCMMCIFData CIF, int & Signal )  {
PCMMCIFLoop Loop;
int         RC,l;
pstr        F;
Boolean     Done;

  Loop = CIF->GetLoop ( CIFCAT_STRUCT_CONF );
  if (!Loop)  {
    Signal = -1;  // signal to finish processing of this structure
    return;
  }

  l    = Loop->GetLoopLength();
  Done = Signal>=l;
  while (!Done) {
    F = Loop->GetString ( CIFTAG_CONF_TYPE_ID,Signal,RC );
    if ((!RC) && F)  Done = (strcmp(F,TurnTypeID)==0);
               else  Done = False;
    if (!Done)  {
      Signal++;
      Done = Signal>=l;
    }
  }

  if (Signal>=l)  {
    Signal = -1;  // finish processing of Turn
    return;
  }

  Loop->DeleteField ( CIFTAG_CONF_TYPE_ID,Signal );

  if (CIFGetInteger(serNum,Loop,CIFTAG_ID,Signal)) return;


  CIFGetString ( turnID,Loop,CIFTAG_PDB_ID,Signal,
                 sizeof(turnID),pstr("   ") );

  CIFGetString ( initResName,Loop,CIFTAG_BEG_LABEL_COMP_ID,
                             Signal,sizeof(initResName),pstr("   ") );
  CIFGetString ( initChainID,Loop,CIFTAG_BEG_LABEL_ASYM_ID,
                             Signal,sizeof(initChainID),pstr(" ") );
  CIFGetString ( initICode  ,Loop,CIFTAG_NDB_BEG_LABEL_INS_CODE_PDB,
                             Signal,sizeof(initICode),pstr(" ") );
  if (CIFGetInteger(initSeqNum,Loop,CIFTAG_BEG_LABEL_SEQ_ID,Signal))
    return;

  CIFGetString ( endResName,Loop,CIFTAG_END_LABEL_COMP_ID,
                            Signal,sizeof(endResName),pstr("   ") );
  CIFGetString ( endChainID,Loop,CIFTAG_END_LABEL_ASYM_ID,
                            Signal,sizeof(endChainID),pstr(" ") );
  CIFGetString ( endICode  ,Loop,CIFTAG_NDB_END_LABEL_INS_CODE_PDB,
                            Signal,sizeof(endICode),pstr(" ") );
  if (CIFGetInteger(endSeqNum,Loop,CIFTAG_END_LABEL_SEQ_ID,Signal))
    return;

  CreateCopy      ( comment,Loop->GetString(CIFTAG_DETAILS,Signal,RC));
  Loop->DeleteField ( CIFTAG_DETAILS,Signal );

  Signal++;

}

void  CTurn::Copy ( PCContainerClass Turn )  {
  serNum     = PCTurn(Turn)->serNum;
  initSeqNum = PCTurn(Turn)->initSeqNum;
  endSeqNum  = PCTurn(Turn)->endSeqNum;
  strcpy ( turnID     ,PCTurn(Turn)->turnID      );
  strcpy ( initResName,PCTurn(Turn)->initResName );
  strcpy ( initChainID,PCTurn(Turn)->initChainID );
  strcpy ( initICode  ,PCTurn(Turn)->initICode   );
  strcpy ( endResName ,PCTurn(Turn)->endResName  );
  strcpy ( endChainID ,PCTurn(Turn)->endChainID  );
  strcpy ( endICode   ,PCTurn(Turn)->endICode    );
  CreateCopy ( comment,PCTurn(Turn)->comment );
}
    
void  CTurn::write ( RCFile f )  {
byte Version=1;
  f.WriteByte ( &Version    );
  f.WriteInt  ( &serNum     );
  f.WriteInt  ( &initSeqNum );
  f.WriteInt  ( &endSeqNum  );
  f.WriteTerLine ( turnID     ,False );
  f.WriteTerLine ( initResName,False );
  f.WriteTerLine ( initChainID,False );
  f.WriteTerLine ( initICode  ,False );
  f.WriteTerLine ( endResName ,False );
  f.WriteTerLine ( endChainID ,False );
  f.WriteTerLine ( endICode   ,False );
  f.CreateWrite ( comment );
}

void  CTurn::read ( RCFile f )  {
byte Version;
  f.ReadByte ( &Version );
  f.ReadInt  ( &serNum     );
  f.ReadInt  ( &initSeqNum );
  f.ReadInt  ( &endSeqNum  );
  f.ReadTerLine ( turnID     ,False );
  f.ReadTerLine ( initResName,False );
  f.ReadTerLine ( initChainID,False );
  f.ReadTerLine ( initICode  ,False );
  f.ReadTerLine ( endResName ,False );
  f.ReadTerLine ( endChainID ,False );
  f.ReadTerLine ( endICode   ,False );
  f.CreateRead ( comment );
}

MakeStreamFunctions(CTurn)


//  ===================  CLinkContainer  ========================

PCContainerClass CLinkContainer::MakeContainerClass ( int ClassID )  {
  switch (ClassID)  {
    default :
    case ClassID_Template : return
                        CClassContainer::MakeContainerClass(ClassID);
    case ClassID_Link    : return new CLink();
  }
}

MakeStreamFunctions(CLinkContainer)



//  ========================  CLink  ===========================

CLink::CLink() : CContainerClass()  {
  InitLink();
}

CLink::CLink ( cpstr S ) : CContainerClass()  {
  InitLink();
  ConvertPDBASCII ( S );
}

CLink::CLink ( RPCStream Object ) : CContainerClass(Object)  {
  InitLink();
}

CLink::~CLink() {}

void  CLink::InitLink()  {
  strcpy ( atName1 ,"----" );  // name of 1st linked atom
  strcpy ( aloc1   ," "    );  // alternative location of 1st atom
  strcpy ( resName1,"---"  );  // residue name of 1st linked atom
  strcpy ( chainID1," "    );  // chain ID of 1st linked atom
  seqNum1 = 0;                 // sequence number of 1st linked atom
  strcpy ( insCode1," "    );  // insertion code of 1st linked atom
  strcpy ( atName2 ,"----" );  // name of 2nd linked atom
  strcpy ( aloc2   ," "    );  // alternative location of 2nd atom
  strcpy ( resName2,"---"  );  // residue name of 2nd linked atom
  strcpy ( chainID2," "    );  // chain ID of 2nd linked atom
  seqNum2 = 0;                 // sequence number of 2nd linked atom
  strcpy ( insCode2," "    );  // insertion code of 2nd linked atom
  s1 = 1;  // sym id of 1st atom
  i1 = 5;
  j1 = 5;
  k1 = 5;
  s2 = 1;  // sym id of 2nd atom
  i2 = 5;
  j2 = 5;
  k2 = 5;
}


void  CLink::PDBASCIIDump ( pstr S, int N )  {
//  makes the ASCII PDB OBSLTE line number N
//  from the class' data

  strcpy     ( S,"LINK" );
  PadSpaces  ( S,80 );

  strcpy_n1  ( &(S[12]),atName1 ,4 );
  strcpy_n1  ( &(S[16]),aloc1   ,1 );
  strcpy_n1  ( &(S[17]),resName1,3 );
  strcpy_n1  ( &(S[21]),chainID1,1 );
  PutIntIns  ( &(S[22]),seqNum1 ,4,insCode1 );

  strcpy_n1  ( &(S[42]),atName2 ,4 );
  strcpy_n1  ( &(S[46]),aloc2   ,1 );
  strcpy_n1  ( &(S[47]),resName2,3 );
  strcpy_n1  ( &(S[51]),chainID2,1 );
  PutIntIns  ( &(S[52]),seqNum2 ,4,insCode2 );

  PutInteger ( &(S[59]),s1,3 );
  PutInteger ( &(S[62]),i1,1 );
  PutInteger ( &(S[63]),j1,1 );
  PutInteger ( &(S[64]),k1,1 );

  PutInteger ( &(S[66]),s2,3 );
  PutInteger ( &(S[69]),i2,1 );
  PutInteger ( &(S[70]),j2,1 );
  PutInteger ( &(S[71]),k2,1 );

}


#define  LinkTypeID  "LINK"

void AddStructConnTags ( PCMMCIFLoop Loop )  {

  Loop->AddLoopTag ( CIFTAG_ID                           );
  Loop->AddLoopTag ( CIFTAG_CONN_TYPE_ID                 );

  Loop->AddLoopTag ( CIFTAG_CONN_PTNR1_AUTH_ATOM_ID      );
  Loop->AddLoopTag ( CIFTAG_CONN_PDBX_PTNR1_AUTH_ALT_ID  );
  Loop->AddLoopTag ( CIFTAG_CONN_PTNR1_AUTH_COMP_ID      );
  Loop->AddLoopTag ( CIFTAG_CONN_PTNR1_AUTH_ASYM_ID      );
  Loop->AddLoopTag ( CIFTAG_CONN_PTNR1_AUTH_SEQ_ID       );
  Loop->AddLoopTag ( CIFTAG_CONN_PDBX_PTNR1_PDB_INS_CODE );

  Loop->AddLoopTag ( CIFTAG_CONN_PTNR2_AUTH_ATOM_ID      );
  Loop->AddLoopTag ( CIFTAG_CONN_PDBX_PTNR2_AUTH_ALT_ID  );
  Loop->AddLoopTag ( CIFTAG_CONN_PTNR2_AUTH_COMP_ID      );
  Loop->AddLoopTag ( CIFTAG_CONN_PTNR2_AUTH_ASYM_ID      );
  Loop->AddLoopTag ( CIFTAG_CONN_PTNR2_AUTH_SEQ_ID       );
  Loop->AddLoopTag ( CIFTAG_CONN_PDBX_PTNR2_PDB_INS_CODE );

  Loop->AddLoopTag ( CIFTAG_CONN_PTNR1_SYMMETRY );
  Loop->AddLoopTag ( CIFTAG_CONN_PTNR2_SYMMETRY );

}


void  CLink::MakeCIF ( PCMMCIFData CIF, int N )  {
PCMMCIFLoop Loop;
char        S[100];
int         RC;

  RC = CIF->AddLoop ( CIFCAT_STRUCT_CONN,Loop );
  if (RC!=CIFRC_Ok) // the category was (re)created, provide tags
    AddStructConnTags ( Loop );

  Loop->AddString  ( "1"      );  // should be a counter
  Loop->AddString  ( pstr(LinkTypeID) );

  Loop->AddString  ( atName1  );
  Loop->AddString  ( aloc1    );
  Loop->AddString  ( resName1 );
  Loop->AddString  ( chainID1 );
  Loop->AddInteger ( seqNum1  );
  Loop->AddString  ( insCode1 );

  Loop->AddString  ( atName2  );
  Loop->AddString  ( aloc2    );
  Loop->AddString  ( resName2 );
  Loop->AddString  ( chainID2 );
  Loop->AddInteger ( seqNum2  );
  Loop->AddString  ( insCode2 );

  sprintf ( S,"%i%i%i%i",s1,i1,j1,k1 );
  Loop->AddString  ( S );
  sprintf ( S,"%i%i%i%i",s2,i2,j2,k2 );
  Loop->AddString  ( S );

}

int CLink::ConvertPDBASCII ( cpstr S )  {

  GetString    ( atName1 ,&(S[12]),4 );
  strcpy_ncss  ( aloc1   ,&(S[16]),1 );
  strcpy_ncss  ( resName1,&(S[17]),3 );
  strcpy_ncss  ( chainID1,&(S[21]),1 );
  GetIntIns    ( seqNum1,insCode1,&(S[22]),4 ); 

  GetString    ( atName2 ,&(S[42]),4 );
  strcpy_ncss  ( aloc2   ,&(S[46]),1 );
  strcpy_ncss  ( resName2,&(S[47]),3 );
  strcpy_ncss  ( chainID2,&(S[51]),1 );
  GetIntIns    ( seqNum2,insCode2,&(S[52]),4 ); 

  GetInteger   ( s1,&(S[59]),3 );
  GetInteger   ( i1,&(S[62]),1 );
  GetInteger   ( j1,&(S[63]),1 );
  GetInteger   ( k1,&(S[64]),1 );

  GetInteger   ( s2,&(S[66]),3 );
  GetInteger   ( i2,&(S[69]),1 );
  GetInteger   ( j2,&(S[70]),1 );
  GetInteger   ( k2,&(S[71]),1 );

  return 0;

}

void  CLink::GetCIF ( PCMMCIFData CIF, int & Signal )  {
PCMMCIFLoop Loop;
pstr        F;
char        S[100];
int         RC,l;
Boolean     Done;

  Loop = CIF->GetLoop ( CIFCAT_STRUCT_CONN );
  if (!Loop)  {
    Signal = -1;  // signal to finish processing of this structure
    return;
  }

  l    = Loop->GetLoopLength();
  Done = (Signal>=l);
  while (!Done) {
    F = Loop->GetString ( CIFTAG_CONN_TYPE_ID,Signal,RC );
    if ((!RC) && F)  Done = (strcmp(F,LinkTypeID)==0);
               else  Done = False;
    if (!Done)  {
      Signal++;
      Done = (Signal>=l);
    }
  }

  if (Signal>=l)  {
    Signal = -1;  // finish processing of Turn
    return;
  }

  Loop->DeleteField ( CIFTAG_CONN_TYPE_ID,Signal );

//  CIFGetInteger ( l,Loop,CIFTAG_ID,Signal );

  CIFGetString ( atName1,Loop,CIFTAG_CONN_PTNR1_AUTH_ATOM_ID,Signal,
                 sizeof(atName1),pstr("    ") );
  CIFGetString ( aloc1,Loop,CIFTAG_CONN_PDBX_PTNR1_AUTH_ALT_ID,Signal,
                 sizeof(aloc1),pstr(" ") );
  CIFGetString ( resName1,Loop,CIFTAG_CONN_PTNR1_AUTH_COMP_ID,Signal,
                 sizeof(resName1),pstr("   ") );
  CIFGetString ( chainID1,Loop,CIFTAG_CONN_PTNR1_AUTH_ASYM_ID,Signal,
                 sizeof(chainID1),pstr(" ") );
  if (CIFGetInteger(seqNum1,Loop,CIFTAG_CONN_PTNR1_AUTH_SEQ_ID,Signal))
    return;
  CIFGetString ( insCode1,Loop,CIFTAG_CONN_PDBX_PTNR1_PDB_INS_CODE,
                 Signal,sizeof(insCode1),pstr(" ") );

  CIFGetString ( atName2,Loop,CIFTAG_CONN_PTNR2_AUTH_ATOM_ID,Signal,
                 sizeof(atName2),pstr("    ") );
  CIFGetString ( aloc2,Loop,CIFTAG_CONN_PDBX_PTNR2_AUTH_ALT_ID,Signal,
                 sizeof(aloc2),pstr(" ") );
  CIFGetString ( resName2,Loop,CIFTAG_CONN_PTNR2_AUTH_COMP_ID,Signal,
                 sizeof(resName2),pstr("   ") );
  CIFGetString ( chainID2,Loop,CIFTAG_CONN_PTNR2_AUTH_ASYM_ID,Signal,
                 sizeof(chainID2),pstr(" ") );
  if (CIFGetInteger(seqNum2,Loop,CIFTAG_CONN_PTNR2_AUTH_SEQ_ID,Signal))
    return;
  CIFGetString ( insCode2,Loop,CIFTAG_CONN_PDBX_PTNR2_PDB_INS_CODE,
                 Signal,sizeof(insCode2),pstr(" ") );

  CIFGetString ( S,Loop,CIFTAG_CONN_PTNR1_SYMMETRY,Signal,
                 sizeof(S),pstr("") );
  if (S[0])  {
    l  = strlen(S)-1;
    k1 = int(S[l--]) - int('0');
    j1 = int(S[l--]) - int('0');
    i1 = int(S[l--]) - int('0');
    S[l] = char(0);
    s1 = atoi(S);
  }

  CIFGetString ( S,Loop,CIFTAG_CONN_PTNR2_SYMMETRY,Signal,
                 sizeof(S),pstr("") );
  if (S[0])  {
    l  = strlen(S)-1;
    k2 = int(S[l--]) - int('0');
    j2 = int(S[l--]) - int('0');
    i2 = int(S[l--]) - int('0');
    S[l] = char(0);
    s2 = atoi(S);
  }

  Signal++;

}

void  CLink::Copy ( PCContainerClass Link )  {

  strcpy ( atName1 ,PCLink(Link)->atName1  );
  strcpy ( aloc1   ,PCLink(Link)->aloc1    );
  strcpy ( resName1,PCLink(Link)->resName1 );
  strcpy ( chainID1,PCLink(Link)->chainID1 );
  seqNum1 = PCLink(Link)->seqNum1;
  strcpy ( insCode1,PCLink(Link)->insCode1 );

  strcpy ( atName2 ,PCLink(Link)->atName2  );
  strcpy ( aloc2   ,PCLink(Link)->aloc2    );
  strcpy ( resName2,PCLink(Link)->resName2 );
  strcpy ( chainID2,PCLink(Link)->chainID2 );
  seqNum2 = PCLink(Link)->seqNum2;
  strcpy ( insCode2,PCLink(Link)->insCode2 );

  s1 = PCLink(Link)->s1;
  i1 = PCLink(Link)->i1;
  j1 = PCLink(Link)->j1;
  k1 = PCLink(Link)->k1;

  s2 = PCLink(Link)->s2;
  i2 = PCLink(Link)->i2;
  j2 = PCLink(Link)->j2;
  k2 = PCLink(Link)->k2;

}
    
void  CLink::write ( RCFile f )  {
byte Version=1;

  f.WriteByte ( &Version    );

  f.WriteTerLine ( atName1 ,False );
  f.WriteTerLine ( aloc1   ,False );
  f.WriteTerLine ( resName1,False );
  f.WriteTerLine ( chainID1,False );
  f.WriteInt     ( &seqNum1 );
  f.WriteTerLine ( insCode1,False );

  f.WriteTerLine ( atName2 ,False );
  f.WriteTerLine ( aloc2   ,False );
  f.WriteTerLine ( resName2,False );
  f.WriteTerLine ( chainID2,False );
  f.WriteInt     ( &seqNum2 );
  f.WriteTerLine ( insCode2,False );

  f.WriteInt ( &s1 );
  f.WriteInt ( &i1 );
  f.WriteInt ( &j1 );
  f.WriteInt ( &k1 );

  f.WriteInt ( &s2 );
  f.WriteInt ( &i2 );
  f.WriteInt ( &j2 );
  f.WriteInt ( &k2 );

}

void  CLink::read ( RCFile f )  {
byte Version;

  f.ReadByte ( &Version    );

  f.ReadTerLine ( atName1 ,False );
  f.ReadTerLine ( aloc1   ,False );
  f.ReadTerLine ( resName1,False );
  f.ReadTerLine ( chainID1,False );
  f.ReadInt     ( &seqNum1 );
  f.ReadTerLine ( insCode1,False );

  f.ReadTerLine ( atName2 ,False );
  f.ReadTerLine ( aloc2   ,False );
  f.ReadTerLine ( resName2,False );
  f.ReadTerLine ( chainID2,False );
  f.ReadInt     ( &seqNum2 );
  f.ReadTerLine ( insCode2,False );

  f.ReadInt ( &s1 );
  f.ReadInt ( &i1 );
  f.ReadInt ( &j1 );
  f.ReadInt ( &k1 );

  f.ReadInt ( &s2 );
  f.ReadInt ( &i2 );
  f.ReadInt ( &j2 );
  f.ReadInt ( &k2 );

}

MakeStreamFunctions(CLink)


//  ===================  CCisPepContainer  ======================

PCContainerClass CCisPepContainer::MakeContainerClass ( int ClassID ) {
  switch (ClassID)  {
    default :
    case ClassID_Template : return
                        CClassContainer::MakeContainerClass(ClassID);
    case ClassID_CisPep   : return new CCisPep();
  }
}

MakeStreamFunctions(CCisPepContainer)


//  ========================  CCisPep  ==========================

CCisPep::CCisPep() : CContainerClass()  {
  InitCisPep();
}

CCisPep::CCisPep ( cpstr S ) : CContainerClass()  {
  InitCisPep();
  ConvertPDBASCII ( S );
}

CCisPep::CCisPep ( RPCStream Object ) : CContainerClass(Object)  {
  InitCisPep();
}

CCisPep::~CCisPep() {}

void CCisPep::InitCisPep()  {
  serNum  = 1;                //  record serial number
  strcpy ( pep1    ,"---" );  //  residue name
  strcpy ( chainID1," "   );  //  chain identifier 1
  seqNum1 = 0;                //  residue sequence number 1
  strcpy ( icode1  ," "   );  //  insertion code 1
  strcpy ( pep2    ,"---" );  //  residue name 2
  strcpy ( chainID2," "   );  //  chain identifier 2
  seqNum2 = 0;                //  residue sequence number 2
  strcpy ( icode2  ," "   );  //  insertion code 2
  modNum  = 0;                //  model number
  measure = 0.0;              //  measure of the angle in degrees.
}

void  CCisPep::PDBASCIIDump ( pstr S, int N )  {

  strcpy     ( S,"CISPEP" );
  PadSpaces  ( S,80 );

  PutInteger ( &(S[7]),serNum,3 );

  strcpy_n1  ( &(S[11]),pep1    ,3 );
  strcpy_n1  ( &(S[15]),chainID1,1 );
  PutIntIns  ( &(S[17]),seqNum1 ,4,icode1 );

  strcpy_n1  ( &(S[25]),pep2    ,3 );
  strcpy_n1  ( &(S[29]),chainID2,1 );
  PutIntIns  ( &(S[31]),seqNum2 ,4,icode1 );

  PutInteger ( &(S[43]),modNum,3 );
  PutRealF   ( &(S[53]),measure,6,2 );

}


int CCisPep::ConvertPDBASCII ( cpstr S )  {

  GetInteger   ( serNum  ,&(S[7]) ,3 );

  strcpy_ncss  ( pep1    ,&(S[11]),3 );
  strcpy_ncss  ( chainID1,&(S[15]),1 );
  GetIntIns    ( seqNum1,icode1,&(S[17]),4 ); 

  strcpy_ncss  ( pep2    ,&(S[25]),3 );
  strcpy_ncss  ( chainID2,&(S[29]),1 );
  GetIntIns    ( seqNum2,icode2,&(S[31]),4 ); 

  GetInteger   ( modNum  ,&(S[43]),3 );
  GetReal      ( measure ,&(S[53]),6 );

  return 0;

}


void  CCisPep::Copy ( PCContainerClass CisPep )  {

  serNum  = PCCisPep(CisPep)->serNum;

  strcpy ( pep1    ,PCCisPep(CisPep)->pep1     );
  strcpy ( chainID1,PCCisPep(CisPep)->chainID1 );
  seqNum1 = PCCisPep(CisPep)->seqNum1;
  strcpy ( icode1  ,PCCisPep(CisPep)->icode1   );

  strcpy ( pep2    ,PCCisPep(CisPep)->pep2     );
  strcpy ( chainID2,PCCisPep(CisPep)->chainID2 );
  seqNum2 = PCCisPep(CisPep)->seqNum2;
  strcpy ( icode2  ,PCCisPep(CisPep)->icode2   );

  modNum  = PCCisPep(CisPep)->modNum;
  measure = PCCisPep(CisPep)->measure;

}
    
void  CCisPep::write ( RCFile f )  {
byte Version=1;

  f.WriteByte    ( &Version   );

  f.WriteInt     ( &serNum );

  f.WriteTerLine ( pep1    ,False );
  f.WriteTerLine ( chainID1,False );
  f.WriteInt     ( &seqNum1 );
  f.WriteTerLine ( icode1  ,False );

  f.WriteTerLine ( pep2    ,False );
  f.WriteTerLine ( chainID2,False );
  f.WriteInt     ( &seqNum2 );
  f.WriteTerLine ( icode2  ,False );

  f.WriteInt     ( &modNum  );
  f.WriteReal    ( &measure );

}

void  CCisPep::read ( RCFile f )  {
byte Version;

  f.ReadByte    ( &Version   );

  f.ReadInt     ( &serNum );

  f.ReadTerLine ( pep1    ,False );
  f.ReadTerLine ( chainID1,False );
  f.ReadInt     ( &seqNum1 );
  f.ReadTerLine ( icode1  ,False );

  f.ReadTerLine ( pep2    ,False );
  f.ReadTerLine ( chainID2,False );
  f.ReadInt     ( &seqNum2 );
  f.ReadTerLine ( icode2  ,False );

  f.ReadInt     ( &modNum  );
  f.ReadReal    ( &measure );

}

MakeStreamFunctions(CCisPep)



//  =====================   CModel   =======================

CModel::CModel() : CProModel() {
  InitModel();
}

CModel::CModel ( PCMMDBManager MMDBM, int serialNum ) : CProModel() {
  InitModel();
  manager = MMDBM;
  serNum  = serialNum;
}

CModel::CModel ( RPCStream Object ) : CProModel(Object)  {
  InitModel();
}

void  CModel::InitModel()  {
  serNum       = 0;
  nChains      = 0;
  nChainsAlloc = 0;
  Chain        = NULL;
  manager      = NULL;
  Exclude      = True;
}

CModel::~CModel()  {
  FreeMemory();
  if (manager)  manager->_ExcludeModel ( serNum );
}

void CModel::FreeMemory()  {

  DeleteAllChains();
  if (Chain)  delete[] Chain;
  Chain        = NULL;
  nChains      = 0;
  nChainsAlloc = 0;

  RemoveSecStructure();
  RemoveHetInfo     ();
  RemoveLinks       ();
  RemoveCisPeps     ();

}


void  CModel::SetMMDBManager ( PCMMDBManager MMDBM, int serialNum )  {
  manager = MMDBM;
  serNum  = serialNum;
}

void  CModel::CheckInAtoms()  {
int i;
  if (manager)
    for (i=0;i<nChains;i++)
      if (Chain[i])
        Chain[i]->CheckInAtoms();
}


int  CModel::GetNumberOfAtoms ( Boolean countTers )  {
// returns number of atoms in the model
int i,na;
  na = 0;
  for (i=0;i<nChains;i++)
    if (Chain[i])  na += Chain[i]->GetNumberOfAtoms ( countTers );
  return na;
}

int  CModel::GetNumberOfResidues()  {
// returns number of residues in the model
PCChain   chain;
int       ic,ir,nr;
  nr = 0;
  for (ic=0;ic<nChains;ic++)  {
    chain = Chain[ic];
    if (chain)
      for (ir=0;ir<chain->nResidues;ir++)
        if (chain->Residue[ir])  nr++;
  }
  return nr;
}


//  ----------------  Extracting chains  --------------------------

int  CModel::GetNumberOfChains()  {
  return nChains;
}

PCChain CModel::GetChain ( int chainNo )  {
  if ((0<=chainNo) && (chainNo<nChains))
        return Chain[chainNo];
  else  return NULL;
}


void CModel::ExpandChainArray ( int nOfChains )  {
PPCChain Chain1;
int      i;
  if (nOfChains>=nChainsAlloc)  {
    nChainsAlloc = nOfChains+10;
    Chain1 = new PCChain[nChainsAlloc];
    for (i=0;i<nChains;i++)
      Chain1[i] = Chain[i];
    for (i=nChains;i<nChainsAlloc;i++)
      Chain1[i] = NULL;
    if (Chain)  delete[] Chain;
    Chain = Chain1;
  }
}

PCChain CModel::GetChainCreate ( const ChainID chID )  {
//   Returns pointer on chain, whose identifier is
// given in chID. If such a chain is absent in the
// model, it is created.
int i;

  // check if such a chain is already in the model
  if (chID[0])  {
    for (i=0;i<nChains;i++)
      if (Chain[i])  {
        if (!strcmp(chID,Chain[i]->chainID))
          return Chain[i]; // it is there; just return the pointer
      }
  } else  {
    for (i=0;i<nChains;i++)
      if (Chain[i])  {
        if (!Chain[i]->chainID[0])
          return Chain[i]; // it is there; just return the pointer
      }
  }

  ExpandChainArray ( nChains );

  // create new chain
  Chain[nChains] = newCChain();
  Chain[nChains]->SetChain ( chID );
  Chain[nChains]->SetModel ( this );
  nChains++;

  return Chain[nChains-1];  
  
}

PCChain CModel::CreateChain ( const ChainID chID )  {
//   CreateChain() creates a new chain with chain ID regardless
// the presence of same-ID chains in the model. This function
// was introduced only for compatibility with older CCP4
// applications and using it in any new developments should be
// strictly discouraged.

  ExpandChainArray ( nChains );

  // create new chain
  Chain[nChains] = newCChain();
  Chain[nChains]->SetChain ( chID );
  Chain[nChains]->SetModel ( this );
  nChains++;

  return Chain[nChains-1];  

}


void  CModel::GetChainTable ( PPCChain & chainTable,
                              int & NumberOfChains )  {
  chainTable     = Chain;
  NumberOfChains = nChains;
}

Boolean CModel::GetNewChainID ( ChainID chID, int length )  {
int     i,k;
Boolean found;

  memset ( chID,0,sizeof(ChainID) );
  chID[0] = 'A';

  do  {
    found = False;
    for (i=0;(i<nChains) && (!found);i++)
      if (Chain[i])
        found = (!strcmp(chID,Chain[i]->chainID));
    if (found)  {
      k = 0;
      while (k<length)
        if (!chID[k])  {
          chID[k] = 'A';
          break;
        } else if (chID[k]<'Z')  {
          chID[k]++;
          break;
        } else  {
          chID[k] = 'A';
          k++;
        }
    } else
      k = 0;
  } while (found && (k<length));

  if (found)  {
    k = strlen(chID);
    while (k<length)
      chID[k++] = 'A';
  }

  return (!found);

}


PCChain CModel::GetChain ( const ChainID chID )  {
//   Returns pointer on chain, whose identifier is
// given in chID. If such a chain is absent in the
// model, returns NULL.
int     i;
Boolean isChainID;
  if (chID)  isChainID = (chID[0]!=char(0));
       else  isChainID = False;
  if (isChainID)  {
    for (i=0;i<nChains;i++)
      if (Chain[i])  {
        if (!strcmp(chID,Chain[i]->chainID))
          return Chain[i]; // it is there; just return the pointer
      }
  } else  {
    for (i=0;i<nChains;i++)
      if (Chain[i])  {
        if (!Chain[i]->chainID[0])
          return Chain[i]; // it is there; just return the pointer
      }
  }
  return NULL;  
}


//  ------------------  Deleting chains  --------------------------

int CModel::DeleteChain ( int chainNo )  {
  if ((0<=chainNo) && (chainNo<nChains))  {
    if (Chain[chainNo])  {
      Exclude = False;
      delete Chain[chainNo];
      Chain[chainNo] = NULL;
      Exclude = True;
      return 1;
    }
  }
  return 0;
}

int CModel::DeleteChain ( const ChainID chID )  {
int i;
  if (chID[0])  {
    for (i=0;i<nChains;i++)
      if (Chain[i])  {
        if (!strcmp(chID,Chain[i]->chainID))  {
          Exclude  = False;
          delete Chain[i];
          Chain[i] = NULL;
          Exclude  = True;
          return 1;
        }
      }
  } else  {
    for (i=0;i<nChains;i++)
      if (Chain[i])  {
        if (!Chain[i]->chainID[0])  {
          Exclude  = False;
          delete Chain[i];
          Chain[i] = NULL;
          Exclude  = True;
          return 1;
        }
      }
  }
  return 0;
}


int CModel::DeleteAllChains()  {
int i,k;
  Exclude = False;
  k = 0;
  for (i=0;i<nChains;i++)
    if (Chain[i])  {
      delete Chain[i];
      Chain[i] = NULL;
      k++;
    }
  nChains = 0;
  Exclude = True;
  return k;
}

int CModel::DeleteSolventChains()  {
int i,k;
  Exclude = False;
  k = 0;
  for (i=0;i<nChains;i++)
    if (Chain[i])  {
      if (Chain[i]->isSolventChain())  {
        delete Chain[i];
        Chain[i] = NULL;
        k++;
      }
    }
  Exclude = True;
  return k;
}

void CModel::TrimChainTable()  {
int i,j;
  Exclude = False;
  j = 0;
  for (i=0;i<nChains;i++)
    if (Chain[i])  {
      if (Chain[i]->nResidues>0)  {
        if (j<i)  {
          Chain[j] = Chain[i];
          Chain[i] = NULL;
        }
        j++;
      } else  {
        delete Chain[i];
        Chain[i] = NULL;
      }
    }
  nChains = j;
  Exclude = True;
}


int  CModel::GetNumberOfResidues ( const ChainID chainID )  {
PCChain chain;
  chain = GetChain ( chainID );
  if (chain)  return chain->nResidues;
  return 0;
}

int  CModel::GetNumberOfResidues ( int chainNo )  {
  if ((0<=chainNo) && (chainNo<nChains))  {
    if (Chain[chainNo])
      return Chain[chainNo]->nResidues;
  }
  return 0;
}

PCResidue CModel::GetResidue ( const ChainID chainID, int seqNo,
                               const InsCode insCode )  {
PCChain chain;
  chain = GetChain ( chainID );
  if (chain)  
    return chain->GetResidue ( seqNo,insCode );
  return NULL;
}

PCResidue CModel::GetResidue ( const ChainID chainID, int resNo )  {
PCChain chain;
  chain = GetChain ( chainID );
  if (chain)  {
    if ((0<=resNo) && (resNo<chain->nResidues))
      return chain->Residue[resNo];
  }
  return NULL;
}

PCResidue CModel::GetResidue ( int chainNo, int seqNo,
                               const InsCode insCode )  {
  if ((0<=chainNo) && (chainNo<nChains))  {
    if (Chain[chainNo])
      return Chain[chainNo]->GetResidue ( seqNo,insCode );
  }
  return NULL;
}

PCResidue CModel::GetResidue ( int chainNo, int resNo )  {
  if ((0<=chainNo) && (chainNo<nChains))  {
    if (Chain[chainNo]) {
      if ((0<=resNo) && (resNo<Chain[chainNo]->nResidues))
        return Chain[chainNo]->Residue[resNo];
    }
  }
  return NULL;
}

int CModel::GetResidueNo ( const ChainID chainID, int seqNo,
                           const InsCode insCode )  {
PCChain chain;
  chain = GetChain ( chainID );
  if (chain)  
    return chain->GetResidueNo ( seqNo,insCode );
  return -2;
}

int CModel::GetResidueNo ( int  chainNo, int seqNo,
                           const InsCode insCode )  {
  if ((0<=chainNo) && (chainNo<nChains))  {
    if (Chain[chainNo])
      return Chain[chainNo]->GetResidueNo ( seqNo,insCode );
  }
  return -2;
}


void CModel::GetResidueTable ( PPCResidue & resTable,
                               int & NumberOfResidues )  {
// resTable has to be NULL or it will be reallocated. The application
// is responsible for deallocating the resTable (but not of its
// residues!). This does not apply to other GetResidueTable
// functions.
PPCChain   chain;
PPCResidue res;
int        i,j,k,nChns,nResidues;

  if (resTable)  {
    delete[] resTable;
    resTable = NULL;
  }

  NumberOfResidues = 0;
  GetChainTable ( chain,nChns );
  for (i=0;i<nChns;i++)
    if (chain[i])  {
      chain[i]->GetResidueTable ( res,nResidues );
      NumberOfResidues += nResidues;
    }

  if (NumberOfResidues>0)  {
    resTable = new PCResidue[NumberOfResidues];
    k = 0;
    GetChainTable ( chain,nChns );
    for (i=0;i<nChns;i++)
      if (chain[i])  {
        chain[i]->GetResidueTable ( res,nResidues );
        for (j=0;j<nResidues;j++)
          if (res[j])  resTable[k++] = res[j];
      }
    NumberOfResidues = k;
  }

}

void CModel::GetResidueTable ( const ChainID chainID,
                               PPCResidue & resTable,
                               int & NumberOfResidues )  {
PCChain chain;
  resTable         = NULL;
  NumberOfResidues = 0;
  chain = GetChain ( chainID );
  if (chain)  {
    resTable         = chain->Residue;
    NumberOfResidues = chain->nResidues;
  }
}

void CModel::GetResidueTable ( int chainNo, PPCResidue & resTable,
                               int & NumberOfResidues )  {
  resTable         = NULL;
  NumberOfResidues = 0;
  if ((0<=chainNo) && (chainNo<nChains))  {
    if (Chain[chainNo])  {
      resTable         = Chain[chainNo]->Residue;
      NumberOfResidues = Chain[chainNo]->nResidues;
    }
  }
}


int CModel::DeleteResidue ( const ChainID chainID, int seqNo,
                            const InsCode insCode )  {
PCChain chain;
  chain = GetChain ( chainID );
  if (chain)  return chain->DeleteResidue ( seqNo,insCode );
  return 0;
}

int CModel::DeleteResidue ( const ChainID chainID, int resNo )  {
PCChain chain;
  chain = GetChain ( chainID );
  if (chain)  return chain->DeleteResidue ( resNo );
  return 0;
}

int CModel::DeleteResidue ( int  chainNo, int seqNo,
                            const InsCode insCode )  {
  if ((0<=chainNo) && (chainNo<nChains))  {
    if (Chain[chainNo])
      return Chain[chainNo]->DeleteResidue ( seqNo,insCode );
  }
  return 0;
}

int CModel::DeleteResidue ( int chainNo, int resNo )  {
  if ((0<=chainNo) && (chainNo<nChains))  {
    if (Chain[chainNo])
      return Chain[chainNo]->DeleteResidue ( resNo );
  }
  return 0;
}

int CModel::DeleteAllResidues ( const ChainID chainID )  {
PCChain chain;
  chain = GetChain ( chainID );
  if (chain)  return chain->DeleteAllResidues();
  return 0;
}

int CModel::DeleteAllResidues ( int chainNo )  {
  if ((0<=chainNo) && (chainNo<nChains))  {
    if (Chain[chainNo])
      return Chain[chainNo]->DeleteAllResidues();
  }
  return 0;
}

int CModel::DeleteAllResidues()  {
int i,k;
  k = 0;
  for (i=0;i<nChains;i++)
    if (Chain[i])
      k += Chain[i]->DeleteAllResidues();
  return k;
}


int CModel::DeleteSolvent()  {
int i,k;
  Exclude = False;
  k = 0;
  for (i=0;i<nChains;i++)
    if (Chain[i])  {
      k += Chain[i]->DeleteSolvent();
      Chain[i]->TrimResidueTable();
      if (Chain[i]->nResidues<=0)  {
        delete Chain[i];
        Chain[i] = NULL;
      }
    }
  Exclude = True;
  return k;
}


int CModel::AddResidue ( const ChainID chainID, PCResidue res )  {
PCChain chain;
  chain = GetChain ( chainID );
  if (chain)  return chain->AddResidue ( res );
  return 0;
}

int CModel::AddResidue ( int chainNo, PCResidue res )  {
  if ((0<=chainNo) && (chainNo<nChains))  {
    if (Chain[chainNo])
      return Chain[chainNo]->AddResidue ( res );
  }
  return 0;
}


int  CModel::_ExcludeChain ( const ChainID chainID )  {
//   _ExcludeChain(..) excludes (but does not dispose!) a chain
// from the model. Returns 1 if the model gets empty and 0 otherwise.
int  i,k;

  if (!Exclude)  return 0;

  // find the chain
  k = -1;
  for (i=0;(i<nChains) && (k<0);i++)
    if (!strcmp(chainID,Chain[i]->chainID)) 
      k = i;

  if (k>=0)  {
    for (i=k+1;i<nChains;i++)
      Chain[i-1] = Chain[i];
    nChains--;
    Chain[nChains] = NULL;
  }

  if (nChains<=0)  return 1;
             else  return 0;

}



// --------------------  Extracting atoms  -----------------------


int  CModel::GetNumberOfAtoms ( const ChainID chainID, int seqNo,
                                const InsCode insCode )  {
PCChain   chain;
PCResidue res;
  chain = GetChain ( chainID );
  if (chain)  {
    res = chain->GetResidue ( seqNo,insCode );
    if (res)  return res->nAtoms;
  }
  return 0;
}

int  CModel::GetNumberOfAtoms ( int chainNo, int seqNo,
                                const InsCode insCode )  {
PCChain   chain;
PCResidue res;
  chain = GetChain ( chainNo );
  if (chain)  {
    res = chain->GetResidue ( seqNo,insCode );
    if (res)  return res->nAtoms;
  }
  return 0;
}

int  CModel::GetNumberOfAtoms ( const ChainID chainID, int resNo )  {
PCChain   chain;
PCResidue res;
  chain = GetChain ( chainID );
  if (chain)  {
    if ((0<=resNo) && (resNo<chain->nResidues))  {
      res = chain->Residue[resNo];
      if (res)  return res->nAtoms;
    }
  }
  return 0;
}

int  CModel::GetNumberOfAtoms ( int chainNo, int resNo )  {
PCChain   chain;
PCResidue res;
  if ((0<=chainNo) && (chainNo<nChains))  {
    chain = Chain[chainNo];
    if (chain)  {
      if ((0<=resNo) && (resNo<chain->nResidues))  {
        res = chain->Residue[resNo];
        if (res)  return res->nAtoms;
      }
    }
  }
  return 0;
}

PCAtom  CModel::GetAtom ( const ChainID  chID,
                          int            seqNo,
                          const InsCode  insCode,
                          const AtomName aname,
                          const Element  elmnt,
                          const AltLoc   aloc
                        )  {
PCChain   chn;
PCResidue res;
  chn = GetChain ( chID );  
  if (chn)  {
    res = chn->GetResidue ( seqNo,insCode );  
    if (res) 
      return res->GetAtom ( aname,elmnt,aloc );
  }
  return NULL;
}

PCAtom CModel::GetAtom ( const ChainID chID,    int seqNo,
                         const InsCode insCode, int   atomNo )  {
PCChain   chn;
PCResidue res;
  chn = GetChain ( chID );  
  if (chn)  {
    res = chn->GetResidue ( seqNo,insCode );  
    if (res)  {
      if ((0<=atomNo) && (atomNo<res->nAtoms))
        return res->atom[atomNo];
    }
  }
  return NULL;
}

PCAtom CModel::GetAtom ( const ChainID  chID,
                         int            resNo,
                         const AtomName aname,
                         const Element  elmnt,
                         const AltLoc   aloc )  {
PCChain   chn;
PCResidue res;
  chn = GetChain ( chID );  
  if (chn)  {
    if ((0<=resNo) && (resNo<chn->nResidues))  {
      res = chn->Residue[resNo];  
      if (res)
        return res->GetAtom ( aname,elmnt,aloc );
    }
  }
  return NULL;
}

PCAtom CModel::GetAtom ( const ChainID chID, int resNo, int atomNo )  {
PCChain   chn;
PCResidue res;
  chn = GetChain ( chID );  
  if (chn)  {
    if ((0<=resNo) && (resNo<chn->nResidues))  {
      res = chn->Residue[resNo];  
      if (res)  {
        if ((0<=atomNo) && (atomNo<res->nAtoms))
          return res->atom[atomNo];
      }
    }
  }
  return NULL;
}

PCAtom CModel::GetAtom ( int chNo, int seqNo,
                         const InsCode  insCode,
                         const AtomName aname,
                         const Element  elmnt,
                         const AltLoc   aloc )  {
PCResidue res;
  if ((0<=chNo) && (chNo<nChains))  {
    if (Chain[chNo])  {
      res = Chain[chNo]->GetResidue ( seqNo,insCode );  
      if (res)
        return res->GetAtom ( aname,elmnt,aloc );
    }
  }
  return NULL;
}

PCAtom CModel::GetAtom ( int chNo, int seqNo, const InsCode insCode,
                         int atomNo )  {
PCResidue res;
  if ((0<=chNo) && (chNo<nChains))  {
    if (Chain[chNo])  {
      res = Chain[chNo]->GetResidue ( seqNo,insCode );  
      if (res)  {
        if ((0<=atomNo) && (atomNo<res->nAtoms))
          return res->atom[atomNo];
      }
    }
  }
  return NULL;
}

PCAtom CModel::GetAtom ( int chNo, int resNo,
                         const AtomName aname,
                         const Element  elmnt,
                         const AltLoc   aloc )  {
PCResidue res;
  if ((0<=chNo) && (chNo<nChains))  {
    if (Chain[chNo])  {
      if ((0<=resNo) && (resNo<Chain[chNo]->nResidues))  {
        res = Chain[chNo]->Residue[resNo];  
        if (res)
          return res->GetAtom ( aname,elmnt,aloc );
      }
    }
  }
  return NULL;
}

PCAtom CModel::GetAtom ( int chNo, int resNo, int atomNo )  {
PCResidue res;
  if ((0<=chNo) && (chNo<nChains))  {
    if (Chain[chNo])  {
      if ((0<=resNo) && (resNo<Chain[chNo]->nResidues))  {
        res = Chain[chNo]->Residue[resNo];  
        if (res)  {
          if ((0<=atomNo) && (atomNo<res->nAtoms))
            return res->atom[atomNo];
        }
      }
    }
  }
  return NULL;
}


void CModel::GetAtomTable ( const ChainID chainID, int seqNo,
                            const InsCode insCode,
                            PPCAtom & atomTable,
                            int & NumberOfAtoms )  {
PCResidue res;
  atomTable     = NULL;
  NumberOfAtoms = 0;
  res = GetResidue ( chainID,seqNo,insCode );
  if (res)  {
    atomTable     = res->atom;
    NumberOfAtoms = res->nAtoms;
  }
}

void CModel::GetAtomTable ( int chainNo, int seqNo,
                            const InsCode insCode,
                            PPCAtom & atomTable,
                            int & NumberOfAtoms )  {
PCResidue res;
  atomTable     = NULL;
  NumberOfAtoms = 0;
  res = GetResidue ( chainNo,seqNo,insCode );
  if (res)  {
    atomTable     = res->atom;
    NumberOfAtoms = res->nAtoms;
  }
}

void CModel::GetAtomTable ( const ChainID chainID, int resNo,
                            PPCAtom & atomTable,
                            int & NumberOfAtoms )  {
PCResidue res;
  atomTable     = NULL;
  NumberOfAtoms = 0;
  res = GetResidue ( chainID,resNo );
  if (res)  {
    atomTable     = res->atom;
    NumberOfAtoms = res->nAtoms;
  }
}

void CModel::GetAtomTable ( int chainNo, int resNo,
                            PPCAtom & atomTable,
                            int & NumberOfAtoms )  {
PCResidue res;
  atomTable     = NULL;
  NumberOfAtoms = 0;
  res = GetResidue ( chainNo,resNo );
  if (res)  {
    atomTable     = res->atom;
    NumberOfAtoms = res->nAtoms;
  }
}


void CModel::GetAtomTable1 ( const ChainID chainID, int seqNo,
                             const InsCode insCode,
                             PPCAtom & atomTable,
                             int & NumberOfAtoms )  {
PCResidue res;
  res = GetResidue ( chainID,seqNo,insCode );
  if (res)
    res->GetAtomTable1 ( atomTable,NumberOfAtoms );
  else  {
    if (atomTable)  delete[] atomTable;
    atomTable     = NULL;
    NumberOfAtoms = 0;
  }
}

void CModel::GetAtomTable1 ( int chainNo, int seqNo,
                             const InsCode insCode,
                             PPCAtom & atomTable,
                             int & NumberOfAtoms )  {
PCResidue res;
  res = GetResidue ( chainNo,seqNo,insCode );
  if (res)
    res->GetAtomTable1 ( atomTable,NumberOfAtoms );
  else  {
    if (atomTable)  delete[] atomTable;
    atomTable     = NULL;
    NumberOfAtoms = 0;
  }
}

void CModel::GetAtomTable1 ( const ChainID chainID, int resNo,
                             PPCAtom & atomTable,
                             int & NumberOfAtoms )  {
PCResidue res;
  res = GetResidue ( chainID,resNo );
  if (res)
    res->GetAtomTable1 ( atomTable,NumberOfAtoms );
  else  {
    if (atomTable)  delete[] atomTable;
    atomTable     = NULL;
    NumberOfAtoms = 0;
  }
}

void CModel::GetAtomTable1 ( int chainNo, int resNo,
                             PPCAtom & atomTable,
                             int & NumberOfAtoms )  {
PCResidue res;
  res = GetResidue ( chainNo,resNo );
  if (res)
    res->GetAtomTable1 ( atomTable,NumberOfAtoms );
  else  {
    if (atomTable)  delete[] atomTable;
    atomTable     = NULL;
    NumberOfAtoms = 0;
  }
}



int  CModel::DeleteAtom ( const ChainID  chID,
                          int            seqNo,
                          const InsCode  insCode,
                          const AtomName aname,
                          const Element  elmnt,
                          const AltLoc   aloc
                        )  {
PCChain chn;
  chn = GetChain ( chID );  
  if (chn)
    return  chn->DeleteAtom ( seqNo,insCode,aname,elmnt,aloc );  
  return 0;
}

int  CModel::DeleteAtom ( const ChainID chID,    int seqNo,
                          const InsCode insCode, int   atomNo )  {
PCChain chn;
  chn = GetChain ( chID );  
  if (chn)  return chn->DeleteAtom ( seqNo,insCode,atomNo );
  return 0;
}

int  CModel::DeleteAtom ( const ChainID  chID,
                          int            resNo,
                          const AtomName aname,
                          const Element  elmnt,
                          const AltLoc   aloc )  {
PCChain chn;
  chn = GetChain ( chID );  
  if (chn)  return chn->DeleteAtom ( resNo,aname,elmnt,aloc );  
  return 0;
}

int  CModel::DeleteAtom ( const ChainID chID, int resNo, int atomNo ) {
PCChain chn;
  chn = GetChain ( chID );  
  if (chn)  return chn->DeleteAtom ( resNo,atomNo );  
  return 0;
}

int  CModel::DeleteAtom ( int chNo, int seqNo,
                          const InsCode  insCode,
                          const AtomName aname,
                          const Element  elmnt,
                          const AltLoc   aloc )  {
  if ((0<=chNo) && (chNo<nChains))  {
    if (Chain[chNo])
      return Chain[chNo]->DeleteAtom ( seqNo,insCode,aname,
                                       elmnt,aloc );  
  }
  return 0;
}

int CModel::DeleteAtom ( int chNo, int seqNo, const InsCode insCode,
                         int atomNo )  {
  if ((0<=chNo) && (chNo<nChains))  {
    if (Chain[chNo])
      return  Chain[chNo]->DeleteAtom ( seqNo,insCode,atomNo );  
  }
  return 0;
}

int CModel::DeleteAtom ( int chNo, int resNo,
                         const AtomName aname,
                         const Element  elmnt,
                         const AltLoc   aloc )  {
  if ((0<=chNo) && (chNo<nChains))  {
    if (Chain[chNo])
      return Chain[chNo]->DeleteAtom ( resNo,aname,elmnt,aloc );  
  }
  return 0;
}

int CModel::DeleteAtom ( int chNo, int resNo, int atomNo )  {
  if ((0<=chNo) && (chNo<nChains))  {
    if (Chain[chNo])
      return Chain[chNo]->DeleteAtom ( resNo,atomNo );  
  }
  return 0;
}

int CModel::DeleteAllAtoms ( const ChainID chID, int seqNo,
                             const InsCode insCode )  {
PCChain chn;
  chn = GetChain ( chID );  
  if (chn)  return chn->DeleteAllAtoms ( seqNo,insCode );
  return 0;
}

int CModel::DeleteAllAtoms ( const ChainID chID, int resNo )  {
PCChain chn;
  chn = GetChain ( chID );  
  if (chn)  return chn->DeleteAllAtoms ( resNo );
  return 0;
}

int CModel::DeleteAllAtoms ( const ChainID chID )  {
PCChain chn;
  chn = GetChain ( chID );  
  if (chn)  return chn->DeleteAllAtoms();
  return 0;
}

int CModel::DeleteAllAtoms ( int chNo, int seqNo,
                             const InsCode insCode )  {
  if ((0<=chNo) && (chNo<nChains))  {
    if (Chain[chNo])
      return Chain[chNo]->DeleteAllAtoms ( seqNo,insCode );  
  }
  return 0;
}

int CModel::DeleteAllAtoms ( int chNo, int resNo )  {
  if ((0<=chNo) && (chNo<nChains))  {
    if (Chain[chNo])
      return Chain[chNo]->DeleteAllAtoms ( resNo );  
  }
  return 0;
}

int CModel::DeleteAllAtoms ( int chNo )  {
  if ((0<=chNo) && (chNo<nChains))  {
    if (Chain[chNo])
      return Chain[chNo]->DeleteAllAtoms();  
  }
  return 0;
}

int CModel::DeleteAllAtoms()  {
int i,k;
  k = 0;
  for (i=0;i<nChains;i++)
    if (Chain[i])  k += Chain[i]->DeleteAllAtoms();
  return k;
}

int CModel::DeleteAltLocs()  {
//  This function leaves only alternative location with maximal
// occupancy, if those are equal or unspecified, the one with
// "least" alternative location indicator.
//  The function returns the number of deleted. All tables remain
// untrimmed, so that explicit trimming or calling FinishStructEdit()
// is required.
int i,n;

  n = 0;
  for (i=0;i<nChains;i++)
    if (Chain[i])  n += Chain[i]->DeleteAltLocs();

  return n;

}


int CModel::AddAtom ( const ChainID chID, int seqNo,
                      const InsCode insCode,
                      PCAtom atom )  {
PCChain chn;
  chn = GetChain ( chID );  
  if (chn)  return chn->AddAtom ( seqNo,insCode,atom );
  return 0;
}

int CModel::AddAtom ( const ChainID chID, int resNo, PCAtom  atom )  {
PCChain chn;
  chn = GetChain ( chID );  
  if (chn)  return chn->AddAtom ( resNo,atom );
  return 0;
}

int CModel::AddAtom ( int chNo, int seqNo, const InsCode insCode,
                      PCAtom atom )  {
  if ((0<=chNo) && (chNo<nChains))  {
    if (Chain[chNo])
      return Chain[chNo]->AddAtom ( seqNo,insCode,atom );  
  }
  return 0;
}

int CModel::AddAtom ( int chNo, int resNo, PCAtom atom )  {
  if ((0<=chNo) && (chNo<nChains))  {
    if (Chain[chNo])
      return Chain[chNo]->AddAtom ( resNo,atom );  
  }
  return 0;
}



void  CModel::GetAtomStatistics ( RSAtomStat AS )  {
  AS.Init();
  CalcAtomStatistics ( AS );
  AS.Finish();
}

void  CModel::CalcAtomStatistics ( RSAtomStat AS )  {
int i;
  for (i=0;i<nChains;i++)
    if (Chain[i])  Chain[i]->CalcAtomStatistics ( AS );
}



int  CModel::ConvertPDBString ( pstr PDBString ) {
//   Interprets PDB records DBREF, SEQADV, SEQRES, MODRES.
//   Returns zero if the line was converted, otherwise returns a
// non-negative value of Error_XXXX.
//   PDBString must be not shorter than 81 characters.
ChainID  chainID;
PCChain  chain;
PCHelix  helix;
PCTurn   turn;
PCLink   link;
PCCisPep cispep;
int      RC;

  //  pad input line with spaces, if necessary
  PadSpaces ( PDBString,80 );

  chainID[0] = char(0);
  chainID[1] = char(0);

  if (!strncmp(PDBString,"DBREF ",6))  {

    if (PDBString[12]!=' ')  chainID[0] = PDBString[12];
    chain = GetChainCreate ( chainID );
    return chain->ConvertDBREF ( PDBString );

  } else if (!strncmp(PDBString,"SEQADV",6))  {

    if (PDBString[16]!=' ')  chainID[0] = PDBString[16];
    chain = GetChainCreate ( chainID );
    return chain->ConvertSEQADV ( PDBString );

  } else if (!strncmp(PDBString,"SEQRES",6))  {

    if (PDBString[11]!=' ')  chainID[0] = PDBString[11];
    chain = GetChainCreate ( chainID );
    return chain->ConvertSEQRES ( PDBString );

  } else if (!strncmp(PDBString,"MODRES",6))  {

    if (PDBString[16]!=' ')  chainID[0] = PDBString[16];
    chain = GetChainCreate ( chainID );
    return chain->ConvertMODRES ( PDBString );

  } else if (!strncmp(PDBString,"HET   ",6))  {

    if (PDBString[12]!=' ')  chainID[0] = PDBString[12];
    chain = GetChainCreate ( chainID );
    return chain->ConvertHET ( PDBString );

  } else if (!strncmp(PDBString,"HETNAM",6))  {

    HetCompounds.ConvertHETNAM ( PDBString );
    return 0;

  } else if (!strncmp(PDBString,"HETSYN",6))  {

    HetCompounds.ConvertHETSYN ( PDBString );
    return 0;

  } else if (!strncmp(PDBString,"FORMUL",6))  {

    HetCompounds.ConvertFORMUL ( PDBString );
    return 0;

  } else if (!strncmp(PDBString,"HELIX ",6))  {

    helix = new CHelix();
    RC    = helix->ConvertPDBASCII(PDBString);
    if (RC==0)  Helices.AddData ( helix );
          else  delete helix;
    return RC;

  } else if (!strncmp(PDBString,"SHEET ",6))  {

    return Sheets.ConvertPDBASCII ( PDBString );

  } else if (!strncmp(PDBString,"TURN  ",6))  {

    turn = new CTurn();
    RC   = turn->ConvertPDBASCII(PDBString);
    if (RC==0)  Turns.AddData ( turn );
          else  delete turn;
    return RC;

  } else if (!strncmp(PDBString,"LINK  ",6))  {

    link = new CLink();
    RC   = link->ConvertPDBASCII(PDBString);
    if (RC==0)  Links.AddData ( link );
          else  delete link;
    return RC;

  } else if (!strncmp(PDBString,"CISPEP",6))  {

    cispep = new CCisPep();
    RC   = cispep->ConvertPDBASCII(PDBString);
    if (RC==0)  CisPeps.AddData ( cispep );
          else  delete cispep;
    return RC;

  } else
    return Error_WrongSection;

}


void  CModel::PDBASCIIDumpPS ( RCFile f )  {
int i;

  for (i=0;i<nChains;i++)
    if (Chain[i])
      Chain[i]->DBReference.PDBASCIIDump ( f );

  for (i=0;i<nChains;i++)
    if (Chain[i])
      Chain[i]->SeqAdv.PDBASCIIDump ( f );

  for (i=0;i<nChains;i++)
    if (Chain[i])
      Chain[i]->SeqRes.PDBASCIIDump ( f );

  for (i=0;i<nChains;i++)
    if (Chain[i])
      Chain[i]->ModRes.PDBASCIIDump ( f );

  for (i=0;i<nChains;i++)
    if (Chain[i])
      Chain[i]->Het.PDBASCIIDump ( f );

  HetCompounds.PDBASCIIDump ( f );
  Helices     .PDBASCIIDump ( f );
  Sheets      .PDBASCIIDump ( f );
  Turns       .PDBASCIIDump ( f );
  Links       .PDBASCIIDump ( f );

}

void  CModel::PDBASCIIDumpCP ( RCFile f )  {
  CisPeps.PDBASCIIDump ( f );
}

void  CModel::PDBASCIIDump ( RCFile f )  {
char    S[100];
int     i;
Boolean singleModel = True;

  if (manager)
    singleModel = (manager->nModels<=1);

  if (!singleModel)  {
    strcpy      ( S,"MODEL " );
    PadSpaces   ( S,80 );
    PutInteger  ( &(S[10]),serNum,4 );
    f.WriteLine ( S );
  }

  for (i=0;i<nChains;i++)
    if (Chain[i])
      Chain[i]->PDBASCIIAtomDump ( f );

  if (!singleModel)  {
    strcpy      ( S,"ENDMDL" );
    PadSpaces   ( S,80 );
    f.WriteLine ( S );
  }
    
}


void  CModel::MakeAtomCIF ( PCMMCIFData CIF )  {
int  i;
  for (i=0;i<nChains;i++)
    if (Chain[i])
      Chain[i]->MakeAtomCIF ( CIF );
}


void  CModel::MakePSCIF ( PCMMCIFData CIF )  {
int  i;

  for (i=0;i<nChains;i++)
    if (Chain[i])
      Chain[i]->DBReference.MakeCIF ( CIF );

  for (i=0;i<nChains;i++)
    if (Chain[i])
      Chain[i]->SeqAdv.MakeCIF ( CIF );

  for (i=0;i<nChains;i++)
    if (Chain[i])
      Chain[i]->SeqRes.MakeCIF ( CIF );

  for (i=0;i<nChains;i++)
    if (Chain[i])
      Chain[i]->ModRes.MakeCIF ( CIF );

  for (i=0;i<nChains;i++)
    if (Chain[i])
      Chain[i]->Het.MakeCIF ( CIF );

  HetCompounds.MakeCIF ( CIF );
  Helices     .MakeCIF ( CIF );
  Sheets      .MakeCIF ( CIF );
  Turns       .MakeCIF ( CIF );
  Links       .MakeCIF ( CIF );

}

int  CModel::GetCIFPSClass ( PCMMCIFData CIF, int ClassID )  {
CChainContainer  PSClass;
PCChainContainer Dest;
int              RC;
pstr             chainID;
PCChain          chain;
  PSClass.SetChain ( NULL );
  RC = PSClass.GetCIF ( CIF,ClassID );
  if (RC)  return RC;
  chainID = PSClass.Get1stChainID();
  while (chainID)  {
    chain   = GetChainCreate ( chainID );
    switch (ClassID)  {
      case ClassID_DBReference : Dest = &(chain->DBReference);  break;
      case ClassID_SeqAdv      : Dest = &(chain->SeqAdv);       break;
      case ClassID_ModRes      : Dest = &(chain->ModRes);       break;
      case ClassID_Het         : Dest = &(chain->Het);          break;
      default                  : Dest = NULL;
    }
    if (Dest)  {
      PSClass.MoveByChainID ( chainID,Dest );
      Dest->SetChain ( chain );
    } else
      printf ( " **** PROGRAM ERROR: wrong call to"
               " CModel::GetCIFPSClass(..)\n" );
    chainID = PSClass.Get1stChainID();
  }
  return 0;
}

int  CModel::GetCIF ( PCMMCIFData CIF )  {
CSeqRes  SeqRes;
int      RC;
PCChain  chain;

  RC = GetCIFPSClass ( CIF,ClassID_DBReference );
  if (RC)  return RC;

  RC = GetCIFPSClass ( CIF,ClassID_SeqAdv );
  if (RC)  return RC;

  RC = SeqRes.GetCIF ( CIF );
  while (!RC)  {
    chain = GetChainCreate ( SeqRes.chainID );
    chain->SeqRes.Copy ( &SeqRes );
    RC    = SeqRes.GetCIF ( CIF );
  }

  RC = GetCIFPSClass ( CIF,ClassID_ModRes );
  if (RC)  return RC;

  RC = GetCIFPSClass ( CIF,ClassID_Het );
  if (RC)  return RC;

  HetCompounds.GetCIF ( CIF );
  Helices     .GetCIF ( CIF,ClassID_Helix );
  Sheets      .GetCIF ( CIF );
  Turns       .GetCIF ( CIF,ClassID_Turn  );
  Links       .GetCIF ( CIF,ClassID_Link  );

  return RC;

}

pstr  CModel::GetEntryID()  {
  if (manager)  return manager->Title.idCode;
          else  return pstr("");
}

void  CModel::SetEntryID ( const IDCode idCode )  {
  if (manager)
    manager->SetEntryID ( idCode );
}

int   CModel::GetNumberOfAllAtoms()  {
  if (manager)  return manager->nAtoms;
          else  return 0;
}

int   CModel::GetSerNum()  {
  return serNum;
}

PCAtom * CModel::GetAllAtoms()  {
  if (manager)  return manager->Atom;
          else  return NULL;
}


pstr  CModel::GetModelID ( pstr modelID )  {
  modelID[0] = char(0);
  sprintf ( modelID,"/%i",serNum );
  return modelID;
}

int   CModel::GetNumberOfModels()  {
  if (manager)  return manager->nModels;
          else  return 0;
}


void  CModel::Copy ( PCModel Model )  {
//  modify both CModel::_copy and CModel::Copy methods simultaneously!
int i;

  FreeMemory();

  if (Model)  {

    serNum       = Model->serNum;
    nChains      = Model->nChains;
    nChainsAlloc = nChains;
    if (nChains>0)  {
      Chain = new PCChain[nChainsAlloc];
      for (i=0;i<nChains;i++)  {
        if (Model->Chain[i])  {
          Chain[i] = newCChain();
          Chain[i]->SetModel ( this );
          Chain[i]->Copy ( Model->Chain[i] );
        } else
          Chain[i] = NULL;
      } 
    }

    HetCompounds.Copy ( &(Model->HetCompounds) );
    Helices     .Copy ( &(Model->Helices)      );
    Sheets      .Copy ( &(Model->Sheets)       );
    Turns       .Copy ( &(Model->Turns)        );
    Links       .Copy ( &(Model->Links)        );

  }

}

void  CModel::_copy ( PCModel Model )  {
//  modify both CModel::_copy and CModel::Copy methods simultaneously!
int i;

  FreeMemory();

  if (Model)  {

    serNum       = Model->serNum;
    nChains      = Model->nChains;
    nChainsAlloc = nChains;
    if (nChains>0)  {
      Chain = new PCChain[nChainsAlloc];
      for (i=0;i<nChains;i++)  {
        if (Model->Chain[i])  {
          Chain[i] = newCChain();
          Chain[i]->SetModel ( this );
          Chain[i]->_copy ( Model->Chain[i] );
        } else
          Chain[i] = NULL;
      } 
    }

    HetCompounds.Copy ( &(Model->HetCompounds) );
    Helices     .Copy ( &(Model->Helices)      );
    Sheets      .Copy ( &(Model->Sheets)       );
    Turns       .Copy ( &(Model->Turns)        );
    Links       .Copy ( &(Model->Links)        );

  }

}


void  CModel::_copy ( PCModel Model, PPCAtom atom, int & atom_index ) {
//  modify both CModel::_copy and CModel::Copy methods simultaneously!
//
//  _copy(PCModel,PPCAtom,int&) does copy atoms into array 'atom'
// starting from position atom_index. 'atom' should be able to
// accept all new atoms - no checks on the length of 'atom'
// is being made. This function should not be used in applications.
int i;

  FreeMemory();

  if (Model)  {

    serNum       = Model->serNum;
    nChains      = Model->nChains;
    nChainsAlloc = nChains;
    if (nChains>0)  {
      Chain = new PCChain[nChainsAlloc];
      for (i=0;i<nChains;i++)  {
        if (Model->Chain[i])  {
          Chain[i] = newCChain();
          Chain[i]->SetModel ( this );
          Chain[i]->_copy ( Model->Chain[i],atom,atom_index );
        } else
          Chain[i] = NULL;
      } 
    }

    HetCompounds.Copy ( &(Model->HetCompounds) );
    Helices     .Copy ( &(Model->Helices)      );
    Sheets      .Copy ( &(Model->Sheets)       );
    Turns       .Copy ( &(Model->Turns)        );
    Links       .Copy ( &(Model->Links)        );

  }

}


int  CModel::AddChain ( PCChain chain )  {
//  modify both CModel::Copy methods simultaneously!
//
//  Copy(PCModel,PPCAtom,int&) copies atoms into array 'atom'
// starting from position atom_index. 'atom' should be able to
// accept all new atoms - no checks on the length of 'atom'
// is being made. This function should not be used in applications.
PCModel  model1;
int      i;

  for (i=0;i<nChains;i++)
    if (Chain[i]==chain)  return -i;  // this chain is already there

  if (chain)  {

    // get space for new chain
    ExpandChainArray ( nChains );

    if (chain->GetCoordHierarchy())  {
      // The chain is associated with a coordinate hierarchy. It should
      // remain there, therefore we physically copy all its residues
      // and atoms.
      Chain[nChains] = newCChain();
      Chain[nChains]->SetModel ( this );
      if (manager)  {
        // get space for new atoms
        manager->AddAtomArray ( chain->GetNumberOfAtoms(True) );
        Chain[nChains]->_copy ( chain,manager->Atom,manager->nAtoms );
      } else  {
        for (i=0;i<chain->nResidues;i++)
          Chain[nChains]->AddResidue ( chain->Residue[i] );
      }
    } else  {
      // The chain is not associated with a coordinate hierarchy. Such
      // unregistered objects are simply taken over, i.e. moved into
      // the new destination (model).
      Chain[nChains] = chain;
      // remove chain from its model:
      model1 = chain->GetModel();
      if (model1)
        for (i=0;i<model1->nChains;i++)
          if (model1->Chain[i]==chain)  {
            model1->Chain[i] = NULL;
            break;
          }
      Chain[nChains]->SetModel ( this );
      if (manager)
        Chain[nChains]->CheckInAtoms();
    }

    nChains++;

  }

  return nChains;

}


void  CModel::MoveChain ( PCChain & m_chain, PPCAtom m_atom,
                          PPCAtom  atom, int & atom_index,
                          int  chain_ext )  {
//   MoveChain(..) adds chain m_chain on the top Chain array.
// The pointer on chain is then set to NULL (m_chain=NULL).
// If chain_ext is greater than 0, the moved chain will be
// forcefully renamed; the new name is composed as the previous
// one + underscore + chain_ext (e.g. A_1). If thus generated
// name duplicates any of existing chain IDs, or if chain_ext
// was set to 0 and there is a duplication of chain IDs, the
// name is again modified as above, with the extension number
// generated automatically (this may result in IDs like
// A_1_10).
//   m_atom must give pointer to the Atom array, from which
// the atoms belonging to m_chain, are moved to Atom array
// given by 'atom', starting from poisition 'atom_index'.
// 'atom_index' is then automatically updated to the next
// free position in 'atom'.
//   Note1: the moved atoms will occupy a continuous range
// in 'atom' array; no checks on whether the corresponding
// cells are occupied or not, are performed.
//   Note2: the 'atom_index' is numbered from 0 on, i.e.
// it is equal to atom[atom_index]->index-1; atom[]->index
// is assigned automatically.
ChainID   chainID;
int       i,j,k,Ok;
PPCChain  Chain1;
PCResidue crRes;

  if (!m_chain)  return;

  // modify chain ID with the extension given
  if (chain_ext>0)
        sprintf ( chainID,"%s_%i",m_chain->chainID,chain_ext );
  else  strcpy  ( chainID,m_chain->chainID );

  // Choose the chain ID. If a chain with such ID is
  // already present in the model, it will be assigned
  // a new ID 'ID_n', where 'ID' stands for the original
  // chain ID and 'n' is the minimum (integer) number
  // chosen such that 'name_n' represents a new chain ID
  // (in the model).
  k = 0;
  do {
    Ok = True;
    for (i=0;(i<nChains) && (Ok);i++)
      if (Chain[i])
        if (!strcmp(chainID,Chain[i]->chainID))  Ok = False;
    if (!Ok)  {
      k++;
      if (chain_ext>0)
            sprintf ( chainID,"%s_%i_%i",m_chain->chainID,
                                         chain_ext,k );
      else  sprintf ( chainID,"%s_%i",m_chain->chainID,k );
    }
  } while (!Ok);

  // add chain on the top of Chain array.
  strcpy ( m_chain->chainID,chainID );
  if (nChains>=nChainsAlloc)  {
    nChainsAlloc = nChains+10;
    Chain1 = new PCChain[nChainsAlloc];
    k = 0;
    for (i=0;i<nChains;i++)
      if (Chain[i])  Chain1[k++] = Chain[i];
    for (i=k;i<nChainsAlloc;i++)
      Chain1[i] = NULL;
    if (Chain)  delete[] Chain;
    Chain = Chain1;
  }
  Chain[nChains] = m_chain;
  Chain[nChains]->SetModel ( this );
  nChains++;

  // Move all atoms of the chain. While residues belong
  // atoms belong to the chain's manager class. Therefore
  // they should be moved from one manager to another.
  for (i=0;i<m_chain->nResidues;i++)  {
    crRes = m_chain->Residue[i];
    if (crRes)
      for (j=0;j<crRes->nAtoms;j++)
        if (crRes->atom[j])  {
          k = crRes->atom[j]->index-1;
          atom[atom_index] = m_atom[k];
          atom[atom_index]->index = atom_index+1;
          atom_index++;
          m_atom[k] = NULL;  // moved!
        }
  }

  m_chain = NULL;  // moved!

}

void CModel::GetAIndexRange ( int & i1, int & i2 )  {
PCChain   chain;
PCResidue res;
int       ic,ir,ia;
  i1 = MaxInt4;
  i2 = MinInt4;
  for (ic=0;ic<nChains;ic++)  {
    chain = Chain[ic];
    if (chain)  {
      for (ir=0;ir<chain->nResidues;ir++)  {
        res = chain->Residue[ir];
        if (res)  {
          for (ia=0;ia<res->nAtoms;ia++)
            if (res->atom[ia])  {
              if (res->atom[ia]->index<i1)  i1 = res->atom[ia]->index;
              if (res->atom[ia]->index>i2)  i2 = res->atom[ia]->index;
            }
        }
      }
    }
  }
  
}


void  CModel::MaskAtoms ( PCMask Mask )  {
int i;
  for (i=0;i<nChains;i++)
    if (Chain[i])  Chain[i]->MaskAtoms ( Mask );
}

void  CModel::MaskResidues ( PCMask Mask )  {
int i;
  for (i=0;i<nChains;i++)
    if (Chain[i])  Chain[i]->MaskResidues ( Mask );
}

void  CModel::MaskChains ( PCMask Mask )  {
int i;
  for (i=0;i<nChains;i++)
    if (Chain[i])  Chain[i]->SetMask ( Mask );
}

void  CModel::UnmaskAtoms ( PCMask Mask )  {
int i;
  for (i=0;i<nChains;i++)
    if (Chain[i])  Chain[i]->UnmaskAtoms ( Mask );
}

void  CModel::UnmaskResidues ( PCMask Mask )  {
int i;
  for (i=0;i<nChains;i++)
    if (Chain[i])  Chain[i]->UnmaskResidues ( Mask );
}

void  CModel::UnmaskChains ( PCMask Mask )  {
int i;
  for (i=0;i<nChains;i++)
    if (Chain[i])  Chain[i]->RemoveMask ( Mask );
}


// ------ Getting Secondary Structure Elements

int  CModel::GetNumberOfHelices()  {
  return  Helices.Length();
}

int  CModel::GetNumberOfSheets()  {
  return  Sheets.nSheets;
}

PCHelix  CModel::GetHelix ( int serialNum )  {
  return (PCHelix)Helices.GetContainerClass ( serialNum-1 );
}

void  CModel::GetSheetID ( int serialNum, SheetID sheetID )  {
  if ((1<=serialNum) && (serialNum<=Sheets.nSheets))  {
    if (Sheets.Sheet[serialNum-1])  {
      strcpy ( sheetID,Sheets.Sheet[serialNum-1]->sheetID );
      return;
    }
  }
  sheetID[0] = char(0);
}

PCSheet CModel::GetSheet ( int serialNum )  {
  if ((1<=serialNum) && (serialNum<=Sheets.nSheets))
        return  Sheets.Sheet[serialNum-1];
  else  return  NULL;
}

PCSheet CModel::GetSheet ( const SheetID sheetID )  {
int i;
  for (i=0;i<Sheets.nSheets;i++)
    if (Sheets.Sheet[i])  {
      if (!strcmp(Sheets.Sheet[i]->sheetID,sheetID))
        return Sheets.Sheet[i];
    }
  return NULL;
}

int  CModel::GetNumberOfStrands ( int sheetSerNum )  {
  if ((1<=sheetSerNum) && (sheetSerNum<=Sheets.nSheets))  {
    if (Sheets.Sheet[sheetSerNum-1])
      return  Sheets.Sheet[sheetSerNum-1]->nStrands;
  }
  return 0;
}

int  CModel::GetNumberOfStrands ( const SheetID sheetID )  {
int i;
  for (i=0;i<Sheets.nSheets;i++)
    if (Sheets.Sheet[i])  {
      if (!strcmp(Sheets.Sheet[i]->sheetID,sheetID))
        return Sheets.Sheet[i]->nStrands;
    }
  return 0;
}

PCStrand CModel::GetStrand ( int sheetSerNum, int strandSerNum )  {
PCSheet Sheet;
  if ((1<=sheetSerNum) && (sheetSerNum<=Sheets.nSheets))  {
    Sheet = Sheets.Sheet[sheetSerNum-1];
    if (Sheet)  {
      if ((1<=strandSerNum) && (strandSerNum<=Sheet->nStrands))
      return  Sheet->Strand[strandSerNum-1];
    }
  }
  return NULL;
}

PCStrand CModel::GetStrand ( const SheetID sheetID,
                             int strandSerNum )  {
int     i;
PCSheet Sheet;
  for (i=0;i<Sheets.nSheets;i++)
    if (Sheets.Sheet[i])  {
      if (!strcmp(Sheets.Sheet[i]->sheetID,sheetID))  {
        Sheet = Sheets.Sheet[i];
        if (Sheet)  {
          if ((1<=strandSerNum) && (strandSerNum<=Sheet->nStrands))
            return  Sheet->Strand[strandSerNum-1];
        }
      }
    }
  return NULL;
}

void  CModel::RemoveSecStructure()  {
  Helices.FreeContainer();
  Sheets .FreeMemory   ();
  Turns  .FreeContainer();
}

void  CModel::RemoveHetInfo()  {
  HetCompounds.FreeMemory();
}



int  CModel::GetNumberOfLinks()  {
  return  Links.Length();
}

PCLink  CModel::GetLink ( int serialNum )  {
  return (PCLink)Links.GetContainerClass ( serialNum-1 );
}

void  CModel::RemoveLinks()  {
  Links.FreeContainer();
}

void  CModel::AddLink ( PCLink Link )  {
  Links.AddData ( Link );
}



int  CModel::GetNumberOfCisPeps()  {
  return  CisPeps.Length();
}

PCCisPep CModel::GetCisPep ( int CisPepNum )  {
  return (PCCisPep)CisPeps.GetContainerClass ( CisPepNum-1 );
}

void  CModel::RemoveCisPeps()  {
  CisPeps.FreeContainer();
}

void  CModel::AddCisPep ( PCCisPep CisPep )  {
  CisPeps.AddData ( CisPep );
}


void  CModel::ApplyTransform ( mat44 & TMatrix )  {
// transforms all coordinates by multiplying with matrix TMatrix
int i;
  for (i=0;i<nChains;i++)
    if (Chain[i])  Chain[i]->ApplyTransform ( TMatrix );
}

Boolean CModel::isInSelection ( int selHnd )  {
PCMask  Mask;
  if (manager)  {
    Mask = PCMMDBFile(manager)->GetSelMask ( selHnd );
    if (Mask)  return CheckMask ( Mask );
  }
  return False;
}



// -------  user-defined data handlers

int  CModel::PutUDData ( int UDDhandle, int iudd )  {
  if (UDDhandle & UDRF_MODEL)
        return  CUDData::putUDData ( UDDhandle,iudd );
  else  return  UDDATA_WrongUDRType;
}

int  CModel::PutUDData ( int UDDhandle, realtype rudd )  {
  if (UDDhandle & UDRF_MODEL)
        return  CUDData::putUDData ( UDDhandle,rudd );
  else  return  UDDATA_WrongUDRType;
}

int  CModel::PutUDData ( int UDDhandle, cpstr sudd )  {
  if (UDDhandle & UDRF_MODEL)
        return  CUDData::putUDData ( UDDhandle,sudd );
  else  return  UDDATA_WrongUDRType;
}

int  CModel::GetUDData ( int UDDhandle, int & iudd )  {
  if (UDDhandle & UDRF_MODEL)
        return  CUDData::getUDData ( UDDhandle,iudd );
  else  return  UDDATA_WrongUDRType;
}

int  CModel::GetUDData ( int UDDhandle, realtype & rudd )  {
  if (UDDhandle & UDRF_MODEL)
        return  CUDData::getUDData ( UDDhandle,rudd );
  else  return  UDDATA_WrongUDRType;
}

int  CModel::GetUDData ( int UDDhandle, pstr sudd, int maxLen )  {
  if (UDDhandle & UDRF_MODEL)
        return  CUDData::getUDData ( UDDhandle,sudd,maxLen );
  else  return  UDDATA_WrongUDRType;
}

int  CModel::GetUDData ( int UDDhandle, pstr & sudd )  {
  if (UDDhandle & UDRF_MODEL)
        return  CUDData::getUDData ( UDDhandle,sudd );
  else  return  UDDATA_WrongUDRType;
}


// -------  calculation of Secondary Structure


int CModel::CalcSecStructure ( Boolean flagBulge, int aminoSelHnd )  {
// This function is contributed by Liz Potterton, University of York
//------------------------------------------------------------------
// Define a secondary structure type of each amino acid residue in the 
// structure.  
// Procedure:
// Find all amino acids
// Find all pairs of amino acids which have inter-Ca distance  < 10.0A
// Test for hydrogen bonds between the main chain N and O of the close
// residues and store the information in the hbonds matrix
// Analyse the info in hbonds matrix to assign secondary structure to
// secstr vector
PPCResidue Res;
PPCAtom    Ca;
PCChain    chain;
PSContact  contact;
imatrix    hbonds;
PPCAtom *  hbond_atoms;
int        nres, ncontacts;
int        ir1,ir2, irdif;
int        i,j,k,l;

  // 1a. Get protein residues from selection handle

 if (aminoSelHnd>=0) {

   manager->GetSelIndex(aminoSelHnd,Res,nres);
//   printf ( " nres    %3i " ,nres   );
   if (nres<=0)  return  SSERC_noResidues;

 } else {

    //  1b. Get all protein residues

    nres = 0;
    for (i=0;i<nChains;i++)
      if (Chain[i])
        nres += Chain[i]->nResidues;

    if (nres<=0)  return  SSERC_noResidues;

    Res  = new PCResidue[nres];
    nres = 0;
    for (i=0;i<nChains;i++)  {
      chain = Chain[i];
      if (chain)  {
        k = chain->nResidues;
        for (j=0;j<k;j++)
          Res[nres++] = chain->Residue[j];
      }
    }
  

    if (nres<=0)  {
      delete[]  Res;
      return  SSERC_noResidues;
    }
 
 }

  //  2. Get C-alphas of all aminoacids

  Ca = new PCAtom[nres];
  k  = 0;
  for (i=0;i<nres;i++)
    if (Res[i])  {
      if (aminoSelHnd>=0 || Res[i]->isAminoacid())  {
        Ca[i] = Res[i]->GetAtom("CA", " C", "*");
        k++;
      } else
        Ca[i] = NULL;
      Res[i]->SSE = SSE_None;
    } else
      Ca[i] = NULL;

  if (k<=0)  {
    delete[] Res;
    delete[] Ca;
    return   SSERC_noAminoacids;
  }


  //  3. Find all close Calphas - i.e. find the contacts between
  //     the two equivalent sets of Ca atoms

  contact   = NULL;
  ncontacts = 0;
  manager->SeekContacts ( Ca,nres, Ca,nres, 2.0,10.0, 2,
                          contact,ncontacts,0 );
  if (ncontacts<=0)  {
    delete[] Res;
    delete[] Ca;
    if (contact)  delete[] contact;
    return  SSERC_noSSE;
  }


  //  4. Get and initialize memory for analysing the SSE

  GetMatrixMemory ( hbonds,nres,3,0,0 );
  hbond_atoms = new PPCAtom[nres];
  for (i=0;i<nres;i++)  {
    hbond_atoms[i] = new PCAtom[6];
    for (j=0;j<6;j++) hbond_atoms[i][j] = NULL;
    for (j=0;j<3;j++) hbonds     [i][j] = 0;
  }


  //  5.  Loop over all close (in space) residues - excluding those
  //      that are close in sequence

  for (i=0;i<ncontacts;i++)  {
    ir1   = contact[i].id2;
    ir2   = contact[i].id1;
    irdif = ir1 - ir2;
    if (irdif>2)  {
      //  test if there is donor Hbond from residue ir1
      if (Res[ir1]->isMainchainHBond(Res[ir2]))  {
        k = 0;
        while ((hbonds[ir1][k]!=0) && (k<2))  k++;
        hbonds     [ir1][k]   = -irdif;
	hbond_atoms[ir1][k]   = Res[ir1]->GetAtom ( "N" );
	hbond_atoms[ir1][k+3] = Res[ir2]->GetAtom ( "O" );
      }
      //  test if there is donor Hbond from residue ir2
      if (Res[ir2]->isMainchainHBond(Res[ir1]))  {        
	k = 0;
        while ((hbonds[ir2][k]!=0) && (k<2))  k++;
        hbonds     [ir2][k]   = irdif;
	hbond_atoms[ir2][k]   = Res[ir2]->GetAtom ( "N" );
	hbond_atoms[ir2][k+3] = Res[ir1]->GetAtom ( "O" );
      }
    }
  }

  //  6. Assign the turns - if there is bifurcated bond then the 4-turn
  //     takes precedence - read the paper to make sense of this

  for (i=0;i<nres;i++)  { 
    k = 0;
    while ((k<=2) && (hbonds[i][k]!=0))  {
      if (hbonds[i][k]==-5)  {
	Res[i-1]->SSE = SSE_5Turn;
	Res[i-2]->SSE = SSE_5Turn;
	Res[i-3]->SSE = SSE_5Turn;
	Res[i-4]->SSE = SSE_5Turn;
      }
      if (hbonds[i][k]==-3)  {
	Res[i-1]->SSE = SSE_3Turn;
	Res[i-2]->SSE = SSE_3Turn;
      }
      k++;
    }
  }
  for (i=0;i<nres;i++)  {
    k = 0;
    while ((k<=2) && (hbonds[i][k]!=0))  {
      if (hbonds[i][k]==-4)  {
        Res[i-1]->SSE = SSE_4Turn;
        Res[i-2]->SSE = SSE_4Turn;
        Res[i-3]->SSE = SSE_4Turn;
      }
      k++;
    }
  }


  //  7. Look for consecutive 4-turns which make alpha helix

  for (i=1;i<nres-3;i++) {
    if (((Res[i  ]->SSE==SSE_Helix) || (Res[i  ]->SSE==SSE_4Turn)) && 
        ((Res[i+1]->SSE==SSE_Helix) || (Res[i+1]->SSE==SSE_4Turn)) &&
        ((Res[i+2]->SSE==SSE_Helix) || (Res[i+2]->SSE==SSE_4Turn)) &&
        ((Res[i+3]->SSE==SSE_Helix) || (Res[i+3]->SSE==SSE_4Turn)))
      for (j=i;j<=i+3;j++)  Res[j]->SSE = SSE_Helix;
  }

  for (i=0;i<nres;i++)  {

    k = 0;
    while ((k<=2) && (hbonds[i][k]!=0))  {

      irdif = hbonds[i][k];
      // Test for 'close' hbond 
      j = i + irdif;
      l = 0;
      while ((l<=2) && (hbonds[j][l]!=0))  {
        // Antiparallel strands
        if (hbonds[j][l]==-irdif)  {
          Res[i]->SSE = SSE_Strand;
          Res[j]->SSE = SSE_Strand;
        }
        // Parallel strand
        if (hbonds[j][l]==-irdif-2)  {
          Res[i-1]->SSE = SSE_Strand;
          Res[j  ]->SSE = SSE_Strand;
        }
        // Parallel beta bulge
        if (hbonds[j][l]==-irdif-3)  {
          if (flagBulge) {
            if (Res[i-1]->SSE==SSE_None)  Res[i-1]->SSE = SSE_Bulge;
            if (Res[i-2]->SSE==SSE_None)  Res[i-2]->SSE = SSE_Bulge;
            if (Res[j  ]->SSE==SSE_None)  Res[j  ]->SSE = SSE_Bulge;
          } else  {
            if (Res[i-1]->SSE==SSE_None)  Res[i-1]->SSE = SSE_Strand;
            if (Res[i-2]->SSE==SSE_None)  Res[i-2]->SSE = SSE_Strand;
            if (Res[j  ]->SSE==SSE_None)  Res[j  ]->SSE = SSE_Strand;
          }
        }
        l++;
      }
      // Test for 'wide' hbond
      j = i + hbonds[i][k] + 2;
      if (j<nres)  {
        l = 0;
        while ((l<=2) && (hbonds[j][l]!=0))  {
          // Antiaprallel strands
          if (hbonds[j][l]==-irdif-4)  {
            Res[i-1]->SSE = SSE_Strand;
            Res[j-1]->SSE = SSE_Strand;
          }
          // Parallel strands
          if (hbonds[j][l]==-irdif-2)  {
            Res[i  ]->SSE = SSE_Strand;
	    Res[j-1]->SSE = SSE_Strand;
          }
          l++;
        }
      }

      // test for anti-parallel B-bulge between 'close' hbonds
      j = i + hbonds[i][k] - 1;
      if (j>=0)  {
        l = 0;
        while ((l<=2) && (hbonds[j][l]!=0))  {
          if (hbonds[j][l]==-irdif+1)  {
            if (flagBulge)  {
	      if (Res[i  ]->SSE==SSE_None)  Res[i  ]->SSE = SSE_Bulge;
	      if (Res[j+1]->SSE==SSE_None)  Res[j+1]->SSE = SSE_Bulge;
	      if (Res[j  ]->SSE==SSE_None)  Res[j  ]->SSE = SSE_Bulge;
            } else  {
              if (Res[i  ]->SSE==SSE_None)  Res[i  ]->SSE = SSE_Strand;
              if (Res[j+1]->SSE==SSE_None)  Res[j+1]->SSE = SSE_Strand;
              if (Res[j  ]->SSE==SSE_None)  Res[j  ]->SSE = SSE_Strand;
            } 
          }
          l++;
        }
      }

      // test for anti-parallel B-bulge between 'wide' hbonds
      j = i + hbonds[i][k] + 3;
      if (j<nres)  {
        l = 0;
        while ((l<=2) && (hbonds[j][l]!=0))  {
          if ((hbonds[j][l]==-irdif+5) && (i>0))  {
            if (flagBulge)  {
              if (Res[i-1]->SSE==SSE_None)  Res[i-1]->SSE = SSE_Bulge;
              if (Res[j-1]->SSE==SSE_None)  Res[j-1]->SSE = SSE_Bulge;
              if (Res[j-2]->SSE==SSE_None)  Res[j-2]->SSE = SSE_Bulge;
            } else  {
              if (Res[i-1]->SSE==SSE_None)  Res[i-1]->SSE = SSE_Strand;
              if (Res[j-1]->SSE==SSE_None)  Res[j-1]->SSE = SSE_Strand;
              if (Res[j-2]->SSE==SSE_None)  Res[j-2]->SSE = SSE_Strand;
            }
          } else if (hbonds[j][l]==-irdif-3)  {
            // and bulge in parallel strand
	    if (flagBulge)  {
              if (Res[i  ]->SSE==SSE_None)  Res[i  ]->SSE = SSE_Bulge;
              if (Res[j-1]->SSE==SSE_None)  Res[j-1]->SSE = SSE_Bulge;
              if (Res[j-2]->SSE==SSE_None)  Res[j-2]->SSE = SSE_Bulge;
            }
            else {
              if (Res[i  ]->SSE==SSE_None)  Res[i  ]->SSE = SSE_Strand;
              if (Res[j-1]->SSE==SSE_None)  Res[j-1]->SSE = SSE_Strand;
              if (Res[j-2]->SSE==SSE_None)  Res[j-2]->SSE = SSE_Strand;
            }
          }
          l++;
        }
      }
      k++;

    } // Finish looping over Hbonds for residue (k loop)

  }  // Finish looping over residues ( i loop)


  //  8. Free memory

  if (hbond_atoms)  {
    for (i=0;i<nres;i++)
      if (hbond_atoms[i])  delete[] hbond_atoms[i];
    delete[] hbond_atoms;
  }
  FreeMatrixMemory ( hbonds,nres,0,0 );
  if (contact) delete[] contact;
  if (Res && aminoSelHnd<0) delete[] Res;
  if (Ca)      delete[] Ca;

  return  SSERC_Ok;
 
}


// -------  streaming

void  CModel::write ( RCFile f )  {
int  i,k;
byte Version=2;

  f.WriteByte ( &Version );

  CProModel::write ( f );
  
  f.WriteInt ( &serNum  );
  f.WriteInt ( &nChains );

  for (i=0;i<nChains;i++)  {
    if (Chain[i])  k = 1;
             else  k = 0;
    f.WriteInt ( &k );
    if (Chain[i]) Chain[i]->write ( f );
  }

  HetCompounds.write ( f );
  Helices     .write ( f );
  Sheets      .write ( f );
  Turns       .write ( f );
  Links       .write ( f );

}

void  CModel::read ( RCFile f )  {
int  i,k;
byte Version;

  FreeMemory();

  f.ReadByte ( &Version );

  CProModel::read ( f );

  f.ReadInt ( &serNum  );
  f.ReadInt ( &nChains );
  nChainsAlloc = nChains;
  if (nChains>0)  {
    Chain = new PCChain[nChainsAlloc];
    for (i=0;i<nChains;i++)  {
      f.ReadInt ( &k );
      if (k)  {
        Chain[i] = newCChain();
        Chain[i]->SetModel ( this );
        Chain[i]->read ( f );
      }
    } 
  }

  HetCompounds.read ( f );
  Helices     .read ( f );
  Sheets      .read ( f );
  Turns       .read ( f );
  if (Version>1)
    Links     .read ( f );

}

MakeFactoryFunctions(CModel)


