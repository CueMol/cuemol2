//  $Id: mmdb_title.cpp,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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
//  **** Module  :  MMDB_Title  <implementation>
//       ~~~~~~~~~
//  **** Project :  MacroMolecular Data Base (MMDB)
//       ~~~~~~~~~ 
//  **** Classes :  CTitleContainer  (container for title classes)
//       ~~~~~~~~~  CObsLine
//                  CTitleLine
//                  CCaveat
//                  CCompound
//                  CSource
//                  CKeyWords
//                  CExpData
//                  CAuthor
//                  CRevData
//                  CSupersede
//                  CJournal
//                  CRemark
//                  CBiomolecule
//                  CMMDBTitle  ( MMDB title section )
//
//  (C) E. Krissinel 2000-2009
//
//  =================================================================
//

#ifndef  __STRING_H
#include <string.h>
#endif

#ifndef  __STDLIB_H
#include <stdlib.h>
#endif

#ifndef  __MMDB_Title__
#include "mmdb_title.h"
#endif

#ifndef  __MMDB_CIFDefs__
#include "mmdb_cifdefs.h"
#endif


#ifdef __CYGWIN__
char *strcasestr(const char *p1, const char *p2)
{
  // XXX
  return strstr(p1, p2);
}
#else
#ifdef _MVS
char *strcasestr(const char *p1, const char *p2)
{
  char sbuf[256];
  strncpy(sbuf, p1, sizeof sbuf);
  _strupr(sbuf);
  return strstr(sbuf, p2);
}
#endif
#endif

//  ==============  CTitleContainer  ====================

PCContainerClass CTitleContainer::MakeContainerClass ( int ClassID )  {
  switch (ClassID)  {
    default :
    case ClassID_Template  : return
                         CClassContainer::MakeContainerClass(ClassID);
    case ClassID_ObsLine   : return new CObsLine  ();      
    case ClassID_CAVEAT    : return new CCaveat   ();      
    case ClassID_TitleLine : return new CTitleLine();     
    case ClassID_Compound  : return new CCompound ();      
    case ClassID_Source    : return new CSource   ();
    case ClassID_ExpData   : return new CExpData  ();
    case ClassID_Author    : return new CAuthor   ();
    case ClassID_RevData   : return new CRevData  ();
    case ClassID_Supersede : return new CSupersede();
    case ClassID_Journal   : return new CJournal  ();
    case ClassID_Remark    : return new CRemark   ();
  }
}

MakeStreamFunctions(CTitleContainer)


//  ================  CObsLine  ===================

CObsLine::CObsLine() : CContainerClass()  {
  InitObsLine();
}

CObsLine::CObsLine ( cpstr S ) : CContainerClass()  {
  InitObsLine();
  ConvertPDBASCII ( S );
}

CObsLine::CObsLine ( RPCStream Object ) : CContainerClass(Object)  {
  InitObsLine();
}

CObsLine::~CObsLine() {}

void  CObsLine::InitObsLine()  {
int i;
  strcpy ( repDate,"DD-MMM-YYYY" );
  strcpy ( idCode, "----" );
  for (i=0;i<8;i++)
    strcpy ( rIdCode[i],"    " );
}

void  CObsLine::PDBASCIIDump ( pstr S, int N )  {
//  makes the ASCII PDB OBSLTE line number N
//  from the class' data
int i;
  if (N==0)  strcpy  ( S,"OBSLTE    " );
       else  sprintf ( S,"OBSLTE  %2i",N+1 );
  PadSpaces ( S,80 );
  Date11to9 ( repDate,&(S[11]) );
  strncpy   ( &(S[21]),idCode,4 );
  for (i=0;i<8;i++)
    strncpy ( &(S[31+5*i]),rIdCode[i],4 );
}

void  CObsLine::MakeCIF ( PCMMCIFData CIF, int N )  {
PCMMCIFLoop Loop;
int         RC,i,j;
char        DateCIF[20];
  RC = CIF->AddLoop ( CIFCAT_OBSLTE,Loop );
  if (RC!=CIFRC_Ok)  {
    // the category was (re)created, provide tags
    Loop->AddLoopTag ( CIFTAG_ID             );
    Loop->AddLoopTag ( CIFTAG_DATE           );
    Loop->AddLoopTag ( CIFTAG_REPLACE_PDB_ID );
    Loop->AddLoopTag ( CIFTAG_PDB_ID         );
  }
  Date11toCIF ( repDate,DateCIF );
  for (i=0;i<8;i++)  {
    j = 0;
    while (rIdCode[i][j] && (rIdCode[i][j]==' '))  j++;
    if (rIdCode[i][j])  {
      Loop->AddString ( pstr("OBSLTE") );
      Loop->AddString ( DateCIF    );
      Loop->AddString ( idCode     );
      Loop->AddString ( rIdCode[i] );
    }
  }
}

int CObsLine::ConvertPDBASCII ( cpstr S )  {
int i;
  Date9to11 ( &(S[11]),repDate );
  strncpy   ( idCode,&(S[21]),4 );
  idCode[4] = char(0);
  for (i=0;i<8;i++)  {
    strncpy ( rIdCode[i],&(S[31+i*5]),4 );
    rIdCode[i][4] = char(0);
  }
  return 0;
}

void  CObsLine::GetCIF ( PCMMCIFData CIF, int & Signal )  {
PCMMCIFLoop Loop;
int         i,RC;
pstr        F,FDate,FID;
char        DateCIF [20];
char        DateCIF0[20];
IDCode      idCode1;
  Loop = CIF->GetLoop ( CIFCAT_OBSLTE );
  if (!Loop)  {
    Signal = -1;  // signal to finish processing of this structure
    return;
  }
  i = 0;
  do  {
    F = Loop->GetString ( CIFTAG_ID,Signal,RC );
    if (RC)  {
      if (i==0)  Signal = -1;
      return;
    }
    if (F)  {
      if (!strcmp(F,"OBSLTE"))  {
        FDate = Loop->GetString ( CIFTAG_DATE,Signal,RC );
        if ((!RC) && FDate)
              strncpy ( DateCIF,FDate,15 );
        else  strcpy  ( DateCIF,"YYYY-MMM-DD" );
        FID = Loop->GetString ( CIFTAG_REPLACE_PDB_ID,Signal,RC );
        if ((!RC) && FID)
              strncpy ( idCode1,FID,sizeof(IDCode)-1 );
        else  idCode1[0] = char(0);
        if (i==0)  {
          DateCIFto11 ( DateCIF,repDate );
          DateCIF[11] = char(0);
          strcpy ( idCode  ,idCode1 );
          strcpy ( DateCIF0,DateCIF );
        } else if ((strcmp(DateCIF0,DateCIF)) ||
                   (strcmp(idCode,idCode1)))
          return;
        FID = Loop->GetString ( CIFTAG_PDB_ID,Signal,RC );
        if ((!RC) && FID)
             strncpy ( rIdCode[i],FID,sizeof(IDCode)-1 );
        else rIdCode[i][0] = char(0);
        Loop->DeleteField ( CIFTAG_ID            ,Signal );
        Loop->DeleteField ( CIFTAG_DATE          ,Signal );
        Loop->DeleteField ( CIFTAG_REPLACE_PDB_ID,Signal );
        Loop->DeleteField ( CIFTAG_PDB_ID        ,Signal );
        i++;
      } 
    }
    Signal++;
  } while (i<8);
}

void  CObsLine::Copy ( PCContainerClass ObsLine )  {
int i;
  strcpy ( repDate,PCObsLine(ObsLine)->repDate );
  strcpy ( idCode ,PCObsLine(ObsLine)->idCode  );
  for (i=0;i<8;i++)
    strcpy ( rIdCode[i],PCObsLine(ObsLine)->rIdCode[i] );
}
    
void  CObsLine::write ( RCFile f )  {
int  i;
byte Version=1;
 f.WriteByte    ( &Version      );
 f.WriteTerLine ( repDate,False );
 f.WriteTerLine ( idCode ,False );
 for (i=0;i<8;i++)
   f.WriteTerLine ( rIdCode[i],False );
}

void  CObsLine::read  ( RCFile f ) {
int  i;
byte Version;
 f.ReadByte    ( &Version      );
 f.ReadTerLine ( repDate,False );
 f.ReadTerLine ( idCode ,False );
 for (i=0;i<8;i++)
   f.ReadTerLine ( rIdCode[i],False );
}

MakeStreamFunctions(CObsLine)


//  ===================  CTitleLine  ======================

CTitleLine::CTitleLine() : CContString()  {
  InitTitleLine();
}

CTitleLine::CTitleLine ( cpstr S ) : CContString()  {
  InitTitleLine();
  ConvertPDBASCII ( S );
}

CTitleLine::CTitleLine ( RPCStream Object ) : CContString(Object)  {
  InitTitleLine();
}

CTitleLine::~CTitleLine() {
}

void  CTitleLine::InitTitleLine()  {
  CreateCopy ( CIFCategory,CIFCAT_STRUCT );
  CreateCopy ( CIFTag,     CIFTAG_TITLE  );
}

int  CTitleLine::ConvertPDBASCII ( cpstr S )  {
  if (strlen(S)>10)
       CreateCopy ( Line,&(S[10]) );
  else CreateCopy ( Line,pstr(" ") );
  return 0;
}

void  CTitleLine::PDBASCIIDump ( pstr S, int N )  {
  if (N==0)  strcpy  ( S,"TITLE     " );
       else  sprintf ( S,"TITLE   %2i",N+1 );
  strcat ( S,Line );
}

void  CTitleLine::write ( RCFile f )  {
byte Version=1;
  f.WriteByte ( &Version );
  CContString::write ( f );
}

void  CTitleLine::read ( RCFile f )  {
byte Version;
  f.ReadByte ( &Version );
  CContString::read ( f );
}

MakeStreamFunctions(CTitleLine)



//  ===================  CCaveat  ======================

CCaveat::CCaveat() : CContString()  {
  InitCaveat();
}

CCaveat::CCaveat ( cpstr S ) : CContString()  {
  InitCaveat();
  ConvertPDBASCII ( S );
}

CCaveat::CCaveat ( RPCStream Object ) : CContString(Object)  {
  InitCaveat();
}

CCaveat::~CCaveat() {}

