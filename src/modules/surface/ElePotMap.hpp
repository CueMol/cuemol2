// -*-Mode: C++;-*-
//
// electrostatic potential map
//
// $Id: ElePotMap.hpp,v 1.5 2011/04/03 08:08:46 rishitani Exp $

#ifndef ELECTRON_POTENTIAL_MAP_H__
#define ELECTRON_POTENTIAL_MAP_H__

#include "surface.hpp"

//#include <boost/multi_array.hpp>
#include <qlib/ByteMap.hpp>
#include <qlib/Vector4D.hpp>
#include <qsys/ScalarObject.hpp>
#include <qlib/LDOM2Stream.hpp>

namespace surface {

using qlib::Vector4D;

class SURFACE_API ElePotMap : public qsys::ScalarObject
{
  MC_SCRIPTABLE;

private:
  typedef qlib::Array3D<float> FloatMap;

  /// map data (persist)
  FloatMap *m_pMap;

  /// position of origin (persist)
  Vector4D m_origPos;

  /// grid dimension (persist)
  double m_gx, m_gy, m_gz;

  /// values calculated from map data
  double m_dMinMap;
  double m_dMaxMap;
  double m_dMeanMap;
  double m_dRmsdMap;

  /// values calculated from map data
  double m_dLevelStep;
  double m_dLevelBase;

public:
  ElePotMap();
  virtual ~ElePotMap();

  bool setMapFloatArray(const float *array,
			int ncol, int nrow, int nsect,
                        double scale, const Vector4D &origpos);
  

  bool setMapFloatArray(const float *array,
			int ncol, int nrow, int nsect,
                        double gx, double gy, double gz,
                        const Vector4D &origpos);
  

  void smooth(double rad);
  void smooth2(double rad);

private:
  double smoothHelper(int x, int y, int z);

  struct Delta {
    Delta(int x, int y, int z) : dx(x), dy(y), dz(z) {}
    int dx, dy, dz;
  };

  typedef std::vector<Delta> DeltaList;
  DeltaList m_deltas;

  // qlib::Array3D<bool> m_filter;

public:
  ///////////////////////////////////////////////
  // MbObject/ScalarObject interface

  virtual bool isEmpty() const;
  
  virtual double getValueAt(const Vector4D &pos) const;

  virtual bool isInRange(const Vector4D &pos) const;
  
  virtual Vector4D getCenter() const ;
  virtual Vector4D getOrigin() const ;
  virtual double getRmsdDensity() const ;
  virtual double getMinDensity() const { return m_dMinMap; }
  virtual double getMaxDensity() const { return m_dMaxMap; }
  virtual double getMeanDensity() const { return m_dMeanMap; }

  virtual double getLevelBase() const ;
  virtual double getLevelStep() const ;

  virtual bool isInBoundary(int i, int j, int k) const;
  virtual unsigned char atByte(int i, int j, int k) const ;
  virtual double atFloat(int i, int j, int k) const ;

  virtual int getColNo() const ;
  virtual int getRowNo() const ;
  virtual int getSecNo() const ;

  virtual int getStartCol() const ;
  virtual int getStartRow() const ;
  virtual int getStartSec() const ;

  // interval==1/(grid size)
  virtual double getColGridSize() const ;
  virtual double getRowGridSize() const ;
  virtual double getSecGridSize() const ;

  virtual Vector4D convToOrth(const Vector4D &index) const;

  ////////////////////////////////////////////
  // Data chunk serialization

    virtual bool isDataSrcWritable() const { return true; }
  virtual LString getDataChunkReaderName() const;
  virtual void writeDataChunkTo(qlib::LDom2OutStream &oos) const;
};

}

#endif // ELECTRON_POTENTIAL_MAP_H__
