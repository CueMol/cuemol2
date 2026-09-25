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
#include <qlib/Matrix4D.hpp>
#include <qlib/TagName.hpp>
#include <qlib/VectorND.hpp>

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
  class AnimMol;

  class MOLSTR_API MolAtom :
    public qlib::LSimpleCopyScrObject,
    public qlib::LDynPropContainer
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    friend class ::MolAtom_wrap;

  private:
    // Members are ordered by size to keep padding down: this class is
    // instantiated once per atom, millions of times for large systems.

    /// Anisotropic U (!=NULL if exists)
    double *m_paib;

    /// Cached transformation matrix
    qlib::Matrix4D *m_pXformMat;

    /// Animated molecule this atom takes its coordinates from, or NULL when
    /// m_pos is the coordinate (the ordinary, editable case).
    AnimMol *m_pCrdSrc;

    /// owner molecule object ID
    qlib::uid_t m_molID;

    /// Residue index of this atom
    ResidIndex m_nresid;

    /// Atom index of this atom
    int m_nID;

    /// Slot of this atom in m_pCrdSrc's coordinate array.
    quint32 m_nCrdIdx;

    /// Coordinates in angstrom. Stored in single precision, as the QDF
    /// format and the coordinate arrays of animated molecules do;
    /// computation stays in double.
    qlib::Vector3F m_pos;

    /// Occupancy
    float m_occ;

    /// Temperature factor
    float m_bfac;

    /// Name of this atom (e.g. CA, CB, ...)
    qlib::TagName m_name;

    /// chain name of this atom
    qlib::TagName m_chain;

    /// residue name of this atom
    qlib::TagName m_resname;

    /// canonical name in the topology definition
    qlib::TagName m_canonName;

    /// Element
    ElemID m_elem;

    /// Alternative conf. ID
    char m_confid;

    // /// formal charge
    // double m_charge;

  public:

    ////////////////////////////

    /// default ctor
    MolAtom();

    /// copy ctor
    MolAtom(const MolAtom &src);

    /// dtor
    ~MolAtom() override;

    ////////////////////////////
    // Basic hardcoded properties

    /// Atom name
    const LString &getName() const {
      return m_name.str();
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

    LString getConfIDScr() const {
      return LString(getConfID());
    }
    void setConfIDScr(const LString &id) {
      setConfID(id.getAt(0));
    }

    /// Get atom position (after applying xformMat)
    Vector4D getPos() const;

    /// Set atom position. Set will fail if xformMat is applied to this
    /// mol/atom, or if this atom belongs to an animated molecule.
    void setPos(const Vector4D &vec);

    /// Get atom position (without applying xformMat).
    ///
    /// Returns by value: an atom of an animated molecule keeps its coordinates
    /// in that molecule's array rather than in a field of its own, so there is
    /// nothing here to hand out a reference to.
    Vector4D getRawPos() const;

    /// Set atom position directly (ignoring xformMat prop). Fails for an atom
    /// of an animated molecule, as setPos() does.
    void setRawPos(const Vector4D &vec);

    /// Take coordinates from an animated molecule's array instead of m_pos.
    void bindCrdArray(AnimMol *pMol, quint32 idx)
    {
      m_pCrdSrc = pMol;
      m_nCrdIdx = idx;
    }

    /// Stop taking coordinates from the array, keeping the last position read
    /// from it so the atom stays where it was.
    void unbindCrdArray();

  private:
    void setPosImpl(const Vector4D &vec)
    {
      m_pos.ai(1) = static_cast<float>(vec.x());
      m_pos.ai(2) = static_cast<float>(vec.y());
      m_pos.ai(3) = static_cast<float>(vec.z());
    }

  public:

    bool isCrdArrayBound() const { return m_pCrdSrc != NULL; }

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
      m_bfac = static_cast<float>(bfactor);
    }

    double getOcc() const
    {
      return m_occ;
    }
    void setOcc(double occup)
    {
      m_occ = static_cast<float>(occup);
    }

    /// Get canonical name of atom in the topology definition
    const LString &getCName() const {
      return m_canonName.str();
    }
    void setCName(const LString &nm) {
      m_canonName = nm;
    }

    //////////////////////////////////////////////////////////////////////

    int getID() const { return m_nID; }
    void setID(int id) { m_nID = id; }

    void setChainName(const LString &cname) { m_chain = cname; }
    const LString &getChainName() const { return m_chain.str(); }

    void setResName(const LString &name) { m_resname = name; }
    const LString &getResName() const { return m_resname.str(); }

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

    /// get atom info string
    LString formatMsg() const;

    LString toString() const override;

    ////////////////////////
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

    ////////////////////////
    // Cached xform matrix
  public:
    void setXformMatrix(const qlib::Matrix4D &m);
    
    void resetXformMatrix();

    //////////////////////////////////////////////////////////////////////
    // dynamic properties
/*
  private:
    typedef qlib::MapTable<qlib::LVariant> PropTab;
    
    PropTab m_props;
*/
  public:
    
    bool hasAtomProp(const LString &propnm) const {
        return hasDynProp(propnm);
    }
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
    LString getPropTypeName(const LString &propnm) const override {
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

    ////////////////////////
    // Scripting utility methods
  public:
    double calcDihe(const MolAtomPtr &pA2,const MolAtomPtr &pA3,const MolAtomPtr &pA4);

  };

}

#include "MolBond.hpp"

#endif // MOL_ATOM_H__
