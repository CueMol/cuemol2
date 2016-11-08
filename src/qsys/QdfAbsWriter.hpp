// -*-Mode: C++;-*-
//
// Abstract class for QDF writer classes
//

#ifndef QSYS_QDF_ABS_WRITER_HPP
#define QSYS_QDF_ABS_WRITER_HPP

#include "qsys.hpp"

#include <qlib/mcutils.hpp>
#include <qlib/LExceptions.hpp>
#include <qlib/LTypes.hpp>
#include "ObjWriter.hpp"
#include "QdfStream.hpp"

namespace qlib {
  class BinOutStream;
  // class LDom2OutStream;
}

namespace qsys {

  using qlib::LString;

  class QSYS_API QdfAbsWriter : public qsys::ObjWriter, public QdfDataType
  {

  private:

    QdfOutStream *m_pOut;

    /// QDF version number (in integer)
    int m_nVersion;

    /// Encoding type string (2-char, "00", "11", etc)
    LString m_encStr;

    // /// File type string (4-char)
    // LString m_strFileType;

  public:
    QdfAbsWriter();
    virtual ~QdfAbsWriter();

    /////////
    // QDF common interface

    void setVersion(int n) { m_nVersion = n; }

    /// set 2-char encoding ID string
    void setEncType(const LString &encstr)
    {
      m_encStr = encstr;
      // m_pOut->setEncType(encstr);
    }

    /// get QDF output stream
    QdfOutStream &getStream() {
      return *m_pOut;
    }

    /// start writing to stream outs
    void start(qlib::OutStream &outs);

    /// finish writing to the stream
    void end();

    /////////
    // deprecated methods for compatibility 

    void defineData(const LString &name, int nrec) {
      m_pOut->defData(name, nrec);
    }

    void defineRecord(const LString &name, int ntype) {
      m_pOut->defineRecord(name, ntype);
    }

    void startData() {
      m_pOut->startData();
    }
    void endData() {
      m_pOut->endData();
    }

    void startRecord() {
      m_pOut->startRecord();
    }
    void endRecord() {
      m_pOut->endRecord();
    }

    void setRecValStr(const LString &name, const LString &value) {
      m_pOut->writeStr(name, value);
    }
    void setRecValInt32(const LString &name, int value) {
      m_pOut->writeInt32(name, value);
    }
    void setRecValInt8(const LString &name, qint8 value) {
      m_pOut->writeInt8(name, value);
    }
    void setRecValFloat32(const LString &name, qfloat32 value) {
      m_pOut->writeFloat32(name, value);
    }

  };

} // namespace qsys

#endif
