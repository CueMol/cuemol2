// -*-Mode: C++;-*-
//
// dictionary class of residue topology
//

#ifndef TOPO_DICT_H__
#define TOPO_DICT_H__

#include "molstr.hpp"

#include <qlib/MapTable.hpp>
#include "ResiToppar.hpp"
#include "ResiPatch.hpp"

namespace molstr {

  using qlib::LString;

  class MOLSTR_API TopoDB
  {
  private:
    typedef qlib::MapPtrTable<ResiToppar> ResidTab;
    typedef qlib::MapPtrTable<ResiPatch> PatchTab;
    typedef std::map<LString, LString> AliasTab;

    /// Residue topology table
    ResidTab m_residTab;

    /// Patch topology table
    PatchTab m_patchTab;

    /// Alias definition table
    AliasTab m_aliasTab;

  public:
    TopoDB() {}
  
    virtual ~TopoDB();
  
    void dump() const;

    //////////////////////////////////////////////
    // Topology dictionary operations

    bool contains(const ResiToppar *value) const {
      return m_residTab.containsValue(value);
    }

    /// Register new topology object to this DB
    void put(ResiToppar *value) {
      // MB_DPRINTLN("TopoDB: put top [%s]", value->getName().c_str());
      m_residTab.forceSet(value->getName(), value);
    }

    /// Get topology obj by name (resolving alias name/UID local name)
    ResiToppar *get(const LString &key, qlib::uid_t uid = qlib::invalid_uid) const;

    /// Unregister topology object (by name)
    ResiToppar *remove(const LString &key) {
      return m_residTab.remove(key);
    }

    /// Remove all topology objects
    void clear() {
      m_residTab.clearAndDelete();
    }

    void putAliasName(const LString &alias, const LString &cname) {
      m_aliasTab.insert(AliasTab::value_type(alias, cname));
    }

    /// Create UID-decorated name of resid topology
    static LString getUIDDecName(const LString &key, qlib::uid_t uid) {
      return LString::format("%s_UID%d", key.c_str(), uid);
    }

    //////////////////////////////////////////////
    // Patch dictionary operations
  
    bool patchContains(const ResiPatch *value) const {
      return m_patchTab.containsValue(value);
    }

    void patchPut(ResiPatch *value) {
      m_patchTab.forceSet(value->getName().c_str(), value);
    }

    ResiPatch *patchGet(const LString &key) const {
      return m_patchTab.get(key);
    }

    ResiPatch *patchPrefixGet(char prefix, const LString &key) const;

    ResiPatch *patchRemove(const LString &key) {
      return m_patchTab.remove(key);
    }

    void patchClear() {
      m_patchTab.clearAndDelete();
    }

    //////////////////////////////////////////////
    // Polymer Linkage database

  private:
    struct Linkage {
      char prev;
      char next;
      LString patch_name;
    };

    /// Linkage dictionary ( resi1:resi2 --> link obj )
    qlib::MapTable<Linkage> m_linkDict;

    ResiPatch *findLinkImpl(const LString &prev, const LString &next);

  public:

    /// Add new linkage between two residues
    bool addLinkByName(const LString &prev_res, char prev_ch,
		       const LString &next_res, char next_ch,
		       const LString &link_name);

    /// Search ResiLink obj for prev(residue name) -> next(residue name)
    //ResiPatch *findLink(const LString &prev, const LString &next);
    ResiPatch *findLink(MolResiduePtr pPrev, MolResiduePtr pNext);

  private:
    struct Link2 {
      LString resid1;
      LString resid2;
      LString group1;
      LString group2;

      LString patch_name;
    };

    /// New linkage dictionary
    std::deque<Link2> m_link2Data;

  public:
    /// Add new linkage between two residues
    bool addLink2(const LString &resid1, const LString &group1,
		  const LString &resid2, const LString &group2,
		  const LString &patch_name);

    /// Search ResiLink obj
    /*ResiPatch *findLinkImpl2(const LString &resid1, const LString &group1,
                             const LString &resid2, const LString &group2,
                             bool bPoly);
     */
    ResiPatch *findLinkImpl2(MolResiduePtr pPrev, MolResiduePtr pNext,
                             bool bPoly);

  };

}

#endif // TOPO_DICT_H__
