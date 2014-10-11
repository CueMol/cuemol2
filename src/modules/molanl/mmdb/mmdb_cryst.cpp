//  $Id: mmdb_cryst.cpp,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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
//  **** Module  :  MMDB_Cryst  <implementation>
//       ~~~~~~~~~
//  **** Project :  MacroMolecular Data Base (MMDB)
//       ~~~~~~~~~ 
//  **** Classes :  CCrystContainer ( container for cryst.  data    )
//       ~~~~~~~~~  CNCSMatrix      ( non-cryst. symm. matrix class )
//                  CTVect          ( translational vector class    )
//                  CMMDBCryst      ( MMDB cryst. section class     )
//
//  (C) E. Krissinel 2000-2008
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

#ifndef  __MMDB_Cryst__
#include "mmdb_cryst.h"
#endif

#ifndef  __MMDB_Defs__
#include "mmdb_defs.h"
#endif

#ifndef  __MMDB_CIFDefs__
#include "mmdb_cifdefs.h"
#endif


//  ==============  CCrystContainer  ====================

PCContainerClass CCrystContainer::MakeContainerClass ( int ClassID )  {
  switch (ClassID)  {
    default :
    case ClassID_Template  :
                  return  CClassContainer::MakeContainerClass(ClassID);
    case ClassID_NCSMatrix : return new CNCSMatrix();
    case ClassID_TVect     : return new CTVect    ();
  }
}

int CCrystContainer::AddMTRIXLine ( cpstr S )  {
int i,RC;
  RC = Error_NCSM_WrongSerial;
  for (i=0;i<length;i++)  {
    RC = PCNCSMatrix(Container[i])->ConvertPDBASCII(S);
    if (RC==0)  break;
    if (RC!=Error_NCSM_WrongSerial) break;
  }
  return RC;
}

MakeStreamFunctions(CCrystContainer)


//  ================  CNCSMatrix  ===================

CNCSMatrix::CNCSMatrix() : CContainerClass()  {
  Init();
}

CNCSMatrix::CNCSMatrix ( cpstr S ) : CContainerClass()  {
  Init();
  ConvertPDBASCII ( S );
}

CNCSMatrix::CNCSMatrix ( RPCStream Object )
          : CContainerClass(Object)  {
  Init();
}

CNCSMatrix::~CNCSMatrix() {}

void  CNCSMatrix::Init()  {
int i,j;
  serNum = -1;   
  iGiven = -1;   
  for (i=0;i<3;i++)  {
    for (j=0;j<3;j++)
      m[i][j] = 0.0;
    m[i][i] = 1.0;
    v[i] = 0.0;
  }
  WhatIsSet = 0;  // nothing is set
}

Boolean  CNCSMatrix::PDBASCIIDump1 ( RCFile f )  {
//  makes the ASCII PDB MATRIXn lines if all
//  of them were set.
char S[100];
int  i,j;

  if ((WhatIsSet & NCSMSET_All)==NCSMSET_All)  
    for (i=0;i<3;i++)  {
      sprintf   ( S,"MTRIX%1i %3i",i+1,serNum );
      PadSpaces ( S,80 );
      for (j=0;j<3;j++)
        PutRealF ( &(S[10+j*10]),m[i][j],10,6 );
      PutRealF ( &(S[45]),v[i],10,5 );
      if (iGiven)  S[59] = '1';
      f.WriteLine ( S );
    }

  return True;  // container should use this virtual

}

int CNCSMatrix::ConvertPDBASCII ( cpstr S )  {
int      sN,iG;
realtype m0,m1,m2,v0;

  if (!(GetInteger(sN,&(S[7]) ,3 ) &&
        GetReal   (m0,&(S[10]),10) &&
        GetReal   (m1,&(S[20]),10) &&
        GetReal   (m2,&(S[30]),10) &&
        GetReal   (v0,&(S[45]),10)))
    return Error_NCSM_Unrecognized;

  if (S[59]=='1')  iG = 1;
             else  iG = 0;

  if (WhatIsSet & NCSMSET_All)  {
    if (sN!=serNum)  return Error_NCSM_WrongSerial;
    if (iG!=iGiven)  return Error_NCSM_UnmatchIG;
  }

  if (!strncmp(S,"MTRIX1",6))  {

    if (WhatIsSet & NCSMSET_Matrix1)  return Error_NCSM_AlreadySet;
    serNum  = sN;
    iGiven  = iG;
    m[0][0] = m0;
    m[0][1] = m1;
    m[0][2] = m2;
    v[0]    = v0;
    WhatIsSet |= NCSMSET_Matrix1;

  } else if (!strncmp(S,"MTRIX2",6))  {

    if (WhatIsSet & NCSMSET_Matrix2)  return Error_NCSM_AlreadySet;
    serNum  = sN;
    iGiven  = iG;
    m[1][0] = m0;
    m[1][1] = m1;
    m[1][2] = m2;
    v[1]    = v0;
    WhatIsSet |= NCSMSET_Matrix2;

  } else if (!strncmp(S,"MTRIX3",6))  {

    if (WhatIsSet & NCSMSET_Matrix3)  return Error_NCSM_AlreadySet;
    serNum  = sN;
    iGiven  = iG;
    m[2][0] = m0;
    m[2][1] = m1;
    m[2][2] = m2;
    v[2]    = v0;
    WhatIsSet |= NCSMSET_Matrix3;

  } else
    return Error_WrongSection;

  return 0;

}

void  CNCSMatrix::MakeCIF ( PCMMCIFData CIF, int N )  {
PCMMCIFLoop Loop;
int         RC;
  RC = CIF->AddLoop ( CIFCAT_STRUCT_NCS_OPER,Loop );
  if ((RC!=CIFRC_Ok) || (N==0))  {
    // the category was (re)created, provide tags
    Loop->AddLoopTag ( CIFTAG_ID       );
    Loop->AddLoopTag ( CIFTAG_MATRIX11 );
    Loop->AddLoopTag ( CIFTAG_MATRIX12 );
    Loop->AddLoopTag ( CIFTAG_MATRIX13 );
    Loop->AddLoopTag ( CIFTAG_VECTOR1  );
    Loop->AddLoopTag ( CIFTAG_MATRIX21 );
    Loop->AddLoopTag ( CIFTAG_MATRIX22 );
    Loop->AddLoopTag ( CIFTAG_MATRIX23 );
    Loop->AddLoopTag ( CIFTAG_VECTOR2  );
    Loop->AddLoopTag ( CIFTAG_MATRIX31 );
    Loop->AddLoopTag ( CIFTAG_MATRIX32 );
    Loop->AddLoopTag ( CIFTAG_MATRIX33 );
    Loop->AddLoopTag ( CIFTAG_VECTOR3  );
    Loop->AddLoopTag ( CIFTAG_CODE     );
  }
  Loop->AddInteger ( serNum  );
  if (WhatIsSet & NCSMSET_Matrix1) {
    Loop->AddReal ( m[0][0] );
    Loop->AddReal ( m[0][1] );
    Loop->AddReal ( m[0][2] );
    Loop->AddReal ( v[0]    );
  } else  {
    Loop->AddString ( NULL );
    Loop->AddString ( NULL );
    Loop->AddString ( NULL );
    Loop->AddString ( NULL );
  }
  if (WhatIsSet & NCSMSET_Matrix2) {
    Loop->AddReal ( m[1][0] );
    Loop->AddReal ( m[1][1] );
    Loop->AddReal ( m[1][2] );
    Loop->AddReal ( v[1]    );
  } else  {
    Loop->AddString ( NULL );
    Loop->AddString ( NULL );
    Loop->AddString ( NULL );
    Loop->AddString ( NULL );
  }
  if (WhatIsSet & NCSMSET_Matrix3) {
    Loop->AddReal ( m[2][0] );
    Loop->AddReal ( m[2][1] );
    Loop->AddReal ( m[2][2] );
    Loop->AddReal ( v[2]    );
  } else  {
    Loop->AddString ( NULL );
    Loop->AddString ( NULL );
    Loop->AddString ( NULL );
    Loop->AddString ( NULL );
  }
  if (iGiven==1)  Loop->AddString ( pstr("generated") );
            else  Loop->AddNoData ( CIF_NODATA_DOT    );
}

void  CNCSMatrix::GetCIF ( PCMMCIFData CIF, int & Signal )  {
PCMMCIFLoop Loop;
char        Code[100];

  Loop = CIF->GetLoop ( CIFCAT_STRUCT_NCS_OPER );
  if (!Loop)  {
    Signal = -1;  // signal to finish processing of this structure
    return;
  }

  if (Signal>=Loop->GetLoopLength())  {
    Signal = -1;
    return;
  }

  WhatIsSet = 0;
  if (CIFGetInteger(serNum,Loop,CIFTAG_ID,Signal))  return;
  if (CIFGetString(Code,Loop,CIFTAG_CODE,Signal,sizeof(Code),
      pstr("")))
    iGiven = MinInt4;
  else if (!strcasecmp(Code,"generated"))
    iGiven = 1;
  else
    iGiven = MinInt4;
   

  if (CIFGetReal(m[0][0],Loop,CIFTAG_MATRIX11,Signal))  return;
  if (CIFGetReal(m[0][1],Loop,CIFTAG_MATRIX12,Signal))  return;
  if (CIFGetReal(m[0][2],Loop,CIFTAG_MATRIX13,Signal))  return;
  if (CIFGetReal(v[0]   ,Loop,CIFTAG_VECTOR1 ,Signal))  return;
  WhatIsSet |= NCSMSET_Matrix1;

  if (CIFGetReal(m[1][0],Loop,CIFTAG_MATRIX21,Signal))  return;
  if (CIFGetReal(m[1][1],Loop,CIFTAG_MATRIX22,Signal))  return;
  if (CIFGetReal(m[1][2],Loop,CIFTAG_MATRIX23,Signal))  return;
  if (CIFGetReal(v[1]   ,Loop,CIFTAG_VECTOR2 ,Signal))  return;
  WhatIsSet |= NCSMSET_Matrix2;

  if (CIFGetReal(m[2][0],Loop,CIFTAG_MATRIX31,Signal))  return;
  if (CIFGetReal(m[2][1],Loop,CIFTAG_MATRIX32,Signal))  return;
  if (CIFGetReal(m[2][2],Loop,CIFTAG_MATRIX33,Signal))  return;
  if (CIFGetReal(v[2]   ,Loop,CIFTAG_VECTOR3 ,Signal))  return;
  WhatIsSet |= NCSMSET_Matrix3;

  Signal++;

}

