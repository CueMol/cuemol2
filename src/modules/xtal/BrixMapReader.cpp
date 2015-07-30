// -*-Mode: C++;-*-
//
// BRIX(new version of DSN6 format) map file loader
//
// $Id: BrixMapReader.cpp,v 1.1 2010/01/16 15:32:08 rishitani Exp $

#include <common.h>

#include "BrixMapReader.hpp"
#include "DensityMap.hpp"

#include <qlib/StringStream.hpp>
#include <qlib/BinStream.hpp>
#include <qlib/ClassRegistry.hpp>
#include <qlib/LClassUtils.hpp>

using namespace xtal;
using qlib::StrInStream;
using qlib::BinInStream;
using qlib::LChar;

// default constructor
BrixMapReader::BrixMapReader()
     : m_pMap(NULL), m_denbuf(NULL)
{
}

// destructor
BrixMapReader::~BrixMapReader()
{
  if (m_denbuf!=NULL)
    delete [] m_denbuf;
}

///////////////////////////////////////////

/// create default object for this reader
qsys::ObjectPtr BrixMapReader::createDefaultObj() const
{
  return qsys::ObjectPtr(new DensityMap());
  //return new DensityMap();
}

/// get nickname for scripting
const char *BrixMapReader::getName() const
{
  return "brix";
}

/// get file-type description
const char *BrixMapReader::getTypeDescr() const
{
  return "BRIX Density Map(*.brix;*.omap)";
}

/// get file extension
const char *BrixMapReader::getFileExt() const
{
  return "*.brix; *.omap; *.omap.gz";
}

///////////////////////////////////////////

bool BrixMapReader::read(qlib::InStream &ins)
{
  // get the target object (DensityMap)
  m_pMap = getTarget<DensityMap>();
  if (m_pMap==NULL) return false;

  bool fOK = readHeader(ins);
  if (!fOK)
    return false;
  
  LOG_DPRINTLN("BRIX> BRIX format density map file");
  LOG_DPRINTLN("BRIX> origin %d %d %d", m_stacol, m_starow, m_stasect);
  LOG_DPRINTLN("BRIX> extent %d %d %d", m_ncol, m_nrow, m_nsect);
  LOG_DPRINTLN("BRIX> grid   %d %d %d", m_na, m_nb, m_nc);
  LOG_DPRINTLN("BRIX> cell   %.2f %.2f %.2f", m_cella, m_cellb, m_cellc);
  LOG_DPRINTLN("BRIX>        %.2f %.2f %.2f", m_alpha, m_beta, m_gamma);
  LOG_DPRINTLN("BRIX> prod %.2f plus %.2f", m_prod, m_plus);

  int xbri = m_ncol/8;
  if (m_ncol%8>0) xbri++;
  int ybri = m_nrow/8;
  if (m_nrow%8>0) ybri++;
  int zbri = m_nsect/8;
  if (m_nsect%8>0) zbri++;

  LOG_DPRINTLN("BRIX> brix   %d %d %d", xbri, ybri, zbri);

  double rmax = (255.0-m_plus)/m_prod;
  double rmin = -m_plus/m_prod;

  LOG_DPRINTLN("BRIX> rhomin %f rhomax %f", rmin, rmax);

  int ntotal = m_ncol*m_nrow*m_nsect;
  if (m_denbuf!=NULL)
    delete [] m_denbuf;
  m_denbuf = new unsigned char[ntotal];
  LOG_DPRINT("BRIX> memory allocation %d bytes\n", ntotal*4);
  
  // fseek(fp, 512, SEEK_SET);
  double sum=0.0;
  double sqsum=0.0;
  int nadd=0;
  
  int ibx, iby, ibz, ix, iy, iz;
  for (ibz=0; ibz<zbri; ibz++)
    for (iby=0; iby<ybri; iby++)
      for (ibx=0; ibx<xbri; ibx++) {
        unsigned char buf[512];
        int res = ins.read((char*)buf, 0, 512);
        if (res!=512) {
          LOG_DPRINTLN("BRIX> read error (invalid file length). (%d %d %d) %d",ibx, iby, ibz, res);
          delete [] m_denbuf;
          m_denbuf = NULL;
          return false;
        }
        int bx = ibx*8;
        int by = iby*8;
        int bz = ibz*8;
        for (iz=0; iz<8; iz++)
          for (iy=0; iy<8; iy++)
            for (ix=0; ix<8; ix++) {
              if (bx+ix>=m_ncol ||
                  by+iy>=m_nrow ||
                  bz+iz>=m_nsect)
                continue;
              unsigned char val = buf[ix+(iy+iz*8)*8];
              setmap(bx+ix, by+iy, bz+iz,
                     val);
              sum += double(val);
              sqsum += double( int(val) * int(val) );
              ++nadd;
            }
      }

  double mean = (sum/double(nadd)) * m_prod + m_plus;
  double sqmean = (sqsum/double(nadd)) * m_prod + m_plus;
  double sigma = sqrt(sqmean-mean*mean);
  LOG_DPRINTLN("mean density=%f", mean);
  LOG_DPRINTLN("rms density=%f", sigma);

  //
  // setup DensityMap object
  //
  m_pMap->setMapByteArray(m_denbuf, m_ncol, m_nrow, m_nsect, rmin, rmax, mean, sigma);

  delete [] m_denbuf;
  m_denbuf = NULL;

  m_pMap->setMapParams(m_stacol, m_starow, m_stasect, m_na, m_nb, m_nc);

  // setup crystal parameters (BRIX format doesn't contain spgrp info: defaulting to P1)
  m_pMap->setXtalParams(m_cella, m_cellb, m_cellc, m_alpha, m_beta, m_gamma);

  //m_pMap->setOrigFileType("brix");
  return true;
}