void  CCaveat::InitCaveat()  {
  strcpy ( idCode,"----" );
  CreateCopy ( CIFCategory,CIFCAT_DATABASE_PDB_CAVEAT );
  CreateCopy ( CIFTag     ,CIFTAG_TEXT                );
}

int  CCaveat::ConvertPDBASCII ( cpstr S )  {
  if (strlen(S)>12)  {
    strncpy ( idCode,&(S[11]),4 );
    idCode[4] = char(0);
    if (strlen(S)>19) 
          CreateCopy ( Line,&(S[19])  );
    else  CreateCopy ( Line,pstr(" ") );
  } else
    CreateCopy ( Line,pstr(" ") );
  return 0;
}

void  CCaveat::PDBASCIIDump ( pstr S, int N )  {
  if (N==0)  strcpy  ( S,"CAVEAT     " );
       else  sprintf ( S,"CAVEAT  %2i ",N+1 );
  strcat ( S,idCode );
  strcat ( S,"    " );
  strcat ( S,Line   );
}

void  CCaveat::MakeCIF ( PCMMCIFData CIF, int N )  {
char S[500];
  CIF->PutString ( idCode,CIFCAT_DATABASE_PDB_CAVEAT,CIFTAG_ID,False );
  strcpy  ( S,"\n" );
  strncat ( S,Line,sizeof(S)-2 );
  S[sizeof(S)-1] = char(0);
  CIF->PutString ( S,CIFCAT_DATABASE_PDB_CAVEAT,CIFTAG_TEXT,(N!=0) );
}

void  CCaveat::GetCIF ( PCMMCIFData CIF, int & Signal )  {
pstr F;
int RC;
  F = CIF->GetString ( CIFCAT_DATABASE_PDB_CAVEAT,CIFTAG_ID,RC );
  if ((!RC) && F)  {
    strncpy ( idCode,F,sizeof(IDCode) );
    idCode[sizeof(IDCode)-1] = char(0);
  }
  CContString::GetCIF ( CIF,Signal );
  if (Signal<0)
    CIF->DeleteField ( CIFCAT_DATABASE_PDB_CAVEAT,CIFTAG_ID );
}

void  CCaveat::Copy ( PCContainerClass Caveat )  {
  strcpy ( idCode,PCCaveat(Caveat)->idCode );
  CContString::Copy ( Caveat );
}

void  CCaveat::write ( RCFile f )  {
byte Version=1;
  f.WriteByte    ( &Version     );
  f.WriteTerLine ( idCode,False );
  CContString::write ( f );
}

void  CCaveat::read ( RCFile f )  {
byte Version;
  f.ReadByte    ( &Version     );
  f.ReadTerLine ( idCode,False );
  CContString::read ( f );
}

MakeStreamFunctions(CCaveat)



//  ===================  CCompound  ======================

CCompound::CCompound() : CContString()  {
  InitCompound();
}

CCompound::CCompound ( cpstr S ) : CContString()  {
  InitCompound();
  ConvertPDBASCII ( S );
}

CCompound::CCompound ( RPCStream Object ) : CContString(Object)  {
  InitCompound();
}

CCompound::~CCompound() {}

void  CCompound::InitCompound()  {
  CreateCopy ( CIFCategory,CIFCAT_STRUCT         );
  CreateCopy ( CIFTag     ,CIFTAG_NDB_DESCRIPTOR );
}

int  CCompound::ConvertPDBASCII ( cpstr S )  {
  if (strlen(S)>10)
       CreateCopy ( Line,&(S[10])  );
  else CreateCopy ( Line,pstr(" ") );
  return 0;
}

void  CCompound::PDBASCIIDump ( pstr S, int N )  {
  if (N==0)  strcpy  ( S,"COMPND    " );
       else  sprintf ( S,"COMPND  %2i",N+1 );
  strcat ( S,Line );
}

void  CCompound::write ( RCFile f )  {
byte Version=1;
  f.WriteByte ( &Version );
  CContString::write ( f );
}

void  CCompound::read ( RCFile f )  {
byte Version;
  f.ReadByte ( &Version );
  CContString::read ( f );
}

MakeStreamFunctions(CCompound)



//  ===================  CSource  ======================

CSource::CSource() : CContString()  {
  InitSource();
}

CSource::CSource ( cpstr S ) : CContString()  {
  InitSource();
  ConvertPDBASCII ( S );
}

CSource::CSource ( RPCStream Object ) : CContString(Object)  {
  InitSource();
}

CSource::~CSource() {}

void  CSource::InitSource()  {
  CreateCopy ( CIFCategory,CIFCAT_STRUCT );
  CreateCopy ( CIFTag     ,CIFTAG_SOURCE );
}

int  CSource::ConvertPDBASCII ( cpstr S )  {
  if (strlen(S)>10)
       CreateCopy ( Line,&(S[10])  );
  else CreateCopy ( Line,pstr(" ") );
  return 0;
}

void  CSource::PDBASCIIDump ( pstr S, int N )  {
  if (N==0)  strcpy  ( S,"SOURCE    " );
       else  sprintf ( S,"SOURCE  %2i",N+1 );
  strcat ( S,Line );
}

void  CSource::write ( RCFile f )  {
byte Version=1;
  f.WriteByte ( &Version );
  CContString::write ( f );
}

void  CSource::read ( RCFile f )  {
byte Version;
  f.ReadByte ( &Version );
  CContString::read ( f );
}

MakeStreamFunctions(CSource)


//  ===================  CKeyWords  ======================

CKeyWords::CKeyWords() : CStream()  {
  Init();
}

CKeyWords::CKeyWords ( cpstr S ) : CStream()  {
  Init();
  ConvertPDBASCII ( S );
}

CKeyWords::CKeyWords ( RPCStream Object ) : CStream(Object)  {
  Init();
}

CKeyWords::~CKeyWords()  {
  Delete();
}

void  CKeyWords::Init()  {
  nKeyWords = 0;
  KeyWord   = NULL;
  Cont      = False;
}

void  CKeyWords::Delete()  {
int i;
  if (KeyWord)  {
    for (i=0;i<nKeyWords;i++)
      if (KeyWord[i])
        delete[] KeyWord[i];
    delete[] KeyWord;
  }
  nKeyWords = 0;
  KeyWord   = NULL;
  Cont      = False;
}

int  CKeyWords::ConvertPDBASCII ( cpstr S )  {
//  we anticipate that length of S is 80 characters
//  -- pad with spaces if necessary
char   L[85];
int    i,k,m;
pstr * KW;

  i = 10;  // scan PDB line from ith character

  k = nKeyWords;
  if (!Cont)  k++;  // 1st keyword does not continue from previous line
  m = 0;
  while (S[i] && (i<70))  {
    if (S[i]==',')  k++;  // count keywords
    if (S[i]!=' ')  m++;  // count non-spaces to see if the line is empty
    i++;
  }

  if (m==0)  return 0;    //  empty line

  KW = new pstr[k];
  if (KeyWord)  {
    for (i=0;i<nKeyWords;i++)
      KW[i] = KeyWord[i];
    delete[] KeyWord;
  }
  for (i=nKeyWords;i<k;i++)
    KW[i] = NULL;       // null new pointers
  KeyWord = KW;
  
  i = 10;
  if (Cont)  nKeyWords--;
  while (S[i] && (i<70))  {
    while ((S[i]==' ') && (i<70))  i++;  // skip leading spaces
    if (Cont)  {
      strcpy ( L," " );
      m = 1;
    } else
      m = 0;
    while (S[i] && (S[i]!=',') && (i<70))
      L[m++] = S[i++];
    m--;
    while ((m>0) && (L[m]==' '))  m--;  // remove padding spaces
    m++;
    L[m] = char(0);
    if (Cont)  CreateConcat ( KeyWord[nKeyWords],L );
         else  CreateCopy   ( KeyWord[nKeyWords],L );
    if (S[i]==',')  {
      i++;
      Cont = False;
    } else
      Cont = True;
    nKeyWords++;
  }

  return 0;

}

void  CKeyWords::PDBASCIIDump ( RCFile f )  {
int  N,i,k,m1,m2,ms;
char S[85];
char c;
  if (KeyWord)  {
    N = 0;
    i = 0;
    while (i<nKeyWords)  {  
      if (N==0)  strcpy  ( S,"KEYWDS    " );
           else  sprintf ( S,"KEYWDS  %2i ",N+1 );
      do  {
        while ((i<nKeyWords) && (!KeyWord[i]))  i++;
        if (i<nKeyWords) {
          m1 = 0;
          while (KeyWord[i][m1])  {
            while (KeyWord[i][m1]==' ')  m1++;
            m2 = m1;
            ms = -1;
            while ((KeyWord[i][m2]) && ((m2-m1)<58))  {
              if (KeyWord[i][m2]==' ')  ms = m2;
              m2++;
            }
            if ((ms<0) || ((m2-m1)<58))  ms = m2;
            c = KeyWord[i][ms];
            KeyWord[i][ms] = char(0);
            strcat ( S,&(KeyWord[i][m1]) );
            KeyWord[i][ms] = c;
            m1 = ms;
            if (c)  {
              PadSpaces   ( S,80 );
              f.WriteLine ( S );
              N++;
              sprintf ( S,"KEYWDS  %2i ",N+1 );
            }
          }
          i++;
          if (i<nKeyWords)  {
            k = strlen(S) + strlen(KeyWord[i]) + 2;
            if (i<nKeyWords)
              strcat ( S,", " );
          } else
            k = 80;
        } else
          k = 80;
      } while (k<70);
      PadSpaces   ( S,80 );
      f.WriteLine ( S );
      N++;
    }
  }
}

void  CKeyWords::MakeCIF ( PCMMCIFData CIF )  {
int  i,k;
char S[500];
  strcpy ( S,"\n" );
  for (i=0;i<nKeyWords;i++)
    if (KeyWord[i])  {
      k = strlen(KeyWord[i]);
      if (strlen(S)+k>70)  {
        CIF->PutString ( S,CIFCAT_STRUCT_KEYWORDS,CIFTAG_TEXT,True );
        if (k>sizeof(S))  {
          CIF->PutString ( KeyWord[i],CIFCAT_STRUCT_KEYWORDS,
                           CIFTAG_TEXT,True );
          k = 0;
        }
        strcpy ( S,"\n" );
      }
      if (k>0) {
        strcat ( S,KeyWord[i] );
        if (i<nKeyWords-1)  strcat ( S,", " );
      }
    }
  if (strlen(S)>1)
    CIF->PutString ( S,CIFCAT_STRUCT_KEYWORDS,CIFTAG_TEXT,True );
}

