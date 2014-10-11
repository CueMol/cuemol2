// -*-Mode: C++;-*-
//
// Crystallographic information
//
// $Id: CrystalInfo.hpp,v 1.2 2010/09/11 17:54:46 rishitani Exp $

#ifndef SYMM_CRYSTAL_INFO_HPP_INCLUDED
#define SYMM_CRYSTAL_INFO_HPP_INCLUDED

#include "symm.hpp"

// #include <qlib/Vector4D.hpp>
// #include <qlib/Matrix3D.hpp>
#include <qlib/LScrVector4D.hpp>
#include <qlib/LScrMatrix4D.hpp>
#include <qlib/LString.hpp>

#include <qsys/ObjExtData.hpp>

namespace symm {

using qlib::Vector4D;
using qlib::Matrix3D;
using qlib::LString;

class SYMM_API CrystalInfo : public qsys::ObjExtData
{
  MC_SCRIPTABLE;
  MC_CLONEABLE;

public:
  /** bravais lattice ID */
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

  /// cell dimensions
  double m_cella;
  double m_cellb;
  double m_cellc;
  double m_alpha;
  double m_beta;
  double m_gamma;

  /// Space Group number
  int m_nSG;

  /////////////////////////////////////////
  // workarea

  // cached orth/frac matrix
  Matrix3D *m_pOrthMat;
  Matrix3D *m_pFracMat;

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

  // = operator
  const CrystalInfo &operator=(const CrystalInfo &src)
  {
    if(&src!=this){
      setCellDimension(src.m_cella,src.m_cellb,src.m_cellc,
                       src.m_alpha,src.m_beta,src.m_gamma);
      m_nSG = src.m_nSG;
    }
    return *this;
  }

  ////////////////////////////////////////////////

  void setCellDimension(double a, double b, double c,
			double alpha, double beta, double gamma)
  {
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

  void setA(double arg) { m_cella = arg; }
  void setB(double arg) { m_cellb = arg; }
  void setC(double arg) { m_cellc = arg; }

  double alpha() const { return m_alpha; }
  double beta() const { return m_beta; }
  double gamma() const { return m_gamma; }

  void setAlpha(double arg) { m_alpha = arg; }
  void setBeta(double arg) { m_beta = arg; }
  void setGamma(double arg) { m_gamma = arg; }

  int getSG() const { return m_nSG; }
  void setSG(int nsg) { m_nSG = nsg; }

  // get orthogonalization matrix
  const Matrix3D &getOrthMat() const;

  qlib::LScrMatrix4D getOrthMatScr() const {
    return qlib::LScrMatrix4D(qlib::Matrix4D(getOrthMat()));
  }

  // get fractionalization matrix
  const Matrix3D &getFracMat() const;

  qlib::LScrMatrix4D getFracMatScr() const {
    return qlib::LScrMatrix4D(qlib::Matrix4D(getFracMat()));
  }

  void fracToOrth(Vector4D &v) const {
    if (m_pOrthMat==NULL)
      getOrthMat();
    m_pOrthMat->xform(v);
  }

  qlib::LScrVector4D fracToOrthScr(const qlib::LScrVector4D &v) const {
    qlib::Vector4D rval = v;
    fracToOrth(rval);
    return qlib::LScrVector4D(rval);
  }

  void orthToFrac(Vector4D &v) const {
    if (m_pFracMat==NULL)
      getFracMat();
    m_pFracMat->xform(v);
  }

  qlib::LScrVector4D orthToFracScr(const qlib::LScrVector4D &v) const {
    qlib::Vector4D rval = v;
    orthToFrac(rval);
    return qlib::LScrVector4D(rval);
  }

  /**
     Calculate orthogonal space distance of
     the two point that are fractional coordinates.
  */
  double fracDist(const Vector4D &f1, const Vector4D &f2);

  /// get lattice type name (e.g. monoclinic)
  LString getLatticeName() const;

  /// get HM style sg name (e.g. P 43 21 2)
  LString getHMSpaceGroupName() const;

  /// get sg name (e.g. P43212)
  LString getSpaceGroupName() const;

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

} // namespace symm

#endif

