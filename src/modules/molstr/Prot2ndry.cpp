// -*-Mode: C++;-*-
//
// Calculate protein secondary structures
// based on the Kabsh&Sander's paper Biopolymers (1983) 22, 2577-
//
// $Id: Prot2ndry.cpp,v 1.2 2009/11/08 16:42:14 rishitani Exp $

#include <common.h>

#include <qlib/LExceptions.hpp>
#include <qlib/LQuat.hpp>
#include <qlib/Vector4D.hpp>
#include <qlib/Matrix3D.hpp>

#include <qsys/UndoManager.hpp>

#include "MolCoord.hpp"
#include "MolChain.hpp"
#include "MolResidue.hpp"
#include "MolAtom.hpp"
#include "AtomIterator.hpp"
#include "ResidIterator.hpp"

#include "Prot2ndry.hpp"

#define PEPDIST_MAX  3.0

using namespace molstr;

void Prot2ndrySet::create(MolCoordPtr pMol)
{
  clear();

  MolResiduePtr pRes1;
  ResidIterator riter(pMol);

  // Write HELIX records
  for (riter.first(); riter.hasMore(); riter.next()) {
    LString sec;
    LString pfx;
    MolResiduePtr pRes = riter.get();
    pRes->getPropStr("secondary2", sec);

    // MB_DPRINTLN("%s%d => %s", pRes->getChainName().c_str(), pRes->getIndex().first, sec.c_str());

    if (sec.length()>=2)
      pfx= sec.substr(1,1);

    if (!(sec.startsWith("H")||sec.startsWith("G")||sec.startsWith("I")))
      continue;

    if (pfx.equals("s"))
      pRes1 = pRes;
    else if (pfx.equals("e")) {
      LString chn1 = pRes1->getChainName();
      ResidIndex resix1 = pRes1->getIndex();

      LString chn2 = pRes->getChainName();
      ResidIndex resix2 = pRes->getIndex();

      if (!chn1.equals(chn2)) {
        LOG_DPRINTLN("ERROR!! Inconsistent Prot2ndry (helix)");
        continue;
      }

      // typeof helix
      if (sec.startsWith("G")) {
        m_helix310.append(chn1, resix1, resix2);
      }
      else if (sec.startsWith("I")) {
        m_helixpi.append(chn1, resix1, resix2);
      }
      else {
        m_helix.append(chn1, resix1, resix2);
      }
    }
  } // for (HELIX)

  // Write SHEET records
  for (riter.first(); riter.hasMore(); riter.next()) {
    LString sec;
    LString pfx;
    MolResiduePtr pRes = riter.get();
    pRes->getPropStr("secondary2", sec);

    // MB_DPRINTLN("%s%d => %s", pRes->getChainName().c_str(), pRes->getIndex().first, sec.c_str());

    if (sec.length()>=2)
      pfx= sec.substr(1,1);

    if (!(sec.startsWith("E")))
      continue;

    if (pfx.equals("s"))
      pRes1 = pRes;
    else if (pfx.equals("e")) {

      LString chn1 = pRes1->getChainName().substr(0,1);
      ResidIndex resix1 = pRes1->getIndex();

      LString chn2 = pRes->getChainName().substr(0,1);
      ResidIndex resix2 = pRes->getIndex();

      if (!chn1.equals(chn2)) {
        LOG_DPRINTLN("ERROR!! Inconsistent Prot2ndry (sheet)");
        continue;
      }

      m_sheet.append(chn1, resix1, resix2);
    }
  } // for

}

void Prot2ndrySet::applyTo(MolCoordPtr pMol)
{
  ResidIterator riter(pMol);
  MolResiduePtr pCurr; // = NULL;
  for (riter.first(); riter.hasMore(); riter.next()) {
    pCurr = riter.get();
    MB_ASSERT(!pCurr.isnull());
    // remove old props
    pCurr->removePropStr("secondary");
    pCurr->removePropStr("secondary2");
  }
  
  apply2ndry("H", "helix", m_helix, pMol);
  apply2ndry("G", "helix", m_helix310, pMol);
  apply2ndry("I", "helix", m_helixpi, pMol);
  apply2ndry("E", "sheet", m_sheet, pMol);
}

void Prot2ndrySet::apply2ndry(const char *ss1, const char *ss2, const ResidSet &data, MolCoordPtr pMol)
{
  ResidSet::const_iterator ich = data.begin();
  ResidSet::const_iterator ichen = data.end();
  for (; ich!=ichen; ++ich) {
    const LString &chain = ich->first;
    const ResidSet::mapped_type &rng = ich->second;

    MolChainPtr pCh = pMol->getChain(chain);
    if (pCh.isnull())
      continue;

    ResidSet::mapped_type::const_iterator irn = rng.begin();
    ResidSet::mapped_type::const_iterator irnen = rng.end();

    for (; irn!=irnen; ++irn) {
      int nst = irn->nstart;
      int nen = irn->nend;
      // MB_DPRINTLN("%s %d:%d", chain.c_str(), nst, nen);
      for (int i=nst; i<=nen; ++i) {
        LString val = ss1;

        if (i==nst)
          val += "s";
        else if (i==nen)
          val += "e";

        MolResiduePtr pRes = pCh->getResidue(i);
        if (pRes.isnull())
          continue;
        pRes->setPropStr("secondary2", val);
        pRes->setPropStr("secondary", ss2);
        MB_DPRINTLN("ApplyToMol %s %d => %s", chain.c_str(), i, val.c_str());
      }
    }
  }
}

//////////////////////////////////////////////////////////////////

namespace {
  void fire2ndryChg(MolCoordPtr pmol)
  {
    qsys::ObjectEvent obe;
    obe.setType(qsys::ObjectEvent::OBE_CHANGED);
    obe.setTarget(pmol->getUID());
    obe.setDescr("secondary");
    pmol->fireObjectEvent(obe);
  }
}

