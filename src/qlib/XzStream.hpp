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

    class QLIB_API IOBuffer
    {
    private:

      /// input buffer
      std::vector<quint8> m_buffer;
      
      int m_iRead;
      int m_nAvail;

    public:
      IOBuffer(int nsize) : m_buffer(nsize), m_iRead(-1), m_nAvail(0)
      {
      }

      quint8 *wptr() {
        if (m_iRead==-1)
          return &m_buffer[0];
        else
          return &m_buffer[m_iRead+m_nAvail];
      }

      int size() const {
        if (m_iRead==-1)
          return m_buffer.size();
        else
          return m_buffer.size() - (m_iRead+m_nAvail);
      }

      void fill(int nres) {
        if (nres==0) return;
        
        if (m_iRead==-1) {
          m_iRead = 0;
          m_nAvail = nres;
        }
        else {
          m_nAvail += nres;
        }
      }

      ///
      
      const quint8 *rptr() {
        if (m_iRead==-1)
          return &m_buffer[0];
        else
          return &m_buffer[m_iRead];
      }

      int avail() const { return m_nAvail; }

      void consume(int n) {
        MB_ASSERT(m_iRead!=-1);
        m_nAvail -= n;
        m_iRead += n;
        MB_ASSERT(m_nAvail>=0);

        if (m_nAvail==0) {
          m_iRead = -1;
        }
      }
    };
   

    /// Input filter class with xz compression (implementation)
    class QLIB_API XzInFilterImpl : public InFilterImpl
    {
    private:
      static const size_t BUFSZ = 1024;

      void *m_pdata;

      IOBuffer m_buffer;

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
