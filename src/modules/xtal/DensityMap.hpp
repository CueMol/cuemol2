// -*-Mode: C++;-*-
//
//  Electron density map object (with 8bit precision)
//

#ifndef DENSITY_MAP_HPP_INCLUDED_
#define DENSITY_MAP_HPP_INCLUDED_

#include "xtal.hpp"

#include <qsys/ScalarObject.hpp>

#include <modules/symm/CrystalInfo.hpp>
#include <qlib/ByteMap.hpp>
#include <qlib/ChunkedArray3D.hpp>
#include <qlib/LDOM2Stream.hpp>
#include <vector>

#define MAP_FLOAT_MIN (-1e10)
#define MAP_FLOAT_MAX (1e10)

namespace molstr {
  class MolCoord;
}

namespace xtal {

  using symm::CrystalInfo;
  using qlib::Vector4D;

  ///
  ///  Density map object for display.
  ///  The density data are stored with 8bit precision.
  ///  This object is not suitable for analytical purpose.
  ///
  class XTAL_API DensityMap : public qsys::ScalarObject
  {
    MC_SCRIPTABLE;

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

    /// truncated map (8bit), stored as section chunks (no single
    /// contiguous allocation, 64-bit indexing)
    qlib::ChunkedArray3D<quint8> m_map;
    double m_dLevelBase;
    double m_dLevelStep;

    /// Lossless base histogram of the 8-bit samples (256 bins; built on
    /// first use, cleared whenever the samples change)
    mutable std::vector<qint64> m_byteHist;

  public:
    /// Map kind (map_type property values). AUTO resolves to the kind
    /// detected by the reader; XTAL/EM are explicit user overrides.
    enum {
      MAPTYPE_AUTO = 0,
      MAPTYPE_XTAL = 1,
      MAPTYPE_EM = 2,
    };

  private:
    /// Map kind property (MAPTYPE_*)
    int m_nMapType;

    /// Map kind detected by the reader (MAPTYPE_XTAL or MAPTYPE_EM;
    /// readers without header evidence leave the XTAL default)
    int m_nDetectedType;

    /// Map origin in orthogonal coordinates (MRC2014 ORIGIN). Zero for
    /// crystallographic maps, which are placed by the start indices only.
    Vector4D m_vOrigin;

    ///////////////////////////////////////////////

  public:
    /// default constructor
    DensityMap();

    /// destructor
    ~DensityMap() override;

    ///////////////////////////////////////////////
    // Object interface

    // virtual qobj_inst *createInterpObj() const;
    // virtual bool isEmpty() const;
    // virtual void dump() const;

    ///////////////////////////////////////////////
    // ScalarObject interface

    double getValueAt(const Vector4D &pos) const override;
    unsigned char atByte(int i, int j, int k) const override;
    double atFloat(int i, int j, int k) const override;

    bool isInRange(const Vector4D &pos) const override;
    bool isInBoundary(int i, int j, int k) const override;

    Vector4D getCenter() const override;
    Vector4D getOrigin() const override;

    double getRmsdDensity() const override;
    double getMinDensity() const override { return m_dMinMap; }
    double getMaxDensity() const override { return m_dMaxMap; }
    double getMeanDensity() const override { return m_dMeanMap; }

    double getLevelBase() const override;
    double getLevelStep() const override;
    double getQuantStep() const override;

    // get number of columns, rows, sections
    int getColNo() const override { return m_nCols; }
    int getRowNo() const override { return m_nRows; }
    int getSecNo() const override { return m_nSecs; }

    int getStartCol() const override { return m_nStartCol; }
    int getStartRow() const override { return m_nStartRow; }
    int getStartSec() const override { return m_nStartSec; }

    double getColGridSize() const override;
    double getRowGridSize() const override;
    double getSecGridSize() const override;

    Vector4D convToOrth(const Vector4D &index) const override;

    virtual void fitView(const qsys::ViewPtr &pView, bool dummy) const;

    ///////////////////////////////////////////////
    // setup density map

