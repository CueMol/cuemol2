// -*-Mode: C++;-*-
//
//  Pipe stream
//

#ifndef QLIB_PIPE_STREAM_HPP
#define QLIB_PIPE_STREAM_HPP

#include "qlib.hpp"
#include "LStream.hpp"
#include <mutex>
#include <condition_variable>

namespace qlib {

  class QLIB_API PipeStreamImpl : public qlib::detail::IOImpl
  {
  private:
    std::deque<char> m_data;
    bool m_feof;

    std::mutex m_mu;
    std::condition_variable m_cond;

  public:
    PipeStreamImpl() : m_feof(false) {}

    /** check if input is available. */
    bool ready() override;
    
    /** read one byte */
    int read() override;
    
    /** read into mem block */
    int read(char *buf, int off, int len) override;
    
    /**
       Try to skip n bytes.
       @return the actual number of bytes skipped
    */
    int skip(int n) override;
    
    /** close the stream */
    void i_close() override;
    
    /** get source URI of this stream */
    LString getSrcURI() const override;

    ////////////////////
    
    /** write out mem block */
    int write(const char *buf, int off, int len) override;
    
    /** write one byte */
    void write(int b) override;
    
    /** flush output stream */
    void flush() override;
    
    /** close the stream */
    void o_close() override;
    
    /** get destination URI of this stream */
    LString getDestURI() const override;
    
  };

  class PipeInStream : public qlib::InStreamAdaptor
  {
  private:
    qlib::sp<PipeStreamImpl> m_pimpl;
    
  public:
    void setImpl(qlib::sp<PipeStreamImpl> pimpl) {
      m_pimpl = pimpl;
    }
    
    qlib::InStream::impl_type getImpl() const override {
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
    
    qlib::OutStream::impl_type getImpl() const override {
      return m_pimpl;
    }
  };

}

#endif
