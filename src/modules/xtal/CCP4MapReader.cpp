// -*-Mode: C++;-*-
//
// CCP4 Map file reader
//
// $Id: CCP4MapReader.cpp,v 1.5 2010/09/11 17:54:46 rishitani Exp $

#include <common.h>

#include "CCP4MapReader.hpp"
#include "CCP4InStream.hpp"
#include "DensityMap.hpp"
#include "MapKindDetect.hpp"

#include <qlib/StringStream.hpp>
#include <qlib/ClassRegistry.hpp>
#include <qlib/LClassUtils.hpp>

using namespace xtal;
using qlib::StrInStream;

// MC_DYNCLASS_IMPL(CCP4MapReader, CCP4MapReader, qlib::LSpecificClass<CCP4MapReader>);

// default constructor
CCP4MapReader::CCP4MapReader()
{
  m_bNormalize = false;

  m_bTruncMin = false;
  m_dMin = 0.0;
  
  //m_bTruncMax = true;
  m_bTruncMax = false;
  m_dMax = 5.0;
}

// destructor
CCP4MapReader::~CCP4MapReader()
{
}

///////////////////////////////////////////

/// create default object for this reader
qsys::ObjectPtr CCP4MapReader::createDefaultObj() const
{
  return qsys::ObjectPtr(new DensityMap());
  //return new DensityMap();
}

/// get nickname for scripting
const char *CCP4MapReader::getName() const
{
  return "ccp4map";
}

/// get file-type description
const char *CCP4MapReader::getTypeDescr() const
{
  return "CCP4 Density Map(*.map;*.ccp4;*.mrc;*.ccp4.gz)";
}

/// get file extension
const char *CCP4MapReader::getFileExt() const
{
  // return "*.map; *.ccp4";
  return "*.map; *.ccp4; *.mrc; *.ccp4.gz";
}

/// Content-sniff: read the first 212 bytes and check for the "MAP "
/// literal at byte offset 208 (52*4 = 208 bytes of header precede it).
/// Short reads (cap hit upstream, or file shorter than 212 bytes)
/// return UNKNOWN. Non-CCP4 inputs simply fail the byte-208 check and
/// return UNKNOWN, so no explicit text fast-reject is needed.
int CCP4MapReader::canHandleContent(qlib::InStream &ins) const
{
  char buf[212];
  int total = 0;
  while (total < 212) {
    int n = ins.read(buf, total, 212 - total);
    if (n <= 0) break;
    total += n;
  }

  if (total < 212) return CONTENT_UNKNOWN;

  if (buf[208] == 'M' && buf[209] == 'A' &&
      buf[210] == 'P' && buf[211] == ' ') {
    return CONTENT_YES;
  }

  return CONTENT_UNKNOWN;
}

///////////////////////////////////////////