Prot2ndryEditInfo::Prot2ndryEditInfo()
{
  m_bBeforeModified = false;
}

Prot2ndryEditInfo::~Prot2ndryEditInfo()
{
  clear();
}

/// save atom positions before transformation
void Prot2ndryEditInfo::saveBefore(MolCoordPtr pmol)
{
  m_nTgtUID = pmol->getUID();
  clear();
  
  m_before.create(pmol);

  m_bBeforeModified = pmol->getModifiedFlag();
}

/// save atom positions after transformation
void Prot2ndryEditInfo::saveAfter(MolCoordPtr pmol)
{
  MB_ASSERT(m_nTgtUID==pmol->getUID());

  m_after.create(pmol);
}

void Prot2ndryEditInfo::clear()
{
  m_before.clear();
  m_after.clear();
}

/// perform undo
bool Prot2ndryEditInfo::undo()
{
  MolCoord *pmol =
    qlib::ObjectManager::sGetObj<MolCoord>(m_nTgtUID);

  if (pmol==NULL)
    return false;

  // reset to the before pos
  MolCoordPtr pMol(pmol);
  m_before.applyTo(pMol);
  pMol->setModifiedFlag( m_bBeforeModified );
  fire2ndryChg(pMol);
  return true;
}

/// perform redo
bool Prot2ndryEditInfo::redo()
{
  MolCoord *pmol =
    qlib::ObjectManager::sGetObj<MolCoord>(m_nTgtUID);

  if (pmol==NULL)
    return false;

  // reset to the before pos
  MolCoordPtr pMol(pmol);
  m_after.applyTo(pMol);
  fire2ndryChg(pMol);
  return true;
}

bool Prot2ndryEditInfo::isUndoable() const
{
  return true;
}

bool Prot2ndryEditInfo::isRedoable() const
{
  return true;
}

//////////////////////////////////////////////////////////////////

namespace {

  using qlib::Vector4D;
  using qlib::Matrix3D;
  using namespace molstr;

  struct HydrogenBond
  {
    int peer;
    double energy;
  };

  bool operator<(const HydrogenBond &arg1,const HydrogenBond &arg2)
  {
    return (arg1.energy<arg2.energy);
  }

  typedef std::set<HydrogenBond> HbonList;

  struct Backbone
  {
    /// Residue name
    LString resn;

    /// Sequential chain index
    int chind;

    /// Atom positions
    Vector4D ca,c,n,o,h;

    bool bHasH;

    /// Secondary structure type
    LString ss;

    /// index of the secondary structures (1-based, cur impl: helix only)
    int ssid;

    /// Turn type
    char turn[3];

    /// hydrogen bond link
    HbonList acceptors, donors;

    /// ptr to the original residue
    MolResiduePtr pRes;

    //Backbone() : nOrgResid(-1), bHasH(false) {}
  };

  enum {
    nobridge,
    parallel,
    antiparallel
  };

  struct Bridge
  {
    // char sheetname, laddername;
    // bridgeset linkset;

    int btyp;
    int ib, ie, jb, je;

    bool bIsolated;
    //, from, towards;
  };
  
  typedef std::list<Bridge> BridgeList;

  class Prot2ndry
  {
  public:

    typedef std::vector<Backbone *> data_t;

    data_t m_chains;

    BridgeList m_bridges;

    MolCoordPtr m_pMol;

    Prot2ndry() : m_hbhigh (-500.0) {}
    ~Prot2ndry() { fini(); }

    /// HBHIGH - HIGHEST ALLOWED ENERGY OF A HYDROGEN BOND IN CAL/MOL
    double m_hbhigh;

    /// Ignore-bulge flag
    /// Do not link beta strand connected by a bulge
    bool m_bIgnoreBulge;

    //////////////////////////////////

