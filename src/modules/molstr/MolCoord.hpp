// -*-Mode: C++;-*-
//
// Molecular coordinates class
//
// $Id: MolCoord.hpp,v 1.24 2011/05/02 14:51:29 rishitani Exp $

#ifndef MOL_COORD_HPP_
#define MOL_COORD_HPP_

#include "molstr.hpp"

#include <qlib/IndexedTable.hpp>
#include <qlib/LDOM2Stream.hpp>
#include <qlib/LRegExpr.hpp>
#include <qsys/Object.hpp>

#include "MolAtom.hpp"
#include "MolChain.hpp"
#include "Selection.hpp"
#include "ColoringScheme.hpp"
//#include "TopoBuilder.hpp"

namespace qlib { class Matrix4D; }

namespace molstr {

  class QdfMolWriter;

  ///
  /// Molecular coordinates object
  ///
  class MOLSTR_API MolCoord
       : public qsys::Object,
         public ColSchmHolder
  {
    MC_SCRIPTABLE;

    friend class ::molstr::QdfMolWriter;

  private:
    /////////////////////////////////////////////////////
    // Definition of types for internal use
    
    ////
    // Chain

    /// comparison operator that defines chain ordering
    struct chain_comp : std::binary_function <const LString &,const LString &, bool> {
      bool operator() (const LString &x, const LString &y) const
      {
	return x<y;
      }
    };

    typedef std::map<LString, MolChainPtr, chain_comp> ChainPool;

    /// Chain data
    ChainPool m_chains;

    ////
    // Atoms

    class AtomPool : public std::map<int, MolAtomPtr>
    {
    private:
      int m_nNextIndex;
    public:
      typedef std::map<int, MolAtomPtr> super_t;
      AtomPool() : super_t(), m_nNextIndex(0) {}

      int put(MolAtomPtr p) {
	int key = m_nNextIndex;
	super_t::insert(super_t::value_type(key, p));
	m_nNextIndex++;
	return key;
      }

      void remove(int id) {
	super_t::iterator iter = super_t::find(id);
	if (iter!=super_t::end())
	  super_t::erase(iter);
      }
    };
    
    /// All atoms in this molecule
    AtomPool m_atomPool;

  public:
    // validity flag's constants
    static const char CRD_BOTH_VALID = 0;
    static const char CRD_ARRAY_VALID = 1;
    static const char CRD_ATOM_VALID = 2;

    /// Get the crdarray/atompos validity flag
    /// MolCoord does not support animation, so this always returns CRD_ARRAY_VALID
    virtual char getCrdValidFlag() const;

    /// Mark as the crdarray is invalid (and cleanup the index mapping)
    /// MolCoord does not support animation, so this method do nothing
    virtual void invalidateCrdArray();

  private:
    ////
    // Bonds

    class BondPool : public qlib::IndexedTable<MolBond>
    {
    public:
      BondPool() : qlib::IndexedTable<MolBond>() {}
    };

    /// All bonds in this molecule
    BondPool m_bondPool;
  
    /////////////////////////////////////////////////////

    /// Selection (as a property)
    SelectionPtr m_pSel;
    
    /////////////////////////////////////////////////////
    // non-persistent properties

    /// Regexp for parsing string AID
    mutable qlib::LRegExpr m_reAid;
    
  public:
    // special access method for iterators
    typedef AtomPool::const_iterator AtomIter;
    typedef BondPool::const_iterator BondIter;

    AtomIter beginAtom() const { return m_atomPool.begin(); }
    AtomIter endAtom() const { return m_atomPool.end(); }

    BondIter beginBond() const { return m_bondPool.begin(); }
    BondIter endBond() const { return m_bondPool.end(); }

    /// Get the number of bonds in this molecule
    int getBondSize() const {
      return m_bondPool.size();
    }

  public:
    typedef ChainPool::const_iterator ChainIter;

    ChainIter begin() const { return m_chains.begin(); }
    ChainIter end() const { return m_chains.end(); }
  
  public:

    /////////////////////////////////////////////////////
    // construction/destruction
  
    MolCoord();

    virtual ~MolCoord();

    /////////////////////////////////////////////////////

    /// Append a new atom.
    ///   pAtom should contain enough information,
    ///   i.e. chain, residue, name, element, etc.
    ///   The atom ID will be set after successfull addition.
    virtual int appendAtom(MolAtomPtr pAtom);

    int appendAtomScrHelper(MolAtomPtr pAtom, const LString &ch,
			    ResidIndex resid, const LString &resn);
    int appendAtomScr1(MolAtomPtr pAtom, const LString &ch, int nresid, const LString &resn);

    /// Remove an atom by atom ID
    virtual bool removeAtom(int atomid);
  
    /// Bond two atoms.
    /// In the inter-residue bond case,
    /// the bond will belong to the first atom's residue.
    /// Persist flag indicates whether the bond should be serialized or not.
    MolBond *makeBond(int aid1, int aid2, bool bPersist=false);

    /// remove specified bond by atoms
    bool removeBond(int aid1, int aid2);

    /// clear non-persistent bond information
    void removeNonpersBonds();
    
    /// clear all bond information
    // void removeAllBonds();
    
    /////////////////////////////////////////////////////
    // atom/bond access

    MolResiduePtr getResidue(const LString &chain, ResidIndex resid) const;

    /// get residue by chain name&residue index (script version)
    MolResiduePtr getResidScr(const LString &chain, const LString &sresid) const;

    MolAtomPtr getAtom(int atomid) const;
    MolAtomPtr getAtom(const LString &chain, ResidIndex resid, const LString &atom, char cConfID='\0') const;
    // int getAtomID(const MolAtomPtr pAtom) const;

    /// Get the number of atoms in this molecule
    int getAtomSize() const {
      return m_atomPool.size();
    }

    /// Convert aid to (persistent) string representation
    LString toStrAID(int atomid) const;
    
    /// Convert from (persistent) string representation to aid
    int fromStrAID(const LString &strid) const;

    /////////////////////////////////////////////////////
    // chain operations

    /// Get chain by name
    MolChainPtr getChain(const LString &chname) const;
    
    /// get the number of chains in this molecule
    int getChainSize() const {
      return m_chains.size();
    }

    /// Get chain names (in JSON array format; for UI)
    LString getChainsJSON() const;
    
    /// Appends chain at the tail of chain vector
    /// (returns false, if the chain of the same name already exists)
    bool appendChain(MolChainPtr pChain);

    /// remove chain by name
    bool removeChain(const LString &cname);

    /////////////////////////////////////////////////////
    // selection operations
    //

    /** Get the current selection */
    SelectionPtr getSelection() const;

    void setSelection(SelectionPtr pNewSel);

    /////////////////////////////////////////////////////
    // event-related convenience methods

    // virtual void propChanged(qlib::LPropEvent &ev);

#if 0
    /** notify listeners to the change of selection */
    void fireSelectionChanged() {
      MolSelectEvent ev;
      ev.setTarget(this);
      fireMbObjEvent(ev);
    }

    void fireAtomsAppended() {
      MolAtomsAppendedEvent ev;
      ev.setTarget(this);
      fireMbObjEvent(ev);
    }

    void fireAtomsRemoved() {
      MolAtomsRemovedEvent ev;
      ev.setTarget(this);
      fireMbObjEvent(ev);
    }

#endif

    /// Fire "atmosMoved" event
    /// (without dynamic update/only atom pos changes)
    void fireAtomsMoved();

    /// Fire "atmosMovedDynamic" event
    /// (with dynamic update/only atom pos changes)
    void fireAtomsMovedDynamic();

    /// Fire "topologyChanged" event
    void fireTopologyChanged();

    /////////////////////////////////////////////////////
    // other operations

    void applyTopology(bool bAutoBuild = true);

    ///
    ///  Apply affine transformation to the selected part by pSel
    ///    (impl: MolCoordGeomImpl.cpp)
    void xformByMat(const qlib::Matrix4D &mat, SelectionPtr pSel);
    void xformByMat(const qlib::Matrix4D &mat) {
      xformByMat(mat, SelectionPtr());
    }

    /// Get the center of (selected) atoms (impl: MolCoordGeomImpl.cpp)
    qlib::Vector4D getCenterPos(bool fselect) const;

    qlib::LScrVector4D getCenterPosScr(bool fselect) const {
      return qlib::LScrVector4D(getCenterPos(fselect));
    }

    /// Get the min vector of bounding box of (selected) atoms (impl: MolCoordGeomImpl.cpp)
    qlib::Vector4D getBoundBoxMin(bool fselect) const;
    qlib::LScrVector4D getBoundBoxMinScr(bool fselect) const {
      return qlib::LScrVector4D(getBoundBoxMin(fselect));
    }

    /// Get the max vector of bounding box of (selected) atoms (impl: MolCoordGeomImpl.cpp)
    qlib::Vector4D getBoundBoxMax(bool fselect) const;
    qlib::LScrVector4D getBoundBoxMaxScr(bool fselect) const {
      return qlib::LScrVector4D(getBoundBoxMax(fselect));
    }

    void fitView(bool fselect, qsys::ViewPtr pView) const;
    void fitView2(SelectionPtr pSel, qsys::ViewPtr pView) const;

    ///
    /// Calculate secondary structure (impl: Prot2ndry.cpp)
    ///
    void calcProt2ndry(double hb_high = -500.0, bool bIgnoreBulge=false);

    void calcProt2ndry2(bool bIgnoreBulge=false, double dhangl1=60.0);
    
    void calcBasePair(double cutoff, double tilt);

    //
    // Chain, residue, atom name candidate methods for UI
    //   (impl: MolCoordGeomImpl.cpp)
    //

    LString getChainNameCandsJSON() const;
    LString getResidNameCandsJSON() const;
    LString getAtomNameCandsJSON() const;
    LString getElemNameCandsJSON() const;

    //
    // Edit of mol
    //   (impl: MolCoordGeomImpl.cpp)
    //

    /// Copy the selected part of pmol2 into this mol (inv. op. of deleteSel())
    bool copyAtoms(MolCoordPtr pmol2, SelectionPtr psel2);

    /// Delete the selected part of this mol (inv. op. of copy())
    bool deleteAtoms(SelectionPtr psel);

    bool isEmpty() const { return m_atomPool.empty(); }

#if 0

    /**
       get minimum distance from the selected atoms to the pos
    */
    double getDistMin(const Vector3D &pos);


    /**
       move the selected part of pmol2 into this mol.
    */
    bool merge(MolCoord *pmol2);

#endif

#if 0
    ////////////////////////////////////////////
    //
    // Clipboard/Edit operations
    //

    virtual bool isSelectionSupported() const;
    virtual void selectAll();

    virtual bool isCopyAvailable(bool bcut) const;
    virtual MbObject *copyToCb(bool bcut);

    virtual bool isPasteAvailable(MbObject *psrc) const;
    virtual void pasteFromCb(MbObject *psrc);

    /** create text representation of this object (for clipboard) */
    virtual bool createCbTextData(LString &str);

    virtual bool isDeleteAvailable() const;
    virtual void deleteSelected();
#endif

  public:
    ////////////////////////////////////////////
    // Data chunk serialization

    virtual bool isDataSrcWritable() const;
    virtual LString getDataChunkReaderName(int nQdfVer) const;
    virtual void writeDataChunkTo(qlib::LDom2OutStream &oos) const;

    ////////////////////////////////////////////

    static MolCoordPtr getMolByID(qlib::uid_t uid, qlib::no_throw_tag xx);
    static MolCoordPtr getMolByID(qlib::uid_t uid);

    static LString encodeModelInChain(const LString &chainname, int nModel);
    static bool decodeModelFromChain(const LString &orig, LString &chain, int &nModel);

  };

}

#endif // MOL_COORD_H__

