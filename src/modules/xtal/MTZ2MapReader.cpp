// -*-Mode: C++;-*-
//
// MTZ file to map reader (with FFT)
//
// $Id: MTZ2MapReader.cpp,v 1.7 2011/03/06 13:42:36 rishitani Exp $

#include <common.h>

#include "MTZ2MapReader.hpp"
#include "DensityMap.hpp"
#include <modules/symm/SymOpDB.hpp>
#include <qlib/LineStream.hpp>
#include "MapFFT.hpp"

// #include <boost/math/special_functions/fpclassify.hpp>

// #include <complex>
// #ifdef HAVE_FFTW3_H
// #  include <fftw3.h>
// #endif

// // Ignore anomalous scattering ( F(+)==F(-) )
// #define HERMIT

using namespace xtal;

using qlib::Matrix4D;
using qlib::Matrix3D;
using qlib::Vector4D;
using symm::SymOpDB;

// default constructor
MTZ2MapReader::MTZ2MapReader()
     : m_pMap(NULL)
{
  m_nConvInt = m_nConvFlt = 0;
  m_pbuf = NULL;
  m_nSG = 0;
  m_grid = 0.33;
  m_mapr = -1.0; // auto (calc from max F)

  m_nfp = -1.0;
  m_nphi = -1.0;
  m_nwgt = -1.0;

  m_bChkResGrid = false;
}

// destructor
MTZ2MapReader::~MTZ2MapReader()
{
  if (m_pbuf!=NULL)
    delete [] m_pbuf;
}

void MTZ2MapReader::cleanup()
{
  if (m_pbuf!=NULL)
    delete [] m_pbuf;
  m_pbuf = NULL;
}

///////////////////////////////////////////

/// create default object for this reader
qsys::ObjectPtr MTZ2MapReader::createDefaultObj() const
{
  return qsys::ObjectPtr(new DensityMap());
  //return new DensityMap();
}

/// Get nickname for scripting
const char *MTZ2MapReader::getName() const
{
  return "mtzmap";
}

/** get file-type description */
const char *MTZ2MapReader::getTypeDescr() const
{
  return "MTZ Structure Factor (*.mtz)";
}

/** get file extension */
const char *MTZ2MapReader::getFileExt() const
{
  return "*.mtz";
}

/// Content-sniff: MTZ files start with the 4-byte ASCII magic
/// "MTZ " at offset 0 (note the trailing space). Matches the
/// validation in read().
int MTZ2MapReader::canHandleContent(qlib::InStream &ins) const
{
  char buf[4];
  int total = 0;
  while (total < 4) {
    int n = ins.read(buf, total, 4 - total);
    if (n <= 0) break;
    total += n;
  }
  if (total < 4) return CONTENT_UNKNOWN;
  if (buf[0] == 'M' && buf[1] == 'T' && buf[2] == 'Z' && buf[3] == ' ') {
    return CONTENT_YES;
  }
  return CONTENT_UNKNOWN;
}

///////////////////////////////////////////

bool MTZ2MapReader::read(qlib::InStream &arg)
{
  // get the target object (DensityMap)
  // m_pMap = NULL;
  m_pMap = getTarget<DensityMap>();
  if (m_pMap==NULL) return false;

  readData(arg);

  selectFFTColumns();

  LOG_DPRINTLN("MTZ> FFT target: FWT=%s, PHI=%s, WGT=%s",
               m_sfp.c_str(), m_sphi.c_str(), m_swgt.c_str());

  MapFFT mapfft;
  mapfft.setTarget(m_pMap);
  mapfft.setParams(m_cella, m_cellb, m_cellc, m_alpha, m_beta,
                   m_gamma, m_nSG, m_grid, m_mapr);
  mapfft.setChkResGrid(m_bChkResGrid);
  mapfft.setData(m_nrefl, m_ncol, reinterpret_cast<float *>(m_pbuf),
                 m_cind_h, m_cind_k, m_cind_l,
                 m_nfp, m_nphi, m_nwgt);
  mapfft.doFFT();

  // the reflection buffer is only needed for the FFT
  cleanup();

  return true;
}

