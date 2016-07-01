// -*-Mode: C++;-*-
//
// Pass-through filter input/output streams
//
// $Id: FilterStream.hpp,v 1.2 2009/05/04 18:01:21 rishitani Exp $

#ifndef FILTER_STREAM_HPP__
#define FILTER_STREAM_HPP__

#include "LStream.hpp"

namespace qlib {

  /////////////////////////////////////////////////////
  // Data filtering streams (for data compression, etc.)

  namespace detail {

    /// 
    ///  Input filter class with pass-through implementation
    ///
    class QLIB_API InFilterImpl : public InImpl
    {
    public:
      typedef sp<detail::InImpl> impl_type;

    private:
      /// underlying stream
      impl_type m_pin;

    public:

      InFilterImpl() {}

      InFilterImpl(const impl_type &in) : m_pin(in) {}

      /// check if input is available.
      virtual bool ready() {
	return m_pin->ready();
      }

      /// read one byte
      virtual int read() {
	return m_pin->read();
      }
      
      /// read into mem block
      virtual int read(char *buf, int off, int len) {
	return m_pin->read(buf, off, len);
      }

      /// close the stream
      virtual void i_close() {
	m_pin->i_close();
      }

      ///
      ///  Try to skip n bytes.
      ///  @return the actual number of bytes skipped
      ///
      virtual int skip(int n) {
        return m_pin->skip(n);
      }
      
      virtual LString getSrcURI() const {
        return m_pin->getSrcURI();
      }

      inline impl_type getImpl() const {
        return m_pin;
      }

    }; // class InFilterImpl

    ///
    ///  Output filter class with pass-through implementation
    ///
    class QLIB_API OutFilterImpl : public OutImpl
    {

    public:
      typedef sp<detail::OutImpl> impl_type;

    private:
      /// underlying stream
      impl_type m_pout;

    public:

      OutFilterImpl() {}

      OutFilterImpl(const impl_type &out) : m_pout(out) {}

      /// Write out mem block
      virtual int write(const char *buf, int off, int len)
      {
	return m_pout->write(buf, off, len);
      }
      
      /// write one byte
      virtual void write(int b)
      {
	m_pout->write(b);
      }
      
      /// flush output stream
      virtual void flush()
      {
	m_pout->flush();
      }
      
      /// close the stream
      virtual void o_close()
      {
	m_pout->o_close();
      }

      virtual LString getDestURI() const {
        return m_pout->getDestURI();
      }

      inline impl_type getImpl() const {
        return m_pout;
      }

    }; // class OutFilterImpl

  } // namespace detail

  ///////////////////////////////////////////////////

  ///
  /// Input filter stream template class
  ///
  template <class _InImplType>
  class FilterInStream : public InStreamAdaptor
  {
  private:
    sp<_InImplType> m_pimpl;

  public:
    explicit FilterInStream(InStream &r)
         : m_pimpl(MB_NEW _InImplType(r.getImpl()))
    {
    }

    virtual InStream::impl_type getImpl() const {
      return m_pimpl;
    }
  };

  ///
  /// Output filter stream template class
  ///
  template <class _ImplType>
  class FilterOutStream : public OutStreamAdaptor
  {
  private:
    sp<_ImplType> m_pimpl;

  public:
    explicit FilterOutStream(OutStream &r)
         : m_pimpl(MB_NEW _ImplType(r.getImpl()))
    {
    }

    virtual OutStream::impl_type getImpl() const
    {
      return m_pimpl;
    }

  };



}


#endif
