// -*-Mode: C++;-*-
//
// Gzip input/output streams
//

#include <common.h>

#include "GzipStream.hpp"
#include "LString.hpp"
#include "LExceptions.hpp"

#include <zlib/zlib.h>

using namespace qlib;
using namespace qlib::detail;

namespace {
  int myreadfn(void *pdata, void *buf, unsigned int count)
  {
    // MB_DPRINTLN("GzipInFilterImpl myreadfn: called");
    GzipInFilterImpl *pthis = static_cast<GzipInFilterImpl *>(pdata);
    return pthis->readImpl((char *)buf, count);
  }
}

int GzipInFilterImpl::readImpl(char *buf, int len)
{
  // MB_DPRINTLN("GzipInFilterImpl.readImpl: called");

  int res = getImpl()->read(buf, 0, len);
  if (res<0) return 0;
  return res;
}

////

GzipInFilterImpl::GzipInFilterImpl()
  : super_t(), m_pdata(NULL)
{
}

GzipInFilterImpl::GzipInFilterImpl(const impl_type &in)
  : super_t(in)
{
  m_pdata = gzfnopen(myreadfn, this, "r");
  // MB_DPRINTLN("GzipInFilterImpl gzfnopen: %p", m_pdata);
}

GzipInFilterImpl::~GzipInFilterImpl()
{
  // MB_DPRINTLN("~GzipInFilterImpl gzfnopen: %p", m_pdata);
  if (m_pdata!=NULL)
    gzclose((gzFile)m_pdata);
  m_pdata = NULL;
}

/// Check if input is available
bool GzipInFilterImpl::ready()
{
  // MB_DPRINTLN("~GzipInFilterImpl ready: %p", m_pdata);

  if (m_pdata==NULL) return false;
  int ch = gzeof((gzFile)m_pdata);
  if (ch!=0) return false;
  return true;
}

/// read one byte
int GzipInFilterImpl::read()
{
  // MB_DPRINTLN("~GzipInFilterImpl read: %p", m_pdata);

  if (m_pdata==NULL) return -1;
  int ch = gzgetc((gzFile)m_pdata);
  if (ch==EOF)
    return -1;
  return ch;
}

/// read into mem block
int GzipInFilterImpl::read(char *buf, int off, int len)
{
  if (m_pdata==NULL) return -1;
  int res = gzread((gzFile)m_pdata, &buf[off], len);

  // MB_DPRINTLN("~GzipInFilterImpl read(%s,%d,%d)=%d", buf, off, len, res);
  return res;
}

/// close the stream
void GzipInFilterImpl::i_close()
{
  if (m_pdata!=NULL)
    gzclose((gzFile)m_pdata);
  m_pdata = NULL;
}

/// Try to skip n bytes.
/// @return the actual number of bytes skipped
int GzipInFilterImpl::skip(int n)
{
  if (n<0) {
    MB_THROW(qlib::IllegalArgumentException, "GzipOut error");
    return 0;
  }

  char sbuf[256];
  // int nsteps = n / sizeof (sbuf);
  int ib = n;
  while (ib>0) {
    int nread = sizeof (sbuf);
    if (ib<nread) nread = ib;
    int res = gzread((gzFile)m_pdata, sbuf, nread);
    if (res<=0)
      break;
    ib -= res;
  }
  
  MB_DPRINTLN("gzread> skipped %d bytes", n);

  return n;
}

//////////////////////////////////////////////////////////////////////

namespace {
  int mywritefn(void *pdata, void *buf, unsigned int count)
  {
    GzipOutFilterImpl *pthis = static_cast<GzipOutFilterImpl *>(pdata);
    return pthis->writeImpl((char *)buf, count);
  }
}

int GzipOutFilterImpl::writeImpl(char *buf, int len)
{
  int res = getImpl()->write(buf, 0, len);
  if (res<0) return 0;
  return res;
}

//////

GzipOutFilterImpl::GzipOutFilterImpl()
  : super_t(), m_pdata(NULL)
{
}

GzipOutFilterImpl::GzipOutFilterImpl(const impl_type &out)
  : super_t(out)
{
  m_pdata = gzfnopen(mywritefn, this, "w");
}

GzipOutFilterImpl::~GzipOutFilterImpl()
{
  if (m_pdata!=NULL) {
    gzflush((gzFile)m_pdata, Z_FINISH);
    gzclose((gzFile)m_pdata);
  }
  m_pdata = NULL;
}

int GzipOutFilterImpl::write(const char *buf, int off, int len)
{
  if (m_pdata==NULL) return -1;
  return gzwrite((gzFile)m_pdata, &buf[off], len);
}

void GzipOutFilterImpl::write(int b)
{
  if (m_pdata==NULL) {
    MB_THROW(qlib::IOException, "GzipOut error");
    return;
  }
  gzputc((gzFile)m_pdata, b);
}

void GzipOutFilterImpl::flush()
{
  if (m_pdata!=NULL) {
    gzflush((gzFile)m_pdata, Z_FINISH);
  }

  //MB_THROW(qlib::IOException, "GzipOut error");
  //return;
}

void GzipOutFilterImpl::o_close()
{
  if (m_pdata!=NULL) {
    gzflush((gzFile)m_pdata, Z_FINISH);
    gzclose((gzFile)m_pdata);
  }
  m_pdata = NULL;
}


