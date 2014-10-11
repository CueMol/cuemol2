// -*-Mode: C++;-*-
//
// OpenDX potential map (by APBS) reader
//
// $Id: OpenDXPotReader.hpp,v 1.1 2010/03/13 17:01:18 rishitani Exp $

#ifndef OPENDX_APBS_READER__
#define OPENDX_APBS_READER__

#include "surface.hpp"

#include <qlib/mcutils.hpp>
#include <qsys/ObjReader.hpp>

namespace qlib {
  class LineStream;
}

class OpenDXPotReader_wrap;

namespace surface {

class ElePotMap;

class OpenDXPotReader : public qsys::ObjReader
{
  MC_SCRIPTABLE;

private:
  // target building density map
  ElePotMap *m_pMap;

  friend class ::OpenDXPotReader_wrap;

  double m_dSmooth;

  ///////////////////////////////////////////
public:
  // default constructor
  OpenDXPotReader();

  // destructor
  virtual ~OpenDXPotReader();

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

  LString m_recbuf;
  void readRecord(qlib::LineStream &ins);
  void readHeader(qlib::LineStream &ins);
  void readDensity(qlib::LineStream &ins, double &rho);

  int m_nx, m_ny, m_nz;
  double m_xmin, m_ymin, m_zmin;
  double m_hx, m_hy, m_hz;

#define RECORD_LEN 3

  int m_navail;
  double m_frec[RECORD_LEN];
};

}

#endif

