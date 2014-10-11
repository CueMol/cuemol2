// -*-Mode: C++;-*-
//
// OpenDX (APBS) potential map file reader
//
// $Id: OpenDXPotReader.cpp,v 1.2 2010/03/14 03:20:47 rishitani Exp $

#include <common.h>

#include <qlib/LineStream.hpp>
#include <qlib/LRegExpr.hpp>
#include <qlib/Vector4D.hpp>
#include "OpenDXPotReader.hpp"
#include "ElePotMap.hpp"

using namespace surface;

// default constructor
OpenDXPotReader::OpenDXPotReader()
     : m_pMap(NULL)
{
}

// destructor
OpenDXPotReader::~OpenDXPotReader()
{
}

///////////////////////////////////////////

qsys::ObjectPtr OpenDXPotReader::createDefaultObj() const
{
  return qsys::ObjectPtr(new ElePotMap());
}

/// get file-type description
const char *OpenDXPotReader::getTypeDescr() const
{
  return "APBS Potential Map(*.dx)";
}

/// get file extension
const char *OpenDXPotReader::getFileExt() const
{
  return "*.dx";
}

/// get nickname for scripting
const char *OpenDXPotReader::getName() const
{
  return "apbs";
}

///////////////////////////////////////////

void OpenDXPotReader::readRecord(qlib::LineStream &ins)
{
  if (!ins.ready()) {
    MB_THROW(qlib::FileFormatException, "Invalid map format");
  }
  else {
    m_recbuf = ins.readLine();
    m_recbuf = m_recbuf.trim("\r\n\t ");
  }
}

void OpenDXPotReader::readHeader(qlib::LineStream &ins)
{
  // skip the header remarks
  int nok=0;

  qlib::LRegExpr re_origin, re_object, re_delta;
  re_object.setPattern("object 1 class gridpositions counts\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)");
  re_origin.setPattern("origin\\s+([e\\d\\.\\-\\+]+)\\s+([e\\d\\.\\-\\+]+)\\s+([e\\d\\.\\-\\+]+)");
  re_delta.setPattern("delta\\s+([e\\d\\.\\-\\+]+)\\s+([e\\d\\.\\-\\+]+)\\s+([e\\d\\.\\-\\+]+)");

  while (nok<7) {
    readRecord(ins);

    if (m_recbuf.startsWith("#")) {
      // comment
      continue;
    }

    if (m_recbuf.startsWith("object 2")) {
      ++nok;
      continue;
    }

    if (m_recbuf.startsWith("object 3")) {
      ++nok;
      continue;
    }

    if (re_object.match(m_recbuf)) {
      LString snx = re_object.getSubstr(1);
      LString sny = re_object.getSubstr(2);
      LString snz = re_object.getSubstr(3);
      if (!snx.toInt(&m_nx)) {
        MB_THROW(qlib::FileFormatException, "Invalid map format: "+m_recbuf);
        return;
      }
      if (!sny.toInt(&m_ny)) {
        MB_THROW(qlib::FileFormatException, "Invalid map format: "+m_recbuf);
        return;
      }
      if (!snz.toInt(&m_nz)) {
        MB_THROW(qlib::FileFormatException, "Invalid map format: "+m_recbuf);
        return;
      }
      ++nok;
      continue;
    }
    else if (re_origin.match(m_recbuf)) {
      LString snx = re_origin.getSubstr(1);
      LString sny = re_origin.getSubstr(2);
      LString snz = re_origin.getSubstr(3);
      if (!snx.toDouble(&m_xmin)) {
        MB_THROW(qlib::FileFormatException, "Invalid map format: "+m_recbuf);
        return;
      }
      if (!sny.toDouble(&m_ymin)) {
        MB_THROW(qlib::FileFormatException, "Invalid map format: "+m_recbuf);
        return;
      }
      if (!snz.toDouble(&m_zmin)) {
        MB_THROW(qlib::FileFormatException, "Invalid map format: "+m_recbuf);
        return;
      }
      ++nok;
      continue;
    }
    else if (re_delta.match(m_recbuf)) {
      LString snx = re_delta.getSubstr(1);
      LString sny = re_delta.getSubstr(2);
      LString snz = re_delta.getSubstr(3);

      double x,y,z;
      if (!snx.toDouble(&x)) {
        MB_THROW(qlib::FileFormatException, "Invalid map format: "+m_recbuf);
        return;
      }
      if (!sny.toDouble(&y)) {
        MB_THROW(qlib::FileFormatException, "Invalid map format: "+m_recbuf);
        return;
      }
      if (!snz.toDouble(&z)) {
        MB_THROW(qlib::FileFormatException, "Invalid map format: "+m_recbuf);
        return;
      }

      if (qlib::isNear(y, 0.0) && qlib::isNear(z, 0.0)) {
        m_hx = x;
        ++nok;
        continue;
      }
      if (qlib::isNear(x, 0.0) && qlib::isNear(z, 0.0)) {
        m_hy = y;
        ++nok;
        continue;
      }
      if (qlib::isNear(x, 0.0) && qlib::isNear(y, 0.0)) {
        m_hz = z;
        ++nok;
        continue;
      }
      MB_THROW(qlib::FileFormatException, "Invalid map format: "+m_recbuf);
      return;
    }
  }

  m_navail = 0;
}

