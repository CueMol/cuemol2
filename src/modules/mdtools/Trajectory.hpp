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
    // specific operations

    void append(TrajBlockPtr pBlk);

    void update(int n, bool bDyn = false);

private:
    void findBlk(int nfrm, int &nBlkInd, int &nFrmInd) const;

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

    quint32 getAllAtomSize() const { return m_nAllAtomSize; }

    const quint32 *getSelIndexArray() const { return &m_loadSelAry[0]; }

    /////////////////////
    // properties

private:
    int m_nCurFrm;
    int m_nTotalFrms;

public:
    int getFrame() const { return m_nCurFrm; }
    void setFrame(int ifrm) { update(ifrm); }
    void setDynFrame(int ifrm) { update(ifrm, true); }

    int getFrameSize() const { return m_nTotalFrms; }

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
