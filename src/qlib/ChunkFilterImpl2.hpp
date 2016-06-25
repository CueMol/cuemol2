//
// Stream filter for delimiting the "Multi-chunk file"
// with buffering
//

#ifndef QLIB_CHUNK_FILTER_IMPL2_HPP_INCLUDED
#define QLIB_CHUNK_FILTER_IMPL2_HPP_INCLUDED

#include "FilterStream.hpp"
#include "LTypes.hpp"

namespace qlib {

  class ChunkFilterImpl2 : public detail::InFilterImpl
  {
  public:
    typedef qlib::detail::InFilterImpl super_t;
    
  private:
    /// input buffer
    std::vector<quint8> m_buffer;

    int m_iRead;
    int m_nAvail;
    int m_nAvail2;

    /// delimiter
    LString m_mark;

    /// length of the delimiter
    int m_nMark;

    int m_iMatch;
    int m_nMatch;
    
    /// End of File reached
    bool m_bEOF;

    /// End of Chunk reached
    bool m_bEOC;
    
    bool m_bReset;

  public:
    ChunkFilterImpl2(sp<qlib::detail::InImpl> src)
      : super_t(src)
    {
      m_iRead = -1;
      m_nAvail = 0;
      m_nAvail2 = 0;
      m_iMatch = -1;
      m_nMatch = 0;

      m_bEOF = false;
      m_bEOC = false;
      m_bReset = false;
    }

    bool setBufferSize(int n)
    {
      if (m_nAvail>0 || m_iRead>=0)
	return false;
      m_buffer.resize(n);
      return true;
    }

    bool setMark(const LString &mark)
    {
      if (m_nMatch>0 || m_iMatch>=0)
	return false;
      m_mark = mark;
      m_nMark = m_mark.length();
      MB_DPRINTLN("ChunkFIlter3::setMark(%s) OK", mark.c_str());
      return true;
    }

    /// Proceed to the next chunk and reset the state.
    bool reset()
    {
      if (m_bEOF)
	return false;

      if (m_bEOC) {
	m_iRead = m_iMatch + m_nMatch;
	m_nAvail = m_nAvail2;
	m_iMatch = -1;
	m_nMatch = 0;
	m_bEOC = false;
	m_bReset = true;
	MB_DPRINTLN("CF3::reset() OK, iread=%d, navail=%d (%d)",
		    m_iRead, m_nAvail, m_iRead+m_nAvail);
	return true;
      }

      return false;
    }


    virtual bool ready() {
      //MB_DPRINTLN("CF3::ready() called, EOF=%d, EOC=%d, navail=%d", m_bEOF, m_bEOC, m_nAvail);
      if (m_nAvail>0)
	return true;

      if (m_bEOF)
	return false;
      if (m_bEOC)
	return false;

      return true;
    }
    
    virtual int read() {
      //MB_DPRINTLN("ChunkFIlter3::read()");
      quint8 rval;
      int nread = read((char *)&rval, 0, 1);
      if (nread==1)
	return rval;
      else
	return -1;
    }
    
    void copyrbuf(quint8 *prbuf, int &nrbuf, int &i)
    {
      //MB_DPRINTLN("cp RBuf start nrbuf=%d, i=%d", nrbuf, i);
      //MB_DPRINTLN(" iread=%d, navail=%d", m_iRead, m_nAvail);

      int ncopy = qlib::min(nrbuf, m_nAvail);
      memcpy(&prbuf[i], &m_buffer[m_iRead], ncopy);
      i += ncopy;
      m_iRead += ncopy;
      nrbuf -= ncopy;
      m_nAvail -= ncopy;
      /*
      while (nrbuf>0 && m_nAvail>0) {
	prbuf[i] = m_buffer[m_iRead];
	i++;
	m_iRead++;
	//m_iRead = (m_iRead+1) % m_buffer.size();
	nrbuf--;
	m_nAvail--;
      }
       */
      //MB_DPRINTLN("cp RBuf end nrbuf=%d, i=%d", nrbuf, i);
      //MB_DPRINTLN(" iread=%d, navail=%d", m_iRead, m_nAvail);
    }

