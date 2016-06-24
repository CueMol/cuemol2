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
  virtual ~QdfPotReader();

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

  void readData();

  int m_nx, m_ny, m_nz;

  void readDataArray(float *);

  //void readDataArray2();

};

}

#endif

