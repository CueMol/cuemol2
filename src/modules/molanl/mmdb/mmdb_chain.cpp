//  $Id: mmdb_chain.cpp,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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
//  **** Module  :  MMDB_Chain  <implementation>
//       ~~~~~~~~~
//  **** Project :  MacroMolecular Data Base (MMDB)
//       ~~~~~~~~~ 
//  **** Classes :  CChainContainer ( container for in-chain classes  )
//       ~~~~~~~~~  CContainerChain ( chain containered class template)
//                  CDBReference    ( DBREF  records                  )
//                  CSeqAdv         ( SEQADV records                  )
//                  CSeqRes         ( SEQRES records                  )
//                  CModRes         ( MODRES records                  )
//                  CHetRec         ( HET    records                  )
//                  CChain          ( MMDB chain class                )
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

#ifndef  __MMDB_Chain__
#include "mmdb_chain.h"
#endif

#ifndef  __MMDB_Model__
#include "mmdb_model.h"
#endif

#ifndef  __MMDB_File__
#include "mmdb_file.h"
#endif

#ifndef  __MMDB_CIFDefs__
#include "mmdb_cifdefs.h"
#endif


//  ==============  CChainContainer  ====================

PCContainerClass CChainContainer::MakeContainerClass ( int ClassID )  {
  switch (ClassID)  {
    default :
    case ClassID_Template    : return
                                 CClassContainer::MakeContainerClass(ClassID);
    case ClassID_DBReference : return new CDBReference ( Chain );
    case ClassID_SeqAdv      : return new CSeqAdv      ( Chain );
    case ClassID_ModRes      : return new CModRes      ( Chain );
    case ClassID_Het         : return new CHetRec      ( Chain );
  }
}

void CChainContainer::SetChain ( PCChain Chain_Owner )  {
int i;
  Chain = Chain_Owner;
  for (i=0;i<length;i++)
    if (Container[i])
      (void)PCContainerChain(Container[i])->SetChain ( Chain );
}

pstr CChainContainer::Get1stChainID()  {
int i;
  i = 0;
  if (Container)  {
    while ((i<length-1) && (!Container[i])) i++;
    if (Container[i])
          return PCContainerChain(Container[i])->chainID;
    else  return NULL;
  } else
    return NULL;
}

void CChainContainer::MoveByChainID ( ChainID chainID,
                                      PCChainContainer ChainContainer )  {
int i;
  for (i=0;i<length;i++)
    if (Container[i])  {
      if (!strcmp(PCContainerChain(Container[i])->chainID,chainID))  {
        ChainContainer->AddData ( Container[i] );
        Container[i] = NULL;
      }
    }
}


MakeStreamFunctions(CChainContainer)


//  ================  CContainerChain  ===================

CContainerChain::CContainerChain ()
                : CContainerClass()  {
  Chain      = NULL;
  chainID[0] = char(0);
}

CContainerChain::CContainerChain ( PCChain Chain_Owner)
                : CContainerClass()  {
  Chain = Chain_Owner;
  if (Chain)  strcpy ( chainID,Chain->GetChainID() );
        else  chainID[0] = char(0);
}

void CContainerChain::SetChain ( PCChain Chain_Owner )  {
  Chain = Chain_Owner;
  if (Chain)  strcpy ( chainID,Chain->GetChainID() );
        else  strcpy ( chainID,"" );
}

MakeStreamFunctions(CContainerChain)


//  ================  CDBReference  ===================

CDBReference::CDBReference() : CContainerChain()  {
  InitDBReference();
}

CDBReference::CDBReference( PCChain Chain_Owner )
            : CContainerChain(Chain_Owner)  {
  InitDBReference();
}

CDBReference::CDBReference ( PCChain Chain_Owner, cpstr S )
            : CContainerChain(Chain_Owner)  {
  InitDBReference();
  ConvertPDBASCII ( S );
}

CDBReference::CDBReference ( RPCStream Object )
            : CContainerChain(Object)  {
  InitDBReference();
}

CDBReference::~CDBReference() {}

void  CDBReference::InitDBReference()  {
  seqBeg = 0;
  strcpy ( insBeg     ,"-"            );
  seqEnd = 0;
  strcpy ( insEnd     ,"-"            );
  strcpy ( database   ,"------"       );
  strcpy ( dbAccession,"--------"     );
  strcpy ( dbIdCode   ,"------------" );
  dbseqBeg = 0;
  strcpy ( dbinsBeg,"-" );
  dbseqEnd = 0;
  strcpy ( dbinsEnd,"-" );
}

void  CDBReference::PDBASCIIDump ( pstr S, int N )  {
//  makes the ASCII PDB DBREF line number N
//  from the class' data
  strcpy ( S,"DBREF" );
  PadSpaces ( S,80 );
  strcpy_n  ( &(S[7]),Chain->GetEntryID(),4 );
  if (Chain->chainID[0])  S[12] = Chain->chainID[0];
  PutIntIns ( &(S[14]),seqBeg,4,insBeg     );
  PutIntIns ( &(S[20]),seqEnd,4,insEnd     );
  strcpy_n  ( &(S[26]),database   ,6       );
  strcpy_n  ( &(S[33]),dbAccession,8       );
  strcpy_n  ( &(S[42]),dbIdCode   ,12      );
  PutIntIns ( &(S[55]),dbseqBeg,5,dbinsBeg );
  PutIntIns ( &(S[62]),dbseqEnd,5,dbinsEnd );
}

void  CDBReference::MakeCIF ( PCMMCIFData CIF, int N )  {
PCMMCIFLoop Loop1,Loop2;
int         RC1,RC2;

  RC1 = CIF->AddLoop ( CIFCAT_STRUCT_REF_SEQ,Loop1 );
  RC2 = CIF->AddLoop ( CIFCAT_STRUCT_REF    ,Loop2 );

  if ((RC1!=CIFRC_Ok) || (RC2!=CIFRC_Ok))  {
    // the category was (re)created, provide tags
    Loop1->AddLoopTag ( CIFTAG_NDB_PDB_ID_CODE            );
    Loop1->AddLoopTag ( CIFTAG_NDB_CHAIN_ID               );
    Loop1->AddLoopTag ( CIFTAG_SEQ_ALIGN_BEG              );
    Loop1->AddLoopTag ( CIFTAG_NDB_SEQ_ALIGN_BEG_INS_CODE );
    Loop1->AddLoopTag ( CIFTAG_SEQ_ALIGN_END              );
    Loop1->AddLoopTag ( CIFTAG_NDB_SEQ_ALIGN_END_INS_CODE );
    Loop1->AddLoopTag ( CIFTAG_NDB_DB_ACCESSION           );
    Loop1->AddLoopTag ( CIFTAG_DB_ALIGN_BEG               );
    Loop1->AddLoopTag ( CIFTAG_NDB_DB_ALIGN_BEG_INS_CODE  );
    Loop1->AddLoopTag ( CIFTAG_DB_ALIGN_END               );
    Loop1->AddLoopTag ( CIFTAG_NDB_DB_ALIGN_END_INS_CODE  );
    Loop2->AddLoopTag ( CIFTAG_DB_NAME );
    Loop2->AddLoopTag ( CIFTAG_DB_CODE );
  }

  Loop1->AddString  ( Chain->GetEntryID(),True );
  Loop1->AddString  ( Chain->chainID     ,True );
  Loop1->AddInteger ( seqBeg                   );
  Loop1->AddString  ( insBeg             ,True );
  Loop1->AddInteger ( seqEnd                   );
  Loop1->AddString  ( insEnd             ,True );
  Loop1->AddString  ( dbAccession        ,True );
  Loop1->AddInteger ( dbseqBeg                 );
  Loop1->AddString  ( dbinsBeg           ,True );
  Loop1->AddInteger ( dbseqEnd                 );
  Loop1->AddString  ( dbinsEnd           ,True );

  Loop2->AddString  ( database,True );
  Loop2->AddString  ( dbIdCode,True );

}

void  CDBReference::GetCIF ( PCMMCIFData CIF, int & Signal )  {
//  GetCIF(..) must be always run without reference to Chain,
//  see CModel::GetCIF(..).
PCMMCIFLoop   Loop1,Loop2;
PCMMCIFStruct Struct2;
pstr          F;
int           RC,CIFMode,ref_id1,ref_id2;

  Loop1 = CIF->GetLoop ( CIFCAT_STRUCT_REF_SEQ );

  if (!Loop1)  {
    Signal = -1;
    return;
  }

  if (Signal>=Loop1->GetLoopLength())  {
    Signal = -1;
    return;
  }


  //  Determine the ChainID first and store it locally. It will
  // be used by CModel for generating chains and placing the
  // primary structure data BEFORE reading the coordinate section.
  CIFMode = CIF_NDB;
  F = Loop1->GetString ( CIFName(TAG_CHAIN_ID,CIFMode),Signal,RC );
  if ((RC) || (!F))  {
    CIFMode = CIF_PDBX;
    F = Loop1->GetString ( CIFName(TAG_CHAIN_ID,CIFMode),Signal,RC );
  }
  if ((!RC) && F)  {
    strcpy_n0 ( chainID,F,sizeof(ChainID)-1 );
    Loop1->DeleteField ( CIFName(TAG_CHAIN_ID,CIFMode),Signal );
  } else
    strcpy ( chainID,"" );


  if (CIFGetInteger(seqBeg,Loop1,CIFName(TAG_SEQ_ALIGN_BEG,CIFMode),
                    Signal))  return;
  CIFGetString ( insBeg,Loop1,CIFName(TAG_SEQ_ALIGN_BEG_INS_CODE,CIFMode),
                 Signal,sizeof(InsCode),pstr(" ") );

  if (CIFGetInteger(seqEnd,Loop1,CIFName(TAG_SEQ_ALIGN_END,CIFMode),
                    Signal))  return;
  CIFGetString ( insEnd,Loop1,CIFName(TAG_SEQ_ALIGN_END_INS_CODE,CIFMode),
                 Signal,sizeof(InsCode),pstr(" ") );
  CIFGetString ( dbAccession,Loop1,CIFName(TAG_DB_ACCESSION,CIFMode),
                 Signal,sizeof(DBAcCode),pstr("        ") );

  if (CIFGetInteger(dbseqBeg,Loop1,CIFName(TAG_DB_ALIGN_BEG,CIFMode),
                    Signal))  return;
  CIFGetString ( dbinsBeg,Loop1,CIFName(TAG_DB_ALIGN_BEG_INS_CODE,CIFMode),
                 Signal,sizeof(InsCode),pstr(" ") );

  if (CIFGetInteger(dbseqEnd,Loop1,CIFName(TAG_DB_ALIGN_END,CIFMode),
                    Signal))  return;
  CIFGetString ( dbinsEnd,Loop1,CIFName(TAG_DB_ALIGN_END_INS_CODE,CIFMode),
                 Signal,sizeof(InsCode),pstr(" ") );

  Loop2 = CIF->GetLoop ( CIFCAT_STRUCT_REF );
  if (Loop2)  {
    CIFGetString ( database,Loop2,CIFTAG_DB_NAME,Signal,
                   sizeof(DBName)  ,pstr("      ")       );
    CIFGetString ( dbIdCode,Loop2,CIFTAG_DB_CODE,Signal,
                   sizeof(DBIdCode),pstr("            ") );
  } else if (CIFMode==CIF_PDBX)  {
    Struct2 = CIF->GetStructure ( CIFCAT_STRUCT_REF );
    if (Struct2 &&
        (!CIFGetInteger(ref_id1,Loop1,CIFTAG_REF_ID,Signal)) &&
        (!CIFGetInteger(ref_id2,Struct2,CIFTAG_ID,False)))  {
      if (ref_id1==ref_id2)  {
        CIFGetString ( database,Struct2,CIFTAG_DB_NAME,
                       sizeof(DBName)  ,pstr("      ")      ,False );
        CIFGetString ( dbIdCode,Struct2,CIFTAG_DB_CODE,
                       sizeof(DBIdCode),pstr("            "),False );
      }
    }
  }

  Signal++;

}


