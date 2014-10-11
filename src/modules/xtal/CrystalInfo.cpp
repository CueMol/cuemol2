// -*-Mode: C++;-*-
//
// Crystallographic information
//
// $Id: CrystalInfo.cpp,v 1.1 2010/01/16 15:32:08 rishitani Exp $

#include <common.h>

#include "CrystalInfo.hpp"

using namespace xtal;

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

  retval.aij(1,1) = m_cella;
  retval.aij(1,2) = m_cellb * cos(gamma);
  retval.aij(1,3) = m_cellc * cos(beta);

  retval.aij(2,1) = 0.0;
  retval.aij(2,2) = m_cellb * sin(gamma);
  retval.aij(2,3) = -m_cellc * sin(beta)*coaster;
  
  retval.aij(3,1) = 0.0;
  retval.aij(3,2) = 0.0;
  retval.aij(3,3) = m_cellc * sin(beta)*siaster;
  
  m_pOrthMat = new Matrix3D(retval);
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
  double rlm11=q.aij(1,1)*q.aij(1,1) + q.aij(2,1)*q.aij(2,1) + q.aij(3,1)*q.aij(3,1);
  double rlm12=2.0*(q.aij(1,1)*q.aij(1,2) + q.aij(2,1)*q.aij(2,2) + q.aij(3,1)*q.aij(3,2));
  double rlm13=2.0*(q.aij(1,1)*q.aij(1,3) + q.aij(2,1)*q.aij(2,3) + q.aij(3,1)*q.aij(3,3));
  double rlm22=q.aij(1,2)*q.aij(1,2) + q.aij(2,2)*q.aij(2,2) + q.aij(3,2)*q.aij(3,2);
  double rlm23=2.0*(q.aij(1,2)*q.aij(1,3) + q.aij(2,2)*q.aij(2,3) + q.aij(3,2)*q.aij(3,3));
  double rlm33=q.aij(1,3)*q.aij(1,3) + q.aij(2,3)*q.aij(2,3) + q.aij(3,3)*q.aij(3,3);

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

#if 0
#include <mbsys/QsysModule.hpp>

//static
CrystalInfo *CrystalInfo::getInfo(const LString &objname)
{
  MbObject *pobj = QsysModule::getObjByName_throw(objname);
  return getInfo(pobj);
}

//static
void CrystalInfo::registerInfo(const LString &objname, CrystalInfo *pxi)
{
  MbObject *pobj = QsysModule::getObjByName_throw(objname);
  pobj->setExtData("symminfo", pxi);
}

#include "SymmChangedEvent.hpp"

//static
void CrystalInfo::fireChangedEvent(const LString &objname)
{
  MbObject *pobj = QsysModule::getObjByName_throw(objname);
  SymmChangedEvent ev;
  ev.setTarget(pobj);
  pobj->fireMbObjEvent(ev);
}
#endif