void  CNCSMatrix::SetNCSMatrix ( int serialNum,
                                 mat33 & ncs_m, vect3 & ncs_v,
                                 int i_Given )  {
int i,j;
  serNum = serialNum;
  for (i=0;i<3;i++)  {
    for (j=0;j<3;j++)
      m[i][j] = ncs_m[i][j];
    v[i] = ncs_v[i];
  }
  iGiven     = i_Given;
  WhatIsSet |= NCSMSET_All;
}

void  CNCSMatrix::Copy ( PCContainerClass NCSMatrix )  {
int i,j;

  serNum = PCNCSMatrix(NCSMatrix)->serNum;
  iGiven = PCNCSMatrix(NCSMatrix)->iGiven;

  for (i=0;i<3;i++)  {
    for (j=0;j<3;j++)
      m[i][j] = PCNCSMatrix(NCSMatrix)->m[i][j];
    v[i] = PCNCSMatrix(NCSMatrix)->v[i];
  }

  WhatIsSet = PCNCSMatrix(NCSMatrix)->WhatIsSet;

}
    
void  CNCSMatrix::write ( RCFile f )  {
int  i,j;
byte Version=1;
  f.WriteByte ( &Version );
  f.WriteInt  ( &serNum  );
  f.WriteInt  ( &iGiven  );
  for (i=0;i<3;i++)  {
    for (j=0;j<3;j++)
      f.WriteReal ( &(m[i][j]) );
    f.WriteReal ( &(v[i]) );
  }
  f.WriteWord ( &WhatIsSet );
}

void  CNCSMatrix::read ( RCFile f ) {
int  i,j;
byte Version;
  f.ReadByte ( &Version );
  f.ReadInt  ( &serNum  );
  f.ReadInt  ( &iGiven  );
  for (i=0;i<3;i++)  {
    for (j=0;j<3;j++)
      f.ReadReal ( &(m[i][j]) );
    f.ReadReal ( &(v[i]) );
  }
  f.ReadWord ( &WhatIsSet );
}

MakeStreamFunctions(CNCSMatrix)



//  ================  CTVect  ===================

CTVect::CTVect() : CContainerClass()  {
  Init();
}

CTVect::CTVect ( cpstr S ) : CContainerClass()  {
  Init();
  ConvertPDBASCII ( S );
}

CTVect::CTVect ( RPCStream Object ) : CContainerClass(Object)  {
  Init();
}

CTVect::~CTVect()  {
  if (comment)  delete[] comment;
}

void CTVect::Init()  {
  serNum  = -1;
  t[0]    = 0.0;
  t[1]    = 0.0;
  t[2]    = 0.0;
  comment = NULL;
}

void CTVect::PDBASCIIDump ( pstr S, int N )  {
//  makes the ASCII PDB TVECT line number N
  sprintf   ( S,"TVECT  %3i",serNum );
  PadSpaces ( S,80 );
  PutRealF  ( &(S[10]),t[0],10,5 );
  PutRealF  ( &(S[20]),t[1],10,5 );
  PutRealF  ( &(S[30]),t[2],10,5 );
  if (comment)
    strncpy ( &(S[40]),comment,IMin(30,strlen(comment)) );
}

int CTVect::ConvertPDBASCII ( cpstr S )  {
  GetInteger ( serNum ,&(S[7]) ,3  );
  GetReal    ( t[0]   ,&(S[10]),10 );
  GetReal    ( t[1]   ,&(S[20]),10 );
  GetReal    ( t[2]   ,&(S[30]),10 );
  CreateCopy ( comment,&(S[40])    );
  return 0;

}

void CTVect::MakeCIF ( PCMMCIFData CIF, int N )  {
PCMMCIFLoop Loop;
int         RC;
  RC = CIF->AddLoop ( CIFCAT_DATABASE_PDB_TVECT,Loop );
  if ((RC!=CIFRC_Ok) || (N==0))  {
    // the category was (re)created, provide tags
    Loop->AddLoopTag ( CIFTAG_ID      );
    Loop->AddLoopTag ( CIFTAG_VECTOR1 );
    Loop->AddLoopTag ( CIFTAG_VECTOR2 );
    Loop->AddLoopTag ( CIFTAG_VECTOR3 );
    Loop->AddLoopTag ( CIFTAG_DETAILS );
  }
  Loop->AddInteger ( serNum  );
  Loop->AddReal    ( t[0]    );
  Loop->AddReal    ( t[1]    );
  Loop->AddReal    ( t[2]    );
  Loop->AddString  ( comment );
}

void  CTVect::GetCIF ( PCMMCIFData CIF, int & Signal )  {
PCMMCIFLoop Loop;

  Loop = CIF->GetLoop ( CIFCAT_DATABASE_PDB_TVECT );
  if (!Loop)  {
    Signal = -1;  // signal to finish processing of this structure
    return;
  }

  if (Signal>=Loop->GetLoopLength())  {
    Signal = -1;
    return;
  }

  if (CIFGetInteger(serNum,Loop,CIFTAG_ID,Signal))  return;
  if (CIFGetReal(t[0],Loop,CIFTAG_VECTOR1,Signal))  return;
  if (CIFGetReal(t[1],Loop,CIFTAG_VECTOR2,Signal))  return;
  if (CIFGetReal(t[2],Loop,CIFTAG_VECTOR3,Signal))  return;
  Loop->GetString ( comment,CIFTAG_DETAILS,Signal,True );

  Signal++;

}


void  CTVect::Copy ( PCContainerClass TVect )  {
int i;
  serNum = PCTVect(TVect)->serNum;
  for (i=0;i<3;i++)
    t[i] = PCTVect(TVect)->t[i];
  CreateCopy ( comment,PCTVect(TVect)->comment );
}
    
void  CTVect::write ( RCFile f )  {
int  i;
byte Version=1;
  f.WriteByte ( &Version );
  f.WriteInt  ( &serNum  );
  for (i=0;i<3;i++)
    f.WriteReal ( &(t[i]) );
  f.CreateWrite ( comment );
}

void  CTVect::read ( RCFile f ) {
int  i;
byte Version;
  f.ReadByte ( &Version );
  f.ReadInt  ( &serNum  );
  for (i=0;i<3;i++)
    f.ReadReal ( &(t[i]) );
  f.CreateRead ( comment );
}

MakeStreamFunctions(CTVect)



//  =====================   CMMDBCryst   =======================

CMMDBCryst::CMMDBCryst() : CStream() {
  Init ( True );
}

CMMDBCryst::CMMDBCryst ( RPCStream Object ) : CStream(Object)  {
  Init ( True );
}

void  CMMDBCryst::Init ( Boolean fullInit )  {
int i,j,k;

  WhatIsSet = 0;  // nothing is set
  a         = 1.0;
  b         = 1.0;
  c         = 1.0;
  alpha     = 90.0;
  beta      = 90.0;
  gamma     = 90.0;
  strcpy ( spaceGroup   ,"" );
  strcpy ( spaceGroupFix,"" );
  Z         = 1;
  CellCheck = CCHK_NoCell;
  for (i=0;i<3;i++)  {
    for (j=0;j<3;j++)  {
      o[i][j] = 0.0;
      s[i][j] = 0.0;
      for (k=0;k<6;k++)
        RR[k][i][j] = 0.0;
    }
    o[i][i] = 1.0;
    s[i][i] = 1.0;
    t[i]    = 0.0;
    u[i]    = 0.0;
    for (k=0;k<6;k++)
      RR[k][i][i] = 1.0;
  }
  for (i=0;i<4;i++)  {
    for (j=0;j<4;j++)  {
      RO [i][j] = 0.0;
      RF [i][j] = 0.0;
      ROU[i][j] = 0.0;
      RFU[i][j] = 0.0;
    }
    RO [i][i] = 1.0;
    RF [i][i] = 1.0;
    ROU[i][i] = 1.0;
    RFU[i][i] = 1.0;
  }
  Vol    = 0.0;
  VolChk = 0.0;
  VolErr = 0.0;
  as     = 1.0;
  bs     = 1.0;
  cs     = 1.0;
  alphas = 90.0;
  betas  = 90.0;
  gammas = 90.0;
  
  for (k=0;k<6;k++)
    AC[k] = 0.0;

  NCode  = 0;

  if (fullInit)  {
    syminfo_lib  = NULL;
    ignoreScalei = False;   // flag to ignore SCALEi cards
  }

}

CMMDBCryst::~CMMDBCryst() {
  FreeMemory();
  if (syminfo_lib)  delete[] syminfo_lib;
}

void  CMMDBCryst::FreeMemory()  {
  NCSMatrix.FreeContainer();
  TVect    .FreeContainer();
  SymOps   .FreeMemory   ();
}

void  CMMDBCryst::Reset()  {
  FreeMemory();
  Init ( False );
}

cpstr rhombohedral[] = {
  cpstr("R 3"  ),
  cpstr("R 3"  ),
  cpstr("R 3 2"),
  cpstr("R 3 2")
};

cpstr short_mono[] = {
  cpstr("P 2" ),
  cpstr("P 21"),
  cpstr("C 2" ),
  cpstr("A 2" ),
  cpstr("B 2" ),
  cpstr("I 2" )
};

cpstr special[] = {
  cpstr("A1"     ),
            cpstr("Hall:  P 1 (-x,-1/2*y+1/2*z,1/2*y+1/2*z)"  ),
  cpstr("C1211"  ),
            cpstr("Hall:  C 2y (x+1/4,y+1/4,z)"               ),
  cpstr("C21"    ),
            cpstr("Hall:  C 2y (x+1/4,y+1/4,z)"               ),
  cpstr("I1211"  ),
            cpstr("Hall:  C 2y (x+1/4,y+1/4,-x+z-1/4)"        ),
  cpstr("I21"    ),
            cpstr("Hall:  C 2y (x+1/4,y+1/4,-x+z-1/4)"        ),
  cpstr("P21212A"),
            cpstr("Hall:  P 2 2ab (x+1/4,y+1/4,z)"            ),
  cpstr("F422"   ),
            cpstr("Hall:  I 4 2 (1/2*x+1/2*y,-1/2*x+1/2*y,z)" ),
  cpstr("C4212"  ),
            cpstr("Hall:  P 4 2 (1/2*x+1/2*y-1/4,-1/2*x+1/2*y-1/4,z)")
};



