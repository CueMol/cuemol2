// -*-Mode: C++;-*-
//
// MTZ file to map reader (with FFT)
//
// $Id: MTZ2MapReader.cpp,v 1.7 2011/03/06 13:42:36 rishitani Exp $

#include <common.h>

#include "MTZ2MapReader.hpp"
#include "DensityMap.hpp"
#include <modules/symm/SymOpDB.hpp>
#include <qlib/LineStream.hpp>

#include <boost/math/special_functions/fpclassify.hpp>

#include <complex>
#ifdef HAVE_FFTW3_H
#  include <fftw3.h>
#endif

// Ignore anomalous scattering ( F(+)==F(-) )
#define HERMIT

using namespace xtal;

using qlib::Matrix4D;
using qlib::Matrix3D;
using qlib::Vector4D;
using symm::SymOpDB;

// default constructor
MTZ2MapReader::MTZ2MapReader()
     : m_pMap(NULL)
{
  m_nConvInt = m_nConvFlt = 0;
  m_pbuf = NULL;
  m_nSG = 0;
  m_grid = 0.33;
  m_mapr = -1.0; // auto (calc from max F)

  m_nfp = -1.0;
  m_nphi = -1.0;
  m_nwgt = -1.0;
}

// destructor
MTZ2MapReader::~MTZ2MapReader()
{
  if (m_pbuf!=NULL)
    delete [] m_pbuf;
}

void MTZ2MapReader::cleanup()
{
  if (m_pbuf!=NULL)
    delete [] m_pbuf;
  m_pbuf = NULL;
}

///////////////////////////////////////////

/// create default object for this reader
qsys::ObjectPtr MTZ2MapReader::createDefaultObj() const
{
  return qsys::ObjectPtr(new DensityMap());
  //return new DensityMap();
}

/// Get nickname for scripting
const char *MTZ2MapReader::getName() const
{
  return "mtzmap";
}

/** get file-type description */
const char *MTZ2MapReader::getTypeDescr() const
{
  return "MTZ Structure Factor (*.mtz)";
}

/** get file extension */
const char *MTZ2MapReader::getFileExt() const
{
  return "*.mtz";
}

///////////////////////////////////////////

bool MTZ2MapReader::read(qlib::InStream &arg)
{
  // get the target object (DensityMap)
  m_pMap = NULL;
  m_pMap = getTarget<DensityMap>();
  if (m_pMap==NULL) return false;

  readData(arg);

  selectFFTColumns();

  LOG_DPRINTLN("MTZ> FFT target: FWT=%s, PHI=%s, WGT=%s",
               m_sfp.c_str(), m_sphi.c_str(), m_swgt.c_str());

  setupMap();

  return true;
}

void MTZ2MapReader::readData(qlib::InStream &arg)
{
  m_columns.erase(m_columns.begin(), m_columns.end());

  readHeader(arg); 
  
  readBody(arg); 

  qlib::LineStream ins(arg);

  readFooter(ins);
  
  if (m_ncol<=3 || m_nrefl==0 || m_ncol!=m_columns.size())
    MB_THROW(qlib::FileFormatException, "No refls in mtzfile");

  LOG_DPRINT("  unit cell a=%.2fA, b=%.2fA, c=%.2fA,\n", m_cella, m_cellb, m_cellc);
  LOG_DPRINT("            alpha=%.2fdeg, beta=%.2fdeg, gamma=%.2fdeg,\n",
             m_alpha, m_beta, m_gamma);

  checkHKLColumns();
  MB_DPRINTLN("MTZ> FFT target: HKL %d %d %d", m_cind_h, m_cind_k, m_cind_l);

  // check cell/symm 
  setupSymmOp();
}

void MTZ2MapReader::setupMap()
{
  // Calculate map from the structure factors loaded
  doFFT();

  // setup map dimension parameters
  m_pMap->setMapParams(0, 0, 0, m_na, m_nb, m_nc);

  // setup crystal lattice parameters
  m_pMap->setXtalParams(m_cella, m_cellb, m_cellc, m_alpha, m_beta, m_gamma, m_nSG);

}

