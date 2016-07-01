// -*-Mode: C++;-*-
//
// QDF Binary data input/output filter
//

#ifndef QSYS_QDF_BINARY_STREAM_HPP__
#define QSYS_QDF_BINARY_STREAM_HPP__

#include "qsys.hpp"

#include <qlib/BinStream.hpp>
#include <qlib/LString.hpp>
#include <qlib/MapTable.hpp>
#include <qlib/Vector4D.hpp>

#define QDF_VERSION 2

namespace qsys {

  using qlib::LString;
  using qlib::OutStream;
  using qlib::InStream;
  using qlib::Vector4D;

  /// Data type constants
  ///  (These defs should be persistent and part of API)
  /// TO DO: use qlib::type_consts definitions
  class QdfDataType
  {
  public:
    static const int QDF_TYPE_BOOL = 0;

    static const int QDF_TYPE_UINT8 = 1;
    static const int QDF_TYPE_UINT16 = 2;
    static const int QDF_TYPE_UINT32 = 3;
    static const int QDF_TYPE_UINT64 = 4;

    // alias
    static const int QDF_TYPE_UID = QDF_TYPE_UINT32;

    static const int QDF_TYPE_INT8 = 11;
    static const int QDF_TYPE_INT16 = 12;
    static const int QDF_TYPE_INT32 = 13;
    static const int QDF_TYPE_INT64 = 14;

    static const int QDF_TYPE_FLOAT32 = 21;
    static const int QDF_TYPE_FLOAT64 = 22;
    static const int QDF_TYPE_FLOAT128 = 23;
    static const int QDF_TYPE_FLOAT16 = 24;

    static const int QDF_TYPE_UTF8STR = 41;

    // fixed-length string data types (from version 2.2.2.39x)
    static const int QDF_TYPE_FIXSTR8 = 42;
    static const int QDF_TYPE_FIXSTR16 = 43;
    static const int QDF_TYPE_FIXSTR32 = 44;

    // extended data types (from version 2.0.1.182)

    /// float32 x 3 elem vector
    static const int QDF_TYPE_VEC3 = 51;
    /// float32 x 4 elem vector
    static const int QDF_TYPE_VEC4 = 52;
    /// qbyte x 3 RGB color
    static const int QDF_TYPE_RGB = 53;
    /// qbyte x 4 RGBA color
    static const int QDF_TYPE_RGBA = 54;

    // typedef std::pair<LString, int> RecElem;
    struct RecElem : public std::pair<LString, int>
    {
      typedef std::pair<LString, int> super_t;

      RecElem(const LString &a1, int a2) : super_t(a1, a2), nmaxlen(0) {}
      RecElem(const LString &a1, int a2, int a3) : super_t(a1, a2), nmaxlen(a3) {}

      /// Maximum length of the string (valid if mode is in FIXSTR)
      int nmaxlen;
    };
    typedef std::vector<RecElem> RecElemList;
    typedef qlib::MapTable<int> RecIndMap;

    static int getSize(int nrecid, bool fixed=true);

  };

  ////////////////////////////////////////

  ///
  /// Input stream for QDF binary data
  ///
  class QSYS_API QdfInStream : public qlib::FormatInStream, public QdfDataType
  {
  public:
    typedef FormatInStream super_t;

  private:
    /// copy ctor
    QdfInStream(QdfInStream &r)
         : super_t(r), m_pBinIn(NULL), m_pB64In(NULL), m_pZIn(NULL) {}
    
    /// copy operator
    const QdfInStream &operator=(const QdfInStream &arg)
    {
      super_t::operator=(arg);
      return *this;
    }

  public:

    /// default ctor (bswap mode: NOOP)
    QdfInStream() : super_t(), m_pBinIn(NULL), m_pB64In(NULL), m_pZIn(NULL) {}
    
    QdfInStream(InStream &r)
         : super_t(r), m_pBinIn(NULL), m_pB64In(NULL), m_pZIn(NULL) {}

    virtual ~QdfInStream();

    ////////////////////////////////

    // QDF common interface

    void start();
    void end();

    LString getFileType() const { return m_strFileType; }

    /// Read data definition section and returns the total record count
    int readDataDef(const LString &name, bool skipUnknown = true);

    /// Read record definition
    void readRecordDef();

    /////////////////
    //  old interface

    void startRecord();
    void endRecord();

    qfloat32 readFloat32(const LString &name);
    qint32 readInt32(const LString &name);
    qint8 readInt8(const LString &name);
    LString readStr(const LString &name);

    void readVec3D(const LString &name, qfloat32 *pvec);
    Vector4D readVec3D(const LString &name);

    quint32 readColorRGBA(const LString &name);
    void readColorRGBA(const LString &name, qbyte *pvec);

    void skipRecord();

    void skipAllRecords();

    /////////////////
    // New interface for no byte-swaping