int CDBReference::ConvertPDBASCII ( cpstr S )  {
IDCode idCode;
  if (Chain->chainID[0])  {
    if (S[12]!=Chain->chainID[0])
      return Error_WrongChainID;
  } else if (S[12]!=' ')  {
    Chain->chainID[0] = S[12];
    Chain->chainID[1] = char(0);
  } else
    Chain->chainID[0] = char(0);
  strcpy ( idCode,Chain->GetEntryID() );
  if (idCode[0])  {
    if (strncmp(&(S[7]),idCode,4) && (!ignoreNonCoorPDBErrors))
      return Error_WrongEntryID;
  } else  {
    GetString ( idCode,&(S[7]),4 );
    Chain->SetEntryID ( idCode );
  }
  GetIntIns  ( seqBeg,insBeg,&(S[14]),4  );
  GetIntIns  ( seqEnd,insEnd,&(S[20]),4  );
  strcpy_ncs ( database     ,&(S[26]),6  );  
  strcpy_ncs ( dbAccession  ,&(S[33]),8  ); 
  strcpy_ncs ( dbIdCode     ,&(S[42]),12 );
  GetIntIns  ( dbseqBeg,dbinsBeg,&(S[55]),5 );
  GetIntIns  ( dbseqEnd,dbinsEnd,&(S[62]),5 );
  return 0;
}

void  CDBReference::Copy ( PCContainerClass DBRef )  {
  
  CContainerChain::Copy ( DBRef );
  
  seqBeg   = PCDBReference(DBRef)->seqBeg;
  seqEnd   = PCDBReference(DBRef)->seqEnd;
  dbseqBeg = PCDBReference(DBRef)->dbseqBeg;
  dbseqEnd = PCDBReference(DBRef)->dbseqEnd;
  strcpy ( insBeg     ,PCDBReference(DBRef)->insBeg      );
  strcpy ( insEnd     ,PCDBReference(DBRef)->insEnd      );
  strcpy ( database   ,PCDBReference(DBRef)->database    );
  strcpy ( dbAccession,PCDBReference(DBRef)->dbAccession );
  strcpy ( dbIdCode   ,PCDBReference(DBRef)->dbIdCode    );
  strcpy ( dbinsBeg   ,PCDBReference(DBRef)->dbinsBeg    );
  strcpy ( dbinsEnd   ,PCDBReference(DBRef)->dbinsEnd    );

}  
    
void  CDBReference::write ( RCFile f )  {
byte Version=1;
  f.WriteByte ( &Version  );
  f.WriteInt  ( &seqBeg   );
  f.WriteInt  ( &seqEnd   );
  f.WriteInt  ( &dbseqBeg );
  f.WriteInt  ( &dbseqEnd );
  f.WriteTerLine ( insBeg     ,False );
  f.WriteTerLine ( insEnd     ,False );
  f.WriteTerLine ( database   ,False );
  f.WriteTerLine ( dbAccession,False );
  f.WriteTerLine ( dbIdCode   ,False );
  f.WriteTerLine ( dbinsBeg   ,False );
  f.WriteTerLine ( dbinsEnd   ,False );
}

void  CDBReference::read  ( RCFile f ) {
byte Version;
  f.ReadByte ( &Version  );
  f.ReadInt  ( &seqBeg   );
  f.ReadInt  ( &seqEnd   );
  f.ReadInt  ( &dbseqBeg );
  f.ReadInt  ( &dbseqEnd );
  f.ReadTerLine ( insBeg     ,False );
  f.ReadTerLine ( insEnd     ,False );
  f.ReadTerLine ( database   ,False );
  f.ReadTerLine ( dbAccession,False );
  f.ReadTerLine ( dbIdCode   ,False );
  f.ReadTerLine ( dbinsBeg   ,False );
  f.ReadTerLine ( dbinsEnd   ,False );
}

MakeStreamFunctions(CDBReference)



//  ================  CSeqAdv  ===================

CSeqAdv::CSeqAdv() : CContainerChain()  {
  InitSeqAdv();
}

CSeqAdv::CSeqAdv ( PCChain Chain_Owner )
       : CContainerChain(Chain_Owner)  {
  InitSeqAdv();
}

CSeqAdv::CSeqAdv ( PCChain Chain_Owner, cpstr S )
       : CContainerChain(Chain_Owner)  {
  InitSeqAdv();
  ConvertPDBASCII ( S );
}

CSeqAdv::CSeqAdv ( RPCStream Object ) : CContainerChain(Object)  {
  InitSeqAdv();
}

CSeqAdv::~CSeqAdv()  {
  if (conflict)  delete[] conflict;
}

void  CSeqAdv::InitSeqAdv()  {
  strcpy ( resName    ,"---"       );
  seqNum = 0;
  strcpy ( insCode    ,"-"         );
  strcpy ( database   ,"------"    );
  strcpy ( dbAccession,"---------" );
  strcpy ( dbRes      ,"---"       );
  dbSeq = 0;
  conflict = NULL;
  CreateCopy ( conflict,pstr(" ") );
}

void  CSeqAdv::PDBASCIIDump ( pstr S, int N )  {
//  makes the ASCII PDB SEQADV line number N
//  from the class' data
  strcpy     ( S,"SEQADV" );
  PadSpaces  ( S,80 );
  strcpy_n   ( &(S[7]) ,Chain->GetEntryID(),4 );
  strcpy_n   ( &(S[12]),resName      ,3 );
  if (Chain->chainID[0])  S[16] = Chain->chainID[0];
  PutIntIns  ( &(S[18]),seqNum,4,insCode );
  strcpy_n   ( &(S[24]),database   ,4    );
  strcpy_n   ( &(S[29]),dbAccession,9    );
  strcpy_n   ( &(S[39]),dbRes      ,3    );
  PutInteger ( &(S[43]),dbSeq      ,5    );
  strcpy_n   ( &(S[49]),conflict,IMin(strlen(conflict),21) );
}

int CSeqAdv::ConvertPDBASCII ( cpstr S )  {
IDCode idCode;
  if (Chain->chainID[0])  {
    if (S[16]!=Chain->chainID[0])
      return Error_WrongChainID;
  } else if (S[16]!=' ')  {
    Chain->chainID[0] = S[16];
    Chain->chainID[1] = char(0);
  } else
    Chain->chainID[0] = char(0);
  strcpy ( idCode,Chain->GetEntryID() );
  if (idCode[0])  {
    if (strncmp(&(S[7]),idCode,4) && (!ignoreNonCoorPDBErrors))
      return Error_WrongEntryID;
  } else  {
    GetString ( idCode,&(S[7]),4 );
    Chain->SetEntryID ( idCode );
  }
  strcpy_ncs ( resName       ,&(S[12]),3 );  
  GetIntIns  ( seqNum,insCode,&(S[18]),4 );
  strcpy_ncs ( database      ,&(S[24]),4 );  
  strcpy_ncs ( dbAccession   ,&(S[29]),9 ); 
  strcpy_ncs ( dbRes         ,&(S[39]),3 );
  GetInteger ( dbSeq,&(S[43]),5  );
  CreateCopy ( conflict,&(S[49]) );
  CutSpaces  ( conflict,SCUTKEY_END );
  return 0;
}


void  CSeqAdv::MakeCIF ( PCMMCIFData CIF, int N )  {
PCMMCIFLoop Loop;
int         RC;

  RC = CIF->AddLoop ( CIFCAT_STRUCT_REF_SEQ_DIF,Loop );

  if (RC!=CIFRC_Ok)  {
    // the category was (re)created, provide tags
    Loop->AddLoopTag ( CIFTAG_NDB_PDB_ID_CODE           );
    Loop->AddLoopTag ( CIFTAG_MON_ID                    );
    Loop->AddLoopTag ( CIFTAG_NDB_PDB_CHAIN_ID          );
    Loop->AddLoopTag ( CIFTAG_SEQ_NUM                   );
    Loop->AddLoopTag ( CIFTAG_NDB_PDB_INS_CODE          );
    Loop->AddLoopTag ( CIFTAG_NDB_SEQ_DB_NAME           );
    Loop->AddLoopTag ( CIFTAG_NDB_SEQ_DB_ACCESSION_CODE );
    Loop->AddLoopTag ( CIFTAG_DB_MON_ID                 );
    Loop->AddLoopTag ( CIFTAG_NDB_SEQ_DB_SEQ_NUM        );
    Loop->AddLoopTag ( CIFTAG_DETAILS                   );
  }

  Loop->AddString  ( Chain->GetEntryID(),True );
  Loop->AddString  ( resName            ,True );
  Loop->AddString  ( Chain->chainID     ,True );
  Loop->AddInteger ( seqNum                   );
  Loop->AddString  ( insCode            ,True );
  Loop->AddString  ( database           ,True );
  Loop->AddString  ( dbAccession        ,True );
  Loop->AddString  ( dbRes              ,True );
  Loop->AddInteger ( dbSeq                    );
  Loop->AddString  ( conflict           ,True );

}

