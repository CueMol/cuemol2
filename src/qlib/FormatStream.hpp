// -*-Mode: C++;-*-
//
// Data-Formatting input/output streams
//
// $Id: FormatStream.hpp,v 1.1 2009/05/04 18:01:21 rishitani Exp $

#ifndef FORMAT_STREAM_HPP__
#define FORMAT_STREAM_HPP__

#include "LStream.hpp"

namespace qlib {

  /**
    Superclass of input-formatting stream.
    This stream shares the implementation with the parent stream,
    and the data are read from the shared impl.
   */
  class QLIB_API FormatInStream : public InStreamAdaptor
  {
  public:
    typedef sp<detail::InImpl> impl_type;

  private:
    impl_type m_pimpl;

  public:
    /** default ctor */
    FormatInStream() {}

    /** create copy sharing the same implementation */
    FormatInStream(InStream &r) : m_pimpl(r.getImpl()) {}

    // /** create copy sharing the same implementation */
    // FormatInStream(FormatInStream &r) : m_pimpl(r.getImpl()) {}

    /** dtor */
    virtual ~FormatInStream() {}

    /** copy operator */
    FormatInStream &operator=(InStream &arg) {
      if(&arg!=this){
        m_pimpl = arg.getImpl();
      }
      return *this;
    }

    ///////////////////////

    /** get implementation */
    virtual impl_type getImpl() const {
      return m_pimpl;
    }

  protected:
    /** set implementation */
    virtual void setImpl(impl_type p) {
      m_pimpl = p;
    }

  };
  
  /////////////////////////////////////////////////

  /**
    Superclass of output-formatting stream.
    This stream shares the implementation with the parent stream,
    and the data are written to the shared impl.
   */
  class QLIB_API FormatOutStream : public OutStreamAdaptor
  {
  public:
    typedef sp<detail::OutImpl> impl_type;

  private:
    impl_type m_pimpl;

  public:
    /** default ctor */
    FormatOutStream() {}

    /** create copy sharing the same implementation */
    FormatOutStream(OutStream &r) : m_pimpl(r.getImpl()) {}
    
    // /** create copy sharing the same implementation */
    // FormatOutStream(FormatOutStream &r) : m_pimpl(r.getImpl()) {}
    
    /** dtor */
    virtual ~FormatOutStream() {}

    /** copy operator */
    FormatOutStream &operator=(OutStream &arg) {
      if(&arg!=this){
	m_pimpl = arg.getImpl();
      }
      return *this;
    }

    ///////////////////////

    /** get implementation */
    virtual impl_type getImpl() const {
      return m_pimpl;
    }

  protected:
    /** set implementation */
    virtual void setImpl(impl_type p) {
      m_pimpl = p;
    }

  };

  
}


#endif
