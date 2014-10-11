// -*-Mode: C++;-*-
//
// CCP4 Map file reader
//

#ifndef XTAL_CCP4_MAP_READER_HPP_INCLUDED
#define XTAL_CCP4_MAP_READER_HPP_INCLUDED

#include "xtal.hpp"

#include <qlib/mcutils.hpp>
#include <qlib/LExceptions.hpp>
#include <qsys/ObjReader.hpp>

#include "CCP4InStream.hpp"

namespace xtal {

// class DensityMap;

class CCP4MapReader : public qsys::ObjReader
{
  MC_DYNCLASS;

private:

  ///////////////////////////////////////////
public:
  /** default constructor */
  CCP4MapReader();

  /** destructor */
  virtual ~CCP4MapReader();

  //////////////////////////////////////////////
  // Read/build methods
  
  ///
  /// Read from the input stream ins, and build the attached object.
  ///
  virtual bool read(qlib::InStream &ins);

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

  ///////////////////////////////////////////

  //virtual void attach(MbObject *pMap) throw (InvalidObjNameException);
  //virtual MbObject *detach();
  //virtual bool isCompat(MbObject *pobj) const;

  ///////////////////////////////////////////

private:
  // helper method
  static void rotate(int &e0, int &e1, int &e2,
		     int ax0, int ax1, int ax2) {
    int r[3];
    r[ax0] = e0;
    r[ax1] = e1;
    r[ax2] = e2;
    e0 = r[0];
    e1 = r[1];
    e2 = r[2];
  }
  
};

}

#endif

