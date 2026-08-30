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
#include <qlib/FileStream.hpp>
#include <qlib/GzipStream.hpp>
#include <qlib/ChunkedArray3D.hpp>

#include <cmath>
#include <cstring>
#include <functional>
#include <memory>
#include <vector>

using namespace xtal;
using qlib::StrInStream;

namespace {

  /// MRC data modes handled by the section decoder
  enum {
    MODE_INT8 = 0,
    MODE_INT16 = 1,
    MODE_FLOAT32 = 2,
    MODE_UINT16 = 6,
    MODE_FLOAT16 = 12,
  };

  int mrcElemSize(int nmode)
  {
    switch (nmode) {
    case MODE_INT8: return 1;
    case MODE_INT16: return 2;
    case MODE_UINT16: return 2;
    case MODE_FLOAT32: return 4;
    case MODE_FLOAT16: return 2;
    default: return 0;
    }
  }

  /// IEEE half -> float (handles subnormals, inf and nan)
  inline float halfToFloat(quint16 h)
  {
    const quint32 sign = (quint32(h) & 0x8000u) << 16;
    const quint32 expo = (h >> 10) & 0x1f;
    quint32 mant = h & 0x3ff;
    quint32 bits;
    if (expo == 0) {
      if (mant == 0) {
        bits = sign;
      }
      else {
        // subnormal: renormalize
        int e = -1;
        do {
          ++e;
          mant <<= 1;
        } while ((mant & 0x400) == 0);
        mant &= 0x3ff;
        bits = sign | ((127 - 15 - e) << 23) | (mant << 13);
      }
    }
    else if (expo == 0x1f) {
      bits = sign | 0x7f800000u | (mant << 13);
    }
    else {
      bits = sign | ((expo + (127 - 15)) << 23) | (mant << 13);
    }
    float f;
    std::memcpy(&f, &bits, 4);
    return f;
  }

  /// Running statistics of the (transformed) samples
  struct StatsAcc {
    double vmin, vmax, sum, sqsum;
    size_t n;
    StatsAcc() { reset(); }
    void reset() {
      vmin = 1.0e300;
      vmax = -1.0e300;
      sum = sqsum = 0.0;
      n = 0;
    }
    inline void add(float v) {
      const double d = v;
      sum += d;
      sqsum += d * d;
      if (d < vmin) vmin = d;
      if (d > vmax) vmax = d;
      ++n;
    }
    double mean() const { return (n > 0) ? sum / double(n) : 0.0; }
    double rmsd() const {
      if (n == 0) return 0.0;
      const double m = mean();
      const double v = sqsum / double(n) - m * m;
      return (v > 0.0) ? std::sqrt(v) : 0.0;
    }
  };

  /// Quantization for a value range (atFloat(b) = base + b*step; the top
  /// value maps to 255 after truncation, as setMapFloatArray does)
  DensityMap::MapQuant quantForRange(double vmin, double vmax)
  {
    DensityMap::MapQuant q;
    q.base = vmin;
    q.step = (vmax - vmin) / 256.0;
    if (!(q.step > 0.0))
      q.step = 1.0;  // flat map: every sample quantizes to 0
    return q;
  }

  inline quint8 quantize(float v, const DensityMap::MapQuant &q)
  {
    double rho = (double(v) - q.base) / q.step;
    if (rho < 0) rho = 0.0;
    if (rho > 255) rho = 255.0;
    return (quint8) rho;
  }

  bool headerStatsValid(float amin, float amax, float amean)
  {
    if (!std::isfinite(amin) || !std::isfinite(amax) || !std::isfinite(amean))
      return false;
    if (std::fabs(amin) > 1.0e30 || std::fabs(amax) > 1.0e30)
      return false;
    if (!(amin < amax))
      return false;
    if (amean < amin || amean > amax)
      return false;
    return true;
  }

  /// Byte order of a CCP4/MRC header: the section counts are small
  /// positive numbers, so a huge value means the other endianness.
  void detectByteOrder(const char *header, int &iType, int &fType)
  {
    const qint32 *pi = (const qint32 *) header;
    fType = iType = CCP4InStream::m_intNativeType;
    int nc = pi[0];
    int nr = pi[1];
    int ns = pi[2];
    if (nc > 0x10000 || nr > 0x10000 || ns > 0x10000) {
      qlib::LByteSwapper<int>::swap(nc);
      qlib::LByteSwapper<int>::swap(nr);
      qlib::LByteSwapper<int>::swap(ns);
      if (!(nc > 0x10000 || nr > 0x10000 || ns > 0x10000)) {
        if (CCP4InStream::m_intNativeType == CCP4InStream::BO_LE)
          fType = iType = CCP4InStream::BO_BE;
        else
          fType = iType = CCP4InStream::BO_LE;
      }
    }
  }

