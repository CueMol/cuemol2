// -*-Mode: C++;-*-
//
// Abstract class for QDF reader classes
//
// $Id: QdfAbsReader.cpp,v 1.2 2011/04/03 08:08:46 rishitani Exp $
//

#include <common.h>

#include "QdfAbsReader.hpp"

#include <qlib/BinStream.hpp>
#include <qlib/Base64Stream.hpp>
#include <qlib/GzipStream.hpp>
#include <qlib/LChar.hpp>

using namespace qsys;

QdfAbsReader::QdfAbsReader()
     : m_pQdfIn(NULL)
{
}

QdfAbsReader::~QdfAbsReader()
{
  if (m_pQdfIn!=NULL)
    delete m_pQdfIn;
}

#if 0
void QdfAbsReader::setupStream(qlib::InStream &ins)
{
  // check QDF signature & version
  char sgn[5];
  ins.read(sgn, 0, 4);
  sgn[4] = '\0';
  if (qlib::LChar::equals(sgn, "QDF0")) {
    // version 0 --> No encoding specification (direct storage)
    m_pBinIn = MB_NEW qlib::BinInStream(ins);
    return;
  }
  else if (qlib::LChar::equals(sgn, "QDF1")) {
    // version 1
    char b64 = ins.read();
    char comp = ins.read();

    qlib::InStream *pTIn = &ins;
    
    if (b64=='1') {
      m_pB64In = MB_NEW qlib::Base64InStream(*pTIn);
      pTIn = m_pB64In;
    }

    if (comp=='0') {
    }
    else if (comp=='1') {
      m_pZIn = new qlib::GzipInStream(*pTIn);
      pTIn = m_pZIn;
    }
    else {
      MB_THROW(qlib::FileFormatException, "Unsupported compression method");
      return;
    }

    m_pBinIn = MB_NEW qlib::BinInStream(*pTIn);
    return;
  }
  
  MB_THROW(qlib::FileFormatException, "invalid qdf signature");
  return;
}

void QdfAbsReader::start(qlib::InStream &ins)
{
  if (m_pBinIn!=NULL)
    delete m_pBinIn;
  if (m_pB64In!=NULL)
    delete m_pB64In;
  if (m_pZIn!=NULL)
    delete m_pZIn;

  setupStream(ins);

  // BOM
  int int_bo = m_pBinIn->read();
#if (BYTEORDER==1234)
  // litte endian host
  if (int_bo==qlib::BinOutStream::INTBO_BE)
    m_pBinIn->setSwapMode(qlib::BinInStream::MODE_SWAP);
#elif (BYTEORDER==4321)
  // big endian host
  if (int_bo==qlib::BinOutStream::INTBO_LE)
    m_pBinIn->setSwapMode(qlib::BinInStream::MODE_SWAP);
#else
#error "Unsupported host intnum format"
#endif

  {
    qint32 testval = m_pBinIn->tread<qint32>();
    if (testval!=12345678) {
      // if (!m_pBinIn->assertValue<qint32>(12345678)) {
      LString msg = LString::format("Unsupported int byte order (int marker read %X != expected %X, file_bo=%d)",
                                    testval, 12345678, int_bo);
      MB_THROW(qlib::FileFormatException, msg);
      return;
    }
  }

  // FBOM
  int flt_bo = m_pBinIn->read();
  MB_ASSERT(flt_bo==int_bo);
  if (!m_pBinIn->assertValue<qfloat32>(1.2345678f)) {
    MB_THROW(qlib::FileFormatException, "unsupported float byte order");
    return;
  }

  // QDF version no
  m_nVer = m_pBinIn->readInt32();
  if (m_nVer!=QDF_VERSION) {
    MB_THROW(qlib::FileFormatException, "unsupported qdf version");
    return;
  }

  // write file type string (any length)
  m_strFileType = m_pBinIn->readStr();
}

void QdfAbsReader::end()
{
  if (m_pBinIn!=NULL) {
    // m_pBinIn->close();
    delete m_pBinIn;
    m_pBinIn = NULL;
  }
  
  if (m_pZIn!=NULL) {
    m_pZIn->close();
    delete m_pZIn;
    m_pZIn = NULL;
  }

  if (m_pB64In!=NULL) {
    m_pB64In->close();
    delete m_pB64In;
    m_pB64In = NULL;
  }
}

int QdfAbsReader::readDataDef(const LString &name)
{
  // read data name
  LString rname = m_pBinIn->readStr();
  if (!rname.equals(name)) {
    MB_THROW(qlib::FileFormatException, "data name mismatch");
    return -1;
  }

  // returns total record count in the data chunk
  return m_pBinIn->readInt32();
}

void QdfAbsReader::readRecordDef()
{
  int nrec = m_pBinIn->readInt32();

  m_recdefs.clear();
  // m_recmap.clear();

  for (int i=0; i<nrec; ++i) {
    LString name = m_pBinIn->readStr();
    int ntype = m_pBinIn->readInt8();
    m_recdefs.push_back(RecElem(name, ntype));
  }
}

qfloat32 QdfAbsReader::getRecValFloat32(const LString &name)
{
  const RecElem &elem = m_recdefs[m_nRecInd];
  if (!elem.first.equals(name) || elem.second!=QDF_TYPE_FLOAT32) {
    MB_THROW(qlib::FileFormatException, "setRecValFloat32 inconsistent record order");
    return -0.0f;
  }
  m_nRecInd++;
  
  return m_pBinIn->readFloat32();
}

qint32 QdfAbsReader::getRecValInt32(const LString &name)
{
  const RecElem &elem = m_recdefs[m_nRecInd];
  if (!elem.first.equals(name) || elem.second!=QDF_TYPE_INT32) {
    MB_THROW(qlib::FileFormatException, "setRecValInt32 inconsistent record order");
    return 0;
  }

  m_nRecInd++;

  return m_pBinIn->readInt32();
}

qint8 QdfAbsReader::getRecValInt8(const LString &name)
{
  const RecElem &elem = m_recdefs[m_nRecInd];
  if (!elem.first.equals(name) || elem.second!=QDF_TYPE_INT8) {
    MB_THROW(qlib::FileFormatException, "setRecValInt8 inconsistent record order");
    return 0;
  }

  m_nRecInd++;

  return m_pBinIn->readInt8();
}

LString QdfAbsReader::getRecValStr(const LString &name)
{
  const RecElem &elem = m_recdefs[m_nRecInd];
  if (!elem.first.equals(name) || elem.second!=QDF_TYPE_UTF8STR) {
    MB_THROW(qlib::FileFormatException, "setRecValStr inconsistent record order");
    return LString();
  }

  ++m_nRecInd;

  return m_pBinIn->readStr();
}


#endif

