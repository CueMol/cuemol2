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
  virtual ~QdfSurfWriter();

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

  void writeVertData();
  void writeFaceData();

  MolSurfObj *obj() const {
    return super_t::getTarget<MolSurfObj>();
  }

};

} // namespace molstr

#endif
