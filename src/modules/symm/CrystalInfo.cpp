// -*-Mode: C++;-*-
//
// Crystallographic information
//
// $Id: CrystalInfo.cpp,v 1.2 2010/09/11 17:54:46 rishitani Exp $

#include <common.h>

#include "CrystalInfo.hpp"
#include "SymOpDB.hpp"

using namespace symm;

CrystalInfo::~CrystalInfo()
{
  if (m_pOrthMat!=NULL)
    delete m_pOrthMat;
  if (m_pFracMat!=NULL)
    delete m_pFracMat;
}


// get orthogonalization matrix
const Matrix3D &CrystalInfo::getOrthMat() const
{
  Matrix3D retval;

  if (m_pOrthMat!=NULL) {
    return *m_pOrthMat;
  }

  double alpha = m_alpha*M_PI/180;
  double beta = m_beta*M_PI/180;
  double gamma = m_gamma*M_PI/180;
  double coaster, siaster;

  coaster =
    (cos(beta)*cos(gamma) - cos(alpha))/
    (sin(beta)*sin(gamma));

  siaster = sqrt(1-coaster*coaster);

  retval.aij(1, 1) = m_cella;
  retval.aij(1, 2) = m_cellb * cos(gamma);
  retval.aij(1, 3) = m_cellc * cos(beta);

  retval.aij(2, 1) = 0.0;
  retval.aij(2, 2) = m_cellb * sin(gamma);
  retval.aij(2, 3) = -m_cellc * sin(beta)*coaster;
  
  retval.aij(3, 1) = 0.0;
  retval.aij(3, 2) = 0.0;
  retval.aij(3, 3) = m_cellc * sin(beta)*siaster;
  
  CrystalInfo *pthis = (CrystalInfo *)this;
  pthis->m_pOrthMat = new Matrix3D(retval);
  // retval.dump();
  return *m_pOrthMat;
}

// get fractionalization matrix
const Matrix3D &CrystalInfo::getFracMat() const
{
  if (m_pFracMat!=NULL) {
    return *m_pFracMat;
  }

  Matrix3D r = (getOrthMat()).invert();
  CrystalInfo *pthis = (CrystalInfo *)this;
  pthis->m_pFracMat = new Matrix3D(r);
  // r.dump();

  return *m_pFracMat;
}

double CrystalInfo::fracDist(const Vector4D &f1, const Vector4D &f2)
{
  double u = f1.x() - f2.x();
  double v = f1.y() - f2.y();
  double w = f1.z() - f2.z();
  getOrthMat();
  Matrix3D &q = *m_pOrthMat;

  // calculate the metrix tensor (TO DO: cache the tensor)
  double rlm11=q.aij(1, 1)*q.aij(1, 1) + q.aij(2, 1)*q.aij(2, 1) + q.aij(3, 1)*q.aij(3, 1);
  double rlm12=2.0*(q.aij(1, 1)*q.aij(1, 2) + q.aij(2, 1)*q.aij(2, 2) + q.aij(3, 1)*q.aij(3, 2));
  double rlm13=2.0*(q.aij(1, 1)*q.aij(1, 3) + q.aij(2, 1)*q.aij(2, 3) + q.aij(3, 1)*q.aij(3, 3));
  double rlm22=q.aij(1, 2)*q.aij(1, 2) + q.aij(2, 2)*q.aij(2, 2) + q.aij(3, 2)*q.aij(3, 2);
  double rlm23=2.0*(q.aij(1, 2)*q.aij(1, 3) + q.aij(2, 2)*q.aij(2, 3) + q.aij(3, 2)*q.aij(3, 3));
  double rlm33=q.aij(1, 3)*q.aij(1, 3) + q.aij(2, 3)*q.aij(2, 3) + q.aij(3, 3)*q.aij(3, 3);

  return sqrt(rlm11*u*u + rlm22*v*v + rlm33*w*w +
              rlm12*u*v +rlm13*u*w +rlm23*v*w);
}

///////////////////

int CrystalInfo::sysNameToID(const LString &nm)
{
  if (nm.equalsIgnoreCase("TRICLINIC"))
    return TRICLINIC;
  if (nm.equalsIgnoreCase("MONOCLINIC"))
    return MONOCLINIC;
  if (nm.equalsIgnoreCase("ORTHORHOMBIC"))
    return ORTHORHOMBIC;
  if (nm.equalsIgnoreCase("TETRAGONAL"))
    return TETRAGONAL;
  if (nm.equalsIgnoreCase("TRIGONAL"))
    return TRIGONAL;
  if (nm.equalsIgnoreCase("RHOMBOHEDRAL"))
    return TRIGONAL;
  if (nm.equalsIgnoreCase("HEXAGONAL"))
    return HEXAGONAL;
  if (nm.equalsIgnoreCase("CUBIC"))
    return CUBIC;

  MB_DPRINTLN("XtalInfo: invalid xtal sysname <%s>", nm.c_str());
  return -1; // invalid sysname
}