    ///
    /// Build the m_chains member from the pMol object
    ///
    void init(MolCoordPtr pMol)
    {
      m_pMol = pMol;

      int nelem = 0;
      LString tagnmN("N"), tagnmC("C"), tagnmO("O"), tagnmCA("CA");
      MolAtomPtr pCurrN, pCurrC, pCurrO, pCurrCA;
      MolAtomPtr pPrevC, pPrevO;
      Backbone *pBB;
      
      // check the pMol's structure
      ResidIterator riter(pMol);
      MolResiduePtr pPrev; // = NULL;
      MolResiduePtr pCurr; // = NULL;
      int nres=0, ci=0;
      std::list<Backbone *> chain_list;
      
      for (riter.first(); riter.hasMore(); riter.next()) {
	pCurr = riter.get();
        MB_ASSERT(!pCurr.isnull());
	
        // remove old props
        pCurr->removePropStr("secondary");
        pCurr->removePropStr("secondary2");

	pCurrN = pCurr->getAtom(tagnmN);
	pCurrO = pCurr->getAtom(tagnmO);
	pCurrC = pCurr->getAtom(tagnmC);
	pCurrCA = pCurr->getAtom(tagnmCA);
	if (pCurrN.isnull() ||
	    pCurrC.isnull() ||
	    pCurrO.isnull() ||
            pCurrCA.isnull()) {
	  // Incomplete backbone atoms !! (skip this residue)
          //MB_DPRINTLN("Incomplete/nonprotein residue: %s%d",
          //pCurr->getChainName().c_str(), pCurr->getIndex());
	  pPrev = MolResiduePtr(); //NULL;
	  continue;
	}

	pBB = MB_NEW Backbone;

	pBB->resn = pCurr->getName().c_str();
	pBB->ca = pCurrCA->getPos();
	pBB->n = pCurrN->getPos();
	pBB->c = pCurrC->getPos();
	pBB->o = pCurrO->getPos();
	pBB->pRes = pCurr;
	pBB->turn[0] = pBB->turn[1] = pBB->turn[2] = ' ';
        pBB->ssid = 0;

	if (pPrev.isnull()) {
	  // pCurr is start residue of a segment
	  if (chain_list.size()>0) {
	    // insert chain break mark
	    ci++;
	  }
	  pBB->chind = ci;
	  chain_list.push_back(pBB);
	  pPrev = pCurr;
	  continue;
	}

	//
	// Check linkage between the previous residue
	//  to determin segment breakage
	//

	bool bchbrk = false;
	if (!pPrev->getChainName().equals(pCurr->getChainName())) {
	  // chain break
	  bchbrk = true;
	}
	else {
	  pPrevC = pPrev->getAtom(tagnmC);
	  pPrevO = pPrev->getAtom(tagnmO);
      
	  if (pCurrN.isnull() ||
	      pPrevC.isnull() ||
	      pPrevO.isnull()) {
	    // Incomplete backbone atoms !!
	    bchbrk = true;
	  }
	  else {
	    const double pepdist = (pCurrN->getPos() - pPrevC->getPos()).length();
	    if (pepdist > PEPDIST_MAX) {
	      bchbrk = true;
	    }
	    else {
	      // estimate position of the amide hydrogen atom
	      Vector4D vecCO = pPrevO->getPos() - pPrevC->getPos();
	      vecCO /= vecCO.length();
	      pBB->h = pBB->n - vecCO;
	      pBB->bHasH = true;
	    }
	  }
	}

	if (bchbrk) {
	  // insert chain break mark
	  ci++;
	}

	pBB->chind = ci;
	chain_list.push_back(pBB);

	// next
	pPrev = pCurr;

      } // for (riter.first(); riter.hasMore(); riter.next())...


      //
      // copy chain_list to array
      //
      MB_ASSERT(m_chains.size()==0);
      int i, nEntry = chain_list.size();
      m_chains.resize(nEntry);
      std::list<Backbone *>::const_iterator iter = chain_list.begin();
      for (i=0; iter!=chain_list.end() && i<nEntry; ++iter, ++i) {
	m_chains[i] = *iter;
    
	// Backbone *pB = *iter;
	// MB_DPRINTLN("%s%d\t%s: %d",
	// pB->sOrgChain.c_str(), pB->nOrgResid,
	// pB->resn.c_str(), pB->bHasH);
	// delete pB;
      }

      return;
    }

    void fini()
    {
      int i;
      for (i=0; i<m_chains.size(); ++i)
	delete m_chains.at(i);
    }

    //////////////////////////////////////////////////////////////////////

    void calcHbon()
    {
      // CA<->CA distance cutoff
      const double CADIST = 9.0;
      int i, j;

      for (i = 0; i < m_chains.size(); ++i) {
	// skip the chain break mark
	if (!noChainBrk(i, i))
	  continue;

	Backbone &WITH = *m_chains[i];
	for (j = i + 1; j < m_chains.size(); ++j) {
	  // skip the chain break mark
	  if (!noChainBrk(j, j))
	    continue;

	  // skip the distant residue pair
	  const double cadist = (WITH.ca - m_chains[j]->ca).length();
	  if (cadist >= CADIST)
	    continue;

	  checkHbonPair(i, j);
	  if (j != i + 1)
	    checkHbonPair(j, i);

	  /* j==i+1のときは:
	     (i, i+1)のペアは計算するが，（i: donor, i+1: acceptor)
	     (i+1, i)のペアは計算していない．←peptide bond自体で
	     hbondを形成するのは在り得ないから*/
	} // for (j)
      } // for (i)

#if 0
      for (i=0; i<m_chains.size(); ++i) {
	MB_DPRINTLN("%s %s%d ---", m_chains[i]->sOrgChain.c_str(),
		    m_chains[i]->resn.c_str(), m_chains[i]->nOrgResid);
	HbonList &accs = m_chains[i]->acceptors;
	HbonList &dons = m_chains[i]->donors;

	MB_DPRINTLN("acceptors:");
	HbonList::const_iterator iter = accs.begin();
	for (; iter!=accs.end(); ++iter) {
	  MB_DPRINTLN("  %d %f", iter->peer, iter->energy);
	}
	
	MB_DPRINTLN("donors:");
	iter = dons.begin();
	for (; iter!=dons.end(); ++iter) {
	  MB_DPRINTLN("  %d %f", iter->peer, iter->energy);
	}
      }
#endif
    }

  private:

    ///////////////////////////////////////////
    // Utility routines for calcHbon

    bool noChainBrk(int i, int j)
    {
      if (i>j) return false;
      if (i<0 || j>=m_chains.size()) return false;

      return m_chains[i]->chind == m_chains[j]->chind;
    }

    void checkHbonPair(int i, int j)
    {
      HydrogenBond hb;

      /* I IS >N-H, J IS >C=O */
      hb.energy = calcHbonEnergy(i, j);
      if (hb.energy>=m_hbhigh)
	return;
      
      // MB_DPRINTLN("hbon %d %d  = %f kcal/mol", i, j, hb.energy);

      /* CO(J) IS ACCEPTOR OF NH(I) */
      
      // Update the chain-i's acceptor (>C=O) list
      hb.peer = j;
      m_chains[i]->acceptors.insert(hb);
      
      // Update the chain-j's donor (>N-H) list
      hb.peer = i;
      m_chains[j]->donors.insert(hb);
    }

