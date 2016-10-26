// -*-Mode: C++;-*-
//
// LChar.h
//   character operations
//
// $Id: LChar.hpp,v 1.5 2010/12/25 13:13:21 rishitani Exp $

#ifndef L_CHAR_H__
#define L_CHAR_H__

#include "qlib.hpp"

namespace qlib {

  class QLIB_API LChar
  {
  public:
    static char toLower(char c);
    static char toUpper(char c);

    static char *toLower(char *psz);
    static char *toUpper(char *psz);

    static int length(const char *psz) {
      return strlen(psz);
    }

    /** duplicate the string psz (uses new operator) */
    static char *dup(const char *psz) {
      int nlen = length(psz);
      char *pn = MB_NEW char[nlen+1];
      pn[nlen] = '\0';
      memcpy(pn,psz,nlen);
      return pn;
    }

    static void substr(const char *psrc,
		       int start, int end,
		       char *pdst) {
      int i;
      for (i=0; i<end-start; i++)
	pdst[i] = psrc[i+start];
      pdst[i] = '\0';
    }

    static int copy(const char *psrc,
		    char *pdst, int nlen) {
      int i;
      for (i=0; i<nlen-1 && psrc[i]!='\0'; i++)
	pdst[i] = psrc[i];
      pdst[i] = '\0';
      return i;
    }

    static char *trim(char *p, const char *ws = " \t\r\n");

    static bool isEmpty(const char *p) {
      if (p==NULL) return true;
      else if (p[0]=='\0') return true;
      else return false;
    }


    static bool equals(const char *p1, const char *p2) {
      return ::strcmp(p1, p2)==0;
    }

    static int compare(const char *p1, const char *p2) {
      return ::strcmp(p1, p2);
    }

    static int indexOf(const char *psz, char c) {
      const char *p = ::strchr(psz, c);
      if(p==NULL)
	return -1;
      size_t ret = p-psz;
      return int( ret );
    }

    static bool startsWith(const char *psz, const char *part) {
      int npart = ::strlen(part);
      return ::strncmp(psz, part, npart)==0;
    }
  
    static bool toDouble(const char *p, double &val) {
      if (p==NULL || p[0]=='\0') return false;
      char *sptr;
      val = strtod(p, &sptr);
      if(sptr[0]!='\0')
	return false;
      return true;
    }

    static bool toInt(const char *p, int &val, int nbase=0) {
      if (p==NULL || p[0]=='\0') return false;
      char *sptr;
      val = strtol(p, &sptr, nbase);
      if(sptr[0]!='\0')
	return false;
      return true;
    }
  };

}

#endif
