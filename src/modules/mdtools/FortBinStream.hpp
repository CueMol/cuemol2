// -*-Mode: C++;-*-
//
// Fortran unformatted record input/output filter
//

#ifndef FORTRAN_BINARY_INPUT_OUTPUT_STREAM_H__
#define FORTRAN_BINARY_INPUT_OUTPUT_STREAM_H__

#include "mdtools.hpp"

#include <qlib/mcutils.hpp>
#include <qlib/BinStream.hpp>
#include <qlib/LExceptions.hpp>

namespace mdtools {

  MB_DECL_EXCPT_CLASS(MDTOOLS_API, FortBinFormatException, qlib::FileFormatException);

  ///
  /// fortran unformatted input filter stream
  ///
  class MDTOOLS_API FortBinInStream : public qlib::BinInStream
  {
  private:
    /// unit size of record word (default: 4bytes)
    int m_nWordSize;

    int m_nCurRecSize;
    char *m_pCurRecData;

    typedef qlib::BinInStream super_t;

  public:
    FortBinInStream()
         : super_t(), m_nWordSize(4),
           m_nCurRecSize(-1), m_pCurRecData(NULL)
    {
    }

    FortBinInStream(InStream &r)
         : super_t(r), m_nWordSize(4),
           m_nCurRecSize(-1), m_pCurRecData(NULL)
    {
    }

    /// copy ctor
    FortBinInStream(FortBinInStream &r)
         : super_t(r), m_nWordSize(4),
           m_nCurRecSize(-1), m_pCurRecData(NULL)
    {
    }

    /// destructor
    virtual ~FortBinInStream();

    /// copy operator
    const FortBinInStream &operator=(const FortBinInStream &arg)
    {
      if (this!=&arg) {
        // m_nSwapMode = arg.m_nSwapMode;
      }
      super_t::operator=(arg);
      return *this;
    }

    //////////////////////////////////////
    // specific methods

    int getRecordSize() throw ();
    int getRecordSize_throw();

    /// read one record and proceeds next record
    int readRecord(void *buf, int nsize);

  private:
    void checkRec();

  }; // class FortBinInStream

} // namespace mdtools


#endif
