// -*-Mode: C++;-*-
//
// Binary data input/output filter
//
// $Id: BinStream.hpp,v 1.5 2011/04/03 08:08:46 rishitani Exp $

#ifndef BINARY_INPUT_OUTPUT_STREAM_H__
#define BINARY_INPUT_OUTPUT_STREAM_H__

#include "qlib.hpp"

#include "FormatStream.hpp"
#include "LTypes.hpp"
#include "LExceptions.hpp"
#include "LChar.hpp"

namespace qlib {

  /** binary input filter stream */
  class QLIB_API BinInStream : public FormatInStream
  {
  private:
    int m_nSwapMode;
    
  public:
    typedef FormatInStream super_t;

    enum {
      MODE_NORM_LE, // normalize from the little endian
      MODE_NORM_BE, // normalize from the big endian
      MODE_SWAP, // force byte swapping
      MODE_NOOP // do nothing
    };

  public:

    /** default ctor (bswap mode: NOOP) */
    BinInStream() : super_t(), m_nSwapMode(MODE_NOOP) {}

    /** construction from input stream (bswap mode: NOOP) */
    BinInStream(InStream &r) : super_t(r), m_nSwapMode(MODE_NOOP) {}

    /** copy ctor */
    BinInStream(BinInStream &r) : super_t(r), m_nSwapMode(r.m_nSwapMode) {}

    /** copy operator */
    const BinInStream &operator=(const BinInStream &arg)
    {
      if (this!=&arg) {
        m_nSwapMode = arg.m_nSwapMode;
      }
      super_t::operator=(arg);
      return *this;
    }

    /** dtor */
    virtual ~BinInStream();
    
    //////////////////////////////////////
    // binary input specific methods

    /** get current byte swap mode */
    int getSwapMode() const { return m_nSwapMode; }

    /** set current byte swap mode */
    void setSwapMode(int n) { m_nSwapMode = n; }

    LString readStr()
    {
      int nlen;
      nlen = readInt32();
      MB_ASSERT(nlen>=0);
      if (nlen<=0) return LString();
      char *sbuf = MB_NEW char[nlen+1];
      readFully(sbuf, 0, nlen);
      sbuf[nlen] = '\0';
      LString ret(sbuf);
      delete [] sbuf;
      return ret;
    }

    qint8 readInt8()
    {
      return tread<qint8>();
    }

    qint16 readInt16()
    {
      return tread<qint16>();
    }

    qint32 readInt32()
    {
      return tread<qint32>();
    }

    qfloat32 readFloat32()
    {
      return tread<qfloat32>();
    }

    template<class Y> Y tread()
    {
      Y ret;
      readFully((char *)&ret, 0, sizeof(Y));

      /*
      if (m_nSwapMode==MODE_NORM_LE) {
        LByteNormalize<Y>::doit(ret);
      }
      else if (m_nSwapMode==MODE_NORM_BE) {
        LByteNormalizeBE<Y>::doit(ret);
      }
      else */

      if (m_nSwapMode==MODE_SWAP) {
        LByteSwapper<Y>::swap(ret);
      }
       
      return ret;
    }

    template<class Y> bool assertValue(Y aval)
    {
      Y val = tread<Y>();
      if (val==aval) return true;
      else return false;
    }

  }; // class BinInStream

  ////////////////////////////////////////

  /// Output stream for binary data
  class QLIB_API BinOutStream : public FormatOutStream
  {
  public:
    typedef FormatOutStream super_t;

  public:

    /// default ctor (bswap mode: NOOP)
    BinOutStream() : super_t() {}
    
    BinOutStream(OutStream &r)
         : super_t(r) {}

    /// copy ctor
    BinOutStream(BinOutStream &r)
         : super_t(r) {}
    
    /// copy operator
    const BinOutStream &operator=(const BinOutStream &arg) {
      super_t::operator=(arg);
      return *this;
    }

    virtual ~BinOutStream();
    
    //////////////////////////////////////
    // binary output specific methods

    void writeStr(const char *str)
    {
      int nlen = LChar::length(str);
      writeInt32(nlen);
      super_t::write(str, 0, nlen);
    }
    
    void writeFixedStr(const char *str, int nmaxlen)
    {
      int nlen = LChar::length(str);
      int npad = nmaxlen - nlen;
      super_t::write(str, 0, nlen);
      // XXX write padding zero; TO DO: more efficient impl
      for (int i=0; i<npad; ++i)
        super_t::write(0);
    }

    void writeInt8(qint8 value)
    {
      super_t::write((const char *)&value, 0, sizeof(qint8));
    }

    void writeInt16(qint16 value)
    {
      super_t::write((const char *)&value, 0, sizeof(qint16));
    }

    void writeInt32(qint32 value)
    {
      super_t::write((const char *)&value, 0, sizeof(qint32));
    }

    void writeFloat32(qfloat32 value)
    {
      super_t::write((const char *)&value, 0, sizeof(qfloat32));
    }

    ///
    /// Write binary data in native byte order
    ///
    template<typename Y>
    void twrite(Y in)
    {
      super_t::write((const char *)&in, 0, sizeof(Y));
      return;
    }
    
    /// little endian
    static const int INTBO_LE = 0;
    /// big endian
    static const int INTBO_BE = 1;

    /// little endian
    static const int FLTBO_LE = 0;
    /// big endian
    static const int FLTBO_BE = 1;

    /// Get endian info
    inline static
      int getIntByteOrder()
      {
#if (BYTEORDER==1234)
        return INTBO_LE;
#elif (BYTEORDER==4321)
        return INTBO_BE;
#else
#error "Unsupported host intnum format"
#endif
      }

    /// Get endian info
    inline static
      int getFloatByteOrder()
      {
#if (HOST_FLOAT_FORMAT==IEEE_LE)
        return FLTBO_LE;
#elif (HOST_FLOAT_FORMAT==IEEE_BE)
        return FLTBO_BE;
#else
#error "Unsupported host floatnum format"
#endif
      }

/*
    template<class T>
    BinOutStream &operator<<(T b) {
      write(b);
      return *this;
    }
*/
  };
  
} // namespace qlib

#endif