void  CSeqAdv::GetCIF ( PCMMCIFData CIF, int & Signal )  {
//  GetCIF(..) must be always run without reference to Chain,
//  see CModel::GetCIF(..).
PCMMCIFLoop   Loop;
pstr          F;
int           RC;

  Loop = CIF->GetLoop ( CIFCAT_STRUCT_REF_SEQ_DIF );
  if (!Loop)  {
    Signal = -1;
    return;
  }

  if (Signal>=Loop->GetLoopLength())  {
    Signal = -1;
    return;
  }

  //  Determine the ChainID first and store it locally. It will
  // be used by CModel for generating chains and placing the
  // primary structure data BEFORE reading the coordinate section.
  F = Loop->GetString ( CIFTAG_NDB_PDB_CHAIN_ID,Signal,RC );
  if ((!RC) && F)  {
    strcpy_n0 ( chainID,F,sizeof(ChainID)-1 );
    Loop->DeleteField ( CIFTAG_NDB_PDB_CHAIN_ID,Signal );
  } else
    strcpy ( chainID,"" );

  CIFGetString ( resName,Loop,CIFTAG_MON_ID,Signal,sizeof(ResName),
                 pstr("UNK") );

  if (CIFGetInteger(seqNum,Loop,CIFTAG_SEQ_NUM,Signal))  return;
  CIFGetString ( insCode,Loop,CIFTAG_NDB_PDB_INS_CODE,
                 Signal,sizeof(InsCode),pstr(" ") );

  CIFGetString ( database,Loop,CIFTAG_NDB_SEQ_DB_NAME,Signal,
                 sizeof(DBName),pstr(" ") );

  CIFGetString ( dbAccession,Loop,CIFTAG_NDB_SEQ_DB_ACCESSION_CODE,
                 Signal,sizeof(DBAcCode),pstr(" ") );

  CIFGetString ( dbRes,Loop,CIFTAG_DB_MON_ID,Signal,sizeof(ResName),
                 pstr("   ") );

  if (CIFGetInteger1(dbSeq,Loop,CIFTAG_NDB_SEQ_DB_SEQ_NUM,Signal))
    dbSeq = MinInt4;

  F = Loop->GetString ( CIFTAG_DETAILS,Signal,RC );
  if ((!RC) && F)  {
    CreateCopy ( conflict,F );
    Loop->DeleteField ( CIFTAG_DETAILS,Signal );
  } else
    CreateCopy ( conflict,pstr(" ") );

  Signal++;

}

void  CSeqAdv::Copy ( PCContainerClass SeqAdv )  {

  CContainerClass::Copy ( SeqAdv );

  seqNum = PCSeqAdv(SeqAdv)->seqNum;
  dbSeq  = PCSeqAdv(SeqAdv)->dbSeq;
  strcpy  ( resName    ,PCSeqAdv(SeqAdv)->resName     );
  strcpy  ( insCode    ,PCSeqAdv(SeqAdv)->insCode     );
  strcpy  ( database   ,PCSeqAdv(SeqAdv)->database    );
  strcpy  ( dbAccession,PCSeqAdv(SeqAdv)->dbAccession );
  strcpy  ( dbRes      ,PCSeqAdv(SeqAdv)->dbRes       );
  CreateCopy ( conflict,PCSeqAdv(SeqAdv)->conflict    );

}
    
void  CSeqAdv::write ( RCFile f )  {
byte Version=1;
  f.WriteByte    ( &Version );
  f.WriteInt     ( &seqNum  );
  f.WriteInt     ( &dbSeq   );
  f.WriteTerLine ( resName    ,False );
  f.WriteTerLine ( insCode    ,False );
  f.WriteTerLine ( database   ,False );
  f.WriteTerLine ( dbAccession,False );
  f.WriteTerLine ( dbRes      ,False );
  f.CreateWrite  ( conflict );
}

void  CSeqAdv::read  ( RCFile f ) {
byte Version;
  f.ReadByte    ( &Version );
  f.ReadInt     ( &seqNum  );
  f.ReadInt     ( &dbSeq   );
  f.ReadTerLine ( resName    ,False );
  f.ReadTerLine ( insCode    ,False );
  f.ReadTerLine ( database   ,False );
  f.ReadTerLine ( dbAccession,False );
  f.ReadTerLine ( dbRes      ,False );
  f.CreateRead  ( conflict );
}

MakeStreamFunctions(CSeqAdv)



//  ================  CSeqRes  ===================

CSeqRes::CSeqRes() : CStream()  {
  InitSeqRes();
}

CSeqRes::CSeqRes ( RPCStream Object ) : CStream(Object)  {
  InitSeqRes();
}

CSeqRes::~CSeqRes()  {
  FreeMemory();
}

void  CSeqRes::SetChain ( PCChain Chain_Owner )  {
  Chain = Chain_Owner;
  if (Chain)  strcpy ( chainID,Chain->chainID );
        else  strcpy ( chainID,"" );
}

void  CSeqRes::InitSeqRes()  {
  Chain   = NULL;
  numRes  = -1;
  resName = NULL;
  serNum  = 0;
  strcpy ( chainID,"" );
}

void  CSeqRes::FreeMemory()  {
  if (resName)  delete[] resName;
  resName = NULL;
  numRes  = -1;
  serNum  = 0;
}

void  CSeqRes::PDBASCIIDump ( RCFile f )  {
//  writes the ASCII PDB SEQRES lines into file f
char S[100];
int  i,k,sN;
  if (numRes<0)  return;
  strcpy     ( S,"SEQRES" );
  PadSpaces  ( S,80 );
  if (Chain->chainID[0])
    S[11] = Chain->chainID[0];
  PutInteger ( &(S[13]),numRes,4 );
  if (resName)  {
    i  = 0;
    sN = 1;
    while (i<numRes)  {
      PutInteger ( &(S[8]),sN,2 );
      k = 19;
      while ((i<numRes) && (k<70))  {
        if (resName[i][0])
              strcpy_n ( &(S[k]),resName[i],3 );
        else  strcpy_n ( &(S[k]),pstr("   "),3 );
        i++;
        k += 4;
      }
      while (k<70)  {
        strcpy_n ( &(S[k]),pstr("   "),3 );
        k += 4;
      }
      f.WriteLine ( S );
      sN++;
    }
  } else  {
    S[9] = '0';
    strcpy_n ( &(S[19]),pstr("UNK"),3 );
    f.WriteLine ( S );
  }
}

int CSeqRes::ConvertPDBASCII ( cpstr S )  {
int i,k,sN,nR;
  if (Chain->chainID[0])  {
    if (S[11]!=Chain->chainID[0])
      return Error_WrongChainID;
  } else if (S[11]!=' ')  {
    Chain->chainID[0] = S[11];
    Chain->chainID[1] = char(0);
  } else
    Chain->chainID[0] = char(0);
  GetInteger ( sN,&(S[8]) ,2 );
  GetInteger ( nR,&(S[13]),4 );
  if (sN==0)  {
    FreeMemory();
    numRes = nR;
  } else  {
    serNum++;
    if (sN!=serNum)
      return Error_SEQRES_serNum;
    if (sN==1)  {
      FreeMemory();
      resName = new ResName[nR];
      for (i=0;i<nR;i++)
        resName[i][0] = char(0);
      numRes  = nR;
      serNum  = sN;
    } else if (nR!=numRes)
      return Error_SEQRES_numRes;
    i = 0;
    while ((i<nR) && (resName[i][0]))  i++;
    if (i>=nR)
      return Error_SEQRES_extraRes;
    k = 19;
    while ((i<nR) && (k<70))  {
      GetString ( resName[i],&(S[k]),3 );
      if (!strcmp(resName[i],"   "))  resName[i][0] = char(0);
                                else  i++;
      k += 4;
    }
  }
  return 0;
}


void  CSeqRes::MakeCIF ( PCMMCIFData CIF )  {
//  Note that CSeqRes only adds sequence to the CIF loop common
// to all chains. Therefore this loop should be wiped off from
// CIF structure before putting first sequence into it.
PCMMCIFLoop Loop;
int         RC,i;

  if (numRes<0)  return;

  RC = CIF->AddLoop ( CIFCAT_NDB_POLY_SEQ_SCHEME,Loop );
  if (RC!=CIFRC_Ok)  {
    // the category was (re)created, provide tags
    Loop->AddLoopTag ( CIFTAG_ID     );
    Loop->AddLoopTag ( CIFTAG_MON_ID );
  }

  if (resName)
    for (i=0;i<numRes;i++)  {
      Loop->AddString  ( Chain->chainID,True );
      Loop->AddString  ( resName[i]    ,True );
    }
  else
    for (i=0;i<numRes;i++)  {
      Loop->AddString  ( Chain->GetEntryID(),True );
      Loop->AddString  ( pstr("UNK")        ,True );
    }

}

int  CSeqRes::GetCIF ( PCMMCIFData CIF )  {
//   Tries to get sequence from the CIF structure. A sequence
// for first met chain is extracted and then removed from
// the CIF structure, so that sequential calls will extract
// all sequencies. Chain ID is stored locally in chainID;
// reference to parent chain is neither used nor checked.
//   Returns 0 if sequence was extracted and 1 otherwise.
PCMMCIFLoop Loop;
ResName   * rN;
ChainID     chID;
pstr        F,CHAIN_ID;
int         RC,CIFMode,i,l;
Boolean     isMon;

  FreeMemory();

  CIFMode = CIF_NDB;
  Loop = CIF->GetLoop ( CIFName(CAT_POLY_SEQ_SCHEME,CIFMode) );
  if (!Loop)  {
    CIFMode = CIF_PDBX;
    Loop = CIF->GetLoop ( CIFName(CAT_POLY_SEQ_SCHEME,CIFMode) );
    if (!Loop)  return 1;
  }

  l = Loop->GetLoopLength();
  if (l<=0)  return 1;

  rN         = new ResName[l];
  chainID[0] = char(1);
  numRes     = 0;
  isMon      = False;
  CHAIN_ID   = CIFName(TAG_SEQ_CHAIN_ID,CIFMode);
  for (i=0;i<l;i++)  {
    F = Loop->GetString ( CHAIN_ID,i,RC );
    if (!RC)  {
      if (F)  strcpy ( chID,F );
        else  chID[0] = char(0);
      if (chainID[0]==char(1))  strcpy ( chainID,chID );
      if (!strcmp(chainID,chID))  {
        CIFGetString ( rN[numRes],Loop,CIFTAG_MON_ID,i,
                       sizeof(ResName),pstr("UNK") );
        Loop->DeleteField ( CHAIN_ID,i );
        if (strcmp(rN[numRes],"UNK")) isMon = True;
        numRes++;
      }
    }
  }  

  if (numRes==0)  {
    numRes = -1;
    delete[] rN;
    return 1;
  }

  if (isMon)  {
    resName = new ResName[numRes];
    for (i=0;i<numRes;i++)
      strcpy ( resName[i],rN[i] );
  }

  delete[] rN;

  return 0;

}

