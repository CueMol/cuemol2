// -*-Mode: C++;-*-
//
// QDF binary data input/output streams
//

#include <common.h>

#include "QdfStream.hpp"

#include <qlib/BinStream.hpp>
#include <qlib/Base64Stream.hpp>
#include <qlib/GzipStream.hpp>
#include <gfx/AbstractColor.hpp>

#ifdef HAVE_LZMA_H
#include <qlib/XzStream.hpp>
#endif

using namespace qsys;
using qlib::Vector4D;

//static
int QdfDataType::getSize(int nrecid, bool fixed/*=true*/)
{
  switch (nrecid) {
  case QDF_TYPE_FLOAT32:
    return sizeof (qfloat32);

  case QDF_TYPE_FLOAT64:
    return sizeof (qfloat64);
    
  case QDF_TYPE_INT64:
  case QDF_TYPE_UINT64:
    return sizeof (qint64);

    case QDF_TYPE_INT32:
  case QDF_TYPE_UINT32:
    return sizeof (qint32);

  case QDF_TYPE_INT16:
  case QDF_TYPE_UINT16:
    return sizeof (qint16);

  case QDF_TYPE_INT8:
  case QDF_TYPE_UINT8:
    return sizeof (qint8);


  case QDF_TYPE_UTF8STR:
    if (fixed)
      return sizeof (qint32);
    else {
      MB_THROW(qlib::RuntimeException, "getSize() for UTF8STR is not supported");
      return 0;
    }
    break;

  case QDF_TYPE_VEC3:
    return sizeof (qfloat32)*3;

  case QDF_TYPE_VEC4:
    return sizeof (qfloat32)*4;

  case QDF_TYPE_RGB:
    return sizeof (quint8)*3;

  case QDF_TYPE_RGBA:
    return sizeof (quint8)*4;


  default: {
    MB_THROW(qlib::RuntimeException, "getSize() for UTF8STR is not supported");
    return 0;
  }

  }

  return 0;
}

//static
LString QdfDataType::createVerString(int nver)
{
  if (nver<0x10)
    return LString::format("QDF%x", nver);
  else if (nver<0x100)
    return LString::format("QD%x", nver);
  else if (nver<0x1000)
    return LString::format("Q%x", nver);
  
  MB_THROW(qlib::FileFormatException,
           LString::format("Version number (%d) is too large", nver));
}

//static
int QdfDataType::parseVerString(const LString &strver)
{
  int rval;
  LString snum;
  if (strver.startsWith("QDF"))
    snum = strver.substr(3, 1);
  else if (strver.startsWith("QD"))
    snum = strver.substr(2, 2);
  else if (strver.startsWith("Q"))
    snum = strver.substr(1, 3);
  else {
    MB_THROW(qlib::FileFormatException,
             LString::format("Invalid version string (%s)", strver.c_str()));
  }

  snum = "0x"+snum;
  if (!snum.toInt(&rval)) {
    MB_THROW(qlib::FileFormatException,
             LString::format("Invalid version string (%s)", strver.c_str()));
  }

  return rval;
}

/////////////////////////////////////////////////////////////////////////////////


QdfInStream::~QdfInStream()
{
  if (m_pBinIn!=NULL)
    delete m_pBinIn;
  if (m_pB64In!=NULL)
    delete m_pB64In;
  if (m_pZIn!=NULL)
    delete m_pZIn;
}

void QdfInStream::setupStream()
{
  if (m_pBinIn!=NULL)
    delete m_pBinIn;
  if (m_pB64In!=NULL)
    delete m_pB64In;
  if (m_pZIn!=NULL)
    delete m_pZIn;

  // check QDF signature & version
  char csgn[5];
  read(csgn, 0, 4);
  csgn[4] = '\0';
  LString sign(csgn);

  m_nVersion = QdfDataType::parseVerString(sign);

  if (m_nVersion==0) {
    // version 0 --> No encoding specification (direct storage)
    m_pBinIn = MB_NEW qlib::BinInStream(*this);
//    m_nVer = 0;
    return;
  }

  if (m_nVersion>=1) {
    // version later than 1
    char b64 = read();
    char comp = read();

    qlib::InStream *pTIn = this;
    
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
#ifdef HAVE_LZMA_H
    else if (comp=='3') {
      m_pZIn = new qlib::XzInStream(*pTIn);
      pTIn = m_pZIn;
    }
#endif
    else {
      MB_THROW(qlib::FileFormatException, "Unsupported compression method");
      return;
    }

    m_pBinIn = MB_NEW qlib::BinInStream(*pTIn);
    // m_nVer = 1;
    return;
  }
  
  MB_THROW(qlib::FileFormatException, "invalid qdf signature "+sign);
  return;
}