void MTZ2MapReader::doFFT()
{
#ifndef HAVE_FFTW3_H
  MB_THROW(qlib::RuntimeException, "MTZ2MapReader.doFFT() fft is not supported.");
  return;
#else

  std::vector<int> vh(m_nrefl);
  std::vector<int> vk(m_nrefl);
  std::vector<int> vl(m_nrefl);

  std::vector<float> vFWT(m_nrefl);
  std::vector<float> vPHI(m_nrefl);

  if (m_nphi<0) {
    LOG_DPRINTLN("MTZ2Map FFT> Warning: No phase is specified.");
    LOG_DPRINTLN("MTZ2Map FFT> Result may be Patterson map.");
  }

  m_maxL = m_maxK = m_maxH = INT_MIN;
  int nptr=0, iref;
  for (iref=0; iref<m_nrefl; ++iref) {

    if (nptr+m_ncol>m_nrawdat/4) {
      MB_THROW(qlib::RuntimeException, "Out of buffer");
      return;
    }

    const int hhh = (int) ((float *)m_pbuf)[nptr+m_cind_h];
    const int kkk = (int) ((float *)m_pbuf)[nptr+m_cind_k];
    const int lll = (int) ((float *)m_pbuf)[nptr+m_cind_l];
    vh[iref] = hhh;
    vk[iref] = kkk;
    vl[iref] = lll;

    double wgt = 1.0;
    if (m_nwgt>=0)
      wgt = ((float *)m_pbuf)[nptr+m_nwgt];

    double fp = ((float *)m_pbuf)[nptr+m_nfp] * wgt;

    double phi = 0.0;
    if (m_nphi>=0)
      phi = ((float *)m_pbuf)[nptr+m_nphi];

    if (boost::math::isfinite(fp))
      vFWT[iref] = fp;
    else
      vFWT[iref] = 0.0;

    if (boost::math::isfinite(phi))
      vPHI[iref] = phi;
    else
      vPHI[iref] = 0.0;

    /*
    //if (iref<30) {
    if (lll==-26) {
      MB_DPRINTLN("(%d,%d,%d) F=%f, Phi=%f",
		  vh[iref], vk[iref], vl[iref],
		  vFWT[iref], vPHI[iref]);
      //MB_DPRINTLN("finite F=%d, Phi=%d", finite(fp), finite(phi));
    }
     */

    nptr += m_ncol;

    m_maxH = qlib::max(m_maxH, qlib::abs(hhh));
    m_maxK = qlib::max(m_maxK, qlib::abs(kkk));
    m_maxL = qlib::max(m_maxL, qlib::abs(lll));
    //fprintf(stdout, "\n");
  }

  delete m_pbuf;
  m_pbuf = NULL;

  MB_DPRINTLN("LOAD OK");

  ///////////////////////////////////
  // calculate grid size

  checkMapResoln();
  calcgrid();
  int ncc = m_nc/2+1;
  int ninalloc, noutalloc;

#ifdef HERMIT
  ninalloc = sizeof(fftwf_complex) * m_na * m_nb * ncc;
  noutalloc = sizeof(float) * m_na * m_nb * m_nc;
  std::complex<float> *in = (std::complex<float> *) fftwf_malloc(ninalloc);
  float *out = (float *) fftwf_malloc(noutalloc);
# define IND(h,k,l) ((l) + ncc*((k) + m_nb*(h)))
# define NCS ncc
#else
  ninalloc = sizeof(fftwf_complex) * m_na * m_nb * m_nc;
  noutalloc = sizeof(fftwf_complex) * m_na * m_nb * m_nc;
  std::complex<float> *in = (std::complex<float> *) fftwf_malloc(ninalloc);
  std::complex<float> *out = (std::complex<float> *) fftwf_malloc(noutalloc);
# define IND(h,k,l) ((l) + m_nc*((k) + m_nb*(h)))
# define NCS m_nc
#endif

  // check the memory allocation results
  if (in==NULL) {
    LString msg = LString::format("MTZ.doFFT> cannot allocate in-memory (%d w)", ninalloc);
    LOG_DPRINTLN("MTZ.doFFT> %s", msg.c_str());
    MB_THROW(qlib::RuntimeException, msg);
    return;
  }
  if (out==NULL) {
    LString msg = LString::format("MTZ.doFFT> cannot allocate out-memory (%d w)", noutalloc);
    LOG_DPRINTLN("MTZ.doFFT> %s", msg.c_str());
    MB_THROW(qlib::RuntimeException, msg);
    return;
  }

  int h, k, l;
  for (l=0; l<NCS; ++l)
    for (k=0; k<m_nb; ++k)
      for (h=0; h<m_na; ++h)
	in[IND(h,k,l)] = std::complex<float>();

  const double rth = M_PI*2.0/24.0;
  const float fscale = float(1.0/(m_cella*m_cellb*m_cellc));
  int isym;

  // FILE *fp = fopen("f:\\proj\\fft-f0.hkl","w");
  // fprintf(fp, "%d %d %d\n", m_na, m_nb, NCS);

  // Expand s.f.s by the symop
  for (isym=0; isym<m_nsymm; ++isym) {
    // MB_DPRINTLN("----");
    // MB_DPRINTLN("%d RSYMM:", isym);
    // m_rsymm[isym].dump();
    // MB_DPRINTLN("%d SYMM:", isym);
    // m_symm[isym].dump();

    for (iref=0; iref<m_nrefl; ++iref) {
      // Apply rotation by reciprocal symop
      const int hh = vh[iref];
      const int kk = vk[iref];
      const int ll = vl[iref];
      Vector4D ohkl(hh, kk, ll);
      m_rsymm[isym].xform(ohkl);
      h = int(ohkl.x());
      k = int(ohkl.y());
      l = int(ohkl.z());

      // Apply phase translation by (realspace) symop
      const double xsh = m_symm[isym].aij(1,4);
      const double ysh = m_symm[isym].aij(2,4);
      const double zsh = m_symm[isym].aij(3,4);
      double phsh = 0.0;
      // Do not apply phase shift in the Patterson map case.
      if (m_nphi>=0)
        phsh = (xsh*h + ysh*k + zsh*l)*M_PI*2.0;

      const float ampl = float( vFWT[iref]*fscale );
      const float phas = float( vPHI[iref]*float(M_PI)/180.0f );

      std::complex<float> floc = std::polar(1.0f, float(phsh)) * std::polar(ampl, phas);

      // ATTN: Avoid overwriting with ZERO value for missing refls.
      if (qlib::isNear8<double>(abs(floc), 0.0))
        continue;

      // MB_DPRINTLN("F(%d,%d,%d)=(%f,%f) %f %f",h,k,l, floc.real(), floc.imag(), ampl, phas);

      h = (h+10000*m_na)%m_na;
      k = (k+10000*m_nb)%m_nb;
      l = (l+10000*m_nc)%m_nc;

      // Make Friedel pair index
      int mh = (m_na-h)%m_na;
      int mk = (m_nb-k)%m_nb;
      int ml = (m_nc-l)%m_nc;

      // fprintf(fp, "F( %d.%d.%d (%d) => %03d.%03d.%03d )=( %e %e )\n",hh, kk, ll, isym, h,k,l, abs(floc), qlib::toDegree(arg(floc)));
      // fprintf(fp, "F( %d.%d.%d (%d) => %03d.%03d.%03d )=( %e %e )\n",hh, kk, ll, isym, mh,mk,ml, abs(conj(floc)), qlib::toDegree(arg(conj(floc))));

#ifdef HERMIT
      // Hermitian case: fill the hemisphere (of L>ncc)
      //  with the Friedel pairs of the refls.
      if (l<ncc) {
        in[IND(h,k,l)] = std::conj(floc);
        //MB_DPRINTLN("F(%d,%d,%d)=(%f,%f)",mh,mk,ml, in[IND(h,k,l)].real(), in[IND(h,k,l)].imag());
        if (ml<ncc) {
          // Both +L and -L are in the range (0...NCC)
          // ==> Fill with both F(+)&F(-)
          in[IND(mh,mk,ml)] = floc;
        }
      }
      else if (ml<ncc) {
        // Fill with Friedel mate
        //in[IND(mh,mk,ml)] += floc;
        in[IND(mh,mk,ml)] = floc;
      }
      else {
        LOG_DPRINTLN("fatal error %d,%d,%d, ncc=%d\n",h,k,l,ncc);
      }
#else
      in[IND(h,k,l)] = floc;
      // Expand Friedel pair
      in[IND(mh,mk,ml)] = std::conj(floc);
#endif

    }
  }

  // fclose(fp);

  MB_DPRINTLN("PREP OK");

#ifdef MB_DEBUG
  if (0) {
    FILE *fp = fopen("f:\\proj\\fft-f.hkl","w");
    for (l=0; l<NCS ; ++l)
      for (k=0; k<m_nb ; ++k)
        for (h=0; h<m_na ; ++h) {
          const double re = in[IND(h,k,l)].real();
          const double im = in[IND(h,k,l)].imag();
          //MB_DPRINTLN("F(%d,%d,%d)=(%f,%f)",h,k,l,re, im);
          // fprintf(fp, "F(%d,%d,%d)=(%e,%e)\n",h,k,l,re, im);
          std::complex<float> &floc = in[IND(h,k,l)];
          const double a = abs(floc);
          if (qlib::isNear8(a, 0.0)) continue;
          fprintf(fp, "F( %03d.%03d.%03d )=( %e %.2f )\n",h, k, l, a, qlib::toDegree(arg(floc)));

        }
    fclose(fp);
  }
#endif

  fftwf_plan p;

#ifdef HERMIT
  p = fftwf_plan_dft_c2r_3d(m_na, m_nb, m_nc,
			    reinterpret_cast<fftwf_complex*>(in),
			    out, FFTW_ESTIMATE);
#else
  p = fftwf_plan_dft_3d(m_na, m_nb, m_nc,
			reinterpret_cast<fftwf_complex*>(in),
			reinterpret_cast<fftwf_complex*>(out),
			FFTW_FORWARD, FFTW_ESTIMATE);
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
  }
  catch (...) {
    fftwf_free(out);
    throw;
  }

  fftwf_free(out);
