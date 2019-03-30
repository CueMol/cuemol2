// -*-Mode: C++;-*-
//
// Contact map calculation
//

#include <common.h>

#include "MolAnlManager.hpp"
#include <modules/molstr/BSPTree.hpp>
#include <modules/molstr/MolResidue.hpp>
#include <modules/molstr/AtomIterator.hpp>
#include <modules/molstr/BondIterator.hpp>
#include <modules/molstr/ResidIterator.hpp>

#include <qsys/style/AutoStyleCtxt.hpp>

using namespace molanl;
using namespace molstr;

class ContactMap
{
private:

  MolCoordPtr m_pMol;

  BSPTree<int> m_tree;

  struct AtomData {
    MolAtomPtr patm;
    Vector4D pos;
    bool bChk;
  };

  std::vector<AtomData> m_data;

public:

  // int m_adjrng;

  /// Limit contact enumeration to the N/O pairs
  bool m_bHbon;

  /// minimum interaction distance
  double m_rmin;

  /// maximum interaction distance
  double m_rmax;

  /// maximum number of interactions
  int m_nMax;

  /// log output flag
  bool m_bLog;

  typedef std::set<std::pair<int, int> > IntrSet;

  LString doit(MolCoordPtr pMol, SelectionPtr pSel1, SelectionPtr pSel2)
  {
    m_pMol = pMol;

    qlib::uid_t scid = pMol->getSceneID();
    qsys::AutoStyleCtxt asc(scid);

    AtomIterator aiter(pMol);
    int i, j, natoms=0;

    // count atom number
    for (aiter.first(); aiter.hasMore(); aiter.next()) {
      MolAtomPtr pAtom = aiter.get();
      MB_ASSERT(!pAtom.isnull());
      ++natoms;
    }

    MB_DPRINTLN("Calculating contactmap for %d atoms.", natoms);
    // copy to the m_data and BSP tree (m_tree)
    m_data.resize(natoms);
    m_tree.alloc(natoms);
    for (i=0,aiter.first(); aiter.hasMore()&&i<natoms; aiter.next(),++i) {
      MolAtomPtr pAtom = aiter.get();
      m_data[i].pos = pAtom->getPos();
      m_data[i].patm = pAtom;
      m_data[i].bChk = false;
      
      m_tree.setAt(i, pAtom->getPos(), i);
    }

    // build BSP tree
    m_tree.build();

    /////////////////////////////////////////////

    IntrSet intrset;
    
    for (i=0; i<natoms; ++i) {
      // MB_DPRINTLN("AID %d", i);
      MolAtomPtr pAtom1 = m_data[i].patm;
      MolResiduePtr pRes1 = pAtom1->getParentResidue();

      // ignore hydrogen
      if (pAtom1->getElement()==ElemSym::H)
        continue;
      
      // ignore carbon in the hydrogen-bond mode
      if (m_bHbon && pAtom1->getElement()==ElemSym::C)
        continue;

      //if (pSel1.isnull() ||
      //pSel1->isSelected(pAtom1)) {

      // skip the non-selected atom by pSel1
      if (!pSel1.isnull() && !pSel1->isSelected(pAtom1))
        continue;
      
      const Vector4D &pos = m_data[i].pos;
      
      std::vector<int> vres;
      int nvres = m_tree.findAround(pos, m_rmax, vres);
      
      for (j=0; j<nvres; ++j) {
        int id2 = vres[j];
        if (m_data[id2].bChk)
          continue; // already checked
        MolAtomPtr pAtom2 = m_data[id2].patm;
        MolResiduePtr pRes2 = pAtom2->getParentResidue();
        
        // ignore intra-residue intractions
        if (pRes1.get()==pRes2.get())
          continue;
        
        // ignore hydrogen
        if (pAtom2->getElement()==ElemSym::H)
          continue;
        
        // ignore carbon in the hydrogen-bond mode
        if (m_bHbon && pAtom2->getElement()==ElemSym::C)
          continue;
        
        // skip the non-selected atom by pSel2
        if (!pSel2.isnull() && !pSel2->isSelected(pAtom2))
          continue;

        const Vector4D &pos2 = m_data[ id2 ].pos;
        const double d = (pos-pos2).length();
        if (d<m_rmin) {
          // vres[j] is too close to pos
          vres[j] = -1;
          continue;
        }
        
        
        int aid1 = pAtom1->getID();
        int aid2 = pAtom2->getID();
        if (aid1>aid2) std::swap(aid1, aid2);
        intrset.insert(IntrSet::value_type(aid1, aid2));
      } // for (j)
      
      m_data[i].bChk = true;
    } // for (i)

    // remove the covalent bonded pairs
    BondIterator biter(pMol);
    for (biter.first(); biter.hasMore(); biter.next()) {
      MolBond *pMB = biter.getBond();
      int aid1 = pMB->getAtom1();
      int aid2 = pMB->getAtom2();
      if (aid1>aid2) std::swap(aid1, aid2);
      IntrSet::iterator ii = intrset.find(IntrSet::value_type(aid1, aid2));
      if (ii!=intrset.end()) {
        MB_DPRINTLN("bonded: %d, %d", aid1, aid2);
        intrset.erase(ii);
      }
    }    

    if (m_bLog) {
      LOG_DPRINTLN("=====");
      LOG_DPRINTLN("Mol[%s] Atom contacts in %.2f -- %.2f Angstroms:", pMol->getName().c_str(), m_rmin, m_rmax);
      BOOST_FOREACH (const IntrSet::value_type &elem, intrset) {
        MolAtomPtr pA1 = pMol->getAtom(elem.first);
        MolAtomPtr pA2 = pMol->getAtom(elem.second);
        double dist = (pA1->getPos() - pA2->getPos()).length();

        if (!pSel1.isnull() && !pSel1->isSelected(pA2))
          std::swap(pA1, pA2);

        LOG_DPRINTLN("%s <==> %s : %.2f", pA1->formatMsg().c_str(), pA2->formatMsg().c_str(), dist);
      }
      LOG_DPRINTLN("=====");
    }

    i=0;
    LString rval;
    BOOST_FOREACH (const IntrSet::value_type &elem, intrset) {
      if (i>m_nMax) {
        LOG_DPRINTLN("%d Labels are limited by max_labels(%d)", intrset.size(), m_nMax);
        break;
      }
      if (!rval.isEmpty())
        rval += ",";
      rval += LString::format("[%d,%d]", elem.first, elem.second);
      ++i;
    }

    if (!rval.isEmpty()) {
      rval = "[" + rval + "]";
    }

    return rval;
  }
    