// read CCP4 format map file from stream
bool CCP4MapReader::read(qlib::InStream &arg)
{
  // get the target object (DensityMap)
  DensityMap *pMap = NULL;
  pMap = getTarget<DensityMap>();
  if (pMap==NULL) return false;

  // create filter stream
  CCP4InStream in(arg);

  // read header
  const int HDR_SIZE = 52*4;
  char header[HDR_SIZE];
  in.readFully(header, 0, HDR_SIZE);

  ////////////////////////////////////////////
  // check map's file type

  char sbuf[256];

  // check file format marker
  in.readFully(sbuf, 0, 4);
  sbuf[4] = '\0';
  if (!qlib::LChar::equals(sbuf, "MAP ")) {
    MB_THROW(qlib::FileFormatException, "Invalid file format");
    return false;
  }

  in.readFully(sbuf, 0, 4);

  qint32 *pi = (qint32*)(header);
  qfloat32 *pf = (qfloat32*)(header);

  // check byte order
  int iType, fType;
  fType = iType = CCP4InStream::m_intNativeType;
  {
    int nc = pi[0];
    int nr = pi[1];
    int ns = pi[2];
    if (nc>0x10000||nr>0x10000||ns>0x10000) {
      qlib::LByteSwapper<int>::swap(nc);
      qlib::LByteSwapper<int>::swap(nr);
      qlib::LByteSwapper<int>::swap(ns);
      if (nc>0x10000||nr>0x10000||ns>0x10000) {
        fType = iType = CCP4InStream::m_intNativeType;
      }
      else {
        if (CCP4InStream::m_intNativeType==CCP4InStream::BO_LE)
          fType = iType = CCP4InStream::BO_BE;
        else
          fType = iType = CCP4InStream::BO_LE;
      }
    }
  }

  //int iType = (sbuf[1]>>4) & 0x0F;
  //int fType = (sbuf[0]>>4) & 0x0F;
  in.setFileByteOrder(iType, fType);

  ////////////////////////////////////////////
  // read map file params

  // read deviation of map density
  float rhosig;
  in.fetch_float(rhosig);

  StrInStream xx_hdrin(header, HDR_SIZE);
  CCP4InStream hdrin(xx_hdrin);
  hdrin.setFileByteOrder(iType, fType);

  int nmode;
  int ncol, nrow, nsect;
  int stacol, starow, stasect;
  int nx, ny, nz;
  float alen,blen,clen,alpha,beta,gamma;
  int nspgrp, nsymbt;
  int axcol, axrow, axsect;
  float rhomin, rhomax, rhomean;
  char exttyp[5];
  int nversion;
  float origin[3];
  {
    // read number of (col,row,sec)
    hdrin.fetch_int(ncol);
    hdrin.fetch_int(nrow);
    hdrin.fetch_int(nsect);

    hdrin.fetch_int(nmode);
    /*if (nmode!=2) {
      LString msg = LString::format("CCP4MapReader read: unsupported mode %d\n",nmode);
      LOG_DPRINTLN(msg);
      MB_THROW(qlib::FileFormatException, msg);
      return false;
    }*/

    // read starting number of (col,row,sec)
    hdrin.fetch_int(stacol);
    hdrin.fetch_int(starow);
    hdrin.fetch_int(stasect);

    // read interval number along (x,y,z)
    hdrin.fetch_int(nx);
    hdrin.fetch_int(ny);
    hdrin.fetch_int(nz);

    // read cell dimension
    hdrin.fetch_float(alen);
    hdrin.fetch_float(blen);
    hdrin.fetch_float(clen);
    hdrin.fetch_float(alpha);
    hdrin.fetch_float(beta);
    hdrin.fetch_float(gamma);

    // read which axis corresponds to (col,row,sect)
    hdrin.fetch_int(axcol);
    hdrin.fetch_int(axrow);
    hdrin.fetch_int(axsect);

    // read statistics of density
    hdrin.fetch_float(rhomin);
    hdrin.fetch_float(rhomax);
    hdrin.fetch_float(rhomean);

    // sg info
    hdrin.fetch_int(nspgrp);
    hdrin.fetch_int(nsymbt);

    // words 25-26: extra
    hdrin.skip(8);

    // words 27-28: EXTTYP / NVERSION (MRC2014; zero in older files)
    hdrin.readFully(exttyp, 0, 4);
    exttyp[4] = '\0';
    hdrin.fetch_int(nversion);

    // words 29-38: extra
    hdrin.skip(40);
  }

  bool bSigned = false;
  {
    // words 39-40: IMOD stamp / flags
    int imodStamp, imodFlags;
    hdrin.fetch_int(imodStamp);
    hdrin.fetch_int(imodFlags);
    if (imodStamp==1146047817) {
      LOG_DPRINTLN("CCP4Map> imodStamp==1146047817 (use imodFlags)");
      bSigned = imodFlags&0x01;
    }

    // words 41-49: extra
    hdrin.skip(36);

    // words 50-52: ORIGIN (MRC2000/2014; zero or unused in CCP4 files)
    hdrin.fetch_float(origin[0]);
    hdrin.fetch_float(origin[1]);
    hdrin.fetch_float(origin[2]);
  }

  LOG_DPRINT("CCP4Map> Header Info:\n");
  LOG_DPRINT("  map size  : (%d,%d,%d)\n", ncol, nrow, nsect);
  LOG_DPRINT("  map start : (%d,%d,%d)\n", stacol, starow, stasect);
  LOG_DPRINT("  map axis order : (%d,%d,%d)\n", axcol, axrow, axsect);
  LOG_DPRINT("  unit cell a=%.2fA, b=%.2fA, c=%.2fA,\n", alen, blen, clen);
  LOG_DPRINT("    alpha=%.2fdeg, beta=%.2fdeg, gamma=%.2fdeg,\n",
	    alpha, beta, gamma);
  LOG_DPRINT("  SG number  : %d\n", nspgrp);
  LOG_DPRINT("  map minimum density  : %f\n", rhomin);
  LOG_DPRINT("  map maximum density  : %f\n", rhomax);
  LOG_DPRINT("  map mean density     : %f\n", rhomean);
  LOG_DPRINT("  map density r.m.s.d. : %f\n", rhosig);
  LOG_DPRINT("  exttyp/nversion : %s / %d\n", exttyp, nversion);
  LOG_DPRINT("  origin : (%f,%f,%f)\n", origin[0], origin[1], origin[2]);

  //////////////////////////////////////
  // word 56: NLABL, words 57-256: labels (10 x 80 chars)

  int nlabl = 0;
  in.fetch_int(nlabl);
  char labels[800];
  in.readFully(labels, 0, 800);

  // skip the symmetry records
  in.skip(nsymbt);

  //////////////////////////////////////
  // Map kind (crystallographic / cryo-EM) and origin

  {
    MrcHeaderInfo hinfo;
    hinfo.nc = ncol;
    hinfo.nr = nrow;
    hinfo.ns = nsect;
    hinfo.ncstart = stacol;
    hinfo.nrstart = starow;
    hinfo.nsstart = stasect;
    hinfo.nx = nx;
    hinfo.ny = ny;
    hinfo.nz = nz;
    hinfo.alpha = alpha;
    hinfo.beta = beta;
    hinfo.gamma = gamma;
    hinfo.ispg = nspgrp;
    hinfo.nversion = nversion;
    hinfo.exttyp = exttyp;
    hinfo.hasOrigin = mrcOriginIsValid(origin);
    for (int i=0; i<3; ++i)
      hinfo.origin[i] = origin[i];
    if (nlabl<0) nlabl = 0;
    if (nlabl>10) nlabl = 10;
    for (int i=0; i<nlabl; ++i)
      hinfo.labels.push_back(LString(labels + i*80, 80));

    const int nkind = detectMapKind(hinfo);
    pMap->setDetectedMapType(nkind);
    LOG_DPRINTLN("CCP4Map> map kind: %s",
                 (nkind==MAPKIND_EM) ? "cryo-EM" : "crystallographic");

    if (hinfo.hasOrigin) {
      // A non-zero ORIGIN places grid index (0,0,0) in absolute
      // coordinates; the start indices are then not used (ChimeraX
      // convention), so both being set is reported.
      pMap->setOrigin(qlib::Vector4D(origin[0], origin[1], origin[2]));
      if (stacol!=0 || starow!=0 || stasect!=0) {
        LOG_DPRINTLN("CCP4Map> both ORIGIN and NxSTART are non-zero; "
                     "ORIGIN takes precedence");
        stacol = starow = stasect = 0;
      }
    }
  }

  // read float density map
  const size_t ntotal = size_t(ncol)*size_t(nrow)*size_t(nsect);

  if (nmode==MRC_TYPE_FLOAT) {
    float *fbuf = MB_NEW float[ntotal];
    LOG_DPRINT("memory allocation %.1f MB\n", double(ntotal)*sizeof (float)/(1024.0*1024.0));
    if (fbuf==NULL) {
      MB_THROW(qlib::OutOfMemoryException, "CCP4MapReader read: cannot allocate memory");
      return false;
    }

    in.fetch_floatArray(fbuf, ntotal);

    if (m_bTruncMin) {
      LOG_DPRINTLN("CCP4Map> Truncate map lower than: %f sigma", m_dMin);
      for (size_t i=0; i<ntotal; ++i)
        fbuf[i] = qlib::max(fbuf[i], float(m_dMin * rhosig));
    }

    if (m_bTruncMax) {
      LOG_DPRINTLN("CCP4Map> Truncate map higher than: %f sigma", m_dMax);
      for (size_t i=0; i<ntotal; ++i)
        fbuf[i] = qlib::min(fbuf[i], float(m_dMax * rhosig));
    }

    if (m_bNormalize) {
      LOG_DPRINTLN("CCP4Map> Normalizing map by sig=%f, mean=%f", rhosig, rhomean);
      for (size_t i=0; i<ntotal; ++i) {
        double v = fbuf[i];
        v = (v - rhomean)/rhosig;
        fbuf[i] = float(v);
      }
    }

    // copy fbuf array to the IfDenMap object.
    //  This method also performs axis rotation.
    pMap->setMapFloatArray(fbuf, ncol, nrow, nsect,
                           axcol-1, axrow-1, axsect-1);

    delete [] fbuf;
  }
  else if (nmode==MRC_TYPE_BYTE) {
    quint8 *buf = MB_NEW quint8[ntotal];
    LOG_DPRINT("memory allocation %.1f MB\n", double(ntotal)/(1024.0*1024.0));
    if (buf==NULL) {
      MB_THROW(qlib::OutOfMemoryException, "CCP4MapReader read: cannot allocate memory");
      return false;
    }

    in.fetch_byteArray(buf, ntotal);

    double sum = 0.0;
    double fmin = 1.0e10;
    double fmax = -1.0e10;
    for (size_t i=0; i<ntotal; ++i){
      double val = double(buf[i]);
      sum += val;
      fmin = qlib::min(fmin, val);
      fmax = qlib::max(fmax, val);
    }
    double aver = sum/double(ntotal);
    sum = 0.0;
    for (size_t i=0; i<ntotal; ++i){
      double val = double(buf[i]);
      sum += (val-aver)*(val-aver);
    }
    double rmsd = sqrt(sum/double(ntotal));

    /*
    if (m_bTruncMin) {
      LOG_DPRINTLN("Truncate map lower than: %f sigma", m_dMin);
      for (size_t i=0; i<ntotal; ++i)
        fbuf[i] = qlib::max(fbuf[i], float(m_dMin * rhosig));
    }

    if (m_bTruncMax) {
      LOG_DPRINTLN("Truncate map higher than: %f sigma", m_dMax);
      for (size_t i=0; i<ntotal; ++i)
        fbuf[i] = qlib::min(fbuf[i], float(m_dMax * rhosig));
    }

    if (m_bNormalize) {
      LOG_DPRINTLN("Normalize map");
      for (size_t i=0; i<ntotal; ++i) {
        double v = fbuf[i];
        v = (v - rhomean)/rhosig;
        fbuf[i] = float(v);
      }
    }
     */

    pMap->setMapByteArray(buf, ncol, nrow, nsect,
                          fmin, fmax, aver, 0.5*(fmax-fmin)/256.0);
                          //0, 255.0, aver, 1.0/256.0);

    delete [] buf;
  }

  // rotate start index numbers
  rotate(stacol, starow, stasect, axcol-1, axrow-1, axsect-1);

  pMap->setMapParams(stacol, starow, stasect, nx, ny, nz);

  // setup crystal parameters
  pMap->setXtalParams(alen, blen, clen, alpha, beta, gamma, nspgrp);

  // pMap->setOrigFileType("ccp4map");

  return true;
}