#endif

}

void MTZ2MapReader::readHeader(qlib::InStream &ins) throw (qlib::FileFormatException)
{
  char sbuf[256];

  ins.readFully(sbuf, 0, 4*sizeof(char));
  if (strncmp(sbuf, "MTZ ", 4)!=0) {
    MB_THROW(qlib::FileFormatException, "Not a MTZ file");
    return;
  }

  unsigned int nhdrst;
  ins.readFully((char*)&nhdrst, 0, 1*sizeof(int));

  unsigned char mtstring[4];
  ins.readFully((char*) &mtstring, 0, 1*sizeof(int));
  // printf("mark %X\n", mark);
  m_nConvInt = (mtstring[1]>>4) & 0x0f;
  m_nConvFlt = (mtstring[0]>>4) & 0x0f;
  MB_DPRINTLN("MTZ> iconv %X", m_nConvInt);
  MB_DPRINTLN("MTZ> fconv %X", m_nConvFlt);

  if (m_nConvInt!=4 || m_nConvFlt!=4) {
    MB_THROW(qlib::FileFormatException, "Unsupported byteorder\n");
    return;
  }

  m_nhdrst = nhdrst;
  MB_DPRINTLN("MTZ> nhdrst %X (*4=%d)\n", m_nhdrst, m_nhdrst*4);

  // skip header
  ins.readFully(sbuf, 0, (20-3)*4*sizeof(char));

  // OK
}

