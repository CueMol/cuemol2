//  $Id: mattype_.cpp,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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
//  **** Module  :  MatType_ <implementation>
//       ~~~~~~~~~
//
//  (C) E. Krissinel 2000-2008
//
//  =================================================================
//


#ifndef __STDLIB_H
#include <stdlib.h>
#endif

#ifndef __STRING_H
#include <string.h>
#endif

#ifndef __MATH_H
#include <math.h>
#endif

#ifndef __CTYPE_H
#include <ctype.h>
#endif

#ifndef  __MatType__
#include "mattype_.h"
#endif

#include <stdio.h>

// -------------------------------------------------------

realtype  MachEps;
realtype  floatMachEps;
realtype  LnMaxReal;
realtype  LnMinReal;
static realtype LnMaxRealExp;
static realtype LnMinRealExp;

//  Initialization. Some C++ enviroments do not do the
// following statements automatically, therefore it is
// always advisable to call InitMatType() explicitely
// from the top of main(). See body of InitMatType()
// in the very end of this file. It is completely
// harmless and cheap to call InitMatType() multiple
// times.

static Boolean MatTypeInit = InitMatType();


// -------------------------------------------------------

int  mround ( realtype X )  {
  return  (int)floor(X+0.5);
}

int  ifloor ( realtype X )  {
  return  (int)floor(X);
}

int  Abs ( int x )  {
  return ( x >= 0 ? x : -x );
}

// -------------------------------------------------------
void  ISwap ( int & x, int & y )  {
int  b;
 b = x;  x = y;  y = b;
}
void  WSwap ( word & x, word & y )  {
word  b;
  b = x;  x = y;  y = b;
}
void  BSwap ( byte & x, byte & y )  {
byte  b;
  b = x;  x = y;  y = b;
}
void  LSwap ( long & x, long & y )  {
long  b;
  b = x;  x = y;  y = b;
}
void  RSwap ( realtype & x, realtype & y )  {
realtype  b;
  b = x;  x = y;  y = b;
}

// -------------------------------------------------------
realtype  RMax ( const realtype x1, const realtype x2 )
{  return ( x1 > x2 ? x1 : x2 );  }

long      LMax ( const long x1, const long x2 )
{  return ( x1 > x2 ? x1 : x2 );  }

word      WMax ( const word x1, const word x2 )
{  return ( x1 > x2 ? x1 : x2 );  }

int       IMax ( const int x1,  const int x2  )
{  return ( x1 > x2 ? x1 : x2 );  }

realtype  RMin ( const realtype x1, const realtype x2 )
{  return ( x1 < x2 ? x1 : x2 );  }

long      LMin ( const long x1, const long x2 )
{  return ( x1 < x2 ? x1 : x2 );  }

word      WMin ( const word x1, const word x2 )
{  return ( x1 < x2 ? x1 : x2 );  }

int       IMin ( const int x1,  const int x2  )
{  return ( x1 < x2 ? x1 : x2 );  }

// -------------------------------------------------------
realtype  fsign ( const realtype x1,  const realtype x2 )  {
realtype  ax;
  if (x1>=0.0)  ax = x1;
          else  ax = -x1;
  return ( x2 >= 0.0 ? ax : -ax );
}

// -------------------------------------------------------
Boolean  GetVectorMemory  ( rvector & V, word N, word Shift )  {
  V = new realtype[N];
  if (V!=NULL)  V = V - Shift;  // shift for abovementioned enumeration
  return  (V!=NULL);
}

Boolean  GetVectorMemory ( ivector & I, word N, word Shift )  {
  I = new int[N];
  if (I!=NULL)  I = I - Shift;   // shift for abovementioned enumeration
  return  (I!=NULL);
}

Boolean  GetVectorMemory ( wvector & W, word N, word Shift )  {
  W = new word[N];
  if (W!=NULL)  W = W - Shift;   // shift for abovementioned enumeration
  return  (W!=NULL);
}

Boolean  GetVectorMemory ( bvector & B, word N, word Shift )  {
  B = new byte[N];
  if (B!=NULL)  B = B - Shift;   // shift for abovementioned enumeration
  return  (B!=NULL);
}

Boolean  GetVectorMemory ( lvector & L, word N, word Shift )  {
  L = new long[N];
  if (L!=NULL)  L = L - Shift;   // shift for abovementioned enumeration
  return  (L!=NULL);
}

Boolean  GetVectorMemory ( lwvector & L, word N, word Shift )  {
  L = new lword[N];
  if (L!=NULL)  L = L - Shift;   // shift for abovementioned enumeration
  return  (L!=NULL);
}

Boolean  GetVectorMemory ( psvector & P, word N, word Shift )  {
  P = new pstr[N];
  if (P!=NULL)  P = P - Shift;   // shift for abovementioned enumeration
  return  (P!=NULL);
}

void FreeVectorMemory  ( rvector & V, word Shift ) {
  if (V!=NULL)  {
    V = V + Shift;  //  back shift for the work of heap system
    delete[] V;
    V = NULL;
  }
}

void FreeVectorMemory ( ivector & I, word Shift )  {
  if (I!=NULL)  {
    I = I + Shift;  //  back shift for the work of heap system
    delete[] I;
    I = NULL;
  }
}

void FreeVectorMemory ( wvector & W, word Shift )  {
  if (W!=NULL)  {
    W = W + Shift;  //  back shift for the work of heap system
    delete[] W;
    W = NULL;
  }
}

void FreeVectorMemory ( bvector & B, word Shift )  {
  if (B!=NULL)  {
    B = B + Shift;  //  back shift for the work of heap system
    delete[] B;
    B = NULL;
  }
}

void FreeVectorMemory ( lvector & L, word Shift )  {
  if (L!=NULL)  {
    L = L + Shift;  //  back shift for the work of heap system
    delete[] L;
    L = NULL;
  }
}

void FreeVectorMemory ( lwvector & L, word Shift )  {
  if (L!=NULL)  {
    L = L + Shift;  //  back shift for the work of heap system
    delete[] L;
    L = NULL;
  }
}

void FreeVectorMemory ( psvector & P, word Shift )  {
  if (P!=NULL)  {
    P = P + Shift;  //  back shift for the work of heap system
    delete[] P;
    P = NULL;
  }
}

Boolean GetMatrixMemory  ( rmatrix & A, word N, word M,
                           word ShiftN, word ShiftM ) {
  A = new rvector[N];
  if (A!=NULL)  {
    for (word i=0;i<N;i++)
      GetVectorMemory ( A[i],M,ShiftM );
    if (A[N-1]==NULL)
          FreeMatrixMemory ( A,N,0,ShiftM );
    else  A = A - ShiftN;  //  shift for the enumeration with 1
  }
  return  (A!=NULL);
}