    double calcHbonEnergy(int i, int j)
    {
      // HBLOW - LOWEST ALLOWED  ENERGY OF A HYDROGEN BOND IN CAL/MOL
      const double HBLOW = -9900.0;
      //const double HBHIGH= -500.0;

      // DIST - SMALLEST ALLOWED DISTANCE BETWEEN ANY ATOMS
      const double DIST = 0.5;

      // Q - COUPLING CONSTANT FOR ELECTROSTATIC ENERGY
      const double Q = -27888.0;

      double dho, dhc, dnc, dno;
      double hbe;
      
      hbe = 0;
      Backbone &WITH = *m_chains[i];
      if (WITH.resn.equals("pro"))
	return hbe;

      dho = (WITH.h - m_chains[j]->o).length();
      dhc = (WITH.h - m_chains[j]->c).length();
      dnc = (WITH.n - m_chains[j]->c).length();
      dno = (WITH.n - m_chains[j]->o).length();
      if (dho < DIST || dhc < DIST || dnc < DIST || dno < DIST)
	hbe = HBLOW;
      else
	hbe = Q/dho - Q/dhc + Q/dnc - Q/dno + 0.5;
      if (hbe > HBLOW)
	return hbe;

      MB_DPRINTLN("CalcHbon> !!! Contact between residues %d, %d too close !!!", i, j);
      //Writeresidue(chain[i]);
      //fprintf(stderr," and ");
      //Writeresidue(chain[j]);
      //fprintf(stderr,"  too close !!!\n");
      hbe = HBLOW;
      return hbe;
    }

    ///////////////////////////////////////////////////////////////
    
    /**
       TESTBOND IS TRUE IF I IS DONOR[=NH] TO J, OTHERWISE FALSE
       (I ==> J)
    */
    bool isHbon(int i, int j)
    {

      Backbone &WITH = *m_chains[i];

      HbonList::const_iterator iter = WITH.acceptors.begin();

      for (int i=0; iter!=WITH.acceptors.end() && i<2; ++iter, ++i) {
	const HydrogenBond &hb = *iter;
	// if (hb.peer==j && hb.energy<m_hbhigh)
	if (hb.peer==j)
	  return true;
      }
      return false;
    }
    
    //////////////////////////////////////////////////////////////////////

  public:

    void calcBridge()
    {
      int i;
      for (i=0; i<m_chains.size(); ++i) {
	checkBridge(i);
      }

      linkStrands();

#if 0
      for (i=0; i<m_chains.size(); ++i) {
	MolResiduePtr pres = m_chains[i]->pRes;
	MB_DPRINTLN("==%s %s%d %s", pres->getChainName().c_str(),
		    pres->getName().c_str(), pres->getIndex(),
		    m_chains[i]->ss.c_str());
	
      }
#endif

#if 0
      BridgeList::const_iterator iter = m_bridges.begin();
      for (; iter!=m_bridges.end(); ++iter) {
	const Bridge &with = *iter;
	MolResiduePtr pr_ib = m_chains[with.ib]->pRes;
	MolResiduePtr pr_ie = m_chains[with.ie]->pRes;
	MolResiduePtr pr_jb = m_chains[with.jb]->pRes;
	MolResiduePtr pr_je = m_chains[with.je]->pRes;

	MB_DPRINTLN("%s sheet", (with.btyp==parallel)?"parallel":"antiparallel");

	MB_DPRINTLN("  %s%d (%d) <--> %s%d (%d)",
		    pr_ib->getChainName().c_str(), pr_ib->getIndex().toInt(), with.ib,
		    pr_jb->getChainName().c_str(), pr_jb->getIndex().toInt(), with.jb);

	MB_DPRINTLN("  %s%d (%d) <--> %s%d (%d)",
		    pr_ie->getChainName().c_str(), pr_ie->getIndex().toInt(), with.ie,
		    pr_je->getChainName().c_str(), pr_je->getIndex().toInt(), with.je);
      }
#endif
    }

  private:

    void checkBridge(int i)
    {
      int j1, j2, j;
      int b;

      j1 = 0;
      j2 = 0;
      j = i + 3;
      
      // iの前後でchain breakがある場合は何もしない
      if (!noChainBrk(i - 1, i + 1))
	return;

      for (j=i+3; j<m_chains.size() && j2==0; ++j) {
	if (!noChainBrk(j - 1, j + 1))
	  continue;
	
	if ((isHbon(i + 1, j) && isHbon(j, i - 1)) ||
	    (isHbon(j + 1, i) && isHbon(i, j - 1))) {
	  b = parallel;
	}
	else if ((isHbon(i + 1, j - 1) && isHbon(j + 1, i - 1)) ||
		 (isHbon(j, i) && isHbon(i, j))) {
	  b = antiparallel;
	}
	else
	  b = nobridge;

	if (b != nobridge) {
	  /* beta sheetの場合は．．．*/
	  if (j1 == 0) {
	    j1 = j; /* --> j1: iと初めてbridgeだった残基番号になる */
	    buildBridgeList(i, j, b);
	    //markExtended(i, j);
	  } else if (j != j1) {
	    /* --> j2: iと次にbridgeだった残基番号になる */
	    j2 = j; /* --> j2!=0となるので，これでループを抜けることになる */
	    buildBridgeList(i, j, b);
	    //markExtended(i, j);
	  }
	}

      }
    }

    /**
       Build the bridge list (m_bridges)
     */
    void buildBridgeList(int i, int j, int btyp)
    {
      int k;
      bool found;
      
      found = false;
      k = 1;
      if (btyp == nobridge || i >= j)
	return;

      BridgeList::iterator iter = m_bridges.begin();
      for (; iter!=m_bridges.end(); ++iter) {
	Bridge &with = *iter;
	if (with.btyp!=btyp) continue;
	if (i != with.ie+1 || !noChainBrk(with.ie,i)) continue;
	
	if (btyp == parallel && j == with.je+1 && noChainBrk(with.je,j)) {
	  // append to the paralle sheet
	  with.ie++;
	  with.je++;
	  return;
	}
	else if (j == with.jb-1 && noChainBrk(j, with.jb)) {
	  // append to the antiparalle sheet
	  with.ie++;
	  with.jb--;
	  return;
	}
      }

      // (i,j) is a new bridge entry: register new object
      Bridge nb;
      nb.ib = i;
      nb.ie = i;
      nb.jb = j;
      nb.je = j;
      nb.btyp = btyp;
      nb.bIsolated = true;
      m_bridges.push_back(nb);
      return;
    }