void MTZ2MapReader::readBody(qlib::InStream &ins) throw (qlib::FileFormatException)
{
  m_nrawdat = (m_nhdrst-1)*4 - 20*4;
  m_pbuf = new char[m_nrawdat];
  if (m_pbuf==NULL) {
    MB_THROW(qlib::OutOfMemoryException, "MTZ2MapReader> cannot allocate memory");
    return;
  }
  MB_DPRINTLN("MTZ2MapReader> alloc %d bytes\n", m_nrawdat);

  ins.readFully(m_pbuf, 0, m_nrawdat*sizeof(char));
}

void MTZ2MapReader::skipBody(qlib::InStream &ins) throw (qlib::FileFormatException)
{
  m_nrawdat = (m_nhdrst-1)*4 - 20*4;
  ins.skip(m_nrawdat*sizeof(char));
}

void MTZ2MapReader::readNcol(const char *sbuf)
{
  LString stmp(sbuf);
  stmp = stmp.chomp();
  std::list<LString> sls;
  stmp.split(' ', sls);

  MB_DPRINTLN("[%s]", stmp.c_str());
  MB_DPRINTLN("size=%d", sls.size());

  if (sls.size()<4) {
    MB_THROW(qlib::FileFormatException, "Invalid NCOL");
    return;
  }

  MB_DPRINTLN("%s", LString::join(",",sls).c_str());
  sls.pop_front();

  MB_DPRINTLN("%s", sls.front().c_str());
  // NCOL
  if (!sls.front().toInt(&m_ncol)) {
    MB_THROW(qlib::FileFormatException, "Invalid NCOL");
    return;
  }
  sls.pop_front();
  
  // NREFL
  if (!sls.front().toInt(&m_nrefl)) {
    MB_THROW(qlib::FileFormatException, "Invalid NCOL");
    return;
  }
  
  MB_DPRINTLN("NCOL=%d, NREFL=%d", m_ncol, m_nrefl);
}