void OpenDXPotReader::readDensity(qlib::LineStream &ins, double &rho)
{
  if (m_navail<=0) {
    // fill the float buffer
    std::list<LString> ls;
    readRecord(ins);
    int ns = m_recbuf.split(' ', ls);
    //MB_ASSERT(ns<=RECORD_LEN);
    std::list<LString>::const_iterator iter = ls.begin();
    int i;
    for (i=0; i<RECORD_LEN && iter!=ls.end(); ++i, ++iter) {
      if (!iter->toDouble(&m_frec[i])) {
        MB_THROW(qlib::FileFormatException, "Invalid map format: "+m_recbuf);
        return;
      }
    }
    m_navail = i;
  }

  if (m_navail<=0) {
    MB_THROW(qlib::FileFormatException, "Invalid map format: "+m_recbuf);
    return;
  }

  rho = m_frec[RECORD_LEN-m_navail];
  --m_navail;
}

///////////////////////////////////////////

// read Phi format map file from stream
bool OpenDXPotReader::read(qlib::InStream &arg)
{
  m_pMap = getTarget<ElePotMap>();

  qlib::LineStream ins(arg);

  readHeader(ins);

  LOG_DPRINT("OpenDX PotFile read...\n");
  LOG_DPRINT("  map size : (%d, %d, %d)\n", m_nx, m_ny, m_nz);
  LOG_DPRINT("  map spacing: (%f, %f, %f)\n", m_hx, m_hy, m_hz);
  LOG_DPRINT("  map minpos: (%f, %f, %f)\n", m_xmin, m_ymin, m_zmin);

  //
  //  allocate memory
  //
  float *fbuf;
  int ntotal = m_nx*m_ny*m_nz;
  fbuf = MB_NEW float[ntotal];
  LOG_DPRINT("memory allocation %d bytes\n", ntotal*4);
  if (fbuf==NULL) {
    MB_THROW(qlib::OutOfMemoryException, "OpenDX PotFile read: cannot allocate memory");
    return false;
  }

  //int ii=0;
  for (int ix=0; ix<m_nx; ix++) {
    for (int iy=0; iy<m_ny; iy++) {
      for (int iz=0; iz<m_nz; iz++) {
        double rho;
        const int ii = ix + (iy + iz*m_ny)*m_nx;
        //const int ii = iz + (iy + ix*m_ny)*m_nx;
        readDensity(ins, rho);
        fbuf[ii] = (float)rho;
      }
    }
  }
  
  readRecord(ins);
  if (!m_recbuf.startsWith("attribute")) {
    LOG_DPRINTLN("invalid: %s", m_recbuf.c_str());
  }

  qlib::Vector4D orig(m_xmin, m_ymin, m_zmin);
  LOG_DPRINTLN("OpenDXPotReader> Map origin: (%f, %f, %f)", orig.x(), orig.y(), orig.z());
  const double scale = 1.0/m_hx;

  m_pMap->setMapFloatArray(fbuf, m_nx, m_ny, m_nz,
                           m_hx, m_hy, m_hz, orig);

  if (m_dSmooth>0.0) {
    LOG_DPRINTLN("OpenDXPotReader> BoxSmoothing %f...", m_dSmooth);
    m_pMap->smooth2(m_dSmooth);
  }

  return true;
}