    /*
      link the two bridges connected by a bulge
     */
    void linkBulge(Bridge &Abr, Bridge &Bbr)
    {
      if (Abr.btyp==parallel) {
	MB_DPRINTLN("linking par: (%d:%d) --> (%d:%d)",
		    Abr.ie, Abr.je,
		    Bbr.ib, Bbr.jb);
	Bbr.ib = Abr.ie+1;
	Bbr.jb = Abr.je+1;
      }
      else {
	// antiparallel
	MB_DPRINTLN("linking antipar: (%d:%d) --> (%d:%d)",
		    Abr.ie, Abr.jb,
		    Bbr.ib, Bbr.je);
	Bbr.ib = Abr.ie+1;
	Abr.jb = Bbr.je+1;
      }
    }

    /**
       Check and link bridges connected by a buldge.
       If two the same b-type bridges are separated 1 and 4 residues,
       they are defined to be connected by a buldge region.
    */
    bool checkBulge(Bridge &Abr, Bridge &Bbr)
    {
      int idiff, jdiff;

      if (Abr.btyp!=Bbr.btyp) return false;
      if (Abr.btyp==parallel) {
	idiff = Bbr.ib - Abr.ie;
	jdiff = Bbr.jb - Abr.je;
	if (1<=idiff && 1<=jdiff) {
	  if ((idiff<=2 && jdiff<=5) ||
	      (idiff<=5 && jdiff<=2)) {
	    linkBulge(Abr, Bbr);
	    return true;
	  }
	}

	idiff = Abr.ib - Bbr.ie;
	jdiff = Abr.jb - Bbr.je;

	if (1<=idiff && 1<=jdiff) {
	  if ((idiff<=2 && jdiff<=5) ||
	      (idiff<=5 && jdiff<=2)) {
	    linkBulge(Bbr, Abr);
	    return true;
	  }
	}
      }
      else {
	idiff = Bbr.ib - Abr.ie;
	jdiff = Abr.jb - Bbr.je;

	if (1<=idiff && 1<=jdiff) {
	  if ((idiff<=2 && jdiff<=5) ||
	      (idiff<=5 && jdiff<=2)) {
	    linkBulge(Abr, Bbr);
	    return true;
	  }
	}

	idiff = Abr.ib - Bbr.ie;
	jdiff = Bbr.jb - Abr.je;

	if (1<=idiff && 1<=jdiff) {
	  if ((idiff<=2 && jdiff<=5) ||
	      (idiff<=5 && jdiff<=2)) {
	    linkBulge(Bbr, Abr);
	    return true;
	  }
	}
      }

      return false;
    }

    ResidSet m_sheets;

    /*
      Link and mark strands.
     */
    void linkStrands()
    {
      int i;
      
      BridgeList::iterator iter = m_bridges.begin();
      BridgeList::iterator eiter = m_bridges.end();
      for (; iter!=eiter; ++iter) {
        Bridge &iwith = *iter;
	if (iwith.ib!=iwith.ie)
	  iwith.bIsolated = false;
	  
        if (!m_bIgnoreBulge) {
          BridgeList::iterator jter = iter;
          ++jter;
          for (; jter!=eiter; ++jter) {
            Bridge &jwith = *jter;
            if (!checkBulge(iwith, jwith)) continue;
            MB_DPRINTLN("Buldge detected for %d:%d/%d:%d - %d:%d/%d:%d",
                        iwith.ib, iwith.ie, iwith.jb, iwith.je,
                        jwith.ib, jwith.ie, jwith.jb, jwith.je);
            iwith.bIsolated = false;
            jwith.bIsolated = false;
          }
	}	
      }

      iter = m_bridges.begin();
      MolResiduePtr pRes1, pRes2;
      for (; iter!=eiter; ++iter) {
        Bridge &with = *iter;
	const char *cc = with.bIsolated?"B":"E";

        pRes1 = m_chains[with.ib]->pRes;
        pRes2 = m_chains[with.ie]->pRes;

        MB_DPRINTLN("Set %s : %d (%s) <--> %d (%s)", cc,
                    with.ib, pRes1->getStrIndex().c_str(),
                    with.ie, pRes2->getStrIndex().c_str());

        if (!with.bIsolated) {
          m_sheets.append(pRes1->getChainName(), pRes1->getIndex(), pRes2->getIndex());
          if (!pRes1->getChainName().equals(pRes2->getChainName()))
            m_sheets.append(pRes2->getChainName(), pRes1->getIndex(), pRes2->getIndex());
        }
        
        for (i=with.ib; i<=with.ie; ++i)
          if (!m_chains[i]->ss.equals("E"))
            m_chains[i]->ss = cc;

        pRes1 = m_chains[with.jb]->pRes;
        pRes2 = m_chains[with.je]->pRes;

        MB_DPRINTLN("Set %s : %d (%s) <--> %d (%s)", cc,
                    with.jb, pRes1->getStrIndex().c_str(),
                    with.je, pRes2->getStrIndex().c_str());

        if (!with.bIsolated) {
          m_sheets.append(pRes1->getChainName(), pRes1->getIndex(), pRes2->getIndex());
          if (!pRes1->getChainName().equals(pRes2->getChainName()))
            m_sheets.append(pRes2->getChainName(), pRes1->getIndex(), pRes2->getIndex());
        }
        
        for (i=with.jb; i<=with.je; ++i)
          if (!m_chains[i]->ss.equals("E"))
            m_chains[i]->ss = cc;
      }
    }

