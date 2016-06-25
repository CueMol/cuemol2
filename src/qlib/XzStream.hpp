// -*-Mode: C++;-*-
//
// XZ filter stream
//

#ifndef XZ_FILTER_STREAM_HPP__
#define XZ_FILTER_STREAM_HPP__

#include "FilterStream.hpp"
#include "LTypes.hpp"

namespace qlib {

  namespace detail {

    /// Input filter class with xz compression (implementation)
    class QLIB_API XzInFilterImpl : public InFilterImpl
    {
    private:
      void *m_pdata;

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
      void *m_pdata;

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
      static const size_t BUFSZ = 1024;
      int writeImpl(char *buf, int len);
      void init();
      // FILE *m_fp;
    };

  } // namespace detail

  typedef FilterInStream<detail::XzInFilterImpl> XzInStream;

  typedef FilterOutStream<detail::XzOutFilterImpl> XzOutStream;

}


#endif
