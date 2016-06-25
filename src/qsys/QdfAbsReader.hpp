// -*-Mode: C++;-*-
//
// Abstract class for QDF reader classes
//

#ifndef QSYS_QDF_ABS_READER_HPP
#define QSYS_QDF_ABS_READER_HPP

#include "qsys.hpp"

#include <qlib/mcutils.hpp>
#include <qlib/LExceptions.hpp>
#include <qlib/LTypes.hpp>
#include "ObjReader.hpp"
#include "QdfStream.hpp"

namespace qsys {

  using qlib::LString;

  class QSYS_API QdfAbsReader : public ObjReader, public QdfDataType
  {

  public:
    QdfAbsReader();
    virtual ~QdfAbsReader();

    /////////

    // QDF common interface

    QdfInStream &getStream() { return *m_pQdfIn; }

    void start(qlib::InStream &ins) {
      MB_ASSERT(m_pQdfIn==NULL);
      m_pQdfIn = MB_NEW QdfInStream(ins);
      m_pQdfIn->start();
    }
    void end() {
      MB_ASSERT(m_pQdfIn!=NULL);
      m_pQdfIn->end();
      delete m_pQdfIn;
      m_pQdfIn = NULL;
    }

    LString getFileType() const { return m_pQdfIn->getFileType(); }

    int readDataDef(const LString &name) {
      return m_pQdfIn->readDataDef(name);
    }

    void readRecordDef() {
      m_pQdfIn->readRecordDef();
    }

    void startRecord() { m_pQdfIn->startRecord(); }
    void endRecord() { m_pQdfIn->endRecord(); }

    qfloat32 getRecValFloat32(const LString &name) {
      return m_pQdfIn->readFloat32(name);
    }
    qint32 getRecValInt32(const LString &name) {
      return m_pQdfIn->readInt32(name);
    }
    qint8 getRecValInt8(const LString &name) {
      return m_pQdfIn->readInt8(name);
    }
    LString getRecValStr(const LString &name) {
      return m_pQdfIn->readStr(name);
    }

  private:
    QdfInStream *m_pQdfIn;

  };

}

#endif

