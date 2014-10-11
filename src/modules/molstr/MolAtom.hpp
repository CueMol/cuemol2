//
//  Atom object in molecule
//

#ifndef MOL_ATOM_H__
#define MOL_ATOM_H__

#include "molstr.hpp"

#include <qlib/LScrObjects.hpp>
#include <qlib/LScrSmartPtr.hpp>
#include <qlib/mcutils.hpp>

#include <qlib/LScrVector4D.hpp>

#include "ElemSym.hpp"

class MolAtom_wrap;

namespace molstr {

  using qlib::Vector4D;
  using qlib::LScrVector4D;
  using qlib::LString;

  class MolCoord;
  class MolChain;
  class MolResidue;
  class MolBond;

  class MOLSTR_API MolAtom : public qlib::LSimpleCopyScrObject
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    friend class ::MolAtom_wrap;

  private:
    /// Name of this atom (e.g. CA, CB, ...)
    LString m_name;

    /// owner molecule object ID
    qlib::uid_t m_molID;

    /// chain name of this atom
    LString m_chain;

    /// residue name of this atom
    LString m_resname;

    /// Residue index of this atom
    ResidIndex m_nresid;

    /// Atom index of this atom
    int m_nID;

    /// Element
    ElemID m_elem;

    /// Coordinates in angstrom
    Vector4D m_pos;

    /// Occupancy
    double m_occ;

    /// Temperature factor
    double m_bfac;

    /// Anisotropic U (!=NULL if exists)
    double *m_paib;

    /// Alternative conf. ID
    char m_confid;

    /*
    /// Partial charge (in electron unit)
    double m_charge;

    /// Radius, angstrom (vdw; including H/without H)
    double m_radius;
     */

    /// canonical name in the topology definition
    LString m_canonName;

  public:

    ////////////////////////////

    /// default ctor
    MolAtom();

    /// copy ctor
    MolAtom(const MolAtom &src);

    /// dtor
    virtual ~MolAtom();

    ////////////////////////////
    // Basic hardcoded properties

    /// Atom name
    const LString &getName() const {
      return m_name;
    }
    void setName(const LString &nm) {
      m_name = nm;
    }

    /// Element ID
    ElemID getElement() const {
      return m_elem;
    }
    void setElement(ElemID nm) {
      m_elem = nm;
    }

    /// Element name
    LString getElementName() const {
      return ElemSym::symID2Str(m_elem);
    }
    void setElementName(const LString &nm) {
      m_elem = ElemSym::str2SymID(nm);
    }

    /// Get conformation ID
    char getConfID() const {
      return m_confid;
    }
    /// Set conformation ID
    void setConfID(char id) {
      m_confid = id;
    }

    /// Atom posotion
    const Vector4D &getPos() const {
      return m_pos;
    }
    void setPos(const Vector4D &vec)
    {
      m_pos = vec;
    }

    /// Atom posotion-script version
    LScrVector4D getPosScr() const {
      return LScrVector4D(m_pos);
    }
    void setPosScr(const LScrVector4D &vec)
    {
      m_pos = vec;
    }

    double getBfac() const
    {
      return m_bfac;
    }
    void setBfac(double bfactor)
    {
      m_bfac = bfactor;
    }

    double getOcc() const
    {
      return m_occ;
    }
    void setOcc(double occup)
    {
      m_occ = occup;
    }

/*
    double getCharge() const
    {
      return m_charge;
    }
    void setCharge(double val)
    {
      m_charge = val;
    }

    double getRadius() const
    {
      return m_radius;
    }
    void setRadius(double val)
    {
      m_radius = val;
    }
*/

    /// Canonical name
    const LString &getCName() const {
      return m_canonName;
    }
    void setCName(const LString &nm) {
      m_canonName = nm;
    }

    //////////////////////////////////////////////////////////////////////

    int getID() const { return m_nID; }
    void setID(int id) { m_nID = id; }

    void setChainName(const LString &cname) { m_chain = cname; }
    const LString &getChainName() const { return m_chain; }

    void setResName(const LString &name) { m_resname = name; }
    const LString &getResName() const { return m_resname; }

    void setResIndex(const ResidIndex &id) {
      m_nresid = id;
    }
    const ResidIndex &getResIndex() const { return m_nresid; }

    // scripting interface (handle insertion code)
    LString getResIndexScr() const;

    MolCoordPtr getParent() const;
    qlib::uid_t getParentUID() const { return m_molID; }
    void setParentUID(qlib::uid_t uid) { m_molID = uid; }

    MolChainPtr getParentChain() const;
    MolResiduePtr getParentResidue() const;

    //////////////////////////////////////////////////////////////////////
    // Bond management
  public:
    typedef std::vector<MolBond *> BondList;
    typedef BondList::const_iterator BondIter;

  private:  
    /// bonded atom list
    BondList m_bonded;

  public:
    int getBondCount() const { return m_bonded.size(); }
    BondIter bondBegin() const { return m_bonded.begin(); }
    BondIter bondEnd() const { return m_bonded.end(); }
    bool isBonded(int aid) const;
    MolBond *getBond(int aid) const;
    bool addBond(MolBond *pBond);
    bool removeBond(MolBond *pBond);

    //////////////////////////////////////////////////////////////////////
    // unisotropic B factor
  private:
    static inline int getuind(int i, int j) {
      MB_ASSERT(i>=0 && i<3);
      MB_ASSERT(j>=0 && j<3);
      if (i>j) {
	int tmp = i;
	i = j;
	j = tmp;
      }
      return i*3 + j - (i+1)*i/2;
    }

  public:
    bool hasAnIsoU() const { return m_paib!=NULL; }

    double getU(int i, int j) const {
      MB_ASSERT(hasAnIsoU());
      return m_paib[getuind(i,j)];
    }

    void setU(int i, int j, double uij) {
      if (!hasAnIsoU())
	m_paib = MB_NEW double[6];
      m_paib[getuind(i, j)] = uij;
    }

    LString formatMsg() const;

  };


  //////////////////////////////////////////////////////////////////////

  ///
  /// Covalent bond between two atoms
  ///
  class MolBond
  {
  private:
    /// Atom-IDs of bonded atoms
    int id1, id2;

    /// Persistence flag
    bool bPersist;

    /// Bond type
    int nType;

  public:
    enum {
      SINGLE=10,
      DELOC=15,
      DOUBLE=20,
      TRIPLE=30,
    };

    MolBond() :id1(-1), id2(-1), bPersist(false), nType(SINGLE) {}

    int getAtom1() const { return id1; }
    void setAtom1(int id) { id1 = id; }

    int getAtom2() { return id2; }
    void setAtom2(int id) { id2 = id; }

    bool isPersist() { return bPersist; }
    void setPersist(bool val) { bPersist = val; }

    int getType() const { return nType; }
    void setType(int val) { nType = val; }
  };

}

#endif // MOL_ATOM_H__