bool BrixMapReader::readHeader(qlib::InStream &in)
{
  char sbuf[513];

  int res = in.read(sbuf, 0, 512);
  if (res!=512)
    return false;
  
  sbuf[512] = '\0';

  const char *delimitor = " ,\t\r\n";

  // check the "smiley" mark
  char *tok = strtok(sbuf, delimitor);
  if (tok==NULL)
    return false;
  if (!LChar::equals(tok, ":-)")) {
    return readDns6Header(sbuf);
  }
  
  //
  // read origin
  //
  tok = strtok(NULL, delimitor);
  if (tok==NULL)
    return false;
  LChar::toLower(tok);
  if (!LChar::equals(tok, "origin"))
    return false;

  // X
  tok = strtok(NULL, delimitor);
  if (tok==NULL)
    return false;
  int orig_x;
  if (!LChar::toInt(tok, orig_x))
    return false;

  // Y
  tok = strtok(NULL, delimitor);
  if (tok==NULL)
    return false;
  int orig_y;
  if (!LChar::toInt(tok, orig_y))
    return false;

  // Z
  tok = strtok(NULL, delimitor);
  if (tok==NULL)
    return false;
  int orig_z;
  if (!LChar::toInt(tok, orig_z))
    return false;
    

  //
  // read extent
  //
  tok = strtok(NULL, delimitor);
  if (tok==NULL)
    return false;
  LChar::toLower(tok);
  if (!LChar::equals(tok, "extent"))
    return false;

  // X
  tok = strtok(NULL, delimitor);
  if (tok==NULL)
    return false;
  int ext_x;
  if (!LChar::toInt(tok, ext_x))
    return false;

  // Y
  tok = strtok(NULL, delimitor);
  if (tok==NULL)
    return false;
  int ext_y;
  if (!LChar::toInt(tok, ext_y))
    return false;

  // Z
  tok = strtok(NULL, delimitor);
  if (tok==NULL)
    return false;
  int ext_z;
  if (!LChar::toInt(tok, ext_z))
    return false;


  //
  // read grid
  //
  tok = strtok(NULL, delimitor);
  if (tok==NULL)
    return false;
  LChar::toLower(tok);
  if (!LChar::equals(tok, "grid"))
    return false;

  // X
  tok = strtok(NULL, delimitor);
  if (tok==NULL)
    return false;
  int grid_x;
  if (!LChar::toInt(tok, grid_x))
    return false;

  // Y
  tok = strtok(NULL, delimitor);
  if (tok==NULL)
    return false;
  int grid_y;
  if (!LChar::toInt(tok, grid_y))
    return false;

  // Z
  tok = strtok(NULL, delimitor);
  if (tok==NULL)
    return false;
  int grid_z;
  if (!LChar::toInt(tok, grid_z))
    return false;


  //
  // read cell
  //
  tok = strtok(NULL, delimitor);
  if (tok==NULL)
    return false;
  LChar::toLower(tok);
  if (!LChar::equals(tok, "cell"))
    return false;

  // a
  tok = strtok(NULL, delimitor);
  if (tok==NULL)
    return false;
  if (!LChar::toDouble(tok, m_cella))
    return false;

  // b
  tok = strtok(NULL, delimitor);
  if (tok==NULL)
    return false;
  if (!LChar::toDouble(tok, m_cellb))
    return false;

  // c
  tok = strtok(NULL, delimitor);
  if (tok==NULL)
    return false;
  if (!LChar::toDouble(tok, m_cellc))
    return false;

  // alpha
  tok = strtok(NULL, delimitor);
  if (tok==NULL)
    return false;
  if (!LChar::toDouble(tok, m_alpha))
    return false;

  // beta
  tok = strtok(NULL, delimitor);
  if (tok==NULL)
    return false;
  if (!LChar::toDouble(tok, m_beta))
    return false;

  // gamma
  tok = strtok(NULL, delimitor);
  if (tok==NULL)
    return false;
  if (!LChar::toDouble(tok, m_gamma))
    return false;
  
  
  //
  // read prod
  //
  tok = strtok(NULL, delimitor);
  if (tok==NULL)
    return false;
  LChar::toLower(tok);
  if (!LChar::equals(tok, "prod"))
    return false;

  tok = strtok(NULL, delimitor);
  if (tok==NULL)
    return false;
  if (!LChar::toDouble(tok, m_prod))
    return false;

  //
  // read plus
  //
  tok = strtok(NULL, delimitor);
  if (tok==NULL)
    return false;
  LChar::toLower(tok);
  if (!LChar::equals(tok, "plus"))
    return false;

  tok = strtok(NULL, delimitor);
  if (tok==NULL)
    return false;
  if (!LChar::toDouble(tok, m_plus))
    return false;

  //
  // read sigma
  //
  tok = strtok(NULL, delimitor);
  if (tok==NULL)
    return false;
  LChar::toLower(tok);
  if (!LChar::equals(tok, "sigma"))
    return false;

  tok = strtok(NULL, delimitor);
  if (tok==NULL)
    return false;
  if (!LChar::toDouble(tok, m_sigma))
    return false;

  m_stacol = orig_x;
  m_starow = orig_y;
  m_stasect = orig_z;

  m_endcol = orig_x + ext_x;
  m_endrow = orig_y + ext_y;
  m_endsect = orig_z + ext_z;

  m_ncol = ext_x;
  m_nrow = ext_y;
  m_nsect = ext_z;

  m_na = grid_x;
  m_nb = grid_y;
  m_nc = grid_z;

  return true;
}

