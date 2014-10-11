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

      virtual ~GzipInFilterImpl();

      /// Check if input is available
      virtual bool ready();

      /// read one byte
      virtual int read();
      
      /// read into mem block
      virtual int read(char *buf, int off, int len);

      /// close the stream
      virtual void i_close();

      /// Try to skip n bytes.
      /// @return the actual number of bytes skipped
      virtual int skip(int n);
      
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

      virtual ~GzipOutFilterImpl();

      virtual int write(const char *buf, int off, int len);
      virtual void write(int b);
      virtual void flush();
      virtual void o_close();

      int writeImpl(char *buf, int len);
    };

  } // namespace detail

  typedef FilterInStream<detail::GzipInFilterImpl> GzipInStream;

  typedef FilterOutStream<detail::GzipOutFilterImpl> GzipOutStream;

}


#endif