void MTZ2MapReader::readData(qlib::InStream &arg)
{
  m_columns.erase(m_columns.begin(), m_columns.end());

  readHeader(arg); 
  
  readBody(arg); 

  qlib::LineStream ins(arg);

  readFooter(ins);
  
  if (m_ncol<=3 || m_nrefl<=0 || m_ncol!=m_columns.size())
    MB_THROW(qlib::FileFormatException, "No refls in mtzfile");

  // NCOL/NREFL come from the footer: the FFT reads nrefl*ncol floats from
  // the body, which must actually hold them
  if (size_t(m_nrefl)*size_t(m_ncol)*sizeof(float) > size_t(m_nrawdat)) {
    MB_THROW(qlib::FileFormatException,
             "MTZ body is shorter than NCOL*NREFL reflections");
    return;
  }

  LOG_DPRINT("MTZ> Unit cell a=%.2fA, b=%.2fA, c=%.2fA,\n", m_cella, m_cellb, m_cellc);
  LOG_DPRINT("MTZ> alpha=%.2f, beta=%.2f, gamma=%.2f,\n", m_alpha, m_beta, m_gamma);

  checkHKLColumns();
  MB_DPRINTLN("MTZ> FFT target: HKL %d %d %d", m_cind_h, m_cind_k, m_cind_l);
}

void MTZ2MapReader::readHeader(qlib::InStream &ins)
{
  char sbuf[256];

  ins.readFully(sbuf, 0, 4*sizeof(char));
  if (strncmp(sbuf, "MTZ ", 4)!=0) {
    MB_THROW(qlib::FileFormatException, "Not a MTZ file");
    return;
  }

  unsigned int nhdrst;
  ins.readFully((char*)&nhdrst, 0, 1*sizeof(int));

  unsigned char mtstring[4];
  ins.readFully((char*) &mtstring, 0, 1*sizeof(int));
  // printf("mark %X\n", mark);
  m_nConvInt = (mtstring[1]>>4) & 0x0f;
  m_nConvFlt = (mtstring[0]>>4) & 0x0f;
  MB_DPRINTLN("MTZ> iconv %X", m_nConvInt);
  MB_DPRINTLN("MTZ> fconv %X", m_nConvFlt);

  if (m_nConvInt!=4 || m_nConvFlt!=4) {
    MB_THROW(qlib::FileFormatException, "Unsupported byteorder\n");
    return;
  }

  m_nhdrst = nhdrst;
  MB_DPRINTLN("MTZ> nhdrst %X (*4=%d)\n", m_nhdrst, m_nhdrst*4);

  // skip header
  ins.readFully(sbuf, 0, (20-3)*4*sizeof(char));

  // OK
}

void MTZ2MapReader::readBody(qlib::InStream &ins)
{
  // the header location word must leave room for the 80-byte header
  if (m_nhdrst < 21) {
    MB_THROW(qlib::FileFormatException, "MTZ header location is inside the header");
    return;
  }
  m_nrawdat = (m_nhdrst-1)*4 - 20*4;
  cleanup();
  m_pbuf = new char[m_nrawdat];
  MB_DPRINTLN("MTZ2MapReader> alloc %d bytes\n", m_nrawdat);

  ins.readFully(m_pbuf, 0, m_nrawdat*sizeof(char));
}

void MTZ2MapReader::skipBody(qlib::InStream &ins)
{
  if (m_nhdrst < 21) {
    MB_THROW(qlib::FileFormatException, "MTZ header location is inside the header");
    return;
  }
  m_nrawdat = (m_nhdrst-1)*4 - 20*4;
  ins.skip(m_nrawdat*sizeof(char));
}

