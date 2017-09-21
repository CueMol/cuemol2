// -*-Mode: C++;-*-
//
// TextImgBuf: scriptable image buffer for text rendering
//

#include <common.h>

#include "TextImgBuf.hpp"

#include <qlib/StringStream.hpp>
#include <qlib/Base64Stream.hpp>
#include <qlib/LByteArray.hpp>

using namespace gfx;

void TextImgBuf::setAt(int ind, int value)
{
  QUE_BYTE *pdata = data();
  if (pdata==NULL) {
    MB_THROW(IndexOutOfBoundsException,
             LString("TextImgBuf setAt() array is null"));
  }
  if (ind>=size()||ind<0) {
    MB_THROW(IndexOutOfBoundsException,
             LString::format("TextImgBuf setAt() out of index %d", ind));
  }
  pdata[ind] = (QUE_BYTE) value;
}

int TextImgBuf::getAt(int ind) const
{
  const QUE_BYTE *pdata = data();
  if (pdata==NULL) {
    MB_THROW(IndexOutOfBoundsException,
             LString("TextImgBuf setAt() array is null"));
  }
  if (ind>=size()||ind<0) {
    MB_THROW(IndexOutOfBoundsException,
             LString::format("TextImgBuf setAt() out of index %d", ind));
  }
  return pdata[ind];
}

void TextImgBuf::setAt2D(int x, int y, int value)
{
  QUE_BYTE *pdata = data();
  if (pdata==NULL) {
    MB_THROW(IndexOutOfBoundsException,
             LString("TextImgBuf setAt() array is null"));
  }
  size_t ind = x + y*getWidth();
  if (ind>=size()||ind<0) {
    MB_THROW(IndexOutOfBoundsException,
             LString::format("TextImgBuf setAt() out of index %d", ind));
  }
  pdata[ind] = (QUE_BYTE) value;
}

int TextImgBuf::getAt2D(int x, int y) const
{
  const QUE_BYTE *pdata = data();
  if (pdata==NULL) {
    MB_THROW(IndexOutOfBoundsException,
             LString("TextImgBuf setAt() array is null"));
  }
  size_t ind = x + y*getWidth();
  if (ind>=size()||ind<0) {
    MB_THROW(IndexOutOfBoundsException,
             LString::format("TextImgBuf setAt() out of index %d", ind));
  }
  return pdata[ind];
}

void TextImgBuf::setB64Str(const LString &str, int skip)
{
  QUE_BYTE *pdata = data();

  qlib::StrInStream strin(str);
  qlib::Base64InStream b64in(strin);

  const int nsize = size();
  int i, j;
  for (i=0; i<nsize; ++i) {
    if (!b64in.ready()) {
      MB_DPRINTLN("setB64Str> Warning: input is too short (%d)", i);
      break;
    }

    for (j=0; j<skip; ++j)
      b64in.read();

    //qbyte r = b64in.read();
    //qbyte g = b64in.read();
    //qbyte b = b64in.read();
    qbyte a = b64in.read();
    pdata[i] = a;
  }
}

void TextImgBuf::setByteArray(const qlib::LByteArrayPtr &pbuf, int skip)
{
  QUE_BYTE *pdata = data();

  const int nsize = size();
  int i, j=skip-1;
  for (i=0; i<nsize; ++i) {
    pdata[i] = pbuf->at(j);
    j+= skip;
  }
}

void TextImgBuf::dump() const
{
  for (int y=0; y<getHeight(); ++y) {
    for (int x=0; x<getWidth(); ++x) {
      int val = getAt2D(x, y);
      MB_DPRINT("%02X", val);
    }
    MB_DPRINTLN("");
  }
}
