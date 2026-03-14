// -*-Mode: C++;-*-
//
//  Pipe stream
//

#include <common.h>
#include "PipeStream.hpp"

using namespace qlib;

/** check if input is available. */
bool PipeStreamImpl::ready()
{
  std::lock_guard<std::mutex> lk(m_mu);
  if (m_data.size()>0)
    return true;
  // data buffer is empty
  if (m_feof)
    return false; // channel was closed

  // still connected
  return true;
}

/** read one byte */
int PipeStreamImpl::read()
{
  std::unique_lock<std::mutex> lk(m_mu);

  m_cond.wait(lk, [this]{ return m_feof || !m_data.empty(); });

  if (m_feof && m_data.empty())
    return -1;

  int rval = m_data.back();
  m_data.pop_back();

  MB_DPRINTLN("thread read 1 ok");
  return rval;
}

/** read into mem block */
int PipeStreamImpl::read(char *buf, int off, int len)
{
  std::unique_lock<std::mutex> lk(m_mu);

  m_cond.wait(lk, [this]{ return m_feof || !m_data.empty(); });

  if (m_feof && m_data.empty())
    return -1;

  int i;
  for (i=0; i<len; ++i) {
    if (m_data.empty())
      break;
    buf[off+i] = m_data.back();
    m_data.pop_back();
  }

  MB_DPRINTLN("thread read (%d) ok", i);
  return i;
}

/**
   Try to skip n bytes.
   @return the actual number of bytes skipped
*/
int PipeStreamImpl::skip(int len)
{
  std::unique_lock<std::mutex> lk(m_mu);

  m_cond.wait(lk, [this]{ return m_feof || !m_data.empty(); });

  if (m_feof && m_data.empty())
    return -1;

  int i;
  for (i=0; i<len; ++i) {
    if (m_data.empty())
      return i;
    m_data.pop_back();  // inline pop to avoid re-acquiring m_mu via read()
  }

  return i;
}

/** close the stream */
void PipeStreamImpl::i_close()
{
}

/** get source URI of this stream */
LString PipeStreamImpl::getSrcURI() const
{
  return LString();
}

////////////////////

/** write out mem block */
int PipeStreamImpl::write(const char *buf, int off, int len)
{
  std::lock_guard<std::mutex> lk(m_mu);

  for (int i=0; i<len; ++i) {
    m_data.push_front(buf[i+off]);
  }

  m_cond.notify_all();
  return len;
}

/** write one byte */
void PipeStreamImpl::write(int b)
{
  std::lock_guard<std::mutex> lk(m_mu);
  m_data.push_front((char)b);
  m_cond.notify_all();
}

/** flush output stream */
void PipeStreamImpl::flush()
{
}

/** close the stream */
void PipeStreamImpl::o_close()
{
  std::lock_guard<std::mutex> lk(m_mu);
  m_feof = true;
  m_cond.notify_all();
}

/** get destination URI of this stream */
LString PipeStreamImpl::getDestURI() const
{
  return LString();
}