void MTZ2MapReader::readColumn(const char *sbuf)
{
  Column col;
  
  LString stmp(sbuf);
  stmp = stmp.chomp();
  std::list<LString> sls;
  stmp.split(' ', sls);

  MB_DPRINTLN("[%s]", stmp.c_str());
  MB_DPRINTLN("size=%d", sls.size());
  
  MB_DPRINTLN("%s", LString::join(",",sls).c_str());

  if (sls.size()<3) {
    MB_THROW(qlib::FileFormatException, "Invalid COL");
    return;
  }

  sls.pop_front();

  // name
  col.name = sls.front();
  sls.pop_front();
  
  // type
  LString stype = sls.front();
  sls.pop_front();
  col.type = stype[0];
  
  col.nid = m_columns.size();

  MB_DPRINTLN("Column %s (%c)\n", col.name.c_str(), col.type);
  //col.name
  m_columns.set(col.name, col);
}

void MTZ2MapReader::readDcell(const char *sbuf)
{
  LString stmp(sbuf);
  stmp = stmp.chomp();
  std::list<LString> sls;
  stmp.split(' ', sls);

  MB_DPRINTLN("[%s]", stmp.c_str());
  MB_DPRINTLN("size=%d", sls.size());
  
  MB_DPRINTLN("%s", LString::join(",",sls).c_str());

  if (sls.size()<8) {
    MB_THROW(qlib::FileFormatException, "Invalid DCELL");
    return;
  }

  sls.pop_front();

  // data ID
  int nid;
  if (!sls.front().toInt(&nid)) {
    MB_THROW(qlib::FileFormatException, "Invalid DCELL");
    return;
  }
  sls.pop_front();
  // if (nid!=1) return;

  double tmp[6];
  for (int i=0; i<6; ++i) {
    if (!sls.front().toDouble(&tmp[i])) {
      MB_THROW(qlib::FileFormatException, "Invalid DCELL");
      return;
    }
    sls.pop_front();
  }
  
  m_cella = tmp[0];
  m_cellb = tmp[1];
  m_cellc = tmp[2];
  m_alpha = tmp[3];
  m_beta = tmp[4];
  m_gamma = tmp[5];

  MB_DPRINT("  unit cell a=%.2fA, b=%.2fA, c=%.2fA,\n", m_cella, m_cellb, m_cellc);
  MB_DPRINT("            alpha=%.2fdeg, beta=%.2fdeg, gamma=%.2fdeg,\n",
             m_alpha, m_beta, m_gamma);
}

