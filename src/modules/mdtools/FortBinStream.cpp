// -*-Mode: C++;-*-
//
// Fortran unformatted record input filter
//

#include <common.h>

#include <qlib/LString.hpp>
#include "FortBinStream.hpp"

using namespace mdtools;
using qlib::LString;

FortBinInStream::~FortBinInStream()
{
}

int FortBinInStream::getRecordSize() noexcept
{
    if (m_nCurRecSize >= 0) return m_nCurRecSize;

    m_nCurRecSize = super_t::tread<int>();
    return m_nCurRecSize;
}

int FortBinInStream::getRecordSize_throw()
{
    int nres = getRecordSize();
    if (nres < 0) {
        LString msg = LString::format("FortBinIn: invalid record size (%d)", nres);
        MB_DPRINTLN("%s", msg.c_str());
        MB_THROW(FortBinFormatException, msg);
    }
    return nres;
}

/// read one record and proceeds to the next record
int FortBinInStream::readRecord(void *buf, int nsize)
{
    if (m_nCurRecSize < 0) {
        MB_THROW(FortBinFormatException, "readRecord");
        return -1;
    }

    char *pp = (char *)buf;

    int nret = 0;
    if (pp == NULL) {
        // skip the whole record
        super_t::skip(m_nCurRecSize);
        checkRec();
    } else if (nsize >= m_nCurRecSize) {
        // read the whole record
        nret = m_nCurRecSize;
        super_t::readFully(pp, 0, m_nCurRecSize);
        checkRec();
    } else {
        // read the requested prefix and skip the rest
        nret = nsize;
        super_t::readFully(pp, 0, nsize);
        super_t::skip(m_nCurRecSize - nsize);
        checkRec();
    }

    return nret;
}

void FortBinInStream::checkRec()
{
    int chk = super_t::tread<int>();
    if (chk != m_nCurRecSize) {
        LString msg = LString::format("readRecord: record length mismatch (%d!=%d)",
                                      m_nCurRecSize, chk);
        MB_THROW(FortBinFormatException, msg);
        return;
    }

    m_nCurRecSize = -1;
    return;
}
