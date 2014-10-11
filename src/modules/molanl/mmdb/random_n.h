//  $Id: random_n.h,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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
//    05.02.03   <--  Date of Last Modification.
//                   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//  -----------------------------------------------------------------
//
//  **** Module  :  Random_N  <interface>
//       ~~~~~~~~~
//  **** Classes :  CRandomNumber ( random number generator )
//       ~~~~~~~~~
//
//   (C) E. Krissinel'  1997-2008
//
//  =================================================================
//

#ifndef  __Random_N__
#define  __Random_N__

#ifndef  __File__
#include "file_.h"
#endif


//  -------------------------------------------------------------

#define _RN_MAX_IJ 31328
#define _RN_MAX_KL 30081

DefineClass(CRandomNumber)

class CRandomNumber  {
  public :
    CRandomNumber ( long IJ=0, long KL=0 );
    void  Init    ( long IJ=0, long KL=0 );
    realtype gauss_rnd();  //  Gaussian random numbers
    realtype random   ();  //  Uniform [0..1] random number generator
    realtype srandom  ();  //  Uniform [-1..1] random number generator

    void  read    ( RCFile f );
    void  write   ( RCFile f );
  protected :
    long     I97,J97;
    realtype U[97],C,CD,CM;
    realtype gset;
    long     iset;
};

#endif