void MTZ2MapReader::readNcol(const char *sbuf)
{
  LString stmp(sbuf);
  stmp = stmp.chomp();
  std::list<LString> sls;
  stmp.split(' ', sls);

  MB_DPRINTLN("[%s]", stmp.c_str());
  MB_DPRINTLN("size=%d", (int)sls.size());

  if (sls.size()<4) {
    MB_THROW(qlib::FileFormatException, "Invalid NCOL");
    return;
  }

  MB_DPRINTLN("%s", LString::join(",",sls).c_str());
  sls.pop_front();

  MB_DPRINTLN("%s", sls.front().c_str());
  // NCOL
  if (!sls.front().toInt(&m_ncol)) {
    MB_THROW(qlib::FileFormatException, "Invalid NCOL");
    return;
  }
  sls.pop_front();
  
  // NREFL
  if (!sls.front().toInt(&m_nrefl)) {
    MB_THROW(qlib::FileFormatException, "Invalid NCOL");
    return;
  }
  
  MB_DPRINTLN("NCOL=%d, NREFL=%d", m_ncol, m_nrefl);
}

void MTZ2MapReader::readColumn(const char *sbuf)
{
  Column col;
  
  LString stmp(sbuf);
  stmp = stmp.chomp();
  std::list<LString> sls;
  stmp.split(' ', sls);

  MB_DPRINTLN("[%s]", stmp.c_str());
  MB_DPRINTLN("size=%d", (int)sls.size());
  
  MB_DPRINTLN("%s", LString::join(",",sls).c_str());

  if (sls.size()<3) {
    MB_THROW(qlib::FileFormatException, "Invalid COL");
    return;
  }

  sls.pop_front();

  // name
  col.name = sls.front();
  sls.pop_front();
  
  // type
  LString stype = sls.front();
  sls.pop_front();
  col.type = stype[0];
  
  col.nid = m_columns.size();

  MB_DPRINTLN("Column %s (%c)\n", col.name.c_str(), col.type);
  //col.name
  m_columns.set(col.name, col);
}

void MTZ2MapReader::readDcell(const char *sbuf)
{
  LString stmp(sbuf);
  stmp = stmp.chomp();
  std::list<LString> sls;
  stmp.split(' ', sls);

  MB_DPRINTLN("[%s]", stmp.c_str());
  MB_DPRINTLN("size=%d", (int)sls.size());
  
  MB_DPRINTLN("%s", LString::join(",",sls).c_str());

  if (sls.size()<8) {
    MB_THROW(qlib::FileFormatException, "Invalid DCELL");
    return;
  }

  sls.pop_front();

  // data ID
  int nid;
  if (!sls.front().toInt(&nid)) {
    MB_THROW(qlib::FileFormatException, "Invalid DCELL");
    return;
  }
  sls.pop_front();
  // if (nid!=1) return;

  double tmp[6];
  for (int i=0; i<6; ++i) {
    if (!sls.front().toDouble(&tmp[i])) {
      MB_THROW(qlib::FileFormatException, "Invalid DCELL");
      return;
    }
    sls.pop_front();
  }
  
  m_cella = tmp[0];
  m_cellb = tmp[1];
  m_cellc = tmp[2];
  m_alpha = tmp[3];
  m_beta = tmp[4];
  m_gamma = tmp[5];

  MB_DPRINT("  unit cell a=%.2fA, b=%.2fA, c=%.2fA,\n", m_cella, m_cellb, m_cellc);
  MB_DPRINT("            alpha=%.2fdeg, beta=%.2fdeg, gamma=%.2fdeg,\n",
             m_alpha, m_beta, m_gamma);
}

