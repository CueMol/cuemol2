// -*-Mode: C++;-*-
//
// MTZ file to map reader (with FFT)
//
// $Id: MTZ2MapReader.cpp,v 1.7 2011/03/06 13:42:36 rishitani Exp $

#include <common.h>

#include "MapFFT.hpp"

#include <boost/math/special_functions/fpclassify.hpp>
#include <complex>
#include <modules/symm/SymOpDB.hpp>
#include <qlib/LineStream.hpp>

#include "DensityMap.hpp"

#ifdef HAVE_FFTW3_H
#include <fftw3.h>
#endif

// Ignore anomalous scattering ( F(+)==F(-) )
#define HERMIT

namespace xtal {
using qlib::Matrix3D;
using qlib::Matrix4D;
using qlib::Vector4D;
using symm::SymOpDB;

MapFFT::MapFFT()
{
    m_nrefl = -1;
    m_maxH = -1;
    m_maxK = -1;
    m_maxL = -1;

    m_cella = 0.0;
    m_cellb = 0.0;
    m_cellc = 0.0;
    m_alpha = 0.0;
    m_beta = 0.0;
    m_gamma = 0.0;

    m_nSG = -1;

    m_bUsePhases = true;
}
MapFFT::~MapFFT() {}

void MapFFT::setupSymmOp()
{
    int i;

    SymOpDB *pSODB = SymOpDB::getInstance();
    const char *symname = pSODB->getName(m_nSG);
    if (symname == NULL) {
        LString msg = LString::format("Invalid SGNO %d", m_nSG);
        MB_THROW(qlib::FileFormatException, msg);
        return;
    }

    Matrix4D *psymm = NULL;
    LString *pdum = NULL;
    int nsymm = pSODB->getSymOps(m_nSG, psymm, pdum);
    if (psymm == NULL || pdum == NULL) {
        LString msg = LString::format("Invalid SGNO %d", m_nSG);
        MB_THROW(qlib::FileFormatException, msg);
        return;
    }
    delete[] pdum;

    MB_DPRINTLN("MTZ> sgname=%s nasym=%d", symname, nsymm);

    m_nsymm = nsymm;
    m_symm.resize(m_nsymm);
    m_rsymm.resize(m_nsymm);
    for (i = 0; i < m_nsymm; ++i) {
        m_symm[i] = psymm[i];
        m_rsymm[i] = makeRecipOp(psymm[i]);
    }
    delete[] psymm;
}

Matrix3D MapFFT::makeRecipOp(const Matrix4D &r)
{
    Matrix3D ret;
    Matrix3D symm = r.getMatrix3D();

    const double det = symm.deter();
    if (!qlib::isNear(qlib::abs(det), 1.0)) {
        LOG_DPRINTLN("det %f", det);
        MB_THROW(qlib::RuntimeException, "Symop: invalid determinant");
        return ret;
    }

    ret = (symm.invert()).transpose();
    // ret.transpose();
    return ret;
}

namespace {

inline int MOD(int a, int b)
{
    return a % b;
}

///
///  calculate number suitable for FFT grid
///
int calcprime(int N, int base1, int base2, int prim)
{
    int NN, P;
    bool CLOOP;

    NN = 0;
    N = N - 1;
    while (NN != 1) {
        // increment N until base1 and base2 are factors of N
        CLOOP = true;

        while (CLOOP) {
            N++;
            if (MOD(N, base1) == 0 && MOD(N, base2) == 0) CLOOP = false;
        }

        // divide N/BASE2 by integers less equal prim
        NN = N / base2;
        P = qlib::min(NN, prim);

        while (P > 1) {
            while (MOD(NN, P) == 0) {
                NN = NN / P;
            }
            P = P - 1;
        }
    }

    return N;
}

}  // namespace

#define ftprim 5

void MapFFT::calcgrid()
{
    int na, nb, nc;
    int nap, nbp, ncp;
    int napp, nbpp, ncpp;

    // double mapr = 1.7;

    na = qlib::max(2, int(m_cella / (m_mapr * m_grid) + F_EPS8));
    nb = qlib::max(2, int(m_cellb / (m_mapr * m_grid) + F_EPS8));
    nc = qlib::max(2, int(m_cellc / (m_mapr * m_grid) + F_EPS8));

    nap = calcprime(na, 1, 1, ftprim);
    nbp = calcprime(nb, 1, 1, ftprim);
    ncp = calcprime(nc, 1, 2, ftprim);

    napp = nbpp = ncpp = 1;

    MB_DPRINTLN("grid init guess (%d,%d,%d)", na, nb, nc);
    MB_DPRINTLN("grid init guessp(%d,%d,%d)", nap, nbp, ncp);
    MB_DPRINTLN("grid init guespp(%d,%d,%d)", napp, nbpp, ncpp);
    int basea = 2;
    int baseb = 2;
    int basec = 2;

    MB_DPRINTLN("fin guess p: (%d,%d,%d)", nap, nbp, ncp);
    MB_DPRINTLN("fin guess pp: (%d,%d,%d)", napp, nbpp, ncpp);

    na = nap * napp;
    nb = nbp * nbpp;
    nc = ncp * ncpp;

    LOG_DPRINTLN("MapFFT> Resoln=%f A, grid=%f", m_mapr, m_grid);
    LOG_DPRINTLN("MapFFT> FFT grid size : (%d,%d,%d)", na, nb, nc);
    m_na = na;
    m_nb = nb;
    m_nc = nc;

    if (m_bChkResGrid) {
        if (m_maxH > (na - 1.0) / 2.0)
            MB_THROW(qlib::RuntimeException, "Grid in x-direction too coarse");
        if (m_maxK > (nb - 1.0) / 2.0)
            MB_THROW(qlib::RuntimeException, "Grid in y-direction too coarse");
        if (m_maxL > (nc - 1.0) / 2.0)
            MB_THROW(qlib::RuntimeException, "Grid in z-direction too coarse");
    }

    return;
}

void MapFFT::checkMapResoln()
{
    const double factor = 3.0;

    const double maxg_x = m_cella / (factor * double(m_maxH));
    const double maxg_y = m_cellb / (factor * double(m_maxK));
    const double maxg_z = m_cellc / (factor * double(m_maxL));
    const double maxg = qlib::min(maxg_x, qlib::min(maxg_y, maxg_z));

    MB_DPRINTLN("Possible FFT grid size %f,%f,%f", maxg_x, maxg_y, maxg_z);

    bool bauto = false;
    if (m_mapr > 0.1) {
        if (m_mapr * m_grid >= maxg) {
            if (m_bChkResGrid) {
                LOG_DPRINTLN(
                    "MapFFT> FFT grid (resoln=%f, grid=%f) is too coarse -> use auto "
                    "resoln",
                    m_mapr, m_grid);
                bauto = true;
            } else {
                LOG_DPRINTLN(
                    "MapFFT> FFT grid (resoln=%f, grid=%f) is too coarse -> ignored",
                    m_mapr, m_grid);
            }
        }
    } else {
        bauto = true;
    }

    if (bauto) {
        // determine from max HKL
        m_grid = 0.33;
        m_mapr = maxg / m_grid;
        LOG_DPRINTLN("MTZ> Auto resoln: resoln=%f, grid=%f", m_mapr, m_grid);
    }
}

void MapFFT::doFFT()
{
    ///////////////////////////////////
    // calculate grid size

    checkMapResoln();
    calcgrid();
    int ncc = m_nc / 2 + 1;
    int ninalloc, noutalloc;

#ifdef HERMIT
    ninalloc = sizeof(fftwf_complex) * m_na * m_nb * ncc;
    noutalloc = sizeof(float) * m_na * m_nb * m_nc;
    std::complex<float> *in = (std::complex<float> *)fftwf_malloc(ninalloc);
    float *out = (float *)fftwf_malloc(noutalloc);
#define IND(h, k, l) ((l) + ncc * ((k) + m_nb * (h)))
#define NCS ncc
#else
    ninalloc = sizeof(fftwf_complex) * m_na * m_nb * m_nc;
    noutalloc = sizeof(fftwf_complex) * m_na * m_nb * m_nc;
    std::complex<float> *in = (std::complex<float> *)fftwf_malloc(ninalloc);
    std::complex<float> *out = (std::complex<float> *)fftwf_malloc(noutalloc);
#define IND(h, k, l) ((l) + m_nc * ((k) + m_nb * (h)))
#define NCS m_nc
#endif

    // check the memory allocation results
    if (in == NULL) {
        LString msg =
            LString::format("MapFFT> cannot allocate in-memory (%d w)", ninalloc);
        LOG_DPRINTLN("MapFFT> %s", msg.c_str());
        MB_THROW(qlib::RuntimeException, msg);
        return;
    }
    if (out == NULL) {
        LString msg =
            LString::format("MapFFT> cannot allocate out-memory (%d w)", noutalloc);
        LOG_DPRINTLN("MapFFT> %s", msg.c_str());
        MB_THROW(qlib::RuntimeException, msg);
        return;
    }

    int h, k, l;
    for (l = 0; l < NCS; ++l)
        for (k = 0; k < m_nb; ++k)
            for (h = 0; h < m_na; ++h) in[IND(h, k, l)] = std::complex<float>();

    const double rth = M_PI * 2.0 / 24.0;
    const float fscale = float(1.0 / (m_cella * m_cellb * m_cellc));
    int isym, iref;

    // FILE *fp = fopen("f:\\proj\\fft-f0.hkl","w");
    // fprintf(fp, "%d %d %d\n", m_na, m_nb, NCS);

    // Expand s.f.s by the symop
    for (isym = 0; isym < m_nsymm; ++isym) {
        // MB_DPRINTLN("----");
        // MB_DPRINTLN("%d RSYMM:", isym);
        // m_rsymm[isym].dump();
        // MB_DPRINTLN("%d SYMM:", isym);
        // m_symm[isym].dump();

        for (iref = 0; iref < m_nrefl; ++iref) {
            // Apply rotation by reciprocal symop
            const int hh = m_vh[iref];
            const int kk = m_vk[iref];
            const int ll = m_vl[iref];
            Vector4D ohkl(hh, kk, ll);
            m_rsymm[isym].xform(ohkl);
            h = int(ohkl.x());
            k = int(ohkl.y());
            l = int(ohkl.z());

            // Apply phase translation by (realspace) symop
            const double xsh = m_symm[isym].aij(1, 4);
            const double ysh = m_symm[isym].aij(2, 4);
            const double zsh = m_symm[isym].aij(3, 4);
            double phsh = 0.0;
            // Do not apply phase shift in the Patterson map case.
            if (m_bUsePhases) {
                phsh = (xsh * h + ysh * k + zsh * l) * M_PI * 2.0;
            }

            const float ampl = float(m_vFWT[iref] * fscale);
            const float phas = float(m_vPHI[iref] * float(M_PI) / 180.0f);

            std::complex<float> floc =
                std::polar(1.0f, float(phsh)) * std::polar(ampl, phas);

            // ATTN: Avoid overwriting with ZERO value for missing refls.
            if (qlib::isNear8<double>(abs(floc), 0.0)) continue;

            // MB_DPRINTLN("F(%d,%d,%d)=(%f,%f) %f %f",h,k,l, floc.real(), floc.imag(),
            // ampl, phas);

            h = (h + 10000 * m_na) % m_na;
            k = (k + 10000 * m_nb) % m_nb;
            l = (l + 10000 * m_nc) % m_nc;

            // Make Friedel pair index
            int mh = (m_na - h) % m_na;
            int mk = (m_nb - k) % m_nb;
            int ml = (m_nc - l) % m_nc;

            // fprintf(fp, "F( %d.%d.%d (%d) => %03d.%03d.%03d )=( %e %e )\n",hh, kk,
            // ll, isym, h,k,l, abs(floc), qlib::toDegree(arg(floc))); fprintf(fp, "F(
            // %d.%d.%d (%d) => %03d.%03d.%03d )=( %e %e )\n",hh, kk, ll, isym,
            // mh,mk,ml, abs(conj(floc)), qlib::toDegree(arg(conj(floc))));

#ifdef HERMIT
            // Hermitian case: fill the hemisphere (of L>ncc)
            //  with the Friedel pairs of the refls.
            if (l < ncc) {
                in[IND(h, k, l)] = std::conj(floc);
                // MB_DPRINTLN("F(%d,%d,%d)=(%f,%f)",mh,mk,ml, in[IND(h,k,l)].real(),
                // in[IND(h,k,l)].imag());
                if (ml < ncc) {
                    // Both +L and -L are in the range (0...NCC)
                    // ==> Fill with both F(+)&F(-)
                    in[IND(mh, mk, ml)] = floc;
                }
            } else if (ml < ncc) {
                // Fill with Friedel mate
                // in[IND(mh,mk,ml)] += floc;
                in[IND(mh, mk, ml)] = floc;
            } else {
                LOG_DPRINTLN("fatal error %d,%d,%d, ncc=%d\n", h, k, l, ncc);
            }
#else
            in[IND(h, k, l)] = floc;
            // Expand Friedel pair
            in[IND(mh, mk, ml)] = std::conj(floc);
#endif
        }
    }

    // fclose(fp);

    MB_DPRINTLN("PREP OK");

#ifdef MB_DEBUG
    if (0) {
        FILE *fp = fopen("f:\\proj\\fft-f.hkl", "w");
        for (l = 0; l < NCS; ++l)
            for (k = 0; k < m_nb; ++k)
                for (h = 0; h < m_na; ++h) {
                    const double re = in[IND(h, k, l)].real();
                    const double im = in[IND(h, k, l)].imag();
                    // MB_DPRINTLN("F(%d,%d,%d)=(%f,%f)",h,k,l,re, im);
                    //  fprintf(fp, "F(%d,%d,%d)=(%e,%e)\n",h,k,l,re, im);
                    std::complex<float> &floc = in[IND(h, k, l)];
                    const double a = abs(floc);
                    if (qlib::isNear8(a, 0.0)) continue;
                    fprintf(fp, "F( %03d.%03d.%03d )=( %e %.2f )\n", h, k, l, a,
                            qlib::toDegree(arg(floc)));
                }
        fclose(fp); 
   }
#endif

    fftwf_plan p;

#ifdef HERMIT
    p = fftwf_plan_dft_c2r_3d(m_na, m_nb, m_nc, reinterpret_cast<fftwf_complex *>(in),
                              out, FFTW_ESTIMATE);
#else
    p = fftwf_plan_dft_3d(m_na, m_nb, m_nc, reinterpret_cast<fftwf_complex *>(in),
                          reinterpret_cast<fftwf_complex *>(out), FFTW_FORWARD,
                          FFTW_ESTIMATE);
#endif

    fftwf_execute(p);
    fftwf_destroy_plan(p);
    fftwf_free(in);

    MB_DPRINTLN("FFT OK");

    //////////////////////////////////////

    try {
        // ATTN: FFT axis is different from the map axis,
        // so axis permutation is required.
        m_pMap->setMapFloatArray(out, m_nc, m_nb, m_na, 2, 1, 0);
    } catch (...) {
        fftwf_free(out);
        throw;
    }

    fftwf_free(out);
}
}  // namespace xtal