Boolean  GetMatrixMemory  ( imatrix & A, word N, word M,
                            word ShiftN, word ShiftM ) {
  A = new ivector[N];
  if (A!=NULL)  {
    for (word i=0;i<N;i++)
      GetVectorMemory ( A[i],M,ShiftM );
    if (A[N-1]==NULL)
          FreeMatrixMemory ( A,N,0,ShiftM );
    else  A = A - ShiftN;  //  shift for the enumeration with 1
  }
  return  (A!=NULL);
}

Boolean  GetMatrixMemory  ( wmatrix & W, word N, word M,
                            word ShiftN, word ShiftM ) {
  W = new wvector[N];
  if (W!=NULL)  {
    for (word i=0;i<N;i++)
      GetVectorMemory ( W[i],M,ShiftM );
    if (W[N-1]==NULL)
          FreeMatrixMemory ( W,N,0,ShiftM );
    else  W = W - ShiftN;  //  shift for the enumeration with 1
  }
  return  (W!=NULL);
}

Boolean  GetMatrixMemory  ( bmatrix & B, word N, word M,
                            word ShiftN, word ShiftM ) {
  B = new bvector[N];
  if (B!=NULL)  {
    for (word i=0;i<N;i++)
      GetVectorMemory ( B[i],M,ShiftM );
    if (B[N-1]==NULL)
          FreeMatrixMemory ( B,N,0,ShiftM );
    else  B = B - ShiftN;  //  shift for the enumeration with 1
  }
  return  (B!=NULL);
}

Boolean  GetMatrixMemory  ( lmatrix & L, word N, word M,
                            word ShiftN, word ShiftM ) {
  L = new lvector[N];
  if (L!=NULL)  {
    for (word i=0;i<N;i++)
      GetVectorMemory ( L[i],M,ShiftM );
    if (L[N-1]==NULL)
          FreeMatrixMemory ( L,N,0,ShiftM );
    else  L = L - ShiftN;  //  shift for the enumeration with 1
  }
  return  (L!=NULL);
}

Boolean  GetMatrixMemory  ( lwmatrix & L, word N, word M,
                            word ShiftN, word ShiftM ) {
  L = new lwvector[N];
  if (L!=NULL)  {
    for (word i=0;i<N;i++)
      GetVectorMemory ( L[i],M,ShiftM );
    if (L[N-1]==NULL)
          FreeMatrixMemory ( L,N,0,ShiftM );
    else  L = L - ShiftN;  //  shift for the enumeration with 1
  }
  return  (L!=NULL);
}

Boolean  GetMatrixMemory  ( psmatrix & P, word N, word M,
                            word ShiftN, word ShiftM ) {
  P = new psvector[N];
  if (P!=NULL)  {
    for (word i=0;i<N;i++)
      GetVectorMemory ( P[i],M,ShiftM );
    if (P[N-1]==NULL)
          FreeMatrixMemory ( P,N,0,ShiftM );
    else  P = P - ShiftN;  //  shift for the enumeration with 1
  }
  return  (P!=NULL);
}

void FreeMatrixMemory  ( rmatrix & A, word N,
                         word ShiftN, word ShiftM ) {
  if (A!=NULL)  {
    A = A + ShiftN;  //  back shift for the work of heap system
    for (word i=0;i<N;i++)
      FreeVectorMemory ( A[i],ShiftM );
    delete[] A;
    A = NULL;
  }
}

void FreeMatrixMemory  ( imatrix & A,  word N,
                         word ShiftN, word ShiftM ) {
  if (A!=NULL)  {
    A = A + ShiftN;  //  back shift for the work of heap system
    for (word i=0;i<N;i++)
      FreeVectorMemory ( A[i],ShiftM );
    delete[] A;
    A = NULL;
  }
}

void FreeMatrixMemory  ( wmatrix & W,  word N,
                         word ShiftN, word ShiftM ) {
  if (W!=NULL)  {
    W = W + ShiftN;  //  back shift for the work of heap system
    for (word i=0;i<N;i++)
      FreeVectorMemory ( W[i],ShiftM );
    delete[] W;
    W = NULL;
  }
}

void FreeMatrixMemory  ( bmatrix & B,  word N,
                         word ShiftN, word ShiftM ) {
  if (B!=NULL)  {
    B = B + ShiftN;  //  back shift for the work of heap system
    for (word i=0;i<N;i++)
      FreeVectorMemory ( B[i],ShiftM );
    delete[] B;
    B = NULL;
  }
}

void FreeMatrixMemory  ( lmatrix & L,  word N,
                         word ShiftN, word ShiftM ) {
  if (L!=NULL)  {
    L = L + ShiftN;  //  back shift for the work of heap system
    for (word i=0;i<N;i++)
      FreeVectorMemory ( L[i],ShiftM );
    delete[] L;
    L = NULL;
  }
}

void FreeMatrixMemory  ( lwmatrix & L,  word N,
                         word ShiftN, word ShiftM ) {
  if (L!=NULL)  {
    L = L + ShiftN;  //  back shift for the work of heap system
    for (word i=0;i<N;i++)
      FreeVectorMemory ( L[i],ShiftM );
    delete[] L;
    L = NULL;
  }
}

void FreeMatrixMemory  ( psmatrix & P,  word N,
                         word ShiftN, word ShiftM ) {
  if (P!=NULL)  {
    P = P + ShiftN;  //  back shift for the work of heap system
    for (word i=0;i<N;i++)
      FreeVectorMemory ( P[i],ShiftM );
    delete[] P;
    P = NULL;
  }
}

Boolean GetMatrix3Memory ( rmatrix3 & A, word N, word M, word K,
                           word ShiftN, word ShiftM, word ShiftK ) {
  A = new rmatrix[N];
  if (A!=NULL)  {
    for (word i=0;i<N;i++)
      GetMatrixMemory ( A[i],M,K,ShiftM,ShiftK );
    if (A[N-1]==NULL)
      FreeMatrix3Memory ( A,N,M,0,ShiftM,ShiftK );
    else
      A = A - ShiftN;  //  shift for the enumeration with 1
  }
  return  (A!=NULL);
}

Boolean GetMatrix3Memory ( imatrix3 & A, word N, word M, word K,
                           word ShiftN, word ShiftM, word ShiftK ) {
  A = new imatrix[N];
  if (A!=NULL)  {
    for (word i=0;i<N;i++)
      GetMatrixMemory ( A[i],M,K,ShiftM,ShiftK );
    if (A[N-1]==NULL)
      FreeMatrix3Memory ( A,N,M,0,ShiftM,ShiftK );
    else
      A = A - ShiftN;  //  shift for the enumeration with 1
  }
  return  (A!=NULL);
}

Boolean GetMatrix3Memory ( wmatrix3 & A, word N, word M, word K,
                           word ShiftN, word ShiftM, word ShiftK ) {
  A = new wmatrix[N];
  if (A!=NULL)  {
    for (word i=0;i<N;i++)
      GetMatrixMemory ( A[i],M,K,ShiftM,ShiftK );
    if (A[N-1]==NULL)
      FreeMatrix3Memory ( A,N,M,0,ShiftM,ShiftK );
    else
      A = A - ShiftN;  //  shift for the enumeration with 1
  }
  return  (A!=NULL);
}

