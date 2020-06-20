// -*-Mode: C++;-*-
//
// X-PLOR map file reader
//
// $Id: XplorMapReader.cpp,v 1.1 2010/01/16 15:32:08 rishitani Exp $

#include <common.h>

#include "XplorMapReader.hpp"
#include "DensityMap.hpp"

#include <qlib/ClassRegistry.hpp>
#include <qlib/LClassUtils.hpp>

using namespace xtal;

MC_DYNCLASS_IMPL(XplorMapReader, XplorMapReader, qlib::LSpecificClass<XplorMapReader>);

// default constructor
XplorMapReader::XplorMapReader()
     : m_pMap(NULL), m_fbuf(NULL)
{
}

// destructor
XplorMapReader::~XplorMapReader()
{
  if (m_fbuf!=NULL)
    delete [] m_fbuf;
}

///////////////////////////////////////////

/// create default object for this reader
qsys::ObjectPtr XplorMapReader::createDefaultObj() const
{
  return qsys::ObjectPtr(new DensityMap());
  //return new DensityMap();
}

/// get nickname for scripting
const char *XplorMapReader::getName() const
{
  return "xplormap";
}

/// get file-type description
const char *XplorMapReader::getTypeDescr() const
{
  return "XPLOR/CNS Density Map(*.map;*.cns)";
}

/// get file extension
const char *XplorMapReader::getFileExt() const
{
  return "*.map;*.cns";
}

///////////////////////////////////////////

bool XplorMapReader::read(qlib::InStream &arg)
{
  // get the target object (DensityMap)
  m_pMap = getTarget<DensityMap>();
  if (m_pMap==NULL) return false;

  qlib::LineStream ins(arg);

  readHeader(ins);
  
  LOG_DPRINT("X-PLOR MapFile read...\n");
  LOG_DPRINT("  map size : (%d, %d, %d)\n", m_ncol, m_nrow, m_nsect);
  LOG_DPRINT("  map start: (%d, %d, %d)\n", m_stacol, m_starow, m_stasect);
  //LOG_DPRINT("  map axis order : (%d,%d,%d)\n", axcol, axrow, axsect);

  LOG_DPRINT("  unit cell a=%.2fA, b=%.2fA, c=%.2fA,\n", m_cella, m_cellb, m_cellc);
  LOG_DPRINT("            alpha=%.2fdeg, beta=%.2fdeg, gamma=%.2fdeg,\n",
             m_alpha, m_beta, m_gamma);

  //
  //  allocate memory
  //
  int ntotal = m_ncol*m_nrow*m_nsect;
  if (m_fbuf!=NULL)
    delete [] m_fbuf;
  m_fbuf = new float[ntotal];
  LOG_DPRINT("memory allocation %d bytes\n", ntotal*4);
  if (m_fbuf==NULL) {
    MB_THROW(qlib::OutOfMemoryException, "X-PLOR MapFile read: cannot allocate memory");
    return false;
  }

  m_nFloatArrayCurPos = 0;
  m_nFloatArraySize = 0;

  int ii=0;
  for (int isec=0; isec<m_nsect; isec++) {
    readRecord(ins);
    int ksec;

    // check section number
    if (!getSectNo(ksec) || ksec!=isec) {
      MB_THROW(qlib::FileFormatException,
	       LString::format("X-PLOR MapFile format error (at line %d)", ins.getLineNo()));
      return false;
    }

    // load one section
    for (int irow=0; irow<m_nrow; irow++) {
      for (int icol=0; icol<m_ncol; icol++) {
        double rho;
        readDensity(ins, rho);
        m_fbuf[ii] = (float)rho;
        ii++;
      }
    }
  }

  //////////////////////////////////////

  try {
    // copy fbuf array to the MbObject object.
    //  This method also performs axis rotation.
    m_pMap->setMapFloatArray(m_fbuf, m_ncol, m_nrow, m_nsect, 0, 1, 2);
  }
  catch (...) {
    delete [] m_fbuf;
    m_fbuf = NULL;
    throw;
  }

  delete [] m_fbuf;
  m_fbuf = NULL;

  // setup map dimension parameters
  m_pMap->setMapParams(m_stacol, m_starow, m_stasect, m_na, m_nb, m_nc);

  // setup crystal parameters
  m_pMap->setXtalParams(m_cella, m_cellb, m_cellc, m_alpha, m_beta, m_gamma);

  // m_pMap->setOrigFileType("xplormap");
  return true;
}


void XplorMapReader::readRecord(qlib::LineStream &ins)
{
  if (!ins.ready()) {
    MB_THROW(qlib::FileFormatException, "Invalid map format");
  }
  else {
    LString tmp = ins.readLine(); //.toUpperCase();
    LChar::copy(tmp.c_str(), m_recbuf, BUFSIZE);
    LChar::trim(m_recbuf);
    m_nbuflen = LChar::length(m_recbuf);
  }
}

/**
   Copy start~end region of line buffer.
   The returned region includes 'end' position,
   e.g. length is (end-start+1).
*/
char *XplorMapReader::readStr(int start, int end)
{
  if (end >= m_nbuflen)
    end = m_nbuflen-1;

  if (start<0)
    start = 0;
  if (start>end)
    start = end;

  LChar::substr(m_recbuf, start, end+1, m_tmpbuf);
  // LString r = m_recbuf.mid(start, end-start+1);
  return m_tmpbuf;
}

