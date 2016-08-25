// -*-Mode: C++;-*-
//
// Molecular trajectory animation object class
//

#ifndef MDTOOLS_TRAJECTORY_HPP_INCLUDED
#define MDTOOLS_TRAJECTORY_HPP_INCLUDED

#include "mdtools.hpp"

#include <qlib/Array.hpp>
#include <modules/molstr/AnimMol.hpp>

#include "TrajBlock.hpp"

namespace mdtools {

  using molstr::MolCoordPtr;
  using molstr::MolAtomPtr;
  using molstr::SelectionPtr;

  ///
  /// MD trajectory object class
  ///
  class MDTOOLS_API Trajectory : public molstr::AnimMol
  {
    MC_SCRIPTABLE;

  private:
    typedef molstr::AnimMol super_t;

    /////////////////
    // specific data

    typedef std::deque<TrajBlockPtr> BlockArray;

    BlockArray m_blocks;

    /// current frame no (block index)
    int m_nBlkInd;

    /// current frame no (frame index; i.e., in-block index)
    int m_nFrmInd;

    bool m_bInit;
    

  public:
    
    /////////////////////////////////////////////////////
    // construction/destruction
    
    Trajectory();
    
    virtual ~Trajectory();
    
    /// Append a new atom.
    virtual int appendAtom(MolAtomPtr pAtom);

    /// Remove an atom by atom ID
    virtual bool removeAtom(int atomid);
    
    /////////////////////
    // AnimMol interface

    /// topology structure was changed: this should not be called!!
    virtual void invalidateCrdArray();

    virtual qfloat32 *getCrdArrayImpl();

    virtual void createIndexMapImpl(CrdIndexMap &indmap, AidIndexMap &aidmap) ;


    /////////////////////////////////////////////////////
    // Event handling
    
  public:
    virtual void sceneChanged(qsys::SceneEvent &ev);

  private:
    void updateTrajBlockDataImpl();

    /////////////////////////////////////////////////////
    // specific operations
    
  public:
    void append(TrajBlockPtr pBlk);

    void update(int n);

  private:
    MolCoordPtr m_pAllMol;
    SelectionPtr m_pReadSel;
    std::vector<quint32> m_selIndArray;
    
  public:

    /// create molecule from the appended atoms and selection
    void createMol(SelectionPtr pSel);

    quint32 getAllAtomSize() const {
      return m_pAllMol->getAtomSize();
    }

    const quint32 *getSelIndexArray() const {
      return &m_selIndArray[0];
    }

    /////////////////////////////////////////////////////
    // properties

    ////

  private:
    int m_nCurFrm;
  public:
    int getFrame() const;
    void setFrame(int ifrm);

  private:
    int m_nTotalFrms;
  public:
    int getFrameSize() const;


    ////////////////////////////////////////////////////
    // Serialization/Deserialization

  public:
    virtual void writeTo2(qlib::LDom2Node *pNode) const;
    virtual void readFrom2(qlib::LDom2Node *pNode);

    // virtual void readFromStream(qlib::InStream &ins);

  private:

  };

}

#endif

