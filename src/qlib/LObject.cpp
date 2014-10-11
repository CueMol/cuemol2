// -*-Mode: C++;-*-
//
// $Id: LObject.cpp,v 1.1 2007/03/30 15:20:56 rishitani Exp $
//

#include <common.h>

#include "LObject.hpp"
#include "LClass.hpp"
#include "ClassRegistry.hpp"

#include "LString.hpp"
using std::set;
using std::pair;

using namespace qlib;

/** get props of the class "pcls" */
/*static
void getPropNamesHelper(LClass *pcls, set<pair<LString, LString> > &toacm)
{
  int i;
  
  PropHndlr *ph = pcls->getPropHndlr();
  
  if (ph!=NULL)
    ph->getPropNames(toacm);
  
  // recurse super classes
  int nspcls = pcls->getSuperClassNames(NULL, 0);
  if (nspcls<=0)
    return; // no super classes
  
  ClassRegistry *pMgr = ClassRegistry::getInstance();
  
  LString *pnames = MB_NEW LString[nspcls];
  pcls->getSuperClassNames(pnames, nspcls);
  for (i=0; i<nspcls; ++i) {
    LClass *pcls2 = pMgr->getClassObj(pnames[i]);
    if (pcls2==NULL) continue;
    getPropNamesHelper(pcls2, toacm);
  }
  
  return;
}
*/