void  CKeyWords::GetCIF ( PCMMCIFData CIF )  {
pstr    F;
int     i,j,k;
Boolean NB;
char    c;
  Delete();
  F = CIF->GetString ( CIFCAT_STRUCT_KEYWORDS,CIFTAG_TEXT,i );
  k = 0;
  if ((!i) && F)  {
    i  = 0;
    NB = False;
    while (F[i])  {
      if (F[i]==',')  {
        nKeyWords++;
        NB = False;
      } else if (F[i]!=' ')
        NB = True;
      i++;
    }
    if (NB)  nKeyWords++;
    KeyWord = new pstr[nKeyWords];
    i = 0;
    while (F[i] && (k<nKeyWords))  {
      while ((F[i]==' ') || (F[i]=='\n') || (F[i]=='\r'))  i++;
      j = i;
      while (F[i] && (F[i]!=','))  i++;
      c    = F[i];
      F[i] = char(0);
      KeyWord[k] = NULL;
      CreateCopy ( KeyWord[k],&(F[j]) );
      j = 0;
      while (KeyWord[k][j])  {
        if ((KeyWord[k][j]=='\n') || (KeyWord[k][j]=='\r'))
          KeyWord[k][j] = ' ';
        j++;
      }
      F[i] = c;
      k++;
      if (F[i])  i++;
    }
  }
  while (k<nKeyWords)  KeyWord[k++] = NULL;
  CIF->DeleteField ( CIFCAT_STRUCT_KEYWORDS,CIFTAG_TEXT );
}


void  CKeyWords::Copy ( PCKeyWords KeyWords )  {
int i;
  Delete();
  nKeyWords = KeyWords->nKeyWords;
  if (nKeyWords>0)  {
    KeyWord = new pstr[nKeyWords];
    for (i=0;i<nKeyWords;i++)  {
      KeyWord[i] = NULL;
      CreateCopy ( KeyWord[i],KeyWords->KeyWord[i] );
    }
  }
}

void  CKeyWords::write ( RCFile f )  {
int i;
byte Version=1;
  f.WriteByte ( &Version   );
  f.WriteInt  ( &nKeyWords );
  for (i=0;i<nKeyWords;i++)
    f.CreateWrite ( KeyWord[i] );  
}

void  CKeyWords::read ( RCFile f )  {
int  i;
byte Version;
  Delete();
  f.ReadByte ( &Version   );
  f.ReadInt  ( &nKeyWords );
  if (nKeyWords>0)  {
    KeyWord = new pstr[nKeyWords];
    for (i=0;i<nKeyWords;i++)  {
      KeyWord[i] = NULL;
      f.CreateRead ( KeyWord[i] );
    }
  }
}

MakeStreamFunctions(CKeyWords)


//  ===================  CExpData  ======================

CExpData::CExpData() : CContString()  {
  InitExpData();
}

CExpData::CExpData ( cpstr S ) : CContString()  {
  InitExpData();
  ConvertPDBASCII ( S );
}

CExpData::CExpData ( RPCStream Object ) : CContString(Object)  {
  InitExpData();
}

CExpData::~CExpData() {}

void  CExpData::InitExpData()  {
  CreateCopy ( CIFCategory,CIFCAT_EXPTL  );
  CreateCopy ( CIFTag     ,CIFTAG_METHOD );
}

int  CExpData::ConvertPDBASCII ( cpstr S )  {
  if (strlen(S)>10)
       CreateCopy ( Line,&(S[10])  );
  else CreateCopy ( Line,pstr(" ") );
  return 0;
}

void  CExpData::PDBASCIIDump ( pstr S, int N )  {
  if (N==0)  strcpy  ( S,"EXPDTA    " );
       else  sprintf ( S,"EXPDTA  %2i",N+1 );
  strcat ( S,Line );
}

void  CExpData::write ( RCFile f )  {
byte Version=1;
  f.WriteByte ( &Version );
  CContString::write ( f );
}

void  CExpData::read ( RCFile f )  {
byte Version;
  f.ReadByte ( &Version );
  CContString::read ( f );
}

MakeStreamFunctions(CExpData)



//  ===================  CAuthor  ======================

CAuthor::CAuthor() : CContString()  {
  InitAuthor();
}

CAuthor::CAuthor ( cpstr S ) : CContString()  {
  InitAuthor();
  ConvertPDBASCII ( S );
}

CAuthor::CAuthor ( RPCStream Object ) : CContString(Object)  {
  InitAuthor();
}

CAuthor::~CAuthor() {}

void  CAuthor::InitAuthor()  {
  CreateCopy ( CIFCategory,CIFCAT_AUDIT_AUTHOR );
  CreateCopy ( CIFTag     ,CIFTAG_NAME         );
}

int  CAuthor::ConvertPDBASCII ( cpstr S )  {
  if (strlen(S)>10)
       CreateCopy ( Line,&(S[10])  );
  else CreateCopy ( Line,pstr(" ") );
  return 0;
}

void  CAuthor::PDBASCIIDump ( pstr S, int N )  {
  if (N==0)  strcpy  ( S,"AUTHOR    " );
       else  sprintf ( S,"AUTHOR  %2i",N+1 );
  strcat ( S,Line );
}

void  CAuthor::write ( RCFile f )  {
byte Version=1;
  f.WriteByte ( &Version );
  CContString::write ( f );  
}

void  CAuthor::read ( RCFile f )  {
byte Version;
  f.ReadByte ( &Version );
  CContString::read ( f );  
}

MakeStreamFunctions(CAuthor)



//  ================  CRevData  ===================

CRevData::CRevData() : CContainerClass()  {
  InitRevData();
}

CRevData::CRevData ( cpstr S ) : CContainerClass()  {
  InitRevData();
  ConvertPDBASCII ( S );
}

CRevData::CRevData ( RPCStream Object ) : CContainerClass(Object)  {
  InitRevData();
}

CRevData::~CRevData() {}

void  CRevData::InitRevData()  {
int i;
  modNum  = 0;
  strcpy ( modDate,"DD-MMM-YYYY" ); 
  strcpy ( modId  , "----" );
  modType = -1;
  for (i=0;i<4;i++)
    strcpy ( record[i],"      " );
  Warning = 0;
}

void  CRevData::PDBASCIIDump ( pstr S, int N )  {
//  makes the ASCII PDB REVDATA line number N
//  from the class' data
int i;
  if (N==0)  sprintf ( S,"REVDAT %3i  " ,modNum     );
       else  sprintf ( S,"REVDAT %3i%2i",modNum,N+1 );
  i = strlen(S);
  while (i<80)
    S[i++] = ' ';
  S[i] = char(0);
  Date11to9 ( modDate,&(S[13]) );
  strncpy   ( &(S[23]),modId,5 );
  S[31] = char(modType+int('0'));
  for (i=0;i<4;i++)
    strncpy ( &(S[39+i*7]),record[i],6 );
}

void CRevData::MakeCIF ( PCMMCIFData CIF, int N )  {
PCMMCIFLoop Loop;
int         RC,i,j;
char        DateCIF[20];
  RC = CIF->AddLoop ( CIFCAT_DATABASE_PDB_REV,Loop );
  if ((RC!=CIFRC_Ok) || (N==0))  {
    // the category was (re)created, privide tags
    Loop->AddLoopTag ( CIFTAG_NUM                   );
    Loop->AddLoopTag ( CIFTAG_DATE                  );
    Loop->AddLoopTag ( CIFTAG_REPLACES              );
    Loop->AddLoopTag ( CIFTAG_MOD_TYPE              );
    Loop->AddLoopTag ( CIFTAG_RCSB_RECORD_REVISED_1 );
    Loop->AddLoopTag ( CIFTAG_RCSB_RECORD_REVISED_2 );
    Loop->AddLoopTag ( CIFTAG_RCSB_RECORD_REVISED_3 );
    Loop->AddLoopTag ( CIFTAG_RCSB_RECORD_REVISED_4 );
  }
  Date11toCIF ( modDate,DateCIF );
  Loop->AddInteger ( modNum  );
  Loop->AddString  ( DateCIF );
  Loop->AddString  ( modId   );
  Loop->AddInteger ( modType );
  for (i=0;i<4;i++)  {
    j = 0;
    while (record[i][j] && (record[i][j]==' '))  j++;
    if (record[i][j])  Loop->AddString ( record[i] );
                 else  Loop->AddString ( NULL      );
  }

}

void CRevData::GetCIF ( PCMMCIFData CIF, int & Signal )  {
PCMMCIFLoop Loop;
int         RC;
pstr        F;

  Loop = CIF->GetLoop ( CIFCAT_DATABASE_PDB_REV );
  if (!Loop)  {
    Signal = -1;
    return;
  }

  RC = Loop->GetInteger ( modNum,CIFTAG_NUM,Signal,True );
  if (RC==CIFRC_WrongIndex)  {
    Signal = -1;
    return;
  }
  if (RC==CIFRC_WrongFormat)  {
    sprintf ( CIFErrorLocation,"loop %s.%s row %i",
              CIFCAT_DATABASE_PDB_REV,CIFTAG_NUM,Signal );
    Signal = -Error_UnrecognizedInteger-1;
    return;
  }

  F = Loop->GetString ( CIFTAG_DATE,Signal,RC );
  if ((!RC) && F)  DateCIFto11 ( F,modDate );
  F = Loop->GetString ( CIFTAG_REPLACES,Signal,RC );
  if ((!RC) && F)  strcpy ( modId,F );
  RC = Loop->GetInteger ( modType,CIFTAG_MOD_TYPE,Signal,True );
  if (RC==CIFRC_WrongFormat)  {
    sprintf ( CIFErrorLocation,"loop %s.%s row %i",
              CIFCAT_DATABASE_PDB_REV,CIFTAG_MOD_TYPE,Signal );
    Signal = -Error_UnrecognizedInteger-1;
    return;
  }

  F = Loop->GetString ( CIFTAG_RCSB_RECORD_REVISED_1,Signal,RC );
  if ((!RC) && F)  strcpy ( record[0],F );
  F = Loop->GetString ( CIFTAG_RCSB_RECORD_REVISED_2,Signal,RC );
  if ((!RC) && F)  strcpy ( record[1],F );
  F = Loop->GetString ( CIFTAG_RCSB_RECORD_REVISED_3,Signal,RC );
  if ((!RC) && F)  strcpy ( record[2],F );
  F = Loop->GetString ( CIFTAG_RCSB_RECORD_REVISED_4,Signal,RC );
  if ((!RC) && F)  strcpy ( record[3],F );
  
  Loop->DeleteField ( CIFTAG_DATE                 ,Signal );
  Loop->DeleteField ( CIFTAG_REPLACES             ,Signal );
  Loop->DeleteField ( CIFTAG_RCSB_RECORD_REVISED_1,Signal );
  Loop->DeleteField ( CIFTAG_RCSB_RECORD_REVISED_2,Signal );
  Loop->DeleteField ( CIFTAG_RCSB_RECORD_REVISED_3,Signal );
  Loop->DeleteField ( CIFTAG_RCSB_RECORD_REVISED_4,Signal );

  Signal++;

}

