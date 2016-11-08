// -*-Mode: C++;-*-
//
// XZ input/output streams
//

#include <common.h>

#include "XzStream.hpp"
#include "LString.hpp"
#include "LExceptions.hpp"

#ifdef HAVE_LZMA_H

#include <lzma.h>

using namespace qlib;
using namespace qlib::detail;

XzInFilterImpl::XzInFilterImpl()
  : super_t(), m_pdata(NULL), m_buffer(BUFSZ)
{
  init();
}

XzInFilterImpl::XzInFilterImpl(const impl_type &in)
     : super_t(in), m_pdata(NULL), m_buffer(BUFSZ)
{
  init();
}

void XzInFilterImpl::init()
{
  lzma_stream *pstream = new lzma_stream;
  lzma_stream xx = LZMA_STREAM_INIT;
  *pstream = xx;

  lzma_ret ret = lzma_stream_decoder(pstream, 128*1024*1024, 0);
  if (ret != LZMA_OK) {
    MB_THROW(IOException, "cannto create lzma decoder");
    return;
  }

  m_pdata = pstream;
}

XzInFilterImpl::~XzInFilterImpl()
{
  i_close();
}

/// Check if input is available
bool XzInFilterImpl::ready()
{
  lzma_stream *pstream = (lzma_stream *) m_pdata;

  if (pstream->avail_in>0) {
    // still stream has non-processed input data
    return true;
  }
  else {
    return getImpl()->ready();
  }
}

/// read into mem block
int XzInFilterImpl::read(char *abuf, int off, int alen)
{
  //MB_DPRINTLN("XZIn.read> called");

  lzma_stream *pstream = (lzma_stream *) m_pdata;
  lzma_ret ret;
  
  quint8 *pretbuf = (quint8 *) &abuf[off];
  int nretbuf = alen;
  int i=0, nres=0;

  // char input_buf[BUFSZ];

  for (;;) {
    //if (m_buffer.avail()==0)
    if (pstream->avail_in==0) {
      // input from lower level
      nres = getImpl()->read((char *)&m_buffer[0], 0, BUFSZ);
      //nres = super_t::read((char *)m_buffer.wptr(), 0, m_buffer.size());
      // int nres = super_t::read(input_buf, 0, BUFSZ);
      
      if (nres<0) {
        if (i==0)
          return -1;
        else
          return i;
      }
      
      //m_buffer.fill(nres);
      //int navail = pstream->avail_in = m_buffer.avail();
      //pstream->next_in = m_buffer.rptr();
      
      pstream->avail_in = nres;
      pstream->next_in = &m_buffer[0];
    }

    for (;;) {
      pstream->next_out = pretbuf;
      pstream->avail_out = nretbuf;
      ret = lzma_code(pstream, LZMA_RUN);
      if ((ret != LZMA_OK) && (ret != LZMA_STREAM_END)) {
        LString msg = LString::format("lzma_code error %d", ret);
        MB_THROW(FileFormatException, msg);
        return -1;
      }

      // m_buffer.consume(navail-pstream->avail_in);

      int nread = nretbuf - pstream->avail_out;
      i += nread;
      pretbuf += nread;
      nretbuf -= nread;

      MB_ASSERT(nretbuf>=0);
      if (nretbuf==0) {
        return i;
      }

      if (pstream->avail_out > 0)
        break;
    }

  }

  return -1;
}

/// close the stream
void XzInFilterImpl::i_close()
{
  if (m_pdata!=NULL) {
    lzma_stream *pstream = (lzma_stream *) m_pdata;
    lzma_end(pstream);
    delete pstream;
  }
  m_pdata = NULL;
}

/// read one byte
int XzInFilterImpl::read()
{
  quint8 rval;
  int nread = read((char *)&rval, 0, 1);
  if (nread==1)
    return rval;
  else
    return -1;
}

