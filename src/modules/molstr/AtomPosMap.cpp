// -*-Mode: C++;-*-
//
//  Atom position <--> ID mapping
//
// $Id: AtomPosMap.cpp,v 1.2 2011/04/01 17:19:01 rishitani Exp $

#include <common.h>

#include "AtomPosMap.hpp"
#include "MolCoord.hpp"
#include "MolAtom.hpp"
#include "AtomIterator.hpp"

using namespace molstr;

AtomPosMap::~AtomPosMap()
{
  int i, nsize;

  if (m_pMap!=NULL) {
    nsize = m_pMap->size();
    for (i=0; i<nsize; ++i)
      if((*m_pMap)[i] != NULL)
        delete (*m_pMap)[i];
    delete m_pMap;
  }
}

void AtomPosMap::dumpMaxSize()
{
  if (m_pMap==NULL) return;

  int i;
  int nmax = 0;

  int nsize = m_pMap->size();
  for (i=0; i<nsize; ++i) {
    if((*m_pMap)[i] == NULL)
      continue;
    int s = (*m_pMap)[i]->size();
    if (s>nmax) nmax = s;
  }

  MB_DPRINTLN("AtomPosMap> nsize=%d, nmax=%d", nsize, nmax);
}

void AtomPosMap::generate(SelectionPtr pSel)
{
  MB_ASSERT(!m_pMol.isnull());
  if (m_pMap!=NULL) {
    delete m_pMap;
    m_pMap = NULL;
  }

  //
  // make bounding box/all-atom list
  //

  m_min = Vector4D(+1.0E100, +1.0E100, +1.0E100);
  m_max = Vector4D(-1.0E100, -1.0E100, -1.0E100);

  m_allList.clear();

  AtomIterator iter(m_pMol);

  if (!pSel.isnull())
    iter.setSelection(pSel);

  for (iter.first(); iter.hasMore(); iter.next()) {
    MolAtomPtr pa = iter.get();
    Vector4D pos = pa->getPos();
    if (pos.x()<m_min.x()) m_min.x() = pos.x();
    if (m_max.x()<pos.x()) m_max.x() = pos.x();
    
    if (pos.y()<m_min.y()) m_min.y() = pos.y();
    if (m_max.y()<pos.y()) m_max.y() = pos.y();
    
    if (pos.z()<m_min.z()) m_min.z() = pos.z();
    if (m_max.z()<pos.z()) m_max.z() = pos.z();

    m_allList.push_back(pa->getID());
  }

  const int nsel = m_allList.size();
  
  if (nsel<m_nMinAtomMap) {
    MB_DPRINTLN("AtomPosMap> target molsel size (%d) is small than threshold (%d) --> use brute force method", nsel, m_nMinAtomMap);
    m_bUseBruteForce = true;
    return;
  }
  m_bUseBruteForce = false;

  // inflate bbox for safety
  m_min.x() -= 0.1;
  m_min.y() -= 0.1;
  m_min.z() -= 0.1;

  m_max.x() += 0.1;
  m_max.y() += 0.1;
  m_max.z() += 0.1;

  MB_DPRINTLN("bbox (%f,%f,%f)-(%f,%f,%f)",
              m_min.x(), m_min.y(), m_min.z(),
              m_max.x(), m_max.y(), m_max.z());


  // alloc atommap
  m_nx = (int)::ceil((m_max.x() - m_min.x())/m_dSpacing);
  m_ny = (int)::ceil((m_max.y() - m_min.y())/m_dSpacing);
  m_nz = (int)::ceil((m_max.z() - m_min.z())/m_dSpacing);

  int i, nsize = m_nx*m_ny*m_nz;
  m_pMap = MB_NEW valarray<AidList *>(nsize);
  for (i=0; i<nsize; ++i)
    (*m_pMap)[i] = NULL;
  MB_ASSERT(m_pMap!=NULL);

  int ix, iy, iz;

  for (iter.first(); iter.hasMore(); iter.next()) {
    int aid = iter.getID();
    MolAtomPtr pa = iter.get();
    Vector4D pos = pa->getPos();

    getNearGrid(pos, ix, iy, iz);
    if (ix<0 || iy<0 || iz<0 ||
        ix>=m_nx || iy>=m_ny || iz>=m_nz) {
      LOG_DPRINTLN("Fatal Error: atom pos (%f,%f,%f) is out of bound!!",
                   pos.x(), pos.y(), pos.z());
      continue;
    }
    appendAID(ix, iy, iz, aid);
  }
  
  MB_DPRINTLN("AtomPosMap> alloc (%d,%d,%d) atommap for %d atoms by spacing %f",
              m_nx, m_ny, m_nz, nsel, m_dSpacing);

#ifdef MB_DEBUG
  dumpMaxSize();
#endif
}

