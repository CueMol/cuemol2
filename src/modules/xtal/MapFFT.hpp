#pragma once

#include <qlib/LStream.hpp>
#include <qlib/Matrix3D.hpp>
#include <qlib/Matrix4D.hpp>

#include "xtal.hpp"

namespace xtal {

class DensityMap;

class XTAL_API MapFFT
{
public:
    MapFFT();
    ~MapFFT();

    void setupSymmOp();
    qlib::Matrix3D makeRecipOp(const qlib::Matrix4D &r);

    void calcgrid();
    void checkMapResoln();
    void guessFFTColumns();
    void checkHKLColumns();
    void doFFT();

    void readData(qlib::InStream &arg);
    void setupMap();
    void selectFFTColumns();
    void cleanup();

private:
    /// num of reflections
    int m_nrefl;

    /// maximum indices
    int m_maxH, m_maxK, m_maxL;

    /// index array
    std::vector<int> m_vh;
    std::vector<int> m_vk;
    std::vector<int> m_vl;

    /// struct factors and phases
    std::vector<float> m_vFWT;
    std::vector<float> m_vPHI;
    
    /// Unit cell dimension parameters
    double m_cella, m_cellb, m_cellc;
    double m_alpha, m_beta, m_gamma;

    /// Space group no.
    int m_nSG;

    /// use phases
    bool m_bUsePhases;
    
    /////

    /// target map object (output)
    DensityMap *m_pMap;

    /////

    /// num of symm ops
    int m_nsymm;

    /// Symop matrices for real space
    std::vector<qlib::Matrix4D> m_symm;

    /// Symop matrices for reciprocal space
    std::vector<qlib::Matrix3D> m_rsymm;

    /// Map (max; high) resolution (default: auto)
    double m_mapr;

    /// Map grid size (default: 0.33)
    double m_grid;

    /// Check resolution and grid size
    bool m_bChkResGrid;

    /// num of indices
    int m_na, m_nb, m_nc;
};

}  // namespace xtal
