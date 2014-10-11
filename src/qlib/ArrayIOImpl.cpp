// -*-Mode: C++;-*-
//
// Array input/output implementation
//
// $Id: ArrayIOImpl.cpp,v 1.1 2008/01/02 13:40:16 rishitani Exp $

#include <common.h>

#include "ArrayIOImpl.hpp"
#include "LExceptions.hpp"

using namespace qlib;
using namespace qlib::detail;

ArrayInImpl::ArrayInImpl(const qbyte *in, int len)
  : InImpl(), m_data(len), m_pos(0)
{
  int i=0;
  for (; i<len; i++)
    m_data[i] = in[i];
}

bool ArrayInImpl::ready()
{
  return (m_data.size() - m_pos)>0;
}

int ArrayInImpl::read()
{
  if (m_data.size() - m_pos<=0) return -1;
  ++ m_pos;
  // MB_DPRINT("%X (%c)", m_data[m_pos-1], m_data[m_pos-1]);
  return m_data[m_pos-1];
}

int ArrayInImpl::read(char *buf, int off, int len)
{
  qbyte *dist = (qbyte *) &buf[off];
	
  int av = m_data.size() - m_pos;
  int i;
	
  if (av<=0) {
    return -1;
  }
  else if (av>=len) {
    //MB_DPRINT("Array.read> ");
    for (i=0; i<len; ++i) {
      dist[i] = m_data[i+m_pos];
      //MB_DPRINT("%X (%c)", dist[i], dist[i]);
    }
    //MB_DPRINTLN("");
    m_pos += len;
    return i;
  }
  else {
    //MB_DPRINT("Array.read> ");
    for (i=0; i<av; ++i) {
      dist[i] = m_data[i+m_pos];
      //MB_DPRINT("%X (%c)", dist[i], dist[i]);
    }
    //MB_DPRINTLN("");
    m_pos += av;
    return i;
  }
}

int ArrayInImpl::skip(int len)
{
  int av = m_data.size() - m_pos;
  int i;
	
  if (av<=0) {
    // MB_THROW(EOFException, "Reached to the end of the array");
    return -1;
  }
  else if (av>=len) {
    // for (i=0; i<len; ++i)
    // dist[i] = m_data[i+m_pos];
    m_pos += len;
    return len;
  }
  else {
    // for (i=0; i<av; ++i)
    // dist[i] = m_data[i+m_pos];
    m_pos += av;
    return av;
  }
}

void ArrayInImpl::i_close()
{
}

LString ArrayInImpl::getSrcURI() const
{
  return LString();
}

////////////////////////////////////////////////////////////////

int ArrayOutImpl::write(const char  *buf, int off, int len)
{
  int i = 0;
  const qbyte *src = (const qbyte *) &buf[off];
  // MB_DPRINTLN("Array.write>");
  for (; i<len; ++i) {
    qbyte b = src[i];
    // MB_DPRINT(" %X (%c)", b, b);
    m_data.push_back(b);
  }
  // MB_DPRINTLN("");
  return i;
}
    
void ArrayOutImpl::write(int b)
{
  // MB_DPRINTLN("Array.write> %X", b);
  m_data.push_back((qbyte)b);
}
      
void ArrayOutImpl::flush() {
}
      
void ArrayOutImpl::o_close() {
}
      
LString ArrayOutImpl::getDestURI() const
{
  return LString();
}
