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
    virtual ~QdfDenMapWriter();

    /// Attach to and lock the target object
    virtual void attach(qsys::ObjectPtr pObj);

    /// Write to the stream
    virtual bool write(qlib::OutStream &outs);

    /// Get file-type description
    virtual const char *getTypeDescr() const;

    /// Get file extension
    virtual const char *getFileExt() const;

    virtual const char *getName() const;

    virtual bool canHandle(qsys::ObjectPtr pobj) const;

    /////////

  private:

    void writeData();
  };

} // namespace molstr

#endif
