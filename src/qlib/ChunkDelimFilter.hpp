//
// Stream filter for delimiting the "Multi-chunk file"
//

#ifndef QLIB_CHUNK_DELIM_FILTER_HPP_INCLUDED
#define QLIB_CHUNK_DELIM_FILTER_HPP_INCLUDED

#include <boost/circular_buffer.hpp>

namespace qlib {

class ChunkFilterImpl : public detail::InFilterImpl
{
public:
  typedef qlib::detail::InFilterImpl super_t;
  
private:
  LString m_mark;
  bool m_bReady;
  bool m_bEOF;
  int m_nCbufLen;
  int m_nMatch;
  boost::circular_buffer<unsigned char> m_cbuf;

  bool checkMatch(int ch)
  {
    if (ch==m_mark[m_nMatch]) {
      ++m_nMatch;
      if (m_nMatch>=m_nCbufLen) {
        // mark matched --> EOC
        m_bReady = false;
        return false;
      }
    }
    else {
      m_nMatch = 0;
      if (ch==m_mark[m_nMatch])
        ++m_nMatch;
    }
    return true;
  }

  bool fillOne()
  {
    int ch = super_t::read();
    if (ch<0) {
      // EOF reached --> cannot be filled
      //m_bReady = false;
      m_bEOF = true;
      return false;
    }
    if (!checkMatch(ch))
      return false;
    m_cbuf.push_back((unsigned char)ch);
    return true;
  }

  bool fillCbuf()
  {
    int nCurSize = m_cbuf.size();
    int nToFill = m_nCbufLen - nCurSize;
    MB_ASSERT(nToFill>=0);
    if (nToFill==0) return true;
    int i;
    for (i=0; i<nToFill; ++i) {
      if (!fillOne())
        return false;
    }

    return true;
  }

  int readOneImpl()
  {
    if (!m_bReady)
      return -1; // delimiter has been matched --> read fails
    
    int nCurSize = m_cbuf.size();

    if (m_bEOF) {
      // EOF has been encountered --> returns the cbuf content
      if (nCurSize>0) {
        unsigned char val = m_cbuf.front();
        m_cbuf.pop_front();
        return val;
      }
      // EOF reached and cbuf is empty
      return -1; // failed!!
    }

    if (nCurSize<m_nCbufLen) {
      if (!fillCbuf())
        return -1; // failed!!
    }

    unsigned char val = m_cbuf.front();
    m_cbuf.pop_front();

    fillOne();
    
    return val;
  }

public:
  ChunkFilterImpl(sp<qlib::detail::InImpl> src) : super_t(src), m_bReady(true), m_bEOF(false) {}

  void setMark(const LString &mark) {
    m_bReady = true;
    m_mark = mark;
    m_nCbufLen = m_mark.length();
    m_cbuf.set_capacity(m_nCbufLen);
    m_nMatch = 0;
  }

  virtual bool ready() {
    if (!m_bReady) return false;
    return super_t::ready();
  }
  
  virtual int read() {
    return readOneImpl();
  }
  
  virtual int read(char *abuf, int aoff, int alen) {
    int i;
    for (i=0; i<alen; ++i) {
      int c = readOneImpl();
      if (c<0) break;
      abuf[aoff+i] = c;
    }
    return i;
  }
  
  virtual int skip(int len) {
    MB_THROW(FileFormatException, "skip() not supported");
    return super_t::skip(len);
  }
  
};

}

#endif