    //////////////////////////////////////////////////////////////////////

  public:
    void calcHelices()
    {
      int i, k, j, imax;

      //
      // Mark 3,4,5-turn structures
      //
      for (k = 3; k <= 5; ++k) {
	char cc = '0'+char(k);
	int idx = k-3;
        imax = qlib::max<int>(0, m_chains.size()-k);
	for (i=0; i<imax; ++i) {
	  //
	  // check the combination: i <== i+k
	  //
	  if (!noChainBrk(i, i + k)) continue;
	  if (!isHbon(i + k, i)) continue;

	  // i+k <-- set the '<' (END) mark
          m_chains[i + k]->turn[idx] = '<';

	  //
          // i+1～i+k-1の残基に，set the cc mark (=TURN)
          // cc is the number of the turn (i.e. 3,4,5)
	  //
          for (j=i+1; j<i+k; ++j) {
            Backbone &with = *m_chains[j];
	    // すでに設定されている場合はoverwriteしないように
            if (with.turn[idx]==' ')
              with.turn[idx] = cc;
          }

	  //
	  // i <-- Set the '>' (START) mark
	  // ただし，既に'<'マークが設定されている場合は
	  // 'X'マークで書き換える(X means >< ??)
	  //
          Backbone &with = *m_chains[i];
          if (with.turn[idx] == '<')
            with.turn[idx] = 'X';
          else
            with.turn[idx] = '>';
	}
      }

      /////////////////////////////
      // check alpha helices
      imax = qlib::max<int>(1, m_chains.size()-4);
      int nHelixID = 1;
      for (i = 1; i < imax; ++i) {
        // MB_DPRINTLN("%d Resid %s turn4 = %c",
        // i,
        // m_chains[i]->pRes->getStrIndex().c_str(),
        // m_chains[i]->turn[1]);

	//
	//  i-1's turn4 is 'X' or '>'(start)　AND
	//  i  's turn4 is 'X' or '>'(start)
	//
        if (!isHxStart(i, 4)) {
          ++nHelixID;
          continue;
        }
		    
	// i, i+1, ..., i+3に alpha helix mark 'H'設定
        //if (!m_chains[i]->ss.equals("H")) {
        //}
        for (j = i; j <= i + 3; j++) {
          m_chains[j]->ss = "H";
          m_chains[j]->ssid = nHelixID;
        }
      }

      /////////////////////////////
      //  check 3-10 helices
      //
      imax = qlib::max<int>(1, m_chains.size()-3);
      for (i = 1; i < imax; ++i) {
	//
	//  i-1 の turn3 が 'X'(中間) or '>'(開始)　かつ
	//  i   の turn3 が 'X'(中間) or '>'(開始)
	//

        if (!isHxStart(i, 3)) {
          ++nHelixID;
          continue;
        }

	//
	//  間の残基がひとつでも，
	//  「ss が 'G'(3-10 helix)でも' '(未割り当て)でもない」だったら，
	//   --> 'G'に設定しない
	//   （間は全て'G'か未割り当てでなければならない）	
	//
	bool bempty = true;
	for (j = i; j <= i + 2; j++) {
	  Backbone &with = *m_chains[j];
	  if (!with.ss.equals("G") && !with.ss.isEmpty())
	    bempty = false;
	}
	if (bempty) {
          for (j = i; j <= i + 2; ++j) {
	    m_chains[j]->ss = "G";
            m_chains[j]->ssid = nHelixID;
          }
	}
      }

      /////////////////////////////
      //  check Pi helices
      //  (procedure is the same as the case of 3-10 helices)
      //
      imax = qlib::max<int>(1, m_chains.size()-5);
      for (i = 1; i < imax; ++i) {
        if (!isHxStart(i, 5)) {
          ++nHelixID;
          continue;
        }

	bool bempty = true;
	for (j = i; j <= i + 4; j++) {
	  Backbone &with = *m_chains[j];
	  if (!with.ss.equals("I") && !with.ss.isEmpty())
	    bempty = false;
	}
	if (bempty) {
          for (j = i; j <= i + 4; ++j) {
	    m_chains[j]->ss = "I";
            m_chains[j]->ssid = nHelixID;
          }
	}
      }

      /////////////////////////////
      //  check turns
      for (i = 0; i < m_chains.size(); ++i) {

        //MB_DPRINTLN("%d Resid %s, turn4=%c, helix = %s %d",
        //i,m_chains[i]->pRes->getStrIndex().c_str(),
        //m_chains[i]->turn[1],
        //m_chains[i]->ss.c_str(), m_chains[i]->ssid);

	Backbone &with = *m_chains[i];
	if (!with.ss.isEmpty()) continue;

	char cc = ' ';
	int turn;
	for (turn = 3; turn <= 5; ++turn) {
	  for (j = i-(turn-1); j <= i-1; j++) {
	    if (j<0) continue;
	    // MB_DPRINTLN("turn %d", j);
	    if (m_chains[j]->turn[turn-3]=='X' ||
		m_chains[j]->turn[turn-3]=='>')
	      cc = 'T';
	  }
	}

	with.ss = LString(cc);
      }
    }

  private:
    bool isHxStart(int i, int k) const
    {
      if (m_chains[i-1]->turn[k-3]!='>' &&
	  m_chains[i-1]->turn[k-3]!='X')
	return false;
      
      if (m_chains[i]->turn[k-3]!='>' &&
	  m_chains[i]->turn[k-3]!='X')
	return false;

      return true;
    }

  public:

    ///
    ///  Set the calculated results to the property of residues.
    ///
    void applyToMol()
    {
      applyHelix();
      applySheet();
    }

