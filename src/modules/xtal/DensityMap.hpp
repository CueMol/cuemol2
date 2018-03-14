// -*-Mode: C++;-*-
//
//  Electron density map object (with 8bit precision)
//

#ifndef DENSITY_MAP_HPP_INCLUDED_
#define DENSITY_MAP_HPP_INCLUDED_

#include "xtal.hpp"

#include <qsys/ScalarObject.hpp>

#include <modules/symm/CrystalInfo.hpp>
//#include <qlib/ByteMap.hpp>
#include <qlib/Array.hpp>
#include <qlib/LDOM2Stream.hpp>

#include <gfx/Texture.hpp>
#include <gfx/ComputeContext.hpp>

#include <complex>

#include "HKLList.hpp"

#define MAP_FLOAT_MIN (-1e10)
#define MAP_FLOAT_MAX (1e10)

namespace molstr {
  class MolCoord;
}

namespace xtal {

  using symm::CrystalInfo;
  using qlib::Vector4D;

  using qlib::CompArray;
  using qlib::FloatArray;
  using qlib::ByteArray;
  

  ///
  ///  Density map object for display.
  ///  The density data are stored with 8bit precision.
  ///  This object is not suitable for analytical purpose.
  ///
  class XTAL_API DensityMap : public qsys::ScalarObject
  {
    MC_SCRIPTABLE;

  public:
    typedef qlib::Array3D<qbyte> ByteMap;
    //typedef qlib::ByteMap ByteMap;

    typedef qlib::Array3D<qfloat32> FloatMap;

    typedef qlib::Array3D<std::complex<qfloat32> > RecipAry;


  private:

    /// cell dimensions
    CrystalInfo m_xtalInfo;

    /// Numbers of grid points in the unit cell
    int m_nColInt;
    int m_nRowInt;
    int m_nSecInt;

    /// number of columns, rows, sections of this map
    int m_nCols;
    int m_nRows;
    int m_nSecs;

    /// number of first col, row, sec of this map
    int m_nStartCol;
    int m_nStartRow;
    int m_nStartSec;

    double m_dMinMap;
    double m_dMaxMap;
    double m_dMeanMap;
    double m_dRmsdMap;

    /// truncated map (8bit)
    ByteMap *m_pByteMap;
    double m_dLevelBase;
    double m_dLevelStep;

    FloatMap *m_pFloatMap;

    // RecipAry *m_pRecipAry;

    HKLList *m_pHKLList;

    ///////////////////////////////////////////////

  public:
    /// default constructor
    DensityMap();

    /// destructor
    virtual ~DensityMap();

    ///////////////////////////////////////////////
    // Object interface

    // virtual qobj_inst *createInterpObj() const;
    // virtual bool isEmpty() const;
    // virtual void dump() const;

    ///////////////////////////////////////////////
    // ScalarObject interface

    virtual double getValueAt(const Vector4D &pos) const;
    virtual unsigned char atByte(int i, int j, int k) const;
    virtual double atFloat(int i, int j, int k) const;

    virtual bool isInRange(const Vector4D &pos) const;
    virtual bool isInBoundary(int i, int j, int k) const;

    virtual Vector4D getCenter() const;
    virtual Vector4D getOrigin() const;

    virtual double getRmsdDensity() const;
    virtual double getMinDensity() const { return m_dMinMap; }
    virtual double getMaxDensity() const { return m_dMaxMap; }
    virtual double getMeanDensity() const { return m_dMeanMap; }

    virtual double getLevelBase() const;
    virtual double getLevelStep() const;

    // get number of columns, rows, sections
    virtual int getColNo() const { return m_nCols; }
    virtual int getRowNo() const { return m_nRows; }
    virtual int getSecNo() const { return m_nSecs; }

    virtual int getStartCol() const { return m_nStartCol; }
    virtual int getStartRow() const { return m_nStartRow; }
    virtual int getStartSec() const { return m_nStartSec; }

