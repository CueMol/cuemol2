// -*-Mode: C++;-*-
//
//  Atom object in molecule
//

#ifndef MOLSTR_MOLATOM_HPP_INCLUDED
#define MOLSTR_MOLATOM_HPP_INCLUDED

#include "molstr.hpp"

#include <qlib/LScrObjects.hpp>
#include <qlib/LScrSmartPtr.hpp>
#include <qlib/mcutils.hpp>
#include <qlib/LPropContainer.hpp>

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

  class MOLSTR_API MolAtom :
    public qlib::LSimpleCopyScrObject,
    public qlib::LDynPropContainer
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

    /// canonical name in the topology definition
    LString m_canonName;

    /// pointer to parent mol.
    /// NULL if this obj is not attached to mol.
    MolCoord *m_pMol;

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

    /// Get Atom position
    Vector4D getPos() const;

    /// Set Atom position
    void setPos(const Vector4D &vec);

    const Vector4D &getPosCache() const { return m_pos; }
    void setPosCache(const Vector4D &vec) { m_pos = vec; }

    /// Atom position-script version
    LScrVector4D getPosScr() const {
      return LScrVector4D(getPos());
    }
    void setPosScr(const LScrVector4D &vec)
    {
      setPos(vec);
      //m_pos = vec;
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

    /// Get canonical name of atom in the topology definition
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

    /// Get parent mol (returns nullptr if this obj is not attached to mol)
    MolCoordPtr getParent() const;
    /// Get parent mol's UID (returns invalid_uid if this obj is not attached to mol)
    qlib::uid_t getParentUID() const { return m_molID; }

    /// Set parent mol. This method changes the owner of this MolAtom object.
    void setParent(MolCoordPtr pMol);

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

    /// get atom info string
    LString formatMsg() const;

    virtual LString toString() const;

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

    //////////////////////////////////////////////////////////////////////
    // dynamic properties
/*
  private:
    typedef qlib::MapTable<qlib::LVariant> PropTab;
    
    PropTab m_props;
*/
  public:
    
    bool getAtomProp(const LString &propnm, qlib::LVariant &presult) const {
      return getDynProp(propnm, presult);
    }
    bool setAtomProp(const LString &propnm, const qlib::LVariant &pvalue) {
      return setDynProp(propnm, pvalue);
    }
    bool removeAtomProp(const LString &propnm) {
      return removeDynProp(propnm);
    }
    int getAtomPropNames(std::set<LString> &names) const {
      return getDynPropNames(names);
    }
    LString getPropTypeName(const LString &propnm) const {
      return getDynPropTypeName(propnm);
    }

    bool getAtomPropBool(const LString &propnm) const {
      return getDynPropBool(propnm);
    }
    void setAtomPropBool(const LString &propnm, bool pvalue) {
      setDynPropBool(propnm, pvalue);
    }

    int getAtomPropInt(const LString &propnm) const {
      return getDynPropInt(propnm);
    }
    void setAtomPropInt(const LString &propnm, int pvalue) {
      setDynPropInt(propnm, pvalue);
    }
    
    double getAtomPropReal(const LString &propnm) const {
      return getDynPropReal(propnm);
    }
    void setAtomPropReal(const LString &propnm, double pvalue) {
      setDynPropReal(propnm, pvalue);
    }

    LString getAtomPropStr(const LString &propnm) const {
      return getDynPropStr(propnm);
    }
    void setAtomPropStr(const LString &propnm, const LString &pvalue) {
      setDynPropStr(propnm, pvalue);
    }

  };

}

#include "MolBond.hpp"

#endif // MOL_ATOM_H__
