// -*-Mode: C++;-*-
//
// MTZ file to map reader (with FFT)
//
// $Id: MTZ2MapReader.hpp,v 1.3 2011/01/03 19:06:22 rishitani Exp $

#ifndef XTAL_MTZ2MAP_READER_HPP_INCLUDED
#define XTAL_MTZ2MAP_READER_HPP_INCLUDED

#include "xtal.hpp"

#include <qlib/mcutils.hpp>
#include <qlib/LExceptions.hpp>
#include <qsys/ObjReader.hpp>

#include <qlib/MapTable.hpp>
#include <qlib/Matrix3D.hpp>
#include <qlib/Matrix4D.hpp>

namespace qlib { class LineStream; }

class MTZ2MapReader_wrap;

namespace xtal {

class DensityMap;

class XTAL_API MTZ2MapReader : public qsys::ObjReader
{
  MC_SCRIPTABLE;

  friend class ::MTZ2MapReader_wrap;

public:
  //////////////////////////////////////////////

  /// default constructor
  MTZ2MapReader();

  /// destructor
  virtual ~MTZ2MapReader();

  //////////////////////////////////////////////
  // Read/build methods

  /// read from stream
  virtual bool read(qlib::InStream &ins);

  //////////////////////////////////////////////
  // Information query interface (ObjReader)
  
  /// get the nickname of this reader (referred from script interface)
  virtual const char *getName() const;

  /// get file-type description
  virtual const char *getTypeDescr() const;

  /// get file extension
  virtual const char *getFileExt() const;

  /// create default object for this reader
  virtual qsys::ObjectPtr createDefaultObj() const;

  //////////////////////////////////////////////
  // Information query method

  LString getColumnInfoJSON();

protected:
  /// Map (max; high) resolution (default: auto)
  double m_mapr;

  /// Map grid size (default: 0.33)
  double m_grid;

  /// column name for SF
  LString m_strClmnF;
  
  /// column name for phase
  LString m_strClmnPHI;

  /// column name for SF weight (e.g. FOM)
  LString m_strClmnWT;

  /// Check resolution and grid size
  bool m_bChkResGrid;

private:
  /// target map object
  DensityMap *m_pMap;

  //int m_stacol, m_starow, m_stasect;
  //int m_endcol, m_endrow, m_endsect;
  //int m_nrow, m_nsect;

  int m_na, m_nb, m_nc;

  /// Unit cell dimension parameters
  double m_cella, m_cellb, m_cellc;
  double m_alpha, m_beta, m_gamma;
  
  /// Space group no.
  int m_nSG;

  /// number conversion flag
  unsigned int m_nConvInt, m_nConvFlt;

  /// start pointer for the footer string data
  unsigned int m_nhdrst;

  /// temporary buffer for index/refl
  char *m_pbuf;

  /// size of m_pbuf
  int m_nrawdat;

  int m_nrefl, m_ncol;

  /// num of symm ops
  int m_nsymm;

  /// Symop matrices for real space
  std::vector<qlib::Matrix4D> m_symm;

  /// Symop matrices for reciprocal space
  std::vector<qlib::Matrix3D> m_rsymm;

  /// maximun indices
  int m_maxH, m_maxK, m_maxL;

  int m_cind_h, m_cind_k, m_cind_l;

  /// resolution range from mtz file
  double m_dResMin, m_dResMax;

  ///////////////////////////////////////////
protected:
  struct Column {
    int nid;
    LString name;
    char type;
    int nmin, nmax;
  };

  qlib::MapTable<Column> m_columns;

  int m_nfp, m_nphi, m_nwgt;
  LString m_sfp, m_sphi, m_swgt;

  ///////////////////////////////////////////
private:

  //float *m_fbuf;
  //double m_floatArray[10];
  //int m_nFloatArrayCurPos;
  //int m_nFloatArraySize;

  /// Read header / File type check
  void readHeader(qlib::InStream &ins);
  void readBody(qlib::InStream &ins);
  void readFooter(qlib::LineStream &ins);

  void skipBody(qlib::InStream &ins);

  void readNcol(const char *sbuf);
  void readColumn(const char *sbuf);
  void readDcell(const char *sbuf);
  void readSyminf(const char *sbuf);
  void readResoln(const char *sbuf);

  void setupSymmOp();

  qlib::Matrix3D makeRecipOp(const qlib::Matrix4D &r);

  void calcgrid();
  void checkMapResoln();
  void guessFFTColumns();
  void checkHKLColumns();
  void doFFT();

protected:
  void readData(qlib::InStream &arg);
  void setupMap();
  void selectFFTColumns();
  void cleanup();

};

} // namespace xtal

#endif