int  CMMDBCryst::FixSpaceGroup()  {
//  This function attempts to clean up the Brookhaven mess in space
// group naming, by checking the space group symbol with cell
// parameters.  Returns:
//
//     0    - space group symbol is correct, spaceGroupFix receives
//            a copy of spaceGroup
//     1    - space group symbol does not agree with cell parameters,
//            and fixed successfully. spaceGroupFix receives
//            the appropriate space group symbol
//    -1    - space group symbol does not agree with cell parameters,
//            however fix is not possible.  spaceGroupFix receives
//            a copy of spaceGroup
//    -2    - any checks are not possible because cell parameters
//            are not found, spaceGroupFix receives a copy of 
//            spaceGroup
//
realtype eps,m1,m2;
SymGroup s;
int      i,k;
char     c;

  strcpy ( spaceGroupFix,spaceGroup );

  if ((WhatIsSet & CSET_CellParams)!=CSET_CellParams)  return -2;

  eps = 0.01;

  k = -1;
  for (i=0;(i<4) && (k<0);i++)
    if (!strcmp(spaceGroup,rhombohedral[i]))  k = i;

  if (k>=0)  {
    c = 'N';
    if ((fabs(a-b)<=eps) && (fabs(alpha-90.0)<=eps) &&
        (fabs(beta-90.0)<=eps) && (fabs(gamma-120.0)<=eps))
      c = 'H';
    else {
      m1 = (a+b+c)/3.0;
      m2 = (alpha+beta+gamma)/3.0;
      if ((fabs(a-m1)<=eps) && (fabs(b-m1)<=eps) && 
          (fabs(c-m1)<=eps) &&
          (fabs(alpha-m2)<=eps) && (fabs(beta-m2)<=eps) &&
          (fabs(gamma-m2)<=eps))
        c = 'R';
    }
    if (c!=spaceGroup[0])  {
      if (c!='N')  {
        spaceGroupFix[0] = c;
        return 1;
      }
      return -1;
    }
    return 0;
  }

  for (i=0;(i<6) && (k<0);i++)
    if (!strcmp(spaceGroup,short_mono[i]))  k = i;

  if (k>=0)  {
    if ((fabs(alpha-90.0)<=eps) && (fabs(gamma-90.0)<=eps))  {
      if (spaceGroup[0]=='B')  return -1;
      sprintf ( spaceGroupFix,"%c 1 %s 1",spaceGroup[0],
                &(spaceGroup[2]) );
      return 1;
    }
    if ((fabs(alpha-90.0)<=eps) && (fabs(beta-90.0)<=eps))  {
      if (spaceGroup[0]=='C')  return -1;
      sprintf ( spaceGroupFix,"%c 1 1 %s",spaceGroup[0],
                &(spaceGroup[2]) );
      return 1;
    }
    return -1;
  }

  i = 0;
  k = 0;
  while (spaceGroup[i])  {
    if (spaceGroup[i]!=' ')  s[k++] = spaceGroup[i];
    i++;
  }
  s[k] = char(0);

  k = -1;
  for (i=0;(i<16) && (k<0);i+=2)
    if (!strcmp(s,special[i]))  k = i;

  if (k>=0)  {
    strcpy ( spaceGroupFix,special[k+1] );
    return 1;
  }

  return 0;

}

int  CMMDBCryst::ConvertPDBString ( pstr PDBString,
                                    Boolean fixSpaceGroup ) {
// Interprets the ASCII PDB line and fills the corresponding fields.
//   Returns zero if the line was converted, otherwise returns a
// non-negative value of Error_XXXX.
//   PDBString must be not shorter than 81 characters.
int         RC;
PCNCSMatrix ncsMatrix;
PCTVect     tVect;

  //  pad input line with spaces, if necessary
  PadSpaces ( PDBString,80 );

  if (!strncmp(PDBString,"CRYST",5))  {
    // Here we check for "CRYST" and not for "CRYST1" keyword.
    // As seems, people tend to not differentiating them.
    if (GetReal(a,&(PDBString[6]) ,9) &&
        GetReal(b,&(PDBString[15]),9) &&
        GetReal(c,&(PDBString[24]),9))
      WhatIsSet |= CSET_CellParams1;

    if (GetReal(alpha,&(PDBString[33]),7) &&
        GetReal(beta ,&(PDBString[40]),7) &&
        GetReal(gamma,&(PDBString[47]),7))
      WhatIsSet |= CSET_CellParams2;

    GetString ( spaceGroup,&(PDBString[55]),11 );
    CutSpaces ( spaceGroup,SCUTKEY_BEGEND );
    if (fixSpaceGroup)  FixSpaceGroup();
                  else  strcpy ( spaceGroupFix,spaceGroup );
    if (spaceGroupFix[0])  {
      if (SymOps.SetGroup(spaceGroupFix,syminfo_lib)==SYMOP_Ok)
        WhatIsSet |= CSET_SpaceGroup;
    }

    if (GetInteger(Z,&(PDBString[66]),4))
      WhatIsSet |= CSET_ZValue;

    WhatIsSet &= 0xFBFF;

    if ((a*b*c*alpha*beta*gamma==0.0) ||
        ((a==1.0)      && (b==1.0)     && (c==1.0)      &&
         (alpha==90.0) && (beta==90.0) && (gamma==90.0) &&
         (!strcmp(spaceGroup,"P 1"))))  {
      WhatIsSet &= ~(CSET_CellParams1 | CSET_CellParams2 |
                     CSET_SpaceGroup);
      WhatIsSet |= CSET_DummyCell;
    }

  } else if (!strncmp(PDBString,"ORIGX1",6))  {

    if (GetReal(o[0][0],&(PDBString[10]),10) &&
        GetReal(o[0][1],&(PDBString[20]),10) &&
        GetReal(o[0][2],&(PDBString[30]),10) &&
        GetReal(t[0]   ,&(PDBString[45]),10))
      WhatIsSet |= CSET_OrigMatrix1;

  } else if (!strncmp(PDBString,"ORIGX2",6))  {

    if (GetReal(o[1][0],&(PDBString[10]),10) &&
        GetReal(o[1][1],&(PDBString[20]),10) &&
        GetReal(o[1][2],&(PDBString[30]),10) &&
        GetReal(t[1]   ,&(PDBString[45]),10))
      WhatIsSet |= CSET_OrigMatrix2;

  } else if (!strncmp(PDBString,"ORIGX3",6))  {

    if (GetReal(o[2][0],&(PDBString[10]),10) &&
        GetReal(o[2][1],&(PDBString[20]),10) &&
        GetReal(o[2][2],&(PDBString[30]),10) &&
        GetReal(t[2]   ,&(PDBString[45]),10))
      WhatIsSet |= CSET_OrigMatrix3;

  } else if (!strncmp(PDBString,"SCALE1",6))  {

    if (GetReal(s[0][0],&(PDBString[10]),10) &&
        GetReal(s[0][1],&(PDBString[20]),10) &&
        GetReal(s[0][2],&(PDBString[30]),10) &&
        GetReal(u[0]   ,&(PDBString[45]),10))
      WhatIsSet |= CSET_ScaleMatrix1;
    WhatIsSet &= 0xFBFF;
    CellCheck |= CCHK_Unchecked;

  } else if (!strncmp(PDBString,"SCALE2",6))  {

    if (GetReal(s[1][0],&(PDBString[10]),10) &&
        GetReal(s[1][1],&(PDBString[20]),10) &&
        GetReal(s[1][2],&(PDBString[30]),10) &&
        GetReal(u[1]   ,&(PDBString[45]),10))
      WhatIsSet |= CSET_ScaleMatrix2;
    WhatIsSet &= 0xFBFF;
    CellCheck |= CCHK_Unchecked;

  } else if (!strncmp(PDBString,"SCALE3",6))  {

    if (GetReal(s[2][0],&(PDBString[10]),10) &&
        GetReal(s[2][1],&(PDBString[20]),10) &&
        GetReal(s[2][2],&(PDBString[30]),10) &&
        GetReal(u[2]   ,&(PDBString[45]),10))
      WhatIsSet |= CSET_ScaleMatrix3;
    WhatIsSet &= 0xFBFF;
    CellCheck |= CCHK_Unchecked;

  } else if (!strncmp(PDBString,"MTRIX",5))  {

    RC = NCSMatrix.AddMTRIXLine ( PDBString );
    if (RC==Error_NCSM_WrongSerial)  {
      ncsMatrix = new CNCSMatrix();
      RC = ncsMatrix->ConvertPDBASCII ( PDBString );
      if (RC==0)  NCSMatrix.AddData ( ncsMatrix );
            else  delete ncsMatrix;
    }
    return RC;

  } else if (!strncmp(PDBString,"TVECT ",6))  {
    
    tVect = new CTVect();
    RC = tVect->ConvertPDBASCII(PDBString);
    if (RC==0)  TVect.AddData ( tVect );
          else  delete tVect;
    return RC;

  } else
    return Error_WrongSection;

  return 0;

}

void  CMMDBCryst::PDBASCIIDump ( RCFile f )  {
int  i,j;
char S[100];

  if (WhatIsSet & (CSET_CrystCard | CSET_DummyCell))  {
    strcpy    ( S,"CRYST1" );
    PadSpaces ( S,80 );
    if (WhatIsSet & CSET_CellParams1)  {
      PutRealF ( &(S[6 ]),a,9,3 );
      PutRealF ( &(S[15]),b,9,3 );
      PutRealF ( &(S[24]),c,9,3 );
    }
    if (WhatIsSet & CSET_CellParams2)  {
      PutRealF ( &(S[33]),alpha,7,2 );
      PutRealF ( &(S[40]),beta ,7,2 );
      PutRealF ( &(S[47]),gamma,7,2 );
    }
    if ((WhatIsSet & CSET_SpaceGroup) || (spaceGroup[0]))
      strncpy ( &(S[55]),spaceGroup,IMin(11,strlen(spaceGroup)) );
    if (WhatIsSet & CSET_ZValue)
      PutInteger ( &(S[66]),Z,4 );
    f.WriteLine ( S );
  }

  if ((WhatIsSet & CSET_OrigMatrix)==CSET_OrigMatrix)  
    for (i=0;i<3;i++)  {
      sprintf   ( S,"ORIGX%1i",i+1);
      PadSpaces ( S,80 );
      for (j=0;j<3;j++)
        PutRealF ( &(S[10+j*10]),o[i][j],10,6 );
      PutRealF ( &(S[45]),t[i],10,5 );
      f.WriteLine ( S );
    }

  if ((WhatIsSet & CSET_ScaleMatrix)==CSET_ScaleMatrix) 
    for (i=0;i<3;i++)  {
      sprintf   ( S,"SCALE%1i",i+1);
      PadSpaces ( S,80 );
      for (j=0;j<3;j++)
        PutRealF ( &(S[10+j*10]),s[i][j],10,6 );
      PutRealF ( &(S[45]),u[i],10,5 );
      f.WriteLine ( S );
    }

  NCSMatrix.PDBASCIIDump ( f );
  TVect    .PDBASCIIDump ( f );

}


