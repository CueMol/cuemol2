// -*-Mode: C++;-*-
//
//  Pipe stream
//

#ifndef QLIB_PIPE_STREAM_HPP
#define QLIB_PIPE_STREAM_HPP

#include "qlib.hpp"
#include "LStream.hpp"
#include <boost/thread/condition.hpp>

namespace qlib {

  class QLIB_API PipeStreamImpl : public qlib::detail::IOImpl
  {
  private:
    std::deque<char> m_data;
    bool m_feof;

    boost::mutex m_mu;
    boost::condition m_cond;

  public:
    PipeStreamImpl() : m_feof(false) {}

    /** check if input is available. */
    virtual bool ready();
    
    /** read one byte */
    virtual int read();
    
    /** read into mem block */
    virtual int read(char *buf, int off, int len);
    
    /**
       Try to skip n bytes.
       @return the actual number of bytes skipped
    */
    virtual int skip(int n);
    
    /** close the stream */
    virtual void i_close();
    
    /** get source URI of this stream */
    virtual LString getSrcURI() const;

    ////////////////////
    
    /** write out mem block */
    virtual int write(const char *buf, int off, int len);
    
    /** write one byte */
    virtual void write(int b);
    
    /** flush output stream */
    virtual void flush();
    
    /** close the stream */
    virtual void o_close();
    
    /** get destination URI of this stream */
    virtual LString getDestURI() const;
    
  };

  class PipeInStream : public qlib::InStreamAdaptor
  {
  private:
    qlib::sp<PipeStreamImpl> m_pimpl;
    
  public:
    void setImpl(qlib::sp<PipeStreamImpl> pimpl) {
      m_pimpl = pimpl;
    }
    
    virtual qlib::InStream::impl_type getImpl() const {
      return m_pimpl;
    }
  };

  class PipeOutStream : public qlib::OutStreamAdaptor
  {
  private:
    qlib::sp<PipeStreamImpl> m_pimpl;
    
  public:
    void setImpl(qlib::sp<PipeStreamImpl> pimpl) {
      m_pimpl = pimpl;
    }
    
    virtual qlib::OutStream::impl_type getImpl() const {
      return m_pimpl;
    }
  };

}

#endif
