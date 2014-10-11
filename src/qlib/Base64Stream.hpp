// -*-Mode: C++;-*-
//
// Base64 filter stream
//

#ifndef BASE64_FILTER_STREAM_HPP__
#define BASE64_FILTER_STREAM_HPP__

#include "FilterStream.hpp"
#include <boost/circular_buffer.hpp>

namespace qlib {

  /////////////////////////////////////////////////////
  // BASE64 conversion filtering streams

  namespace detail {

    /// Input filter class with base64 decoding (implementation)
    class QLIB_API Base64InFilterImpl : public InFilterImpl
    {
    private:
      static const int BUF_SIZE = 4096; //(80/4)*3;
      boost::circular_buffer<unsigned char> m_buf;
      LString m_remaining;

      void readImpl();

    public:
      typedef InFilterImpl super_t;

      Base64InFilterImpl();

      Base64InFilterImpl(const impl_type &in);

      virtual ~Base64InFilterImpl();

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
      
    };

    //////////

    /// Output filter class with base64 encoding (implementation)
    class QLIB_API Base64OutFilterImpl : public OutFilterImpl
    {
    private:
      static const int BUF_SIZE = (80/4)*3;
      boost::circular_buffer<unsigned char> m_buf;

      inline bool isBufFull() const {
        return m_buf.size()>=BUF_SIZE;
      }
      
      static inline size_t BASE64_LENGTH(size_t inlen)
      {
        return ((((inlen) + 2) / 3) * 4);
      }

    public:
      typedef OutFilterImpl super_t;

      Base64OutFilterImpl();

      Base64OutFilterImpl(const impl_type &in);

      virtual ~Base64OutFilterImpl();

      virtual int write(const char *buf, int off, int len);
      virtual void write(int b);
      virtual void flush();
      virtual void o_close();

      int writeImpl();
    };

  } // namespace detail

  typedef FilterInStream<detail::Base64InFilterImpl> Base64InStream;

  typedef FilterOutStream<detail::Base64OutFilterImpl> Base64OutStream;

}


#endif
