// -*-Mode: C++;-*-
//
// String.cc
//   LString class LString
//
// $Id: LString.cpp,v 1.6 2011/04/17 10:56:39 rishitani Exp $

#include <common.h>

#include "LString.hpp"
#include "LChar.hpp"

using namespace qlib;

// hash value generator
int LString::hash() const
{
  MB_ASSERT(false);
  return -1;
}

int LString::replace(char c, char to)
{
  int cnt=0, i=0, n=length();

  for (; i<n; ++i) {
    if (m_data[i]==c) {
      m_data[i] = to;
      ++ cnt;
    }
  }

  return cnt;
}

int LString::replace(const LString &c, const LString &to)
{
  int i = 0, cnt=0;
  int nlen = c.length();
  while ( (i = m_data.find(c, i)) != std::string::npos ) {
    m_data.replace(i, nlen, to);
    ++cnt;
  }
  return cnt;
}

bool LString::toInt(int *retval) const
{
  MB_ASSERT(retval!=NULL);

  char *sptr;
  const char *cstr = m_data.c_str();
  *retval = ::strtol(cstr, &sptr, 0);
  if(sptr==cstr) return false;

  return true;
}

bool LString::toDouble(double *retval) const
{
  MB_ASSERT(retval!=NULL);

  if (m_data.empty())
    return false;

  std::istringstream iss(m_data);
  iss.imbue(std::locale::classic());

  iss >> *retval;
  if (iss.eof())
    return true;
  else
    return false;

  // char *sptr;
  // const char *cstr = m_data.c_str();
  // *retval = ::strtod(cstr, &sptr);
  // if(sptr==cstr) return false;
  // return true;
}

LString LString::trim(const char *ws /*= " \t"*/) const
{
  // remove leading WS
  int nf = (int)  m_data.find_first_not_of(ws);
  if (nf<0) return LString();

  // remove trailing WS
  int nl = (int) m_data.find_last_not_of(ws);
  if (nl<0) return LString(); // should not be happen!!

  return m_data.substr(nf, nl-nf+1);
}

LString LString::chomp(const char *ws /*= "\r\n"*/) const
{
  // remove trailing WS
  int nl = (int) m_data.find_last_not_of(ws);
  if (nl<0) return LString();

  return m_data.substr(0, nl+1);
}

int LString::split(char c, std::list<LString> &ls) const
{
  int cnt = 0, off = 0, next;

  for ( ;; ) {
    
    next = m_data.find_first_of(c, off);
    if (next==(int)std::string::npos) 
      break;
    
    if (next-off>0) {
      std::string elem = m_data.substr(off, next-off);
      ls.push_back(LString(elem));
      ++ cnt;
    }
    
    // off = next + c.length();
    off = next + 1;
  }

  {
    std::string elem = m_data.substr(off);
    ls.push_back(LString(elem));
    const char *xx = elem.c_str();
    ++ cnt;
  }

  return cnt;
}

int LString::split_of(const LString &arg, std::list<LString> &ls) const
{
  int cnt = 0;
  std::string::size_type off = 0, next;

  for ( ;; ) {
    
    next = m_data.find_first_of(arg, off);
    if (next==std::string::npos) 
      break;
    
    if (next-off>0) {
      std::string elem = m_data.substr(off, next-off);
      ls.push_back(LString(elem));
      ++ cnt;
    }
    
    off = next + 1; //arg.length();
  }

  if (off<m_data.length()) {
    std::string elem = m_data.substr(off);
    ls.push_back(LString(elem));
    ++ cnt;
  }

  return cnt;
}

//static
QLIB_API LString LString::join(const char *sep, const std::list<LString> &ls)
{
  // there is no elements in "ls"
  if (ls.size()<=0) return "";

  // there is only one elements in "ls"
  if (ls.size()==1) {
    return ls.front();
  }
  
  // estimate the result's length
  int nlen = 0;
  int nsep = LChar::length(sep);

  std::list<LString>::const_iterator iter = ls.begin();
  for (; iter!=ls.end(); ++iter) {
    const LString &elem = *iter;
    if (nlen==0)
      nlen += elem.length();
    else
      nlen += (elem.length() + nsep);
  }

  // construct the joined string
  std::string retval;
  retval.reserve(nlen);

  iter = ls.begin();
  for (; iter!=ls.end(); ++iter) {
    const LString &elem = *iter;

    if (iter==ls.begin()) {
      retval += elem;
    }
    else {
      retval += sep;
      retval += elem;
    }
  }

  return LString(retval);
}

//static
LString LString::join(const char *sep, const LString *ps, int nsize)
{
  if (nsize<=0) return "";

  LString ret = ps[0];
  if (nsize<=1) return ret;

  LString delim(sep);
  int pos = 0;
  ++pos;
  for (; pos<nsize; ++pos)
    ret = ret + delim + (ps[pos]);

  return ret;
}

void LString::format2(const char *fmt, ...)
{
  const int bufsize = 1024;
  char sbuf[bufsize];
  va_list marker;

  va_start(marker, fmt);

#ifdef WIN32
//  _vsnprintf_s(sbuf, sizeof sbuf, _TRUNCATE, fmt, marker);
  _vsnprintf(sbuf, sizeof sbuf, fmt, marker);
#else

# ifdef HAVE_VSNPRINTF
  vsnprintf(sbuf, sizeof sbuf, fmt, marker);
# else
  vsprintf(sbuf, fmt, marker);
# endif

#endif

  va_end(marker);

  sbuf[bufsize-1] = '\0';
  m_data = sbuf;
}

//static
QLIB_API LString LString::format(const char *fmt, ...)
{
  const int bufsize = 1024;
  char sbuf[bufsize];
  va_list marker;

  va_start(marker, fmt);

#ifdef WIN32
  _vsnprintf(sbuf, sizeof sbuf, fmt, marker);
#else

# ifdef HAVE_VSNPRINTF
  vsnprintf(sbuf, sizeof sbuf, fmt, marker);
# else
  vsprintf(sbuf, fmt, marker);
# endif

#endif

  va_end(marker);

  sbuf[bufsize-1] = '\0';
  return LString(sbuf);
}

// for debugging
void LString::dump()
{
  // MB_DPRINT("LString (%s)\n", c_str());
}

LString LString::escapeQuots() const
{
  LString rval;
  const LString &src = *this;

  int i;
  for (i=0; i<src.length(); ++i) {
    char c = src[i];
    switch (c) {
    case '\\':
      rval += "\\\\";
      break;

    case '\"':
      rval += "\\\"";
      break;

    case '\n':
      rval += "\\n";
      break;

    case '\r':
      rval += "\\r";
      break;

    case '\t':
      rval += "\\t";
      break;

    default:
      rval += c;
      break;
    }
  }

  return rval;
}

//static
QLIB_API LString LString::fromReal(LReal value, int nMaxDigit /*=6*/)
{
  char sbuf[256];
#ifdef WIN32
  ::_snprintf(sbuf, sizeof sbuf, "%%.%df", nMaxDigit);
#else
  ::snprintf(sbuf, sizeof sbuf, "%%.%df", nMaxDigit);
#endif
  
  LString rval = LString::format(sbuf, value);

  // Remove trailing 0 after the decimal point
  char c;
  int nlen = rval.length();
  int i = nlen-1;
  for (; i>=0; --i) {
    c = rval.getAt(i);
    if (c!='0')
      break;
  }

  if (c=='.')
    --i;

  if (i==nlen-1)
    return rval; // no trailing zeros
  
  rval = rval.substr(0, i+1);
  return rval;
}

