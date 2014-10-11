// -*-Mode: C++;-*-
//
// QDF MolCoord File writer class
//

#ifndef MOLSTR_QDFMOL_WRITER_HPP
#define MOLSTR_QDFMOL_WRITER_HPP

#include "molstr.hpp"

#include <qlib/mcutils.hpp>
#include <qlib/LExceptions.hpp>
#include <qsys/QdfAbsWriter.hpp>

namespace molstr {

using qlib::LString;

class QdfMolWriter : public qsys::QdfAbsWriter
{
  //MC_SCRIPTABLE;
  MC_DYNCLASS;

private:
  typedef ObjWriter super_t;

  MolCoord *m_pMol;

public:
  QdfMolWriter();
  virtual ~QdfMolWriter();

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
  //

  /// aid-->rid table
  std::map<int, int> m_ridmap;

  void writeChainData();
  void writeResidData();
  void writeAtomData();

  MolCoord *mol() const {
    return super_t::getTarget<MolCoord>();
  }

};

} // namespace molstr

#endif