    virtual double getColGridSize() const;
    virtual double getRowGridSize() const;
    virtual double getSecGridSize() const;

    virtual Vector4D convToOrth(const Vector4D &index) const;

    ///////////////////////////////////////////////
    // setup density map

    /// construct by float array
    /// axcol, ... specifiy the axis-order permutation
    void setMapFloatArray(const float *array,
                          int ncol, int nrow, int nsect,
                          int axcol, int axrow, int axsect);

    /// construct by byte array
    /// array must be sorted by the Fast-Medium-Slow order
    void setMapByteArray(const unsigned char*array,
                         int ncol, int nrow, int nsect,
                         double rhomin, double rhomax,
                         double mean, double sigma);

    ByteArray *getByteMap() const { return m_pByteMap; }

    // void setRecipArray(const RecipAry &data, int na, int nb, int nc);

    /// Set HKL-list to this map (ownership of pHKLList is transferred to this obj)
    void setHKLList(HKLList *pHKLList);

    HKLList *getHKLList() const {
      return m_pHKLList;
    }

    FloatMap *getFloatMap() const {
      return m_pFloatMap;
    }

    // /// Calculate HKL-list from float map
    // void calcHKLfromMap();

    /// setup column, row, section params
    void setMapParams(int stacol, int starow, int stasect,
                      int intcol, int introw, int intsect);

    /// setup crystal system's parameters
    void setXtalParams(double a, double b, double c,
                       double alpha, double beta, double gamma,
                       int nsg = 1);

    /// Histogram generation in JSON format
    // (can be moved to ScalarObj level??)
    LString getNormHistogramJSON();

    ///////////////////////////////////////////////////////////////
    // Get/set map properties.
    // Each Col, Row, Sec axis correspnds to X,Y,Z axis.

    int getColInterval() const { return m_nColInt; }
    int getRowInterval() const { return m_nRowInt; }
    int getSecInterval() const { return m_nSecInt; }

    const CrystalInfo &getXtalInfo() const { return m_xtalInfo; }

    /// Calculate map statistics (min/max/mean/rmsd)
    static void calcMapStats(const FloatArray &map, double &aMinMap, double &aMaxMap, double &aMeanMap, double &aRmsdMap);

    void calcMapStats();

    /// Create ByteMap from FloatMap (using map stats calculated by calcMapStats())
    void createByteMap();

    static void createByteMap(const FloatArray &fmap, ByteArray &bmap,
                              double base, double setp);

    void setMapStats(double aMinMap, double aMaxMap, double aMeanMap, double aRmsdMap)
    {
      m_dMinMap = aMinMap;
      m_dMaxMap = aMaxMap;
      m_dMeanMap = aMeanMap;
      m_dRmsdMap = aRmsdMap;
      
      m_dLevelStep = (aMaxMap - aMinMap)/256.0;
      m_dLevelBase = aMinMap;
    }

    void updateByteMap();

    void fireMapPreviewChgEvent();
    void fireMapChgEvent();
    
  private:
    mutable gfx::Texture *m_pMapTex;
    
  public:
    gfx::Texture *getMapTex() const;

    // void sharpenMapPreview(double b_factor);

  private:
    gfx::ComputeContext *m_pCCtxt;
    
    // void cuda_test1();

  public:
    void setCompCtxt(gfx::ComputeContext *pCtxt) { m_pCCtxt = pCtxt; }

    ////////////////////////////////////////////
    // Data chunk serialization

    virtual bool isDataSrcWritable() const { return true; }
    virtual LString getDataChunkReaderName(int nQdfVer) const;
    virtual void writeDataChunkTo(qlib::LDom2OutStream &oos) const;

    ///////////////////////////////////////////////////////////////

  private:
    /// helper method
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

    unsigned char getAtWithBndry(int nx, int ny, int nz) const;

  };

} // namespace xtal

#endif

