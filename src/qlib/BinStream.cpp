// -*-Mode: C++;-*-
//
// Binary data input/output streams
//
// $Id: BinStream.cpp,v 1.2 2011/04/01 13:43:22 rishitani Exp $

#include <common.h>

#include "BinStream.hpp"

#include "LString.hpp"
using namespace qlib;

BinInStream::~BinInStream()
{
}

void BinInStream::readFully(char *b, int off, int len)
{
  while (len > 0) {
    // in.read will block until some data is available.
    int numread = super_t::read(b, off, len);
    if (numread <= 0) {
      MB_THROW(EOFException, "Cannot read fully: Reached to the end of stream");
      return;
    }
    len -= numread;
    off += numread;
  }
}

/////////////////////////////////////////////////////////////

BinOutStream::~BinOutStream()
{
}