    void applyHelix()
    {
      int i;
      LString secstr, secstr2;
      const int nchains = m_chains.size();

      for (i=0; i<nchains; ++i) {
	Backbone &with = *(m_chains[i]);
	MolResiduePtr pres = with.pRes;
        // if (with.ss.isEmpty() || with.ss.equals(" ")) continue;

        if (with.ss.equals("H") || with.ss.equals("G") || with.ss.equals("I")) {
          secstr = "helix";
          secstr2 = with.ss;
        }
        else {
          secstr = "";
          secstr2 = "";
        }

        if (secstr.equals("helix")) {
          int previd=-1, nextid=-1;
          if (i>0)
            previd = m_chains[i-1]->ssid;
          if (i<nchains-1)
            nextid = m_chains[i+1]->ssid;

          if (previd!=with.ssid)
            secstr2 = secstr2 + "s";
          if (nextid!=with.ssid)
            secstr2 = secstr2 + "e";
        }

        //MB_DPRINTLN("%d Resid %s, turn4=%c, ss = %s %d",
	//i, pres->getStrIndex().c_str(),
	//with.turn[1], secstr2.c_str(), with.ssid);
        
        if (!secstr.isEmpty())
          pres->setPropStr("secondary", secstr);
        pres->setPropStr("secondary2", secstr2);
      }
    }

    void applySheet()
    {
      int i;
      LString secstr, secstr2;

      const int nchains = m_chains.size();

      for (i=0; i<nchains; ++i) {
        LString ss_prev, ss_curr, ss_next;

        ss_curr = m_chains[i]->ss;
        if (i>0)
          ss_prev = m_chains[i-1]->ss;
        if (i<nchains-1)
          ss_next = m_chains[i+1]->ss;

        if (!ss_curr.equals("E"))
          continue;

        secstr = "sheet";
        secstr2 = "E";
        if (!ss_prev.equals("E") && ss_next.equals("E")) {
          // x E E ==> Es
          secstr2 = "Es";
        }
        else if (ss_prev.equals("E") && !ss_next.equals("E")) {
          // E E x ==> Ee
          secstr2 = "Ee";
        }
        else if (!ss_prev.equals("E") && !ss_next.equals("E")) {
          // x E x ==> coil
          secstr = "";
          secstr2 = "";
        }

	Backbone &with = *(m_chains[i]);
	MolResiduePtr pres = with.pRes;

        //MB_DPRINTLN("%d Resid %s, ss = %s",
	//i, pres->getStrIndex().c_str(),
	//secstr2.c_str());

        if (!secstr.isEmpty())
          pres->setPropStr("secondary", secstr);
        pres->setPropStr("secondary2", secstr2);
      }
    }
    
    void doit()
    {
      calcHbon();
      calcBridge();
      calcHelices();
      //conHelices(10, 60.0, 90.0);
    }

    struct Helix {
      int nst, nen;
      Vector4D dir;
    };
    
    bool calcBinorm(int ind, Vector4D &res) const
    {
      if (ind-1<0)
        return false;
      if (ind+1>=m_chains.size())
        return false;

      const Vector4D &p1 = m_chains[ind-1]->ca;
      const Vector4D &p2 = m_chains[ind]->ca;
      const Vector4D &p3 = m_chains[ind+1]->ca;

      Vector4D v1 = p2 - p1;
      Vector4D v2 = p3 - p2;
      Vector4D bn = v1.cross(v2);

      // normalization
      double len = bn.length();
      if (len<F_EPS4)
        return false;

      res = bn.scale(1.0/len);
      return true;
    }

    Vector4D calcHelixDir_binorm(const Helix &hlx,
				 double &dang_sum, double &dang_sqsum, int &ndang)
    {
      int j;
      const int nst = hlx.nst;
      const int nen = hlx.nen;
      
      Vector4D rc = Vector4D(0,0,0,0);
      Vector4D r1, ev1, ev2;
      int nsum = 0;
      Vector4D bn;
      bool bPrevBn = false;
      Vector4D prev_bn;
      for (j=nst; j<=nen-2; ++j) {
        if (!calcBinorm(j+1, bn))
          continue;
        rc += bn;
        nsum++;

	if (bPrevBn) {
	  double dang = qlib::toDegree( prev_bn.angle(bn) );
	  // dang_max = qlib::max(dang_max, dang);
	  dang -= 50.0;
	  dang_sum += dang;
	  dang_sqsum += dang*dang;
	  ++ndang;
	}
	
	bPrevBn = true;
	prev_bn = bn;
      }

      // ev1 is average of binorm vecs
      ev1 = rc.scale(1.0/double(nsum));

      return ev1;
    }