  LString doit2(MolCoordPtr pMol, SelectionPtr pSel1, MolCoordPtr pMol2, SelectionPtr pSel2)
  {
    m_pMol = pMol;

    qlib::uid_t scid = pMol->getSceneID();
    qsys::AutoStyleCtxt asc(scid);

    int i, j;
    int natoms1=0, natoms2=0; 

    {
      // count atom number (mol1)
      AtomIterator aiter(pMol, pSel1);
      for (aiter.first(); aiter.hasMore(); aiter.next()) {
	MolAtomPtr pAtom = aiter.get();
	MB_ASSERT(!pAtom.isnull());
	++natoms1;
      }
    }

    {
      // count atom number (mol2)
      AtomIterator aiter(pMol2, pSel2);
      for (aiter.first(); aiter.hasMore(); aiter.next()) {
	MolAtomPtr pAtom = aiter.get();
	MB_ASSERT(!pAtom.isnull());
	++natoms2;
      }
    }
    
    int natoms = natoms1 + natoms2;
    MB_DPRINTLN("Calculating contactmap for %d atoms.", natoms);
    // copy to the m_data and BSP tree (m_tree)
    m_data.resize(natoms);
    m_tree.alloc(natoms);

    {
      // For mol1
      AtomIterator aiter(pMol, pSel1);
      for (i=0,aiter.first(); aiter.hasMore()&&i<natoms; aiter.next(),++i) {
	MolAtomPtr pAtom = aiter.get();
	m_data[i].pos = pAtom->getPos();
	m_data[i].patm = pAtom;
	m_data[i].bChk = false;
	
	m_tree.setAt(i, pAtom->getPos(), i);
      }
    }

    {
      // For mol2
      AtomIterator aiter(pMol2, pSel2);
      for (i=0,aiter.first(); aiter.hasMore()&&i<natoms; aiter.next(),++i) {
	MolAtomPtr pAtom = aiter.get();
	m_data[i].pos = pAtom->getPos();
	m_data[i].patm = pAtom;
	m_data[i].bChk = false;
	
	m_tree.setAt(i, pAtom->getPos(), i);
      }
    }

    // build BSP tree
    m_tree.build();

    /////////////////////////////////////////////

    IntrSet intrset;
    
    for (i=0; i<natoms1; ++i) {
      // MB_DPRINTLN("AID %d", i);
      MolAtomPtr pAtom1 = m_data[i].patm;
      MolResiduePtr pRes1 = pAtom1->getParentResidue();
      if (pAtom1->getParentUID()!=pMol->getUID())
	continue; // skip Mol2's atoms

      // ignore hydrogen
      if (pAtom1->getElement()==ElemSym::H)
        continue;
      
      // ignore carbon in the hydrogen-bond mode
      if (m_bHbon && pAtom1->getElement()==ElemSym::C)
        continue;

      const Vector4D &pos = m_data[i].pos;
      
      std::vector<int> vres;
      int nvres = m_tree.findAround(pos, m_rmax, vres);
      
      for (j=0; j<nvres; ++j) {
        int id2 = vres[j];
        if (m_data[id2].bChk)
          continue; // already checked
        MolAtomPtr pAtom2 = m_data[id2].patm;
        MolResiduePtr pRes2 = pAtom2->getParentResidue();
	if (pAtom2->getParentUID()!=pMol2->getUID())
	  continue; // skip Mol1's atoms
        
        // ignore hydrogen
        if (pAtom2->getElement()==ElemSym::H)
          continue;
        
        // ignore carbon in the hydrogen-bond mode
        if (m_bHbon && pAtom2->getElement()==ElemSym::C)
          continue;
        
        const Vector4D &pos2 = m_data[ id2 ].pos;
        const double d = (pos-pos2).length();
        if (d<m_rmin) {
          // vres[j] is too close to pos
          continue;
        }
        
        
        int aid1 = pAtom1->getID();
        int aid2 = pAtom2->getID();
        intrset.insert(IntrSet::value_type(aid1, aid2));
      } // for (j)
      
      m_data[i].bChk = true;
    } // for (i)

    if (m_bLog) {
      LOG_DPRINTLN("=====");
      LOG_DPRINTLN("Mol[%s] Atom contacts in %.2f -- %.2f Angstroms:", pMol->getName().c_str(), m_rmin, m_rmax);
      BOOST_FOREACH (const IntrSet::value_type &elem, intrset) {
        MolAtomPtr pA1 = pMol->getAtom(elem.first);
        MolAtomPtr pA2 = pMol->getAtom(elem.second);
        double dist = (pA1->getPos() - pA2->getPos()).length();

        if (!pSel1.isnull() && !pSel1->isSelected(pA2))
          std::swap(pA1, pA2);

        LOG_DPRINTLN("%s <==> %s : %.2f", pA1->formatMsg().c_str(), pA2->formatMsg().c_str(), dist);
      }
      LOG_DPRINTLN("=====");
    }

    i=0;
    LString rval;
    BOOST_FOREACH (const IntrSet::value_type &elem, intrset) {
      if (i>m_nMax) {
        LOG_DPRINTLN("%d Labels are limited by max_labels(%d)", intrset.size(), m_nMax);
        break;
      }
      if (!rval.isEmpty())
        rval += ",";
      rval += LString::format("[%d,%d]", elem.first, elem.second);
      ++i;
    }

    if (!rval.isEmpty()) {
      rval = "[" + rval + "]";
    }

    return rval;
  }
};

