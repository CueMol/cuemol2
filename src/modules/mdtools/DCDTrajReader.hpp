// -*-Mode: C++;-*-
//
// Xplor/CHARMM/NAMD DCD binary trajectory file reader
//

#ifndef DCD_TRAJECTORY_READER_HPP_
#define DCD_TRAJECTORY_READER_HPP_

#include "mdtools.hpp"

#include <qlib/mcutils.hpp>
#include <modules/molstr/molstr.hpp>

#include "TrajBlock.hpp"

#include <vector>

namespace mdtools {

class Trajectory;
class FortBinInStream;

using molstr::SelectionPtr;

///
/// DCD binary trajectory reader.
///
/// Fills an existing Trajectory (resolved from the reader's target or its
/// target-trajectory UID) with coordinate frames. To keep any single
/// allocation well below the PartitionAlloc limit, the frames are split into
/// multiple bounded TrajBlocks (each <= MAX_BLOCK_BYTES worth of per-frame
/// arrays) rather than one block for the whole file.
///
/// Frames are read eagerly (allocated and read up front). Seek-based lazy
/// loading is not implemented yet: develop's InStream has no portable seek
/// interface, so loadFrm() is unreachable (no block is given a loader).
///
class MDTOOLS_API DCDTrajReader : public TrajBlockReader
{
    MC_SCRIPTABLE;

    typedef TrajBlockReader super_t;

public:
    DCDTrajReader();
    virtual ~DCDTrajReader();

    // ---- Information query ----

    virtual const char *getName() const override;
    virtual const char *getTypeDescr() const override;
    virtual const char *getFileExt() const override;
    virtual qsys::ObjectPtr createDefaultObj() const override;

    // ---- Read ----

    virtual bool read(qlib::InStream &ins) override;

    /// Lazy-load one frame (block-local index ifrm) into pTB via seek.
    virtual void loadFrm(int ifrm, TrajBlock *pTB) override;

    // ---- Properties ----

private:
    int m_nSkip;

public:
    int getSkipNo() const { return m_nSkip; }
    void setSkipNo(int n) { m_nSkip = n; }

    /// Upper bound on a single block's per-frame array total (bytes). Bounds
    /// block granularity so no block accumulates an unbounded number of frames;
    /// a single allocation is always one frame regardless. Adjustable (tests
    /// force small blocks to exercise chunk boundaries).
    qint64 getMaxBlockBytes() const { return m_maxBlockBytes; }
    void setMaxBlockBytes(qint64 n) { m_maxBlockBytes = n; }

private:
    qint64 m_maxBlockBytes;

    int m_natom;
    int m_nfile;
    bool m_fcell;

    void readHeader(qlib::InStream &ins, const TrajectoryPtr &pTraj);
    void readBody(qlib::InStream &ins, const TrajectoryPtr &pTraj);

    /// Number of frames per bounded block for the given atom count.
    int framesPerBlock(int nReadAtoms) const;

    /// Read one frame's records from fbis into tmpv, and (if pcoord != NULL)
    /// scatter into pcoord/pcell using the trajectory's selection index array.
    void readFrameRecords(FortBinInStream &fbis, std::vector<float> &tmpv,
                          qfloat32 *pcoord, qfloat32 *pcell,
                          const TrajectoryPtr &pTraj);
};

}  // namespace mdtools

#endif
