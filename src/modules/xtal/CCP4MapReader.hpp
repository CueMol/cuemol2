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

class CCP4MapReader_wrap;

namespace xtal {

// class DensityMap;

class XTAL_API CCP4MapReader : public qsys::ObjReader
{
  MC_SCRIPTABLE;

  friend class ::CCP4MapReader_wrap;

private:

  static const int MRC_TYPE_BYTE  =0;
  static const int MRC_TYPE_SHORT =1;
  static const int MRC_TYPE_FLOAT =2;
  static const int MRC_TYPE_SHORT2=3;
  static const int MRC_TYPE_FLOAT2=4;

  bool m_bNormalize;
  bool m_bTruncMin;
  double m_dMin;
  bool m_bTruncMax;
  double m_dMax;

  ///////////////////////////////////////////
public:
  /// default constructor
  CCP4MapReader();

  /// destructor
  ~CCP4MapReader() override;

  //////////////////////////////////////////////
  // Read/build methods
  
  ///
  /// Read from the input stream ins, and build the attached object.
  ///
  bool read(qlib::InStream &ins) override;

  /// Content-sniff: report whether `ins` looks like a CCP4/MRC map.
  int canHandleContent(qlib::InStream &ins) const override;

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

  ///////////////////////////////////////////

  //virtual void attach(MbObject *pMap);
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

