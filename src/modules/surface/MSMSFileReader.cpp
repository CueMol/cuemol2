// -*-Mode: C++;-*-
//
// MSMS surface data reader
//
// $Id: MSMSFileReader.cpp,v 1.2 2010/03/14 05:17:19 rishitani Exp $
//

#include <common.h>

#include "MSMSFileReader.hpp"
#include "MolSurfObj.hpp"
#include <qlib/FileStream.hpp>
#include <qsys/Scene.hpp>

using namespace surface;

MSMSFileReader::MSMSFileReader()
     : m_pSurf(NULL)
{
}

MSMSFileReader::~MSMSFileReader()
{
}

const char *MSMSFileReader::getName() const
{
  return "msms";
}

const char *MSMSFileReader::getTypeDescr() const
{
  return "MSMS surface file (*.face/vert)";
}

const char *MSMSFileReader::getFileExt() const
{
  return "*.face";
}

qsys::ObjectPtr MSMSFileReader::createDefaultObj() const
{
  return qsys::ObjectPtr(new MolSurfObj());
}

void MSMSFileReader::attach(qsys::ObjectPtr pObj)
{
  super_t::attach(pObj);
  m_pSurf = getTarget<MolSurfObj>();
}

qsys::ObjectPtr MSMSFileReader::detach()
{
  m_pSurf = NULL;
  return super_t::detach();
}

/////////

bool MSMSFileReader::read(qlib::InStream &ins)
{
  LString vertname;
  qsys::ScenePtr pScene = m_pSurf->getScene();

  LString vn = getPath("vert");
  if (!vn.isEmpty()) {
    if (qlib::isFileReadable(vn))
      vertname = vn;
    else if (!pScene.isnull()) {
      // resolve BasePath
      vn = pScene->resolveBasePath(vn);
      if (qlib::isFileReadable(vn))
        vertname = vn;
    }
  }

  if (vertname.isEmpty()) {
    if (!m_vertFileName.isEmpty()) {
      // resolve BasePath
      if (!pScene.isnull()) {
        vertname = pScene->resolveBasePath(m_vertFileName);
      }
      else {
        vertname = m_vertFileName;
      }
    }
  }
  
  if (vertname.isEmpty()) {
    LString msg = "FATAL Error: Cannot determine the vertex file name.";
    LOG_DPRINTLN("MSMSRead> %s", msg.c_str());
    MB_THROW(qlib::IllegalArgumentException, msg);
    return false;
  }
  
  {
    qlib::FileInStream fis_vert;
    fis_vert.open(vertname);
    qlib::LineStream lis_vert(fis_vert);
    readVert(lis_vert);
    
    // the stream ins reads from the face file.
    qlib::LineStream lis_face(ins);
    readFace(lis_face);
  }
  
  // update vert file path name
  setPath("vert", vertname);

  return true;
}

/////////////////////////////////////////////

