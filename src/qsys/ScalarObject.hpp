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
    ~ScalarObject() override;

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

    /// Spacing of the discrete value lattice of the stored samples.
    /// Returns 0 when the storage is continuous (i.e. values are not
    /// quantized). Implementations with quantized storage (e.g. the
    /// 8-bit DensityMap) override this with their actual step, so
    /// histogram clients can avoid requesting bins finer than the data.
    /// Note: getLevelStep() is not usable for this purpose -- float
    /// implementations also return a non-zero value there (the atByte()
    /// conversion scale), even though their data is not quantized.
    virtual double getQuantStep() const { return 0.0; }

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

    /// Drop the cached base histogram (call whenever the samples change)
    void invalidateHistogram() { m_bashist.clear(); }

  protected:
    /// Hook for implementations with a cheap lossless base histogram
    /// (e.g. the 256-bin histogram of 8-bit quantized samples): fill hist
    /// with the counts of bins [hmin + i*binsz, hmin + (i+1)*binsz) and
    /// return true. The default returns false, and the base histogram is
    /// then accumulated by scanning every sample through atFloat().
    virtual bool getBaseHistogram(std::vector<qint64> &hist, double &hmin,
                                  double &binsz) const { return false; }

  private:
    void calcBaseHistogram();
    /// reported data range (min / max density)
    double m_dHisMin, m_dHisMax;
    /// base histogram bins: [m_dBaseMin + j*m_dBinSz, ... + (j+1)*m_dBinSz)
    double m_dBaseMin, m_dBinSz;
    std::vector<qint64> m_bashist;

  };

} // namespace qsys

#endif // SCALAR_OBJECT_HPP__