    /// fill m_buffer from ist to nbufsz
    /// and then update m_iRead and m_nAvail
    int fillbuffer(int aist)
    {
      MB_DPRINTLN("CF3> fillbuf start iread=%d, navail=%d (%d)",
		  m_iRead, m_nAvail, m_iRead+m_nAvail);
      const int nbufsz = m_buffer.size();
      int ioff = aist;
      int nread = 0;
      int nres;
      for (;;) {
	nres = super_t::read((char *)&m_buffer[ioff], 0, nbufsz-ioff);
	if (nres<0)
	  break;
	ioff += nres;
	nread += nres;
	if (ioff>=nbufsz)
	  break;
      }
      
      MB_DPRINTLN("CF3> fillbuf result: nread=%d, nres=%d", nread, nres);

      if (nread>0) {
	// update iread & navail
	m_iRead = aist;
	m_nAvail = nread;
	MB_DPRINTLN("CF3> iread=%d, navail=%d (%d)", m_iRead, m_nAvail, m_iRead+m_nAvail);
	return nread;
      }
      else {
	// EOF & data not available
	m_iRead = -1;
	m_nAvail = 0;
	m_bEOF = true;
	MB_DPRINTLN("CF3> iread=%d, navail=%d (%d)", m_iRead, m_nAvail, m_iRead+m_nAvail);
	return -1;
      }
    }

    /// check delimiter in m_buffer, and then update m_iMatch & m_nMatch
    void checkdelim(int ioff, int anbufsz)
    {
      MB_DPRINTLN("CF3> checkdelim(ioff=%d, bufsz=%d)", ioff, anbufsz);
      if (m_iMatch>=0 && m_nMatch==m_nMark) {
	// delimiter has been found
	return;
      }

      int nbufsz = ioff + anbufsz;
      int i;
      int jst = ioff;
      if (m_iMatch>=0 && m_nMatch<m_nMark) {
	// partially matched (but not found)
	int ist = m_iMatch + m_nMatch;
	for (i=m_nMatch; ist<nbufsz && i<m_nMark; ist++, i++) {
	  if (m_buffer[ist]!=m_mark[i]) {
	    break;
	  }
	}
	if (ist==nbufsz) {
	  // partial match
	  m_nMatch = i;
	  return;
	}
	else if (i==m_nMark) {
	  // full match
	  m_nMatch = m_nMark;
	  return;
	}
	jst = m_iMatch + 1;
	// no match
	m_nMatch = 0;
	m_iMatch = -1;
      }

      // no match (nmatch==0)
      for (;;jst++) {
	int ib = jst;
	int i;
	for (i=0; ib<nbufsz && i<m_nMark; ib++, i++) {
	  if (m_buffer[ib]!=m_mark[i]) {
	    break;
	  }
	}
        if (ib==nbufsz) {
          if (i>0) {
            // partial match
            m_nMatch = i;
            m_iMatch = jst;
            MB_DPRINTLN("CF3> delim partmatch imatch=%d, nmatch=%d (%d)",
                        m_iMatch, m_nMatch, m_iMatch+m_nMatch);
            return;
          }
          else {
            // no match
            break;
          }
	}
	else if (i==m_nMark) {
	  // full match
	  m_nMatch = m_nMark;
	  m_iMatch = jst;
	  MB_DPRINTLN("CF3> delim mached(%d, %d) (%d)",
		      m_iMatch, m_nMatch, m_iMatch+m_nMatch);
	  return;
	}
      }

      // no match
      m_nMatch = 0;
      m_iMatch = -1;
      return;
    }

    void shiftbuf(int ifrom, int nfrom, int ito)
    {
      int i;
      for (i=0; i<nfrom; ++i)
	m_buffer[ito+i] = m_buffer[ifrom+i];
    }

