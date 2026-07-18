// -*-Mode: C++;-*-
//
// QDF MolSurf File writer class
//

#ifndef SURFACE_QDFSURF_WRITER_HPP
#define SURFACE_QDFSURF_WRITER_HPP

#include "surface.hpp"

#include <qlib/mcutils.hpp>
#include <qlib/LExceptions.hpp>
#include <qsys/QdfAbsWriter.hpp>

namespace surface {

class MolSurfObj;
using qlib::LString;

class QdfSurfWriter : public qsys::QdfAbsWriter
{
  //MC_SCRIPTABLE;
  MC_DYNCLASS;

private:
  typedef QdfAbsWriter super_t;

  MolSurfObj *m_pObj;

public:
  QdfSurfWriter();
  ~QdfSurfWriter() override;

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

  void writeVertData();
  void writeFaceData();

  MolSurfObj *obj() const {
    return super_t::getTarget<MolSurfObj>();
  }

};

} // namespace molstr

#endif
