// -*-Mode: C++;-*-
//
// superclass of input/output streams
//
// $Id: LStream.hpp,v 1.3 2009/12/12 17:27:56 rishitani Exp $

#ifndef INPUT_OUTPUT_STREAM_HPP__
#define INPUT_OUTPUT_STREAM_HPP__

#include "qlib.hpp"
#include "SmartPtr.hpp"
#include "LStreamImpl.hpp"

namespace qlib {

  ///
  /// Superclass of I/O streams
  ///
  class QLIB_API LStream
  {
  public:

    /// dtor
    virtual ~LStream() {}

    ///////////////////////

    /// Close the stream.
    virtual void close() =0;

    /// get destination URI of this stream
    virtual LString getURI() const =0;

  };

  //////////////////////////////////////////

  ///
  /// Superclass of input stream
  ///
  class QLIB_API InStream : public LStream
  {
  public:
    typedef sp<detail::InImpl> impl_type;

    // /// dtor
    // virtual ~InStream() {}

    ///////////////////////

    virtual bool ready() =0;
  
    virtual int read(char *buf, int off, int len) =0;

    /// Read one byte.
    virtual int read() =0;
  
    /// Skip len bytes
    virtual int skip(int len) =0;

    /// close stream
    virtual void close() =0;

    /// get implementation
    virtual impl_type getImpl() const =0;

    /// get source URI of this stream
    virtual LString getURI() const =0;

    ///////////////////////

    void readFully(char *b, int off, int len);

  };

  /// Input stream adaptor with default implementations.
  /// Subclass must only implement "getImpl" method.
  class QLIB_API InStreamAdaptor : public InStream
  {
  public:
    /// default ctor
    InStreamAdaptor() {}

    // /// dtor: do nothing
    // virtual ~InStreamAdaptor() {}

    virtual bool ready() {
      return getImpl()->ready();
    }
  
    virtual int read() {
      return getImpl()->read();
    }
  
    virtual int read(char *buf, int off, int len) {
      return getImpl()->read(buf, off, len);
    }

    virtual int skip(int len) {
      return getImpl()->skip(len);
    }

    virtual void close() {
      return getImpl()->i_close();
    }

    virtual LString getURI() const {
      return getImpl()->getSrcURI();
    }
  };
  
  /////////////////////////////////////////////////

  /// Superclass of output stream
  class QLIB_API OutStream : public LStream
  {
  public:
    typedef sp<detail::OutImpl> impl_type;

  public:

    // /// dtor
    // virtual ~OutStream() {}

    /// Write byte array.
    virtual int write(const char *buf, int off, int len) =0;
    
    ///  Write one byte. (higher bits in b is ignored.)
    virtual void write(int b) =0;

    /// Flush the stream.
    virtual void flush() =0;


    /// Close the stream.
    virtual void close() =0;

    /// get destination URI of this stream
    virtual LString getURI() const =0;

    /// get implementation
    virtual impl_type getImpl() const =0;

  };

  /// Output stream adaptor with default implementations.
  /// Subclass must only implement "getImpl" method.
  class QLIB_API OutStreamAdaptor : public OutStream
  {
  public:

    //  dtor
    // virtual ~OutStreamAdaptor() {}

    virtual int write(const char *buf, int off, int len) {
      return getImpl()->write(buf, off, len);
    }
    
    virtual void write(int b) {
      return getImpl()->write(b);
    }

    virtual void flush() {
      getImpl()->flush();
    }

    virtual void close() {
      getImpl()->o_close();
    }

    virtual LString getURI() const {
      return getImpl()->getDestURI();
    }
  };


} // qlib


#endif

