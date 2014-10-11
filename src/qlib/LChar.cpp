// -*-Mode: C++;-*-
//
// LChar.h
//   character operations
//
// $Id: LChar.cpp,v 1.1 2007/03/30 15:20:56 rishitani Exp $

#include <common.h>

#include "LChar.hpp"

using namespace qlib;

char LChar::toLower(char c)
{
  return (char) tolower(c);
}

char LChar::toUpper(char c)
{
  return (char) toupper(c);
}

char *LChar::toLower(char *psz)
{
  char *r = psz;
  for ( ; *psz!='\0'; psz++)
    *psz = (char)tolower(*psz);
  return r;
}

char *LChar::toUpper(char *psz)
{
  char *r = psz;
  for ( ; *psz!='\0'; psz++)
    *psz = (char)toupper(*psz);
  return r;
}

char *LChar::trim(char *p, const char *ws /*= " \t\r\n"*/)
{
  // remove leading WS
  int n = ::strspn(p,ws);
  char *retval = &p[n];

  // remove trailing WS
  int idx = ::strlen(retval)-1;
  if(idx<0) return retval;
  for( ;; ){
    const char *res = ::strchr(ws,retval[idx]);
    if(res==NULL)
      break;
    idx--;
    MB_ASSERT(idx>=0);
  }

  retval[idx+1] = '\0';
  return retval;
}
