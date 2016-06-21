// -*-Mode: C++;-*-
//
// Binary data input/output streams
//
// $Id: BinStream.cpp,v 1.2 2011/04/01 13:43:22 rishitani Exp $

#include <common.h>

#include "BinStream.hpp"
#include "LString.hpp"

#include <boost/thread.hpp>

using namespace qlib;

BinInStream::~BinInStream()
{
}

void InStream::readFully(char *b, int off, int len)
{
  while (len > 0) {
    // in.read will block until some data is available.
    int numread = read(b, off, len);
    if (numread <= 0) {
      MB_THROW(EOFException, "Cannot read fully: Reached to the end of stream");
      return;
    }
    len -= numread;
    off += numread;

    if (len<=0)
      break;
    
    // facilitate context switching here, not to block the input thread
    boost::thread::yield();
  }
}

/////////////////////////////////////////////////////////////

BinOutStream::~BinOutStream()
{
}

