// -*-Mode: C++;-*-
//
// Print out formatter class
//
// $Id: PrintStream.cpp,v 1.2 2010/01/24 15:23:45 rishitani Exp $

#include <common.h>

#include "LString.hpp"
#include "LExceptions.hpp"

#include "PrintStream.hpp"
#include "Vector4D.hpp"
#include "LChar.hpp"

using namespace qlib;

PrintStream::~PrintStream()
{
}

void PrintStream::print(bool b)
{
  print(LString::fromBool(b));
}

void PrintStream::print(char n)
{
  format("%d", n);
}

void PrintStream::print(int n)
{
  format("%d", n);
}

void PrintStream::print(double n)
{
  format("%f", n);
}

void PrintStream::print(const char *n)
{
  int len = LChar::length(n);
  int res = write(n, 0, len);
  if (res!=len)
    MB_THROW(IOException, "OutStream.write() failed.");
}

void PrintStream::print(const LString &n)
{
  int len = n.length();
  int res = write(n.c_str(), 0, len);
  if (res!=len)
    MB_THROW(IOException, LString::format("OutStream.write() failed. (%d:%d)", res, len));
}

void PrintStream::print(const Vector4D &n)
{
  format("(%f, %f, %f, %f)", n.x(), n.y(), n.z(), n.w());
}

void PrintStream::format(const char *fmt, ...)
{
  LString sbuf;
  va_list marker;

  va_start(marker, fmt);
  sbuf.vformat(fmt, marker);
  va_end(marker);

  print(sbuf);
}

void PrintStream::formatln(const char *fmt, ...)
{
  LString sbuf;
  va_list marker;

  va_start(marker, fmt);
  sbuf.vformat(fmt, marker);
  va_end(marker);

  println(sbuf);
}




#if 0
void PrintStream::printUTF8(const LString &n)
{
  printUTF8(n.c_str());
}

void PrintStream::printUTF8(const char *pstr)
{
#ifdef WIN32
  int nwclen, i;

  nwclen =
    ::MultiByteToWideChar(CP_ACP,0, pstr,-1, NULL,0);
  if (nwclen<=0) {
    MB_THROW(IOException, LString::format("Invalid multibyte string: %s", pstr));
    return;
  }
  wchar_t *pwcsbuf = MB_NEW wchar_t[nwclen+1];
  
  nwclen =
    ::MultiByteToWideChar(CP_ACP,0, pstr,-1, pwcsbuf,nwclen);
  if (nwclen<=0) {
    delete [] pwcsbuf;
    MB_THROW(IOException, LString::format("Invalid multibyte string: %s", pstr));
    return;
  }

  for (i=0; i<nwclen; ++i) {
    unsigned int c = (unsigned int) pwcsbuf[i];
    if (c==0)
      break;
    else if (c<0x7F)
      write(c);
    else if (c<0x7FF) {
      unsigned int c1 = c >> 6;
      unsigned int c2 = c & 0x3F;
      write(c1 + 0xC0);
      write(c2 + 0x80);
    }
    else {
      unsigned int c1 = c >> 12;
      unsigned int c2 = (c&0x0FFF) >> 6;
      unsigned int c3 = c & 0x3F;
      write(c1 + 0xE0);
      write(c2 + 0x80);
      write(c3 + 0x80);
    }
    // TO DO: support UCS16 surrogate character!!
  }

  delete [] pwcsbuf;

#else
  // TO DO: implementation
  print(pstr);
#endif
  /*
  int len = LChar::length(n);
  int res = write(n, 0, len);
  if (res!=len)
    MB_THROW(IOException, "OutStream.write() failed.");
   */
}
#endif