    virtual int read(char *abuf, int aoff, int alen)
    {
      //MB_DPRINTLN("ChunkFIlter3::read(%p, %d, %d)", abuf, aoff, alen);

      quint8 *pretbuf = (quint8 *) &abuf[aoff];
      int nretbuf = alen;
      int i=0;

      for (;;) {

	if (m_iMatch>=0 && m_nMatch==m_nMark) {
	  // delimiter has been found
	  if (m_iRead>=0 && m_nAvail>0) {
	    // copy to retbuf
	    copyrbuf(pretbuf, nretbuf, i);
	    
	    if (nretbuf==0) {
	      // retbuf is fully filled
	      //MB_DPRINTLN("CF3::read()OK res=%d", i);
	      return i;
	    }
	    // else navail==0
	  }
	  // Here, navail==0

	  // cannot fill the m_buffer (End of Chunk)
	  m_bEOC = true;
	  MB_DPRINTLN("CF3::read()OK EOC mached, res=%d", i);
	  return i;
	}
	else if (m_iMatch>=0 && m_nMatch<m_nMark) {
	  // partially matched (but not found)
	  if (m_iRead>=0 && m_nAvail>0) {
	    // copy to retbuf
	    copyrbuf(pretbuf, nretbuf, i);
	    
	    if (nretbuf==0) {
	      // retbuf is fully filled
	      //MB_DPRINTLN("CF3::read()OK res=%d", i);
	      return i;
	    }
	    // else navail==0
	  }
	  // Here, navail==0

	  // shift the partial match to the head of the buffer
	  if (m_iMatch>0)
	    shiftbuf(m_iMatch, m_nMatch, 0);
	  m_iMatch = 0;
	  int nr = fillbuffer(m_nMatch);
	  if (nr<0) {
            if (i==0) {
              // EOF (or error)
              MB_DPRINTLN("CF3::read() ERR; delim partially mached, but EOF reached");
              return -1;
            }
            else {
              return i;
            }
	  }
	  // check m_buffer from 0 to nmatch+nr again...
	  m_iRead = 0;
	  m_nAvail = m_nMatch + nr;
	}
	else {
	  // no match (m_iMatch<0)
	  if (!m_bReset) {
	    if (m_iRead>=0 && m_nAvail>0) {
	      // copy to retbuf
	      copyrbuf(pretbuf, nretbuf, i);
	      
	      if (nretbuf==0) {
		// retbuf is fully filled
		//MB_DPRINTLN("CF3::read()OK res=%d", i);
		return i;
	      }
	      // else navail==0
	    }
	    // Here, navail==0
	    // fill m_buffer from the beginning (iread=0)
	    int nr = fillbuffer(0);
	    if (nr<0 && m_nAvail==0) {
              if (i==0) {
                // EOF (or error)
                MB_DPRINTLN("CF3::read() ERR; delim not mached, but EOF reached");
                return -1;
              }
              else
                return i;
	    }
	  }
	  else {
	    MB_DPRINTLN("CF3> reset flag cleared, iread=%d, navail=%d (%d)",
			m_iRead, m_nAvail, m_iRead+m_nAvail);
	    m_bReset = false;
	  }
	}

	// check the delimiter
	checkdelim(m_iRead, m_nAvail);

	// update navail (& navail2)
	if (m_iMatch>=0 && m_nMatch==m_nMark) {
	  // delimiter has been found
	  m_nAvail2 = (m_nAvail+m_iRead) - (m_iMatch+m_nMatch);
	  // m_iRead = 0;
	  m_nAvail = m_iMatch - m_iRead;
	}
	else if (m_iMatch>=0 && m_nMatch<m_nMark) {
	  // partially matched (but not found)
	  m_nAvail = m_iMatch - m_iRead;
	}
	// else not found (imatch==-1)
      }

      MB_DPRINTLN("CF3::read() ERR ???");
      return -1;
    }

    int readStartMk(char *abuf, int alen)
    {
      MB_DPRINTLN("CF3.readStartMk> called iread=%d, navail=%d (%d)",
		  m_iRead, m_nAvail, m_iRead+m_nAvail);

      quint8 *pretbuf = (quint8 *) &abuf[0];
      int nretbuf = alen;
      int i=0;

      for (;;) {

	if (m_iRead>=0 && m_nAvail>0) {
	  // copy to retbuf
	  copyrbuf(pretbuf, nretbuf, i);
	  
	  if (nretbuf==0) {
	    // retbuf is fully filled
	    MB_DPRINTLN("CF3.readStartMk> OK iread=%d, navail=%d (%d)",
			m_iRead, m_nAvail, m_iRead+m_nAvail);
	    MB_DPRINTLN("   res=%d", i);
	    return i;
	  }
	  // else navail==0
	}

	// fill m_buffer from the beginning (iread=0)
	int nr = fillbuffer(0);
	if (nr<0 && m_nAvail==0) {
	  // EOF (or error)
	  MB_DPRINTLN("CF3::readStartMk() EO'F' reached, res=-1, bEOF=%d", m_bEOF);
	  return -1;
	}

      }

      MB_DPRINTLN("CF3::read() ERR ???");
      return -1;
    }
    
    virtual int skip(int len) {
      MB_THROW(FileFormatException, "skip() not supported");
      return super_t::skip(len);
    }
    
  };

}

#endif

