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
/// DCD binary trajectory reader (block-centric).
///
/// Reads one DCD file into a single TrajBlock (createDefaultObj() returns the
/// block; the caller attaches it, calls read(), then appends the block to the
/// target Trajectory -- matching the .qsc <trajfile> serialization and the
/// scripted load flow). The target Trajectory is resolved from the reader's
/// target-trajectory UID and supplies the atom count and load-selection map.
///
/// The block stores one flat float array per frame (TrajBlock), so no single
/// allocation exceeds one frame; this keeps large trajectories well under the
/// PartitionAlloc single-allocation limit without a whole-file buffer.
///
/// DCD frames are fixed-length records, so the frame index is pure arithmetic
/// off the end of the header -- no walk of the file is needed. When the source
/// can be reopened and seeked (TrajBlockReader::canLazyLoad) read() records
/// that base offset and returns, and loadFrm() decodes one frame on demand;
/// otherwise every frame is read up front.
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

    /// The reader's default object is a TrajBlock (appended to a Trajectory).
    virtual qsys::ObjectPtr createDefaultObj() const override;

    // ---- Read ----

    virtual bool read(qlib::InStream &ins) override;

    /// Decode frame ifrm into pTB, for a block this reader indexed lazily.
    virtual void loadFrm(int ifrm, TrajBlock *pTB) override;

    // ---- Properties ----

private:
    int m_nSkip;

public:
    int getSkipNo() const { return m_nSkip; }
    /// nevery < 1 would divide by zero in the frame loop
    void setSkipNo(int n) { m_nSkip = (n < 1) ? 1 : n; }

private:
    int m_natom;
    int m_nfile;
    bool m_fcell;

    void readHeader(qlib::InStream &ins, const TrajectoryPtr &pTraj);
    void readBody(qlib::InStream &ins, const TrajBlockPtr &pTB,
                  const TrajectoryPtr &pTraj);

    /// Bytes one frame occupies: the optional cell record plus the X/Y/Z
    /// records, each wrapped in its Fortran length markers. Valid once
    /// readHeader() has set m_natom / m_fcell.
    qint64 getFrameBytes() const;

    /// Record the frame offsets and hand the block back to this reader for
    /// on-demand loading. bodyPos is the stream position just after the
    /// header, i.e. where frame 0 begins.
    void indexFrames(qlib::InStream &ins, const TrajBlockPtr &pTB,
                     const TrajectoryPtr &pTraj, qint64 bodyPos);

    /// Read one frame's records from fbis into tmpv, and (if pcoord != NULL)
    /// scatter into pcoord/pcell using the trajectory's selection index array.
    void readFrameRecords(FortBinInStream &fbis, std::vector<float> &tmpv,
                          qfloat32 *pcoord, qfloat32 *pcell,
                          const TrajectoryPtr &pTraj);
};

}  // namespace mdtools

#endif