int CRevData::ConvertPDBASCII ( cpstr S )  {
int  i;
pstr endptr;
char N[20];
  Warning = 0;
  strncpy   ( N,&(S[7]),3 );
  N[3]    = char(0);
  modNum  = mround(strtod(N,&endptr));
  if (endptr==N)  Warning |= REVDAT_WARN_MODNUM;
  Date9to11 ( &(S[13]),modDate );
  strncpy   ( modId,&(S[23]),5 );
  modId[5] = char(0);
  modType  = int(S[31]) - int('0');
  if (modType>9)  Warning |= REVDAT_WARN_MODTYPE;
  for (i=0;i<4;i++)  {
    strncpy ( record[i],&(S[39+i*7]),6 );
    record[i][6] = char(0);
  }
  return 0;
}

void  CRevData::Copy ( PCContainerClass RevData )  {
int i;
  modNum  = PCRevData(RevData)->modNum;
  modType = PCRevData(RevData)->modType;
  strcpy ( modDate,PCRevData(RevData)->modDate );
  strcpy ( modId  ,PCRevData(RevData)->modId   );
  for (i=0;i<4;i++)
    strcpy ( record[i],PCRevData(RevData)->record[i] );
}
    
void  CRevData::write ( RCFile f )  {
int  i;
byte Version=1;
  f.WriteByte  ( &Version );
  f.WriteInt   ( &modNum  );
  f.WriteInt   ( &modType );
  f.WriteWord  ( &Warning );
  f.WriteTerLine ( modDate,False );
  f.WriteTerLine ( modId  ,False );
  for (i=0;i<4;i++)
    f.WriteTerLine ( record[i],False );
}

void  CRevData::read  ( RCFile f ) {
int  i;
byte Version;
  f.ReadByte  ( &Version );
  f.ReadInt   ( &modNum  );
  f.ReadInt   ( &modType );
  f.ReadWord  ( &Warning );
  f.ReadTerLine ( modDate,False );
  f.ReadTerLine ( modId  ,False );
  for (i=0;i<4;i++)
    f.ReadTerLine ( record[i],False );
}

MakeStreamFunctions(CRevData)



//  ================  CSupersede  ===================

CSupersede::CSupersede() : CContainerClass()  {
  InitSupersede();
}

CSupersede::CSupersede ( cpstr S ) : CContainerClass()  {
  InitSupersede();
  ConvertPDBASCII ( S );
}

CSupersede::CSupersede ( RPCStream Object ) : CContainerClass(Object)  {
  InitSupersede();
}

CSupersede::~CSupersede() {}

void  CSupersede::InitSupersede()  {
int i;
  strcpy ( sprsdeDate,"DD-MMM-YYYY" );
  strcpy ( idCode, "----" );
  for (i=0;i<8;i++)
    strcpy ( sIdCode[i],"    " );
}

void  CSupersede::PDBASCIIDump ( pstr S, int N )  {
//  makes the ASCII PDB OBSLTE line number N
//  from the class' data
int i;
  if (N==0)  strcpy  ( S,"SPRSDE    " );
       else  sprintf ( S,"SPRSDE  %2i",N+1 );
  i = strlen(S);
  while (i<80)
    S[i++] = ' ';
  S[i] = char(0);
  if (N==0)  {
    Date11to9 ( sprsdeDate,&(S[11]) );
    strncpy   ( &(S[21]),idCode,4 );
  }
  for (i=0;i<8;i++)
    strncpy ( &(S[31+5*i]),sIdCode[i],4 );
}

void  CSupersede::MakeCIF ( PCMMCIFData CIF, int N )  {
PCMMCIFLoop Loop;
int         RC,i,j;
char        DateCIF[20];
  RC = CIF->AddLoop ( CIFCAT_SPRSDE,Loop );
  if (RC!=CIFRC_Ok)  {
    // the category was (re)created, privide tags
    Loop->AddLoopTag ( CIFTAG_ID             );
    Loop->AddLoopTag ( CIFTAG_DATE           );
    Loop->AddLoopTag ( CIFTAG_REPLACE_PDB_ID );
    Loop->AddLoopTag ( CIFTAG_PDB_ID         );
  }
  Date11toCIF ( sprsdeDate,DateCIF );
  for (i=0;i<8;i++)  {
    j = 0;
    while (sIdCode[i][j] && (sIdCode[i][j]==' '))  j++;
    if (sIdCode[i][j])  {
      Loop->AddString ( pstr("SPRSDE") );
      Loop->AddString ( DateCIF    );
      Loop->AddString ( idCode     );
      Loop->AddString ( sIdCode[i] );
    }
  }
}

int CSupersede::ConvertPDBASCII ( cpstr S )  {
int i;
  if (S[9]==' ')  {
    Date9to11 ( &(S[11]),sprsdeDate );
    strncpy   ( idCode,&(S[21]),4 );
    idCode[4] = char(0);
  }
  for (i=0;i<8;i++)  {
    strncpy ( sIdCode[i],&(S[31+i*5]),4 );
    sIdCode[i][4] = char(0);
  }
  return 0;
}

void  CSupersede::GetCIF ( PCMMCIFData CIF, int & Signal )  {
PCMMCIFLoop Loop;
int         i,RC;
pstr        F,FDate,FID;
char        DateCIF [20];
char        DateCIF0[20];
IDCode      idCode1;
  Loop = CIF->GetLoop ( CIFCAT_SPRSDE );
  if (!Loop)  {
    Signal = -1;  // signal to finish processing of this structure
    return;
  }
  i = 0;
  do  {
    F = Loop->GetString ( CIFTAG_ID,Signal,RC );
    if (RC)  {
      if (i==0)
        Signal = -1;
      return;
    }
    if (F)  {
      if (!strcmp(F,"SPRSDE"))  {
        FDate = Loop->GetString ( CIFTAG_DATE,Signal,RC );
        if ((!RC) && FDate)
              strncpy ( DateCIF,FDate,15 );
        else  strcpy  ( DateCIF,"YYYY-MMM-DD" );
        FID = Loop->GetString ( CIFTAG_REPLACE_PDB_ID,Signal,RC );
        if ((!RC) && FID)
              strncpy ( idCode1,FID,sizeof(IDCode)-1 );
        else  idCode1[0] = char(0);
        if (i==0)  {
          DateCIFto11 ( DateCIF,sprsdeDate );
          DateCIF[11] = char(0);
          strcpy ( idCode  ,idCode1 );
          strcpy ( DateCIF0,DateCIF );
        } else if ((strcmp(DateCIF0,DateCIF)) ||
                   (strcmp(idCode,idCode1)))
          return;
        FID = Loop->GetString ( CIFTAG_PDB_ID,Signal,RC );
        if ((!RC) && FID)
             strncpy ( sIdCode[i],FID,sizeof(IDCode)-1 );
        else sIdCode[i][0] = char(0);
        Loop->DeleteField ( CIFTAG_ID            ,Signal );
        Loop->DeleteField ( CIFTAG_DATE          ,Signal );
        Loop->DeleteField ( CIFTAG_REPLACE_PDB_ID,Signal );
        Loop->DeleteField ( CIFTAG_PDB_ID        ,Signal );
        i++;
      } 
    }
    Signal++;
  } while (i<8);
}

void  CSupersede::Copy ( PCContainerClass Supersede )  {
int i;
  strcpy ( sprsdeDate,PCSupersede(Supersede)->sprsdeDate );
  strcpy ( idCode    ,PCSupersede(Supersede)->idCode     );
  for (i=0;i<8;i++)
    strcpy ( sIdCode[i],PCSupersede(Supersede)->sIdCode[i] );
}
    
void  CSupersede::write ( RCFile f )  {
int  i;
byte Version=1;
  f.WriteByte  ( &Version );
  f.WriteTerLine ( sprsdeDate,False );
  f.WriteTerLine ( idCode    ,False );
  for (i=0;i<8;i++)
    f.WriteTerLine ( sIdCode[i],False );
}

void  CSupersede::read  ( RCFile f ) {
int  i;
byte Version;
  f.ReadByte  ( &Version );
  f.ReadTerLine ( sprsdeDate,False );
  f.ReadTerLine ( idCode    ,False );
  for (i=0;i<8;i++)
    f.ReadTerLine ( sIdCode[i],False );
}

MakeStreamFunctions(CSupersede)


//  ===================  CJournal  ======================

CJournal::CJournal() : CContString()  {
  InitJournal();
}

CJournal::CJournal ( cpstr S ) : CContString()  {
  InitJournal();
  ConvertPDBASCII ( S );
}

CJournal::CJournal ( RPCStream Object ) : CContString(Object)  {
  InitJournal();
}

CJournal::~CJournal() {}

void  CJournal::InitJournal()  {
  CreateCopy ( CIFCategory,CIFCAT_CITATION );
  CreateCopy ( CIFTag     ,CIFTAG_TEXT     );
}

int  CJournal::ConvertPDBASCII ( cpstr S )  {
  if (strlen(S)>10)
       CreateCopy ( Line,&(S[10]) );
  else CreateCopy ( Line,pstr(" ") );
  return 0;
}

void  CJournal::PDBASCIIDump ( pstr S, int N )  {
  strcpy ( S,"JRNL      " );
  strcat ( S,Line         );
}

void  CJournal::write ( RCFile f )  {
byte Version=1;
  f.WriteByte ( &Version );
  CContString::write ( f );
}

void  CJournal::read ( RCFile f )  {
byte Version;
  f.ReadByte ( &Version );
  CContString::read ( f );
}