    /// Read multiple records into the buffer (without byte swapping)
    void readFxRecords(int nrec, void *pbuf, int nbufsz);

    int getFxRecordSize()
    {
      int nrecsz = 0;
      int i, nrec = m_recdefs.size();
	  for (i = 0; i < nrec; ++i) {
        nrecsz += QdfDataType::getSize(m_recdefs[i].second, true);
      }
      
      return nrecsz;
    }
    
    bool isIntByteSwap() const { return m_bIntByteSwap; }

  private:
    void setupStream();

    void skipAllRecordsImpl();

    // QDF implementation data

    /// Binary input stream
    qlib::BinInStream *m_pBinIn;

    /// Base64 decoding (for QDF1 format)
    qlib::InStream *m_pB64In;
    qlib::InStream *m_pZIn;

    /// File type string
    LString m_strFileType;

    /// QDF version no
    int m_nVer;

    /// Byte order
    int m_bIntByteSwap;

    RecElemList m_recdefs;

    int m_nRecInd;

  };

  
  ////////////////////////////////////////////////////////////////////////////////

  ///
  /// Output stream for QDF binary data
  ///
  class QSYS_API QdfOutStream : public qlib::FormatOutStream, public QdfDataType
  {
  public:
    typedef FormatOutStream super_t;

  private:
    /// copy ctor
    QdfOutStream(QdfOutStream &r)
         : super_t(r), m_pOut(NULL), m_pB64Out(NULL), m_pZOut(NULL) {}
    
    /// copy operator
    const QdfOutStream &operator=(const QdfOutStream &arg)
    {
      super_t::operator=(arg);
      return *this;
    }


  public:

    /// default ctor (bswap mode: NOOP)
    QdfOutStream() : super_t(), m_pOut(NULL), m_pB64Out(NULL), m_pZOut(NULL) {}
    
    QdfOutStream(OutStream &r)
         : super_t(r), m_pOut(NULL), m_pB64Out(NULL), m_pZOut(NULL) {}

    virtual ~QdfOutStream();

    ////////////////////////////////

    // QDF common interface

    void start();
    void end();

    // Set 2-char file ID string
    void setFileType(const LString &type)
    {
      m_strFileType = type;
    }

    // set 4-char encoding ID string
    void setEncType(const LString &encstr)
    {
      m_encStr = encstr;
    }

    ////////////////////////
    // record definition methods

    void defData(const LString &name, int nrec);

    void defineRecord(const LString &name, int ntype);

    inline void defFloat32(const LString &name) {
      defineRecord(name, QDF_TYPE_FLOAT32);
    }

    inline void defInt8(const LString &name) {
      defineRecord(name, QDF_TYPE_INT8);
    }

    inline void defInt16(const LString &name) {
      defineRecord(name, QDF_TYPE_INT16);
    }

    inline void defInt32(const LString &name) {
      defineRecord(name, QDF_TYPE_INT32);
    }

    void defVec3D(const LString &name) {
      defineRecord(name, QDF_TYPE_VEC3);
    }

    void defVec4D(const LString &name) {
      defineRecord(name, QDF_TYPE_VEC4);
    }

    void defColorRGB(const LString &name) {
      defineRecord(name, QDF_TYPE_RGB);
    }

    void defColorRGBA(const LString &name) {
      defineRecord(name, QDF_TYPE_RGBA);
    }

    void defStr(const LString &name) {
      defineRecord(name, QDF_TYPE_UTF8STR);
    }

    void defFixedStr(const LString &name, int nmaxlen);

    inline void defUID(const LString &name) {
      defineRecord(name, QDF_TYPE_UID);
    }

    ////////////////////////
    // write data

    void startData();
    void endData();

    void startRecord();
    void endRecord();

    void writeStr(const LString &name, const LString &value);
    void writeFixedStr(const LString &name, const LString &value);
    void writeInt8(const LString &name, qint8 value);
    void writeInt16(const LString &name, qint16 value);
    void writeInt32(const LString &name, int value);
    void writeUInt32(const LString &name, quint32 value);
    void writeFloat32(const LString &name, qfloat32 value);

    void writeVec3D(const LString &pfx, const qlib::Vector4D &vec);
    void writeVec3D(const LString &pfx, const qfloat32 *pvec);
    void writeColorRGBA(const LString &pfx, quint32 ccode);
    void writeColorRGBA(const LString &pfx, const qbyte *pvec);
    
  private:
    void setupStream();

    // QDF implementation data

    /// Encoding type string
    LString m_encStr;

    /// Binary output stream (this is possibly this ptr)
    qlib::BinOutStream *m_pOut;

    /// Base64 encoding (for QDF1 format)
    qlib::OutStream *m_pB64Out;
    qlib::OutStream *m_pZOut;

    /// File type string
    LString m_strFileType;

    RecElemList m_recdefs;

    RecIndMap m_recmap;

    /// Record index counter
    int m_nRecInd;

  };

} // namespace qlib

#endif
