// -*-Mode: C++;-*-
//
// QDF DensityMap File writer class
//

#ifndef XTAL_QDFDENMAP_WRITER_HPP
#define XTAL_QDFDENMAP_WRITER_HPP

#include "xtal.hpp"

#include <qlib/mcutils.hpp>
#include <qlib/LExceptions.hpp>
#include <qsys/QdfAbsWriter.hpp>

namespace xtal {

  class DensityMap;
  using qlib::LString;

  class QdfDenMapWriter : public qsys::QdfAbsWriter
  {
    MC_DYNCLASS;

  private:
    typedef QdfAbsWriter super_t;

    DensityMap *m_pObj;

    /// Max records per QDF data chunk (the record count is a 32-bit int);
    /// lowered by tests to exercise the split (MAP2) layout
    size_t m_nChunkLimit;

    /// Chunking of the sample block decided by write()
    bool m_bSplit;
    int m_nSecChunk;
    int m_nChunks;

  public:
    QdfDenMapWriter();
    ~QdfDenMapWriter() override;

    size_t getChunkLimit() const { return m_nChunkLimit; }
    void setChunkLimit(size_t n) { m_nChunkLimit = n; }

    /// Attach to and lock the target object
    void attach(qsys::ObjectPtr pObj) override;

    /// Write to the stream
    bool write(qlib::OutStream &outs) override;

    /// Get file-type description
    const char *getTypeDescr() const override;

    /// Get file extension
    const char *getFileExt() const override;

    const char *getName() const override;

    bool canHandle(qsys::ObjectPtr pobj) const override;

    /////////

  private:

    void writeData();
  };

} // namespace molstr

#endif