void  CSeqRes::Copy ( PCSeqRes SeqRes )  {
int i;

  FreeMemory();

  numRes = SeqRes->numRes;
  serNum = SeqRes->serNum;

  if (SeqRes->resName)  {
    resName = new ResName[numRes];
    for (i=0;i<numRes;i++)
      strcpy ( resName[i],SeqRes->resName[i] );
  }

}
    
void  CSeqRes::write ( RCFile f )  {
int  i;
byte Version=1;
  f.WriteByte ( &Version );
  f.WriteInt  ( &numRes  );
  f.WriteInt  ( &serNum  );
  if (resName)  i = 1;
          else  i = 0;
  f.WriteInt ( &i );
  if (resName)
    for (i=0;i<numRes;i++)
      f.WriteTerLine ( resName[i],False );
}

void  CSeqRes::read  ( RCFile f ) {
int  i;
byte Version;
  FreeMemory();
  f.ReadByte ( &Version );
  f.ReadInt  ( &numRes  );
  f.ReadInt  ( &serNum  );
  f.ReadInt  ( &i       );
  if (i)  {
    resName = new ResName[numRes];
    for (i=0;i<numRes;i++)
      f.ReadTerLine ( resName[i],False );
  }
}


MakeStreamFunctions(CSeqRes)



//  ================  CModRes  ===================

CModRes::CModRes() : CContainerChain()  {
  InitModRes();
}

CModRes::CModRes ( PCChain Chain_Owner )
       : CContainerChain(Chain_Owner)  {
  InitModRes();
}

CModRes::CModRes ( PCChain Chain_Owner, cpstr S )
       : CContainerChain(Chain_Owner)  {
  InitModRes();
  ConvertPDBASCII ( S );
}

CModRes::CModRes ( RPCStream Object ) : CContainerChain(Object)  {
  InitModRes();
}

CModRes::~CModRes()  {
  if (comment)  delete[] comment;
}

void  CModRes::InitModRes()  {
  strcpy     ( resName,"---" );
  seqNum  = 0;
  strcpy     ( insCode,"-"   );
  comment = NULL;
  CreateCopy ( comment,pstr(" ") );
  strcpy     ( stdRes ,"---" );
}

void  CModRes::PDBASCIIDump ( pstr S, int N )  {
//  makes the ASCII PDB MODRES line number N
//  from the class' data
  strcpy     ( S,"MODRES" );
  PadSpaces  ( S,80 );
  strcpy_n   ( &(S[7]) ,Chain->GetEntryID(),4  );
  strcpy_n   ( &(S[12]),resName      ,3  );
  if (Chain->chainID[0])  S[16] = Chain->chainID[0];
  PutIntIns  ( &(S[18]),seqNum,4,insCode );
  strcpy_n   ( &(S[24]),stdRes       ,3  );
  strcpy_n   ( &(S[29]),comment,IMin(strlen(comment),41) );
}

int CModRes::ConvertPDBASCII ( cpstr S )  {
IDCode idCode;
  if (Chain->chainID[0])  {
    if (S[16]!=Chain->chainID[0])
      return Error_WrongChainID;
  } else if (S[16]!=' ')  {
    Chain->chainID[0] = S[16];
    Chain->chainID[1] = char(0);
  } else
    Chain->chainID[0] = char(0);
  strcpy ( idCode,Chain->GetEntryID() );
  if (idCode[0])  {
    if (strncmp(&(S[7]),idCode,4) && (!ignoreNonCoorPDBErrors))
      return Error_WrongEntryID;
  } else  {
    GetString ( idCode,&(S[7]),4 );
    Chain->SetEntryID ( idCode );
  }
  GetString  ( resName       ,&(S[12]),3 );  
  GetIntIns  ( seqNum,insCode,&(S[18]),4 );
  GetString  ( stdRes        ,&(S[24]),3 );
  CreateCopy ( comment       ,&(S[29])   );
  CutSpaces  ( comment,SCUTKEY_END       );
  return 0;
}

void  CModRes::MakeCIF ( PCMMCIFData CIF, int N )  {
/*  -- apparently wrong use of _struct_conn, to be revised
PCMMCIFLoop Loop;
int         RC;

  RC = CIF->AddLoop ( CIFCAT_STRUCT_CONN,Loop );

  if (RC!=CIFRC_Ok)  {
    // the category was (re)created, provide tags
    Loop->AddLoopTag ( CIFTAG_CONN_TYPE_ID               );
    Loop->AddLoopTag ( CIFTAG_NDB_PDB_ID                 );
    Loop->AddLoopTag ( CIFTAG_PTNR1_LABEL_COMP_ID        );
    Loop->AddLoopTag ( CIFTAG_PTNR1_LABEL_ASYM_ID        );
    Loop->AddLoopTag ( CIFTAG_PTNR1_LABEL_SEQ_ID         );
    Loop->AddLoopTag ( CIFTAG_NDB_PTNR1_LABEL_INS_CODE   );
    Loop->AddLoopTag ( CIFTAG_NDB_PTNR1_STANDARD_COMP_ID );
    Loop->AddLoopTag ( CIFTAG_DETAILS                    );
  }

  Loop->AddString  ( pstr("MODRES")           );
  Loop->AddString  ( Chain->GetEntryID(),True );
  Loop->AddString  ( resName            ,True );
  Loop->AddString  ( Chain->chainID     ,True );
  Loop->AddInteger ( seqNum                   );
  Loop->AddString  ( insCode            ,True );
  Loop->AddString  ( stdRes             ,True );
  Loop->AddString  ( comment            ,True );

*/

}

void  CModRes::GetCIF ( PCMMCIFData CIF, int & Signal )  {
//  GetCIF(..) must be always run without reference to Chain,
//  see CModel::GetCIF(..).

/*  -- apparently wrong use of _struct_conn, to be revised
PCMMCIFLoop   Loop;
pstr          F;
int           l,RC;

  Loop = CIF->GetLoop ( CIFCAT_STRUCT_CONN );
  if (!Loop)  {
    Signal = -1;
    return;
  }

  l = Loop->GetLoopLength();
  while (Signal<l)  {
    F = Loop->GetString ( CIFTAG_CONN_TYPE_ID,Signal,RC );
    if ((!RC) && F)  {
      if (!strcmp(F,"MODRES"))  break;
    }
    Signal++;
  }
  if (Signal>=l)  {
    Signal = -1;
    return;
  }

  Loop->DeleteField ( CIFTAG_CONN_TYPE_ID,Signal );

  //  Determine the ChainID first and store it locally. It will
  // be used by CModel for generating chains and placing the
  // primary structure data BEFORE reading the coordinate section.
  F = Loop->GetString ( CIFTAG_PTNR1_LABEL_ASYM_ID,Signal,RC );
  if ((!RC) && F)  {
    strcpy_n0 ( chainID,F,sizeof(ChainID)-1 );
    Loop->DeleteField ( CIFTAG_PTNR1_LABEL_ASYM_ID,Signal );
  } else
    strcpy ( chainID,"" );


  CIFGetString ( resName,Loop,CIFTAG_PTNR1_LABEL_COMP_ID,Signal,
                 sizeof(ResName),pstr("UNK") );

  if (CIFGetInteger(seqNum,Loop,CIFTAG_PTNR1_LABEL_SEQ_ID,Signal))
    return;

  CIFGetString ( insCode,Loop,CIFTAG_NDB_PTNR1_LABEL_INS_CODE,
                 Signal,sizeof(InsCode),pstr(" ") );

  CIFGetString ( stdRes,Loop,CIFTAG_NDB_PTNR1_STANDARD_COMP_ID,Signal,
                 sizeof(ResName),pstr("UNK") );

  F = Loop->GetString ( CIFTAG_DETAILS,Signal,RC );
  if ((!RC) && F)  {
    CreateCopy ( comment,F );
    Loop->DeleteField ( CIFTAG_DETAILS,Signal );
  } else
    CreateCopy ( comment,pstr(" ") );

  Signal++;

*/

  Signal = -1;

}

void  CModRes::Copy ( PCContainerClass ModRes )  {
  seqNum = PCModRes(ModRes)->seqNum;
  strcpy ( resName,PCModRes(ModRes)->resName );
  strcpy ( insCode,PCModRes(ModRes)->insCode );
  strcpy ( stdRes ,PCModRes(ModRes)->stdRes  );
  CreateCopy ( comment,PCModRes(ModRes)->comment );
}
    
void  CModRes::write ( RCFile f )  {
byte Version=1;
  f.WriteByte    ( &Version );
  f.WriteInt     ( &seqNum  );
  f.WriteTerLine ( resName,False );
  f.WriteTerLine ( insCode,False );
  f.WriteTerLine ( stdRes ,False );
  f.CreateWrite  ( comment  );
}

void  CModRes::read  ( RCFile f ) {
byte Version;
  f.ReadByte    ( &Version );
  f.ReadInt     ( &seqNum  );
  f.ReadTerLine ( resName,False );
  f.ReadTerLine ( insCode,False );
  f.ReadTerLine ( stdRes ,False );
  f.CreateRead  ( comment  );
}

MakeStreamFunctions(CModRes)



//  ================  CHetRec  ======================

CHetRec::CHetRec() : CContainerChain()  {
  InitHetRec();
}

CHetRec::CHetRec ( PCChain Chain_Owner )
       : CContainerChain(Chain_Owner)  {
  InitHetRec();
}

CHetRec::CHetRec ( PCChain Chain_Owner, cpstr S )
       : CContainerChain(Chain_Owner)  {
  InitHetRec();
  ConvertPDBASCII ( S );
}

CHetRec::CHetRec ( RPCStream Object ) : CContainerChain(Object)  {
  InitHetRec();
}

CHetRec::~CHetRec()  {
  if (comment)  delete[] comment;
}

void  CHetRec::InitHetRec()  {
  strcpy ( hetID  ,"---" );
  strcpy ( insCode,"-"   );
  seqNum      = 0;
  numHetAtoms = 0;
  comment     = NULL;
  CreateCopy ( comment,pstr(" ") );
}

void  CHetRec::PDBASCIIDump ( pstr S, int N )  {
//  makes the ASCII PDB MODRES line number N
//  from the class' data
  strcpy     ( S,"HET" );
  PadSpaces  ( S,80 );
  strcpy_n   ( &(S[7]) ,hetID,3  );
  if (Chain->chainID[0])  S[12] = Chain->chainID[0];
  PutIntIns  ( &(S[13]),seqNum,4,insCode );
  PutInteger ( &(S[20]),numHetAtoms,5    );
  strcpy_n   ( &(S[30]),comment,IMin(strlen(comment),40) );
}