MakeStreamFunctions(CJournal)



//  ===================  CRemark  ======================

CRemark::CRemark() : CContainerClass()  {
  InitRemark();
}

CRemark::CRemark ( cpstr S ) : CContainerClass()  {
  InitRemark();
  ConvertPDBASCII ( S );
}

CRemark::CRemark ( RPCStream Object ) : CContainerClass(Object)  {
  InitRemark();
}

CRemark::~CRemark() {
  if (Remark)  delete[] Remark;
}

void  CRemark::InitRemark()  {
  remarkNum = 0;
  Remark    = NULL;
}

int  CRemark::ConvertPDBASCII ( cpstr S )  {
int i;
  GetInteger ( remarkNum,&(S[7]),3 );
  if (remarkNum==MinInt4)  CreateCopy ( Remark,S );
  else if (strlen(S)>11)   CreateCopy ( Remark,&(S[11])  );
                     else  CreateCopy ( Remark,pstr(" ") );
  i = strlen(Remark)-1;
  while ((i>0) && (Remark[i]==' '))  i--;
  Remark[i+1] = char(0);
  return 0;
}

void  CRemark::PDBASCIIDump ( pstr S, int N )  {
  if (remarkNum==MinInt4)
    strcpy ( S,Remark );
  else  {
    strcpy     ( S,"REMARK" );
    PadSpaces  ( S,80 );
    PutInteger ( &(S[7]) ,remarkNum,3 );
    strncpy    ( &(S[11]),Remark,IMin(68,strlen(Remark)) ); 
  }
}

void  CRemark::MakeCIF ( PCMMCIFData CIF, int N )  {
PCMMCIFLoop Loop;
int         RC;
  RC = CIF->AddLoop ( CIFCAT_NDB_DATABASE_REMARK,Loop );
  if ((RC!=CIFRC_Ok) || (N==0))  {
    // the category was (re)created, privide tags
    Loop->AddLoopTag ( CIFTAG_ID   );
    Loop->AddLoopTag ( CIFTAG_TEXT );
  }
  if (remarkNum==MinInt4)  Loop->AddString  ( NULL      );
                     else  Loop->AddInteger ( remarkNum );
  Loop->AddString ( Remark );
}

void  CRemark::GetCIF ( PCMMCIFData CIF, int & Signal )  {
PCMMCIFLoop Loop;
int         RC;

  Loop = CIF->GetLoop ( CIFCAT_NDB_DATABASE_REMARK );
  if (!Loop)  {
    Signal = -1;
    return;
  }
  if (Signal>=Loop->GetLoopLength() )  {
    Signal = -1;
    return;
  }

  RC = Loop->GetInteger ( remarkNum,CIFTAG_ID,Signal,True );
  if (RC==CIFRC_WrongFormat)  {
    sprintf ( CIFErrorLocation,"loop %s.%s row %i",
              CIFCAT_NDB_DATABASE_REMARK,CIFTAG_ID,Signal );
    Signal = -Error_UnrecognizedInteger-1;
    return;
  } else if (RC)
    remarkNum = MinInt4;
  Loop->GetString ( Remark,CIFTAG_TEXT,Signal,True );

  Signal++;

}

void  CRemark::Copy ( PCContainerClass RemarkClass )  {
  remarkNum = PCRemark(RemarkClass)->remarkNum;
  CreateCopy ( Remark,PCRemark(RemarkClass)->Remark );
}

void  CRemark::write ( RCFile f )  {
byte Version=1;
  f.WriteByte   ( &Version   );
  f.WriteInt    ( &remarkNum );
  f.CreateWrite ( Remark     );
}

void  CRemark::read ( RCFile f )  {
byte Version;
  f.ReadByte   ( &Version   );
  f.ReadInt    ( &remarkNum );
  f.CreateRead ( Remark     );
}

MakeStreamFunctions(CRemark)


//  =================  CBiomolecule  =====================

#define  R350_ERRBIOMT     (-3)
#define  R350_ERROR        (-2)
#define  R350_END          (-1)
#define  R350_NONE           0
#define  R350_BIOMOLECULE    1
#define  R350_CHAINS         2
#define  R350_BIOMT          3

void getRemarkKey ( RPCRemark rem, int & lkey )  {
  if (rem)  {
    if (rem->remarkNum!=350)  lkey = R350_END;
    else if (rem->Remark)  {
      if (strcasestr(rem->Remark,"BIOMOLECULE:"))
        lkey = R350_BIOMOLECULE;
      else if (strcasestr(rem->Remark,"CHAINS:"))
        lkey = R350_CHAINS;
      else if (strcasestr(rem->Remark,"BIOMT1") ||
               strcasestr(rem->Remark,"BIOMT2") ||
               strcasestr(rem->Remark,"BIOMT3"))
        lkey = R350_BIOMT;
      else
        lkey = R350_NONE;
    }
  }
}

int lookupRemarks ( int & i, RPCRemark rem,
                    RCTitleContainer Remark )  {
int l,lkey;

  l    = Remark.Length();
  lkey = R350_NONE;
  while ((i<l) && (lkey==R350_NONE))  {
    getRemarkKey ( rem,lkey );
    if (lkey==R350_NONE)  {
      i++;
      rem = (PCRemark)Remark.GetContainerClass ( i );
    }
  }

  return lkey;

}



CBMApply::CBMApply() : CStream()  {
  InitBMApply();
}

CBMApply::CBMApply ( RPCStream Object ) : CStream ( Object )  {
  InitBMApply();
}

CBMApply::~CBMApply()  {
  FreeMemory();
}

void  CBMApply::InitBMApply()  {
  chain     = NULL;
  nChains   = 0;
  tm        = NULL;
  nMatrices = 0;
}

void  CBMApply::FreeMemory()  {
  if (chain)  delete[] chain;
  if (tm)     delete[] tm;
  chain     = NULL;
  nChains   = 0;
  tm        = NULL;
  nMatrices = 0;
}

int  CBMApply::addChains ( int & i, RPCRemark rem,
                           RCTitleContainer Remark )  {
PChainID ch1;
pstr     p;
int      l,lkey,nAdd,j;

  l    = Remark.Length();
  lkey = R350_NONE;

  while ((i<l) && (lkey==R350_NONE))  {

    p = strcasestr ( rem->Remark,"CHAINS:" );
    if (p)  p += 7;
    else  {
      p = rem->Remark;
      while (*p==' ')  p++;
      if ((p[1]!=',') && (p[1]!=' '))  p = NULL;
    }
 
    if (p)  {
      nAdd  = strlen(p)/2 + 3;
      ch1   = chain;
      chain = new ChainID[nChains+nAdd];
      for (j=0;j<nChains;j++)
        strcpy ( chain[j],ch1[j] );
      if (ch1)  delete[] ch1;

      while (*p)  {
        while ((*p==' ') || (*p==','))  p++;
        if (*p)  {
          if ((p[1]==',') || (p[1]==' ') || (p[1]==char(0)))  {
            chain[nChains][0] = *p;
            chain[nChains][1] = char(0);
            nChains++;
            p++;
          } else
            break;
        }
      }
    }

    do  {
      i++;
      if (i<l)  {
        rem = (PCRemark)Remark.GetContainerClass ( i );
        if (rem)  {
          if (rem->remarkNum!=350)  lkey = R350_END;
          else getRemarkKey ( rem,lkey );
        }
      } else
        lkey = R350_END;
    } while ((!rem) && (lkey==R350_NONE));

  }

  return lkey;

}

int getBIOMT ( RPCRemark rem, int biomtNo, mat44 & t,
               RCTitleContainer Remark, int & i )  {
char PN[20];
pstr p1,p2;
int  l,j,lkey;

  sprintf ( PN,"BIOMT%1i",biomtNo );
  p1 = strcasestr ( rem->Remark,PN );
  if (!p1)  return R350_ERRBIOMT;

  p1 += 6;
  while (*p1==' ')  p1++;
  while (*p1 && (*p1!=' '))  p1++;

  l = biomtNo - 1;
  t[l][0] = strtod ( p1,&p2 );
  if (p1==p2)  return R350_ERRBIOMT;
  t[l][1] = strtod ( p2,&p1 );
  if (p1==p2)  return R350_ERRBIOMT;
  t[l][2] = strtod ( p1,&p2 );
  if (p1==p2)  return R350_ERRBIOMT;
  t[l][3] = strtod ( p2,&p1 );
  if (p1==p2)  return R350_ERRBIOMT;

  if (biomtNo==3)  {
    for (j=0;j<3;j++)
      t[3][j] = 0.0;
    t[3][3] = 1.0;
  }

  l    = Remark.Length();
  lkey = R350_BIOMT;
  do  {
    i++;
    if (i<l)  {
      rem = (PCRemark)Remark.GetContainerClass ( i );
      if (rem)  {
        if (rem->remarkNum!=350)  lkey = R350_END;
                            else  getRemarkKey ( rem,lkey );
      }
    } else
      lkey = R350_END;
  } while ((lkey==R350_NONE) || ((!rem) && (lkey==R350_BIOMT)));

  return lkey;

}

int  CBMApply::addMatrices ( int & i, RPCRemark rem,
                             RCTitleContainer Remark )  {
pmat44 tm1;
int    l,lkey,nAdd,j,k1,k2,nAlloc;

  l      = Remark.Length();
  lkey   = R350_BIOMT;
  nAlloc = nMatrices;

  while ((i<l) && (lkey==R350_BIOMT))  {

    if (nMatrices>=nAlloc)  {
      nAlloc = nMatrices + 10;
      tm1    = tm;
      tm     = new mat44[nAlloc];
      for (j=0;j<nMatrices;j++)
        for (k1=0;k1<4;k1++)
          for (k2=0;k2<4;k2++)
            tm[j][k1][k2] = tm1[j][k1][k2];
      if (tm1)  delete[] tm1;
    }

    lkey = getBIOMT ( rem,1,tm[nMatrices],Remark,i );
    if (lkey==R350_BIOMT)
      lkey = getBIOMT ( rem,2,tm[nMatrices],Remark,i );
    if (lkey==R350_BIOMT)
      lkey = getBIOMT ( rem,3,tm[nMatrices],Remark,i );
    nMatrices++;

  }

  return lkey;

}