void MTZ2MapReader::readSyminf(const char *sbuf)
{
  LString stmp(sbuf);
  stmp = stmp.chomp();
  std::list<LString> sls;
  stmp.split(' ', sls);

  MB_DPRINTLN("[%s]", stmp.c_str());
  MB_DPRINTLN("size=%d", (int)sls.size());

  if (sls.size()<4) {
    MB_THROW(qlib::FileFormatException, "Invalid SYMINF");
    return;
  }

  MB_DPRINTLN("%s", LString::join(",",sls).c_str());
  sls.pop_front();

  // nsym
  sls.pop_front();

  // nop(primitive)
  sls.pop_front();

  // lattice
  sls.pop_front();

  // sgno
  if (!sls.front().toInt(&m_nSG)) {
    MB_THROW(qlib::FileFormatException, "Invalid SYMINF");
    return;
  }
  sls.pop_front();

  // SG name
  LString sgname = sls.front();
  sgname = sgname.trim("'\"");
  SymOpDB *pSODB = SymOpDB::getInstance();
  int i = pSODB->getSgIDByName(sgname);
  if (i>=1 && i!=m_nSG) {
    LOG_DPRINTLN("MTZ2Map> Inconsistemt sgno(%d) and sgname(%s) --> use sgname", m_nSG, sgname.c_str());
    m_nSG = i;
  }
}

void MTZ2MapReader::readResoln(const char *sbuf)
{
  LString stmp(sbuf);
  stmp = stmp.chomp();
  std::list<LString> sls;
  stmp.split(' ', sls);

  MB_DPRINTLN("[%s]", stmp.c_str());
  MB_DPRINTLN("size=%d", (int)sls.size());

  if (sls.size()<3) {
    MB_THROW(qlib::FileFormatException, "Invalid RESO");
    return;
  }

  MB_DPRINTLN("%s", LString::join(",",sls).c_str());
  sls.pop_front();

  double tmp;
  // resmin
  if (!sls.front().toDouble(&tmp)) {
    MB_THROW(qlib::FileFormatException, "Invalid RESO");
    return;
  }
  sls.pop_front();
  m_dResMin = ::sqrt(1.0/tmp);

  // resmax
  if (!sls.front().toDouble(&tmp)) {
    MB_THROW(qlib::FileFormatException, "Invalid RESO");
    return;
  }
  sls.pop_front();
  m_dResMax = ::sqrt(1.0/tmp);

  // set building map resolution as the highest resln in MTZ file
  if (m_mapr<0.0)
    m_mapr = m_dResMax;
  MB_DPRINTLN("Resolution: %.2f - %.2f", m_dResMin, m_dResMax);
}

void MTZ2MapReader::readFooter(qlib::LineStream &ins)
{
  char sbuf[256];
  
  while (ins.ready()) {
    ins.readFully(sbuf, 0, 80);
    sbuf[80] = '\0';
    
    //fprintf(stderr, "record [%s]\n", sbuf);
    if (strncmp(sbuf, "NCOL", 4)==0) {
      readNcol(sbuf);
    }
    else if (strncmp(sbuf, "COL", 3)==0) {
      readColumn(sbuf);
    }
    else if (strncmp(sbuf, "DCEL", 4)==0) {
      readDcell(sbuf);
    }
    else if (strncmp(sbuf, "SYMINF", 6)==0) {
      readSyminf(sbuf);
    }
    else if (strncmp(sbuf, "RESO", 4)==0) {
      readResoln(sbuf);
    }
    else {
      MB_DPRINTLN("skip record [%s]", sbuf);
    }
  }

}

void MTZ2MapReader::checkHKLColumns()
{
  if (!m_columns.containsKey("H") ||
      !m_columns.containsKey("K") ||
      !m_columns.containsKey("L")) {
    MB_THROW(qlib::FileFormatException, "HKL Column not found");
    return;
  }
  if (m_columns.get("H").type!='H' ||
      m_columns.get("K").type!='H' ||
      m_columns.get("L").type!='H') {
    MB_THROW(qlib::FileFormatException, "HKL Column invalid type");
    return;
  }

  m_cind_h = m_columns.get("H").nid;
  m_cind_k = m_columns.get("K").nid;
  m_cind_l = m_columns.get("L").nid;
}

