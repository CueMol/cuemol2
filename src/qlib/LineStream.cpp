// -*-Mode: C++;-*-
//
// line input formatter class
//
// $Id: LineStream.cpp,v 1.1 2008/01/02 13:40:16 rishitani Exp $

#include <common.h>

#include "LineStream.hpp"
#include "LExceptions.hpp"

using namespace qlib;
using namespace qlib::detail;

bool LineInImpl::ready()
{
  if (getImpl()->ready()) return true;
  
  // underlying stream has reached EOF
  // returns ready, if there are still buffered contents.
  return m_buf.length()>0;
}


void LineInImpl::readLine(LString &r)
{
  const int bufsize = 2048;
  
  // at first, check the buffer
  while (m_buf.length()>0) {
    int pos = m_buf.indexOneOf(m_delim);
    if (pos<0) {
      // not found, we must read from the stream
      break;
    }
	  
    r.append(m_buf.substr(0, pos+1));
    // save remain
    m_buf = m_buf.substr(pos+1);
    ++ m_lineNo;
    return; // done
  }

  // read from the stream
  //while (m_pin->available()>0) {
  for (;;) {
    char sbuf[bufsize];
    int res = getImpl()->read(sbuf, 0, bufsize-1);
    if (res<=0) {
      // Reached to the EOF/EOT
      break;
      //MB_THROW(IOException, "cannot read from stream");
    }
    sbuf[res] = '\0';
    //printf("read %d:%s", res, sbuf);
    m_buf.append(sbuf);

    int pos = m_buf.indexOneOf(m_delim);
    if (pos>=0) {
      r.append(m_buf.substr(0, pos+1));
      // save remains
      m_buf = m_buf.substr(pos+1);
      ++ m_lineNo;
      return; // done
    }

    // delimitor isn't found, so we need to read more...
  }
   
  // reached to EOF, returns remaining chars
  r.append(m_buf);
  m_buf = LString();
  ++ m_lineNo;
  return;
}