int  CHetRec::ConvertPDBASCII ( cpstr S )  {
  if (Chain->chainID[0])  {
    if (S[12]!=Chain->chainID[0])
      return Error_WrongChainID;
  } else if (S[12]!=' ')  {
    Chain->chainID[0] = S[12];
    Chain->chainID[1] = char(0);
  } else
    Chain->chainID[0] = char(0);
  GetString  ( hetID         ,&(S[7]) ,3 );  
  GetIntIns  ( seqNum,insCode,&(S[13]),4 );
  GetInteger ( numHetAtoms   ,&(S[20]),5 );
  CreateCopy ( comment       ,&(S[30])   );
  CutSpaces  ( comment,SCUTKEY_END       );
  return 0;
}

void  CHetRec::MakeCIF ( PCMMCIFData CIF, int N )  {
PCMMCIFLoop Loop;
int         RC;

  RC = CIF->AddLoop ( CIFCAT_NDB_NONSTANDARD_LIST,Loop );

  if (RC!=CIFRC_Ok)  {
    // the category was (re)created, provide tags
    Loop->AddLoopTag ( CIFTAG_ID              );
    Loop->AddLoopTag ( CIFTAG_LABEL_ASYM_ID   );
    Loop->AddLoopTag ( CIFTAG_LABEL_SEQ_ID    );
    Loop->AddLoopTag ( CIFTAG_INS_CODE        );
    Loop->AddLoopTag ( CIFTAG_NUMBER_ATOMS_NH );
    Loop->AddLoopTag ( CIFTAG_DETAILS         );
  }

  Loop->AddString  ( hetID         ,True );
  Loop->AddString  ( Chain->chainID,True );
  Loop->AddInteger ( seqNum              );
  Loop->AddString  ( insCode       ,True );
  Loop->AddInteger ( numHetAtoms         );
  Loop->AddString  ( comment       ,True );

}

void  CHetRec::GetCIF ( PCMMCIFData CIF, int & Signal )  {
//  GetCIF(..) must be always run without reference to Chain,
//  see CModel::GetCIF(..).
PCMMCIFLoop   Loop;
pstr          F;
int           RC;

  Loop = CIF->GetLoop ( CIFCAT_NDB_NONSTANDARD_LIST );
  if (!Loop)  {
    Signal = -1;
    return;
  }

  if (Signal>=Loop->GetLoopLength())  {
    Signal = -1;
    return;
  }

  //  Determine the ChainID first and store it locally. It will
  // be used by CModel for generating chains and placing the
  // primary structure data BEFORE reading the coordinate section.
  F = Loop->GetString ( CIFTAG_LABEL_ASYM_ID,Signal,RC );
  if ((!RC) && F)  {
    strcpy_n0 ( chainID,F,sizeof(ChainID)-1 );
    Loop->DeleteField ( CIFTAG_LABEL_ASYM_ID,Signal );
  } else
    strcpy ( chainID,"" );


  CIFGetString ( hetID,Loop,CIFTAG_ID,Signal,sizeof(ResName),
                 pstr("UNK") );

  if (CIFGetInteger(seqNum,Loop,CIFTAG_LABEL_SEQ_ID,Signal))  return;

  CIFGetString ( insCode,Loop,CIFTAG_INS_CODE,Signal,sizeof(InsCode),
                 pstr(" ") );

  if (CIFGetInteger(numHetAtoms,Loop,CIFTAG_NUMBER_ATOMS_NH,Signal))
    return;

  F = Loop->GetString ( CIFTAG_DETAILS,Signal,RC );
  if ((!RC) && F)  {
    CreateCopy ( comment,F );
    Loop->DeleteField ( CIFTAG_DETAILS,Signal );
  } else
    CreateCopy ( comment,pstr(" ") );

  Signal++;

}

void  CHetRec::Copy ( PCContainerClass Het )  {
  seqNum      = PCHetRec(Het)->seqNum;
  numHetAtoms = PCHetRec(Het)->numHetAtoms;
  strcpy     ( hetID  ,PCHetRec(Het)->hetID   );
  strcpy     ( insCode,PCHetRec(Het)->insCode );
  CreateCopy ( comment,PCHetRec(Het)->comment );
}
    
void  CHetRec::write ( RCFile f )  {
byte Version=1;
  f.WriteByte    ( &Version      );
  f.WriteInt     ( &seqNum       );
  f.WriteInt     ( &numHetAtoms  );
  f.WriteTerLine ( hetID  ,False );
  f.WriteTerLine ( insCode,False );
  f.CreateWrite  ( comment       );
}

void  CHetRec::read  ( RCFile f ) {
byte Version;
  f.ReadByte    ( &Version      );
  f.ReadInt     ( &seqNum       );
  f.ReadInt     ( &numHetAtoms  );
  f.ReadTerLine ( hetID  ,False );
  f.ReadTerLine ( insCode,False );
  f.CreateRead  ( comment       );
}

MakeStreamFunctions(CHetRec)



//  =====================   CChain   =======================

CChain::CChain() : CUDData() {
  InitChain();
  SetChain ( pstr("") );
}

CChain::CChain ( PCProModel Model, ChainID chID ) : CUDData() {
  InitChain();
  SetChain ( chID );
  if (Model)  Model->AddChain ( this );
}

CChain::CChain ( RPCStream Object ) : CUDData(Object)  {
  InitChain();
  SetChain ( pstr("") );
}

void  CChain::InitChain()  {
  nResidues      = 0;
  ResLen         = 0;
  Residue        = NULL;
  model          = NULL;
  chainID[0]     = char(0);
  prevChainID[0] = char(0);
  nWeights       = 0;
  Weight         = 0.0;
  Exclude        = True;
}

void  CChain::SetChain ( const ChainID chID )  {
  strcpy ( chainID,chID );
  if (chID[0]==' ')  chainID[0] = char(0);
  DBReference.SetChain ( this );
  SeqAdv     .SetChain ( this );
  SeqRes     .SetChain ( this );
  ModRes     .SetChain ( this );
  Het        .SetChain ( this );
}

void  CChain::SetChainID ( const ChainID chID )  {
  strcpy ( chainID,chID );
  if (chID[0]==' ')  chainID[0] = char(0);
}

CChain::~CChain()  {
  FreeMemory();
  if (model)  model->_ExcludeChain ( chainID );
}

void  CChain::FreeMemory()  {
  DeleteAllResidues();
  if (Residue)  delete[] Residue;
  ResLen    = 0;
  nResidues = 0;
  Residue   = NULL;
  FreeAnnotations();
}

void  CChain::FreeAnnotations()  {
  DBReference.FreeContainer();
  SeqAdv     .FreeContainer();
  SeqRes     .FreeMemory   ();
  ModRes     .FreeContainer();
  Het        .FreeContainer();
}

void CChain::SetModel ( PCProModel Model )  {
  model = Model;
}

void * CChain::GetCoordHierarchy()  {
  if (model)  return model->GetCoordHierarchy();
  return NULL;
}

void CChain::CheckInAtoms()  {
int i;
  if (GetCoordHierarchy())
    for (i=0;i<nResidues;i++)
      if (Residue[i])
        Residue[i]->CheckInAtoms();
}

int CChain::ConvertDBREF ( cpstr PDBString ) {
int              RC;
PCContainerChain ContainerChain;
  ContainerChain = new CDBReference(this);
  RC = ContainerChain->ConvertPDBASCII ( PDBString );
  if (RC)  {
    delete ContainerChain;
    return RC;
  }
  DBReference.AddData ( ContainerChain );
  return 0;
}
    
int CChain::ConvertSEQADV ( cpstr PDBString ) {
int              RC;
PCContainerChain ContainerChain;
  ContainerChain = new CSeqAdv(this);
  RC = ContainerChain->ConvertPDBASCII ( PDBString );
  if (RC)  {
    delete ContainerChain;
    return RC;
  }
  SeqAdv.AddData ( ContainerChain );
  return 0;
}

int CChain::ConvertSEQRES ( cpstr PDBString ) {
  return SeqRes.ConvertPDBASCII ( PDBString );
}
        
int  CChain::ConvertMODRES ( cpstr PDBString ) {
int              RC;
PCContainerChain ContainerChain;
  ContainerChain = new CModRes(this);
  RC = ContainerChain->ConvertPDBASCII ( PDBString );
  if (RC)  {
    delete ContainerChain;
    return RC;
  }
  ModRes.AddData ( ContainerChain );
  return 0;
}
        
int  CChain::ConvertHET ( cpstr PDBString ) {
int              RC;
PCContainerChain ContainerChain;
  ContainerChain = new CHetRec(this);
  RC = ContainerChain->ConvertPDBASCII ( PDBString );
  if (RC)  {
    delete ContainerChain;
    return RC;
  }
  Het.AddData ( ContainerChain );
  return 0;
}


void  CChain::PDBASCIIDump ( RCFile f )  {
// this function was for test purposes and is not used
// for normal function of MMDB
  DBReference.PDBASCIIDump ( f );
  SeqAdv     .PDBASCIIDump ( f );
  SeqRes     .PDBASCIIDump ( f );
  ModRes     .PDBASCIIDump ( f );
  Het        .PDBASCIIDump ( f );
}

void  CChain::PDBASCIIAtomDump ( RCFile f )  {
int i;
  for (i=0;i<nResidues;i++)
    if (Residue[i]) 
      Residue[i]->PDBASCIIAtomDump ( f );
}

void  CChain::MakeAtomCIF ( PCMMCIFData CIF )  {
int i;
  for (i=0;i<nResidues;i++)
    if (Residue[i])
      Residue[i]->MakeAtomCIF ( CIF );
}


int  CChain::GetNumberOfResidues()  {
  return nResidues;
}

PCResidue CChain::GetResidue ( int resNo )  {
  if ((0<=resNo) && (resNo<nResidues))
        return Residue[resNo];
  else  return NULL;
}


PCResidue CChain::GetResidueCreate ( const ResName resName,
                                     int           seqNum,
                                     const InsCode insCode,
                                     Boolean       Enforce )  {
//   Returns pointer on residue, whose name, sequence number and
// insert code are given in resName, seqNum and insCode, respectively.
// If such a residue is absent in the chain, one is created at
// the end of the chain.
int i;

  // check if such a residue is already in the chain
  if (insCode[0])  {
    for (i=0;i<nResidues;i++)
      if (Residue[i])  {
        if ((seqNum==Residue[i]->seqNum) &&
            (!strcmp(insCode,Residue[i]->insCode)))  {
          if (!strcmp(resName,Residue[i]->name))
            return Residue[i]; // it is there; just return the pointer
          else if (!Enforce)
            return NULL;       // duplicate seqNum and insCode!
        }
      }
  } else  {
    for (i=0;i<nResidues;i++)
      if (Residue[i])  {
        if ((seqNum==Residue[i]->seqNum) &&
            (!Residue[i]->insCode[0]))  {
          if (!strcmp(resName,Residue[i]->name))
            return Residue[i]; // it is there; just return the pointer
          else if (!Enforce)
            return NULL;       // duplicate seqNum and insCode!
        }
      } 
  }

  // expand the residue array, if necessary
  if (nResidues>=ResLen)
    ExpandResidueArray ( 100 );

  // create new residue
  Residue[nResidues] = newCResidue();
  Residue[nResidues]->SetChain ( this );
  Residue[nResidues]->SetResID ( resName,seqNum,insCode );
  Residue[nResidues]->index = nResidues;
  nResidues++;

  return Residue[nResidues-1];  

}

