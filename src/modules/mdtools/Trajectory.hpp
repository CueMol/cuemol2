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

#include <deque>
#include <vector>

namespace mdtools {

using molstr::MolCoordPtr;
using molstr::MolAtomPtr;
using molstr::SelectionPtr;

///
/// MD trajectory object.
///
/// An AnimMol whose coordinate frames live in a deque of TrajBlocks (each block
/// a bounded chunk of frames; see DCDTrajReader). getCrdArrayImpl() returns the
/// current frame's coordinates, and update() writes them into the MolAtoms
/// (write-both) so getPos()-based consumers and the coordinate-texture renderers
/// both follow playback.
///
class MDTOOLS_API Trajectory : public molstr::AnimMol
{
    MC_SCRIPTABLE;

private:
    typedef molstr::AnimMol super_t;

    typedef std::deque<TrajBlockPtr> BlockArray;

    BlockArray m_blocks;

    /// current block index
    int m_nBlkInd;

    /// current in-block frame index
    int m_nFrmInd;

    bool m_bInit;

public:
    Trajectory();
    virtual ~Trajectory();

    /// Remove an atom by atom ID (not supported for trajectories)
    virtual bool removeAtom(int atomid);

    /////////////////////
    // AnimMol interface

    /// Topology is fixed once loaded; nothing to invalidate.
    virtual void invalidateCrdArray() override;

    virtual qfloat32 *getCrdArrayImpl() override;

    virtual void createIndexMapImpl(CrdIndexMap &indmap, AidIndexMap &aidmap) override;

    /////////////////////
    // Serialization (QSC). writeTo2/readFrom2 mirror the dev2016 layout:
    // <trajfiles> with one <trajfile> (a TrajBlock data source) per block.

    virtual void writeTo2(qlib::LDom2Node *pNode) const override;
    virtual void readFrom2(qlib::LDom2Node *pNode) override;

    /////////////////////
    // specific operations

    void append(TrajBlockPtr pBlk);

    void update(int n, bool bDyn = false);

    /// Object hook (end of loading). Eagerly primes frame 0 once the topology
    /// and blocks are both loaded, so the initial display shows the
    /// trajectory's first frame rather than the topology's own (zero /
    /// initial-structure) coordinates. No-op until blocks exist.
    void readerDetached() override;

private:
    void findBlk(int nfrm, int &nBlkInd, int &nFrmInd) const;

    /// Write frame-0 coordinates into the atoms, (re)build distance-dependent
    /// topology (bonds) and compute secondary structure, all on the real
    /// frame-0 coordinates. Called once when the trajectory is first primed.
    void primeInitialFrame();

    /// Finalize blocks loaded from a .qsc (assign start indices, total frame
    /// count, prime frame 0 and topology). develop's Object is not a
    /// SceneEventListener, so there is no SCE_SCENE_ONLOADED hook; instead this
    /// runs lazily on first access via ensureInit().
    void updateTrajBlockDataImpl();

    /// Run updateTrajBlockDataImpl() once, after blocks have been loaded.
    void ensureInit();

    /// Run setup() once, once the topology (atoms) is available.
    void ensureSetup();

    bool m_bSetupDone;

    /// Load-selection index array: AIDs (in array order) to read from the
    /// trajectory data file. For load-all this is the identity over all atoms.
    std::vector<quint32> m_loadSelAry;

    /// Load selection (null == load all)
    SelectionPtr m_pLoadSel;

    int m_nAllAtomSize;

    TrajBlockPtr getTrajBlkImpl(int ifrm, int &rBlkInd, int &rFrmInd) const;
    qfloat32 *getCrdArrayImplImpl(int ifrm);

public:
    void setup();

    /// Setup with a read selection (partial-atom load)
    void setupSel(int nAll, const SelectionPtr &pLoadSel, const std::deque<int> &aidmap);

    /// Total atom count in the data file (lazily runs setup() when the
    /// topology is available, since the topology reader -- e.g. GRO -- does not
    /// call setup() itself).
    quint32 getAllAtomSize() const;

    const quint32 *getSelIndexArray() const;

    /////////////////////
    // properties

private:
    int m_nCurFrm;
    int m_nTotalFrms;

public:
    int getFrame() const { return m_nCurFrm; }
    void setFrame(int ifrm);
    void setDynFrame(int ifrm);

    int getFrameSize() const;

    /// Number of coordinate blocks (chunks) the frames are split across.
    int getBlockCount() const { return static_cast<int>(m_blocks.size()); }

private:
    /// Frame averaging window size (0: off)
    int m_nAver;
    std::vector<float> m_averbuf;
    bool m_bAverBufValid;

public:
    int getFrmAverSize() const { return m_nAver; }
    void setFrmAverSize(int naver)
    {
        m_nAver = naver;
        m_bAverBufValid = false;
    }
};

}  // namespace mdtools

#endif
