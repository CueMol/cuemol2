// -*-Mode: C++;-*-
//
// String input/output streams
//
// $Id: StringStream.cpp,v 1.1 2008/01/02 13:40:16 rishitani Exp $

#include <common.h>

#include "StringStream.hpp"

#include "LString.hpp"
#include "LByteArray.hpp"

using namespace qlib;
using namespace qlib::detail;

StrInStream::StrInStream(const LString &in)
  : m_pimpl(MB_NEW char_impl((const qbyte *)in.c_str(), in.length()))
{
}

StrInStream::StrInStream(const char *in)
  : m_pimpl(MB_NEW char_impl((const qbyte *)in, LChar::length(in)))
{
}

StrInStream::StrInStream(const char *in, int nlen)
  : m_pimpl(MB_NEW char_impl((const qbyte *)in, nlen))
{
}

StrInStream::StrInStream(const LScrSp<LByteArray> pBuf)
  : m_pimpl( MB_NEW char_impl(pBuf->data(), pBuf->size()) )
{
}

StrInStream::~StrInStream() 
{
}

/** copy ctor */
StrInStream::StrInStream(const StrInStream &r) :m_pimpl(r.m_pimpl)
{
}

/** copy operator */
const StrInStream &StrInStream::operator=(const StrInStream &arg)
{
  if(&arg!=this){
    m_pimpl = arg.m_pimpl;
  }
  return *this;
}

bool StrInStream::ready() {
  return m_pimpl->ready();
}

int StrInStream::read() {
  return m_pimpl->read();
}

int StrInStream::read(char *buf, int off, int len) {
  return m_pimpl->read(buf, off, len);
}

void StrInStream::close() {
  m_pimpl->i_close();
}

/** get implementation */
StrInStream::impl_type StrInStream::getImpl() const
{
  return m_pimpl;
}

////////////////////////////////////////////////////////////////

StrOutStream::~StrOutStream() {
}
    
//////////////////////////////////////////////////////

int StrOutStream::write(const char *buf, int off, int len)
{
  return m_pimpl->write(buf, off, len);
}
    
void StrOutStream::write(int b)
{
  return m_pimpl->write(b);
}

void StrOutStream::flush()
{
  m_pimpl->flush();
}

void StrOutStream::close()
{
  m_pimpl->o_close();
}

/** get implementation */
StrOutStream::impl_type StrOutStream::getImpl() const
{
  return m_pimpl;
}

LString StrOutStream::getString() const
{
  const ArrayOutImpl::data_type *pdat = m_pimpl->getData();
  int n = pdat->size();

  ArrayOutImpl::data_type::const_iterator iter = pdat->begin();
  ArrayOutImpl::data_type::const_iterator iend = pdat->end();

  LString ret('\0', n);
  int i;
  for ( i=0; iter!=iend; ++iter, ++i)
    ret[i] = char(*iter);
  return ret;
}

char *StrOutStream::getData(int &nsize) const
{
  const ArrayOutImpl::data_type *pdat = m_pimpl->getData();
  nsize = pdat->size();
  if (nsize<=0) return NULL;
  ArrayOutImpl::data_type::const_iterator iter = pdat->begin();
  ArrayOutImpl::data_type::const_iterator iend = pdat->end();

  char *ret = MB_NEW char[nsize];
  int i;
  for ( i=0; iter!=iend; ++iter, ++i)
    ret[i] = char(*iter);

  return ret;
}

LByteArrayPtr StrOutStream::getByteArray() const
{
  const ArrayOutImpl::data_type *pdat = m_pimpl->getData();
  const int nsize = pdat->size();
  if (nsize<=0) return LByteArrayPtr();

  ArrayOutImpl::data_type::const_iterator iter = pdat->begin();
  ArrayOutImpl::data_type::const_iterator iend = pdat->end();

  LByteArray *pAry = new LByteArray(nsize);
  qbyte *pbuf = const_cast<qbyte *>(pAry->data());
  int i;
  for ( i=0; iter!=iend; ++iter, ++i)
    pbuf[i] = *iter;

  return LByteArrayPtr(pAry);
}

