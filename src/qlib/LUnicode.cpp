// -*-Mode: C++;-*-
//
// Unicode support
//
// $Id: LUnicode.cpp,v 1.4 2009/08/04 14:15:44 rishitani Exp $

#include <common.h>

#include "LString.hpp"
#include "LDebug.hpp"
#include "LUnicode.hpp"
#include "LExceptions.hpp"

#ifdef WIN32
#  include <windows.h>
#endif

using namespace qlib;

U16Char qlib::UTF8toUCS16(const LString &utf8, int &index)
{
  const char *pstr = utf8.c_str();
  int len = utf8.length();
  
  // Convert UTF-8 --> UCS-16
  if (index>=len) {
    MB_THROW(RuntimeException, "End of string");
    return 0;
  }

  unsigned short c1 = pstr[index], c2, c3, wc;
  
  // ASCII char
  if (c1<=0x7F) {
    ++index;
    return c1;
  }
  
  if ((c1&0xE0)==0xC0) {
    c1 &= 0x1F;
    ++index;
    if (index>=len) {
      MB_THROW(RuntimeException, "invalid UTF-8 encoding");
      return 0;
    }

    c2 = pstr[index];
    if ((c2&0xC0)!=0x80) {
      MB_THROW(RuntimeException, "invalid UTF-8 encoding");
      return 0;
    }
    c2 &= 0x3F;

    wc = (c1<<6) + c2;
    ++index;
    return wc;
  }

  if ((c1&0xF0)==0xE0) {
    c1 &= 0x0F;
    ++index;
    if (index>=len) {
      MB_THROW(RuntimeException, "invalid UTF-8 encoding");
      return 0;
    }

    c2 = pstr[index];
    if ((c2&0xC0)!=0x80) {
      MB_THROW(RuntimeException, "invalid UTF-8 encoding");
      return 0;
    }
    c2 &= 0x3F;

    ++index;
    if (index>=len) {
      MB_THROW(RuntimeException, "invalid UTF-8 encoding");
      return 0;
    }

    c3 = pstr[index];
    if ((c3&0xC0)!=0x80) {
      MB_THROW(RuntimeException, "invalid UTF-8 encoding");
      return 0;
    }
    c3 &= 0x3F;
    wc = (c1<<12) + (c2<<6) + c3;
    ++index;
    return wc;
  }

  // TO DO: surrogate
  MB_THROW(RuntimeException, "UTF-8 surrogate not supported");
  return 0;
}

bool qlib::isASCII(const LString &str)
{
  int i;
  const unsigned char *pcstr = (const unsigned char *)str.c_str();

  for (i=0; i<str.length();++i) {
    if (pcstr[i]>0x7F)
      return false;
  }
  return true;
}

U16Char *qlib::UTF8toUCS16(const LString &utf8, int *pucs16len /*=NULL*/)
{
  int i, iwcs;
  for (i=0, iwcs=0; i<utf8.length();++iwcs) {
    UTF8toUCS16(utf8, i);
  }

  U16Char *pret = MB_NEW U16Char[iwcs+1];
  if (pucs16len!=NULL)
    *pucs16len = iwcs;
  for (i=0, iwcs=0; i<utf8.length(); ++iwcs) {
    pret[iwcs] = UTF8toUCS16(utf8, i);
  }
  pret[iwcs] = (U16Char)0;

  return pret;
}

void qlib::UCS16toUTF8(const U16Char *ucs16, int nwclen, LString &utf8)
{
  int i;

  for (i=0; ; ++i) {
    // check EOS
    if (nwclen<0) {
      if (ucs16[i]==0)
        break;
    }
    else if (i>=nwclen)
      break;

    // conv UCS16-->UTF8
    unsigned int c = (unsigned int) ucs16[i];
    if (c==0)
      break;
    else if (c<0x7F)
      utf8 += (char)c;
    else if (c<0x7FF) {
      unsigned int c1 = c >> 6;
      unsigned int c2 = c & 0x3F;
      utf8 += char(c1 + 0xC0);
      utf8 += char(c2 + 0x80);
    }
    else {
      unsigned int c1 = c >> 12;
      unsigned int c2 = (c&0x0FFF) >> 6;
      unsigned int c3 = c & 0x3F;
      utf8 += char(c1 + 0xE0);
      utf8 += char(c2 + 0x80);
      utf8 += char(c3 + 0x80);
    }
    // TO DO: support UCS16 surrogate character!!
  }

}

