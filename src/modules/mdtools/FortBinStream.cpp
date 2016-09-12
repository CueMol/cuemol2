// -*-Mode: C++;-*-
//
// Fortran unformatted record input/output filter
//

#include <common.h>

#include <qlib/LString.hpp>
#include "FortBinStream.hpp"

using namespace mdtools;
using qlib::LString;

FortBinInStream::~FortBinInStream()
{
}

int FortBinInStream::getRecordSize() throw ()
{
  if (m_nCurRecSize>=0)
    return m_nCurRecSize;

  m_nCurRecSize = super_t::tread<int>();
  return m_nCurRecSize;
}

int FortBinInStream::getRecordSize_throw()
{
  int nres = getRecordSize();
  if (nres<0) {
    LString msg =
      LString::format("FortBinIn: invalid record size (%d)", nres);
    MB_DPRINTLN(msg);
    MB_THROW(FortBinFormatException, msg);
  }
  return nres;
}

/// read one record and proceeds next record
int FortBinInStream::readRecord(void *buf, int nsize)
{
  if (m_nCurRecSize<0) {
    MB_THROW(FortBinFormatException, "readRecord");
    return -1;
  }

  char *pp = (char *) buf;

  int nret = 0;
  if (pp==NULL) {
    // skip all
    int nskip = m_nCurRecSize;
    // MB_DPRINTLN("skip %d bytes", nskip);
    super_t::skip(nskip);
    checkRec();
  }
  else if (nsize>=m_nCurRecSize) {
    // read whole date
    nret = m_nCurRecSize;
    super_t::readFully(pp, 0, m_nCurRecSize);
    checkRec();
  }
  else {
    // read requested size
    nret = nsize;
    super_t::readFully(pp, 0, nsize);
    int nskip = m_nCurRecSize - nsize;
    // MB_DPRINTLN("skip %d bytes", nskip);
    super_t::skip(nskip);
    checkRec();
  }

  return nret;
}

void FortBinInStream::checkRec()
{
  int chk = super_t::tread<int>();
  if (chk!=m_nCurRecSize) {
    LString msg = LString::format("readRecord: record length mismatch (%d!=%d)", m_nCurRecSize, chk);
    MB_THROW(FortBinFormatException, msg);
    return;
  }

  m_nCurRecSize = -1;
  return;
}

