// -*-Mode: C++;-*-
//
// Fortran unformatted record input filter
//

#ifndef FORTRAN_BINARY_INPUT_STREAM_H__
#define FORTRAN_BINARY_INPUT_STREAM_H__

#include "mdtools.hpp"

#include <qlib/mcutils.hpp>
#include <qlib/BinStream.hpp>
#include <qlib/LExceptions.hpp>

namespace mdtools {

MB_DECL_EXCPT_CLASS(MDTOOLS_API, FortBinFormatException, qlib::FileFormatException);

///
/// Fortran unformatted input filter stream.
///
/// Reads the [int32 len][payload][int32 len] record framing used by DCD
/// files. Byte order is inherited from the underlying BinInStream (native
/// by default).
///
class MDTOOLS_API FortBinInStream : public qlib::BinInStream
{
private:
    /// unit size of record word (default: 4 bytes)
    int m_nWordSize;

    /// length of the pending record, or -1 when none is pending
    int m_nCurRecSize;

    typedef qlib::BinInStream super_t;

public:
    FortBinInStream() : super_t(), m_nWordSize(4), m_nCurRecSize(-1) {}

    FortBinInStream(InStream &r) : super_t(r), m_nWordSize(4), m_nCurRecSize(-1) {}

    /// copy ctor
    FortBinInStream(FortBinInStream &r) : super_t(r), m_nWordSize(4), m_nCurRecSize(-1)
    {
    }

    /// destructor
    virtual ~FortBinInStream();

    /// copy operator
    const FortBinInStream &operator=(const FortBinInStream &arg)
    {
        super_t::operator=(arg);
        return *this;
    }

    //////////////////////////////////////
    // specific methods

    /// Read the leading record-length marker (cached until the record is
    /// consumed). Does not throw on a negative length.
    int getRecordSize() noexcept;

    /// Same as getRecordSize() but throws on a negative length.
    int getRecordSize_throw();

    /// Read the payload of the pending record and advance to the next one.
    /// buf==NULL skips the record; nsize<recsize reads a prefix and skips
    /// the rest. Returns the number of bytes read.
    int readRecord(void *buf, int nsize);

private:
    void checkRec();

};  // class FortBinInStream

}  // namespace mdtools

#endif