  /// Per-section decoding of the file samples into floats
  class SectionDecoder {
  public:
    SectionDecoder(CCP4InStream &in, int nmode, size_t nelem, bool bSigned8)
      : m_in(in), m_nMode(nmode), m_nElem(nelem), m_bSigned8(bSigned8),
        m_raw(nelem * size_t(mrcElemSize(nmode)))
    {
    }

    size_t sectionBytes() const { return m_raw.size(); }

    /// Read the next section and decode it into out (nelem floats)
    void read(float *out)
    {
      m_in.readFully(m_raw.data(), 0, int(m_raw.size()));
      const unsigned char *p = (const unsigned char *) m_raw.data();
      switch (m_nMode) {
      case MODE_INT8:
        if (m_bSigned8) {
          for (size_t i = 0; i < m_nElem; ++i)
            out[i] = float((qint8) p[i]);
        }
        else {
          for (size_t i = 0; i < m_nElem; ++i)
            out[i] = float(p[i]);
        }
        break;
      case MODE_INT16:
      case MODE_UINT16:
      case MODE_FLOAT16: {
        const bool bSwap = (m_nMode == MODE_FLOAT16) ? m_in.isFloatByteSwap()
                                                     : m_in.isIntByteSwap();
        for (size_t i = 0; i < m_nElem; ++i) {
          quint16 u = bSwap ? quint16((p[2*i] << 8) | p[2*i+1])
                            : quint16(p[2*i] | (p[2*i+1] << 8));
#if (BYTEORDER==4321)
          // big-endian host: the non-swapped case above assembled the
          // little-endian order, so flip the sense
          u = bSwap ? quint16(p[2*i] | (p[2*i+1] << 8))
                    : quint16((p[2*i] << 8) | p[2*i+1]);
#endif
          if (m_nMode == MODE_INT16)
            out[i] = float((qint16) u);
          else if (m_nMode == MODE_UINT16)
            out[i] = float(u);
          else
            out[i] = halfToFloat(u);
        }
        break;
      }
      case MODE_FLOAT32:
      default: {
        std::memcpy(out, p, m_nElem * sizeof(float));
        if (m_in.isFloatByteSwap()) {
          for (size_t i = 0; i < m_nElem; ++i) {
            unsigned char *b = (unsigned char *) &out[i];
            std::swap(b[0], b[3]);
            std::swap(b[1], b[2]);
          }
        }
        break;
      }
      }
    }

    /// Skip one section without decoding
    void skip()
    {
      m_in.skip(int(m_raw.size()));
    }

  private:
    CCP4InStream &m_in;
    int m_nMode;
    size_t m_nElem;
    bool m_bSigned8;
    std::vector<char> m_raw;
  };

}

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

  m_nSubsample = 1;
  m_dMaxVoxels = 0.0;
  m_bUseHdrStats = true;
}