void  CBMApply::Copy ( PCBMApply BMA )  {
// if BMA is NULL, then empties the class
int  i,j,k;

  FreeMemory();

  if (BMA)  {

    nChains = BMA->nChains;
    if (nChains>0)  {
      chain = new ChainID[nChains];
      for (i=0;i<nChains;i++)
        strcpy ( chain[i],BMA->chain[i] );
    }

    nMatrices = BMA->nMatrices;
    if (nMatrices>0)  {
      tm = new mat44[nMatrices];
      for (i=0;i<nMatrices;i++)
        for (j=0;j<4;j++)
          for (k=0;k<4;k++)
            tm[i][j][k] = BMA->tm[i][j][k];
     }
  }

}

void  CBMApply::write ( RCFile f )  {
int i,j,k;
  f.WriteInt ( &nChains );
  for (i=0;i<nChains;i++)
    f.WriteTerLine ( chain[i],False );
  f.WriteInt ( &nMatrices );
  for (i=0;i<nMatrices;i++)
    for (j=0;j<3;j++)
      for (k=0;k<4;k++)
        f.WriteReal ( &(tm[i][j][k]) );
}

void  CBMApply::read ( RCFile f )  {
int i,j,k;
  FreeMemory();
  f.ReadInt ( &nChains );
  if (nChains>0)  {
    chain = new ChainID[nChains];
    for (i=0;i<nChains;i++)
      f.ReadTerLine ( chain[i],False );
  }
  f.ReadInt ( &nMatrices );
  if (nMatrices>0)  {
    tm = new mat44[nMatrices];
    for (i=0;i<nMatrices;i++)  {
      for (j=0;j<3;j++)  {
        for (k=0;k<4;k++)
          f.ReadReal ( &(tm[i][j][k]) );
        tm[i][3][j] = 0.0;
      }
      tm[i][3][3] = 1.0;
    }
  }
}

MakeStreamFunctions(CBMApply)


CBiomolecule::CBiomolecule() : CStream()  {
  InitBiomolecule();
}

CBiomolecule::CBiomolecule ( RPCStream Object )
            : CStream ( Object )  {
  InitBiomolecule();
}

CBiomolecule::~CBiomolecule()  {
  FreeMemory();
}

void  CBiomolecule::InitBiomolecule()  {
  BMApply = NULL;
  nBMAs   = 0;
}

void  CBiomolecule::FreeMemory()  {
int i;
  if (BMApply)  {
    for (i=0;i<nBMAs;i++)
      if (BMApply[i])  delete BMApply[i];
    delete[] BMApply;
    BMApply = NULL;
  }
  nBMAs = 0;
}


PCBMApply CBiomolecule::addBMApply()  {
PPCBMApply BMA1;
int        i;
  BMA1 = BMApply;
  BMApply = new PCBMApply[nBMAs+1];
  for (i=0;i<nBMAs;i++)
    BMApply[i] = BMA1[i];
  if (BMA1)  delete[] BMA1;
  BMApply[nBMAs] = new CBMApply();
  nBMAs++;
  return BMApply[nBMAs-1];
}

int CBiomolecule::Size()  {
int i,k;
  k = 0;
  for (i=0;i<nBMAs;i++)
    k += BMApply[i]->nChains*BMApply[i]->nMatrices;
  return k;
}

Boolean CBiomolecule::checkComposition ( PChainID chID, ivector occ,
                                         ivector  wocc, int n )  {
// chID[n] is list of chain IDs
// occ[n]  is list of chain occurencies
// wocc[n] is working array
int     i,j,k,k1;
Boolean cmp;

  for (i=0;i<n;i++)
    wocc[i] = 0;

  cmp = True;

  for (i=0;(i<nBMAs) && cmp;i++)
    for (j=0;(j<BMApply[i]->nChains) && cmp;j++)  {
      k1 = -1;
      for (k=0;(k<n) && (k1<0);k++)
        if (!strcmp(chID[k],BMApply[i]->chain[j]))
          k1 = k;
      if (k1<0)  cmp = False;  // chain not found in the list
           else  wocc[k1] += BMApply[i]->nMatrices;
    }

  for (i=0;(i<n) && cmp;i++)
    if (occ[i]!=wocc[i])  cmp = False;

  return cmp;

}

void  CBiomolecule::Copy ( PCBiomolecule B )  {
// if B is NULL, then empties the class
int  i,j,k;

  FreeMemory();

  if (B)  {

    nBMAs = B->nBMAs;
    if (nBMAs>0)  {
      BMApply = new PCBMApply[nBMAs];
      for (i=0;i<nBMAs;i++)
        if (B->BMApply[i])  {
          BMApply[i] = new CBMApply();
          BMApply[i]->Copy ( B->BMApply[i] );
        } else
          BMApply[i] = NULL;
    }

  }

}

void  CBiomolecule::write ( RCFile f )  {
int i;
  f.WriteInt ( &nBMAs );
  for (i=0;i<nBMAs;i++)
    StreamWrite ( f,BMApply[i] );
}

void  CBiomolecule::read ( RCFile f )  {
int i;
  FreeMemory();
  f.ReadInt ( &nBMAs );
  if (nBMAs>0)  {
    BMApply = new PCBMApply[nBMAs];
    for (i=0;i<nBMAs;i++)  {
      BMApply[i] = NULL;
      StreamRead ( f,BMApply[i] );
    }
  }
}

MakeStreamFunctions(CBiomolecule)


//  =====================   CMMDBFTitle   =======================

CMMDBTitle::CMMDBTitle() : CStream() {
  Init();
}

CMMDBTitle::CMMDBTitle ( RPCStream Object )  : CStream(Object)  {
  Init();
}

void  CMMDBTitle::Init()  {
  
  //  Header data
  classification = NULL;
  depDate[0]     = char(0);
  idCode [0]     = char(0);
  resolution     = -2.0;
  col73          = False;

  Biomolecule    = NULL;
  nBiomolecules  = 0;

}

CMMDBTitle::~CMMDBTitle() {
  FreeMemory ( False );
}

void  CMMDBTitle::FreeMemory ( Boolean keepBiomolecules )  {

  if (classification)  delete[] classification;
  classification = NULL;
  resolution     = -2.0;

  ObsData  .FreeContainer();
  Title    .FreeContainer();
  CAVEAT   .FreeContainer();
  Compound .FreeContainer();
  Source   .FreeContainer();
  KeyWords .Delete       ();
  ExpData  .FreeContainer();
  Author   .FreeContainer();
  RevData  .FreeContainer();
  Supersede.FreeContainer();
  Journal  .FreeContainer();
  Remark   .FreeContainer();

  col73 = False;

  if (!keepBiomolecules)
    FreeBiomolecules();

}

void  CMMDBTitle::FreeBiomolecules()  {
int  i;
  if (Biomolecule)  {
    for (i=0;i<nBiomolecules;i++)
      if (Biomolecule[i])  delete Biomolecule[i];
    delete[] Biomolecule;
    Biomolecule = NULL;
  }
  nBiomolecules = 0;
}


void  CMMDBTitle::SetHeader ( cpstr Classification,
                              cpstr DepDate,
                              cpstr IDCode )  {
// fills the PDB file header
  CreateCopy ( classification ,Classification  );
  strncpy    ( depDate,DepDate,sizeof(depDate) );
  strncpy    ( idCode ,IDCode ,sizeof(idCode)  );
  depDate[sizeof(depDate)-1] = char(0);
  idCode [sizeof(idCode) -1] = char(0);
}
    
int  CMMDBTitle::ConvertPDBString ( pstr PDBString ) {
// Interprets the ASCII PDB line belonging to the title section
// and fills the corresponding fields.
//   Returns zero if the line was converted, otherwise returns a
// non-negative value of Error_XXXX.
//   PDBString must be not shorter than 81 characters.
int              i;
char             c;
PCContainerClass ContainerClass;

  //  pad input line with spaces, if necessary
  PadSpaces ( PDBString,80 );

  if (!strncmp(PDBString,"HEADER",6))  {

    i = 49;
    while ((i>=10) && (PDBString[i]==' '))  i--;
    i++;
    c = PDBString[i];
    PDBString[i] = char(0);
    CreateCopy ( classification,&(PDBString[10]) );
    PDBString[i] = c;

    Date9to11 ( &(PDBString[50]),depDate );

    strncpy ( idCode,&(PDBString[62]),4 );
    idCode[4] = char(0);

  } else if (!strncmp(PDBString,"OBSLTE",6))  {

    ContainerClass = new CObsLine(PDBString);
    ObsData.AddData ( ContainerClass );
    
  } else if (!strncmp(PDBString,"TITLE ",6))  {

    ContainerClass = new CTitleLine(PDBString);
    Title.AddData ( ContainerClass );

  } else if (!strncmp(PDBString,"CAVEAT",6))  {

    ContainerClass = new CCaveat(PDBString);
    CAVEAT.AddData ( ContainerClass );
    
  } else if (!strncmp(PDBString,"COMPND",6))  {

    ContainerClass = new CCompound(PDBString);
    Compound.AddData ( ContainerClass );

  } else if (!strncmp(PDBString,"SOURCE",6))  {

    ContainerClass = new CSource(PDBString);
    Source.AddData ( ContainerClass );
  
  } else if (!strncmp(PDBString,"KEYWDS",6))  {
   
    KeyWords.ConvertPDBASCII ( PDBString );

  } else if (!strncmp(PDBString,"EXPDTA",6))  {

    ContainerClass = new CExpData(PDBString);
    ExpData.AddData ( ContainerClass );
  
  } else if (!strncmp(PDBString,"AUTHOR",6))  {

    ContainerClass = new CAuthor(PDBString);
    Author.AddData ( ContainerClass );
  
  } else if (!strncmp(PDBString,"REVDAT",6))  {

    ContainerClass = new CRevData(PDBString);
    RevData.AddData ( ContainerClass );
  
  } else if (!strncmp(PDBString,"SPRSDE",6))  {

    ContainerClass = new CSupersede(PDBString);
    Supersede.AddData ( ContainerClass );
  
  } else if (!strncmp(PDBString,"JRNL  ",6))  {

    ContainerClass = new CJournal(PDBString);
    Journal.AddData ( ContainerClass );
  
  } else if (!strncmp(PDBString,"REMARK",6))  {

    ContainerClass = new CRemark(PDBString);
    Remark.AddData ( ContainerClass );
  
  } else
    return Error_WrongSection;

  //  check for ID code in columns 73-80
  if ((!col73) && (!strncasecmp(idCode,&(PDBString[72]),4)))
    col73 = True;

  return  0;

}

