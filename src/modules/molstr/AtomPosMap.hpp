// -*-Mode: C++;-*-
//
//  Atom position <--> ID mapping
//
// $Id: AtomPosMap.hpp,v 1.2 2011/04/01 17:19:01 rishitani Exp $

#ifndef ATOM_POS_MAP_HPP_INCLUDED_
#define ATOM_POS_MAP_HPP_INCLUDED_

#include "molstr.hpp"
#include <qlib/Vector4D.hpp>

namespace molstr {

class MolCoord;
using qlib::Vector4D;
using std::valarray;

class MOLSTR_API AtomPosMap
{
private:
  /// target molecule
  MolCoordPtr m_pMol;
  
  Vector4D m_min, m_max;

  double m_dSpacing;

  int m_nx, m_ny, m_nz;

  //typedef std::list<int> aidlist;
  typedef std::deque<int> AidList;

  valarray<AidList *> *m_pMap;
  
  int m_nMinAtomMap;
  bool m_bUseBruteForce;
  AidList m_allList;
  
public:
  AtomPosMap() : m_dSpacing(10.0), m_pMap(NULL), m_nMinAtomMap(100), m_bUseBruteForce(false) {}
  ~AtomPosMap();

  void setTarget(MolCoordPtr pMol) { m_pMol = pMol; }
  void setSpacing(double d) { m_dSpacing = d; }

  void generate(SelectionPtr pSel = SelectionPtr());

  int searchNearestAtom(const Vector4D &pos);

  void dumpMaxSize();

  void setMinAtomMap(int n) { m_nMinAtomMap = n; }
  int getMinAtomMap() const { return m_nMinAtomMap; }

private:

  bool checkDist(int ix, int iy, int iz, const Vector4D &pos,
                 int &rimin, double &rdmin);

  void getNearGrid(const Vector4D &pos,
                   int &ix, int &iy, int &iz);

  int bruteForceSearch(const Vector4D &pos);

  void setAt(int ix, int iy, int iz, AidList *p) {
    MB_ASSERT(ix>=0 && ix<m_nx);
    MB_ASSERT(iy>=0 && iy<m_ny);
    MB_ASSERT(iz>=0 && iz<m_nz);
    (*m_pMap)[ix + (iy + iz*m_ny)*m_nx] = p;
  }

  AidList *getAt(int ix, int iy, int iz) const {
    MB_ASSERT(ix>=0 && ix<m_nx);
    MB_ASSERT(iy>=0 && iy<m_ny);
    MB_ASSERT(iz>=0 && iz<m_nz);
    return (*m_pMap)[ix + (iy + iz*m_ny)*m_nx];
  }

  void appendAID(int ix, int iy, int iz, int aid) {
    MB_ASSERT(ix>=0 && ix<m_nx);
    MB_ASSERT(iy>=0 && iy<m_ny);
    MB_ASSERT(iz>=0 && iz<m_nz);

    if (getAt(ix, iy, iz)==NULL)
      setAt(ix, iy, iz, MB_NEW AidList);
    AidList *plist = getAt(ix, iy, iz);
    plist->push_back(aid);
  }

};

}

#endif // ATOM_POS_MAP_HPP_INCLUDED_


