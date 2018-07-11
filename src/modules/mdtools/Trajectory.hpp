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
    
    // /// Append a new atom.
    // virtual int appendAtom(MolAtomPtr pAtom);

    /// Remove an atom by atom ID (not supported)
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
    /// Handle ON_LOADED scene event (for QSC file loading)
    virtual void sceneChanged(qsys::SceneEvent &ev);

  private:
    void updateTrajBlockDataImpl();

    /////////////////////////////////////////////////////
    // specific operations
    
  public:
    void append(TrajBlockPtr pBlk);

    void update(int n, bool bDyn=false);

  private:

    void findBlk(int nfrm, int &nBlkInd, int &nFrmInd) const;

    /// Load Selection obj
    SelectionPtr m_pLoadSel;

    /// Load Selection index array:
    /// Array of atom indeces to be read from the traj data file.
    /// Other atoms that are not contained in this array will be ignored,
    /// when traj data files are read.
    std::vector<quint32> m_loadSelAry;
    
    int m_nAllAtomSize;

    TrajBlockPtr getTrajBlkImpl(int ifrm, int &rBlkInd, int &rFrmInd) const;
    qfloat32 *getCrdArrayImplImpl(int ifrm);

  public:

    void setup();

    /// Setup with readsel
    void setupSel(int nAll, const SelectionPtr &pLoadSel, const std::deque<int> &aidmap);

    quint32 getAllAtomSize() const {
      return m_nAllAtomSize;
    }

    const quint32 *getSelIndexArray() const {
      return &m_loadSelAry[0];
    }

    /// Create MolCoord obj
    MolCoordPtr createMolCoord(int ifrm);

    /////////////////////////////////////////////////////
    // properties

  private:
    /// Current frame No.
    int m_nCurFrm;

  public:
    /// Get current frame no (with static update)
    int getFrame() const;

    /// Set frame no (with static update)
    void setFrame(int ifrm);

    /// Set frame (with dynamic update)
    void setDynFrame(int iframe);

  private:
    /// Total frame size
    int m_nTotalFrms;
  public:
    int getFrameSize() const;


  private:
    /// Frame averaging size (0: averaging off)
    int m_nAver;

    /// averaged coordinates of the current frame
    std::vector<float> m_averbuf;

    bool m_bAverBufValid;

  public:
    int getFrmAverSize() const { return m_nAver; }
    void setFrmAverSize(int naver) { m_nAver = naver; }

    ////////////////////////////////////////////////////
    // Serialization/Deserialization

  public:
    virtual void writeTo2(qlib::LDom2Node *pNode) const;
    virtual void readFrom2(qlib::LDom2Node *pNode);

    // virtual void readFromStream(qlib::InStream &ins);


    ////////////////////////////////////////////////////
    // Self simple animation implementation

  private: 
    /// Loop flag of the simple self animation mode
    bool m_bLoop;

  public:
    /// Timer event handling (for self anim impl)
    virtual bool onTimer(double t, qlib::time_value curr, bool bLast);

    // Array access method

    /// Get array (ref) of specific frame
    qlib::LByteArrayPtr getFrmArray(int nfrm, bool bref) const;

    /// Get array of cell dim (6-elem vec)
    qlib::LByteArrayPtr getCellArray(int nfrm) const;

  };

}

#endif

