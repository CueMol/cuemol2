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
    
    /// topology structure was changed: this should not be called!!
    virtual void invalidateCrdArray();

    virtual qfloat32 *getCrdArrayImpl();

    /////////////////////////////////////////////////////
    // specific operations
    

    void append(TrajBlockPtr pBlk);

    void update(int n);

    /////////////
    // properties

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

    virtual void writeTo2(qlib::LDom2Node *pNode) const;
    virtual void readFrom2(qlib::LDom2Node *pNode);

    virtual void readFromStream(qlib::InStream &ins);

  private:

  };

}

#endif

