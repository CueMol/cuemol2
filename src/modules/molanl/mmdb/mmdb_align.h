//  $Id: mmdb_align.h,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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
//  **** Module  :  MMDB_Align <interface>
//       ~~~~~~~~~
//  **** Classes    :  CAlignment  ( alignment of character strings )
//       ~~~~~~~~~~~~  CAlignment1 ( alignment of integer vectors   )
//
//  (C) E.Krissinel'  2000-2008
//
//  =================================================================
//

#ifndef __MMDB_Align__
#define __MMDB_Align__

#ifndef  __Stream__
#include "stream_.h"
#endif


//  =====================   CAlignParams   ======================


DefineClass(CAlignParams);
DefineStreamFunctions(CAlignParams)

class CAlignParams : public CStream  {

  public :

    realtype  gapWeight,spaceWeight;
    realtype  equalScore,nequalScore;
    int       method;

    CAlignParams();
    CAlignParams ( RPCStream Object );

    void write ( RCFile f );
    void read  ( RCFile f );

  protected :
    void InitAlignParams();

};


//  =====================   CAlignment   ======================

DefineClass(CAlignment)

#define ALIGN_GLOBAL    0
#define ALIGN_LOCAL     1
#define ALIGN_GLOBLOC   2
#define ALIGN_FREEENDS  3

class  CAlignment : public CStream  {

  public :

    CAlignment  ();
    CAlignment  ( RPCStream Object );
    ~CAlignment ();

    void SetAffineModel ( realtype WGap,   realtype WSpace  );
    void SetScores      ( realtype SEqual, realtype SNEqual );

    void Align          ( cpstr S, cpstr T, int Method=ALIGN_GLOBAL );

    pstr     GetAlignedS()  {  return AlgnS;      }
    pstr     GetAlignedT()  {  return AlgnT;      }
    realtype GetScore   ()  {  return VAchieved;  }
    char     GetSpace   ()  {  return Space;      }

    virtual void OutputResults ( RCFile f, cpstr S, cpstr T  );

    void read   ( RCFile f );
    void write  ( RCFile f );

  protected :

    char     Space;
    int      AlignKey, SLen,TLen;
    rmatrix  VT,ET,FT;
    pstr     AlgnS,AlgnT;
    realtype VAchieved;
    realtype SEq,SNEq, Wg,Ws;

    virtual void  InitAlignment();
    virtual void  FreeMemory   ();
    virtual realtype  Score    ( char A, char B );

    void    BuildGATable ( cpstr S, cpstr T,
                           Boolean FreeSEnd, Boolean FreeTEnd );
    void    BuildLATable ( cpstr S, cpstr T );
    void    Backtrace    ( cpstr S, cpstr T, int J, int I,
                           Boolean StopAtZero );
    void    AdjustEnds   ( cpstr S, cpstr T, int J, int I );
    void    PrintVT      ( cpstr S, cpstr T );

};



//  =====================   CAlignment1   ======================

DefineClass(CAlignment1)

class  CAlignment1 : public CStream  {

  public :

    CAlignment1 ();
    CAlignment1 ( RPCStream Object );
    ~CAlignment1();

    void SetAffineModel ( realtype WGap,   realtype WSpace  );
    void SetScores      ( realtype SEqual, realtype SNEqual );

    void Align          ( ivector S, int SLength,
                          ivector T, int TLength,
                          int Method=ALIGN_GLOBAL );

    ivector  GetAlignedS   ()  { return AlgnS;     }
    ivector  GetAlignedT   ()  { return AlgnT;     }
    int      GetAlignLength()  { return AlgnLen;   }
    realtype GetScore      ()  { return VAchieved; }

    virtual void OutputResults ( RCFile f, ivector S, int lenS,
                                           ivector T, int lenT );

    void read   ( RCFile f );
    void write  ( RCFile f );

  protected :

    int      Space;
    int      AlignKey, SLen,TLen, AlgnLen;
    rmatrix  VT,ET,FT;
    ivector  AlgnS,AlgnT;
    realtype VAchieved;
    realtype SEq,SNEq, Wg,Ws;

    virtual void  InitAlignment1();
    virtual void  FreeMemory    ();
    virtual realtype  Score     ( int A, int B );

    void    BuildGATable ( ivector S, ivector T,
                           Boolean FreeSEnds, Boolean FreeTEnds );
    void    BuildLATable ( ivector S, ivector T );
    void    Backtrace    ( ivector S, ivector T, int J, int I,
                           Boolean StopAtZero );
    void    AdjustEnds   ( ivector S, ivector T, int J, int I );
    void    PrintVT      ( ivector S, ivector T );

};


#endif
