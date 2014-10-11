//
// -*-Mode: C++;-*-
//

#ifndef RESI_PATCH_H__
#define RESI_PATCH_H__

#include "molstr.hpp"

#include <qlib/MapTable.hpp>
#include <qlib/NamedObject.hpp>
#include "ResiToppar.hpp"

namespace molstr {

  using qlib::LString;

  
  ///
  /// Topology and parameter patch for residue
  ///
  class ResiPatch : public qlib::NamedObject
  {
  public:
    enum {
      PATCH_ADD = 1,
      PATCH_DELETE = 2,
      PATCH_MODIFY = 3
    };

    typedef qlib::MapPtrTable<TopAtom> AtomTab;
    typedef std::deque<TopBond *> BondList;

    //typedef std::list<Angle *> AnglList;
    //typedef std::list<Torsion *> TorsList;

  private:
    // dict. of all atoms
    AtomTab m_atomTab;

    // list of all bonds
    BondList m_bondList;

    /*
    // list of all angles
    AnglList m_anglList;

    // list of all dihedrals
    TorsList m_torsList;
    */

    // for linkage patches
    bool m_fIsLink;
    char m_prevCh, m_nextCh;
    TopBond *m_pLinkBond;

    double m_dLinkAtomDist;

  public:
    /// Default ctor
    ResiPatch();

    /// Copy ctor
    ResiPatch(const ResiPatch &arg);

    virtual ~ResiPatch();


    ///////////////////////////////////////////////////////////////////
    // construction methods
    
    /// Add new atom
    bool addAtom(const LString &name, const LString &type, int mode);

    /// Add new bond between a1 and a2, and returns the added bond obj
    TopBond *addBond(const LString &a1name, const LString &a2name, int mode);

    /*
    /// Add new angle between a1, a2, and a3
    bool addAngle(const LString &a1name, const LString &a2name,
		  const LString &a3name, int mode);

    /// Add new torsion (dihe/impr) between a1, a2, a3, and a4
    bool addTors(const LString &a1name, const LString &a2name, 
		 const LString &a3name, const LString &a4name, 
		 int mode, bool bDihe);
    */

    ///////////////////////////////////////////////////////////////////
    // access methods

    /// search atom
    bool searchAtom(const LString &name, int &mode, LString &type);

    TopBond *getBond(const LString &a1name, const LString &a2name) const;

    const AtomTab *getAtomTab() const {
      return &m_atomTab;
    }

    const BondList *getBondList() const {
      return &m_bondList;
    }

    /*
    const AnglList *getAnglList() const {
      return &m_anglList;
    }

    const TorsList *getTorsList() const {
      return &m_torsList;
    }
    */

    ///////////////////////////////////////////////////////////////////
    // link object operations

  private:
    bool m_bPoly;

  public:
    bool isPolyLink() const { return m_bPoly; }
    void setPolyLink(bool b) { m_bPoly = b; }

    /// Check whether this obj is link or patch.
    bool checkLinkObj();

    /**
       Check whether this patch is linkage or not.
       Before calling this method, checkLinkObj() must be called.
       @return Linkage obj or not.
    */
    bool isLinkObj() const { return m_fIsLink; }

    /**
       Return the patch character for previous residues.
       The result of this method is unpredictable,
       if this object is not the linkage object.
       Preceeding to calling this method, checkLinkObj() must be called.
    */
    char getPrevPrefix() const { return m_prevCh; }

    /**
       Return the patch character for next residues.
       The result of this method is unpredictable,
       if this object is not the linkage object.
       Preceeding to calling this method, checkLinkObj() must be called.
    */
    char getNextPrefix() const { return m_nextCh; }

    /** reverse the linkage direction of link-type patch object */
    void reverse()
    {
      char tmp = m_prevCh;
      m_prevCh = m_nextCh;
      m_nextCh = tmp;
    }
  
    TopBond *getLinkBond() const;

    double getLinkDist() const;
    void setLinkDist(double);
  };

}

#endif // RESI_PATCH_H__
