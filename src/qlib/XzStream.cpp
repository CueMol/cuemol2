// -*-Mode: C++;-*-
//
// XZ input/output streams
//

#include <common.h>

#include "XzStream.hpp"
#include "LString.hpp"
#include "LExceptions.hpp"

#include <lzma.h>

using namespace qlib;
using namespace qlib::detail;

XzInFilterImpl::XzInFilterImpl()
  : super_t(), m_pdata(NULL)
{
  init();
}

XzInFilterImpl::XzInFilterImpl(const impl_type &in)
  : super_t(in), m_pdata(NULL)
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
  return false;
}

/// read into mem block
int XzInFilterImpl::read(char *buf, int off, int len)
{
  MB_DPRINTLN("XZIn.read> called");
  /*  
  quint8 *pretbuf = (quint8 *) &abuf[off];
  int nretbuf = alen;
  int i=0;

  char input_buf[64*1024];

  do {
	
    // input from lower level
    int nres = super_t::read(input_buf, 0, sizeof(input_buf));

    if (nres<0) {
      action = LZMA_FINISH;
    }

    stream.avail_in = nres;
    stream.next_in = (uint8_t*) input_buf;

    do {
      stream.next_out = pretbuf;
      stream.avail_out = nretbuf;
      ret = lzma_code(&stream, action);
      if ((ret != LZMA_OK) && (ret != LZMA_STREAM_END)) {
	LString msg = LString::format("lzma_code error %d", ret);
	MB_THROW(FileFormatException, msg);
	return -1;
      }

      //fwrite(sbuf, sizeof(sbuf) - stream.avail_out, 1, stdout);

      int nread = nretbuf - stream.avail_out;
      i += nread;
      pretbuf += nread;
      nretbuf -= nread;

      if (nretbuf==0) {
	return i;
      }
      //} while ((stream.avail_out == 0) && (ret != LZMA_STREAM_END));
    } while (stream.avail_out == 0);

  } while (action != LZMA_FINISH);

  lzma_end(&stream);
  */
  return 0;
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
  : super_t(), m_pdata(NULL)
{
  init();
}

XzOutFilterImpl::XzOutFilterImpl(const impl_type &out)
  : super_t(out)
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

int XzOutFilterImpl::write(const char *buf, int off, int len)
{
  //std::vector buffer<uint8_t>(len);
  uint8_t buffer[BUFSZ];
  int nwr = 0;
  
  lzma_stream *pstream = (lzma_stream *) m_pdata;

  lzma_action action = LZMA_RUN;
  lzma_ret ret = LZMA_OK;

  pstream->next_in = (const uint8_t *) &buf[off];
  pstream->avail_in = len;

  for (;;) {
    pstream->next_out = &buffer[0];
    pstream->avail_out = BUFSZ;
    ret = lzma_code(pstream, action);

    if ((ret != LZMA_OK) && (ret != LZMA_STREAM_END)) {
      MB_THROW(IOException, "cannto lzma encoder");
      return -1;
    }
    
    const int nenc = BUFSZ - pstream->avail_out;
    if (nenc>0) {
      int nres = super_t::write((const char *)&buffer[0], 0, nenc);
      //fwrite((const char *)&buffer[0], BUFSZ - pstream->avail_out, sizeof(char), m_fp);

      if (nres<0) {
        MB_THROW(IOException, "cannot write");
        return -1;
      }

    }

    if (pstream->avail_out > 0)
      break;
  }

  nwr += len;

  if (pstream->avail_in != 0) {
    MB_THROW(IOException, "cannto lzma encoder");
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
}

void XzOutFilterImpl::o_close()
{
  if (m_pdata!=NULL) {
    lzma_stream *pstream = (lzma_stream *) m_pdata;

    uint8_t inbuffer[1];
    uint8_t buffer[BUFSZ];
    for (;;) {
      pstream->next_in = inbuffer;
      pstream->avail_in = 0;
      pstream->next_out = &buffer[0];
      pstream->avail_out = BUFSZ;
      lzma_ret ret = lzma_code(pstream, LZMA_FINISH);
      int nenc = BUFSZ - pstream->avail_out;
      if (nenc>0) {
        int nres = super_t::write((const char *)&buffer[0], 0, nenc);
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

