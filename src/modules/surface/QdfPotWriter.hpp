// -*-Mode: C++;-*-
//
// QDF MolSurf File writer class
//

#ifndef SURFACE_QDFPOT_WRITER_HPP
#define SURFACE_QDFPOT_WRITER_HPP

#include "surface.hpp"

#include <qlib/mcutils.hpp>
#include <qlib/LExceptions.hpp>
#include <qsys/QdfAbsWriter.hpp>

namespace surface {

class ElePotMap;
using qlib::LString;

class QdfPotWriter : public qsys::QdfAbsWriter
{
  //MC_SCRIPTABLE;
  MC_DYNCLASS;

private:
  typedef QdfAbsWriter super_t;

  ElePotMap *m_pObj;

public:
  QdfPotWriter();
  ~QdfPotWriter() override;

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
  //void writeFaceData();

  //ElePotMap *obj() const {
  //return super_t::getTarget<ElePotMap>();
  //}

};

} // namespace molstr

#endif