int  CMMDBCryst::GetCIF ( PCMMCIFData CIF, Boolean fixSpaceGroup ) {
PCMMCIFStruct Struct;
int RC;

  WhatIsSet = 0;

  Struct = CIF->GetStructure ( CIFCAT_CELL );

  if (Struct)  {

    RC = CIFGetReal ( a,Struct,CIFTAG_LENGTH_A );
    if (!RC)  RC = CIFGetReal ( b,Struct,CIFTAG_LENGTH_B );
    if (!RC)  RC = CIFGetReal ( c,Struct,CIFTAG_LENGTH_C );
    if (RC==Error_UnrecognizedReal)  return RC;
    if (!RC)  WhatIsSet |= CSET_CellParams1;

    RC = CIFGetReal ( alpha,Struct,CIFTAG_ANGLE_ALPHA );
    if (!RC)  RC = CIFGetReal ( beta,Struct,CIFTAG_ANGLE_BETA );
    if (!RC)  RC = CIFGetReal ( gamma,Struct,CIFTAG_ANGLE_GAMMA );
    if (RC==Error_UnrecognizedReal)  return RC;
    if (!RC)  WhatIsSet |= CSET_CellParams2;

    RC = CIFGetInteger ( Z,Struct,CIFTAG_Z_PDB );
    if (RC==Error_UnrecognizedReal)  return RC;
    if (!RC) WhatIsSet |= CSET_ZValue;

  }
 
  Struct = CIF->GetStructure ( CIFCAT_SYMMETRY );
  if (Struct)  {
    CIFGetString ( spaceGroup,Struct,CIFTAG_SPACE_GROUP_NAME_H_M,
                   sizeof(spaceGroup),pstr("") );
    CutSpaces ( spaceGroup,SCUTKEY_BEGEND );
    if (fixSpaceGroup)  FixSpaceGroup();
                  else  strcpy ( spaceGroupFix,spaceGroup );
    /*
    if (fixSpaceGroup)  {
      if (!strcasecmp(spaceGroup,"P 21"))
        strcpy ( spaceGroup,"P 1 21 1" );
      else if (!strcasecmp(spaceGroup,"C 2"))
        strcpy ( spaceGroup,"C 1 2 1" );
    }
    */
    if (SymOps.SetGroup(spaceGroupFix,syminfo_lib)==SYMOP_Ok)
      WhatIsSet |= CSET_SpaceGroup;
  }

  if ((a*b*c*alpha*beta*gamma==0.0) || 
      ((a==1.0)      && (b==1.0)     && (c==1.0)      &&
       (alpha==90.0) && (beta==90.0) && (gamma==90.0) &&
       (!strcmp(spaceGroup,"P 1"))))  {
    WhatIsSet &= ~(CSET_CellParams1 | CSET_CellParams2 |
                   CSET_SpaceGroup);
    WhatIsSet |= CSET_DummyCell;
  }

  Struct = CIF->GetStructure ( CIFCAT_DATABASE_PDB_MATRIX );
  if (Struct)  {
    RC = CIFGetReal ( o[0][0],Struct,CIFTAG_ORIGX11 );
    if (!RC)  RC = CIFGetReal ( o[0][1],Struct,CIFTAG_ORIGX12 );
    if (!RC)  RC = CIFGetReal ( o[0][2],Struct,CIFTAG_ORIGX13 );
    if (!RC)  RC = CIFGetReal ( o[1][0],Struct,CIFTAG_ORIGX21 );
    if (!RC)  RC = CIFGetReal ( o[1][1],Struct,CIFTAG_ORIGX22 );
    if (!RC)  RC = CIFGetReal ( o[1][2],Struct,CIFTAG_ORIGX23 );
    if (!RC)  RC = CIFGetReal ( o[2][0],Struct,CIFTAG_ORIGX31 );
    if (!RC)  RC = CIFGetReal ( o[2][1],Struct,CIFTAG_ORIGX32 );
    if (!RC)  RC = CIFGetReal ( o[2][2],Struct,CIFTAG_ORIGX33 );
    if (!RC)  RC = CIFGetReal ( t[0]   ,Struct,CIFTAG_ORIGX_VECTOR1 );
    if (!RC)  RC = CIFGetReal ( t[1]   ,Struct,CIFTAG_ORIGX_VECTOR2 );
    if (!RC)  RC = CIFGetReal ( t[2]   ,Struct,CIFTAG_ORIGX_VECTOR3 );
    if (RC)  return RC;
    WhatIsSet |= CSET_OrigMatrix;
  }

  Struct = CIF->GetStructure ( CIFCAT_ATOM_SITES );
  if (Struct)  {
    RC = CIFGetReal ( s[0][0],Struct,CIFTAG_FRACT_TRANSF_MATRIX11 );
    if (!RC)
      RC = CIFGetReal(s[0][1],Struct,CIFTAG_FRACT_TRANSF_MATRIX12);
    if (!RC)
      RC = CIFGetReal(s[0][2],Struct,CIFTAG_FRACT_TRANSF_MATRIX13);
    if (!RC)
      RC = CIFGetReal(s[1][0],Struct,CIFTAG_FRACT_TRANSF_MATRIX21);
    if (!RC)
      RC = CIFGetReal(s[1][1],Struct,CIFTAG_FRACT_TRANSF_MATRIX22);
    if (!RC)
      RC = CIFGetReal(s[1][2],Struct,CIFTAG_FRACT_TRANSF_MATRIX23);
    if (!RC)
      RC = CIFGetReal(s[2][0],Struct,CIFTAG_FRACT_TRANSF_MATRIX31);
    if (!RC)
      RC = CIFGetReal(s[2][1],Struct,CIFTAG_FRACT_TRANSF_MATRIX32);
    if (!RC)
      RC = CIFGetReal(s[2][2],Struct,CIFTAG_FRACT_TRANSF_MATRIX33);
    if (!RC)
      RC = CIFGetReal(u[0]   ,Struct,CIFTAG_FRACT_TRANSF_VECTOR1 );
    if (!RC)
      RC = CIFGetReal(u[1]   ,Struct,CIFTAG_FRACT_TRANSF_VECTOR2 );
    if (!RC)
      RC = CIFGetReal(u[2]   ,Struct,CIFTAG_FRACT_TRANSF_VECTOR3 );
    if (RC)  return RC;
    WhatIsSet |= CSET_ScaleMatrix;
  }

  RC = NCSMatrix.GetCIF(CIF,ClassID_NCSMatrix);
  if (RC) return RC;

  RC = TVect.GetCIF(CIF,ClassID_TVect);
  return RC;

}

void CMMDBCryst::MakeCIF ( PCMMCIFData CIF )  {
PCMMCIFStruct Struct;
char          S[200];

  if (WhatIsSet & (CSET_CellParams1 | CSET_DummyCell))  {
    CIF->AddStructure ( CIFCAT_CELL,Struct );
    Struct->PutReal ( a,CIFTAG_LENGTH_A,8 );
    Struct->PutReal ( b,CIFTAG_LENGTH_B,8 );
    Struct->PutReal ( c,CIFTAG_LENGTH_C,8 );
  }

  if (WhatIsSet & (CSET_CellParams2 | CSET_DummyCell))  {
    CIF->AddStructure ( CIFCAT_CELL,Struct );
    Struct->PutReal ( alpha,CIFTAG_ANGLE_ALPHA,8 );
    Struct->PutReal ( beta ,CIFTAG_ANGLE_BETA, 8 );
    Struct->PutReal ( gamma,CIFTAG_ANGLE_GAMMA,8 );
  }

  if ((WhatIsSet & (CSET_SpaceGroup | CSET_DummyCell)) ||
      (spaceGroup[0]))
    CIF->PutString ( strcpy_cs(S,spaceGroup),CIFCAT_SYMMETRY,
                     CIFTAG_SPACE_GROUP_NAME_H_M );

  if (WhatIsSet & (CSET_ZValue | CSET_DummyCell))
    CIF->PutInteger ( Z,CIFCAT_CELL,CIFTAG_Z_PDB );


  if ((WhatIsSet & CSET_OrigMatrix)==CSET_OrigMatrix)  {
    CIF->AddStructure ( CIFCAT_DATABASE_PDB_MATRIX,Struct );
    Struct->PutReal ( o[0][0],CIFTAG_ORIGX11      ,8 );
    Struct->PutReal ( o[0][1],CIFTAG_ORIGX12      ,8 );
    Struct->PutReal ( o[0][2],CIFTAG_ORIGX13      ,8 );
    Struct->PutReal ( o[1][0],CIFTAG_ORIGX21      ,8 );
    Struct->PutReal ( o[1][1],CIFTAG_ORIGX22      ,8 );
    Struct->PutReal ( o[1][2],CIFTAG_ORIGX23      ,8 );
    Struct->PutReal ( o[2][0],CIFTAG_ORIGX31      ,8 );
    Struct->PutReal ( o[2][1],CIFTAG_ORIGX32      ,8 );
    Struct->PutReal ( o[2][2],CIFTAG_ORIGX33      ,8 );
    Struct->PutReal ( t[0]   ,CIFTAG_ORIGX_VECTOR1,8 );
    Struct->PutReal ( t[1]   ,CIFTAG_ORIGX_VECTOR2,8 );
    Struct->PutReal ( t[2]   ,CIFTAG_ORIGX_VECTOR3,8 );
  }

  if ((WhatIsSet & CSET_ScaleMatrix)==CSET_ScaleMatrix)  {
    CIF->AddStructure ( CIFCAT_ATOM_SITES,Struct );
    Struct->PutReal ( s[0][0],CIFTAG_FRACT_TRANSF_MATRIX11,8 );
    Struct->PutReal ( s[0][1],CIFTAG_FRACT_TRANSF_MATRIX12,8 );
    Struct->PutReal ( s[0][2],CIFTAG_FRACT_TRANSF_MATRIX13,8 );
    Struct->PutReal ( s[1][0],CIFTAG_FRACT_TRANSF_MATRIX21,8 );
    Struct->PutReal ( s[1][1],CIFTAG_FRACT_TRANSF_MATRIX22,8 );
    Struct->PutReal ( s[1][2],CIFTAG_FRACT_TRANSF_MATRIX23,8 );
    Struct->PutReal ( s[2][0],CIFTAG_FRACT_TRANSF_MATRIX31,8 );
    Struct->PutReal ( s[2][1],CIFTAG_FRACT_TRANSF_MATRIX32,8 );
    Struct->PutReal ( s[2][2],CIFTAG_FRACT_TRANSF_MATRIX33,8 );
    Struct->PutReal ( u[0]   ,CIFTAG_FRACT_TRANSF_VECTOR1 ,8 );
    Struct->PutReal ( u[1]   ,CIFTAG_FRACT_TRANSF_VECTOR2 ,8 );
    Struct->PutReal ( u[2]   ,CIFTAG_FRACT_TRANSF_VECTOR3 ,8 );
  }

  NCSMatrix.MakeCIF ( CIF );
  TVect    .MakeCIF ( CIF );

}



