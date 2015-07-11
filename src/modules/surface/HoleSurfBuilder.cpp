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
  m_den = 2.0;
  m_prober = 1.4;
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
  LString selstr;
  if (!m_pTgtSel.isnull())
    selstr = m_pTgtSel->toString();
  
  LOG_DPRINTLN("Hole calc for mol %s, sel %s",
               m_pTgtMol->getName().c_str(),
               selstr.c_str());

  const Vector4D &dirnorm = m_dirnorm;
  const Vector4D &startpos = m_startpos;

  m_pAmap = new molstr::AtomPosMap;
  m_pAmap->setTarget(m_pTgtMol);
  //m_pAmap->setSpacing(3.5);
  m_pAmap->setSpacing(5.0);
  m_pAmap->generate(m_pTgtSel);
  
  const double trytemp[] = {0.0, 0.1, 0.2};

  int nslice;
  double score = 0.0, prev_score = -1.0;
  std::vector<Vector4D> cen_ary;
  for (int i=0; i<sizeof(trytemp); ++i) {
    std::vector<Vector4D> new_ary;
    findPath(trytemp[i], new_ary, score, nslice);
    if (score < prev_score) {
      // new score is worse than prev --> stop path search & use prev path
      break;
    }

    // save the prev result
    prev_score = score;
    cen_ary = new_ary;
  }

  delete m_pAmap;
  m_pAmap = NULL;
  
  //////////
  
  m_pRes = MolSurfObjPtr(MB_NEW MolSurfObj());

  nslice = cen_ary.size();
  const int nskip = 2;
  int npore = nslice/nskip;
  if (npore<1) {
    LOG_DPRINTLN("Pore search failed");
    return;
  }

  std::vector< Vector4D > pore(npore);

  for (int i=0, isl=0; i<npore; ++i, isl+=nskip) {
    pore[i] = cen_ary[isl];
    // pore[i].w() = rad_ary[isl];
  }  

  LOG_DPRINTLN("Creating surface for pore %d pts", npore);
  m_pRes->createSESFromArray(pore, m_den, m_prober);

/*
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
 */
}

/// Perform pore-radius optimization using Monte-Carlo SA method
void HoleSurfBuilder::performMCOpt(double start_temp, const Vector4D &start_pos,
                                   Vector4D &res_pos, double &res_rad)
{
  int j;
  
  // optimization params
  const double dmax = 0.3;
  const double temp_scl = 0.9;
  const int nmcs = 1000;
  const double vdw_default = 2.0;

  // variables
  Vector4D pos = start_pos;
  double rad = -1.0;
  double temp = start_temp;
  MolCoordPtr pMol = m_pTgtMol;
  TopparManager *pTM = TopparManager::getInstance();

//  MB_DPRINTLN("Start MC steps=%d, init T=%f", nmcs, temp);
  
  for (j=0; j<nmcs; ++j, temp *= temp_scl) {
    Vector4D newpos = pos;

    // random search for the new center of the probe
    if (j>0)
      newpos += getRandDir(m_dirnorm).scale(rand_real()*dmax);

    int aid = m_pAmap->searchNearestAtom(newpos);
    MolAtomPtr pAtom = pMol->getAtom(aid);
    Vector4D rp = pAtom->getPos() - newpos;
    double vdw = pTM->getVdwRadius(pAtom, false);
    if (vdw<0)
      vdw = vdw_default;
    double new_r = rp.length() - vdw;
    
    if (new_r>rad) {
      // accept --> update
//      MB_DPRINTLN("STEP %d: trial accepted for new_r=%f > rad=%f", j, new_r, rad);
      rad = new_r;
      pos = newpos;
    }
    else {
      double prob = exp( (new_r-rad)/temp );
      double rnd = rand_real();
      if (rnd < prob) {
        // accept --> update
//        MB_DPRINTLN("STEP %d: T=%f, prob=%f, rnd=%f --> trial accepted for new_r=%f < rad=%f", j, temp, prob, rnd, new_r, rad);
        rad = new_r;
        pos = newpos;
      }
    }
    
  }        

  res_pos = pos;
  res_rad = rad;
  return;
}

void HoleSurfBuilder::findPath(double start_temp,
                               std::vector<Vector4D> &res_cen_ary,
                               double &res_score,
                               int &isl_max)
{

  // parameters
  const int nslice = 1000;
  const double dstep = 0.25;
  const double rad_max = 5.0;
  const double rad_min = 1.0;
  
  Vector4D pos = m_startpos;

  //std::vector<Vector4D> cen_ary(nslice);
  // std::vector<double> rad_ary(nslice);

  // variables
  int i, j;
  double rad = -1.0;
  double vol = 0.0;

  Vector4D dv = m_dirnorm.scale(dstep);
  
  for (i=0; i<nslice; ++i) {

    Vector4D res_pos;
    double res_rad;

    performMCOpt(start_temp, pos, res_pos, res_rad);

//    MB_DPRINTLN("=========================");
//    MB_DPRINTLN("SLICE %d pos=%f,%f,%f rad=%f", i, res_pos.x(), res_pos.y(), res_pos.z(), res_rad);
//    MB_DPRINTLN("=========================");

    res_cen_ary.push_back(Vector4D(res_pos.x(), res_pos.y(), res_pos.z(), res_rad));

    pos = res_pos + dv;
    vol += res_rad * dstep;

    if (res_rad < rad_min) {
      LOG_DPRINTLN("Radius is too small (%f<%f); abort search", res_rad, rad_min);
      ++i;
      break;
    }

    if (res_rad > rad_max) {
      LOG_DPRINTLN("Radius is too large (%f>%f); abort search", res_rad, rad_max);
      ++i;
      break;
    }
  }

  LOG_DPRINTLN("Tst=%f --> nslice=%d, vol=%f", start_temp, i, vol);

  res_score = vol;
  isl_max = i;
}