// read MSMS-vertex file from stream
bool MSMSFileReader::readVert(qlib::LineStream &ins)
{
  MB_ASSERT(m_pSurf!=NULL);

  // read header line
  readRecord(ins);
  readRecord(ins);

  // read info header
  readRecord(ins);

  LString sbuf;
  sbuf = readStr(1,7).trim();
  int ibuf;
  if (!sbuf.toInt(&ibuf)){
    LString msg = LString::format("MSMSRead> FATAL Error: invalid vertex file header line at %d.", m_lineno);
    LOG_DPRINTLN(msg);
    MB_THROW(qlib::FileFormatException, msg);
    return false;
  }
  if (!m_pSurf->setVertSize(ibuf)) {
    LString msg = LString::format("MSMSRead> FATAL Error: set vertex size %d failed.", ibuf);
    LOG_DPRINTLN(msg);
    MB_THROW(qlib::FileFormatException, msg);
    return false;
  }

  int i;
  for ( i=0; ; i++ ) {
    if (!readRecord(ins))
      break; // reached to the EOF

    if (i>=m_pSurf->getVertSize()) {
      LString msg("MSMSRead> FATAL Error: vertex file contains too many lines.");
      LOG_DPRINTLN(msg);
      MB_THROW(qlib::FileFormatException, msg);
      return false;
    }

    Vector4D v, n;
    bool flag = false;
    for ( ;; ) {
      sbuf = readStr(1,9);
      if (!sbuf.toDouble(&v.x()))
        break;
      
      sbuf = readStr(10,19);
      if (!sbuf.toDouble(&v.y()))
        break;
      
      sbuf = readStr(20,29);
      if (!sbuf.toDouble(&v.z()))
        break;
      
      sbuf = readStr(30,39);
      if (!sbuf.toDouble(&n.x()))
        break;
      
      sbuf = readStr(40,49);
      if (!sbuf.toDouble(&n.y()))
        break;
      
      sbuf = readStr(50,59);
      if (!sbuf.toDouble(&n.z()))
        break;

      flag = true;
      break;
    }
    if (!flag) {
      LOG_DPRINTLN("MSMSRead> %s", m_recbuf.c_str());
      LString msg = LString::format("MSMSRead> FATAL Error: invalid vertex file line at %d.", ibuf);
      LOG_DPRINTLN(msg);
      MB_THROW(qlib::FileFormatException, msg);
      return false;
    }
    m_pSurf->setVertex(i, v, n);
  }

  if (i<m_pSurf->getVertSize()) {
    LString msg("MSMSRead> FATAL Error: vertex file is too short.");
    LOG_DPRINTLN(msg);
    MB_THROW(qlib::FileFormatException, msg);
    return false;
  }
  
  // notify modification
  // m_pSurf->fireObjChanged();
  MB_DPRINTLN("MSMSRead> read vertex %d OK.", i);
  return true;
}

bool MSMSFileReader::readFace(qlib::LineStream &ins)
{
  MB_ASSERT(m_pSurf!=NULL);

  // skip header line
  readRecord(ins);
  readRecord(ins);

  // read info header
  readRecord(ins);

  LString sbuf;
  sbuf = readStr(1,8).trim();
  int ibuf;
  if (!sbuf.toInt(&ibuf)){
    LString msg("MSMSRead> FATAL Error: invalid face file header line.");
    LOG_DPRINTLN("MSMSRead> %s", m_recbuf.c_str());
    LOG_DPRINTLN(msg);
    MB_THROW(qlib::FileFormatException, msg);
    return false;
  }
  if (!m_pSurf->setFaceSize(ibuf)) {
    LString msg = LString::format("MSMSRead> FATAL Error: set face size %d failed.", ibuf);
    LOG_DPRINTLN(msg);
    MB_THROW(qlib::FileFormatException, msg);
    return false;
  }

  int i;
  for ( i=0; ; i++ ) {
    if (!readRecord(ins))
      break; // reached to the EOF

    if (i>=m_pSurf->getFaceSize()) {
      LString msg("MSMSRead> FATAL Error: face file contains too many lines.");
      LOG_DPRINTLN(msg);
      MB_THROW(qlib::FileFormatException, msg);
      return false;
    }

    int id1, id2, id3;
    bool flag = false;
    for ( ;; ) {
      sbuf = readStr(1,6);
      if (!sbuf.toInt(&id1))
        break;
      
      sbuf = readStr(7,13);
      if (!sbuf.toInt(&id2))
        break;
      
      sbuf = readStr(14,20);
      if (!sbuf.toInt(&id3))
        break;
      
      flag = true;
      break;
    }
    if (!flag) {
      LOG_DPRINTLN("MSMSRead> %s", m_recbuf.c_str());
      LString msg = LString::format("MSMSRead> FATAL Error: invalid face file line at %d.", m_lineno);
      LOG_DPRINTLN(msg);
      MB_THROW(qlib::FileFormatException, msg);
      return false;
    }
    m_pSurf->setFace(i, id1-1, id2-1, id3-1);
  }

  if (i<m_pSurf->getFaceSize()) {
    LString msg("MSMSRead> FATAL Error: face file is too short.");
    LOG_DPRINTLN(msg);
    MB_THROW(qlib::FileFormatException, msg);
    return false;
  }
  
  // notify modification
  // m_pSurf->fireObjChanged();
  MB_DPRINTLN("MSMSRead> read face %d OK.", i);
  return true;

}