Boolean GetMatrix3Memory ( bmatrix3 &A, word N, word M, word K,
                           word ShiftN, word ShiftM, word ShiftK ) {
  A = new bmatrix[N];
  if (A!=NULL)  {
    for (word i=0;i<N;i++)
      GetMatrixMemory ( A[i],M,K,ShiftM,ShiftK );
    if (A[N-1]==NULL)
      FreeMatrix3Memory ( A,N,M,0,ShiftM,ShiftK );
    else
      A = A - ShiftN;  //  shift for the enumeration with 1
  }
  return  (A!=NULL);
}

Boolean GetMatrix3Memory ( lmatrix3 & A, word N, word M, word K,
                           word ShiftN, word ShiftM, word ShiftK ) {
  A = new lmatrix[N];
  if (A!=NULL)  {
    for (word i=0;i<N;i++)
      GetMatrixMemory ( A[i],M,K,ShiftM,ShiftK );
    if (A[N-1]==NULL)
      FreeMatrix3Memory ( A,N,M,0,ShiftM,ShiftK );
    else
      A = A - ShiftN;  //  shift for the enumeration with 1
  }
  return  (A!=NULL);
}

Boolean GetMatrix3Memory ( lwmatrix3 & A, word N, word M, word K,
                           word ShiftN, word ShiftM, word ShiftK ) {
  A = new lwmatrix[N];
  if (A!=NULL)  {
    for (word i=0;i<N;i++)
      GetMatrixMemory ( A[i],M,K,ShiftM,ShiftK );
    if (A[N-1]==NULL)
      FreeMatrix3Memory ( A,N,M,0,ShiftM,ShiftK );
    else
      A = A - ShiftN;  //  shift for the enumeration with 1
  }
  return  (A!=NULL);
}

Boolean GetMatrix3Memory ( psmatrix3 & A, word N, word M, word K,
                           word ShiftN, word ShiftM, word ShiftK ) {
  A = new psmatrix[N];
  if (A!=NULL)  {
    for (word i=0;i<N;i++)
      GetMatrixMemory ( A[i],M,K,ShiftM,ShiftK );
    if (A[N-1]==NULL)
      FreeMatrix3Memory ( A,N,M,0,ShiftM,ShiftK );
    else
      A = A - ShiftN;  //  shift for the enumeration with 1
  }
  return  (A!=NULL);
}

void FreeMatrix3Memory  ( rmatrix3 & A, word N,      word M,
                          word ShiftN, word ShiftM, word ShiftK ) {
  if (A!=NULL)  {
    A = A + ShiftN;  //  back shift for the work of heap system
    for (word i=0;i<N;i++)
      FreeMatrixMemory ( A[i],M,ShiftM,ShiftK );
    delete[] A;
    A = NULL;
  }
}

void FreeMatrix3Memory  ( imatrix3 & A, word N,      word M,
                          word ShiftN, word ShiftM, word ShiftK ) {
  if (A!=NULL)  {
    A = A + ShiftN;  //  back shift for the work of heap system
    for (word i=0;i<N;i++)
      FreeMatrixMemory ( A[i],M,ShiftM,ShiftK );
    delete[] A;
    A = NULL;
  }
}

void FreeMatrix3Memory  ( wmatrix3 & A, word N,      word M,
                          word ShiftN, word ShiftM, word ShiftK ) {
  if (A!=NULL)  {
    A = A + ShiftN;  //  back shift for the work of heap system
    for (word i=0;i<N;i++)
      FreeMatrixMemory ( A[i],M,ShiftM,ShiftK );
    delete[] A;
    A = NULL;
  }
}

void FreeMatrix3Memory  ( bmatrix3 & A, word N,      word M,
                          word ShiftN, word ShiftM, word ShiftK ) {
  if (A!=NULL)  {
    A = A + ShiftN;  //  back shift for the work of heap system
    for (word i=0;i<N;i++)
      FreeMatrixMemory ( A[i],M,ShiftM,ShiftK );
    delete[] A;
    A = NULL;
  }
}

void FreeMatrix3Memory  ( lmatrix3 & A, word N,      word M,
                          word ShiftN, word ShiftM, word ShiftK ) {
  if (A!=NULL)  {
    A = A + ShiftN;  //  back shift for the work of heap system
    for (word i=0;i<N;i++)
      FreeMatrixMemory ( A[i],M,ShiftM,ShiftK );
    delete[] A;
    A = NULL;
  }
}

void FreeMatrix3Memory  ( lwmatrix3 & A, word N,      word M,
                          word ShiftN, word ShiftM, word ShiftK ) {
  if (A!=NULL)  {
    A = A + ShiftN;  //  back shift for the work of heap system
    for (word i=0;i<N;i++)
      FreeMatrixMemory ( A[i],M,ShiftM,ShiftK );
    delete[] A;
    A = NULL;
  }
}

void FreeMatrix3Memory  ( psmatrix3 & A, word N,      word M,
                          word ShiftN, word ShiftM, word ShiftK ) {
  if (A!=NULL)  {
    A = A + ShiftN;  //  back shift for the work of heap system
    for (word i=0;i<N;i++)
      FreeMatrixMemory ( A[i],M,ShiftM,ShiftK );
    delete[] A;
    A = NULL;
  }
}

realtype  MachinEps ()  {
//  A1.3.1   :  Calculation of the machine's epsilon
realtype  rMachEps = 1.0;
  do
    rMachEps /= 2.0;
  while ((1.0+rMachEps)!=1.0);
  return  2.0*rMachEps;
}

realtype  floatMachinEps()  {
//  A1.3.1   :  Calculation of the machine's epsilon
float fMachEps = 1.0;
  do
    fMachEps /= 2.0;
  while (float(1.0+fMachEps)!=1.0);
  return  2.0*fMachEps;
}

realtype  frac ( realtype R )  {
realtype  i;
  return  modf ( R,&i );
}

long  mod ( long x, long y )  {
long k=x/y;
long f=x-k*y;
  while (f<0)  f += y;
  return f;
}

realtype  Pow ( realtype X, int y )  {
int       m,l;
realtype  B;
  if (y==0)  return  1.0;
  else if (X!=0.0)  {
    B = X;
    m = 1;
    if (y>=0)  l = y;
         else  l = -y;
    while (m++<l)  B = B*X;
    if (y>=0)  return  B;
         else  return  1.0/B;
  } else  return  0.0;
}

realtype  Pow1 ( realtype X, realtype Y )  {
int  k = mround(Y);
  if (fabs(k-Y)<=100.0*MachEps)  return Pow(X,k);
  if (X==0.0)  return 0.0;
         else  return pow(X,Y);
}

