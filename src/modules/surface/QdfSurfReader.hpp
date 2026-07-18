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
  ~QdfSurfReader() override;

  //////////////////////////////////////////////
  // Information query methods
  
  /// get the nickname of this reader (referred from script interface)
  const char *getName() const override;

  /// get file-type description
  const char *getTypeDescr() const override;

  /// get file extension
  const char *getFileExt() const override;

  /// create default object for this reader
  qsys::ObjectPtr createDefaultObj() const override;

  //////////////////////////////////////////////
  // Read/build methods
  
  ///
  /// Read from the input stream ins, and build the attached object.
  ///
  bool read(qlib::InStream &ins) override;

  ///////////////////////////////////////////

private:

  void readVertData();
  void readFaceData();

  void readVertData2();
  void readFaceData2();
};

}

#endif

