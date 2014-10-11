// -*-Mode: C++;-*-
//
// QDF MolSurf File reader class
//

#ifndef SURFACE_QDFSURF_READER_HPP
#define SURFACE_QDFSURF_READER_HPP

#include "surface.hpp"

#include <qlib/mcutils.hpp>
#include <qlib/LExceptions.hpp>
#include <qsys/QdfAbsReader.hpp>

namespace surface {

class MolSurfObj;
using qlib::LString;

class QdfSurfReader : public qsys::QdfAbsReader
{
  //MC_SCRIPTABLE;
  MC_DYNCLASS;

private:
  typedef QdfAbsReader super_t;

  MolSurfObj *m_pObj;

public:
  // default constructor
  QdfSurfReader();

  // destructor
  virtual ~QdfSurfReader();

  //////////////////////////////////////////////
  // Information query methods
  
  /// get the nickname of this reader (referred from script interface)
  virtual const char *getName() const;

  /// get file-type description
  virtual const char *getTypeDescr() const;

  /// get file extension
  virtual const char *getFileExt() const;

  /// create default object for this reader
  virtual qsys::ObjectPtr createDefaultObj() const;

  //////////////////////////////////////////////
  // Read/build methods
  
  ///
  /// Read from the input stream ins, and build the attached object.
  ///
  virtual bool read(qlib::InStream &ins);

  ///////////////////////////////////////////

private:

  void readVertData();
  void readFaceData();

};

}

#endif