realtype  Exp ( realtype X )  {
//realtype  X1 = X;
//realtype  B  = 1.0;
  if   (X>=LnMaxRealExp)     return  MaxReal;
  else if (X<=LnMinRealExp)  return  0.0;
  else  {
    return  exp(X);
    /*
    while (X1>LnMaxReal)  {
      X1 -= LnMaxReal;
      B  *= MaxExponent;
    }
    while (X1<-LnMaxReal)  {
      X1 += LnMaxReal;
      B  /= MaxExponent;
    }
    return B*exp(X1);
    */
  }
}

Boolean Odd ( int i )  {
  return  (i & 1);
}


//  ----------------------------------------------------

long  HexValL ( cpstr S )  {
char  C;
int   i;
long  z=0;
  for (i=0;S[i];i++)  {
    z <<= 4;
    C = (char)toupper(S[i]);
    if (isdigit(C))  z += S[i]-'0';
               else  z += C-'A'+10;
  }
  return  z;
}


//  ----------------------------------------------------

long  OctValL ( cpstr S )  {
int   i;
long  z=0;
  for (i=0;S[i];i++)  {
    z <<= 3;
    z += S[i]-'0';
  }
  return  z;
}


//  ----------------------------------------------------

long  BinValL ( cpstr S )  {
int   i;
long  z=0;
  for (i=0;S[i];i++)  {
    z <<= 1;
    z += S[i]-'0';
  }
  return  z;
}

pstr  BinValS ( long L, pstr S )  {
int   i;
long  z;
  z = long(1) << (8*sizeof(long)-1);
  for (i=0;i<8*sizeof(long);i++)  {
    if (L & z)  S[i] = '1';
          else  S[i] = '0';
    z >>= 1;
  }
  S[8*sizeof(long)] = char(0);
  return  S;
}



//  ----------------------------------------------------

pstr ParamStr ( pstr D, cpstr S, realtype V, int M, cpstr S1 )  {
char  VS[30];
  strcat  ( D,S );
  sprintf ( VS,"%-.*g",M,V );
  strcat  ( D,VS );
  return strcat(D,S1);
}


pstr ParamStr ( pstr D,  cpstr S, realtype V, int M,
                cpstr S1, realtype V2, int M2, cpstr S2 )  {
char  VS[30];
  ParamStr ( D,S,V,M,S1 );
  sprintf  ( VS,"%-.*g",M2,V2 );
  strcat   ( D,VS );
  return strcat(D,S2);
}


pstr CreateCopy ( pstr & Dest, cpstr Source )  {
  if (Dest)  delete[] Dest;
  if (Source)   {
    Dest = new char[strlen(Source)+1];
    strcpy ( Dest,Source );
  } else
    Dest = NULL;
  return Dest;
}

pstr CreateCopy_n ( pstr & Dest, cpstr Source, int n )  {
int l;
  if (Dest)  delete[] Dest;
  if (Source)   {
    l    = IMin ( strlen(Source),n );
    Dest = new char[l+1];
    strncpy ( Dest,Source,l );
    Dest[l] = char(0);
  } else
    Dest = NULL;
  return Dest;
}

pstr CreateCopCat ( pstr & Dest,
                    cpstr Source1, cpstr Source2,
                    cpstr Source3, cpstr Source4,
                    cpstr Source5 )  {
  if (Dest) {
    delete[] Dest;
    Dest = NULL;
  }
  return CreateConcat ( Dest,Source1,Source2,Source3,Source4,Source5 );
}

pstr CreateCopCat ( pstr & Dest,
                    cpstr Source1, cpstr Source2,
                    cpstr Source3, cpstr Source4 )  {
  if (Dest) {
    delete[] Dest;
    Dest = NULL;
  }
  return CreateConcat ( Dest,Source1,Source2,Source3,Source4 );
}

pstr CreateCopCat ( pstr & Dest,
                    cpstr Source1, cpstr Source2,
                    cpstr Source3 )  {
  if (Dest) {
    delete[] Dest;
    Dest = NULL;
  }
  return CreateConcat ( Dest,Source1,Source2,Source3 );
}

pstr CreateCopCat ( pstr & Dest,
                    cpstr Source1, cpstr Source2 )  {
  if (Dest) {
    delete[] Dest;
    Dest = NULL;
  }
  return CreateConcat ( Dest,Source1,Source2 );
}


pstr CreateConcat ( pstr & Dest,
                    cpstr Source1, cpstr Source2,
                    cpstr Source3, cpstr Source4,
                    cpstr Source5 )  {
pstr S;
int  ld,ls;
  if (Dest) ld = strlen(Dest);
       else ld = 0;
  ls = 0;
  if (Source1)  ls += strlen(Source1);
  if (Source2)  ls += strlen(Source2);
  if (Source3)  ls += strlen(Source3);
  if (Source4)  ls += strlen(Source4);
  if (Source5)  ls += strlen(Source5);
  if (ls>0)  {
    S = new char[ls+ld+1];
    if (Dest)  {
      strcpy ( S,Dest );
      delete[] Dest;
    } else
      S[0] = char(0);
    if (Source1) strcat ( S,Source1 );
    if (Source2) strcat ( S,Source2 );
    if (Source3) strcat ( S,Source3 );
    if (Source4) strcat ( S,Source4 );
    if (Source5) strcat ( S,Source5 );
    Dest = S;
  }
  return Dest;
}


pstr CreateConcat ( pstr & Dest,
                    cpstr Source1, cpstr Source2,
                    cpstr Source3, cpstr Source4 )  {
pstr S;
int  ld,ls;
  if (Dest) ld = strlen(Dest);
       else ld = 0;
  ls = 0;
  if (Source1)  ls += strlen(Source1);
  if (Source2)  ls += strlen(Source2);
  if (Source3)  ls += strlen(Source3);
  if (Source4)  ls += strlen(Source4);
  if (ls>0)  {
    S = new char[ls+ld+1];
    if (Dest)  {
      strcpy ( S,Dest );
      delete[] Dest;
    } else
      S[0] = char(0);
    if (Source1) strcat ( S,Source1 );
    if (Source2) strcat ( S,Source2 );
    if (Source3) strcat ( S,Source3 );
    if (Source4) strcat ( S,Source4 );
    Dest = S;
  }
  return Dest;
}


pstr CreateConcat ( pstr & Dest,
                    cpstr Source1, cpstr Source2,
                    cpstr Source3 )  {
pstr S;
int  ld,ls;
  if (Dest) ld = strlen(Dest);
       else ld = 0;
  ls = 0;
  if (Source1)  ls += strlen(Source1);
  if (Source2)  ls += strlen(Source2);
  if (Source3)  ls += strlen(Source3);
  if (ls>0)  {
    S = new char[ls+ld+1];
    if (Dest)  {
      strcpy ( S,Dest );
      delete[] Dest;
    } else
      S[0] = char(0);
    if (Source1) strcat ( S,Source1 );
    if (Source2) strcat ( S,Source2 );
    if (Source3) strcat ( S,Source3 );
    Dest = S;
  }
  return Dest;
}

