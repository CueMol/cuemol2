//  $Id: mmdb_mask.cpp,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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
//    24.04.03   <--  Date of Last Modification.
//                   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//  -----------------------------------------------------------------
//
//  **** Module  :   MMDB_Mask  <implementation>
//       ~~~~~~~~~
//  **** Project :   MacroMolecular Data Base (MMDB)
//       ~~~~~~~~~
//
//  **** Classes :   CMask  ( atom selection mask  )
//       ~~~~~~~~~   
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

#ifndef  __MMDB_Mask__
#include "mmdb_mask.h"
#endif


//  ====================  CMask  ========================

CMask::CMask() : CStream()  {
  InitMask();
}

CMask::CMask ( RPCStream Object ) : CStream(Object)  {
  InitMask();
}

CMask::~CMask()  {
  ClearMask();
}

void CMask::InitMask()  {
  mlen = 0;
  m    = NULL;
}

void CMask::SetMaskBit ( int BitNo )  {
int n,i;
  n = BitNo/(8*sizeof(word));
  Expand ( n+1 );
  i = BitNo - n*(8*sizeof(word));
  m[n] |= ((word)1 << i);  
}

void CMask::Expand ( int n )  {
wvector m1;
int     i;
  if (mlen<n)  {
    m1 = new word[n];
    for (i=0;i<mlen;i++)
      m1[i] = m[i];
    for (i=mlen;i<n;i++)
      m1[i] = 0;
    if (m)  delete[] m;
    m    = m1;
    mlen = n;
  }
}

void  CMask::NewMask ( PPCMask Mask, int nMasks )  {
int  i,nlen;
word w;
  ClearMask();
  if (Mask && (nMasks>0))  {
    nlen = 0;
    w    = 0;
    while (w==0)  {
      for (i=0;i<nMasks;i++)
        if (Mask[i])  {
          if (nlen<Mask[i]->mlen)
            w |= Mask[i]->m[nlen];
        }
      nlen++;
      w = ~w;
    }
    Expand ( nlen );
    i    = nlen-1;
    m[i] = 1;
    while (!(m[i] & w))
      m[i] <<= 1;
  } else  {
    Expand ( 1 );
    m[0] = 1;
  }
}

void  CMask::CopyMask ( PCMask Mask )  {
int i;
  if (mlen!=Mask->mlen)  ClearMask();
  if (Mask)  {
    mlen = Mask->mlen;
    if (mlen>0)  {
      m = new word[mlen];
      for (i=0;i<mlen;i++)
        m[i] = Mask->m[i];
    }
  }
}

void  CMask::SetMask ( PCMask Mask )  {
int i;
  if (Mask) {
    Expand ( Mask->mlen );
    for (i=0;i<Mask->mlen;i++)
      m[i] |= Mask->m[i]; 
  }
}

void  CMask::RemoveMask ( PCMask Mask )  {
int i,l;
  if (Mask) {
    l = IMin(mlen,Mask->mlen);
    for (i=0;i<l;i++)
      m[i] &= ~Mask->m[i]; 
  }
}

void  CMask::SelMask ( PCMask Mask )  {
int i,l;
  if (Mask)  {
    l = IMin(mlen,Mask->mlen);
    for (i=0;i<l;i++)
      m[i] &= Mask->m[i];
    for (i=l;i<mlen;i++)
      m[i] = 0;
  } else
    ClearMask();
}

void  CMask::XadMask ( PCMask Mask )  {
int i;
  if (Mask) {
    Expand ( Mask->mlen );
    for (i=0;i<Mask->mlen;i++)
      m[i] ^= Mask->m[i]; 
  }
}

void  CMask::ClearMask()  {
  if (m)  delete[] m;
  m = NULL;
  mlen = 0;
}

void  CMask::NegMask()  {
int i;
  for (i=0;i<mlen;i++)
    m[i] = ~m[i];
}

Boolean  CMask::CheckMask ( PCMask Mask )  {
int i,l;
  if (Mask)  {
    i = 0;
    l = IMin(mlen,Mask->mlen);
    while ((i<l) && (!(m[i] & Mask->m[i])))  i++;
    return (i<l);
  } else
    return False;
}

Boolean  CMask::isMask()  {
int i=0;
  while ((i<mlen) && (!m[i]))  i++;
  return (i<mlen);
}

pstr  CMask::Print ( pstr S )  {
int  i,j,k;
word w;
  j = 0;
  for (i=0;i<mlen;i++)  {
    w = 1;
    for (k=0;k<8*sizeof(word);k++)  {
      if (w & m[i])  S[j] = '1';
               else  S[j] = '0';
      w <<= 1;
      j++;
    }
  }
  S[j] = char(0);
  return S;
}

void  CMask::write ( RCFile f )  {
int i;
  f.WriteInt ( &mlen );
  for (i=0;i<mlen;i++)
    f.WriteWord ( &(m[i]) );
}
   
void  CMask::read ( RCFile f )  {
int i;
  if (m)  {
    delete[] m;
    m = NULL;
  }
  f.ReadInt ( &mlen );
  if (mlen>0)  {
    m = new word[mlen];
    for (i=0;i<mlen;i++)
      f.ReadWord ( &(m[i]) );
  }
}


MakeStreamFunctions(CMask)