PCTitleContainer CMMDBTitle::GetRemarks()  {
  return &Remark;
}

realtype CMMDBTitle::GetResolution()  {
//  returns -1.0 if there is no resolution record in the file
PCRemark rem;
pstr     p,eptr;
int      i,l;
  if (resolution>-1.5)  return resolution;
  l = Remark.Length();
  for (i=0;(i<l) && (resolution<-1.5);i++)  {
    rem = (PCRemark)Remark.GetContainerClass ( i );
    if (rem)  {
      if (rem->remarkNum==2)  {
        if (rem->Remark)  {
          p = strcasestr ( rem->Remark,"RESOLUTION" );
          if (p)  {
            while ((*p) && (*p!=' '))  p++;
            if (*p)  {
              resolution = strtod ( p,&eptr );
              if ((resolution<0.0) || (eptr==p))
                resolution = -1.0;
            }
          }
        }
      } else if (rem->remarkNum>2)
        resolution = -1.0;
    }
  }
  return resolution;
}

PCBiomolecule CMMDBTitle::addBiomolecule()  {
PPCBiomolecule  BM1;
int             i;
  BM1 = Biomolecule;
  Biomolecule = new PCBiomolecule[nBiomolecules+1];
  for (i=0;i<nBiomolecules;i++)
    Biomolecule[i] = BM1[i];
  if (BM1)  delete[] BM1;
  Biomolecule[nBiomolecules] = new CBiomolecule();
  nBiomolecules++;
  return Biomolecule[nBiomolecules-1];
}

int CMMDBTitle::ParseBiomolecules()  {
PCRemark       rem;
PCBiomolecule  BMol;
PCBMApply      BMA;
pstr           p,eptr;
int            i,l, lkey;

  FreeBiomolecules();

  l    = Remark.Length();
  i    = 0;
  lkey = 0;
  while ((i<l) && (!lkey))  {
    rem = (PCRemark)Remark.GetContainerClass ( i );
    if (rem)  {
      if (rem->remarkNum==350)      lkey = 1;
      else if (rem->remarkNum>350)  lkey = -1;
    }
    if (!lkey) i++;
  }

  BMol = NULL;
  BMA  = NULL;

  while (lkey>0)  {

    rem = (PCRemark)Remark.GetContainerClass ( i );
    lkey = lookupRemarks ( i,rem,Remark );

    switch (lkey)  {
      case R350_BIOMOLECULE : BMol = addBiomolecule();
                              i++;
                            break;
      case R350_CHAINS      : if (BMol)  {
                                BMA = BMol->addBMApply();
                                while (lkey==R350_CHAINS)
                                  lkey = BMA->addChains(i,rem,Remark);
                              } else
                                lkey = R350_ERROR;
                            break;
      case R350_BIOMT       : if (BMA)
                                lkey = BMA->addMatrices(i,rem,Remark);
                              else
                                lkey = R350_ERROR;
                            break;
      default : i++;
    }

  }

  if (lkey<=R350_ERROR)  {
    FreeBiomolecules();
    return lkey;
  }

  return nBiomolecules;

}

int CMMDBTitle::GetNofBiomolecules()  {
  return nBiomolecules;
}

void CMMDBTitle::GetBiomolecules ( PPCBiomolecule & BM, int & nBMs ) {
  BM   = Biomolecule;
  nBMs = nBiomolecules;
}

PCBiomolecule CMMDBTitle::GetBiomolecule ( int bmNo )  { // bmno=0,1,..
  if ((0<=bmNo) && (bmNo<nBiomolecules))
    return Biomolecule[bmNo];
  return NULL;
}


int  CMMDBTitle::GetCIF ( PCMMCIFData CIF )  {
pstr  S;
int  RC;

  S = NULL;
  CIF->GetDataName ( S,True );
  if (!S) CIF->GetString ( S,CIFCAT_DATABASE,CIFTAG_ENTRY_ID,True );
  if (!S) CIF->GetString ( S,CIFCAT_DATABASE,CIFTAG_CODE_NDB,True );
  if (!S) CIF->GetString ( S,CIFCAT_DATABASE,CIFTAG_CODE_PDB,True );
  if (S)  {
    strncpy ( idCode,S,sizeof(IDCode)-1 );
    idCode[sizeof(IDCode)-1] = char(0);
    delete[] S;
    S = NULL;
    CIF->DeleteField ( CIFCAT_DATABASE,CIFTAG_ENTRY_ID );
    CIF->DeleteField ( CIFCAT_DATABASE,CIFTAG_CODE_NDB );
    CIF->DeleteField ( CIFCAT_DATABASE,CIFTAG_CODE_PDB );
  } else
    idCode[0] = char(0);
  CIF->GetString ( classification,CIFCAT_STRUCT_KEYWORDS,
                                  CIFTAG_NDB_KEYWORDS,True );
  CIF->GetString ( S,CIFCAT_DATABASE,CIFTAG_DATE_ORIGINAL,True );
  if (S)  {
    DateCIFto11 ( S,depDate );
    delete[] S;
    S = NULL;
  } else
    depDate[0] = char(0);

  ObsData .GetCIF ( CIF,ClassID_ObsLine   );
  Title   .GetCIF ( CIF,ClassID_TitleLine );
  CAVEAT  .GetCIF ( CIF,ClassID_CAVEAT    );
  Compound.GetCIF ( CIF,ClassID_Compound  );
  Source  .GetCIF ( CIF,ClassID_Source    );
  KeyWords.GetCIF ( CIF );
  ExpData .GetCIF ( CIF,ClassID_ExpData   );
  Author  .GetCIF ( CIF,ClassID_Author    );
  RC = RevData.GetCIF ( CIF,ClassID_RevData );
  if (!RC)  {
    Supersede.GetCIF ( CIF,ClassID_Supersede );
    Journal  .GetCIF ( CIF,ClassID_Journal   );
    RC = Remark   .GetCIF ( CIF,ClassID_Remark );
  }
  return RC;

}

void  CMMDBTitle::MakePDBHeaderString ( pstr PDBString )  {
//  makes the ASCII PDB HEADER line from the class' data
int i;

  if (classification)  {

    strcpy ( PDBString,"HEADER    " );
    strcat ( PDBString,classification );
    i = strlen(PDBString);
    while (i<80) 
      PDBString[i++] = ' ';
    PDBString[IMin(i,80)] = char(0);
    Date11to9 ( depDate,&(PDBString[50]) );
    strncpy   ( &(PDBString[62]),idCode,4 );

  } else  
    strcpy ( PDBString,
      "HEADER    XXXXXXXXXXXXXXXXXXXXXXXXXXXX            XX-XXX-XX   ----" );

}

pstr  CMMDBTitle::GetStructureTitle ( pstr & S )  {
// GetStructureTitle() returns the contents of TITLE record
// unfolded into single line. If Title is missing, returns
// contents of COMPND(:MOLECULE). If COMPND is missing, returns
// HEADER. If Header is missing, returns PDB code. If no PDB
// code is there, returns "Not available".
PCTitleLine TLine;
PCCompound  CLine;
pstr        p;
int         i,cl,l;
Boolean     B;

  if (S)  delete[] S;
  S  = NULL;

  cl = Title.Length();
  if (cl>0)  {
    l = 0;
    for (i=0;i<cl;i++)  {
      TLine = PCTitleLine(Title.GetContainerClass(i));
      if (TLine)  l += strlen_des(TLine->Line)+5;
    }
    S = new char[l];
    S[0] = char(0);
    for (i=0;i<cl;i++)  {
      TLine = PCTitleLine(Title.GetContainerClass(i));
      if (TLine)  {
        if (i>0)  strcat ( S," " );
        strcat_des ( S,TLine->Line );
      }
    }
  } else  {
    cl = Compound.Length();
    if (cl>0)  {
      l = 0;
      p = NULL;
      B = True;
      for (i=0;(i<cl) && B;i++)  {
        CLine = PCCompound(Compound.GetContainerClass(i));
        if (CLine)  {
          if (!p)  {
            p = strstr(CLine->Line,"MOLECULE:");
            if (p)  l += strlen_des(&(p[9]))+5;
          } else  {
            p = strstr(CLine->Line,"MOLECULE:");
            if (p)
              l += strlen_des(&(p[9]))+5;
            else {
              p = strchr(CLine->Line,':');
              if (!p)  {
                l += strlen_des(CLine->Line)+5;
                p = CLine->Line;
              } else
                B = False;
            }
          }
        }
      }
      if (l>0)  {
        S = new char[l];
        S[0] = char(0);
        p = NULL;
        B = True;
        for (i=0;(i<cl) && B;i++)  {
          CLine = PCCompound(Compound.GetContainerClass(i));
          if (CLine)  {
            if (!p)  {
              p = strstr(CLine->Line,"MOLECULE:");
              if (p)  strcat_des ( S,&(p[9]) );
            } else  {
              p = strstr(CLine->Line,"MOLECULE:");
              if (p)
                strcat_des ( S,&(p[9]) );
              else {
                p = strchr(CLine->Line,':');
                if (!p)  {
                  strcat_des ( S,CLine->Line );
                  p = CLine->Line;
                } else
                  B = False;
              }
            }
            l = strlen(S)-1;
            if (S[l]==';')  S[l] = char(0);
          }
        }
      } else  {
        l = 0;
        for (i=0;i<cl;i++)  {
          CLine = PCCompound(Compound.GetContainerClass(i));
          if (CLine)  l += strlen_des(CLine->Line)+5;
        }
        S = new char[l];
        S[0] = char(0);
        for (i=0;i<cl;i++)  {
          CLine = PCCompound(Compound.GetContainerClass(i));
          if (CLine)  {
            if (i>0)  strcat ( S," " );
            strcat_des ( S,CLine->Line );
          }
        }
      }
    } else if (classification)
      CreateCopy ( S,classification );
    else if (idCode[0])
      CreateCopy ( S,idCode );
    else
      CreateCopy ( S,pstr("Not available") );
  }

  if (!S[0])  CreateCopy ( S,pstr("Not available") );

  return S;

}