pstr CreateConcat ( pstr & Dest,
                    cpstr Source1, cpstr Source2 )  {
pstr S;
int  ld,ls;
  if (Dest) ld = strlen(Dest);
       else ld = 0;
  ls = 0;
  if (Source1)  ls += strlen(Source1);
  if (Source2)  ls += strlen(Source2);
  if (ls>0)  {
    S = new char[ls+ld+1];
    if (Dest)  {
      strcpy ( S,Dest );
      delete[] Dest;
    } else
      S[0] = char(0);
    if (Source1) strcat ( S,Source1 );
    if (Source2) strcat ( S,Source2 );
    Dest = S;
  }
  return Dest;
}

pstr CreateConcat ( pstr & Dest, cpstr Source )  {
pstr S;
int  ld,ls;
  if (Dest)   ld = strlen(Dest);
       else   ld = 0;
  if (Source) ls = strlen(Source);
         else ls = 0;
  if (ls>0)  {
    S = new char[ls+ld+1];
    if (Dest)  {
      strcpy ( S,Dest );
      delete[] Dest;
    } else
      S[0] = char(0);
    strcat ( S,Source );
    Dest = S;
  }
  return Dest;
}


pstr LastOccurence ( cpstr S, char c )  {
pstr P=(pstr)S;
pstr R=NULL;
  while (*P)  {
    if (*P==c)  R = P;
    P++;
  }
  return R;
}


pstr FirstOccurence ( cpstr S, char c )  {
pstr P=(pstr)S;
  while (*P)  {
    if (*P==c)  return P;
    P++;
  }
  return NULL;
}

int indexOf ( cpstr S, char c )  {
int i=0;
  while (S[i])  {
    if (S[i]==c)  return i;
    i++;
  }
  return -1;
}

pstr FirstOccurence ( cpstr S, int Slen, cpstr Q, int Qlen )  {
int i,j,k,l;
  l = Slen-Qlen;
  for (i=0;i<=l;i++)  {
    j = 0;
    k = i;
    while (j<Qlen)
      if (S[k++]!=Q[j]) break;
                   else j++;
    if (j>=Qlen)  return  pstr(&(S[i]));
  }
  return NULL;
}

int indexOf ( cpstr S, int Slen, cpstr Q, int Qlen )  {
int i,j,k,l;
  l = Slen-Qlen;
  for (i=0;i<=l;i++)  {
    j = 0;
    k = i;
    while (j<Qlen)
      if (S[k++]!=Q[j]) break;
                   else j++;
    if (j>=Qlen)  return  i;
  }
  return -1;
}


pstr LowerCase ( pstr s )  {
pstr p=s;
  while (*p)  {
    *p = char(tolower(int(*p)));
    p++;
  }
  return s;
}

pstr UpperCase ( pstr s )  {
pstr p=s;
  while (*p)  {
    *p = char(toupper(int(*p)));
    p++;
  }
  return s;
}


void GetString ( pstr L, cpstr S, int M )  {
//  Copies first M characters of string S into string L,
// appending the terminating null. If S contains less
// then M characters, L will be padded with spaces.
int i,j;
  i = 0;
  j = 0;
  while (S[i] && (i<M))
    L[j++] = S[i++];
  while (j<M)
    L[j++] = ' ';
  L[j] = char(0);
}


void GetStrTer ( pstr L, cpstr S, int n, int LMax, int SMax )  {
//   Copies at least n (or LMax if LMax<n) first symbols of
// string S into string L, then continues copying until first
// space or terminating null is found. If the terminating null
// is met among the first n characters or if SMax<n, the string
// L will be padded with spaces till the length of minimum of
// n and LMax and then terminated with the null. 
//   SMax are buffer lengths of L and S, respectively. Even if
// no space is found, the last character in L will be the
// terminating null.
int i,k,lm1,msl,mnsl;
  lm1  = LMax-1;
  msl  = IMin(lm1,SMax);
  mnsl = IMin(n,msl);
  k    = 0;
  for (i=0;i<mnsl;i++)
    if (S[i])  L[k++] = S[i];
         else  break;
  if ((k>=SMax) || (!S[k]))  {
    lm1 = IMin(n,lm1);
    while (k<lm1)
      L[k++] = ' ';
  } else  {
    lm1 = k;
    for (i=lm1;i<msl;i++)
      if (S[i] && (S[i]!=' '))  L[k++] = S[i];
                          else  break;
  }
  L[k] = char(0);
}


void GetStrTerWin32File ( pstr L, cpstr S, int n, int LMax,
                          int SMax )  {
//
// Version of GetStrTer(..) allowing for spaces in the string.
//
//   Copies at least n (or LMax if LMax<n) first symbols of
// string S into string L, then continues copying until first
// terminating null is found. If the terminating null
// is met among the first n characters or if SMax<n, the string
// L will be padded with spaces till the length of minimum of
// n and LMax and then terminated with the null. 
//   SMax are buffer lengths of L and S, respectively. The last
// character in L will be the terminating null.
//
int i,k,lm1,msl,mnsl;
  lm1  = LMax-1;
  msl  = IMin(lm1,SMax);
  mnsl = IMin(n,msl);
  k    = 0;
  for (i=0;i<mnsl;i++)
    if (S[i])  L[k++] = S[i];
         else  break;
  if ((!S[k]) || (k>=SMax))  {
    lm1 = IMin(n,lm1);
    while (k<lm1)
      L[k++] = ' ';
  } else  {
    lm1 = k;
    for (i=lm1;i<msl;i++)
      if (S[i])  L[k++] = S[i];
           else  break;
  }
  L[k] = char(0);
}

void  strcpy_n ( pstr d, cpstr s, int n )  {
//   Copies at most n symbols from string s to d, but
// no more than strlen(s) (s must contain a terminating
// null). The terminating null IS NEITHER appended NOR
// copied to d.
int i;
  i = 0;
  while ((i<n) && (s[i]))  {
    d[i] = s[i];
    i++;
  }
}


void  strcpy_n1 ( pstr d, cpstr s, int n )  {
//   Copies at most n last symbols from string s to d, but
// no more than strlen(s) (s must contain a terminating null).
// The string in d is aligned to the right and added with
// spaces at the left, if necessary. The terminating null
// IS NEITHER appended NOR copied to d.
int i,k;
  i = n-1;
  k = strlen(s)-1;
  while ((i>=0) && (k>=0))
    d[i--] = s[k--];
  while (i>=0)
    d[i--] = ' ';
}

