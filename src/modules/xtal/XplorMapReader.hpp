// -*-Mode: C++;-*-
//
// X-PLOR Map file reader
//
// $Id: XplorMapReader.hpp,v 1.2 2004/02/12 07:16:56 ri Exp $

#ifndef XTAL_XPLOR_MAP_READER__
#define XTAL_XPLOR_MAP_READER__

#include "xtal.hpp"

#include <qlib/mcutils.hpp>
#include <qlib/LExceptions.hpp>
#include <qlib/LineStream.hpp>
#include <qlib/LChar.hpp>

#include <qsys/ObjReader.hpp>

namespace xtal {
class DensityMap;
using qlib::LChar;

class XplorMapReader : public qsys::ObjReader
{
  MC_DYNCLASS;

private:
  enum { BUFSIZE=1024 };
  char m_recbuf[BUFSIZE];
  int m_nbuflen;
  // temporary buffer
  char m_tmpbuf[BUFSIZE];
  

  int m_stacol, m_starow, m_stasect;
  int m_endcol, m_endrow, m_endsect;
  int m_ncol, m_nrow, m_nsect;
  int m_na, m_nb, m_nc;

  double m_cella, m_cellb, m_cellc;
  double m_alpha, m_beta, m_gamma;
  
  ///////////////////////////////////////////
public:
  /// default constructor
  XplorMapReader();

  /// destructor
  virtual ~XplorMapReader();

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

private:

  char *readStr(int start, int end);
  char *readStrBlock(int bksz, int bkno) { return readStr(bkno*bksz, (bkno+1)*bksz-1); };
  void readRecord(qlib::LineStream &ins) throw (qlib::FileFormatException);

  bool readSectionInfo();
  bool readCellInfo();
  bool readAxisInfo();

  DensityMap *m_pMap;
  float *m_fbuf;
  double m_floatArray[10];
  int m_nFloatArrayCurPos;
  int m_nFloatArraySize;

  bool getSectNo(int &rsec) const {
    return qlib::LChar::toInt(m_recbuf, rsec);
  }

  void readFloatArray() throw (qlib::FileFormatException);
  void readDensity(qlib::LineStream &ins, double &rho);

  /** read header / file type check */  
  void readHeader(qlib::LineStream &ins) throw (qlib::FileFormatException);
};

}


#endif
