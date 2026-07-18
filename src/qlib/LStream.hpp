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
    void close() override =0;

    /// get implementation
    virtual impl_type getImpl() const =0;

    /// get source URI of this stream
    LString getURI() const override =0;

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

    bool ready() override {
      return getImpl()->ready();
    }
  
    int read() override {
      return getImpl()->read();
    }
  
    int read(char *buf, int off, int len) override {
      return getImpl()->read(buf, off, len);
    }

    int skip(int len) override {
      return getImpl()->skip(len);
    }

    void close() override {
      return getImpl()->i_close();
    }

    LString getURI() const override {
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
    void close() override =0;

    /// get destination URI of this stream
    LString getURI() const override =0;

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

    int write(const char *buf, int off, int len) override {
      return getImpl()->write(buf, off, len);
    }
    
    void write(int b) override {
      return getImpl()->write(b);
    }

    void flush() override {
      getImpl()->flush();
    }

    void close() override {
      getImpl()->o_close();
    }

    LString getURI() const override {
      return getImpl()->getDestURI();
    }
  };


} // qlib


#endif