void  strcpy_nr ( pstr d, cpstr s, int n )  {
//   Copies at most n symbols from string s to d, but
// no more than strlen(s) (s must contain a terminating null).
// The string in d is aligned to the right and added with
// spaces at the left, if necessary. The terminating null
// IS NEITHER appended NOR copied to d.
int i,k;
  i = n-1;
  k = IMin(i,strlen(s)-1);
  while ((i>=0) && (k>=0))
    d[i--] = s[k--];
  while (i>=0)
    d[i--] = ' ';
}


void strcpy_ns ( pstr d, cpstr s, int n )  {
//   Copies at most n symbols from string s to d, but
// no more than strlen(s) (s must contain a terminating
// null). The terminating null IS NEITHER appended NOR
// copied to d; rather, d is padded with spaces if
// strlen(s)<n.
int i;
  i = 0;
  while ((i<n) && (s[i]))  {
    d[i] = s[i];
    i++;
  }
  while (i<n)
    d[i++] = ' ';
}


pstr strcpy_cs ( pstr d, cpstr s )  {
//   Copies string s to string d cutting all spaces at
// at the end. Thus, " abcde   " will be copied like
// " abcde" (terminating null appended).
//   The function returns d.
int i;
  i = 0;
  while (s[i])  {
    d[i] = s[i];
    i++;
  }
  i--;
  while ((i>0) && (d[i]==' ')) i--;
  if (d[i]==' ')  d[i]   = char(0);
            else  d[i+1] = char(0);
  return d;
}


pstr strcpy_ncs ( pstr d, cpstr s, int n )  {
//   Copies at most n characters from string s to string d
// cutting all spaces at at the end. Thus, " abcde   " will
// be copied like " abc" at n=4 and like " abcde" at n>5
// (terminating null appended).
//   The function returns d.
int i;
  i = 0;
  while (s[i] && (i<n))  {
    d[i] = s[i];
    i++;
  }
  i--;
  while ((i>0) && (d[i]==' ')) i--;
  if (d[i]==' ')  d[i]   = char(0);
            else  d[i+1] = char(0);
  return d;
}

pstr strcpy_css ( pstr d, cpstr s )  {
//   Copies string s to string d cutting all spaces at
// at the begining and at the end. Thus, " ab c de   "
// will be copied like "ab c de" (terminating null
// appended).
//   The function returns d.
int i,k;
  i = 0;
  while (s[i]==' ')  i++;
  k = 0;
  while (s[i])
    d[k++] = s[i++];
  if (k>0)  {
    k--;
    while ((k>0) && (d[k]==' '))  k--;
    if (d[k]==' ')  d[k] = char(0);
              else  d[k+1] = char(0);
  } else
    d[k] = char(0);
  return d;
}

pstr strcpy_ncss ( pstr d, cpstr s, int n )  {
//   Copies at most n characters from string s to string d cutting
// all spaces at the begining and at the end. Thus, " ab c de  "
// will be copied like "ab" at n=3 (terminating null appended).
//   The function returns d.
int i,k;
  i = 0;
  while ((s[i]==' ') && (i<n))  i++;
  k = 0;
  while (s[i] && (i<n))
    d[k++] = s[i++];
  if (k>0)  {
    k--;
    while ((k>0) && (d[k]==' '))  k--;
    if (d[k]==' ')  d[k] = char(0);
              else  d[k+1] = char(0);
  } else
    d[k] = char(0);
  return d;
}


pstr strcpy_n0 ( pstr d, cpstr s, int n )  {
//   Copies at most n symbols from string s to d, but
// no more than strlen(s) (s must contain a terminating
// null). The terminating null IS appended to d.
//   The function returns d.
int i;
  i = 0;
  while ((i<n) && (s[i]))  {
    d[i] = s[i];
    i++;
  }
  d[i] = char(0);
  return d;
}


int strlen_des ( cpstr s )  {
//  strlen_des returns the length of a string as if all extra
//  spaces from the latter have been deleted. Extra spaces
//  include all leading and tracing spaces and any sequential
//  spaces when more than one. The string does not change.
int i,l;
  l = 0;
  i = 0;
  while (s[i]==' ')  i++;
  while (s[i])  {
    if ((s[i]!=' ') || ((s[i+1]!=' ') && s[i+1]))
      l++;
    i++;
  }
  return l;
}

pstr strcpy_des ( pstr d, cpstr s )  {
//  strcpy_des copies string s into string d removing all extra
//  spaces from the latter. Extra spaces include all leading and
//  tracing spaces and any sequential spaces when more than one.
int i,j;
  j = 0;
  i = 0;
  while (s[i]==' ')  i++;
  while (s[i])  {
    if ((s[i]!=' ') || ((s[i+1]!=' ') && s[i+1]))
      d[j++] = s[i];
    i++;
  }
  d[j] = char(0);
  return d;
}

pstr strcat_des ( pstr d, cpstr s )  {
//  strcpy_des appends string s to string d removing all extra
//  spaces from the latter. Extra spaces include all leading and
//  tracing spaces and any sequential spaces when more than one.
int i,j;
  j = strlen(d);
  i = 0;
  while (s[i]==' ')  i++;
  while (s[i])  {
    if ((s[i]!=' ') || ((s[i+1]!=' ') && s[i+1]))
      d[j++] = s[i];
    i++;
  }
  d[j] = char(0);
  return d;
}


void PadSpaces ( pstr S, int len )  {
//  Pads string S with spaces making its length equal to len.
//  The terminating zero is added, so that S should reserve
// space of a minimum len+1 characters.
int i=strlen(S);
  while (i<len)  S[i++] = ' ';
  S[i] = char(0);
}


pstr CutSpaces ( pstr S, int CutKey )  {
//   Cuts spaces at the begining or end of string S
// according to the value of CutKey. THe function
// returns S;
int i,k;
  i = 0;
  k = 0;
  if (CutKey & SCUTKEY_BEGIN)
    while (S[i]==' ')  i++;
  if (k<i)
    while (S[i])
      S[k++] = S[i++];
  else
    k = strlen(S);
  if ((CutKey & SCUTKEY_END) && (k>0))  {
    k--;
    while ((k>0) && (S[k]==' '))  k--;
    if (S[k]!=' ')  k++;
  }
  S[k] = char(0);
  return S;
}


pstr DelSpaces ( pstr S, char c )  {
//   Removes all spaces (or other symbols as specified by 'c')
// from the string. The string is then shrinked by the number
// of removed characters. Thus, " as ttt  " becomes "asttt".
int  i,j;
  j = 0;
  for (i=0;S[i];i++)
    if (S[i]!=c)  {
      if (j<i)  S[j] = S[i];
      j++;
    }
  S[j] = char(0);
  return S;
}

pstr EnforceSpaces ( pstr S )  {
int i,k;
  i = 0;
  while (S[i])  {
    k = int(S[i]);
    if ((k<32) && (k!=9) && (k!=10) && (k!=13))  S[i] = ' ';
    i++;
  }
  return S;
}


//  ----------------------------------------------------

#define  _fbase  256
#define  _rfbase 256.0
#define  _fsign  0x80
#define  _fsign1 0x7F