void MTZ2MapReader::readSyminf(const char *sbuf)
{
  LString stmp(sbuf);
  stmp = stmp.chomp();
  std::list<LString> sls;
  stmp.split(' ', sls);

  MB_DPRINTLN("[%s]", stmp.c_str());
  MB_DPRINTLN("size=%d", sls.size());

  if (sls.size()<4) {
    MB_THROW(qlib::FileFormatException, "Invalid SYMINF");
    return;
  }

  MB_DPRINTLN("%s", LString::join(",",sls).c_str());
  sls.pop_front();

  // nsym
  sls.pop_front();

  // nop(primitive)
  sls.pop_front();

  // lattice
  sls.pop_front();

  // sgno
  if (!sls.front().toInt(&m_nSG)) {
    MB_THROW(qlib::FileFormatException, "Invalid SYMINF");
    return;
  }
  sls.pop_front();
}

void MTZ2MapReader::readResoln(const char *sbuf)
{
  LString stmp(sbuf);
  stmp = stmp.chomp();
  std::list<LString> sls;
  stmp.split(' ', sls);

  MB_DPRINTLN("[%s]", stmp.c_str());
  MB_DPRINTLN("size=%d", sls.size());

  if (sls.size()<3) {
    MB_THROW(qlib::FileFormatException, "Invalid RESO");
    return;
  }

  MB_DPRINTLN("%s", LString::join(",",sls).c_str());
  sls.pop_front();

  double tmp;
  // resmin
  if (!sls.front().toDouble(&tmp)) {
    MB_THROW(qlib::FileFormatException, "Invalid RESO");
    return;
  }
  sls.pop_front();
  m_dResMin = ::sqrt(1.0/tmp);

  // resmax
  if (!sls.front().toDouble(&tmp)) {
    MB_THROW(qlib::FileFormatException, "Invalid RESO");
    return;
  }
  sls.pop_front();
  m_dResMax = ::sqrt(1.0/tmp);

  // set building map resolution as the highest resln in MTZ file
  m_mapr = m_dResMax;
  MB_DPRINTLN("Resolution: %.2f - %.2f", m_dResMin, m_dResMax);
}

void MTZ2MapReader::readFooter(qlib::LineStream &ins) throw (qlib::FileFormatException)
{
  char sbuf[256];
  
  while (ins.ready()) {
    ins.readFully(sbuf, 0, 80);
    sbuf[80] = '\0';
    
    //fprintf(stderr, "record [%s]\n", sbuf);
    if (strncmp(sbuf, "NCOL", 4)==0) {
      readNcol(sbuf);
    }
    else if (strncmp(sbuf, "COL", 3)==0) {
      readColumn(sbuf);
    }
    else if (strncmp(sbuf, "DCEL", 4)==0) {
      readDcell(sbuf);
    }
    else if (strncmp(sbuf, "SYMINF", 6)==0) {
      readSyminf(sbuf);
    }
    else if (strncmp(sbuf, "RESO", 4)==0) {
      readResoln(sbuf);
    }
    else {
      MB_DPRINTLN("skip record [%s]", sbuf);
    }
  }

}

void MTZ2MapReader::setupSymmOp()
{
  int i;

  SymOpDB *pSODB = SymOpDB::getInstance();
  const char *symname = pSODB->getName(m_nSG);
  if (symname==NULL) {
    LString msg = LString::format("Invalid SGNO %d", m_nSG);
    MB_THROW(qlib::FileFormatException, msg);
    return;
  }

  Matrix4D *psymm = NULL;
  LString *pdum = NULL;
  int nsymm = pSODB->getSymOps(m_nSG, psymm, pdum);
  if (psymm==NULL||pdum==NULL) {
    LString msg = LString::format("Invalid SGNO %d", m_nSG);
    MB_THROW(qlib::FileFormatException, msg);
    return;
  }
  delete [] pdum;

  MB_DPRINTLN("MTZ> sgname=%s nasym=%d", symname, nsymm);
  
  m_nsymm = nsymm;
  m_symm.resize(m_nsymm);
  m_rsymm.resize(m_nsymm);
  for (i=0; i<m_nsymm; ++i) {
    m_symm[i] = psymm[i];
    m_rsymm[i] = makeRecipOp(psymm[i]);
  }
  delete [] psymm;
}

