// -*-Mode: C++;-*-
//
// Molecular Residue class
//

#ifndef MOL_RESIDUE_HPP__
#define MOL_RESIDUE_HPP__

#include "molstr.hpp"

#include <qlib/LString.hpp>
#include <qlib/MapTable.hpp>
#include <qlib/LScrVector4D.hpp>

#include "MolAtom.hpp"

using qlib::LString;

namespace molstr {

  class ResiToppar;
  class QdfMolWriter;

  ///
  /// Class for the residue of the molecular structure.
  ///
  class MOLSTR_API MolResidue : public qlib::LSimpleCopyScrObject
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    friend class ::molstr::QdfMolWriter;

  private:

    typedef qlib::MapTable<int> atomdata_t;

    /// Name of this residue
    LString m_name;

    /// Polymer type
    LString m_type;

    /// Topology object of this residue
    ResiToppar *m_pTopology;

    /// Parent molecule object
    qlib::uid_t m_molID;

    /// Name of the parent chain (containing this residue)
    LString m_chain;

    /// Residue index (in the parent chain) with ins code.
    /// Negative number should be permitted.
    ResidIndex m_index;

    // /// Residue sequence number in the parent chain
    // int m_nSeqNo;

    /// Atom table (atom name-->atom ID)
    atomdata_t m_atomData;

    /// Residue's dynamic properties
    typedef qlib::MapTable<LString> StrPropTab;

    StrPropTab m_strProps;

  public:
    typedef atomdata_t::const_iterator AtomCursor;
    typedef std::set<int>::const_iterator BondCursor;
  
  public:

    //////////////////////////////////////////////////////////
    // construction / destruction

    MolResidue();
    virtual ~MolResidue();

    //////////////////////////////////////////////////////////
    // Atom/bond operations

    /// Append atom
    bool appendAtom(MolAtomPtr pAtom);

    /// Remove atom by name
    /// (Topology will be broken. You must re-apply applyTopology() !!)
    bool removeAtom(const LString &atomname, char confid = '\0');

    /// Get atom ID by atom name.
    int getAtomID(const LString &name, char confid = '\0') const;

    MolAtomPtr getAtom(const LString &atomname, char confid = '\0') const;

    MolAtomPtr getAtomAltConfScr(const LString &atomname, const LString &confid) const {
      return getAtom(atomname, confid.getAt(0));
    }
    
    /// Get the number of atoms in this residue.
    int getAtomSize() const {
      return m_atomData.size();
    }

    /// Get a cursor for atom iteration.
    AtomCursor atomBegin() const { return m_atomData.begin(); }

    /// Get cursor for atom iteration.
    AtomCursor atomEnd() const { return m_atomData.end(); }

    /// Get alt conf ID chars by atom name
    int getAltConfs(const LString &aname, std::set<char> &confs) const;

    /// get atom info in JSON format (for UI)
    LString getAtomsJSON() const;

    //////////////////////////////////////////////////////////
    // Basic properties

    /// set name of this residue
    void setName(const LString &name);
  
    /// get name of this residue
    const LString &getName() const { return m_name; }

    // /// Set sequence number
    // void setSeqNo(int val) { m_nSeqNo = val; }
    // /// Get sequence number
    // int getSeqNo() const { return m_nSeqNo; }

    //

    ResiToppar *getTopologyObj() const { return m_pTopology; }
    void setTopologyObj(ResiToppar *p) { m_pTopology = p; }

    //

    /// set type name of this residue
    void setType(const LString &type) {
      m_type = type;
    }

    /// get type name of this residue
    const LString &getType() const { return m_type; }

    //////////

    void setIndex(const ResidIndex &idx) { m_index = idx; }
    const ResidIndex &getIndex() const { return m_index; }

    void setScrIndex(int idx) { m_index = idx; }
    int getScrIndex() const { return m_index.first; }

    void setStrIndex(const LString &stridx) { m_index = ResidIndex::fromString(stridx); }
    LString getStrIndex() const { return m_index.toString(); }

    void setChainName(const LString &cname) { m_chain = cname; }
    const LString &getChainName() const { return m_chain; }

    //////////////////////////////////////////////////////////
    // property access

    /// Set the property of this residue.
    // @param propname Name of the property to set.
    // @param value Value of the property.
    bool setPropStr(const char *propname, const LString &value);

    /// remove property
    // @param propname Name of the property to remove.
    bool removePropStr(const char *propname);

    /// Get the property of this residue.
    // @param propname Name of the property to get.
    // @param value Value of the property.
    // @return true if property exists and is retrieved.
    bool getPropStr(const char *propname, LString &value) const;
    
    /// Get all property names in this residue.
    // @param names Set of the property names.
    // @return number of property names added to param names.
    int getResPropNames(std::set<LString> &names) const;

    //////////////////////////////////////////////////////////
    // other operations

    /// Get molecule object containing this residue
    MolCoordPtr getParent() const;
    qlib::uid_t getParentUID() const { return m_molID; }
    void setParentUID(qlib::uid_t uid) { m_molID = uid; }

    MolChainPtr getParentChain() const;

  private:
    LString m_sPivAtomName;

  public:
    void setPivotAtomName(const LString &nm) {
      m_sPivAtomName = nm;
    }

    const LString &getPivotAtomName() const {
      return m_sPivAtomName;
    }

    MolAtomPtr getPivotAtom() const {
      return getAtom(m_sPivAtomName);
    }

    qlib::LScrVector4D getPivotPosScr() const;

  private:
    /** next linked residue */
    MolResiduePtr m_pNext;

  public:
    void setLinkNext(MolResiduePtr pNext) {
      m_pNext = pNext;
    }
    bool isLinkedTo(const MolResiduePtr pTest) const {
      if (m_pNext.isnull()) return false;
      if (m_pNext.get()==pTest.get()) return true;
      return false;
    }

    LString toString() const;
  };


}

#endif // MOL_RESIDUE_H__
