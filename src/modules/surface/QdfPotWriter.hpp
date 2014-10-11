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
  virtual ~QdfPotWriter();

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
  //void writeFaceData();

  //ElePotMap *obj() const {
  //return super_t::getTarget<ElePotMap>();
  //}

};

} // namespace molstr

#endif
