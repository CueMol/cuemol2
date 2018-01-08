// -*-Mode: C++;-*-
//
//  Macromolecular chain (list of residues)
//

#ifndef MOL_CHAIN_HPP_
#define MOL_CHAIN_HPP_

#include "molstr.hpp"

#include <qlib/mcutils.hpp>
#include "MolResidue.hpp"
// #include <qlib/LSerial.hpp>

namespace molstr {

  class MolCoord;
  class MolResidue;

  ///
  /// Chains in macromolecule.
  /// the cursor interface should be only used from ChainIterator impl.
  ///
  class MOLSTR_API MolChain : public qlib::LNoCopyScrObject
  {
    MC_SCRIPTABLE;

  private:
    LString m_name;

    typedef std::map<ResidIndex, MolResiduePtr> map_t;
    typedef std::deque<MolResiduePtr> impl_t;

    /// Mapping from resid index --> residue ptr
    map_t m_map;

    /// Ordered list of residues (this list holds owned ptr)
    impl_t m_data;

    qlib::uid_t m_molID;

  public:
    typedef impl_t::const_iterator ResidCursor;

    typedef map_t::const_iterator ResidCursor2;

  public:
    MolChain();
    virtual ~MolChain();

    //////////////////////////////////////////////////////////
    // Basic properties

    const LString &getName() const {
      return m_name;
    }
    void setName(const LString &name) {
      m_name = name;
    }

    MolCoordPtr getParent() const;
    qlib::uid_t getParentUID() const { return m_molID; }
    void setParentUID(qlib::uid_t uid) {
      m_molID = uid;
    }

    /// Access methods

    /// Get residue object by index
    MolResiduePtr getResidue(ResidIndex idx) const;

    /// Get residue object by string index
    MolResiduePtr getResidue(const LString &str_ind) const {
      return getResidue(ResidIndex::fromString(str_ind));
    }

    /// Get residue iterator (deque order)
    ResidCursor begin() const { return m_data.begin(); }
    /// Get residue iterator (deque order)
    ResidCursor end() const { return m_data.end(); }

    /// Get residue iterator (ResidIndex order)
    ResidCursor2 begin2() const { return m_map.begin(); }
    /// Get residue iterator (ResidIndex order)
    ResidCursor2 end2() const { return m_map.end(); }

    /// Put new residue at the specified position.
    /// @param pres The new residue to put.
    /// @return Returns false, if already a residue exists at the specified position.
    bool appendResidue(MolResiduePtr pres);


    /// Remove residue by index.
    /// @param nresid Index of the residue to remove.
    bool removeResidue(ResidIndex idx)
    {
      return removeResidue(getResidue(idx));
    }

    /// Remove residue by smptr.
    bool removeResidue(MolResiduePtr pRes);
    
    /// Get number of contained residues.
    int getSize() const {
      return m_data.size();
    }

    LString getResidsJSON() const;

  };


}

#endif // MOL_CHAIN_H__
