// -*-Mode: C++;-*-
//
// CCP4 binary input filter stream
//
// $Id: CCP4InStream.cpp,v 1.2 2010/01/17 13:52:13 rishitani Exp $

#include <common.h>

#include "CCP4InStream.hpp"

using namespace xtal;
using qlib::LString;

/**
  determine the file's byte order
  @param iType byte-order sign for integer data type
  @param fType byte-order sign for float data type
  @return returns true if succeeded
  */
void CCP4InStream::setFileByteOrder(int iType, int fType)
{
  if (iType!=BO_BE && iType!=BO_LE) {
    LString msg = LString::format("CCP4InStream read: "
                                  "integer byteorder marker %d not supported.\n",
                                  iType);
    MB_THROW(qlib::FileFormatException, msg);
    return;
  }
  if (fType!=BO_BE && fType!=BO_LE) {
    LString msg = LString::format("CCP4InStream read: "
                                  "float byteorder marker %d not supported.\n",
                                  fType);
    MB_THROW(qlib::FileFormatException, msg);
    return;
  }
  
  m_intType = iType;
  m_fltType = fType;
}

void CCP4InStream::fetch_floatArray(float *fbuf, int size)
{
  readFully((char *)fbuf, 0, size*sizeof(float));

  if (m_fltType==m_fltNativeType) {
    // native byte order file
    return;
  }

  MB_DPRINTLN("CCP4InStream read : performing byte order conversion...");
  for (int i=0; i<size; i++) {
    unsigned char a;
    unsigned char *buf = (unsigned char *)(&fbuf[i]);
    a = buf[0];
    buf[0] = buf[3];
    buf[3] = a;
    a = buf[1];
    buf[1] = buf[2];
    buf[2] =a;
  }    
}