bool XplorMapReader::readSectionInfo()
{
  LString sNA, sAMIN, sAMAX, sNB, sBMIN, sBMAX, sNC, sCMIN, sCMAX;

  if (m_nbuflen<72) {
    // MB_THROW(qlib::FileFormatException, "Invali Xplor map format (section info)");
    return false;
  }

  sNA = readStrBlock(8, 0); //m_buf.mid(8*0, 8);
  sAMIN = readStrBlock(8, 1);// m_buf.mid(8*1, 8);
  sAMAX = readStrBlock(8, 2);//m_buf.mid(8*2, 8);

  sNB = readStrBlock(8, 3);//m_buf.mid(8*3, 8);
  sBMIN = readStrBlock(8, 4);//m_buf.mid(8*4, 8);
  sBMAX = readStrBlock(8, 5);//m_buf.mid(8*5, 8);

  sNC = readStrBlock(8, 6);//m_buf.mid(8*6, 8);
  sCMIN = readStrBlock(8, 7);//m_buf.mid(8*7, 8);
  sCMAX = readStrBlock(8, 8);//m_buf.mid(8*8, 8);

  if (!sNA.toInt(&m_na) ||
      !sNB.toInt(&m_nb) ||
      !sNC.toInt(&m_nc) ||
      !sAMIN.toInt(&m_stacol) ||
      !sBMIN.toInt(&m_starow) ||
      !sCMIN.toInt(&m_stasect) ||
      !sAMAX.toInt(&m_endcol) ||
      !sBMAX.toInt(&m_endrow) ||
      !sCMAX.toInt(&m_endsect)) {
    // MB_THROW(qlib::FileFormatException, "Invali Xplor map format (section info)");
    return false;
  }

  m_ncol = m_endcol - m_stacol+1;
  m_nrow = m_endrow - m_starow+1;
  m_nsect = m_endsect - m_stasect+1;

  return true;

// 0.10047E+03 0.10047E+03 0.36624E+03 0.90000E+02 0.90000E+02 0.90000E+02
}

bool XplorMapReader::readCellInfo()
{
  LString sa, sb, sc;
  LString salp, sbet, sgam;

  if (m_nbuflen<72) {
    // MB_THROW(qlib::FileFormatException, "Invali Xplor map format (section info)");
    return false;
  }

  sa = readStrBlock(12, 0); //m_buf.mid(12*0, 12);
  sb = readStrBlock(12, 1); //m_buf.mid(12*1, 12);
  sc = readStrBlock(12, 2); //m_buf.mid(12*2, 12);

  salp = readStrBlock(12, 3); //m_buf.mid(12*3, 12);
  sbet = readStrBlock(12, 4); //m_buf.mid(12*4, 12);
  sgam = readStrBlock(12, 5); //m_buf.mid(12*5, 12);

  if (!sa.toDouble(&m_cella) ||
      !sb.toDouble(&m_cellb) ||
      !sc.toDouble(&m_cellc) ||
      !salp.toDouble(&m_alpha) ||
      !sbet.toDouble(&m_beta) ||
      !sgam.toDouble(&m_gamma)) {
    // MB_THROW(qlib::FileFormatException, "Invali Xplor map format (section info)");
    return false;
  }

  return true;
}

bool XplorMapReader::readAxisInfo()
{
  // if (!m_buf.startsWith("ZYX"))
  if (!LChar::startsWith(m_recbuf, "ZYX"))
    return false;
  return true;
}

void XplorMapReader::readFloatArray()
{
  int nlen = m_nbuflen; //m_buf.length();
  m_nFloatArraySize = nlen/12;
  if (m_nFloatArraySize>6) {
    MB_THROW(qlib::FileFormatException,"Invalid map format");
    return;
  }

  for (int i=0; i<m_nFloatArraySize; i++) {
    char *stmp = readStrBlock(12, i);
    double fdata;
    if (!LChar::toDouble(stmp, fdata)) {
      MB_THROW(qlib::FileFormatException, "Invalid map format");
      return;
    }
    m_floatArray[i] = fdata;
  }

  m_nFloatArrayCurPos = 0;
}

void XplorMapReader::readDensity(qlib::LineStream &ins, double &rho)
{
  if (m_nFloatArrayCurPos>=m_nFloatArraySize) {
    readRecord(ins);
    readFloatArray();
  }

  rho = m_floatArray[m_nFloatArrayCurPos];
  m_nFloatArrayCurPos ++;
}

void XplorMapReader::readHeader(qlib::LineStream &ins)
{
  // skip the header remarks
  int ntit =-1;
  for ( ;; ) {
    readRecord(ins);

    LString stit;

    if (m_nbuflen<8)
      continue;
      
    stit = m_recbuf;
    stit = stit.left(8);
    stit = stit.trim();
      
    if (stit.toInt(&ntit))
      break;
  }

  if (ntit<0 || ntit>1000) {
    MB_THROW(qlib::FileFormatException, "Invalid map format");
    return;
  }

  int i;
  for (i=0; i<ntit; i++) {
    readRecord(ins);

    if (LChar::startsWith(m_recbuf, " REMARKS")) {
      LString msg = m_recbuf;
      msg = msg.mid(9);
      LOG_DPRINTLN("X-PLOR MapFile> %s",msg.c_str());
    }
  }

  bool fOK = false;
  for (i=0; i<10; i++) {
    readRecord(ins);

    if (readSectionInfo()) {
      fOK = true;
      break;
    }
  }
  if (!fOK) {
    MB_THROW(qlib::FileFormatException, "Invalid map format");
    return;
  }

  fOK = false;
  for (i=0; i<10; i++) {
    readRecord(ins);
    
    if (readCellInfo()) {
      fOK = true;
      break;
    }
  }
  if (!fOK) {
    MB_THROW(qlib::FileFormatException, "Invalid map format");
    return;
  }

  fOK = false;
  for (i=0; i<10; i++) {
    readRecord(ins);
    
    if (readAxisInfo()) {
      fOK = true;
      break;
    }
  }
  if (!fOK) {
    MB_THROW(qlib::FileFormatException, "Invalid map format");
    return;
  }

}