void  CChain::ExpandResidueArray ( int inc )  {
PPCResidue Residue1;
int        i;
  ResLen  += inc;
  Residue1 = new PCResidue[ResLen];
  for (i=0;i<nResidues;i++)
    Residue1[i] = Residue[i];
  if (Residue) delete[] Residue;
  Residue = Residue1;
  for (i=nResidues;i<ResLen;i++)
    Residue[i] = NULL;
}

PCResidue CChain::GetResidue ( int seqNum, const InsCode insCode )  {
//   Returns pointer on residue, whose sequence number and
// insert code are given in seqNum and insCode, respectively.
// If such a residue is absent in the chain, returns NULL.
int     i;
Boolean isInsCode;
  if (insCode)  isInsCode = insCode[0]!=char(0);
          else  isInsCode = False;
  if (isInsCode)  {
    for (i=0;i<nResidues;i++)
      if (Residue[i])  {
        if ((seqNum==Residue[i]->seqNum) &&
            (!strcmp(insCode,Residue[i]->insCode)))
          return Residue[i];
      }
  } else  {
    for (i=0;i<nResidues;i++)
      if (Residue[i])  {
        if ((seqNum==Residue[i]->seqNum) && (!Residue[i]->insCode[0]))
          return Residue[i];
      }
  }
  return NULL;
}

int  CChain::GetResidueNo ( int seqNum, const InsCode insCode )  {
//   GetResidueNo(..) returns the residue number in the chain's
// residues table. Residues are numbered as 0..nres-1 as they appear
// in the coordinate file.
//   If residue is not found, the function returns -1.
int      i;
Boolean isInsCode;
  if (insCode)  isInsCode = insCode[0]!=char(0);
          else  isInsCode = False;
  if (isInsCode)  {
    for (i=0;i<nResidues;i++)
      if (Residue[i])  {
        if ((seqNum==Residue[i]->seqNum) &&
            (!strcmp(insCode,Residue[i]->insCode)))
          return i;
      }
  } else  {
    for (i=0;i<nResidues;i++)
      if (Residue[i])  {
        if ((seqNum==Residue[i]->seqNum) && (!Residue[i]->insCode[0]))
          return i;
      }
  }
  return -1;
}

void CChain::GetResidueTable ( PPCResidue & resTable,
                               int & NumberOfResidues )  {
  resTable         = Residue;
  NumberOfResidues = nResidues;
}

int  CChain::_ExcludeResidue ( const ResName resName, int seqNum,
                               const InsCode insCode )  {
//   ExcludeResidue(..) excludes (but does not dispose!) a residue
// from the chain. Returns 1 if the chain gets empty and 0 otherwise.
int  i,k;

  if (!Exclude)  return 0;

  // find the residue
  k = -1;
  for (i=0;(i<nResidues) && (k<0);i++)
    if ((seqNum==Residue[i]->seqNum)           &&
        (!strcmp(insCode,Residue[i]->insCode)) &&
        (!strcmp(resName,Residue[i]->name)))
      k = i;

  if (k>=0)  {
    for (i=k+1;i<nResidues;i++)  {
      Residue[i-1] = Residue[i];
      if (Residue[i-1])
        Residue[i-1]->index = i-1;
    }
    nResidues--;
    Residue[nResidues] = NULL;
  }

  if (nResidues<=0)  return 1;
               else  return 0;

}



//  ------------------  Deleting residues  --------------------------

int  CChain::DeleteResidue ( int resNo )  {
  if ((0<=resNo) && (resNo<nResidues))  {
    if (Residue[resNo])  {
      Exclude = False;
      delete Residue[resNo];
      Residue[resNo] = NULL;
      Exclude = True;
      return 1;
    }
  }
  return 0;
}

int  CChain::DeleteResidue ( int seqNum, const InsCode insCode )  {
int i;
  if (insCode[0])  {
    for (i=0;i<nResidues;i++)
      if (Residue[i])  {
        if ((seqNum==Residue[i]->seqNum) &&
            (!strcmp(insCode,Residue[i]->insCode)))  {
          Exclude = False;
          delete Residue[i];
          Residue[i] = NULL;
          Exclude = True;
          return 1;
        }
      }
  } else  {
    for (i=0;i<nResidues;i++)
      if (Residue[i])  {
        if ((seqNum==Residue[i]->seqNum) && (!Residue[i]->insCode[0]))  {
          Exclude = False;
          delete Residue[i];
          Residue[i] = NULL;
          Exclude = True;
          return 1;
        }
      }
  }
  return 0;
}


int  CChain::DeleteAllResidues()  {
int i,k;
  Exclude = False;
  k = 0;
  for (i=0;i<nResidues;i++)
    if (Residue[i])  {
      delete Residue[i];
      Residue[i] = NULL;
      k++;
    }
  nResidues = 0;
  Exclude = True;
  return k;
}


int  CChain::DeleteSolvent()  {
int i,k;
  Exclude = False;
  k = 0;
  for (i=0;i<nResidues;i++)
    if (Residue[i])  {
      if (Residue[i]->isSolvent())  {
        delete Residue[i];
        Residue[i] = NULL;
        k++;
      }
    }
  Exclude = True;
  return k;
}


void CChain::TrimResidueTable()  {
int i,j;
  Exclude = False;
  j = 0;
  for (i=0;i<nResidues;i++)
    if (Residue[i])  {
      if (Residue[i]->nAtoms>0)  {
        if (j<i)  {
          Residue[j] = Residue[i];
          Residue[j]->index = j;
          Residue[i] = NULL;
        }
        j++;
      } else  {
        delete Residue[i];
        Residue[i] = NULL;
      }
    }
  nResidues = j;
  Exclude   = True;
}

int  CChain::AddResidue ( PCResidue res )  {
//  modify both CModel::Copy methods simultaneously!
//
//  Copy(PCModel,PPCAtom,int&) copies atoms into array 'atom'
// starting from position atom_index. 'atom' should be able to
// accept all new atoms - no checks on the length of 'atom'
// is being made. This function should not be used in applications.
  return InsResidue ( res,nResidues );
}

/*
PCMMDBFile mmdbfile;
PCChain    chain1;
int        i;

  for (i=0;i<nResidues;i++)
    if (Residue[i]==res)  return -i;  // this residue is already there

  if (res)  {

    mmdbfile = PCMMDBFile(GetCoordHierarchy());

    // get space for new residue
    if (nResidues>=ResLen)
      ExpandResidueArray ( 100 );

    if (res->GetCoordHierarchy())  {
      Residue[nResidues] = newCResidue();
      Residue[nResidues]->SetChain ( this );
      Residue[nResidues]->SetResID ( res->name,res->seqNum,res->insCode );
      if (mmdbfile)  {
        // get space for new atoms
        mmdbfile->AddAtomArray ( res->GetNumberOfAtoms(True) );
        Residue[nResidues]->Copy ( res,mmdbfile->Atom,mmdbfile->nAtoms );
      } else  {
        for (i=0;i<res->nAtoms;i++)
          Residue[nResidues]->AddAtom ( res->atom[i] );
      }
    } else  {
      Residue[nResidues] = res;
      chain1 = res->GetChain();
      if (chain1)
        for (i=0;i<chain1->nResidues;i++)
          if (chain1->Residue[i]==res)  {
            chain1->Residue[i] = NULL;
            break;
          }
      Residue[nResidues]->SetChain ( this );
      if (mmdbfile)
        Residue[nResidues]->CheckInAtoms();
    }
    nResidues++;

  }

  return nResidues;

}
*/

int  CChain::InsResidue ( PCResidue res, int seqNum,
                          const InsCode insCode )  {
  return InsResidue ( res,GetResidueNo(seqNum,insCode) );
}

int  CChain::InsResidue ( PCResidue res, int pos )  {
//   Inserts residue res onto position pos of the chain,
// pos=0..nResidues-1 . Residues pos..nResidues-1 are
// shifted up the chain.
//   The function places new atoms on the top of atom
// index. It is advisable to call
// CMMDBFile::PDBCleanup ( PDBCLEAN_INDEX ) after all
// insertions are done.
PCMMDBFile mmdbfile;
PCChain    chain1;
int        i,pp;

  pp = IMax ( 0,IMin(nResidues,pos) );

  for (i=0;i<nResidues;i++)
    if (Residue[i]==res)  return -i;  // this residue is already there

  if (res)  {

    mmdbfile = PCMMDBFile(GetCoordHierarchy());

    // get space for new residue
    if (nResidues>=ResLen)
      ExpandResidueArray ( 100 );

    // shift residues to the end of the chain as necessary
    for (i=nResidues;i>pp;i--)
      Residue[i] = Residue[i-1];

    // insert the new residue
    if (res->GetCoordHierarchy())  {
      Residue[pp] = newCResidue();
      Residue[pp]->SetChain ( this );
      Residue[pp]->SetResID ( res->name,res->seqNum,res->insCode );
      if (mmdbfile)  {
        // get space for new atoms
        mmdbfile->AddAtomArray ( res->GetNumberOfAtoms(True) );
        Residue[pp]->_copy ( res,mmdbfile->Atom,mmdbfile->nAtoms );
      } else  {
        for (i=0;i<res->nAtoms;i++)
          Residue[pp]->AddAtom ( res->atom[i] );
      }
    } else  {
      Residue[pp] = res;
      chain1 = res->GetChain();
      if (chain1)
        for (i=0;i<chain1->nResidues;i++)
          if (chain1->Residue[i]==res)  {
            chain1->Residue[i] = NULL;
            break;
          }
      Residue[pp]->SetChain ( this );
      if (mmdbfile)
        Residue[pp]->CheckInAtoms();
    }
    nResidues++;

  }

  return nResidues;

}


// --------------------  Extracting atoms  -----------------------

int CChain::GetNumberOfAtoms ( Boolean countTers )  {
int i,na;
  na = 0;
  for (i=0;i<nResidues;i++)
    if (Residue[i])  na += Residue[i]->GetNumberOfAtoms ( countTers );
  return na;
}