cpstr OrthCode[6] = {
  cpstr("A/X0, C*/Z0"), // (standard brookhaven)
  cpstr("B/X0, A*/Z0"),
  cpstr("C/X0, B*/Z0"),
  cpstr("HEX A+B/X0, C*/Z0"),
  cpstr("A*/X0, C/Z0 (rollett)"),
  cpstr("A/X0, B*/Y0")
};

cpstr getOrthCodeName ( int NCode )  {
  if ((NCode>0) && (NCode<=6))  return OrthCode[NCode-1];
  return cpstr("CUSTOM");
}

void  CMMDBCryst::CalcCoordTransforms()  {
realtype rChk1,rChk2,Fac;
int      i,j,k;

  WhatIsSet &= ~CSET_Transforms;  // clear the flag

  if ((WhatIsSet & CSET_CellParams)==CSET_CellParams)  {
    //   The 'cryst1' card was supplied. Calculate
    // standard orthogonalizations.
  
    CalcOrthMatrices();
    if (NCode<0)  NCode = 0;

    for (i=0;i<3;i++)  {
      for (j=0;j<3;j++)
        RO[i][j] = RR[NCode][i][j];
      RO[i][3] = 0.0;
      RO[3][i] = 0.0;
    }
    RO[3][3] = 1.0;
    Mat4Inverse ( RO,RF );

    WhatIsSet |= CSET_Transforms;

    if (ignoreScalei)
      CellCheck = CCHK_Ok;
    else if ((WhatIsSet & CSET_ScaleMatrix)==CSET_ScaleMatrix)  {
      //   All 'scalei' cards were supplied. Calculate
      // rotation and translation matrices and check
      // if they are in consistence with the cell.

      for (i=0;i<3;i++)  {
        for (j=0;j<3;j++)
          RF[i][j] = s[i][j];
        RF[i][3] = u[i];
        RF[3][i] = 0.0;
      }
      RF[3][3] = 1.0;
      Mat4Inverse ( RF,RO );

      // Find orthogonalisation type
      VolChk = RO[0][0]*(RO[1][1]*RO[2][2] - RO[1][2]*RO[2][1]) +
               RO[0][1]*(RO[1][2]*RO[2][0] - RO[1][0]*RO[2][2]) +
               RO[0][2]*(RO[1][0]*RO[2][1] - RO[1][1]*RO[2][0]);

      CellCheck = CCHK_Ok;
      if (Vol>0.0)  {
        VolErr = fabs(VolChk-Vol)/Vol;
        if (VolErr>0.02)     CellCheck |= CCHK_Error;
        else if (VolErr>0.1) CellCheck |= CCHK_Disagreement;
      } else
        CellCheck |= CCHK_NoCell;

      //  try to find NCode
      NCode = -1;
      for (k=0;(k<6) && (NCode<0);k++)  {
        NCode = k;
        for (i=0;i<3;i++)
          for (j=0;j<3;j++)  {
            rChk1 = RO[i][j] + RR[k][i][j];
            rChk2 = RO[i][j] - RR[k][i][j];
            if (fabs(rChk1)>=0.1)  {
              if (fabs(rChk2/rChk1)>0.01)
                NCode = -1;
            }
          }
      }
    
      //   Correct inaccuracy of SCALEi input due to FORMAT, 
      // replace RF,RO with RR[NCode][][] if possible.

      if (NCode>=0)  {
        for (i=0;i<3;i++)
          for (j=0;j<3;j++)
            RO[i][j] = RR[NCode][i][j];
        Mat4Inverse ( RO,RF );
      } else
        CellCheck |= CCHK_NoOrthCode;

      if ((u[0]!=0.0) || (u[1]!=0.0) || (u[2]!=0.0))
        CellCheck |= CCHK_Translations;

    }

    //  Generate ROU and RFU for AnisoU stuff
    RFU[3][3] = 1.0;
    for (i=0;i<3;i++)  {
      Fac = sqrt(RF[i][0]*RF[i][0] + RF[i][1]*RF[i][1] +
                 RF[i][2]*RF[i][2]);
      RFU[i][0] = RF[i][0]/Fac;
      RFU[i][1] = RF[i][1]/Fac;
      RFU[i][2] = RF[i][2]/Fac;
      RFU[i][3] = 0.0;
      RFU[3][i] = 0.0;
    }
    RFU[3][3] = 1.0;
    Mat4Inverse ( RFU,ROU );

  } else  
    CellCheck |= CCHK_NoCell;

}


void  CMMDBCryst::RWBROOKReadPrintout()  {
int i,j;

  if ((WhatIsSet & CSET_CellParams)==CSET_CellParams)  {
    printf ( "  MATRICES DERIVED FROM CRYST1"
             " CARD IN COORDINATE FILE\n\n\n"
             "             RF                 "
             "                 RO\n\n" );
    for (i=0;i<4;i++)  {
      printf ( " " );
      for (j=0;j<4;j++)
        printf ( "%8.3f",RF[i][j] );
      printf ( "     " );
      for (j=0;j<4;j++)
        printf ( "%8.3f",RO[i][j] );
      printf ( "\n" );
    }
    printf ( "\n" );
  } else
    printf ( "\n  $WARNING: NO CRYST CARDS READ$\n" );

  if ((WhatIsSet & CSET_ScaleMatrix)!=CSET_ScaleMatrix) 
    printf ( "\n  $WARNING: NO SCALE CARDS READ$\n" );

}


void  CMMDBCryst::CalcOrthMatrices()  {
//  Calculates matrices for standard orthogonalizations
// and the cell volume.
//  The matrices are stored in array RR
realtype Conv,Alph,Bet,Gamm,Sum,V;
realtype sinA,cosA,sinB,cosB,sinG,cosG;
realtype sinAS,cosAS,sinBS,cosBS,sinGS,cosGS;
int      i,j,k;

  if ((WhatIsSet & CSET_CellParams)!=CSET_CellParams)  return;

  Conv = Pi/180.0;

  Alph = alpha*Conv;
  Bet  = beta *Conv;
  Gamm = gamma*Conv;

  Sum  = (Alph+Bet+Gamm)*0.5;

  V    = sqrt(sin(Sum-Alph)*sin(Sum-Bet)*sin(Sum-Gamm)*sin(Sum));

  Vol  = 2.0*a*b*c*V;

  //  Precaution measure for erratic use of the library
  if ((fabs(Alph)<1.0e-6) || (fabs(Bet)<1.0e-6) || 
                             (fabs(Gamm)<1.0e-6))  {
    as     = 0.0;
    bs     = 0.0;
    cs     = 0.0;
    alphas = 0.0;
    betas  = 0.0;
    gammas = 0.0;
    for (k=0;k<6;k++)  {
      AC[k] = 0.0;
      for (i=0;i<3;i++)  {
        for (j=0;j<3;j++)
          RR[k][i][j] = 0.0;
        RR[k][i][i] = 1.0;
      }
    }
    return;
  }
  
  sinA   = sin(Alph);
  cosA   = cos(Alph);
  sinB   = sin(Bet);
  cosB   = cos(Bet);
  sinG   = sin(Gamm);
  cosG   = cos(Gamm);

  cosAS  = (cosG*cosB-cosA) / (sinB*sinG);
  sinAS  = sqrt(1.0-cosAS*cosAS);
  cosBS  = (cosA*cosG-cosB) / (sinA*sinG);
  sinBS  = sqrt(1.0-cosBS*cosBS);
  cosGS  = (cosA*cosB-cosG) / (sinA*sinB);
  sinGS  = sqrt(1.0-cosGS*cosGS);

  as     = b*c*sinA/Vol;
  bs     = c*a*sinB/Vol;
  cs     = a*b*sinG/Vol;
  alphas = atan2(sinAS,cosAS)/Conv;
  betas  = atan2(sinBS,cosBS)/Conv;
  gammas = atan2(sinGS,cosGS)/Conv;

// ---- Set useful things for calculating dstar

  AC[0]  = as*as;
  AC[1]  = bs*bs;
  AC[2]  = cs*cs;
  AC[3]  = 2.0*bs*cs*cosAS;
  AC[4]  = 2.0*cs*as*cosBS;
  AC[5]  = 2.0*as*bs*cosGS;

// ---- Zero matrices

  for (k=0;k<6;k++)
    for (i=0;i<3;i++)
      for (j=0;j<3;j++)
        RR[k][i][j] = 0.0;

// ---- Calculate matrices

// ---- XO along a  Zo along c*

  RR[0][0][0] =  a;
  RR[0][0][1] =  b*cosG;
  RR[0][0][2] =  c*cosB;
  RR[0][1][1] =  b*sinG;
  RR[0][1][2] = -c*sinB*cosAS;
  RR[0][2][2] =  c*sinB*sinAS;

 // ---- XO along b  Zo along a*

  RR[1][0][0] =  a*cosG;
  RR[1][0][1] =  b;
  RR[1][0][2] =  c*cosA;
  RR[1][1][0] = -a*sinG*cosBS;
  RR[1][1][2] =  c*sinA;
  RR[1][2][0] =  a*sinG*sinBS;

// ---- XO along c  Zo along b*

  RR[2][0][0] =  a*cosB;
  RR[2][0][1] =  b*cosA;
  RR[2][0][2] =  c;
  RR[2][1][0] =  a*sinB;
  RR[2][1][1] = -b*sinA*cosGS;
  RR[2][2][1] =  b*sinA*sinGS;

// ---- trigonal only - XO along a+b  YO alon a-b  Zo along c*

  RR[3][0][0] =  a/2.0;
  RR[3][0][1] =  a/2.0;
  RR[3][1][0] = -a*sinG;
  RR[3][1][1] =  a*sinG;
  RR[3][2][2] =  c;

// ---- XO along a*, ZO along c

  RR[4][0][0] =  a*sinB*sinGS;
  RR[4][1][0] = -a*sinB*cosGS;
  RR[4][1][1] =  b*sinA;
  RR[4][2][0] =  a*cosB;
  RR[4][2][1] =  b*cosA;
  RR[4][2][2] =  c;

// ---- Grr*! to  Gerard Bricogne - his setting for P1 in SKEW.
//      XO along a, Y0 along b*

  RR[5][0][0] =  a;
  RR[5][0][1] =  b*cosG;
  RR[5][0][2] =  c*cosB;
  RR[5][1][1] =  b*sinG*sinAS;
  RR[5][2][1] = -b*sinG*cosAS;
  RR[5][2][2] =  c*sinB;

}