    /// 8-bit quantization parameters: atFloat(b) = b * step + base
    struct MapQuant {
      double base;
      double step;
    };

    /// Allocate the sample storage for an (ncol, nrow, nsec) block with
    /// the given quantization, to be filled section by section through
    /// sliceBytes() and completed by endByteMap(). Readers stream the
    /// file into the map this way without a whole-map temporary buffer.
    void beginByteMap(int ncol, int nrow, int nsec, const MapQuant &q);

    /// Writable samples of section k (ncol * nrow bytes, column fastest);
    /// valid between beginByteMap() and endByteMap()
    quint8 *sliceBytes(int k) { return m_map.slice(k); }

    /// Complete a beginByteMap() fill with the map statistics
    void endByteMap(double rhomin, double rhomax, double mean, double rmsd);

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

    /// Read-only access to the sample storage (section chunks)
    const qlib::ChunkedArray3D<quint8> &getByteMap() const { return m_map; }

    /// Density level such that the given fraction of the samples lies at
    /// or above it (frac 0.01 = the level enclosing the top 1 percent of
    /// the grid points; the ChimeraX initial-contour rule). Computed from
    /// the lossless 8-bit histogram.
    double getLevelAtTopFraction(double frac) const;

  protected:
    /// ScalarObject histogram hook: the 256-bin byte histogram is a
    /// lossless base histogram of the quantized samples
    bool getBaseHistogram(std::vector<qint64> &hist, double &hmin,
                          double &binsz) const override;

    /// Build m_byteHist (chunk-parallel) if not yet built
    void ensureByteHistogram() const;

  public:

    /// setup column, row, section params
    void setMapParams(int stacol, int starow, int stasect,
                      int intcol, int introw, int intsect);

    /// setup crystal system's parameters
    void setXtalParams(double a, double b, double c,
                       double alpha, double beta, double gamma,
                       int nsg = 1);

    /// Histogram generation in JSON format
    // (can be moved to ScalarObj level??)
    //LString getNormHistogramJSON();
    // LString getHistogramJSON(double min, double max, int nbins);

    ///////////////////////////////////////////////////////////////
    // Get/set map properties.
    // Each Col, Row, Sec axis correspnds to X,Y,Z axis.

    int getColInterval() const { return m_nColInt; }
    int getRowInterval() const { return m_nRowInt; }
    int getSecInterval() const { return m_nSecInt; }

    const CrystalInfo &getXtalInfo() const { return m_xtalInfo; }

    ///////////////////////////////////////////////////////////////
    // Map kind (crystallographic / cryo-EM) and origin

    /// map_type property (MAPTYPE_*)
    int getMapType() const { return m_nMapType; }
    void setMapType(int n) { m_nMapType = n; }

    /// Set the kind detected by the reader (MAPTYPE_XTAL or MAPTYPE_EM)
    void setDetectedMapType(int n) { m_nDetectedType = n; }
    int getDetectedMapType() const { return m_nDetectedType; }

    /// Effective kind: the property unless it is AUTO, else the detected one
    int getEffectiveMapType() const {
      return (m_nMapType == MAPTYPE_AUTO) ? m_nDetectedType : m_nMapType;
    }

    /// True when the map is periodic (crystallographic). Renderers combine
    /// this with use_pbc and the whole-cell coverage test.
    bool isPeriodic() const { return getEffectiveMapType() == MAPTYPE_XTAL; }

    /// Effective kind as a string ("xtal" or "em"; map_type_resolved prop)
    LString getMapTypeResolvedStr() const;

    /// Set the map origin (orthogonal coordinates, angstrom)
    void setOrigin(const Vector4D &v) { m_vOrigin = v; }

    ////////////////////////////////////////////
    // Data chunk serialization

    bool isDataSrcWritable() const override { return true; }
    LString getDataChunkReaderName(int nQdfVer) const override;
    void writeDataChunkTo(qlib::LDom2OutStream &oos) const override;

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

  };

} // namespace xtal

#endif