int CChain::GetNumberOfAtoms ( int seqNo, const InsCode insCode )  {
PCResidue res;
  res = GetResidue ( seqNo,insCode );
  if (res)  return res->nAtoms;
  return 0;
}

int CChain::GetNumberOfAtoms ( int resNo )  {
  if ((0<=resNo) && (resNo<nResidues))  {
    if (Residue[resNo])  return Residue[resNo]->nAtoms;
  }
  return 0;
}

PCAtom CChain::GetAtom ( int            seqNo,
                         const InsCode  insCode,
                         const AtomName aname,
                         const Element  elmnt,
                         const AltLoc   aloc )  {
PCResidue res;
  res = GetResidue ( seqNo,insCode );  
  if (res) return res->GetAtom ( aname,elmnt,aloc );
  return NULL;
}

PCAtom CChain::GetAtom ( int seqNo, const InsCode insCode,
                         int atomNo )  {
PCResidue res;
  res = GetResidue ( seqNo,insCode );  
  if (res)  {
    if ((0<=atomNo) && (atomNo<res->nAtoms))
      return res->atom[atomNo];
  }
  return NULL;
}

PCAtom CChain::GetAtom ( int            resNo,
                         const AtomName aname,
                         const Element  elmnt,
                         const AltLoc   aloc )  {
  if ((0<=resNo) && (resNo<nResidues))  {
    if (Residue[resNo])
      return Residue[resNo]->GetAtom ( aname,elmnt,aloc );
  }
  return NULL;
}

PCAtom CChain::GetAtom ( int resNo, int atomNo )  {
PCResidue res;
  if ((0<=resNo) && (resNo<nResidues))  {
    res = Residue[resNo];  
    if (res)  {
      if ((0<=atomNo) && (atomNo<res->nAtoms))
        return res->atom[atomNo];
    }
  }
  return NULL;
}

void CChain::GetAtomTable ( int seqNo, const InsCode insCode,
                         PPCAtom & atomTable, int & NumberOfAtoms )  {
PCResidue res;
  atomTable     = NULL;
  NumberOfAtoms = 0;
  res = GetResidue ( seqNo,insCode );
  if (res)  {
    atomTable     = res->atom;
    NumberOfAtoms = res->nAtoms;
  }
}

void CChain::GetAtomTable ( int resNo, PPCAtom & atomTable,
                            int & NumberOfAtoms )  {
PCResidue res;
  atomTable     = NULL;
  NumberOfAtoms = 0;
  if ((0<=resNo) && (resNo<nResidues))  {
    res = Residue[resNo];
    if (res)  {
      atomTable     = res->atom;
      NumberOfAtoms = res->nAtoms;
    }
  }
}


void CChain::GetAtomTable1 ( int seqNo, const InsCode insCode,
                             PPCAtom & atomTable, int & NumberOfAtoms )  {
PCResidue res;
  res = GetResidue ( seqNo,insCode );
  if (res)
    res->GetAtomTable1 ( atomTable,NumberOfAtoms );
  else  {
    if (atomTable)  delete[] atomTable;
    atomTable     = NULL;
    NumberOfAtoms = 0;
  }
}

void CChain::GetAtomTable1 ( int resNo, PPCAtom & atomTable,
                             int & NumberOfAtoms )  {
PCResidue res;
  if ((0<=resNo) && (resNo<nResidues)) 
       res = Residue[resNo];
  else res = NULL;
  if (res)
    res->GetAtomTable1 ( atomTable,NumberOfAtoms );
  else  {
    if (atomTable)  delete[] atomTable;
    atomTable     = NULL;
    NumberOfAtoms = 0;
  }
}

int CChain::DeleteAtom ( int            seqNo,
                         const InsCode  insCode,
                         const AtomName aname,
                         const Element  elmnt,
                         const AltLoc   aloc )  {
PCResidue res;
  res = GetResidue ( seqNo,insCode );  
  if (res) return res->DeleteAtom ( aname,elmnt,aloc );
  return 0;
}

int CChain::DeleteAtom ( int seqNo, const InsCode insCode,
                         int atomNo )  {
PCResidue res;
  res = GetResidue ( seqNo,insCode );  
  if (res) return res->DeleteAtom ( atomNo );
  return 0;
}

int CChain::DeleteAtom ( int            resNo,
                         const AtomName aname,
                         const Element  elmnt,
                         const AltLoc   aloc )  {
  if ((0<=resNo) && (resNo<nResidues))  {
    if (Residue[resNo])
      return Residue[resNo]->DeleteAtom ( aname,elmnt,aloc );
  }
  return 0;
}

int CChain::DeleteAtom ( int resNo, int atomNo )  {
  if ((0<=resNo) && (resNo<nResidues))  {
    if (Residue[resNo])
      return Residue[resNo]->DeleteAtom ( atomNo );
  }
  return 0;
}


int CChain::DeleteAllAtoms ( int seqNo, const InsCode insCode )  {
PCResidue res;
  res = GetResidue ( seqNo,insCode );  
  if (res) return res->DeleteAllAtoms();
  return 0;
}

int CChain::DeleteAllAtoms ( int resNo )  {
  if ((0<=resNo) && (resNo<nResidues))  {
    if (Residue[resNo])
      return Residue[resNo]->DeleteAllAtoms();
  }
  return 0;
}

int CChain::DeleteAllAtoms()  {
int i,k;
  k = 0;
  for (i=0;i<nResidues;i++)
    if (Residue[i])
      k += Residue[i]->DeleteAllAtoms();
  return k;
}

int CChain::DeleteAltLocs()  {
//  This function leaves only alternative location with maximal
// occupancy, if those are equal or unspecified, the one with
// "least" alternative location indicator.
//  The function returns the number of deleted. All tables remain
// untrimmed, so that explicit trimming or calling FinishStructEdit()
// is required.
int i,n;

  n = 0;
  for (i=0;i<nResidues;i++)
    if (Residue[i])  n += Residue[i]->DeleteAltLocs();

  return n;

}


int CChain::AddAtom ( int seqNo, const InsCode insCode,
                      PCAtom atom )  {
PCResidue res;
  res = GetResidue ( seqNo,insCode );  
  if (res) return res->AddAtom ( atom );
  return 0;
}

int CChain::AddAtom ( int resNo, PCAtom atom )  {
  if ((0<=resNo) && (resNo<nResidues))  {
    if (Residue[resNo])
      return Residue[resNo]->AddAtom ( atom );
  }
  return 0;
}


void  CChain::Copy ( PCChain Chain )  {
// modify both CChain::_copy and CChain::Copy methods simultaneously!
int i;

  FreeMemory();

  strcpy ( chainID    ,Chain->chainID     );
  strcpy ( prevChainID,Chain->prevChainID );

  DBReference.Copy ( &(Chain->DBReference) );
  SeqAdv     .Copy ( &(Chain->SeqAdv)      );  //  SEQADV records
  SeqRes     .Copy ( &(Chain->SeqRes)      );  //  SEQRES data
  ModRes     .Copy ( &(Chain->ModRes)      );  //  MODRES records
  Het        .Copy ( &(Chain->Het)         );  //  HET    records

  nResidues = Chain->nResidues;
  ResLen    = nResidues;
  if (nResidues>0)  {
    Residue = new PCResidue[nResidues];
    for (i=0;i<nResidues;i++)  {
      Residue[i] = newCResidue();
      Residue[i]->SetChain ( this );
      Residue[i]->Copy ( Chain->Residue[i] );
    }
  }

}

void  CChain::_copy ( PCChain Chain )  {
// modify both CChain::_copy and CChain::Copy methods simultaneously!
int i;

  FreeMemory();

  strcpy ( chainID    ,Chain->chainID     );
  strcpy ( prevChainID,Chain->prevChainID );

  DBReference.Copy ( &(Chain->DBReference) );
  SeqAdv     .Copy ( &(Chain->SeqAdv)      );  //  SEQADV records
  SeqRes     .Copy ( &(Chain->SeqRes)      );  //  SEQRES data
  ModRes     .Copy ( &(Chain->ModRes)      );  //  MODRES records
  Het        .Copy ( &(Chain->Het)         );  //  HET    records

  nResidues = Chain->nResidues;
  ResLen    = nResidues;
  if (nResidues>0)  {
    Residue = new PCResidue[nResidues];
    for (i=0;i<nResidues;i++)  {
      Residue[i] = newCResidue();
      Residue[i]->SetChain ( this );
      Residue[i]->_copy ( Chain->Residue[i] );
    }
  }

}

void  CChain::_copy ( PCChain Chain, PPCAtom atom, int & atom_index )  {
// modify both CChain::_copy and CChain::Copy methods simultaneously!
int i;

  FreeMemory();

  strcpy ( chainID    ,Chain->chainID     );
  strcpy ( prevChainID,Chain->prevChainID );

  DBReference.Copy ( &(Chain->DBReference) );
  SeqAdv     .Copy ( &(Chain->SeqAdv)      );  //  SEQADV records
  SeqRes     .Copy ( &(Chain->SeqRes)      );  //  SEQRES data
  ModRes     .Copy ( &(Chain->ModRes)      );  //  MODRES records
  Het        .Copy ( &(Chain->Het)         );  //  HET    records

  nResidues = Chain->nResidues;
  ResLen    = nResidues;
  if (nResidues>0)  {
    Residue = new PCResidue[nResidues];
    for (i=0;i<nResidues;i++)
      if (Chain->Residue[i])  {
        Residue[i] = newCResidue();
        Residue[i]->SetChain ( this );
        Residue[i]->_copy ( Chain->Residue[i],atom,atom_index );
      } else
        Residue[i] = NULL;
  }

}

/*
void  CChain::Duplicate ( PCChain Chain )  {
int i;

  FreeMemory();

  strcpy ( chainID    ,Chain->chainID     );
  strcpy ( prevChainID,Chain->prevChainID );

  DBReference.Copy ( &(Chain->DBReference) );
  SeqAdv     .Copy ( &(Chain->SeqAdv)      );  //  SEQADV records
  SeqRes     .Copy ( &(Chain->SeqRes)      );  //  SEQRES data
  ModRes     .Copy ( &(Chain->ModRes)      );  //  MODRES records
  Het        .Copy ( &(Chain->Het)         );  //  HET    records

  nResidues = Chain->nResidues;
  ResLen    = nResidues;
  if (nResidues>0)  {
    Residue = new PCResidue[nResidues];
    for (i=0;i<nResidues;i++)  {
      Residue[i] = newCResidue();
      Residue[i]->SetChain ( this );
      Residue[i]->Duplicate ( Chain->Residue[i] );
    }
  }

}
*/

pstr  CChain::GetEntryID()  {
  if (model)  return model->GetEntryID();
        else  return pstr("");
}