void QdfInStream::start()
{
  setupStream();

  // BOM
  int int_bo = m_pBinIn->read();
  m_bIntByteSwap = false;
#if (BYTEORDER==1234)
  // litte endian host
  if (int_bo==qlib::BinOutStream::INTBO_BE) {
    m_pBinIn->setSwapMode(qlib::BinInStream::MODE_SWAP);
    m_bIntByteSwap = true;
  }
#elif (BYTEORDER==4321)
  // big endian host
  if (int_bo==qlib::BinOutStream::INTBO_LE) {
    m_pBinIn->setSwapMode(qlib::BinInStream::MODE_SWAP);
    m_bIntByteSwap = true;
  }
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
  // XXX: only the same byte order as integer is supported
  int flt_bo = m_pBinIn->read();
  MB_ASSERT(flt_bo==int_bo);
  if (!m_pBinIn->assertValue<qfloat32>(1.2345678f)) {
    MB_THROW(qlib::FileFormatException, "unsupported float byte order");
    return;
  }

  int ndummy = m_pBinIn->readInt32();

  // write file type string (any length)
  m_strFileType = m_pBinIn->readStr();
}

void QdfInStream::end()
{
  // connection order: BinIn -> (ZipIn) -> (B64In) -> this

  if (m_pBinIn!=NULL) {
    // Formatting stream shouldn't be closed!!
    // (XXX: close calls close of FileInStream!!)
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

int QdfInStream::readDataDef(const LString &name, bool skipUnknown)
{
  for (;;) {
    // read data name
    LString rname = m_pBinIn->readStr();
    if (rname.equals(name)) {
      // returns total record count in the data chunk
      return m_pBinIn->readInt32();
    }
    else if (!skipUnknown) {
      LString msg = LString::format("data name mismatch; expecting %s but got %s.",
                                    name.c_str(), rname.c_str());
      MB_THROW(qlib::FileFormatException, msg);
      return -1;
    }
    else {
      LOG_DPRINTLN("QdfIn> data name mismatch; expecting %s but got %s -> skip",
                   name.c_str(), rname.c_str());
      skipAllRecordsImpl();
    }
  }
}

void QdfInStream::readRecordDef()
{
  int nrec = m_pBinIn->readInt32();

  m_recdefs.clear();
  // m_recmap.clear();

  for (int i=0; i<nrec; ++i) {
    LString name = m_pBinIn->readStr();
    int ntype = m_pBinIn->readInt8();
    
    RecElem elem(name, ntype);

    // extra-field for the fixed-length string mode
    if (ntype==QDF_TYPE_FIXSTR8) {
      elem.nmaxlen = m_pBinIn->tread<quint8>();
    }
    else if (ntype==QDF_TYPE_FIXSTR16) {
      elem.nmaxlen = m_pBinIn->tread<quint16>();
    }
    else if (ntype==QDF_TYPE_FIXSTR32) {
      elem.nmaxlen = m_pBinIn->tread<quint32>();
    }

    m_recdefs.push_back(elem);
  }
}

bool QdfInStream::isDefined(const LString &name) const
{
  BOOST_FOREACH (const RecElem &elem, m_recdefs) {
    if (name.equals(elem.first)) {
      return true;
    }
  }
  return false;
}

void QdfInStream::startRecord()
{
  m_nRecInd = 0;
}

void QdfInStream::endRecord()
{
  const int nrecs = m_recdefs.size();
  if (m_nRecInd==nrecs)
    return; // normal termination of record

  if (m_nRecInd>nrecs) {
    // record overrun error
    LOG_DPRINTLN("QdfInStream> record overrun error!!");
    return;
  }

  // record remaining
  int nrem = nrecs-m_nRecInd;

  for (int i=0; i<nrem; ++i)
    skipRecord();
}

void QdfInStream::skipRecord()
{
  const RecElem &elem = m_recdefs[m_nRecInd];
  const LString nm = elem.first;
  const int type = elem.second;

  //MB_DPRINTLN("QdfInStream> skip record %s (%d)", nm.c_str(), type);

  switch (type) {
  case QDF_TYPE_FLOAT32:
    readFloat32(nm);
    break;
  case QDF_TYPE_INT32:
    readInt32(nm);
    break;
  case QDF_TYPE_UINT32:
    readUInt32(nm);
    break;
  case QDF_TYPE_INT8:
    readInt8(nm);
    break;
  case QDF_TYPE_UINT8:
    readUInt8(nm);
    break;
  case QDF_TYPE_UTF8STR:
  case QDF_TYPE_FIXSTR8:
  case QDF_TYPE_FIXSTR16:
  case QDF_TYPE_FIXSTR32:
    readStr(nm);
    break;
  case QDF_TYPE_VEC3:
    readVec3D(nm);
    break;
  case QDF_TYPE_RGBA:
    readColorRGBA(nm);
    break;
  default: {
    LString msg = LString::format("QdfIn.skipRec> unsupported record type (%d)", type);
    MB_THROW(qlib::FileFormatException, msg);
    return;
  }
  }
}

void QdfInStream::skipAllRecords()
{
  LString rname = m_pBinIn->readStr();
  skipAllRecordsImpl();
}

void QdfInStream::skipAllRecordsImpl()
{
  int i;
  //const int nverts = o.readDataDef("vcat");
  int nrec = m_pBinIn->readInt32();

  //o.readRecordDef();
  int nrecsz = m_pBinIn->readInt32();
  m_recdefs.clear();
  for (i=0; i<nrecsz; ++i) {
    LString name = m_pBinIn->readStr();
    int ntype = m_pBinIn->readInt8();
    m_recdefs.push_back(RecElem(name, ntype));
  }

  MB_DPRINTLN("skipAll %d", nrec);
  for (i=0; i<nrec; ++i) {
    startRecord();
    endRecord();
  }
  MB_DPRINTLN("skipAll OK");
}


qfloat32 QdfInStream::readFloat32(const LString &name)
{
  const RecElem &elem = m_recdefs[m_nRecInd];
  if (!elem.first.equals(name) || elem.second!=QDF_TYPE_FLOAT32) {
    MB_THROW(qlib::FileFormatException, "setRecValFloat32 inconsistent record order");
    return -0.0f;
  }
  m_nRecInd++;
  
  return m_pBinIn->readFloat32();
}

qint32 QdfInStream::readInt32(const LString &name)
{
  const RecElem &elem = m_recdefs[m_nRecInd];
  if (!elem.first.equals(name) || elem.second!=QDF_TYPE_INT32) {
    MB_THROW(qlib::FileFormatException, "setRecValInt32 inconsistent record order");
    return 0;
  }

  m_nRecInd++;

  return m_pBinIn->tread<qint32>();
}

quint32 QdfInStream::readUInt32(const LString &name)
{
  const RecElem &elem = m_recdefs[m_nRecInd];
  if (!elem.first.equals(name) || elem.second!=QDF_TYPE_UINT32) {
    MB_THROW(qlib::FileFormatException, "readUInt32 inconsistent record order");
    return 0;
  }

  m_nRecInd++;

  return m_pBinIn->tread<quint32>();
}

qint8 QdfInStream::readInt8(const LString &name)
{
  const RecElem &elem = m_recdefs[m_nRecInd];
  if (!elem.first.equals(name) || elem.second!=QDF_TYPE_INT8) {
    MB_THROW(qlib::FileFormatException, "readInt8 inconsistent record order");
    return 0;
  }

  m_nRecInd++;

  return m_pBinIn->tread<qint8>();
}

quint8 QdfInStream::readUInt8(const LString &name)
{
  const RecElem &elem = m_recdefs[m_nRecInd];
  if (!elem.first.equals(name) || elem.second!=QDF_TYPE_UINT8) {
    MB_THROW(qlib::FileFormatException, "readUInt8 inconsistent record order");
    return 0;
  }

  m_nRecInd++;

  return m_pBinIn->tread<quint8>();
}

bool QdfInStream::readBool(const LString &name)
{
  const RecElem &elem = m_recdefs[m_nRecInd];
  if (!elem.first.equals(name) || elem.second!=QDF_TYPE_BOOL) {
    MB_THROW(qlib::FileFormatException, "readBool inconsistent record order");
    return 0;
  }

  m_nRecInd++;

  quint8 ival = m_pBinIn->tread<quint8>();

  return (ival)?true:false;
}

LString QdfInStream::readStr(const LString &name)
{
  const RecElem &elem = m_recdefs[m_nRecInd];
  if (!elem.first.equals(name)) {
    MB_THROW(qlib::FileFormatException, "readStr inconsistent record order");
    return LString();
  }

  LString rval;
  
  if (elem.second==QDF_TYPE_UTF8STR) {
    // variable length string
    rval = m_pBinIn->readStr();
  }
  else if (elem.second==QDF_TYPE_FIXSTR8 ||
           elem.second==QDF_TYPE_FIXSTR16 ||
           elem.second==QDF_TYPE_FIXSTR32) {
    // fixed length string
    const int nlen = elem.nmaxlen;
    std::vector<char> sbuf(nlen+1);
    sbuf[nlen] = '\0';
    m_pBinIn->read(&sbuf[0], 0, nlen);
    rval = LString(&sbuf[0]);
  }
  else {
    // error; unknown type
    MB_THROW(qlib::FileFormatException, "readStr inconsistent record order");
    return rval;
  }
  
  ++m_nRecInd;
  return rval;
}

void QdfInStream::readVec3D(const LString &name, qfloat32 *pvec)
{
  const RecElem &elem = m_recdefs[m_nRecInd];
  if (!elem.first.equals(name) || elem.second!=QDF_TYPE_VEC3) {
    MB_THROW(qlib::FileFormatException, "readVec3f inconsistent record order");
    return;
  }

  ++m_nRecInd;

  pvec[0] = m_pBinIn->readFloat32();
  pvec[1] = m_pBinIn->readFloat32();
  pvec[2] = m_pBinIn->readFloat32();
}

Vector4D QdfInStream::readVec3D(const LString &name)
{
  const RecElem &elem = m_recdefs[m_nRecInd];
  if (!elem.first.equals(name) || elem.second!=QDF_TYPE_VEC3) {
    MB_THROW(qlib::FileFormatException, "readVec3f inconsistent record order");
    return Vector4D();
  }

  ++m_nRecInd;
  Vector4D rval;
  rval.x() = m_pBinIn->readFloat32();
  rval.y() = m_pBinIn->readFloat32();
  rval.z() = m_pBinIn->readFloat32();

  return rval;
}

quint32 QdfInStream::readColorRGBA(const LString &name)
{
  const RecElem &elem = m_recdefs[m_nRecInd];
  if (!elem.first.equals(name) || elem.second!=QDF_TYPE_RGBA) {
    MB_THROW(qlib::FileFormatException, "readColorRGBA inconsistent record order");
    return 0;
  }

  ++m_nRecInd;

  quint8 ur = (quint8) m_pBinIn->readInt8();
  quint8 ug = (quint8) m_pBinIn->readInt8();
  quint8 ub = (quint8) m_pBinIn->readInt8();
  quint8 ua = (quint8) m_pBinIn->readInt8();

  return gfx::makeRGBACode(ur, ug, ub, ua);
}

void QdfInStream::readColorRGBA(const LString &name, qbyte *pvec)
{
  const RecElem &elem = m_recdefs[m_nRecInd];
  if (!elem.first.equals(name) || elem.second!=QDF_TYPE_RGBA) {
    MB_THROW(qlib::FileFormatException, "readColorRGBA inconsistent record order");
    return;
  }

  ++m_nRecInd;

  pvec[0] = (quint8) m_pBinIn->readInt8();
  pvec[1] = (quint8) m_pBinIn->readInt8();
  pvec[2] = (quint8) m_pBinIn->readInt8();
  pvec[3] = (quint8) m_pBinIn->readInt8();
}

//////////

void QdfInStream::readFxRecords(int nrec, void *pbuf, int nbufsz)
{
  int nrecsz = getFxRecordSize();

  int ntotal = nrecsz * nrec;
  MB_ASSERT(nbufsz>=ntotal);

  m_pBinIn->readFully((char *)pbuf, 0, ntotal);

  m_nRecInd = m_recdefs.size();
}

////////////////////////////////////////////////////////

QdfOutStream::~QdfOutStream()
{
  if (m_pZOut!=NULL)
    delete m_pZOut;
  if (m_pB64Out!=NULL)
    delete m_pB64Out;
}

// private
void QdfOutStream::setupStream()
{
  if (m_pB64Out!=NULL)
    delete m_pB64Out;
  if (m_pZOut!=NULL)
    delete m_pZOut;

  if (m_nVersion==0) {
    // QDF version 0 format
    // no encoding --> the same as QDF0 format
    // write QDF signature
    write("QDF0", 0, 4);
    // connection: Tout -> binout -> output (this)
    m_pOut = MB_NEW qlib::BinOutStream(*this);
    return;
  }
  
  //
  // QDF version >1 format
  //

  LString verstr = QdfDataType::createVerString(m_nVersion);
  
  // write QDF signature
  write(verstr.c_str(), 0, 4);

  // the first digit: base64 encoding flag
  char b64 = m_encStr[0];
  // the second digit: compression method ID
  char comp = m_encStr[1];

  // write encoding info
  write(m_encStr.c_str(), 0, 2);

  qlib::OutStream *pTOut = this;
    
  if (b64=='1') {
    m_pB64Out = MB_NEW qlib::Base64OutStream(*pTOut);
    pTOut = m_pB64Out;
  }

  if (comp=='0') {
  }
  else if (comp=='1') {
    m_pZOut = new qlib::GzipOutStream(*pTOut);
    pTOut = m_pZOut;
  }
#ifdef HAVE_LZMA_H
  //#ifdef HAVE_XZ
  else if (comp=='3') {
    m_pZOut = new qlib::XzOutStream(*pTOut);
    pTOut = m_pZOut;
  }
#endif
  else {
    MB_THROW(qlib::FileFormatException, "Unsupported compression method");
    return;
  }

  // connection: Tout -> (gzip) -> (base64) -> binout -> output (this)
  m_pOut = MB_NEW qlib::BinOutStream(*pTOut);
  return;
}

void QdfOutStream::start()
{
  setupStream();

  // write endian info
  m_pOut->writeInt8(m_pOut->getIntByteOrder());

  // write BOM
  m_pOut->writeInt32(12345678);

  // write endian info
  m_pOut->writeInt8(m_pOut->getFloatByteOrder());

  // write FBOM
  m_pOut->writeFloat32(1.2345678f);

  // write dummy data ??
  m_pOut->writeInt32(2);

  // // write file type string (any length)
  // m_pOut->writeStr(m_strFileType);
}

void QdfOutStream::writeFileType(const LString &type)
{
  m_pOut->writeStr(type);
}

void QdfOutStream::end()
{
  // connection roder: Tout -> (gzip) -> (base64) -> binout -> output

  // close compression stream (if exists)
  if (m_pZOut!=NULL) {
    m_pZOut->flush();
    m_pZOut->close();
    delete m_pZOut;
    m_pZOut = NULL;
  }

  // close Base64 stream (if exists)
  if (m_pB64Out!=NULL) {
    m_pB64Out->flush();
    m_pB64Out->close();
    delete m_pB64Out;
    m_pB64Out = NULL;
  }

  // close BinOutStream
  m_pOut->flush();
  //m_pOut->close();
  delete m_pOut;
  m_pOut = NULL;
}

void QdfOutStream::defData(const LString &name, int nrec)
{
  // write data name
  m_pOut->writeStr(name);

  // write record count in the data
  m_pOut->writeInt32(nrec);

  m_recdefs.clear();
  m_recmap.clear();
}
  
void QdfOutStream::defineRecord(const LString &name, int ntype)
{
  int nid = m_recdefs.size();
  m_recdefs.push_back(RecElem(name, ntype));
  m_recmap.set(name, nid);
}

void QdfOutStream::defFixedStr(const LString &name, int nmaxlen)
{
  int ntype;
  if (nmaxlen<=0xFF)
    ntype = QDF_TYPE_FIXSTR8;
  else if (nmaxlen<=0xFFFF)
    ntype = QDF_TYPE_FIXSTR16;
  else
    ntype = QDF_TYPE_FIXSTR32;

  int nid = m_recdefs.size();
  m_recdefs.push_back(RecElem(name, ntype, nmaxlen));
  m_recmap.set(name, nid);
}

void QdfOutStream::startData()
{
  int nreclen = m_recdefs.size();
  // write record size
  m_pOut->writeInt32(nreclen);

  BOOST_FOREACH (const RecElem &elem, m_recdefs) {
    m_pOut->writeStr(elem.first);
    m_pOut->writeInt8(elem.second);

    // extra-field for the fixed-length string mode
    if (elem.second==QDF_TYPE_FIXSTR8) {
      m_pOut->twrite<quint8>((quint8)(elem.nmaxlen));
    }
    else if (elem.second==QDF_TYPE_FIXSTR16) {
      m_pOut->twrite<quint16>((quint16)(elem.nmaxlen));
    }
    else if (elem.second==QDF_TYPE_FIXSTR32) {
      m_pOut->twrite<quint32>((quint32)(elem.nmaxlen));
    }
  }
}

void QdfOutStream::endData()
{
  m_recdefs.clear();
  m_recmap.clear();
}

void QdfOutStream::startRecord()
{
  m_nRecInd = 0;
}

void QdfOutStream::endRecord()
{
}

void QdfOutStream::writeStr(const LString &name, const LString &value)
{
  const RecElem &elem = m_recdefs[m_nRecInd];
  if (!elem.first.equals(name) || elem.second!=QDF_TYPE_UTF8STR) {
    MB_THROW(qlib::FileFormatException, "writeStr inconsistent record order");
    return;
  }

  m_pOut->writeStr(value);
  ++m_nRecInd;
}

void QdfOutStream::writeFixedStr(const LString &name, const LString &value)
{
  const RecElem &elem = m_recdefs[m_nRecInd];
  if (!elem.first.equals(name)) {
    LString msg = LString::format("writeFixStr(%s,%s) inconsistent record order", name.c_str(), value.c_str());
    MB_THROW(qlib::FileFormatException, msg);
    return;
  }

  int nmaxlen = elem.nmaxlen;
  int nlen = value.length();

  if (nlen>nmaxlen) {
    LString msg = LString::format("writeFixStr(%s,%s) strlen too long", name.c_str(), value.c_str());
    MB_THROW(qlib::FileFormatException, msg);
    return;
  }

  m_pOut->writeFixedStr(value, nmaxlen);
  ++m_nRecInd;
}

void QdfOutStream::writeInt32(const LString &name, int value)
{
  const RecElem &elem = m_recdefs[m_nRecInd];
  if (!elem.first.equals(name) || elem.second!=QDF_TYPE_INT32) {
    MB_THROW(qlib::FileFormatException, "writeInt inconsistent record order");
    return;
  }

  m_pOut->writeInt32(value);
  ++m_nRecInd;
}

void QdfOutStream::writeUInt32(const LString &name, quint32 value)
{
  const RecElem &elem = m_recdefs[m_nRecInd];
  if (!elem.first.equals(name) || elem.second!=QDF_TYPE_UINT32) {
    MB_THROW(qlib::FileFormatException, "writeInt inconsistent record order");
    return;
  }

  m_pOut->twrite(value);
  ++m_nRecInd;
}

void QdfOutStream::writeInt16(const LString &name, qint16 value)
{
  const RecElem &elem = m_recdefs[m_nRecInd];
  if (!elem.first.equals(name) || elem.second!=QDF_TYPE_INT16) {
    MB_THROW(qlib::FileFormatException, "writeInt8 inconsistent record order");
    return;
  }

  m_pOut->writeInt16(value);
  ++m_nRecInd;
}

void QdfOutStream::writeInt8(const LString &name, qint8 value)
{
  const RecElem &elem = m_recdefs[m_nRecInd];
  if (!elem.first.equals(name) || elem.second!=QDF_TYPE_INT8) {
    MB_THROW(qlib::FileFormatException, "writeInt8 inconsistent record order");
    return;
  }

  m_pOut->writeInt8(value);
  ++m_nRecInd;
}

void QdfOutStream::writeUInt8(const LString &name, quint8 value)
{
  const RecElem &elem = m_recdefs[m_nRecInd];
  if (!elem.first.equals(name) || elem.second!=QDF_TYPE_UINT8) {
    MB_THROW(qlib::FileFormatException, "writeInt8 inconsistent record order");
    return;
  }

  m_pOut->twrite(value);
  ++m_nRecInd;
}

void QdfOutStream::writeBool(const LString &name, bool value)
{
  const RecElem &elem = m_recdefs[m_nRecInd];
  if (!elem.first.equals(name) || elem.second!=QDF_TYPE_BOOL) {
    MB_THROW(qlib::FileFormatException, "writeBool inconsistent record order");
    return;
  }

  quint8 ivalue = value?1U:0U;
  m_pOut->twrite(ivalue);
  ++m_nRecInd;
}

void QdfOutStream::writeFloat32(const LString &name, qfloat32 value)
{
  const RecElem &elem = m_recdefs[m_nRecInd];
  if (!elem.first.equals(name) || elem.second!=QDF_TYPE_FLOAT32) {
    MB_THROW(qlib::FileFormatException, "writeFloat32 inconsistent record order");
    return;
  }

  m_pOut->twrite(value);
  ++m_nRecInd;
}

void QdfOutStream::writeVec3D(const LString &name, const qlib::Vector4D &vec)
{
  const RecElem &elem = m_recdefs[m_nRecInd];
  if (!elem.first.equals(name) || elem.second!=QDF_TYPE_VEC3) {
    MB_THROW(qlib::FileFormatException, "writeVec3D inconsistent record order");
    return;
  }

  m_pOut->twrite(qfloat32(vec.x()));
  m_pOut->twrite(qfloat32(vec.y()));
  m_pOut->twrite(qfloat32(vec.z()));

  ++m_nRecInd;
}

void QdfOutStream::writeVec3D(const LString &name, const qfloat32 *pvec)
{
  const RecElem &elem = m_recdefs[m_nRecInd];
  if (!elem.first.equals(name) || elem.second!=QDF_TYPE_VEC3) {
    MB_THROW(qlib::FileFormatException, "writeVec3D inconsistent record order");
    return;
  }

  m_pOut->writeFloat32(pvec[0]);
  m_pOut->writeFloat32(pvec[1]);
  m_pOut->writeFloat32(pvec[2]);

  ++m_nRecInd;
}

void QdfOutStream::writeColorRGBA(const LString &name, quint32 ccode)
{
  const RecElem &elem = m_recdefs[m_nRecInd];
  if (!elem.first.equals(name) || elem.second!=QDF_TYPE_RGBA) {
    MB_THROW(qlib::FileFormatException, "writeColorRGBA inconsistent record order");
    return;
  }

  m_pOut->writeInt8(qint8( gfx::getRCode(ccode) ));
  m_pOut->writeInt8(qint8( gfx::getGCode(ccode) ));
  m_pOut->writeInt8(qint8( gfx::getBCode(ccode) ));
  m_pOut->writeInt8(qint8( gfx::getACode(ccode) ));
  ++m_nRecInd;
}

void QdfOutStream::writeColorRGBA(const LString &name, const qbyte *pvec)
{
  const RecElem &elem = m_recdefs[m_nRecInd];
  if (!elem.first.equals(name) || elem.second!=QDF_TYPE_RGBA) {
    MB_THROW(qlib::FileFormatException, "writeColorRGBA inconsistent record order");
    return;
  }

  m_pOut->writeInt8(qint8( pvec[0] ));
  m_pOut->writeInt8(qint8( pvec[1] ));
  m_pOut->writeInt8(qint8( pvec[2] ));
  m_pOut->writeInt8(qint8( pvec[3] ));
  ++m_nRecInd;
}