Matrix3D MTZ2MapReader::makeRecipOp(const Matrix4D &r)
{
  Matrix3D ret;
  Matrix3D symm = r.getMatrix3D();

  const double det = symm.deter();
  if (!qlib::isNear(qlib::abs(det), 1.0)) {
    LOG_DPRINTLN("det %f", det);
    MB_THROW(qlib::RuntimeException, "Symop: invalid determinant");
    return ret;
  }

  ret = ( symm.invert() ).transpose();
  // ret.transpose();
  return ret;

}

namespace {
  inline int MOD(int a, int b) {
    return a%b;
  }
}

/**
  calculate number suitable for FFT grid
 */
int calcprime(int N, int base1, int base2, int prim)
{
  int NN, P;
  bool CLOOP;

  NN=0;
  N=N-1;
  while (NN!=1) {
    // increment N until base1 and base2 are factors of N
    CLOOP=true;
    
    while (CLOOP) {
      N++;
      if (MOD(N, base1)==0 && MOD(N, base2)==0)
	CLOOP=false;
    }

    // divide N/BASE2 by integers less equal prim
    NN = N/base2;
    P=qlib::min(NN,prim);

    while (P>1) {
      while (MOD(NN,P)==0) {
	NN = NN/P;
      }
      P=P-1;
    }
  }

  return N;
}

#define ftprim 5

void MTZ2MapReader::calcgrid()
{
  int na, nb, nc;
  int nap, nbp, ncp;
  int napp, nbpp, ncpp;

  //double mapr = 1.7;

  na = qlib::max(2, int(m_cella/(m_mapr*m_grid)+F_EPS8));
  nb = qlib::max(2, int(m_cellb/(m_mapr*m_grid)+F_EPS8));
  nc = qlib::max(2, int(m_cellc/(m_mapr*m_grid)+F_EPS8));

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

  na = nap*napp;
  nb = nbp*nbpp;
  nc = ncp*ncpp;

  LOG_DPRINTLN("MTZ> Resoln=%f A, grid=%f", m_mapr, m_grid);
  LOG_DPRINTLN("MTZ> FFT grid size : (%d,%d,%d)", na, nb, nc);
  m_na = na;
  m_nb = nb;
  m_nc = nc;

  if (m_maxH>(na-1.0)/2.0) {
    MB_THROW(qlib::RuntimeException, "Grid in x-direction too coarse");
    return;
  }
  if (m_maxK>(nb-1.0)/2.0) {
    MB_THROW(qlib::RuntimeException, "Grid in y-direction too coarse");
    return;
  }
  if (m_maxL>(nc-1.0)/2.0) {
    MB_THROW(qlib::RuntimeException, "Grid in z-direction too coarse");
    return;
  }

  return;
}

void MTZ2MapReader::checkMapResoln()
{
  const double factor = 3.0;

  const double maxg_x = m_cella/(factor*double(m_maxH));
  const double maxg_y = m_cellb/(factor*double(m_maxK));
  const double maxg_z = m_cellc/(factor*double(m_maxL));
  const double maxg = qlib::min(maxg_x, qlib::min(maxg_y, maxg_z));

  MB_DPRINTLN("Possible FFT grid size %f,%f,%f", maxg_x, maxg_y, maxg_z);

  bool bauto = false;
  if (m_mapr>0.1) {
    if (m_mapr*m_grid>=maxg) {
      MB_DPRINTLN("MTZ> FFT grid (resoln=%f, grid=%f) is too coarse", m_mapr, m_grid);
      bauto = true;
    }
  }
  else {
    bauto = true;
  }

  if (bauto) {
    // determine from max HKL
    m_grid = 0.33;
    m_mapr = maxg/m_grid;
    MB_DPRINTLN("MTZ> Auto resoln: resoln=%f, grid=%f", m_mapr, m_grid);
  }

}

void MTZ2MapReader::checkHKLColumns()
{
  if (!m_columns.containsKey("H") ||
      !m_columns.containsKey("K") ||
      !m_columns.containsKey("L")) {
    MB_THROW(qlib::FileFormatException, "HKL Column not found");
    return;
  }
  if (m_columns.get("H").type!='H' ||
      m_columns.get("K").type!='H' ||
      m_columns.get("L").type!='H') {
    MB_THROW(qlib::FileFormatException, "HKL Column invalid type");
    return;
  }

  m_cind_h = m_columns.get("H").nid;
  m_cind_k = m_columns.get("K").nid;
  m_cind_l = m_columns.get("L").nid;
}

