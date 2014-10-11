/*//////////////////////////////////////////////////////////////// 
Permission to use, copy, modify, and distribute this program for 
any purpose, with or without fee, is hereby granted, provided that
the notices on the head, the reference information, and this
copyright notice appear in all copies or substantial portions of 
the Software. It is provided "as is" without express or implied 
warranty.
*////////////////////////////////////////////////////////////////

#ifndef EDTSURF_COMMON_PARA_H
#define EDTSURF_COMMON_PARA_H

#include <stdlib.h>
#include <stdio.h>
#include <time.h>
#include <string.h>
#include <math.h>

#define maxnumchains 120

namespace edtsurf {


struct atom
{
  char	   simpletype;		// atom hetatm
  int        seqno;
  char       detail;         // 1 to 12
  float	   x,y,z;
  char       ins;
  unsigned char inout;//1 out 2 middle 3 inner

  // char       detailtype[5];  // cg
  // char       residue[3];     // leu
  // char       residueid; // 1-21
  // char       chainid;        // a b or null
  // int        resno; // 408
  // float      occu,tempe;
  // char       alt;

};

////////////////////////////////


}


#endif