LString CCP4MapReader::probeHeader(const LString &path)
{
  qlib::FileInStream fis;
  fis.open(path);
  qlib::InStream *pIn = &fis;
  std::unique_ptr<qlib::GzipInStream> pgz;
  if (path.toLowerCase().endsWith(".gz")) {
    pgz.reset(MB_NEW qlib::GzipInStream(fis));
    pIn = pgz.get();
  }

  char header[1024];
  pIn->readFully(header, 0, 1024);
  if (!(header[208]=='M' && header[209]=='A' && header[210]=='P' && header[211]==' ')) {
    MB_THROW(qlib::FileFormatException, "not a CCP4/MRC map file");
    return LString();
  }

  int iType, fType;
  detectByteOrder(header, iType, fType);
  StrInStream sin(header, 1024);
  CCP4InStream hin(sin);
  hin.setFileByteOrder(iType, fType);

  int nc, nr, ns, nmode, ncst, nrst, nsst, nx, ny, nz;
  float cell[6];
  int mapc, mapr, maps;
  float amin, amax, amean;
  int ispg, nsymbt;
  char exttyp[5];
  int nversion;
  float origin[3];
  float rms;
  hin.fetch_int(nc); hin.fetch_int(nr); hin.fetch_int(ns);
  hin.fetch_int(nmode);
  hin.fetch_int(ncst); hin.fetch_int(nrst); hin.fetch_int(nsst);
  hin.fetch_int(nx); hin.fetch_int(ny); hin.fetch_int(nz);
  for (int i=0; i<6; ++i) hin.fetch_float(cell[i]);
  hin.fetch_int(mapc); hin.fetch_int(mapr); hin.fetch_int(maps);
  hin.fetch_float(amin); hin.fetch_float(amax); hin.fetch_float(amean);
  hin.fetch_int(ispg); hin.fetch_int(nsymbt);
  hin.skip(8);
  hin.readFully(exttyp, 0, 4);
  exttyp[4] = '\0';
  hin.fetch_int(nversion);
  hin.skip(84);
  hin.fetch_float(origin[0]); hin.fetch_float(origin[1]); hin.fetch_float(origin[2]);
  hin.skip(8);
  hin.fetch_float(rms);

  const long long nvox = (long long) nc * nr * ns;
  const int elem = mrcElemSize(nmode);

  LString json = "{";
  json += LString::format("\"nc\":%d,\"nr\":%d,\"ns\":%d,", nc, nr, ns);
  json += LString::format("\"mode\":%d,\"supported\":%s,", nmode, (elem>0) ? "true" : "false");
  json += LString::format("\"nvoxels\":%lld,\"file_bytes_per_voxel\":%d,", nvox, elem);
  json += LString::format("\"storage_bytes\":%lld,", nvox);
  json += LString::format("\"start\":[%d,%d,%d],\"grid\":[%d,%d,%d],", ncst, nrst, nsst, nx, ny, nz);
  json += LString::format("\"cell\":[%f,%f,%f,%f,%f,%f],", cell[0], cell[1], cell[2], cell[3], cell[4], cell[5]);
  json += LString::format("\"axis\":[%d,%d,%d],", mapc, mapr, maps);
  json += LString::format("\"ispg\":%d,\"nsymbt\":%d,\"nversion\":%d,", ispg, nsymbt, nversion);
  json += LString::format("\"exttyp\":\"%s\",", exttyp);
  json += LString::format("\"origin\":[%f,%f,%f],", origin[0], origin[1], origin[2]);
  json += LString::format("\"dmin\":%f,\"dmax\":%f,\"dmean\":%f,\"rms\":%f", amin, amax, amean, rms);
  json += "}";

  if (pgz)
    pgz->close();
  fis.close();
  return json;
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

  // check byte order
  int iType, fType;
  detectByteOrder(header, iType, fType);

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

  // The axis order words select the storage axes (rotate() writes r[ax])
  // and the counts size the chunk arrays, so a corrupt header must be
  // rejected before either is used. MAPC=MAPR=MAPS=0 exists in the wild.
  {
    const int ax[3] = {axcol, axrow, axsect};
    bool bSeen[3] = {false, false, false};
    bool bAxesOK = true;
    for (int i=0; i<3; ++i) {
      if (ax[i]<1 || ax[i]>3 || bSeen[ax[i]-1]) {
        bAxesOK = false;
        break;
      }
      bSeen[ax[i]-1] = true;
    }
    if (!bAxesOK) {
      LString msg = LString::format("CCP4MapReader read: invalid axis order (%d,%d,%d)",
                                    axcol, axrow, axsect);
      LOG_DPRINTLN(msg);
      MB_THROW(qlib::FileFormatException, msg);
      return false;
    }
    if (ncol<=0 || nrow<=0 || nsect<=0) {
      LString msg = LString::format("CCP4MapReader read: invalid map size (%d,%d,%d)",
                                    ncol, nrow, nsect);
      LOG_DPRINTLN(msg);
      MB_THROW(qlib::FileFormatException, msg);
      return false;
    }
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

  //////////////////////////////////////
  // Data: streamed section by section into the map storage

  const int elemSize = mrcElemSize(nmode);
  if (elemSize==0) {
    MB_THROW(qlib::FileFormatException,
             LString::format("CCP4MapReader: unsupported data mode %d", nmode));
    return false;
  }

  // subsampling (every sub-th grid point on each axis)
  const int sub = (m_nSubsample<1) ? 1 : m_nSubsample;
  if (sub>1) {
    if (ncol%sub!=0 || nrow%sub!=0 || nsect%sub!=0 ||
        nx%sub!=0 || ny%sub!=0 || nz%sub!=0 ||
        stacol%sub!=0 || starow%sub!=0 || stasect%sub!=0) {
      MB_THROW(qlib::FileFormatException,
               LString::format("CCP4MapReader: subsample %d does not divide the map "
                               "size (%d,%d,%d), cell grid (%d,%d,%d) or start (%d,%d,%d)",
                               sub, ncol, nrow, nsect, nx, ny, nz, stacol, starow, stasect));
      return false;
    }
  }

  const size_t ntotal = size_t(ncol)*size_t(nrow)*size_t(nsect);
  const size_t nstore = ntotal / (size_t(sub)*size_t(sub)*size_t(sub));
  if (m_dMaxVoxels>0.0 && double(nstore)>m_dMaxVoxels) {
    MB_THROW(qlib::FileFormatException,
             LString::format("CCP4MapReader: map too large (%lld voxels > max_voxels %.0f); "
                             "raise max_voxels or use subsample",
                             (long long) nstore, m_dMaxVoxels));
    return false;
  }
  LOG_DPRINT("CCP4Map> map storage %.1f MB (%lld voxels, subsample %d)\n",
             double(nstore)/(1024.0*1024.0), (long long) nstore, sub);

  // storage (rotated) dimensions
  int sc = ncol/sub, sr = nrow/sub, ss = nsect/sub;
  rotate(sc, sr, ss, axcol-1, axrow-1, axsect-1);
  const int ax0 = axcol-1, ax1 = axrow-1, ax2 = axsect-1;
  const bool bIdentPerm = (ax0==0 && ax1==1 && ax2==2);

  // value transform (truncation / normalization; affine, order preserving)
  const double tlo = m_bTruncMin ? m_dMin*rhosig : -1.0e300;
  const double thi = m_bTruncMax ? m_dMax*rhosig : 1.0e300;
  const bool bNorm = m_bNormalize && rhosig!=0.0f;
  if (m_bTruncMin) LOG_DPRINTLN("CCP4Map> Truncate map lower than: %f sigma", m_dMin);
  if (m_bTruncMax) LOG_DPRINTLN("CCP4Map> Truncate map higher than: %f sigma", m_dMax);
  if (bNorm) LOG_DPRINTLN("CCP4Map> Normalizing map by sig=%f, mean=%f", rhosig, rhomean);
  auto xform = [&](double v) -> double {
    if (v<tlo) v = tlo;
    if (v>thi) v = thi;
    if (bNorm) v = (v - rhomean)/rhosig;
    return v;
  };

  const size_t nsec = size_t(ncol)*size_t(nrow);
  SectionDecoder dec(in, nmode, nsec, bSigned);
  std::vector<float> sec(nsec);

  // Stream every file section through the transform and the statistics,
  // handing the kept (subsampled) sections to the sink.
  auto streamSections = [&](StatsAcc &acc,
                            const std::function<void(int, const float *)> &sink) {
    for (int kf=0; kf<nsect; ++kf) {
      if (kf%sub!=0) {
        dec.skip();
        continue;
      }
      dec.read(sec.data());
      for (int jf=0; jf<nrow; jf+=sub) {
        float *prow = sec.data() + size_t(jf)*size_t(ncol);
        for (int i=0; i<ncol; i+=sub) {
          const float v = float(xform(prow[i]));
          prow[i] = v;
          acc.add(v);
        }
      }
      sink(kf, sec.data());
    }
  };

  // Quantize one kept file section into the (rotated) map storage
  auto quantizeSection = [&](int kf, const float *psec, const DensityMap::MapQuant &q) {
    const int fk = kf/sub;
    if (bIdentPerm) {
      quint8 *dst = pMap->sliceBytes(fk);
      for (int jf=0, fj=0; jf<nrow; jf+=sub, ++fj) {
        const float *prow = psec + size_t(jf)*size_t(ncol);
        quint8 *drow = dst + size_t(fj)*size_t(sc);
        for (int i=0, fi=0; i<ncol; i+=sub, ++fi)
          drow[fi] = quantize(prow[i], q);
      }
    }
    else {
      for (int jf=0, fj=0; jf<nrow; jf+=sub, ++fj) {
        const float *prow = psec + size_t(jf)*size_t(ncol);
        for (int i=0, fi=0; i<ncol; i+=sub, ++fi) {
          int ii=fi, jj=fj, kk=fk;
          rotate(ii, jj, kk, ax0, ax1, ax2);
          pMap->sliceBytes(kk)[size_t(ii) + size_t(jj)*size_t(sc)] = quantize(prow[i], q);
        }
      }
    }
  };

  // Quantization range policy:
  //  1. header DMIN/DMAX valid  -> one streaming pass (values outside the
  //     header range are clipped; detected afterwards and re-read when
  //     the source can seek)
  //  2. seekable source         -> statistics pass, seek back, quantize pass
  //  3. otherwise (gzip etc.)   -> buffer the decoded map, then quantize
  const bool bHdrStats = m_bUseHdrStats && headerStatsValid(rhomin, rhomax, rhomean);
  const bool bSeekable = in.isSeekable();
  const qint64 dataPos = bSeekable ? in.tell() : -1;

  StatsAcc acc;
  DensityMap::MapQuant q;

  if (bHdrStats) {
    q = quantForRange(xform(rhomin), xform(rhomax));
    pMap->beginByteMap(sc, sr, ss, q);
    streamSections(acc, [&](int kf, const float *psec) { quantizeSection(kf, psec, q); });

    if (acc.vmin < q.base - 0.5*q.step || acc.vmax > q.base + 256.5*q.step) {
      LOG_DPRINTLN("CCP4Map> header DMIN/DMAX (%f, %f) do not cover the data (%f, %f)",
                   rhomin, rhomax, acc.vmin, acc.vmax);
      if (bSeekable && in.seekTo(dataPos)) {
        LOG_DPRINTLN("CCP4Map> re-reading with the measured range");
        q = quantForRange(acc.vmin, acc.vmax);
        pMap->beginByteMap(sc, sr, ss, q);
        StatsAcc acc2;
        streamSections(acc2, [&](int kf, const float *psec) { quantizeSection(kf, psec, q); });
        acc = acc2;
      }
      else {
        LOG_DPRINTLN("CCP4Map> source is not seekable; out-of-range values were clipped");
      }
    }
  }
  else if (bSeekable) {
    LOG_DPRINTLN("CCP4Map> no usable header statistics; two-pass read");
    streamSections(acc, [](int, const float *) {});
    if (!in.seekTo(dataPos)) {
      MB_THROW(qlib::FileFormatException, "CCP4MapReader: seek failed");
      return false;
    }
    q = quantForRange(acc.vmin, acc.vmax);
    pMap->beginByteMap(sc, sr, ss, q);
    StatsAcc acc2;
    streamSections(acc2, [&](int kf, const float *psec) { quantizeSection(kf, psec, q); });
  }
  else {
    LOG_DPRINTLN("CCP4Map> no usable header statistics; buffering the decoded map");
    // decoded, subsampled sections in file order (chunked, 4 bytes/voxel)
    qlib::ChunkedArray3D<float> fbuf(ncol/sub, nrow/sub, nsect/sub);
    streamSections(acc, [&](int kf, const float *psec) {
      float *dst = fbuf.slice(kf/sub);
      for (int jf=0, fj=0; jf<nrow; jf+=sub, ++fj) {
        const float *prow = psec + size_t(jf)*size_t(ncol);
        float *drow = dst + size_t(fj)*size_t(ncol/sub);
        for (int i=0, fi=0; i<ncol; i+=sub, ++fi)
          drow[fi] = prow[i];
      }
    });
    q = quantForRange(acc.vmin, acc.vmax);
    pMap->beginByteMap(sc, sr, ss, q);
    // the buffer already holds subsampled rows; quantizeSection expects a
    // full file section, so expand the row stride back for it
    std::vector<float> full(nsec);
    const int scol = ncol/sub, srow = nrow/sub;
    for (int fk=0; fk<nsect/sub; ++fk) {
      const float *src = fbuf.slice(fk);
      for (int fj=0; fj<srow; ++fj)
        for (int fi=0; fi<scol; ++fi)
          full[size_t(fj*sub)*size_t(ncol) + size_t(fi*sub)] = src[size_t(fj)*size_t(scol) + fi];
      quantizeSection(fk*sub, full.data(), q);
    }
  }

  pMap->endByteMap(acc.vmin, acc.vmax, acc.mean(), acc.rmsd());

  LOG_DPRINT("CCP4Map> data statistics:\n");
  LOG_DPRINT("  map minimum density  : %f\n", acc.vmin);
  LOG_DPRINT("  map maximum density  : %f\n", acc.vmax);
  LOG_DPRINT("  map mean density     : %f\n", acc.mean());
  LOG_DPRINT("  map density r.m.s.d. : %f\n", acc.rmsd());

  // rotate start index numbers (subsampled grid)
  stacol /= sub;
  starow /= sub;
  stasect /= sub;
  rotate(stacol, starow, stasect, axcol-1, axrow-1, axsect-1);

  pMap->setMapParams(stacol, starow, stasect, nx/sub, ny/sub, nz/sub);

  // setup crystal parameters
  pMap->setXtalParams(alen, blen, clen, alpha, beta, gamma, nspgrp);

  // pMap->setOrigFileType("ccp4map");

  return true;
}


