// -*-Mode: C++;-*-
//
// XZ filter stream
//

#ifndef XZ_FILTER_STREAM_HPP__
#define XZ_FILTER_STREAM_HPP__
#ifdef HAVE_LZMA_H

#include "FilterStream.hpp"
#include "LTypes.hpp"


namespace qlib {

  namespace detail {

    /// Input filter class with xz compression (implementation)
    class QLIB_API XzInFilterImpl : public InFilterImpl
    {
    private:
      /// LZMA data
      void *m_pdata;

      /// Input buffer size
      static const size_t BUFSZ = 1024*1024;

      /// Input buffer data
      std::vector<quint8> m_buffer;

    public:
      typedef InFilterImpl super_t;

      XzInFilterImpl();

      XzInFilterImpl(const impl_type &in);

      virtual ~XzInFilterImpl();

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
      
    private:
      int readImpl(char *buf, int len);

      void init();

    };

    //////////

    /// Output filter class with gzip compression (implementation)
    class QLIB_API XzOutFilterImpl : public OutFilterImpl
    {
    private:
      /// LZMA data
      void *m_pdata;

      /// Output buffer size
      static const size_t BUFSZ = 10*1024;

      /// Output buffer data
      std::vector<quint8> m_buffer;

      void init();

    public:
      typedef OutFilterImpl super_t;

      XzOutFilterImpl();

      XzOutFilterImpl(const impl_type &in);

      virtual ~XzOutFilterImpl();

      virtual int write(const char *buf, int off, int len);
      virtual void write(int b);
      virtual void flush();
      virtual void o_close();

    private:
    };


  } // namespace detail

  typedef FilterInStream<detail::XzInFilterImpl> XzInStream;

  typedef FilterOutStream<detail::XzOutFilterImpl> XzOutStream;

}

#endif

#endif