#ifdef  UseDoubleFloat
# define _nfPowers  255
# define _nfPower0  127
# define _nfPower8  135
#else
# define _nfPowers  31
# define _nfPower0  15
# define _nfPower8  19
#endif

static realtype _fpower[_nfPowers+1];
static realtype _fpower8;

Boolean InitFPowers()  {
int i;
  _fpower[_nfPower0] = 1.0;
  for (i=1;i<=_nfPower0;i++)  {
    _fpower[_nfPower0+i] = _fpower[_nfPower0+i-1]*_rfbase;
    _fpower[_nfPower0-i] = _fpower[_nfPower0-i+1]/_rfbase;
  }
  _fpower[_nfPowers] = fMaxReal;
  _fpower8 = _fpower[_nfPower8];
  return True;
}


/*

void  int2UniBin ( int I, intUniBin iUB )  {
int j,n;
int k=I;
  if (I<0) k = -k;
  for (j=sizeof(intUniBin)-1;j>=0;j--)  {
    n = k/_fbase;
    n = k-n*_fbase;
    iUB[j] = byte(n);
    k = (k-n)/_fbase;
  }
  if (I<0) iUB[0] |= _fsign;
}

void  short2UniBin ( short S, shortUniBin sUB )  {
int j,n;
int k=S;
  if (S<0) k = -k;
  for (j=sizeof(shortUniBin)-1;j>=0;j--)  {
    n = k/_fbase;
    n = k-n*_fbase;
    sUB[j] = byte(n);
    k = (k-n)/_fbase;
  }
  if (S<0) sUB[0] |= _fsign;
}


void  long2UniBin ( long L, longUniBin lUB )  {
int  j,jn;
long n;
long k=L;
  if (L<0) k = -k;
  for (j=sizeof(longUniBin)-1;j>=0;j--)  {
    n  = k/_fbase;
    jn = k-n*_fbase;
    lUB[j] = byte(jn);
    k = (k-jn)/_fbase;
  }
  if (L<0) lUB[0] |= _fsign;
}

void  word2UniBin ( word W, wordUniBin wUB )  {
int  j;
word n;
word k=W;
  for (j=sizeof(wordUniBin)-1;j>=0;j--)  {
    n = k/word(_fbase);
    n = k-n*_fbase;
    wUB[j] = byte(n);
    k      = (k-n)/word(_fbase);
  }
}

*/

void  int2UniBin ( int I, intUniBin iUB )  {
int j,n,sh;
//  sh = 8*(sizeof(I)-1);
  sh = 8*(sizeof(intUniBin)-1);
  for (j=sizeof(intUniBin)-1;j>=0;j--)  {
    n = (I >> sh) & 0xFF;
    iUB[j] = byte(n);
    sh -= 8;
  }
}

void  short2UniBin ( short S, shortUniBin sUB )  {
int   j,sh;
short n;
//  sh = 8*(sizeof(S)-1);
  sh = 8*(sizeof(shortUniBin)-1);
  for (j=sizeof(shortUniBin)-1;j>=0;j--)  {
    n = (S >> sh) & 0xFF;
    sUB[j] = byte(n);
    sh -= 8;
  }
}

void  long2UniBin ( long L, longUniBin lUB )  {
int  j,sh;
long n;
//  sh = 8*(sizeof(L)-1);
  sh = 8*(sizeof(longUniBin)-1);
  for (j=sizeof(longUniBin)-1;j>=0;j--)  {
    n = (L >> sh) & 0xFF;
    lUB[j] = byte(n);
    sh -= 8;
  }
}

void  word2UniBin ( word W, wordUniBin wUB )  {
int  j,sh;
word n;
//  sh = 8*(sizeof(W)-1);
  sh = 8*(sizeof(wordUniBin)-1);
  for (j=sizeof(wordUniBin)-1;j>=0;j--)  {
    n = (W >> sh) & 0xFF;
    wUB[j] = byte(n);
    sh -= 8;
  }
}


void  real2UniBin ( realtype R, realUniBin rUB )  {
int      k1,k2,k;
realtype Q,L;
  if (R>=0)  Q = R;
       else  Q = -R;
  k1 = 0;
  k2 = _nfPowers;
  do {
    k = (k1+k2)/2;
    if (Q>=_fpower[k])  k1 = k;
                  else  k2 = k;
  } while (k2>k1+1);
  if (Q<=_fpower[0])  k2 = 0;
  Q = (Q/_fpower[k2])*_fpower8;
  rUB[0] = byte(k2);
  for (k=sizeof(realUniBin)-1;k>0;k--)  {
    L      = floor(Q/_rfbase);
    rUB[k] = byte(int(Q-L*_rfbase));
    Q      = L;
  }
  if (R<0)  rUB[1] |= _fsign;

}

void  float2UniBin ( realtype R, floatUniBin fUB )  {
int      k1,k2,k;
realtype Q,L;
  if (R>=0)  Q = R;
       else  Q = -R;
  k1 = 0;
  k2 = _nfPowers;
  do {
    k = (k1+k2)/2;
    if (Q>=_fpower[k])  k1 = k;
                  else  k2 = k;
  } while (k2>k1+1);
  if (Q<=_fpower[0])  k2 = 0;
  Q = (Q/_fpower[k2])*_fpower8;
  fUB[0] = byte(k2);
  for (k=sizeof(realUniBin)-1;k>0;k--)  {
    L = floor(Q/_rfbase);
    if (k<=sizeof(floatUniBin))
      fUB[k] = byte(int(Q-L*_rfbase));
    Q = L;
  }
  if (R<0)  fUB[1] |= _fsign;

}

/*
void  UniBin2int ( intUniBin iUB, int & I )  {
int j;
  I = int(iUB[0] & _fsign1);
  for (j=1;j<sizeof(intUniBin);j++)
    I = I*_fbase + byte(iUB[j]);
  if (iUB[0] & _fsign)  {
    I = -I;
    if (I==0)  I = MinInt4;
  }
}

void  UniBin2short ( shortUniBin sUB, short & S )  {
int j;
  S = short(sUB[0] & _fsign1);
  for (j=1;j<sizeof(shortUniBin);j++)
    S = S*_fbase + byte(sUB[j]);
  if (sUB[0] & _fsign)  {
    S = -S;
    if (S==0)  S = MinInt;
  }
}

void  UniBin2long ( longUniBin lUB, long & L )  {
int j;
  L = long(lUB[0] & _fsign1);
  for (j=1;j<sizeof(longUniBin);j++)
    L = L*long(_fbase) + long(lUB[j]);
  if (lUB[0] & _fsign)  {
    L = -L;
    if (L==0)  L = MinInt4;
  }
}

void  UniBin2word ( wordUniBin wUB, word & W )  {
int j;
  W = word(wUB[0]);
  for (j=1;j<sizeof(word);j++)  
    W = W*word(_fbase) + byte(wUB[j]);
}
*/

