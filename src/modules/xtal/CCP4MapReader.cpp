// -*-Mode: C++;-*-
//
// CCP4 Map file reader
//
// $Id: CCP4MapReader.cpp,v 1.5 2010/09/11 17:54:46 rishitani Exp $

#include <common.h>

#include "CCP4MapReader.hpp"
#include "CCP4InStream.hpp"
#include "DensityMap.hpp"

#include <qlib/StringStream.hpp>
#include <qlib/ClassRegistry.hpp>
#include <qlib/LClassUtils.hpp>

using namespace xtal;
using qlib::StrInStream;

MC_DYNCLASS_IMPL(CCP4MapReader, CCP4MapReader, qlib::LSpecificClass<CCP4MapReader>);

// default constructor
CCP4MapReader::CCP4MapReader()
{
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
  return "CCP4 Density Map(*.map;*.ccp4;*.ccp4.gz)";
}

/// get file extension
const char *CCP4MapReader::getFileExt() const
{
  // return "*.map; *.ccp4";
  return "*.map; *.ccp4; *.ccp4.gz";
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

  // check byte order
  in.readFully(sbuf, 0, 4);
  int iType = (sbuf[1]>>4) & 0x0F;
  int fType = (sbuf[0]>>4) & 0x0F;
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
  {
    // read number of (col,row,sec)
    hdrin.fetch_int(ncol);
    hdrin.fetch_int(nrow);
    hdrin.fetch_int(nsect);

    hdrin.fetch_int(nmode);
    if (nmode!=2) {
      LString msg = LString::format("CCP4MapReader read: unsupported mode %d\n",nmode);
      LOG_DPRINTLN(msg);
      MB_THROW(qlib::FileFormatException, msg);
      return false;
    }

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
  }

  LOG_DPRINT("CCP4MapReader read...\n");
  LOG_DPRINT("  map size  : (%d,%d,%d)\n", ncol, nrow, nsect);
  LOG_DPRINT("  map start : (%d,%d,%d)\n", stacol, starow, stasect);
  LOG_DPRINT("  map axis order : (%d,%d,%d)\n", axcol, axrow, axsect);
  LOG_DPRINT("  unit cell a=%.2fA, b=%.2fA, c=%.2fA,\n", alen, blen, clen);
  LOG_DPRINT("    alpha=%.2fdeg, beta=%.2fdeg, gamma=%.2fdeg,\n",
	    alpha, beta, gamma);
  LOG_DPRINT("  map minimum density  : %f\n", rhomin);
  LOG_DPRINT("  map maximum density  : %f\n", rhomax);
  LOG_DPRINT("  map mean density     : %f\n", rhomean);
  LOG_DPRINT("  map density r.m.s.d. : %f\n", rhosig);

  //////////////////////////////////////

  // read float density map
  in.skip((256*4+nsymbt)-(HDR_SIZE+3*4));
  // fseek(fp, 256*4+nsymbt, SEEK_SET);
  int ntotal = ncol*nrow*nsect;
  float *fbuf = new float[ntotal];
  LOG_DPRINT("memory allocation %d bytes\n", ntotal*sizeof (float));
  if (fbuf==NULL) {
    MB_THROW(qlib::OutOfMemoryException, "CCP4MapReader read: cannot allocate memory");
    return false;
  }

  in.fetch_floatArray(fbuf, ntotal);

  // copy fbuf array to the IfDenMap object.
  //  This method also performs axis rotation.
  pMap->setMapFloatArray(fbuf, ncol, nrow, nsect,
				axcol-1, axrow-1, axsect-1);

  // rotate start index numbers
  rotate(stacol, starow, stasect, axcol-1, axrow-1, axsect-1);

  pMap->setMapParams(stacol, starow, stasect, nx, ny, nz);

  // setup crystal parameters
  pMap->setXtalParams(alen, blen, clen, alpha, beta, gamma, nspgrp);

  delete [] fbuf;

  // pMap->setOrigFileType("ccp4map");

  return true;
}


