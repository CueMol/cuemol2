// -*-Mode: C++;-*-
//
// CCP4 binary input filter stream
//

#ifndef XTAL_CCP4_INPUT_STREAM_HPP_INCLUDED
#define XTAL_CCP4_INPUT_STREAM_HPP_INCLUDED

#include "xtal.hpp"

#include <qlib/BinStream.hpp>
#include <qlib/LExceptions.hpp>

namespace xtal {

  ///
  ///   CCP4-type binary input filter stream
  ///
  class XTAL_API CCP4InStream : public qlib::BinInStream
  {
  public:
    // byte order marker
    static const int BO_BE = 1;
    static const int BO_LE = 4;
 
#if (BYTEORDER==1234)
  static const int m_intNativeType = BO_LE;
#elif (BYTEORDER==4321)
  static const int m_intNativeType = BO_BE;
#else
# error "Unsupported integer byte-order machine"
#endif

#if (HOST_FLOAT_FORMAT==IEEE_LE)
  static const int m_fltNativeType = BO_LE;
#elif (HOST_FLOAT_FORMAT==IEEE_BE)
  static const int m_fltNativeType = BO_BE;
#else
  // We only support IEEE format machine.
# error "Unsupported float byte-order machine"
#endif

private:
  //////////////////////////////////////
  // stream internal properties

  /** integer byte order of this stream */
  int m_intType;

  /** float num byte order of this stream */
  int m_fltType;

  //////////////////////////////////////

public:
  CCP4InStream() : BinInStream(),
  m_intType(m_intNativeType),
  m_fltType(m_fltNativeType)
  {
  }

  CCP4InStream(InStream &r) : BinInStream(r),
  m_intType(m_intNativeType),
  m_fltType(m_fltNativeType)
  {
  }

  /** copy ctor */
  CCP4InStream(CCP4InStream &r) : BinInStream(r),
  m_intType(m_intNativeType),
  m_fltType(m_fltNativeType)
  {
  }

  /** copy operator */
  const CCP4InStream &operator=(const CCP4InStream &arg) {
    BinInStream::operator=(arg);
    return *this;
  }

  /** dtor */
  virtual ~CCP4InStream() {}

  //////////////////////////////////////
  // CCP4 input specific methods

  int getIntFileByteOrder() const {
    return m_intType;
  }

  int getFloatFileByteOrder() const {
    return m_fltType;
  }

  /**
    determine the file's byte order
    @param iType byte-order sign for integer data type
    @param fType byte-order sign for float data type
    @return returns true if succeeded
   */
  void setFileByteOrder(int iType, int fType);

  /**
    fetch four bytes from the stream fp
    @param fp I/O stream to read
    @param buf Read data are returned in this buf.
    buf must be longer than four bytes.
    @return returns true if succeeded
   */
  void fetch_word(void *buf) {
    readFully((char *)buf, 0, 4*1);
  }

  /**
    Fetch an integer value (4-bytes length) from the stream fp.
    After the success of operation,
    the stream fp proceeds four bytes.
    @param fp I/O stream to read
    @param ri integer value is returned, if succeeded.
    @return returns true if succeeded.
   */
  void fetch_int(int &ri) {
    char buf[16];
    fetch_word(buf);
    ri = ((int *)buf)[0];

    if (m_intType!=m_intNativeType)
      qlib::LByteSwapper<int>::swap(ri);
  }

  /**
    Fetch an float value (4-bytes length) from the stream fp.
    After the success of operation,
    the stream fp proceeds four bytes.
    @param fp I/O stream to read
    @param rf float value is returned, if succeeded.
    @return returns true if succeeded.
   */
  void fetch_float(float &rf) {
    char buf[16];
    fetch_word(buf);
    rf = ((float *)buf)[0];

    if (m_fltType!=m_fltNativeType)
      qlib::LByteSwapper<float>::swap(rf);
  }

  /**
    Fetch array of float values (4-bytes length)
    from the stream fp.
    After the success of operation,
    the stream fp proceeds 4*size bytes.
    @param fp I/O stream to read
    @param fbuf array of float type.
    the length must be longer than size
    @param size size to read.
    @return returns true if succeeded.
   */
  void fetch_floatArray(float *fbuf, int size);

  void fetch_byteArray(quint8 *buf, int size);

private:

  /**
    determine the system's byte order
   */
  static void checkByteOrder();

  int getIntSysByteOrder() const {
    return m_intNativeType;
  }

  int getFloatSysByteOrder() const {
    return m_fltNativeType;
  }

  void swap4bytes(char *buf) {
    int a;
    a = buf[0];
    buf[0] = buf[3];
    buf[3] = a;
    a = buf[1];
    buf[1] = buf[2];
    buf[2] =a;
  }

}; // class CCP4InStream

}

#endif