void MTZ2MapReader::selectFFTColumns()
{
  m_nfp = -1;
  m_nphi = -1;
  m_nwgt = -1;

  if (m_columns.containsKey(m_strClmnF) &&
      m_columns.get(m_strClmnF).type=='F'){
    m_nfp = m_columns.get(m_strClmnF).nid;
    m_sfp = m_columns.get(m_strClmnF).name;
  }

  if (m_columns.containsKey(m_strClmnPHI) &&
      m_columns.get(m_strClmnPHI).type=='P'){
    m_nphi = m_columns.get(m_strClmnPHI).nid;
    m_sphi = m_columns.get(m_strClmnPHI).name;
  }

  if (m_columns.containsKey(m_strClmnWT) &&
      m_columns.get(m_strClmnWT).type=='W'){
    m_nwgt = m_columns.get(m_strClmnWT).nid;
    m_swgt = m_columns.get(m_strClmnWT).name;
  }

  // if (m_nfp>=0 && m_nphi>=0) return;

  // Even the patterson map is ok.
  if (m_nfp>=0) return;

  // No corresponding columns --> guess default values
  guessFFTColumns();
}

void MTZ2MapReader::guessFFTColumns()
{
  // PHENIX
  if (m_columns.containsKey("2FOFCWT") &&
      m_columns.get("2FOFCWT").type=='F'){
    m_nfp = m_columns.get("2FOFCWT").nid;
    m_sfp = m_columns.get("2FOFCWT").name;
  }
  if (m_columns.containsKey("PH2FOFCWT") &&
      m_columns.get("PH2FOFCWT").type=='P'){
    m_nphi = m_columns.get("PH2FOFCWT").nid;
    m_sphi = m_columns.get("PH2FOFCWT").name;
  }
  if (m_nfp>=0 && m_nphi>=0) return;

  // REFMAC5
  if (m_columns.containsKey("FWT") &&
      m_columns.get("FWT").type=='F'){
    m_nfp = m_columns.get("FWT").nid;
    m_sfp = m_columns.get("FWT").name;
  }
  if (m_columns.containsKey("PHWT") &&
      m_columns.get("PHWT").type=='P'){
    m_nphi = m_columns.get("PHWT").nid;
    m_sphi = m_columns.get("PHWT").name;
  }
  if (m_nfp>=0 && m_nphi>=0) return;

  // SIGMAA
  if (m_columns.containsKey("FWT") &&
      m_columns.get("FWT").type=='F'){
    m_nfp = m_columns.get("FWT").nid;
    m_sfp = m_columns.get("FWT").name;
  }
  if (m_columns.containsKey("PHIC") &&
      m_columns.get("PHIC").type=='P'){
    m_nphi = m_columns.get("PHIC").nid;
    m_sphi = m_columns.get("PHIC").name;
  }
  if (m_nfp>=0 && m_nphi>=0) return;

  MB_THROW(qlib::FileFormatException, "FFT target column not found");
  return;
}

LString MTZ2MapReader::getColumnInfoJSON()
{
  LString rval;
  qlib::InStream *pIn = createInStream();
  if (pIn==NULL)
    return rval;
  
  {
    m_columns.erase(m_columns.begin(), m_columns.end());
    readHeader(*pIn); 
    skipBody(*pIn); 

    qlib::LineStream ins(*pIn);
    readFooter(ins);
  }
  pIn->close();
  delete pIn;

  bool bFirst = true;
  rval = "[";
  BOOST_FOREACH(const qlib::MapTable<Column>::value_type &elem, m_columns) {
    const Column &col = elem.second;
    if (!bFirst) rval += ",";
    rval += "{";
    rval += "\"nid\":"+LString::format("%d", col.nid);
    rval += ", \"name\": \""+col.name.escapeQuots()+"\"";
    rval += ", \"type\": \""+LString::format("%c", col.type)+"\"";
    rval += "}";
    bFirst = false;
  }
  rval += "]";

  return rval;
}