FILE *qlib::fopen_utf8(const LString &utf8name, const LString &utf8mode)
{
  FILE *fp = NULL;

#ifdef _WIN32

  wchar_t *pwcs, *wcsmode;
  try {
    // conv pathname
    pwcs = (wchar_t *)qlib::UTF8toUCS16(utf8name);
  }
  catch (const LException &ex) {
    LString msg = LString::format("fopen_utf8: cannot convert UTF8 file name <%s>", utf8name.c_str());
    LOG_DPRINTLN(msg);
    MB_THROW(IOException, msg);
    return NULL;
  }
    
  try {
    // conv modestring
    wcsmode = (wchar_t *)qlib::UTF8toUCS16(utf8mode);
  }
  catch (const LException &ex) {
    LString msg = LString::format("fopen_utf8: cannot convert UTF8 mode str <%s>", utf8name.c_str());
    LOG_DPRINTLN(msg);
    MB_THROW(IOException, msg);
    return NULL;
  }

  fp = _wfopen(pwcs, wcsmode);
  delete [] pwcs;
  delete [] wcsmode;
#else
  // TO DO: correct implementation!!
  fp = fopen(utf8name.c_str(), utf8mode.c_str());
#endif

  return fp;
}

LString qlib::nativeToUTF8(const char *psnat)
{
  wchar_t *pwcsbuf;
  LString ret;

#ifdef _WIN32
  int nwclen;
  nwclen = ::MultiByteToWideChar(CP_ACP,0, psnat,-1, NULL,0);
  if (nwclen<=0) {
    MB_THROW(RuntimeException, LString::format("Invalid multibyte string: %s", psnat));
    return LString();
  }
  pwcsbuf = MB_NEW wchar_t[nwclen+1];

  nwclen = ::MultiByteToWideChar(CP_ACP,0, psnat,-1, pwcsbuf,nwclen);
  if (nwclen<=0) {
    delete [] pwcsbuf;
    MB_THROW(RuntimeException, LString::format("Invalid multibyte string: %s", psnat));
    return LString();
  }

  UCS16toUTF8(pwcsbuf, nwclen, ret);
  delete [] pwcsbuf;

#else
  // TO DO: implementation
  ret = psnat;
#endif

  return ret;
}

char *qlib::UTF8toNative(const LString &utf8)
{
  int nmblen;
  wchar_t *pwcsbuf;
  char *pmbsbuf;
  
#ifdef _WIN32
  // convert to UCS16 chars
  try {
    pwcsbuf = (wchar_t *)UTF8toUCS16(utf8);
  }
  catch (const LException &ex) {
    // conversion error: rethrow exception
    LString msg = LString::format("cannot convert UTF8 <%s> to native encoding", utf8.c_str());
    LOG_DPRINTLN(msg);
    MB_THROW(RuntimeException, msg);
    return NULL;
  }
  
  nmblen = ::WideCharToMultiByte(CP_ACP,0, pwcsbuf,-1, NULL,0, NULL,NULL);
  if (nmblen<=0) {
    delete [] pwcsbuf;
    MB_THROW(RuntimeException,
	     LString::format("Invalid multibyte string: %s", utf8.c_str()));
    return NULL;
  }
  
  pmbsbuf = MB_NEW char[nmblen];
  nmblen = ::WideCharToMultiByte(CP_ACP,0, pwcsbuf,-1, pmbsbuf,nmblen, NULL,NULL);
  delete [] pwcsbuf;
  
  if (nmblen<=0) {
    delete [] pmbsbuf;
    MB_THROW(RuntimeException, LString::format("Invalid multibyte string: %s", utf8.c_str()));
    return NULL;
  }
  
#else
  // TO DO: implementation
  pmbsbuf = MB_NEW char[utf8.length()+1];
  ::strcpy(pmbsbuf, utf8.c_str());
#endif
  
  return pmbsbuf;
}

