// -*-Mode: C++;-*-
//
// Residue topology class
//

#ifndef RESI_TOPPAR_H__
#define RESI_TOPPAR_H__

#include "molstr.hpp"

#include <qlib/NamedObject.hpp>
#include <qlib/MapTable.hpp>
#include "MolAtom.hpp"

namespace molstr {

  using qlib::LString;

  class ParamDB;

  struct TopBond;

  /// Atom object class for topology definition
  struct TopAtom
  {
    TopAtom() : mode(0), sig(0.0), eps(0.0), sig14(0.0), eps14(0.0), charge(0.0) {}
    
    int mode;
    LString name;
    LString type;
    double sig, eps, sig14, eps14;
    
    LString elem;
    double charge;
    
    // std::list<TopBond *> b;
  };

  /// Bond object class for topology definition
  struct TopBond
  {
    TopBond() : mode(0), a1(NULL), a2(NULL), type(MolBond::SINGLE), kf(0.0), r0(0.0), esd(0.0) {}

    int mode;
    LString a1name;
    LString a2name;

    TopAtom *a1;
    TopAtom *a2;
    int type;
    double kf, r0, esd;
  };


  /// Topology and parameter of residues/components
  class MOLSTR_API ResiToppar : public qlib::NamedObject
  {
  public:

//    struct Angle {
//      LString atomi;
//      LString atomj;
//      LString atomk;
//      double kf, th0;
//    };

//    struct Dihedral {
//      LString atomi;
//      LString atomj;
//      LString atomk;
//      LString atoml;
//      int pe;
//      double kf, del;
//    };

    typedef qlib::MapPtrTable<TopAtom> AtomTab;
    typedef std::deque<TopBond *> BondList;
    typedef std::map<LString, LString> StrPropTab;

    typedef std::vector<LString> RingAtomArray;
    typedef std::deque<RingAtomArray*> RingSet;

    typedef std::map<LString, LString> AtomAliasTab;

//    typedef std::list<Angle *> AnglList;
//    typedef std::list<Dihedral *> DiheList;

  private:

    /// Table of all atoms
    AtomTab m_atomTab;

    /// List of all bonds
    BondList m_bondList;

    StrPropTab m_strProps;

    // /// list of all angles
    // std::list<Angle *> m_anglList;

    // /// list of all dihedrals
    // std::list<Dihedral *> m_diheList;

    /// Name of the (default) pivot atom
    LString m_pivAtom;

    /// Name list of the atom names in rings
    RingSet m_rings;

    std::vector<LString> *m_pMainChAtoms;
    std::vector<LString> *m_pSideChAtoms;

    /// Atom alias names
    AtomAliasTab m_atomAliasTab;

  public:
    ResiToppar();
    virtual ~ResiToppar();

    // add new atom
    bool addAtom(const LString &name, const LString &type,
		 double sig, double eps, double sig14, double eps14);

    /// Add new bond between a1 and a2
    TopBond *addBond(const LString &a1, const LString &a2,
                     double kf, double r0);
    
    void putAliasName(const LString &alias, const LString &cname)
    {
      m_atomAliasTab.insert(AtomAliasTab::value_type(alias, cname));
    }

    // // add new dihedral among ai, aj, ak, and al
    // bool addDihedral(const LString &ai,
    // const LString &aj,
    // const LString &ak,
    // const LString &al,
    // double kf, int pe, double del);

    /////////////////////////////////////////////////////////////
    // property

    LString getType() const {
      LString rval;
      //if (!getPropStr("group", rval)) return rval;
      getPropStr("group", rval);
      return rval;
    }

    bool setPropStr(const char *propname, const LString &value) {
      return m_strProps.insert(StrPropTab::value_type(propname, value)).second;
    }
    
    bool getPropStr(const char *propname, LString &value) const {
      StrPropTab::const_iterator i = m_strProps.find(propname);
      if (m_strProps.end()==i) return false;
      value = i->second;
      return true;
    }

    // Pivot atom
    bool addPivotAtom(const LString &pivname);
    LString getPivotAtom() const;

    // Ring
    void addRing(const std::list<LString> &rmembs);
    int getRingCount() const;
    const RingAtomArray *getRing(int ith);

    // Side/Main chain
    void addSideCh(const std::list<LString> &rmembs);
    void addMainCh(const std::list<LString> &rmembs);
    bool isSideCh(const LString &aname) const;
    bool isMainCh(const LString &aname) const;

    /////////////////////////////////////////////////////////////

    /// Get atom type by atom name (resolving aliases)
    LString getAtomType(const LString &name) const {
      TopAtom *p = m_atomTab.get(name);
      if (p==NULL) return LString();
      return p->type;
    }

    /// Get atom obj by name (resolving aliases)
    TopAtom *getAtom(const LString &name) const;

    /// Get atom table
    const AtomTab *getAtoms() const {
      return &m_atomTab;
    }

    /// Get bond obj between two atom obj a1 and a2
    TopBond *getBond(TopAtom *a1, TopAtom *a2) const;

    /// Get bond obj by atom name
    TopBond *getBond(const LString &id1, const LString &id2) const;

    // bond list operations
    BondList *getBondList() { return &m_bondList; }
  
    int getAtomNum() const { return m_atomTab.size(); }
    int getBondNum() const { return m_bondList.size(); }

    ////

    // AnglList *getAnglList() { return &m_anglList; }
    // DiheList *getDiheList() { return &m_diheList; }
    // ImplList *getImplList() { return &m_diheList; }

    // automatically setup angle params from ParamDB
    // void autoGenAngle(ParamDB *pParDict);

    // automatically setup dihedral params from ParamDB
    // void autoGenDihedral(ParDict *pParDict);


    void dump() const;
  };

}

#endif // RESI_TOPPAR_H__