Boolean CMMDBCryst::areMatrices()  {
// returns True if the orthogonal-to-fractional and
// fractional-to-orthogonal matrices are defined
  return (WhatIsSet & CSET_Transforms)!=0x0000;
}


Boolean CMMDBCryst::Frac2Orth (
              realtype x,    realtype y,    realtype z,
              realtype & xx, realtype & yy, realtype & zz ) {
  if (areMatrices())  {
    xx = RO[0][0]*x + RO[0][1]*y + RO[0][2]*z + RO[0][3];
    yy = RO[1][0]*x + RO[1][1]*y + RO[1][2]*z + RO[1][3];
    zz = RO[2][0]*x + RO[2][1]*y + RO[2][2]*z + RO[2][3];
    return True;
  } else  {
    xx = x;
    yy = y;
    zz = z;
    return False;
  }
}

Boolean CMMDBCryst::Orth2Frac (
              realtype x,    realtype y,    realtype z,
              realtype & xx, realtype & yy, realtype & zz ) {
  if (areMatrices())  {
    xx = RF[0][0]*x + RF[0][1]*y + RF[0][2]*z + RF[0][3];
    yy = RF[1][0]*x + RF[1][1]*y + RF[1][2]*z + RF[1][3];
    zz = RF[2][0]*x + RF[2][1]*y + RF[2][2]*z + RF[2][3];
    return True;
  } else  {
    xx = x;
    yy = y;
    zz = z;
    return False;
  }
}


Boolean CMMDBCryst::Frac2Orth ( mat44 & F, mat44 & T )  {
mat44 A;
  if (areMatrices())  {
    Mat4Mult ( A,F,RF );
    Mat4Mult ( T,RO,A );
    return True;
  } else  {
    Mat4Init ( T );
    return False;
  }
}


Boolean CMMDBCryst::Orth2Frac ( mat44 & T, mat44 & F )  {
mat44 A;
  if (areMatrices())  {
    Mat4Mult ( A,T,RO );
    Mat4Mult ( F,RF,A );
    return True;
  } else  {
    Mat4Init ( F );
    return False;
  }
}


int  CMMDBCryst::GetNumberOfSymOps()  {
  return SymOps.GetNofSymOps();
}

pstr CMMDBCryst::GetSymOp ( int Nop )  {
  return SymOps.GetSymOp ( Nop );
}


int  CMMDBCryst::GetTMatrix ( mat44 & TMatrix, int Nop,
                              int cellshift_a, int cellshift_b,
                              int cellshift_c, PCSymOps symOpers )  {
//
//  GetTMatrix(..) calculates and returns the coordinate transformation
//  matrix, which converts orthogonal coordinates according to the
//  symmetry operation Nop and places them into unit cell shifted by
//  cellshift_a a's, cellshift_b b's and cellshift_c c's.
//
//  Return 0 means everything's fine,
//         1 there's no symmetry operation Nop defined
//         2 fractionalizing/orthogonalizing matrices were not
//           calculated
//         3 cell parameters were not set up.
//
mat44 fm;
int   i,j,k;

  if (cellshift_a<=-MaxInt4) {
    k = GetFractMatrix ( fm,Nop,0,0,0,symOpers );
    fm[0][3] = frac(fm[0][3]);
    fm[1][3] = frac(fm[1][3]);
    fm[2][3] = frac(fm[2][3]);
  } else
    k = GetFractMatrix ( fm,Nop,cellshift_a,cellshift_b,cellshift_c,
                         symOpers );

  if (k)  {
    Mat4Init ( TMatrix );
    return k;
  }

  // transformation back to orthogonal coordinates    
  for (i=0;i<3;i++)  {
    for (j=0;j<4;j++)  {
      TMatrix[i][j] = 0.0;
      for (k=0;k<3;k++)
        TMatrix[i][j] += RO[i][k]*fm[k][j];
    }
    TMatrix[i][3] += RO[i][3];
  }

  TMatrix[3][0] = 0.0;
  TMatrix[3][1] = 0.0;
  TMatrix[3][2] = 0.0;
  TMatrix[3][3] = 1.0;

  return 0;

}


int  CMMDBCryst::GetUCTMatrix ( mat44 & TMatrix, int Nop,
                                realtype x, realtype y, realtype z,
                                int cellshift_a, int cellshift_b,
                                int cellshift_c, PCSymOps symOpers )  {
//
//  GetUCTMatrix(..) calculates and returns the coordinate
//  transformation matrix, which converts orthogonal coordinates
//  according to the symmetry operation Nop. Translation part of
//  the matrix is being chosen such that point (x,y,z) has least
//  distance to the center of primary (333) unit cell, and then
//  it is shifted by cellshift_a a's, cellshift_b b's and
//  cellshift_c c's.
//
//  Return 0 means everything's fine,
//         1 there's no symmetry operation Nop defined
//         2 fractionalizing/orthogonalizing matrices were not
//           calculated
//         3 cell parameters were not set up.
//
mat44    fm,tm;
vect3    ft;
realtype x0,y0,z0, dx,dy,dz, d,d0;
int      i,j,k, ic,jc,kc;

  k = GetFractMatrix ( fm,Nop,0,0,0,symOpers );
  if (k) {
    Mat4Init ( TMatrix );
    return k;
  }

  fm[0][3] = frac(fm[0][3]) + cellshift_a;
  fm[1][3] = frac(fm[1][3]) + cellshift_b;
  fm[2][3] = frac(fm[2][3]) + cellshift_c;

  Frac2Orth ( cellshift_a+0.5,cellshift_b+0.5,cellshift_c+0.5,
              x0,y0,z0 );

  // transformation back to orthogonal coordinates

  for (i=0;i<3;i++)
    for (j=0;j<3;j++)  {
      tm[i][j] = 0.0;
      for (k=0;k<3;k++)
        tm[i][j] += RO[i][k]*fm[k][j];
    }
  tm[3][0] = 0.0;
  tm[3][1] = 0.0;
  tm[3][2] = 0.0;
  tm[3][3] = 1.0;

  d0 = MaxReal;
  for (ic=-3;ic<3;ic++)
    for (jc=-3;jc<3;jc++)
      for (kc=-3;kc<3;kc++)  {
        ft[0] = fm[0][3] + ic;
        ft[1] = fm[1][3] + jc;
        ft[2] = fm[2][3] + kc;
        for (i=0;i<3;i++)  {
          tm[i][3] = 0.0;
          for (k=0;k<3;k++)
            tm[i][3] += RO[i][k]*ft[k];
          tm[i][3] += RO[i][3];
        }
        dx = tm[0][0]*x + tm[0][1]*y + tm[0][2]*z + tm[0][3] - x0;
        dy = tm[1][0]*x + tm[1][1]*y + tm[1][2]*z + tm[1][3] - y0;
        dz = tm[2][0]*x + tm[2][1]*y + tm[2][2]*z + tm[2][3] - z0;
        d = dx*dx + dy*dy + dz*dz;
        if (d<d0)  {
          d0 = d;
          Mat4Copy ( tm,TMatrix );
        }
      }

  return 0;

}


int  CMMDBCryst::GetFractMatrix ( mat44 & TMatrix, int Nop,
                                  int cellshift_a, int cellshift_b,
                                  int cellshift_c,
                                  PCSymOps symOpers )  {
//
//  GetFractMatrix(..) calculates and returns the coordinate
//  transformation matrix, which converts fractional coordinates
//  according to the symmetry operation Nop and places them into
//  unit cell shifted by cellshift_a a's, cellshift_b b's and
//  cellshift_c c's.
//
//  Return 0 means everything's fine,
//         1 there's no symmetry operation Nop defined
//         2 fractionalizing/orthogonalizing matrices were not
//           calculated
//         3 cell parameters were not set up.
//
mat44 tm;
int   i,j,k;

  k = 0;
  if (symOpers)  k = symOpers->GetTMatrix ( tm,Nop );
           else  k = SymOps.GetTMatrix    ( tm,Nop );
  if (!k)  {
    if (!areMatrices())      k = 2;
    if (!isCellParameters()) k = 3;
  } else
    k = 1;

  if (k)  {
    Mat4Init ( TMatrix );
    return k;
  }

  //  transformation to fractional coordinates + symmetry operation
  for (i=0;i<3;i++)  {
    for (j=0;j<4;j++)  {
      TMatrix[i][j] = 0.0;
      for (k=0;k<3;k++)
        TMatrix[i][j] += tm[i][k]*RF[k][j];
    }
    TMatrix[i][3] += tm[i][3];  // symmetry operation shift
  }

  // cell shift
  TMatrix[0][3] += cellshift_a;
  TMatrix[1][3] += cellshift_b;
  TMatrix[2][3] += cellshift_c;

  TMatrix[3][0] = 0.0;
  TMatrix[3][1] = 0.0;
  TMatrix[3][2] = 0.0;
  TMatrix[3][3] = 1.0;

  return 0;

}

