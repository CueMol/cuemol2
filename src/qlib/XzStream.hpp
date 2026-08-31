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
      /// LZMA_STREAM_END was seen: further reads report EOF instead of
      /// spinning on the leftover input
      bool m_bEnd = false;

    public:
      typedef InFilterImpl super_t;

      XzInFilterImpl();

      XzInFilterImpl(const impl_type &in);

      ~XzInFilterImpl() override;

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

      ~XzOutFilterImpl() override;

      int write(const char *buf, int off, int len) override;
      void write(int b) override;
      void flush() override;
      void o_close() override;

    private:
    };


  } // namespace detail

  typedef FilterInStream<detail::XzInFilterImpl> XzInStream;

  typedef FilterOutStream<detail::XzOutFilterImpl> XzOutStream;

}

#endif

#endif
