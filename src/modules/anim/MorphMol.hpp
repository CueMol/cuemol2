// -*-Mode: C++;-*-
//
// Molecular morphing animation object class
//

#ifndef ANIM_MORPH_MOL_HPP_INCLUDED
#define ANIM_MORPH_MOL_HPP_INCLUDED

#include "anim.hpp"
#include <qlib/Array.hpp>

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
    virtual bool isDataSrcWritable() const;
    virtual LString getDataChunkReaderName(int nQdfVer) const;
    virtual void writeDataChunkTo(qlib::LDom2OutStream &oos) const;
    virtual void readFromStream(qlib::InStream &ins);
    virtual void setDataChunkName(const LString &name, qlib::LDom2Node *pNode, int nQdfVer);

    virtual void updateSrcPath(const LString &srcpath);
  };

  ////////////////////////////////////////////////////////////

  ///
  /// Molecular morphing animation object class
  ///
  class ANIM_API MorphMol : public molstr::AnimMol
  {
    MC_SCRIPTABLE;

  private:
    typedef molstr::AnimMol super_t;

    /////////////////
    // specific data

    double m_dframe;

    /// number of atoms in each frame
    int m_nAtoms;
    
    // std::vector<int> m_id2aid;

    typedef std::deque<FrameData *> FrameArray;

    FrameArray m_frames;

    std::vector<float> m_crdarray;

  public:
    
    /////////////////////////////////////////////////////
    // construction/destruction
    
    MorphMol();
    
    virtual ~MorphMol();
    
    /// Detached from ObjReader (i.e. end of loading)
    // virtual void readerDetached();

    virtual void invalidateCrdArray();
    virtual qfloat32 *getCrdArrayImpl();

    virtual void createIndexMapImpl(CrdIndexMap &indmap, AidIndexMap &aidmap) ;

    /////////////////////////////////////////////////////
    // specific operations
    
    /// Insert/Append new coordinates frame
    void insertBefore(MolCoordPtr pmol, int index);
    
    /// Remove coordinates frame
    void removeFrame(int index);

    LString getFrameInfoJSON() const;

    void appendThisFrame();

    /////

    /// Frame update implementation
    void updateImpl(double dframe, bool bDyn);
    
    int getFrameSize() const {
      return m_frames.size();
    }
    
    /// Set frame (slow update)
    void setFrame(double dframe) {
      m_dframe = dframe;
      updateImpl(dframe, false);
    }

    /// Get current frame
    double getFrame() const {
      return m_dframe;
    }

    /// Set frame (with dynamic update)
    void setDynFrame(double dframe) {
      m_dframe = dframe;
      updateImpl(dframe, true);
    }

    /// Get current frame (same as getFrame())
    double getDynFrame() const {
      return getFrame();
    }

  private: 
    /// Scale frame value
    ///  (i.e. scale 0~nframe-1 vs noscale 0~1)
    bool m_bScaleDframe;
    
  public:
    void setScaleFrame(bool b) {
      m_bScaleDframe = b;
      updateImpl(m_dframe, false);
    }

    bool isScaleFrame() const {
      return m_bScaleDframe;
    }


    ////////////////////////////////////////////////////
    // Serialization/Deserialization

    virtual void writeTo2(qlib::LDom2Node *pNode) const;
    virtual void readFrom2(qlib::LDom2Node *pNode);

    virtual void readFromStream(qlib::InStream &ins);

    virtual void forceEmbed();

    // virtual void writeDataChunkTo(qlib::LDom2OutStream &oos) const;

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

