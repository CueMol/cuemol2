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
  ~ElePotMap() override;

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
  
  double getValueAt(const Vector4D &pos) const override;

  bool isInRange(const Vector4D &pos) const override;
  
  Vector4D getCenter() const override ;
  Vector4D getOrigin() const override ;
  double getRmsdDensity() const override ;
  double getMinDensity() const override { return m_dMinMap; }
  double getMaxDensity() const override { return m_dMaxMap; }
  double getMeanDensity() const override { return m_dMeanMap; }

  double getLevelBase() const override ;
  double getLevelStep() const override ;

  bool isInBoundary(int i, int j, int k) const override;
  unsigned char atByte(int i, int j, int k) const override ;
  double atFloat(int i, int j, int k) const override ;

  int getColNo() const override ;
  int getRowNo() const override ;
  int getSecNo() const override ;

  int getStartCol() const override ;
  int getStartRow() const override ;
  int getStartSec() const override ;

  // interval==1/(grid size)
  double getColGridSize() const override ;
  double getRowGridSize() const override ;
  double getSecGridSize() const override ;

  Vector4D convToOrth(const Vector4D &index) const override;

  ////////////////////////////////////////////
  // Data chunk serialization

  bool isDataSrcWritable() const override { return true; }
  LString getDataChunkReaderName(int nQdfVer) const override;
  void writeDataChunkTo(qlib::LDom2OutStream &oos) const override;

  //

  // LString getHistogramJSON(double min, double max, int nbin);
  void fitView(const qsys::ViewPtr &pView, bool dummy) const;

};

}

#endif // ELECTRON_POTENTIAL_MAP_H__