LString MolAnlManager::calcAtomContactJSON(MolCoordPtr pMol, SelectionPtr pSel,
                                           double r_min, double r_max, bool hbond,
                                           int nMax)
{
  ContactMap ps;

  ps.m_rmin = r_min;
  ps.m_rmax = r_max;
  ps.m_bHbon = hbond;
  ps.m_nMax = nMax;
  ps.m_bLog = true;

  SelectionPtr pDummy;
  LString rval = ps.doit(pMol, pSel, pDummy);

  MB_DPRINTLN("done.");
  return rval;
}

LString MolAnlManager::calcAtomContact2JSON(MolCoordPtr pMol, SelectionPtr pSel1, SelectionPtr pSel2,
                                            double r_min, double r_max, bool hbond,
                                            int nMax)
{
  ContactMap ps;

  ps.m_rmin = r_min;
  ps.m_rmax = r_max;
  ps.m_bHbon = hbond;
  ps.m_nMax = nMax;
  ps.m_bLog = true;

  LString rval = ps.doit(pMol, pSel1, pSel2);

  MB_DPRINTLN("done.");
  return rval;
}

LString MolAnlManager::calcAtomContact3JSON(MolCoordPtr pMol, SelectionPtr pSel1, MolCoordPtr pMol2, SelectionPtr pSel2,
                                            double r_min, double r_max, bool hbond, int nMax)
{
  LString rval;

  ContactMap ps;
  ps.m_rmin = r_min;
  ps.m_rmax = r_max;
  ps.m_bHbon = hbond;
  ps.m_nMax = nMax;
  ps.m_bLog = true;

  if (pMol->getUID()==pMol2->getUID()) {
    rval = ps.doit(pMol, pSel1, pSel2);
  }
  else {
    rval = ps.doit2(pMol, pSel1, pMol2, pSel2);
  }

  MB_DPRINTLN("done.");
  return rval;
}
