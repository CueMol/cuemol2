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

  public:
    QdfAbsWriter();
    virtual ~QdfAbsWriter();

    /////////
    // QDF common interface

    /// Set 2-char file ID string
    void setFileType(const LString &type)
    {
      m_strFileType = type;
    }

    /// set 2-char encoding ID string
    void setEncType(const LString &encstr)
    {
      m_encStr = encstr;
    }

    // void setEncFlagsByStream(qlib::LDom2OutStream &oos);

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

  private:

    QdfOutStream *m_pOut;

    /// Encoding type string (2-char)
    LString m_encStr;

    /// File type string (4-char)
    LString m_strFileType;

  };

} // namespace qsys

#endif