int  CMMDBCryst::GetSymOpMatrix ( mat44 & TMatrix, int Nop )  {
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
  return SymOps.GetTMatrix ( TMatrix,Nop );
}


Boolean CMMDBCryst::Cryst2Orth ( rvector U )  {
mat33    A,AT,Tmp,TmpMat;
realtype BB;
int      i,j,k;

  if (areMatrices())  {

    Tmp[0][0] = U[0];
    Tmp[1][1] = U[1];
    Tmp[2][2] = U[2];
    Tmp[0][1] = U[3];
    Tmp[1][0] = U[3];
    Tmp[0][2] = U[4];
    Tmp[2][0] = U[4];
    Tmp[1][2] = U[5];
    Tmp[2][1] = U[5];

    for (i=0;i<=3;i++)
      for (j=0;j<=3;j++)  {
        A [j][i] = ROU[j][i];
        AT[i][j] = ROU[j][i];
      }

    //  TmpMat = Tmp*AT
    for (i=0;i<=3;i++)
      for (j=0;j<=3;j++)  {
        BB = 0.0;
        for (k=0;k<=3;k++)
          BB += Tmp[i][k]*AT[k][j];
        TmpMat[i][j] = BB;
      }

    //  Tmp = A*TmpMat
    for (i=0;i<=3;i++)
      for (j=0;j<=3;j++)  {
        BB = 0.0;
        for (k=0;k<=3;k++)
          BB += A[i][k]*TmpMat[k][j];
        Tmp[i][j] = BB;
      }

    U[0] = Tmp[0][0];
    U[1] = Tmp[1][1];
    U[2] = Tmp[2][2];
    U[3] = Tmp[0][1];
    U[4] = Tmp[0][2];
    U[5] = Tmp[1][2];

    return True;

  }

  return False;

}


Boolean  CMMDBCryst::Orth2Cryst ( rvector U )  {
mat33    A,AT,Tmp,TmpMat;
realtype BB;
int      i,j,k;

  if (areMatrices())  {

    Tmp[0][0] = U[0];
    Tmp[1][1] = U[1];
    Tmp[2][2] = U[2];
    Tmp[0][1] = U[3];
    Tmp[1][0] = U[3];
    Tmp[0][2] = U[4];
    Tmp[2][0] = U[4];
    Tmp[1][2] = U[5];
    Tmp[2][1] = U[5];

    for (i=0;i<=3;i++)
      for (j=0;j<=3;j++)  {
        A [j][i] = RFU[j][i];
        AT[i][j] = RFU[j][i];
      }

    //  TmpMat = Tmp*AT
    for (i=0;i<=3;i++)
      for (j=0;j<=3;j++)  {
        BB = 0.0;
        for (k=0;k<=3;k++)
          BB += Tmp[i][k]*AT[k][j];
        TmpMat[i][j] = BB;
      }

    //  Tmp = A*TmpMat
    for (i=0;i<=3;i++)
      for (j=0;j<=3;j++)  {
        BB = 0.0;
        for (k=0;k<=3;k++)
          BB += A[i][k]*TmpMat[k][j];
        Tmp[i][j] = BB;
      }

    U[0] = Tmp[0][0];
    U[1] = Tmp[1][1];
    U[2] = Tmp[2][2];
    U[3] = Tmp[0][1];
    U[4] = Tmp[0][2];
    U[5] = Tmp[1][2];

    return True;

  }

  return False;

}


void  CMMDBCryst::SetCell ( realtype cell_a,
                            realtype cell_b,
                            realtype cell_c,
                            realtype cell_alpha,
                            realtype cell_beta,
                            realtype cell_gamma,
                            int      OrthCode )  {
//  this function should be used for changing the cell parameters
int  i,j;

  if ((cell_a>0.0)      && (cell_b>0.0)     && (cell_c>0.0) &&
      (cell_alpha!=0.0) && (cell_beta!=0.0) && (cell_gamma!=0.0))  {

    if (OrthCode>0)  NCode = OrthCode-1;
               else  NCode = 0;

    a     = cell_a;
    b     = cell_b;
    c     = cell_c;
    alpha = cell_alpha;
    beta  = cell_beta;
    gamma = cell_gamma;

    WhatIsSet |= CSET_CellParams;

    // calculate matrices

    for (i=0;i<4;i++)  {
      for (j=0;j<4;j++)  {
        RO [i][j] = 0.0;
        RF [i][j] = 0.0;
        ROU[i][j] = 0.0;
        RFU[i][j] = 0.0;
      }
      RO [i][i] = 1.0;
      RF [i][i] = 1.0;
      ROU[i][i] = 1.0;
      RFU[i][i] = 1.0;
    }

    CalcCoordTransforms();

    if (!(CellCheck & CCHK_NoOrthCode))  {
      for (i=0;i<3;i++)  {
        for (j=0;j<3;j++)
          RO[i][j] = RR[NCode][i][j];
        RO[i][3] = 0.0;
        RO[3][i] = 0.0;
      }
      RO[3][3] = 1.0;
      Mat4Inverse ( RO,RF );
    }

    WhatIsSet |= CSET_Transforms;

  } else

    WhatIsSet &= ~(CSET_CellParams | CSET_Transforms);

}

void CMMDBCryst::SetSyminfoLib ( cpstr syminfoLib )  {
  CreateCopy ( syminfo_lib,syminfoLib );
}

pstr CMMDBCryst::GetSyminfoLib()  {
  return syminfo_lib;
}

int CMMDBCryst::SetSpaceGroup ( cpstr spGroup )  {
//  This function does not attempt to fix the space group
int RC,l;
  RC = SYMOP_UnknownSpaceGroup;
  WhatIsSet &= ~CSET_SpaceGroup;
  if (spGroup)  {
    if (spGroup[0])  {
      l = IMin ( strlen(spGroup),sizeof(spaceGroup)-1 );
      strcpy_ncss ( spaceGroup,spGroup,l );
      strcpy ( spaceGroupFix,spaceGroup );
      if (spaceGroup[0])  {
	RC = SymOps.SetGroup ( spaceGroup,syminfo_lib );
	//        RC = SymOps.SetGroup ( spGroup,syminfo_lib );
        //      strncpy ( spaceGroup,spGroup,l );
        //      spaceGroup[l] = char(0);
        if (RC==SYMOP_Ok)  WhatIsSet |= CSET_SpaceGroup;
      }
    }
  }
  return RC;
}


void  CMMDBCryst::PutCell ( realtype cell_a,
                            realtype cell_b,
                            realtype cell_c,
                            realtype cell_alpha,
                            realtype cell_beta,
                            realtype cell_gamma,
                            int      OrthCode ) {
//  this function should be used for setting the cell parameters
int i,j;

  if ((cell_a!=0.0) || (OrthCode>0))  {
    a     = cell_a;
    b     = cell_b;
    c     = cell_c;
    alpha = cell_alpha;
    beta  = cell_beta;
    gamma = cell_gamma;
    WhatIsSet |= CSET_CellParams;
  }

  if (OrthCode>0)  {

    // calculate matrices

    NCode = OrthCode-1;
    CalcOrthMatrices();

    for (i=0;i<3;i++)  {
      for (j=0;j<3;j++)
        RO[i][j] = RR[NCode][i][j];
      RO[i][3] = 0.0;
      RO[3][i] = 0.0;
    }
    RO[3][3] = 1.0;

    Mat4Inverse ( RO,RF );
  
    WhatIsSet |= CSET_Transforms;

  } else
    WhatIsSet &= ~CSET_Transforms;

  for (i=0;i<3;i++)  {
    for (j=0;j<3;j++)
      s[i][j] = RF[i][j];
    u[i] = RF[i][3];
  }

  WhatIsSet |= CSET_ScaleMatrix;

}


Boolean CMMDBCryst::isScaleMatrix()  {
  return  ((WhatIsSet & CSET_ScaleMatrix)==CSET_ScaleMatrix);
}

Boolean CMMDBCryst::isCellParameters()  {
  return  ((WhatIsSet & CSET_CellParams)==CSET_CellParams);
}

Boolean CMMDBCryst::isNCSMatrix()  {
  return  (NCSMatrix.Length()>0);
}

int  CMMDBCryst::GetNumberOfNCSMatrices()  {
  return  NCSMatrix.Length();
}

int  CMMDBCryst::GetNumberOfNCSMates()  {
// Returns the number of NCS mates not given in the file (iGiven==0)
int         i,l,iG;
PCNCSMatrix NCSM;
  iG = 0;
  l  = NCSMatrix.Length();
  for (i=0;i<l;i++)  {
    NCSM = PCNCSMatrix(NCSMatrix.GetContainerClass(i));
    if (NCSM)  {
      if (!NCSM->iGiven)  iG++;
    }
  }
  return iG;
}

Boolean CMMDBCryst::GetNCSMatrix ( int NCSMatrixNo,
                                   mat33 & ncs_m, vect3 & ncs_v )  {
int         i,j;
PCNCSMatrix NCSM;
  NCSM = PCNCSMatrix(NCSMatrix.GetContainerClass(NCSMatrixNo));
  if (NCSM)  {
    for (i=0;i<3;i++) {
      for (j=0;j<3;j++)
        ncs_m[i][j] = NCSM->m[i][j];
      ncs_v[i] = NCSM->v[i];
    }
    return True;
  }
  return False;
}

Boolean CMMDBCryst::GetNCSMatrix ( int NCSMatrixNo,
                                   mat44 & ncs_m, int & iGiven )  {
int         i,j;
PCNCSMatrix NCSM;
  NCSM = PCNCSMatrix(NCSMatrix.GetContainerClass(NCSMatrixNo));
  if (NCSM)  {
    for (i=0;i<3;i++) {
      for (j=0;j<3;j++)
        ncs_m[i][j] = NCSM->m[i][j];
      ncs_m[i][3] = NCSM->v[i];
    }
    ncs_m[3][0] = 0.0;
    ncs_m[3][1] = 0.0;
    ncs_m[3][2] = 0.0;
    ncs_m[3][3] = 1.0;
    iGiven = NCSM->iGiven;
    return True;
  } else  {
    for (i=0;i<4;i++) {
      for (j=0;j<4;j++)
        ncs_m[i][j] = 0.0;
      ncs_m[i][i] = 1.0;
    }
    return False;
  }
}