void AtomPosMap::getNearGrid(const Vector4D &pos,
                             int &ix, int &iy, int &iz)
{
  /*
  if (pos.x()<m_min.x() || pos.y()<m_min.y() || pos.z()<m_min.z() ||
      pos.x()>m_max.x() || pos.y()>m_max.y() || pos.z()>m_max.z()) {
    ix = iy = iz = -1;
    return;
  }*/

  Vector4D rp = pos - m_min;
  Vector4D gspc = m_max-m_min;

  gspc.x() /= m_nx;
  gspc.y() /= m_ny;
  gspc.z() /= m_nz;

  rp.x() /= gspc.x();
  rp.y() /= gspc.y();
  rp.z() /= gspc.z();

  ix = (int) rp.x();
  iy = (int) rp.y();
  iz = (int) rp.z();

  /*
  if (ix>=m_nx || iy>=m_ny || iz>=m_nz) {
    LOG_DPRINTLN("FatalERROR: nr grid of (%f,%f,%f): %d,%d,%d is out of bound",
                 pos.x(), pos.y(), pos.z(), ix, iy, iz);
    ix = iy = iz = -1;
    return;
  }*/
  
  //MB_DPRINTLN("nr grid of (%f,%f,%f): %d,%d,%d",
  //pos.x(), pos.y(), pos.z(), ix, iy, iz);
}

bool AtomPosMap::checkDist(int ix, int iy, int iz, const Vector4D &pos,
                           int &rimin, double &rdmin)
{
  if (ix<0 || ix>=m_nx ||
      iy<0 || iy>=m_ny ||
      iz<0 || iz>=m_nz ) {
    // out of the boundary
    return false;
  }

  AidList *plist = getAt(ix, iy, iz);
  if (plist==NULL) {
    // no entry;
    return false;
  }

  double dsqmin = 1.0e100;
  int imin = -1;
  AidList::const_iterator iter = plist->begin();
  AidList::const_iterator eiter = plist->end();
  for (; iter!=eiter; ++iter) {
    int aid = *iter;
    MolAtomPtr pa = m_pMol->getAtom(aid);
    MB_ASSERT(!pa.isnull());
    Vector4D apos = pa->getPos();
    apos -= pos;

    double nrsq = apos.sqlen();

    /*
    MB_DPRINTLN("checking (%f,%f,%f) %s %s%d %s: %f",
                apos.x(), apos.y(), apos.z(),
                pa->getChainName().c_str(),
                pa->getResName().c_str(),
                pa->getResIndex(),
                pa->getName().c_str(),
                ::sqrt(nrsq));*/

    if (nrsq<dsqmin) {
      dsqmin = nrsq;
      imin = aid;
    }
  }

  if (imin<0) return false;

  rimin = imin;
  //rdmin = ::sqrt(dsqmin);
  rdmin = dsqmin;
  return true;
}

int AtomPosMap::searchNearestAtom(const Vector4D &pos)
{
  if (m_bUseBruteForce)
    return bruteForceSearch(pos);

  int ix, iy, iz;
  getNearGrid(pos, ix, iy, iz);
  if (ix<0 || iy<0 || iz<0 ||
      ix>=m_nx || iy>=m_ny || iz>=m_nz) {
    // X
    if (pos.x()<m_min.x())
      ix = 0;
    else if (pos.x()>m_max.x())
      ix = m_nx-1;

    // Y
    if (pos.y()<m_min.y())
      iy = 0;
    else if (pos.y()>m_max.y())
      iy = m_ny-1;

    // Z
    if (pos.z()<m_min.z())
      iz = 0;
    else if (pos.z()>m_max.z())
      iz = m_nz-1;

    MB_ASSERT(!(ix<0||iy<0||iz<0||
                ix>=m_nx||iy>=m_ny||iz>=m_nz));
  }

  //MB_DPRINTLN("nearest atom of (%f,%f,%f)...",
  //pos.x(), pos.y(), pos.z());

  double dmin = 1.0e100;
  int imin = -1;

  int i, j, k;
  for (i=-1; i<=1; ++i) {
    for (j=-1; j<=1; ++j) {
      for (k=-1; k<=1; ++k) {
        int itrmin;
        double dtrmin;
        bool res = checkDist(ix + i, iy + j, iz + k,
                             pos, itrmin, dtrmin);
        if (!res) continue;

        if (dtrmin<dmin) {
          // update the minimum
          imin = itrmin;
          dmin = dtrmin;
        }
      }
    }
  }

  if (imin<0) {
    MB_DPRINTLN("Not found --> fallback to brute-force ver");
    return bruteForceSearch(pos);
  }
  return imin;
}

int AtomPosMap::bruteForceSearch(const Vector4D &pos)
{
  double dsqmin = 1.0e100;
  int imin = -1;
  AidList::const_iterator iter = m_allList.begin();
  AidList::const_iterator eiter = m_allList.end();

  for (; iter!=eiter; ++iter) {
    int aid = *iter;
    MolAtomPtr pa = m_pMol->getAtom(aid);
    MB_ASSERT(!pa.isnull());
    Vector4D apos = pa->getPos();
    const double nrsq = (apos-pos).sqlen();

    /*
    MB_DPRINTLN("checking (%f,%f,%f) %s %s%d %s: %f",
                apos.x(), apos.y(), apos.z(),
                pa->getChainName().c_str(),
                pa->getResName().c_str(),
                pa->getResIndex(),
                pa->getName().c_str(),
                ::sqrt(nrsq));*/

    if (nrsq<dsqmin) {
      dsqmin = nrsq;
      imin = aid;
    }
  }

  return imin;
}


