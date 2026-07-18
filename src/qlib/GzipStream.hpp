// -*-Mode: C++;-*-
//
// Gzip filter stream
//

#ifndef GZIP_FILTER_STREAM_HPP__
#define GZIP_FILTER_STREAM_HPP__

#include "FilterStream.hpp"

namespace qlib {

  /////////////////////////////////////////////////////
  // Data filtering streams (for data compression, etc.)

  namespace detail {

    /// Input filter class with gzip compression (implementation)
    class QLIB_API GzipInFilterImpl : public InFilterImpl
    {
    private:
      void *m_pdata;

    public:
      typedef InFilterImpl super_t;

      GzipInFilterImpl();

      GzipInFilterImpl(const impl_type &in);

      ~GzipInFilterImpl() override;

      /// Check if input is available
      bool ready() override;

      /// read one byte
      int read() override;
      
      /// read into mem block
      int read(char *buf, int off, int len) override;

      /// close the stream
      void i_close() override;

      /// Try to skip n bytes.
      /// @return the actual number of bytes skipped
      int skip(int n) override;
      
      int readImpl(char *buf, int len);

    };

    //////////

    /// Output filter class with gzip compression (implementation)
    class QLIB_API GzipOutFilterImpl : public OutFilterImpl
    {
    private:
      void *m_pdata;

    public:
      typedef OutFilterImpl super_t;

      GzipOutFilterImpl();

      GzipOutFilterImpl(const impl_type &in);

      ~GzipOutFilterImpl() override;

      int write(const char *buf, int off, int len) override;
      void write(int b) override;
      void flush() override;
      void o_close() override;

      int writeImpl(char *buf, int len);
    };

  } // namespace detail

  typedef FilterInStream<detail::GzipInFilterImpl> GzipInStream;

  typedef FilterOutStream<detail::GzipOutFilterImpl> GzipOutStream;

}


#endif