void  CChain::SetEntryID ( const IDCode idCode )  {
  if (model) model->SetEntryID ( idCode );
}

int   CChain::GetModelNum()  {
  if (model)  return model->GetSerNum();
  return 0;
}

pstr  CChain::GetChainID ( pstr ChID )  {
  ChID[0] = char(0);
  if (model)
       sprintf ( ChID,"/%i/",model->GetSerNum() );
  else strcpy  ( ChID,"/-/" );
  strcat ( ChID,chainID );
  return ChID;
}


void  CChain::GetAtomStatistics  ( RSAtomStat AS )  {
  AS.Init();
  CalcAtomStatistics ( AS );
  AS.Finish();
}

void  CChain::CalcAtomStatistics ( RSAtomStat AS )  {
int i;
  for (i=0;i<nResidues;i++)
    if (Residue[i])
      Residue[i]->CalcAtomStatistics ( AS );
}

void  CChain::ApplyTransform ( mat44 & TMatrix )  {
// transforms all coordinates by multiplying with matrix TMatrix
int i;
  for (i=0;i<nResidues;i++)
    if (Residue[i])  Residue[i]->ApplyTransform ( TMatrix );
}

Boolean CChain::isSolventChain()  {
// returns True if chain contains only solvent molecules
Boolean B,P;
int     i;
  B = True;
  P = False;
  for (i=0;(i<nResidues) && B;i++)
    if (Residue[i])  {
      P = True;
      B = Residue[i]->isSolvent();
    }
  return (B && P);
}

Boolean CChain::isInSelection ( int selHnd )  {
PCMMDBFile mmdbfile = (PCMMDBFile)GetCoordHierarchy();
PCMask     Mask;
  if (mmdbfile)  {
    Mask = mmdbfile->GetSelMask ( selHnd );
    if (Mask)  return CheckMask ( Mask );
  }
  return False;
}

Boolean CChain::isAminoacidChain()  {
// returns True if chain contains at least one aminoacid residue
Boolean B,P;
int     i;
  B = False;
  P = False;
  for (i=0;(i<nResidues) && (!B);i++)
    if (Residue[i])  {
      P = True;
      B = Residue[i]->isAminoacid();
    }
  return (B && P);
}

Boolean CChain::isNucleotideChain()  {
// returns True if chain contains at least one nucleotide residue
Boolean B,P;
int     i;
  B = False;
  P = False;
  for (i=0;(i<nResidues) && (!B);i++)
    if (Residue[i])  {
      P = True;
      B = Residue[i]->isNucleotide();
    }
  return (B && P);
}

int  CChain::CheckID ( const ChainID chID )  {
  if (chID)  {
    if (!strcmp(chID,chainID))  return 1;
  }
  return 0;
}

int  CChain::CheckIDS ( cpstr CID )  {
ChainID  chn;
InsCode  inscode;
ResName  resname;
AtomName atm;
Element  elm;
AltLoc   aloc;
int      mdl,sn,rc;

  rc = ParseAtomPath ( CID,mdl,chn,sn,inscode,resname,
                       atm,elm,aloc,NULL );
  if (rc>=0)  {
    if (!strcmp(chn,chainID))  return 1;
  }
  return 0;

}

int  CChain::GetNumberOfDBRefs()  {
  return  DBReference.Length();
}

PCDBReference  CChain::GetDBRef ( int dbRefNo )  {
  return  (PCDBReference)DBReference.GetContainerClass ( dbRefNo );
}


void  CChain::MaskAtoms ( PCMask Mask )  {
int i;
  for (i=0;i<nResidues;i++)
    if (Residue[i])  Residue[i]->MaskAtoms ( Mask );
}

void  CChain::MaskResidues ( PCMask Mask )  {
int i;
  for (i=0;i<nResidues;i++)
    if (Residue[i])  Residue[i]->SetMask ( Mask );
}

void  CChain::UnmaskAtoms ( PCMask Mask )  {
int i;
  for (i=0;i<nResidues;i++)
    if (Residue[i])  Residue[i]->UnmaskAtoms ( Mask );
}

void  CChain::UnmaskResidues ( PCMask Mask )  {
int i;
  for (i=0;i<nResidues;i++)
    if (Residue[i])  Residue[i]->RemoveMask ( Mask );
}




// -------  user-defined data handlers

int  CChain::PutUDData ( int UDDhandle, int iudd )  {
  if (UDDhandle & UDRF_CHAIN)
        return  CUDData::putUDData ( UDDhandle,iudd );
  else  return  UDDATA_WrongUDRType;
}

int  CChain::PutUDData ( int UDDhandle, realtype rudd )  {
  if (UDDhandle & UDRF_CHAIN)
        return  CUDData::putUDData ( UDDhandle,rudd );
  else  return  UDDATA_WrongUDRType;
}

int  CChain::PutUDData ( int UDDhandle, cpstr sudd )  {
  if (UDDhandle & UDRF_CHAIN)
        return  CUDData::putUDData ( UDDhandle,sudd );
  else  return  UDDATA_WrongUDRType;
}

int  CChain::GetUDData ( int UDDhandle, int & iudd )  {
  if (UDDhandle & UDRF_CHAIN)
        return  CUDData::getUDData ( UDDhandle,iudd );
  else  return  UDDATA_WrongUDRType;
}

int  CChain::GetUDData ( int UDDhandle, realtype & rudd )  {
  if (UDDhandle & UDRF_CHAIN)
        return  CUDData::getUDData ( UDDhandle,rudd );
  else  return  UDDATA_WrongUDRType;
}

int  CChain::GetUDData ( int UDDhandle, pstr sudd, int maxLen )  {
  if (UDDhandle & UDRF_CHAIN)
        return  CUDData::getUDData ( UDDhandle,sudd,maxLen );
  else  return  UDDATA_WrongUDRType;
}

int  CChain::GetUDData ( int UDDhandle, pstr & sudd )  {
  if (UDDhandle & UDRF_CHAIN)
        return  CUDData::getUDData ( UDDhandle,sudd );
  else  return  UDDATA_WrongUDRType;
}




DefineClass(CSortResidues)

class CSortResidues : public CQuickSort  {
  public :
    CSortResidues() : CQuickSort() {}
    int  Compare ( int i, int j );
    void Swap    ( int i, int j );
    void Sort    ( PPCResidue res, int nresidues );
};

int CSortResidues::Compare ( int i, int j )  {
int diff;
  diff = ((PPCResidue)data)[i]->seqNum - ((PPCResidue)data)[j]->seqNum;
  if (diff==0)
    diff = strcmp( (PPCResidue(data))[i]->insCode,
                   (PPCResidue(data))[j]->insCode );
  if (diff>0)  return  1;
  if (diff<0)  return -1;
  return 0;
}

void CSortResidues::Swap ( int i, int j )  {
PCResidue res;
  res = ((PPCResidue)data)[i];
  ((PPCResidue)data)[i] = ((PPCResidue)data)[j];
  ((PPCResidue)data)[j] = res;
}

void CSortResidues::Sort ( PPCResidue res, int nresidues )  {
  CQuickSort::Sort ( &(res[0]),nresidues );
}

void  CChain::SortResidues()  {
CSortResidues SR;
  TrimResidueTable();
  SR.Sort ( Residue,nResidues );
}

int  CChain::GetNofModResidues()  {
  return ModRes.Length();
}

PCModRes  CChain::GetModResidue ( int modResNo )  {
  return  PCModRes(ModRes.GetContainerClass(modResNo));
}

void  CChain::write ( RCFile f )  {
int  i;
byte Version=1;

  f.WriteByte ( &Version );

  CUDData::write ( f );

  f.WriteTerLine ( chainID    ,False );
  f.WriteTerLine ( prevChainID,False );

  DBReference.write ( f );  //  Database reference
  SeqAdv     .write ( f );  //  SEQADV records
  SeqRes     .write ( f );  //  SEQRES data
  ModRes     .write ( f );  //  MODRES records
  Het        .write ( f );  //  HET    records

  f.WriteInt ( &nResidues );
  for (i=0;i<nResidues;i++)
    Residue[i]->write ( f );
  
}

void  CChain::read ( RCFile f )  {
//   The Atom array in CMMDBFile must be already read
// prior to calling this function!
int  i;
byte Version;

  FreeMemory();

  f.ReadByte ( &Version );

  CUDData::read ( f );

  f.ReadTerLine ( chainID    ,False );
  f.ReadTerLine ( prevChainID,False );

  DBReference.read ( f );   //  Database reference
  SeqAdv     .read ( f );   //  SEQADV records
  SeqRes     .read ( f );   //  SEQRES data
  ModRes     .read ( f );   //  MODRES records
  Het        .read ( f );   //  HET    records

  SetChain ( chainID );

  f.ReadInt ( &nResidues );
  ResLen = nResidues;
  if (nResidues>0)  {
    Residue = new PCResidue[nResidues];
    for (i=0;i<nResidues;i++)  {
      Residue[i] = newCResidue();
      Residue[i]->SetChain ( this );
      Residue[i]->read ( f );
    }
  }

}


MakeFactoryFunctions(CChain)



// ===================================================================

  /*
void  TestChain() {
//  reads from 'in.chain', writes into 
//  'out.chain' and 'abin.chain'
CFile    f;
char     S[81];
PCChain  Chain;

  Chain = newCChain();

  f.assign ( "in.chain",True );
  if (f.reset()) {
    while (!f.FileEnd()) {
      f.ReadLine ( S,sizeof(S) );
      Chain->ConvertPDBString ( S );
    }
    f.shut();
  } else {
    printf ( " Can't open input file 'in.chain' \n" );
    delete Chain;
    return;
  }
   
  f.assign ( "out.chain",True );
  if (f.rewrite()) {
    Chain->PDBASCIIDump ( f );
    f.shut();
  } else {
    printf ( " Can't open output file 'out.chain' \n" );
    delete Chain;
    return;
  }


  f.assign ( "mmdb.chain.bin",False );
  if (f.rewrite()) {
    Chain->write ( f );
    f.shut();
  } else {
    printf ( "  Can't open binary chain file for writing.\n" );
    delete Chain;
    return;
  }
  
  delete Chain;
  printf ( "   Chain deleted.\n" );
  
  Chain = newCChain();
  if (f.reset()) {
    Chain->read ( f );
    f.shut();
  } else {
    printf ( "  Can't open binary chain file for reading.\n" );
    delete Chain;
    return;
  }
   
  f.assign ( "abin.chain",True );
  if (f.rewrite()) {
    Chain->PDBASCIIDump ( f );
    f.shut();
  } else 
    printf ( " Can't open output file 'abin.chain' \n" );

  delete Chain;

}
  */
