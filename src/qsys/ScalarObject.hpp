// -*-Mode: C++;-*-
//
// Abstract scalar-field (electron density, potential, etc)
//  object class
//

#ifndef QSYS_SCALAR_OBJECT_HPP__
#define QSYS_SCALAR_OBJECT_HPP__

#include "qsys.hpp"

#include "Object.hpp"
#include <qlib/Vector4D.hpp>

namespace qsys {

  using qlib::Vector4D;

  class QSYS_API ScalarObject : public Object
  {
    MC_SCRIPTABLE;
    
  public:
    ScalarObject();
    virtual ~ScalarObject();

    virtual double getValueAt(const Vector4D &pos) const =0;

    virtual bool isInRange(const Vector4D &pos) const =0;

    //////////
    // new interface for mesh rendering of scalar field

    virtual Vector4D getCenter() const =0;
    virtual Vector4D getOrigin() const =0;

    virtual double getMinDensity() const =0;
    virtual double getMaxDensity() const =0;
    virtual double getMeanDensity() const =0;
    virtual double getRmsdDensity() const =0;


    virtual double getLevelBase() const =0;
    virtual double getLevelStep() const =0;

    virtual bool isInBoundary(int i, int j, int k) const =0;
    virtual unsigned char atByte(int i, int j, int k) const =0;
    virtual double atFloat(int i, int j, int k) const =0;

    virtual int getColNo() const =0;
    virtual int getRowNo() const =0;
    virtual int getSecNo() const =0;

    virtual int getStartCol() const =0;
    virtual int getStartRow() const =0;
    virtual int getStartSec() const =0;

    virtual double getColGridSize() const =0;
    virtual double getRowGridSize() const =0;
    virtual double getSecGridSize() const =0;

    /// Convert grid index to orthogonal coordinate (in angstrom)
    virtual Vector4D convToOrth(const Vector4D &index) const =0;

    LString getHistogramJSON(double min, double max, int nbins);

  private:
    void calcBaseHistogram();
    double m_dHisMin, m_dHisMax, m_dBinSz;
    std::vector<int> m_bashist;

  };

} // namespace qsys

#endif // SCALAR_OBJECT_HPP__

