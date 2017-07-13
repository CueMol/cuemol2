// -*-Mode: C++;-*-
//
// Molecular coordinates with animation support
//

#ifndef MOLSTR_ANIMMOL_HPP_INCLUDED
#define MOLSTR_ANIMMOL_HPP_INCLUDED

#include "molstr.hpp"
#include "MolCoord.hpp"

namespace molstr {

  ///
  /// Molecular coordinates with animation support
  ///
  class MOLSTR_API AnimMol :
    public MolCoord,
    public qlib::TimerListener
  {
    MC_SCRIPTABLE;

  public:
    //typedef std::map<int, quint32> CrdIndexMap;
#ifdef HAVE_UNORDERED_MAP
    typedef std::unordered_map<int, quint32> CrdIndexMap;
#else
    typedef boost::unordered_map<int, quint32> CrdIndexMap;
#endif
    typedef std::vector<quint32> AidIndexMap;

  private:
    /// MolAtom/CrdArray validity flag
    char m_nValidFlag;


    /// Atom ID --> CrdArray index mapping
    CrdIndexMap m_indmap;
    
    /// CrdArray index --> Atom ID mapping
    AidIndexMap m_aidmap;
    
    // std::vector<float> m_crdarray;

  public:
    AnimMol();

    /// Get the crdarray/atompos validity flag
    virtual char getCrdValidFlag() const;

    /// Mark as the crdarray is invalid (and cleanup the index mapping)
    virtual void invalidateCrdArray();

    /// Get coordinate array (xyz x natom format)
    /// (Implementation is different in the derived classes)
    virtual qfloat32 *getCrdArrayImpl() =0;

    /// Create mappings betwee AID and array index suitable for the implementation
    virtual void createIndexMapImpl(CrdIndexMap &indmap, AidIndexMap &aidmap) =0;

    ////////

    /// Get crdarray index from AID
    quint32 getCrdArrayInd(int aid) const;

    /// Get AID from crdarray index
    int getAtomIDByArrayInd(quint32 idx) const {
      return m_aidmap[idx];
    }

    /// Get atom's coordinates from CrdArray
    Vector4D getAtomCrd(int aid) const;

    /// Set atom's coordinates to CrdArray
    void setAtomCrd(int aid, const Vector4D &pos);

    /// Get the coordinates array
    /// If the crdarray is not valid (and atom's pos are valid),
    /// update the crdarray and returns the ptr.
    qfloat32 *getAtomCrdArray();

    /// Update crdarray or atom pos to make both data valid
    void updateCrdArray();

    /// Mark as the crdarray is valid (and atom pos are invalid)
    void crdArrayChanged() {
      m_nValidFlag = CRD_ARRAY_VALID;
    }

    //////////

    /// Unloading from scene (detach from timer)
    virtual void unloading();

    //private:
  protected:
    /// Simple self animation mode
    bool m_bSelfAnim;

  public:
    void setSelfAnim(bool b);
    bool isSelfAnim() const {
      return m_bSelfAnim;
    }
    
    void startSelfAnim();

    void stopSelfAnim();

    virtual qlib::time_value getSelfAnimLen() const;

    virtual bool onTimer(double t, qlib::time_value curr, bool bLast) {
      return true;
    }

  };

}

#endif

