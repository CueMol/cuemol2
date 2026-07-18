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

  public:
    QdfDenMapWriter();
    ~QdfDenMapWriter() override;

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