LString CrystalInfo::idToSysName(int id)
{
  switch (id) {
  case TRICLINIC:
    return LString("TRICLINIC");
  case MONOCLINIC:
    return LString("MONOCLINIC");
  case ORTHORHOMBIC:
    return LString("ORTHORHOMBIC");
  case TETRAGONAL:
    return LString("TETRAGONAL");
  case TRIGONAL:
    return LString("TRIGONAL");
  case HEXAGONAL:
    return LString("HEXAGONAL");
  case CUBIC:
    return LString("CUBIC");
  default:
    break;
  }

  MB_DPRINTLN("XtalInfo: invalid xtal sysid <%d>", id);
  return LString();
}

/// get lattice type name (e.g. monoclinic)
LString CrystalInfo::getLatticeName() const
{
  SymOpDB *pdb = SymOpDB::getInstance();
  int sysid = pdb->getXtalSysID(m_nSG);
  LString sysname = CrystalInfo::idToSysName(sysid);
  //if (sysname.isEmpty())
  //sysname = "(unknown)";
  return sysname;
}

/// get HM style sg name (e.g. P 43 21 2)
LString CrystalInfo::getHMSpaceGroupName() const
{
  SymOpDB *pdb = SymOpDB::getInstance();
  const char *sgname = pdb->getCName(m_nSG);
  if (sgname==NULL)
    return LString("(unknown)");
  return sgname;
}

/// get sg name (e.g. P43212)
LString CrystalInfo::getSpaceGroupName() const
{
  SymOpDB *pdb = SymOpDB::getInstance();
  // LString sgname = pdb->getName(m_nSG);
  const char *sgname = pdb->getName(m_nSG);
  if (sgname==NULL)
    return LString("(unknown)");
  return sgname;
}

void CrystalInfo::setSGByName(const LString &name)
{
  SymOpDB *pdb = SymOpDB::getInstance();
  int sgid = pdb->getSgIDByCName(name);
  if (sgid<1) {
    sgid = pdb->getSgIDByName(name);
    if (sgid<1) {
      LString msg = LString::format("Invalid s.g. name <%s>", name.c_str());
      MB_THROW (qlib::RuntimeException, msg);
      return;
    }
  }

  setSG(sgid);
}

void CrystalInfo::writeQdfData(DataTab &out)
{
  LString str;

  str = LString::fromReal(m_cella);
  out.forceSet("CrystalInfo.lena", str);

  str = LString::fromReal(m_cellb);
  out.forceSet("CrystalInfo.lenb", str);

  str = LString::fromReal(m_cellc);
  out.forceSet("CrystalInfo.lenc", str);

  str = LString::fromReal(m_alpha);
  out.forceSet("CrystalInfo.anga", str);

  str = LString::fromReal(m_beta);
  out.forceSet("CrystalInfo.angb", str);

  str = LString::fromReal(m_gamma);
  out.forceSet("CrystalInfo.angg", str);

  str = LString::fromInt(m_nSG);
  out.forceSet("CrystalInfo.sgid", str);
}

void CrystalInfo::readQdfData(const DataTab &in)
{
  LString val;

  if (in.containsKey("CrystalInfo.lena")) {
    val = in.get("CrystalInfo.lena");
    val.toDouble(&m_cella);
  }

  if (in.containsKey("CrystalInfo.lenb")) {
    val = in.get("CrystalInfo.lenb");
    val.toDouble(&m_cellb);
  }

  if (in.containsKey("CrystalInfo.lenc")) {
    val = in.get("CrystalInfo.lenc");
    val.toDouble(&m_cellc);
  }

  if (in.containsKey("CrystalInfo.anga")) {
    val = in.get("CrystalInfo.anga");
    val.toDouble(&m_alpha);
  }
  if (in.containsKey("CrystalInfo.angb")) {
    val = in.get("CrystalInfo.angb");
    val.toDouble(&m_beta);
  }
  if (in.containsKey("CrystalInfo.angg")) {
    val = in.get("CrystalInfo.angg");
    val.toDouble(&m_gamma);
  }

  if (in.containsKey("CrystalInfo.sgid")) {
    val = in.get("CrystalInfo.sgid");
    val.toInt(&m_nSG);
  }
}

