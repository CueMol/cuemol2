// -*-Mode: C++;-*-
//
// QDF ElePot File reader class
//

#ifndef SURFACE_QDFPOT_READER_HPP
#define SURFACE_QDFPOT_READER_HPP

#include "surface.hpp"

#include <qlib/mcutils.hpp>
#include <qlib/LExceptions.hpp>
#include <qsys/QdfAbsReader.hpp>

namespace surface {

class ElePotMap;
using qlib::LString;

class QdfPotReader : public qsys::QdfAbsReader
{
  //MC_SCRIPTABLE;
  MC_DYNCLASS;

private:
  typedef QdfAbsReader super_t;

  ElePotMap *m_pObj;

public:
  // default constructor
  QdfPotReader();

  // destructor
  ~QdfPotReader() override;

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

  void readData();

  int m_nx, m_ny, m_nz;

  void readDataArray(float *);

  //void readDataArray2();

};

}

#endif