void MTZ2MapReader::selectFFTColumns()
{
  m_nfp = -1;
  m_nphi = -1;
  m_nwgt = -1;

  if (m_columns.containsKey(m_strClmnF) &&
      m_columns.get(m_strClmnF).type=='F'){
    m_nfp = m_columns.get(m_strClmnF).nid;
    m_sfp = m_columns.get(m_strClmnF).name;
  }

  if (m_columns.containsKey(m_strClmnPHI) &&
      m_columns.get(m_strClmnPHI).type=='P'){
    m_nphi = m_columns.get(m_strClmnPHI).nid;
    m_sphi = m_columns.get(m_strClmnPHI).name;
  }

  if (m_columns.containsKey(m_strClmnWT) &&
      m_columns.get(m_strClmnWT).type=='W'){
    m_nwgt = m_columns.get(m_strClmnWT).nid;
    m_swgt = m_columns.get(m_strClmnWT).name;
  }

  // if (m_nfp>=0 && m_nphi>=0) return;

  // Even the patterson map is ok.
  if (m_nfp>=0) return;

  // No corresponding columns --> guess default values
  guessFFTColumns();
}

void MTZ2MapReader::guessFFTColumns()
{
  // PHENIX
  if (m_columns.containsKey("2FOFCWT") &&
      m_columns.get("2FOFCWT").type=='F'){
    m_nfp = m_columns.get("2FOFCWT").nid;
    m_sfp = m_columns.get("2FOFCWT").name;
  }
  if (m_columns.containsKey("PH2FOFCWT") &&
      m_columns.get("PH2FOFCWT").type=='P'){
    m_nphi = m_columns.get("PH2FOFCWT").nid;
    m_sphi = m_columns.get("PH2FOFCWT").name;
  }
  if (m_nfp>=0 && m_nphi>=0) return;

  // REFMAC5
  if (m_columns.containsKey("FWT") &&
      m_columns.get("FWT").type=='F'){
    m_nfp = m_columns.get("FWT").nid;
    m_sfp = m_columns.get("FWT").name;
  }
  if (m_columns.containsKey("PHWT") &&
      m_columns.get("PHWT").type=='P'){
    m_nphi = m_columns.get("PHWT").nid;
    m_sphi = m_columns.get("PHWT").name;
  }
  if (m_nfp>=0 && m_nphi>=0) return;

  // SIGMAA
  if (m_columns.containsKey("FWT") &&
      m_columns.get("FWT").type=='F'){
    m_nfp = m_columns.get("FWT").nid;
    m_sfp = m_columns.get("FWT").name;
  }
  if (m_columns.containsKey("PHIC") &&
      m_columns.get("PHIC").type=='P'){
    m_nphi = m_columns.get("PHIC").nid;
    m_sphi = m_columns.get("PHIC").name;
  }
  if (m_nfp>=0 && m_nphi>=0) return;

  MB_THROW(qlib::FileFormatException, "FFT target column not found");
  return;
}

LString MTZ2MapReader::getColumnInfoJSON()
{
  LString rval;
  qlib::InStream *pIn = createInStream();
  if (pIn==NULL)
    return rval;
  
  {
    m_columns.erase(m_columns.begin(), m_columns.end());
    readHeader(*pIn); 
    skipBody(*pIn); 

    qlib::LineStream ins(*pIn);
    readFooter(ins);
  }
  pIn->close();
  delete pIn;

  bool bFirst = true;
  rval = "[";
  BOOST_FOREACH(const qlib::MapTable<Column>::value_type &elem, m_columns) {
    const Column &col = elem.second;
    if (!bFirst) rval += ",";
    rval += "{";
    rval += "\"nid\":"+LString::format("%d", col.nid);
    rval += ", \"name\": \""+col.name.escapeQuots()+"\"";
    rval += ", \"type\": \""+LString::format("%c", col.type)+"\"";
    rval += "}";
    bFirst = false;
  }
  rval += "]";

  return rval;
}

