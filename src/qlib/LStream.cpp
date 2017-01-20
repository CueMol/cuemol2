// -*-Mode: C++;-*-
//
// Input/output streams implementation
//

#include <common.h>

#include "LStream.hpp"
#include "LString.hpp"
#include "LExceptions.hpp"

// for yield
#include <boost/thread.hpp>

using namespace qlib;

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

bool InStream::isSeekable() const
{
  return false;
}

void InStream::setFilePos(qint64 pos)
{
}

qint64 InStream::getFilePos() const
{
  return 0;
}

bool InStreamAdaptor::ready() {
  return getImpl()->ready();
}
  
int InStreamAdaptor::read() {
  return getImpl()->read();
}
  
int InStreamAdaptor::read(char *buf, int off, int len) {
  return getImpl()->read(buf, off, len);
}

int InStreamAdaptor::skip(int len) {
  return getImpl()->skip(len);
}

void InStreamAdaptor::close() {
  return getImpl()->i_close();
}

LString InStreamAdaptor::getURI() const {
  return getImpl()->getSrcURI();
}

int OutStreamAdaptor::write(const char *buf, int off, int len) {
  return getImpl()->write(buf, off, len);
}
    
void OutStreamAdaptor::write(int b) {
  return getImpl()->write(b);
}

void OutStreamAdaptor::flush() {
  getImpl()->flush();
}

void OutStreamAdaptor::close() {
  getImpl()->o_close();
}

LString OutStreamAdaptor::getURI() const {
  return getImpl()->getDestURI();
}