/// Try to skip n bytes.
/// @return the actual number of bytes skipped
int XzInFilterImpl::skip(int n)
{
  if (n<0) {
    MB_THROW(qlib::IllegalArgumentException, "XzIn.skip error");
    return 0;
  }

  char sbuf[256];
  // int nsteps = n / sizeof (sbuf);
  int ib = n;
  while (ib>0) {
    int nread = sizeof (sbuf);
    if (ib<nread) nread = ib;
    int res = read(sbuf, 0, nread);
    if (res<=0)
      break;
    ib -= res;
  }
  
  MB_DPRINTLN("gzread> skipped %d bytes", n);

  return n;
}

//////////////////////////////////////////////////////////////////////

XzOutFilterImpl::XzOutFilterImpl()
     : super_t(), m_pdata(NULL), m_buffer(BUFSZ)
{
  init();
}

XzOutFilterImpl::XzOutFilterImpl(const impl_type &out)
     : super_t(out), m_pdata(NULL), m_buffer(BUFSZ)
{
  init();
}

XzOutFilterImpl::~XzOutFilterImpl()
{
  o_close();
}

//////////

void XzOutFilterImpl::init()
{
  lzma_stream *pstream = new lzma_stream;
  lzma_stream xx = LZMA_STREAM_INIT;
  *pstream = xx;

  lzma_ret ret = lzma_easy_encoder(pstream, 6, LZMA_CHECK_CRC64);
  if (ret != LZMA_OK) {
    MB_THROW(IOException, "cannto create lzma encoder");
    return;
  }

  m_pdata = pstream;
  // m_fp = fopen("d:\\xztest.xz","wb");
}

int XzOutFilterImpl::write(const char *inbuf, int off, int len)
{
  if (len == 0)
    return 0;

  int nwr = 0;
  
  lzma_stream *pstream = (lzma_stream *) m_pdata;

  lzma_action action = LZMA_RUN;
  lzma_ret ret = LZMA_OK;

  pstream->next_in = (const uint8_t *) &inbuf[off];
  pstream->avail_in = len;

  for (;;) {
    pstream->next_out = &m_buffer[0];
    pstream->avail_out = BUFSZ;
    ret = lzma_code(pstream, action);

    if ((ret != LZMA_OK) && (ret != LZMA_STREAM_END)) {
      MB_THROW(IOException, "LZMA encode error in write(buf, off, len)");
      return -1;
    }
    
    const int nenc = BUFSZ - pstream->avail_out;
    if (nenc>0) {
      int nres = getImpl()->write((const char *)&m_buffer[0], 0, nenc);
      //fwrite((const char *)&m_buffer[0], BUFSZ - pstream->avail_out, sizeof(char), m_fp);

      if (nres<0) {
        MB_THROW(IOException, "XzStream cannot write to stream");
        return -1;
      }

    }

    if (pstream->avail_out > 0)
      break;
  }

  nwr += len;

  if (pstream->avail_in != 0) {
    MB_THROW(IOException, "LZMA encoder error, avail_in!=0");
    return -1;
  }
  
/*
  if (ret != LZMA_STREAM_END) {
    MB_THROW(IOException, "failed to finish encode");
    return -1;
  }
  */
  return nwr;
}

void XzOutFilterImpl::write(int b)
{
  quint8 ub = (quint8) b;
  write((char *) &ub, 0, 1);
}

void XzOutFilterImpl::flush()
{
  getImpl()->flush();
}

void XzOutFilterImpl::o_close()
{
  if (m_pdata!=NULL) {
    lzma_stream *pstream = (lzma_stream *) m_pdata;

    uint8_t inbuffer[1];

    for (;;) {
      pstream->next_in = inbuffer;
      pstream->avail_in = 0;
      pstream->next_out = &m_buffer[0];
      pstream->avail_out = BUFSZ;
      lzma_ret ret = lzma_code(pstream, LZMA_FINISH);
      int nenc = BUFSZ - pstream->avail_out;
      if (nenc>0) {
        int nres = getImpl()->write((const char *)&m_buffer[0], 0, nenc);
        // fwrite((const char *)&buffer[0], nenc, sizeof(char), m_fp);
      }
      if (nenc<BUFSZ) {
        break;
      }
      
    }
    
    lzma_end(pstream);
    // fclose(m_fp);
    delete pstream;
  }
  m_pdata = NULL;
}

#endif
