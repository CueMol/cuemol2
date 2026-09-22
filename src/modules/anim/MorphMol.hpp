// -*-Mode: C++;-*-
//
// Molecular morphing animation object class
//

#ifndef ANIM_MORPH_MOL_HPP_INCLUDED
#define ANIM_MORPH_MOL_HPP_INCLUDED

#include "anim.hpp"
#include <qlib/Array.hpp>

#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/AnimMol.hpp>

namespace anim {

  using molstr::MolCoordPtr;

  typedef qlib::Array<float> PosArray;

  class FrameData : public qlib::LDataSrcContainer
  {
  public:
    FrameData() {}
    
    ~FrameData() {}
    
    LString m_name;
    LString m_src;
    LString m_altsrc;
    LString m_srctype;
    
    PosArray m_crds;
    MolCoordPtr m_pMol;
    
  public:
    // Data source container interface implementation
    bool isDataSrcWritable() const override;
    LString getDataChunkReaderName(int nQdfVer) const override;
    void writeDataChunkTo(qlib::LDom2OutStream &oos) const override;
    void readFromStream(qlib::InStream &ins) override;
    void setDataChunkName(const LString &name, qlib::LDom2Node *pNode, int nQdfVer) override;

    void updateSrcPath(const LString &srcpath) override;
  };

  ///
  /// Molecule that interpolates between a set of coordinate frames.
  ///
  /// An AnimMol: the topology is fixed and only the coordinates change, so the
  /// interpolated result goes into the base class's coordinate array and every
  /// consumer reads it from there -- the coordinate-texture renderers by array
  /// index, everything else through MolAtom::getPos().
  ///
  class ANIM_API MorphMol : public molstr::AnimMol
  {
    MC_SCRIPTABLE;

  private:
    typedef molstr::AnimMol super_t;

    /////////////////////////////////////////////////////
    // specific data

    /// number of atoms in each frame
    int m_nAtoms;

    /// coordinate-array index -> AID. The frames are laid out in MolArrayMap
    /// order (by chain, residue and atom name), not by AID, so that a frame
    /// loaded from another file lines up with this molecule by name.
    std::vector<int> m_id2aid;

    typedef std::deque<FrameData *> FrameArray;

    FrameArray m_frames;

  public:

    void createIndexMapImpl(CrdIndexMap &indmap, AidIndexMap &aidmap) override;

    /// One slot per frame entry, which is one per (chain, residue, atom name)
    /// and so can be fewer than the atoms when alternate conformations exist.
    int getCrdArrayAtomCount() const override
    {
      return int(m_id2aid.size());
    }

    
    /////////////////////////////////////////////////////
    // construction/destruction
    
    MorphMol();
    
    ~MorphMol() override;
    
    /// Detached from ObjReader (i.e. end of loading)
    // virtual void readerDetached();

    /////////////////////////////////////////////////////
    // specific operations
    
    /// Insert/Append new coordinates frame
    void insertBefore(MolCoordPtr pmol, int index);
    
    /// Remove coordinates frame
    void removeFrame(int index);

    LString getFrameInfoJSON() const;

    void appendThisFrame();

    /////

    void update(double dframe);
    
    int getFrameSize() const {
      return m_frames.size();
    }
    
  private:
    /// current frame value
    double m_dframe;

  public:
    void setFrame(double dframe) {
      m_dframe = dframe;
      update(dframe);
    }

    double getFrame() const {
      return m_dframe;
    }

  private: 
    /// Scale frame value
    ///  (i.e. scale 0~nframe-1 vs noscale 0~1)
    bool m_bScaleDframe;

  public:
    void setScaleFrame(bool b) {
      m_bScaleDframe = b;
      update(m_dframe);
    }

    bool isScaleFrame() const {
      return m_bScaleDframe;
    }

  public:
    ////////////////////////////////////////////////////
    // Serialization/Deserialization

    void writeTo2(qlib::LDom2Node *pNode) const override;
    void readFrom2(qlib::LDom2Node *pNode) override;

    void readFromStream(qlib::InStream &ins) override;

    void forceEmbed() override;

    void writeDataChunkTo(qlib::LDom2OutStream &oos) const override;

  private:
    /// Create from mol
    //void createFromMol(molstr::MolCoordPtr pmol);
    void setupData();
    
    //MolCoordPtr readNewMol(const LString &src,
    //const LString &altsrc,
    //const LString &srctype);

  };

}

#endif