    //void conHelices(int ngap, double dangl, double dangl2)
    void conHelices(double dangl)
    {
      double dang_tol = 0.0;

      std::deque<Helix> helices;
      int nhlx = 0;
      
      int i, j, nCurHelixSt = -1;
      const int nchains = m_chains.size();

      for (i=0; i<nchains; ++i) {
        /*
	if (i>=1&&i+2<nchains) {
	    Vector4D p1 = m_chains[i-1]->ca;
	    Vector4D p2 = m_chains[i]->ca;
	    Vector4D p3 = m_chains[i+1]->ca;
	    Vector4D p4 = m_chains[i+2]->ca;
	    double tor = qlib::toDegree( Vector4D::torsion(p1, p2, p3, p4) );
	    MolResiduePtr pres = m_chains[i]->pRes;
	    MB_DPRINTLN("PDihe>,%s,%s,%s,%f",
			pres->getChainName().c_str(),
			pres->getIndex().toString().c_str(),
			m_chains[i]->ss.c_str(),
			tor);
	}
         */

        Backbone &with = *(m_chains[i]);
        bool bHelix = false;
        
        if (with.ss.equals("H") || with.ss.equals("G") || with.ss.equals("I")) {
          bHelix = true;
        }

        if (bHelix) {
          int previd=-1, nextid=-1;
          if (i>0 && noChainBrk(i-1, i))
            previd = m_chains[i-1]->ssid;
          if (i<nchains-1 && noChainBrk(i, i+1))
            nextid = m_chains[i+1]->ssid;

          if (previd!=with.ssid) {
            // i is start of helix
            nCurHelixSt = i;
          }
          if (nextid!=with.ssid) {
            // i is end of helix
            MB_ASSERT(nCurHelixSt>=0);
            Helix hlx;
            hlx.nst = nCurHelixSt;
            hlx.nen = i;
            helices.push_back(hlx);
            MB_DPRINTLN("HELIX %d - %d", hlx.nst, hlx.nen);
            nCurHelixSt = -1;
          }
        }
      } // for

      if (nCurHelixSt>=0) {
        Helix hlx;
        hlx.nst = nCurHelixSt;
        hlx.nen = i;
        helices.push_back(hlx);
        MB_DPRINTLN("HELIX %d - %d", hlx.nst, hlx.nen);
      }

      // calc dir for each helix
      nhlx = helices.size();
      double dang_sqsum = 0.0;
      double dang_sum = 0.0;
      int ndang = 0;
      for (i=0; i<nhlx; ++i) {
        Vector4D ev1 = calcHelixDir_binorm(helices[i],
					   dang_sum, dang_sqsum, ndang);
        helices[i].dir = ev1;

        Vector4D rc = m_chains[helices[i].nen]->ca;
        Vector4D p1 = rc+ev1.scale(5.0);
        MB_DPRINTLN("<!--HELIX %d - %d--><line pos1=\"(%f,%f,%f)\" pos2=\"(%f,%f,%f)\"/>",
                    helices[i].nst, helices[i].nen,
                    rc.x(), rc.y(), rc.z(), 
                    p1.x(), p1.y(), p1.z());
      }

      double dang_aver = dang_sum/double(ndang);
      double dang_sd = sqrt( dang_sqsum/double(ndang) - dang_aver*dang_aver );
      dang_aver += 50.0;
      MB_DPRINTLN("P2ndr> Total Dang(ave) %f Dang(sd) %f", dang_aver, dang_sd);

      for (i=0; i<nhlx-1; ++i) {
        const int npen = helices[i].nen;
        const int nnst = helices[i+1].nst;

        //if (nnst-npen>ngap)
	//continue;
        //const double d = qlib::toDegree(helices[i].dir.angle(helices[i+1].dir));
        //if (d>=dangl)
	//continue;

        bool bOK = true;
	Vector4D bn, prev_bn;
        for (j=npen-1; j<=nnst+1; ++j) {
	  if (j>=0 && j<nchains &&
              m_chains[j]->ss.equals("E")) {
            bOK = false;
            break;
	  }

          if (j-1>=0&&j+2<nchains) {
            Vector4D p1 = m_chains[j-1]->ca;
	    Vector4D p2 = m_chains[j]->ca;
	    Vector4D p3 = m_chains[j+1]->ca;
            Vector4D p4 = m_chains[j+2]->ca;
            double tor = qlib::toDegree( Vector4D::torsion(p1, p2, p3, p4) );
            if (tor<0)
              tor += 360.0;
            if (tor>dangl) {
              bOK = false;
              break;
            }
          }
        }

        if (!bOK)
          continue;
	
        MB_DPRINTLN("** HELIX %d - %d", i, i+1);
        const int nnen = helices[i+1].nen;
        for (j=npen+1; j<=nnen; ++j) {
          m_chains[j]->ss = m_chains[npen]->ss;
          m_chains[j]->ssid = m_chains[npen]->ssid;
        }
      }
    }

  }; // class Prot2ndry

} // anonymous namespace

//////////////////////////////////////

void MolCoord::calcProt2ndry(double hb_high /*= -500.0*/, bool bIgnoreBulge /*=false*/)
{
  MolCoordPtr pMol(this);

  Prot2ndry ps;
  ps.init(pMol);
  ps.m_hbhigh = hb_high;
  ps.m_bIgnoreBulge = bIgnoreBulge;
  if (ps.m_chains.size()<=0) {
    MB_DPRINTLN("calcProt2ndry> no amino acid residues in %d/%s",
                getUID(), getName().c_str());
    return;
  }
  ps.doit();

  ps.applyToMol();

#if 0
  int i;
  for (i=0; i<ps.m_chains.size(); ++i) {
    Backbone &with = *(ps.m_chains[i]);
    MolResiduePtr pres = with.pRes;
    MB_DPRINTLN("==%s %s%d %s %c%c%c(%d)", pres->getChainName().c_str(),
		pres->getName().c_str(), pres->getIndex(),
		with.ss.c_str(), with.turn[0], with.turn[1], with.turn[2],
		i);
    
  }
#endif

  LOG_DPRINTLN("Prot2ndry> calculation done with Hb(high)=%f", hb_high);
}

void MolCoord::calcProt2ndry2(bool bIgnoreBulge /*=false*/, double dhangl1/*=60.0*/)
{
  MolCoordPtr pMol(this);

  Prot2ndry ps;
  ps.init(pMol);
  ps.m_hbhigh = -500.0;
  ps.m_bIgnoreBulge = bIgnoreBulge;
  if (ps.m_chains.size()<=0) {
    LOG_DPRINTLN("Prot2ndry> no amino acid residues in %d/%s",
                getUID(), getName().c_str());
    return;
  }
  ps.doit();

  if (dhangl1>0.01) {
    LOG_DPRINTLN("Prot2ndry> Helix gap-filling by criterion: Ca-Ca torsion angle <= %f degree", dhangl1);
    ps.conHelices(dhangl1);
  }

  ps.applyToMol();
}

