// -*-Mode: C++;-*-
//
// Crystallographic information
//   (cell dimension, spacegroup, etc)
//

#ifndef XTAL_CRYSTAL_INFO_HPP
#define XTAL_CRYSTAL_INFO_HPP

#include "xtal.hpp"

#include <qlib/Vector4D.hpp>
#include <qlib/Matrix3D.hpp>
//#include <qsys/Object.hpp>

namespace xtal {

using qlib::Vector4D;
using qlib::Matrix3D;
using qlib::LString;

class XTAL_API CrystalInfo
//: public MbExtData,
// public qlib::PropContainer
{
public:
  /// bravais lattice ID
  enum {
    TRICLINIC =1,
    MONOCLINIC,
    ORTHORHOMBIC,
    TETRAGONAL,
    TRIGONAL,
    HEXAGONAL,
    CUBIC
  };
  
private:
  /////////////////////////////////////////
  // properties

  /** cell dimensions */
  //MCINFO: double m_cella => a
  double m_cella;

  //MCINFO: double m_cellb => b
  double m_cellb;

  //MCINFO: double m_cellc => c
  double m_cellc;

  //MCINFO: double m_alpha => alpha
  double m_alpha;

  //MCINFO: double m_beta => beta
  double m_beta;

  //MCINFO: double m_gamma => gamma
  double m_gamma;

  /** Space Group number */
  //MCINFO: int m_nSG => nsg
  int m_nSG;

  /////////////////////////////////////////
  // workarea

  // cached orth/frac matrix
  mutable Matrix3D *m_pOrthMat;
  mutable Matrix3D *m_pFracMat;

public:

  /** default constructor */
  CrystalInfo()
       : m_cella(100.0), m_cellb(100.0), m_cellc(100.0),
         m_alpha(90.0), m_beta(90.0), m_gamma(90.0),
         m_nSG(1), m_pOrthMat(NULL), m_pFracMat(NULL)
    {
    }

  CrystalInfo(double a, double b, double c,
	      double alpha, double beta, double gamma,
	      int sg)
    : m_cella(a), m_cellb(b), m_cellc(c),
      m_alpha(alpha), m_beta(beta), m_gamma(gamma),
      m_nSG(sg), m_pOrthMat(NULL), m_pFracMat(NULL)
  {
  }

  /** copy constructor */
  CrystalInfo(const CrystalInfo &src)
    : m_cella(src.m_cella), m_cellb(src.m_cellb), m_cellc(src.m_cellc),
      m_alpha(src.m_alpha), m_beta(src.m_beta), m_gamma(src.m_gamma),
      m_nSG(src.m_nSG), m_pOrthMat(NULL), m_pFracMat(NULL)
  {
  }

  // destructor
  ~CrystalInfo();

  ////////////////////////////////////////////////

  void setCellDimension(double a, double b, double c,
			double alpha, double beta, double gamma) {
    if (m_pOrthMat) {
      delete m_pOrthMat;
      m_pOrthMat = NULL;
    }

    if (m_pFracMat) {
      delete m_pFracMat;
      m_pFracMat = NULL;
    }

    m_pFracMat = NULL;
    m_cella = a; m_cellb = b; m_cellc = c;
    m_alpha = alpha; m_beta = beta; m_gamma = gamma;
  }

  double a() const { return m_cella; }
  double b() const { return m_cellb; }
  double c() const { return m_cellc; }

  double alpha() const { return m_alpha; }
  double beta() const { return m_beta; }
  double gamma() const { return m_gamma; }

  int getSG() const { return m_nSG; }
  void setSG(int nsg) { m_nSG = nsg; }

  // get orthogonalization matrix
  const Matrix3D &getOrthMat() const;

  // get fractionalization matrix
  const Matrix3D &getFracMat() const;

  void fracToOrth(Vector4D &v) const {
    if (m_pOrthMat==NULL)
      getOrthMat();
    m_pOrthMat->xform(v);
  }

  void orthToFrac(Vector4D &v) const {
    if (m_pFracMat==NULL)
      getFracMat();
    m_pFracMat->xform(v);
  }

  /// Calculate orthogonal space distance of
  /// the two point that are fractional coordinates.
  double fracDist(const Vector4D &f1, const Vector4D &f2);

public:
  static int sysNameToID(const LString &nm);
  static LString idToSysName(int id);

  /*
  static CrystalInfo *getInfo(const LString &objname);
  static CrystalInfo *getInfo(MbObject *pobj) {
    return dynamic_cast<CrystalInfo *>(pobj->getExtData("symminfo"));
  }
  static void registerInfo(const LString &objname, CrystalInfo *pxi);
  static void fireChangedEvent(const LString &objname);
   */
};

} // namespace xtal

#endif