void  UniBin2int ( intUniBin iUB, int & I )  {
int j,n,sh;
//  sh = 8*sizeof(I);
  sh = 8*sizeof(intUniBin);
  I  = 0x00;
  for (j=sizeof(intUniBin)-1;j>=0;j--)  {
    sh -= 8;
    n   = byte(iUB[j]);
    I   = I | (n << sh);
  }
}

void  UniBin2short ( shortUniBin sUB, short & S )  {
int   j,sh;
short n;
//  sh = 8*sizeof(S);
  sh = 8*sizeof(shortUniBin);
  S  = 0x00;
  for (j=sizeof(shortUniBin)-1;j>=0;j--)  {
    sh -= 8;
    n   = byte(sUB[j]);
    S   = S | (n << sh);
  }
}

void  UniBin2long ( longUniBin lUB, long & L )  {
int  j,sh;
long n;
//  sh = 8*sizeof(L);
  sh = 8*sizeof(longUniBin);
  L  = 0x00;
  for (j=sizeof(longUniBin)-1;j>=0;j--)  {
    sh -= 8;
    n   = byte(lUB[j]);
    L   = L | (n << sh);
  }
}

void  UniBin2word ( wordUniBin wUB, word & W )  {
int  j,sh;
word n;
//  sh = 8*sizeof(W);
  sh = 8*sizeof(wordUniBin);
  W  = 0x00;
  for (j=sizeof(wordUniBin)-1;j>=0;j--)  {
    sh -= 8;
    n   = byte(wUB[j]);
    W   = W | (n << sh);
  }
}

void  UniBin2real ( realUniBin rUB, realtype & R )  {
int j,s;
  if (rUB[1] & _fsign)  {
    s = 1;
    rUB[1] &= _fsign1;
  } else
    s = 0;
  R = int(rUB[1]);
  for (j=2;j<sizeof(realUniBin);j++)  
    R = R*_rfbase + int(rUB[j]);
  R = (R/_fpower8)*_fpower[int(rUB[0])];
  if (s)  R = -R;
}

void  UniBin2float ( floatUniBin fUB, realtype & R )  {
int j,s;
  if (fUB[1] & _fsign)  {
    s = 1;
    fUB[1] &= _fsign1;
  } else
    s = 0;
  R = int(fUB[1]);
  for (j=2;j<sizeof(floatUniBin);j++)  
    R = R*_rfbase + int(fUB[j]);
  for (j=sizeof(floatUniBin);j<sizeof(realUniBin);j++)
    R *= _rfbase;
  R = (R/_fpower8)*_fpower[int(fUB[0])];
  if (s)  R = -R;
}


void mem_write ( int I, pstr S, int & l )  {
intUniBin iUB;
  int2UniBin ( I,iUB );
  memcpy ( &(S[l]),iUB,sizeof(intUniBin) );
  l += sizeof(intUniBin);
  S[l] = char(0);
}

void mem_write ( short I, pstr S, int & l )  {
shortUniBin sUB;
  short2UniBin ( I,sUB );
  memcpy ( &(S[l]),sUB,sizeof(shortUniBin) );
  l += sizeof(shortUniBin);
  S[l] = char(0);
}

void mem_write ( long I, pstr S, int & l )  {
longUniBin lUB;
  long2UniBin ( I,lUB );
  memcpy ( &(S[l]),lUB,sizeof(longUniBin) );
  l += sizeof(longUniBin);
  S[l] = char(0);
}

void mem_write ( word W, pstr S, int & l )  {
wordUniBin wUB;
  word2UniBin ( W,wUB );
  memcpy ( &(S[l]),wUB,sizeof(wordUniBin) );
  l += sizeof(wordUniBin);
  S[l] = char(0);
}

void mem_write ( realtype R, pstr S, int & l )  {
realUniBin rUB;
  real2UniBin ( R,rUB );
  memcpy ( &(S[l]),rUB,sizeof(realUniBin) );
  l += sizeof(realUniBin);
  S[l] = char(0);
}

void mem_write ( pstr L, int len, pstr S, int & l )  {
  memcpy ( &(S[l]),L,len );
  l += len;
  S[l] = char(0);
}

void mem_write ( pstr L, pstr S, int & l )  {
int len;
  if (L)  len = strlen(L);
    else  len = 0;
  mem_write ( len,S,l );
  if (len>0)  {
    memcpy ( &(S[l]),L,len );
    l += len;
    S[l] = char(0);
  }
}

void mem_write ( Boolean  B, pstr S, int & l )  {
  if (B)  S[l++] = 'Y';
    else  S[l++] = 'N';
  S[l] = char(0);
}


void mem_read ( int & I, cpstr S, int & l )  {
intUniBin iUB;
  memcpy ( iUB,&(S[l]),sizeof(intUniBin) );
  l += sizeof(intUniBin);
  UniBin2int ( iUB,I );
}

void mem_read ( short & I, cpstr S, int & l )  {
shortUniBin sUB;
  memcpy ( sUB,&(S[l]),sizeof(shortUniBin) );
  l += sizeof(shortUniBin);
  UniBin2short ( sUB,I );
}

void mem_read ( long & I, cpstr S, int & l )  {
longUniBin lUB;
  memcpy ( lUB,&(S[l]),sizeof(longUniBin) );
  l += sizeof(longUniBin);
  UniBin2long ( lUB,I );
}

void mem_read ( word & W, cpstr S, int & l )  {
wordUniBin wUB;
  memcpy ( wUB,&(S[l]),sizeof(wordUniBin) );
  l += sizeof(wordUniBin);
  UniBin2word ( wUB,W );
}

void mem_read ( realtype & R, cpstr S, int & l )  {
realUniBin rUB;
  memcpy ( rUB,&(S[l]),sizeof(realUniBin) );
  l += sizeof(realUniBin);
  UniBin2real ( rUB,R );
}

void mem_read ( pstr L, int len, cpstr S, int & l )  {
  memcpy ( L,&(S[l]),len );
  l += len;
}

void mem_read ( pstr & L, cpstr S, int & l )  {
int len;
  if (L)  {
    delete[] L;
    L = NULL;
  }
  mem_read ( len,S,l );
  if (len>0)  {
    L = new char[len+1];
    memcpy ( L,&(S[l]),len );
    L[len] = char(0);
    l += len;
  }
}

void mem_read ( Boolean & B, cpstr S, int & l )  {
  B = (S[l]=='Y');
  l++;
}

// -------------------------------------------------------

Boolean InitMatType()  {
  MachEps      = MachinEps();
  floatMachEps = floatMachinEps();
  LnMaxReal    = log(fMaxReal);
  LnMinReal    = log(fMinReal);
  LnMaxRealExp = LnMaxReal;
  LnMinRealExp = LnMinReal;
  InitFPowers();
  return True;
}

/* ===================================================  */

// ***  end of  <MatType>