void  CMMDBTitle::PDBASCIIDump ( RCFile f )  {
char  PDBString[100];
  if (classification)  {
    MakePDBHeaderString ( PDBString );
    f.WriteLine ( PDBString );
  }
  ObsData  .PDBASCIIDump ( f );
  Title    .PDBASCIIDump ( f );
  CAVEAT   .PDBASCIIDump ( f );
  Compound .PDBASCIIDump ( f );
  Source   .PDBASCIIDump ( f );
  KeyWords .PDBASCIIDump ( f );
  ExpData  .PDBASCIIDump ( f );
  Author   .PDBASCIIDump ( f );
  RevData  .PDBASCIIDump ( f );
  Supersede.PDBASCIIDump ( f );
  Journal  .PDBASCIIDump ( f );
  Remark   .PDBASCIIDump ( f );
}


void  CMMDBTitle::MakeCIF ( PCMMCIFData CIF )  {
char DateCIF[20];

  if (idCode[0])  {
    CIF->PutDataName ( idCode );
    CIF->PutString   ( idCode, CIFCAT_DATABASE,CIFTAG_ENTRY_ID );
    CIF->PutString   ( idCode, CIFCAT_DATABASE,CIFTAG_CODE_NDB );
    CIF->PutString   ( idCode, CIFCAT_DATABASE,CIFTAG_CODE_PDB );
  } else  {
    CIF->PutDataName ( pstr("")                              );
    CIF->PutString   ( NULL, CIFCAT_DATABASE,CIFTAG_ENTRY_ID );
    CIF->PutString   ( NULL, CIFCAT_DATABASE,CIFTAG_CODE_NDB );
    CIF->PutString   ( NULL, CIFCAT_DATABASE,CIFTAG_CODE_PDB );
  }
  CIF->PutString   ( classification, CIFCAT_STRUCT_KEYWORDS,
                                     CIFTAG_NDB_KEYWORDS );
  if (depDate[0])  {
    Date11toCIF ( depDate,DateCIF );
    CIF->PutString ( DateCIF,CIFCAT_DATABASE,CIFTAG_DATE_ORIGINAL );
  } else
    CIF->PutString ( NULL,CIFCAT_DATABASE,CIFTAG_DATE_ORIGINAL );
  
  ObsData  .MakeCIF ( CIF );
  Title    .MakeCIF ( CIF );
  CAVEAT   .MakeCIF ( CIF );
  Compound .MakeCIF ( CIF );
  Source   .MakeCIF ( CIF );
  KeyWords .MakeCIF ( CIF );
  ExpData  .MakeCIF ( CIF );
  Author   .MakeCIF ( CIF );
  RevData  .MakeCIF ( CIF );
  Supersede.MakeCIF ( CIF );
  Journal  .MakeCIF ( CIF );
  Remark   .MakeCIF ( CIF );

}

void  CMMDBTitle::Copy ( PCMMDBTitle TS )  {
int  i;

  FreeBiomolecules();

  if (TS)  {

    CreateCopy ( classification,TS->classification );
    strcpy     ( depDate       ,TS->depDate        );
    strcpy     ( idCode        ,TS->idCode         );
    resolution = TS->resolution;

    ObsData  .Copy ( &(TS->ObsData)   );
    Title    .Copy ( &(TS->Title)     );
    CAVEAT   .Copy ( &(TS->CAVEAT)    );
    Compound .Copy ( &(TS->Compound)  );
    Source   .Copy ( &(TS->Source)    );
    KeyWords .Copy ( &(TS->KeyWords)  );
    ExpData  .Copy ( &(TS->ExpData)   );
    Author   .Copy ( &(TS->Author)    );
    RevData  .Copy ( &(TS->RevData)   );
    Supersede.Copy ( &(TS->Supersede) );
    Journal  .Copy ( &(TS->Journal)   );
    Remark   .Copy ( &(TS->Remark)    );

    nBiomolecules = TS->nBiomolecules;
    if (nBiomolecules>0)  {
      Biomolecule = new PCBiomolecule[nBiomolecules];
      for (i=0;i<nBiomolecules;i++)
        if (TS->Biomolecule[i])  {
          Biomolecule[i] = new CBiomolecule();
          Biomolecule[i]->Copy ( TS->Biomolecule[i] );
        } else
          Biomolecule[i] = NULL;
    }

  } else  {

    if (classification)  delete[] classification;
    classification = NULL;
    resolution     = -2.0;
    ObsData  .FreeContainer();
    Title    .FreeContainer();
    CAVEAT   .FreeContainer();
    Compound .FreeContainer();
    Source   .FreeContainer();
    KeyWords .Delete       ();
    ExpData  .FreeContainer();
    Author   .FreeContainer();
    RevData  .FreeContainer();
    Supersede.FreeContainer();
    Journal  .FreeContainer();
    Remark   .FreeContainer();

  }

}

void  CMMDBTitle::TrimInput ( pstr PDBString )  {
  if (col73)  PDBString[72] = char(0);
  PadSpaces ( PDBString,80 );
}

void  CMMDBTitle::write ( RCFile f )  {
// writes header to PDB binary file
int  i;
byte Version=2;

  f.WriteByte    ( &Version       );

  //  Header data
  f.CreateWrite  ( classification );
  f.WriteTerLine ( depDate,False  );
  f.WriteTerLine ( idCode ,False  );
  f.WriteReal    ( &resolution    );

  ObsData  .write ( f );  //  Obsoletion data
  Title    .write ( f );  //  Title
  CAVEAT   .write ( f );  //  Error data
  Compound .write ( f );  //  Compound
  Source   .write ( f );  //  Source
  KeyWords .write ( f );  //  Key words
  ExpData  .write ( f );  //  Experimental data
  Author   .write ( f );  //  Author data
  RevData  .write ( f );  //  Revision data
  Supersede.write ( f );  //  Supersede records
  Journal  .write ( f );  //  Journal records
  Remark   .write ( f );  //  Remarks

  f.WriteInt ( &nBiomolecules );
  for (i=0;i<nBiomolecules;i++)
    StreamWrite ( f,Biomolecule[i] );
  
}

void  CMMDBTitle::read ( RCFile f )  {
// reads header from PDB binary file
int  i;
byte Version;

  f.ReadByte    ( &Version );

  //  Header data
  f.CreateRead  ( classification );
  f.ReadTerLine ( depDate,False  );
  f.ReadTerLine ( idCode ,False  );
  if (Version>1)
    f.ReadReal  ( &resolution    );
  else
    resolution = -2.0;

  ObsData  .read ( f );   //  Obsoletion data
  Title    .read ( f );   //  Title
  CAVEAT   .read ( f );   //  Error data
  Compound .read ( f );   //  Compound
  Source   .read ( f );   //  Source
  KeyWords .read ( f );   //  Key words
  ExpData  .read ( f );   //  Experimental data
  Author   .read ( f );   //  Author data
  RevData  .read ( f );   //  Revision data
  Supersede.read ( f );   //  Supersede records
  Journal  .read ( f );   //  Journal records
  Remark   .read ( f );   //  Remarks

  FreeBiomolecules();
  if (Version>1)  {
    f.ReadInt ( &nBiomolecules );
    if (nBiomolecules>0)  {
      Biomolecule = new PCBiomolecule[nBiomolecules];
      for (i=0;i<nBiomolecules;i++)  {
        Biomolecule[i] = NULL;
        StreamRead ( f,Biomolecule[i] );
      }
    }
  }

}

MakeStreamFunctions(CMMDBTitle)



// ===================================================================

/*
void  TestHeader()  {
PCMMDBTitle  Hdr;
char         S[81],S1[81];

  Hdr = new CMMDBTitle();

  Hdr->SetHeader ( pstr("MUSCLE PROTEIN"),pstr("02-JUN-1993"),pstr("1MYS") );
  Hdr->MakePDBHeaderString ( S );
  printf ( "1234567890123456789012345678901234567890"
           "1234567890123456789012345678901234567890\n" );
  printf ( S );
  printf ( "\n" );

  strcpy ( S,
// 1234567890123456789012345678901234567890123456789012345678901234567890
  "HEADER    HYDROLASE (CARBOXYLIC ESTER)            07-APR-01   2PHI" );

  Hdr->ConvertPDBString ( S );
  Hdr->MakePDBHeaderString    ( S1 );
  printf ( "1234567890123456789012345678901234567890"
           "1234567890123456789012345678901234567890\n" );
  printf ( S1 );
  printf ( "\n" );

  Hdr->SetHeader (
     pstr("MUSCLE PROTEIN;**A VERY LONG TITLE TEST;**ARBITRARY LENGTH"),
     pstr("02-JUN-1993"),pstr("1MYS") );
  Hdr->MakePDBHeaderString ( S );
  printf ( "1234567890123456789012345678901234567890"
           "1234567890123456789012345678901234567890\n" );
  printf ( S );
  printf ( "\n" );

  delete Hdr;

  printf ( " header deleted \n" );

}

void  TestTitle() {
// reads PDB title from file 'in.title'
// and rewrites it into 'out.title' and 'abin.title'
CFile        f;
char         S[81];
PCMMDBTitle  Title;

  Title = new CMMDBTitle();

  f.assign ( pstr("in.title"),True );
  if (f.reset()) {
    while (!f.FileEnd()) {
      f.ReadLine ( S,sizeof(S) );
      Title->ConvertPDBString ( S );
    }
    f.shut();
  } else {
    printf ( " Can't open input file 'in.title' \n" );
    delete Title;
    return;
  }
   
  f.assign ( pstr("out.title"),True );
  if (f.rewrite()) {
    Title->PDBASCIIDump ( f );
    f.shut();
  } else {
    printf ( " Can't open output file 'out.title' \n" );
    delete Title;
    return;
  }



  f.assign ( pstr("mmdb.title.bin"),False );
  if (f.rewrite()) {
    Title->write ( f );
    f.shut();
  } else {
    printf ( "  Can't open binary file for writing.\n" );
    delete Title;
    return;
  }
  
  delete Title;
  printf ( "   Title deleted.\n" );
  
  Title = new CMMDBTitle();
  if (f.reset()) {
    Title->read ( f );
    f.shut();
  } else {
    printf ( "  Can't open binary file for reading.\n" );
    delete Title;
    return;
  }
   
  f.assign ( pstr("abin.title"),True );
  if (f.rewrite()) {
    Title->PDBASCIIDump ( f );
    f.shut();
  } else {
    printf ( " Can't open output file 'abin.title' \n" );
  }

  delete Title;

}


*/
