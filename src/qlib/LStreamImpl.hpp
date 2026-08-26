// -*-Mode: C++;-*-
//
// superclass of input/output streams implementation
//
// $Id: LStreamImpl.hpp,v 1.1 2008/01/02 13:38:48 rishitani Exp $

#ifndef INPUT_OUTPUT_STREAM_IMPL_HPP_
#define INPUT_OUTPUT_STREAM_IMPL_HPP_

#include "qlib.hpp"
#include "LTypes.hpp"
#include "LString.hpp"

namespace qlib {

  namespace detail {

    /// interface of input implementations
    class QLIB_API InImpl
    {
    public:
      
      virtual ~InImpl() {}

      /// check if input is available.
      virtual bool ready() =0;

      /// read one byte
      virtual int read() =0;
      
      /// read into mem block
      virtual int read(char *buf, int off, int len) =0;

      /// 
      /// Try to skip n bytes.
      /// @return the actual number of bytes skipped
      ///
      virtual int skip(int n) =0;
      
      /// close the stream
      virtual void i_close() =0;

      /// get source URI of this stream
      virtual LString getSrcURI() const =0;

      ///////////////////////
      // Random access (optional). File-backed and in-memory sources
      // implement these; filters and decoders (gzip, xz, base64) keep the
      // defaults and are not seekable. Positions are 64-bit byte offsets
      // from the start of the source.

      /// True when tell()/seekTo() are supported by this source
      virtual bool isSeekable() const { return false; }

      /// Current byte offset from the start, or -1 when not seekable
      virtual qint64 tell() const { return -1; }

      /// Move to an absolute byte offset. Returns false when not seekable
      /// (or the position is out of range); the stream position is then
      /// unchanged.
      virtual bool seekTo(qint64 pos) { return false; }

    };

    /// interface of output implementations
    class QLIB_API OutImpl
    {
    public:

      virtual ~OutImpl() {}

      /// write out mem block
      virtual int write(const char *buf, int off, int len) =0;
    
      /// write one byte
      virtual void write(int b) =0;
      
      /// flush output stream
      virtual void flush() =0;
      
      /// close the stream
      virtual void o_close() =0;

      /// get destination URI of this stream
      virtual LString getDestURI() const =0;

    };

    /// interface for I/O device implementation
    class QLIB_API IOImpl : public InImpl, public OutImpl
    {
    public:
      ~IOImpl() override {}
    };

  } // namespace detail

} // namespace qlib

#endif