bool BrixMapReader::readDns6Header(const char *sbuf)
{
  StrInStream sin(sbuf, 512);
  BinInStream bin(sin);

  int header[19];
  
  for (int i = 0; i < 19; i++)
    header[i] = bin.readInt16();

  if (header[18] != 100) {
    StrInStream sin2(sbuf, 512);
    BinInStream bin2(sin2);
    bin2.setSwapMode(BinInStream::MODE_SWAP);
    for (int i = 0; i < 19; i++)
      header[i] = bin2.readInt16();
  }

  for (int i = 0; i < 19; i++)
    MB_DPRINTLN("hdr %d = %d", i, header[i]);

  if (header[18] != 100)
    return false;

  m_stacol = header[0];
  m_starow = header[1];
  m_stasect = header[2];

  m_ncol = header[3];
  m_nrow = header[4];
  m_nsect = header[5];

  m_endcol = m_stacol + header[3];
  m_endrow = m_starow + header[4];
  m_endsect = m_stasect + header[5];

  m_na = header[6];
  m_nb = header[7];
  m_nc = header[8];

  double a = header[9];
  double b = header[10];
  double c = header[11];
  double alpha = header[12];
  double beta = header[13];
  double gamma = header[14];

  double header16 = header[15]; // 100 * 255 / (dmax - dmin)
  double header17 = header[16]; // -255dmin / (dmax - dmin)
  double scalingFactor = header[17];
  double header19 = header[18];

  double dmin = (0 - header17) * header19 / header16;
  double dmax = (255 - header17) * header19 / header16;
  double drange = dmax - dmin;
  double byteFactor = drange / 255;
  
  double dminError1 = (0 - header17 - 0.5f) * header19 / (header16 - 0.5f);
  double dminError2 = (0 - header17 + 0.5f) * header19 / (header16 + 0.5f);
  double dmaxError1 = (255 - header17 - 0.5f) * header19 / (header16 - 0.5f);
  double dmaxError2 = (255 - header17 + 0.5f) * header19 / (header16 + 0.5f);
  
  double dminError = (int)((dminError2 - dminError1) / 0.002f) * 0.001f;
  double dmaxError = (int)((dmaxError2 - dmaxError1) / 0.002f) * 0.001f;
  
  MB_DPRINTLN("DNS6 dmin,dmax = %f+/-%f,%f+/-%f", dmin, dminError, dmax, dmaxError);

  m_cella = a / scalingFactor;
  m_cellb = b / scalingFactor;
  m_cellc = c / scalingFactor;
  m_alpha = alpha / scalingFactor;
  m_beta = beta / scalingFactor;
  m_gamma = gamma / scalingFactor;
  
  m_prod = byteFactor;
  m_plus = dmin;
  
  return true;
}

