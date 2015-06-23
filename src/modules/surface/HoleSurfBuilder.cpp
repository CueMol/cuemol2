// -*-Mode: C++;-*-
//
//  HoleSurfBuilder
//

#include <common.h>
#include "surface.hpp"

#include "HoleSurfBuilder.hpp"
#include "MolSurfObj.hpp"

#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/MolAtom.hpp>
#include <modules/molstr/AtomIterator.hpp>
#include <modules/molstr/TopparManager.hpp>
#include <modules/molstr/AtomPosMap.hpp>

using namespace surface;
using molstr::MolCoordPtr;
using molstr::MolAtomPtr;
using molstr::AtomIterator;
using molstr::TopparManager;

/// ctor
HoleSurfBuilder::HoleSurfBuilder()
{
}

/// dtor
HoleSurfBuilder::~HoleSurfBuilder()
{
}

namespace {
  Vector4D getInplaneDir(const Vector4D &norm, const Vector4D &in)
  {
    //Vector4D nin = in.normalize();
    return in - norm.scale( norm.dot(in) );
  }

  double rand_real()
  {
    int i1 = rand();
    int i2 = rand();
    while(i1==RAND_MAX)
      i1 =rand();
    while(i2==RAND_MAX)
      i2 =rand();
    double mx = RAND_MAX;
    return (i1+i2/mx)/mx;
  }

  Vector4D getRandDir(const Vector4D &norm)
  {
    Vector4D rvec(rand_real(),rand_real(),rand_real());
    Vector4D res = getInplaneDir(norm, rvec);
    return res.normalize();
  }
}

void HoleSurfBuilder::doit()
{
  MolCoordPtr pMol = m_pTgtMol;
  const Vector4D &dirnorm = m_dirnorm;
  const Vector4D &startpos = m_startpos;

  molstr::AtomPosMap amap;
  amap.setTarget(pMol);
  amap.setSpacing(3.5);
  amap.generate();
  
  int i, j, nslice = 50;
  double dstep = 0.25;
  const double dmax = 0.3;
  
  Vector4D pos = startpos;

  std::vector<Vector4D> cen_ary(nslice);
  std::vector<double> rad_ary(nslice);

  TopparManager *pTM = TopparManager::getInstance();
  const double vdw_default = 2.0;

  double rad=-1.0;
  Vector4D dv = dirnorm.scale(dstep);

  const int nmcs = 1000;

  for (i=0; i<nslice && rad<5.0; ++i) {
    rad = -1.0;

    double temp = 0.00001;
    const double temp_scl = 0.9;

    MB_DPRINTLN("Start MC steps=%d, init T=%f", nmcs, temp);

    for (j=0; j<nmcs; ++j, temp *= temp_scl) {
      Vector4D newpos = pos;
      if (j>0)
        newpos += getRandDir(dirnorm).scale(rand_real()*dmax);
      int aid = amap.searchNearestAtom(newpos);
      MolAtomPtr pAtom = pMol->getAtom(aid);
      Vector4D rp = pAtom->getPos() - newpos;
      double vdw = pTM->getVdwRadius(pAtom, false);
      if (vdw<0)
        vdw = vdw_default;
      double new_r = rp.length() - vdw;

      if (new_r>rad) {
        // accept --> update
        MB_DPRINTLN("trial accepted for new_r=%f > rad=%f", new_r, rad);
        rad = new_r;
        pos = newpos;
      }
      else {
        double prob = exp( (new_r-rad)/temp );
        double rnd = rand_real();
        if (rnd < prob) {
          // accept --> update
          MB_DPRINTLN("T=%f, prob=%f, rnd=%f --> trial accepted for new_r=%f < rad=%f", temp, prob, rnd, new_r, rad);
          rad = new_r;
          pos = newpos;
        }
      }
      
    }        

    MB_DPRINTLN("slice %d pos=%f,%f,%f rad=%f", i, pos.x(), pos.y(), pos.z(), rad);
    rad_ary[i] = rad;
    cen_ary[i] = pos;

    pos = pos + dv;

  }
  for (;i<nslice; ++i) {
    rad_ary[i] = rad;
    cen_ary[i] = pos;
    pos = pos + dv;
  }

  //////////
  
  m_pRes = MolSurfObjPtr(MB_NEW MolSurfObj());
  const int ncdiv = 40;
  const int nverts = ncdiv*nslice;
  const int nfaces = ncdiv*(nslice-1)*2;
  
  m_pRes->setVertSize(nverts);
  m_pRes->setFaceSize(nfaces);

  Vector4D e1 = getInplaneDir(dirnorm, Vector4D(1,0,0));
  Vector4D e2 = e1.cross(dirnorm);

  int vind = 0;
  for (i=0; i<nslice; ++i) {
    const double dth = 2.0*M_PI/double(ncdiv);
    double th = 0.0;
    for (j=0; j<ncdiv; ++j) {
      const double rr = rad_ary[i];
      Vector4D vrr = e1.scale(cos(th)) + e2.scale(sin(th));
      m_pRes->setVertex(vind, cen_ary[i] + vrr.scale(rr), vrr);
      ++vind;
      th += dth;
    }
  }
  
  int find = 0;
  for (i=0; i<nslice-1; ++i) {
    int ibase = i*ncdiv;
    for (j=0; j<ncdiv; ++j) {
      //int vind = i*ncdiv + j;
      m_pRes->setFace(find, ibase+(j+1)%ncdiv, ibase+j, ibase+ncdiv+j);
      ++find;
      m_pRes->setFace(find, ibase+ncdiv+j, ibase+ncdiv+(j+1)%ncdiv, ibase+(j+1)%ncdiv);
      ++find;
    }
  }
}