int  CMMDBCryst::AddNCSMatrix ( mat33 & ncs_m, vect3 & ncs_v,
                                int iGiven )  {
PCNCSMatrix ncsMatrix;
  ncsMatrix = new CNCSMatrix();
  ncsMatrix->SetNCSMatrix ( NCSMatrix.Length()+1,ncs_m,ncs_v,
                            iGiven );
  NCSMatrix.AddData ( ncsMatrix );
  return ncsMatrix->serNum;
}

void  CMMDBCryst::GetRCell ( realtype & cell_as,
                             realtype & cell_bs,
                             realtype & cell_cs,
                             realtype & cell_alphas,
                             realtype & cell_betas,
                             realtype & cell_gammas,
                             realtype & vols )  {
  cell_as     = as;
  cell_bs     = bs;
  cell_cs     = cs;
  cell_alphas = alphas;
  cell_betas  = betas;
  cell_gammas = gammas;
  if (Vol!=0.0)  vols = 1.0/Vol;
           else  vols = 0.0;
}

void  CMMDBCryst::GetCell ( realtype & cell_a,
                            realtype & cell_b,
                            realtype & cell_c,
                            realtype & cell_alpha,
                            realtype & cell_beta,
                            realtype & cell_gamma,
                            realtype & vol )  {
  if (WhatIsSet & CSET_CellParams)  {
    cell_a     = a;
    cell_b     = b;
    cell_c     = c;
    cell_alpha = alpha;
    cell_beta  = beta;
    cell_gamma = gamma;
    vol        = Vol;
  } else  {
    cell_a     = 0.0;
    cell_b     = 0.0;
    cell_c     = 0.0;
    cell_alpha = 0.0;
    cell_beta  = 0.0;
    cell_gamma = 0.0;
    vol        = 0.0;
  }
}

pstr CMMDBCryst::GetSpaceGroup()  {
  if (WhatIsSet & CSET_SpaceGroup)  return spaceGroup;
                              else  return NULL;
}

pstr CMMDBCryst::GetSpaceGroupFix()  {
  if (WhatIsSet & CSET_SpaceGroup)  return spaceGroupFix;
                              else  return NULL;
}


void  CMMDBCryst::Copy ( PCMMDBCryst Cryst )  {
int i,j,k;

  if (Cryst)  {

    a     = Cryst->a;
    b     = Cryst->b;
    c     = Cryst->c;
    alpha = Cryst->alpha;
    beta  = Cryst->beta;
    gamma = Cryst->gamma;

    for (i=0;i<4;i++)
      for (j=0;j<4;j++)  {
        RO [i][j] = Cryst->RO [i][j];
        RF [i][j] = Cryst->RF [i][j];
        ROU[i][j] = Cryst->ROU[i][j];
        RFU[i][j] = Cryst->RFU[i][j];
      }

    for (i=0;i<3;i++) {
      for (j=0;j<3;j++)  {
        o[i][j] = Cryst->o[i][j];
        s[i][j] = Cryst->s[i][j];
        for (k=0;k<6;k++)
          RR[k][i][j] = Cryst->RR[k][i][j];
      }
      t[i] = Cryst->t[i];
      u[i] = Cryst->u[i];
    }

    Vol       = Cryst->Vol;
    NCode     = Cryst->NCode;
    Z         = Cryst->Z;
    CellCheck = Cryst->CellCheck;
    WhatIsSet = Cryst->WhatIsSet;
    strcpy ( spaceGroup   ,Cryst->spaceGroup    );
    strcpy ( spaceGroupFix,Cryst->spaceGroupFix );

    NCSMatrix.Copy ( &(Cryst->NCSMatrix) );
    TVect    .Copy ( &(Cryst->TVect)     );
    SymOps   .Copy ( &(Cryst->SymOps)    );

    as     = Cryst->as;
    bs     = Cryst->bs;
    cs     = Cryst->cs;
    alphas = Cryst->alphas;
    betas  = Cryst->betas;
    gammas = Cryst->betas;
    VolChk = Cryst->VolChk;
    VolErr = Cryst->VolErr;

    for (k=0;k<6;k++)
      AC[k] = Cryst->AC[k];

  } else  {

    NCSMatrix.FreeContainer();
    TVect    .FreeContainer();
    WhatIsSet = 0;

  }

}


void  CMMDBCryst::write ( RCFile f )  {
int  i,j,k;
byte Version=3;

  f.WriteByte ( &Version   );
  f.WriteWord ( &WhatIsSet );
  f.WriteReal ( &a         );
  f.WriteReal ( &b         );
  f.WriteReal ( &c         );
  f.WriteReal ( &alpha     );
  f.WriteReal ( &beta      );
  f.WriteReal ( &gamma     );
  f.WriteWord ( &CellCheck );
  f.WriteBool ( &ignoreScalei );
  for (i=0;i<4;i++)
    for (j=0;j<4;j++)  {
      f.WriteReal ( &(RO [i][j]) );
      f.WriteReal ( &(RF [i][j]) );
      f.WriteReal ( &(ROU[i][j]) );
      f.WriteReal ( &(RFU[i][j]) );
    }
  for (i=0;i<3;i++)  {
    for (j=0;j<3;j++)  {
      f.WriteReal ( &(o[i][j]) );
      f.WriteReal ( &(s[i][j]) );
      for (k=0;k<6;k++)
        f.WriteReal ( &(RR[k][i][j]) );
    }
    f.WriteReal ( &(t[i]) );
    f.WriteReal ( &(u[i]) );
  }
  f.WriteReal ( &Vol    );
  f.WriteReal ( &VolChk );
  f.WriteReal ( &VolErr );
  f.WriteInt  ( &NCode  );
  f.WriteInt  ( &Z      );
  f.WriteTerLine ( spaceGroup   ,False );
  f.WriteTerLine ( spaceGroupFix,False );

  for (i=0;i<6;i++)
    f.WriteReal ( &(AC[6]) );
  f.WriteReal ( &as     );
  f.WriteReal ( &bs     );
  f.WriteReal ( &cs     );
  f.WriteReal ( &alphas );
  f.WriteReal ( &betas  );
  f.WriteReal ( &gammas );

  NCSMatrix.write ( f );
  TVect    .write ( f );
  SymOps   .write ( f );

}

void  CMMDBCryst::read ( RCFile f )  {
int  i,j,k;
byte Version;

  f.ReadByte ( &Version   );
  f.ReadWord ( &WhatIsSet );
  f.ReadReal ( &a         );
  f.ReadReal ( &b         );
  f.ReadReal ( &c         );
  f.ReadReal ( &alpha     );
  f.ReadReal ( &beta      );
  f.ReadReal ( &gamma     );
  f.ReadWord ( &CellCheck );
  if (Version>2)
    f.ReadBool ( &ignoreScalei );
  else  ignoreScalei = False;
  for (i=0;i<4;i++)
    for (j=0;j<4;j++)  {
      f.ReadReal ( &(RO [i][j]) );
      f.ReadReal ( &(RF [i][j]) );
      f.ReadReal ( &(ROU[i][j]) );
      f.ReadReal ( &(RFU[i][j]) );
    }
  for (i=0;i<3;i++)  {
    for (j=0;j<3;j++)  {
      f.ReadReal ( &(o[i][j]) );
      f.ReadReal ( &(s[i][j]) );
      for (k=0;k<6;k++)
        f.ReadReal ( &(RR[k][i][j]) );
    }
    f.ReadReal ( &(t[i]) );
    f.ReadReal ( &(u[i]) );
  }
  f.ReadReal ( &Vol    );
  f.ReadReal ( &VolChk );
  f.ReadReal ( &VolErr );
  f.ReadInt  ( &NCode  );
  f.ReadInt  ( &Z      );
  f.ReadTerLine ( spaceGroup,False );
  if (Version>1)
        f.ReadTerLine ( spaceGroupFix,False );
  else  strcpy ( spaceGroupFix,spaceGroup );

  for (i=0;i<6;i++)
    f.ReadReal ( &(AC[6]) );
  f.ReadReal ( &as     );
  f.ReadReal ( &bs     );
  f.ReadReal ( &cs     );
  f.ReadReal ( &alphas );
  f.ReadReal ( &betas  );
  f.ReadReal ( &gammas );

  NCSMatrix.read ( f );
  TVect    .read ( f );
  SymOps   .read ( f );

}


MakeStreamFunctions(CMMDBCryst)


// ===================================================================


void  TestCryst() {
//  reads from 'in.cryst', writes into 
//  'out.cryst' and 'abin.cryst'
CFile       f;
char        S[81];
PCMMDBCryst Cryst;

  Cryst = new CMMDBCryst();

  f.assign ( pstr("in.cryst"),True );
  if (f.reset()) {
    while (!f.FileEnd()) {
      f.ReadLine ( S,sizeof(S) );
      Cryst->ConvertPDBString ( S,False );
    }
    f.shut();
  } else {
    printf ( " Can't open input file 'in.chain' \n" );
    delete Cryst;
    return;
  }
   
  f.assign ( pstr("out.cryst"),True );
  if (f.rewrite()) {
    Cryst->PDBASCIIDump ( f );
    f.shut();
  } else {
    printf ( " Can't open output file 'out.cryst' \n" );
    delete Cryst;
    return;
  }


  f.assign ( pstr("mmdb.cryst.bin"),False );
  if (f.rewrite()) {
    Cryst->write ( f );
    f.shut();
  } else {
    printf ( "  Can't open binary cryst file for writing.\n" );
    delete Cryst;
    return;
  }
  
  delete Cryst;
  printf ( "   Cryst deleted.\n" );
  
  Cryst = new CMMDBCryst();
  if (f.reset()) {
    Cryst->read ( f );
    f.shut();
  } else {
    printf ( "  Can't open binary cryst file for reading.\n" );
    delete Cryst;
    return;
  }
   
  f.assign ( pstr("abin.cryst"),True );
  if (f.rewrite()) {
    Cryst->PDBASCIIDump ( f );
    f.shut();
  } else 
    printf ( " Can't open output file 'abin.cryst' \n" );

  delete Cryst;

}
