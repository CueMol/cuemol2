// -*-Mode: C++;-*-
//
// GROMACS TRR binary trajectory file reader
//

#ifndef TRR_TRAJECTORY_READER_HPP_
#define TRR_TRAJECTORY_READER_HPP_

#include "mdtools.hpp"

#include <qlib/mcutils.hpp>
#include <modules/molstr/molstr.hpp>

#include <vector>

#include "TrajBlock.hpp"

namespace mdtools {

class Trajectory;
class XdrInStream;

///
/// GROMACS TRR binary trajectory reader (block-centric).
///
/// Reads one uncompressed TRR file into a single TrajBlock, mirroring the
/// DCDTrajReader flow (createDefaultObj() returns the block; the caller
/// attaches it, calls read(), then appends the block to the target
/// Trajectory). TRR stores single- or double-precision coordinates plus
/// optional velocities and forces; only the coordinates and the simulation box
/// are kept (velocities/forces are skipped). Coordinates are scaled nm ->
/// Angstrom.
///
/// TRR records neither a frame count nor a frame table, and frames are
/// variable-length, so the frame index has to be walked for: each frame's
/// header declares the size of every block that follows it, which gives the
/// next frame's offset. Parsing a header is a few dozen bytes, so indexing is
/// far cheaper than reading the frames.
///
/// When the source can be reopened and seeked (TrajBlockReader::canLazyLoad),
/// read() only builds that index and loadFrm() reads one frame on demand.
/// Otherwise frames are read up front and appended one at a time
/// (TrajBlock::appendFrame).
///
class MDTOOLS_API TrrTrajReader : public TrajBlockReader
{
    MC_SCRIPTABLE;

    typedef TrajBlockReader super_t;

public:
    TrrTrajReader();
    virtual ~TrrTrajReader();

    // ---- Information query ----

    virtual const char *getName() const override;
    virtual const char *getTypeDescr() const override;
    virtual const char *getFileExt() const override;
    virtual int canHandleContent(qlib::InStream &ins) const override;

    /// The reader's default object is a TrajBlock (appended to a Trajectory).
    virtual qsys::ObjectPtr createDefaultObj() const override;

    // ---- Read ----

    virtual bool read(qlib::InStream &ins) override;

    /// Read frame ifrm into pTB, for a block this reader indexed lazily.
    virtual void loadFrm(int ifrm, TrajBlock *pTB) override;

    // ---- Properties ----

private:
    int m_nSkip;

public:
    int getSkipNo() const { return m_nSkip; }
    /// nevery < 1 would divide by zero in the frame loop
    void setSkipNo(int n) { m_nSkip = (n < 1) ? 1 : n; }

private:
    /// File atom count (0 until the first frame header is read).
    int m_natom;

    /// What a TRR frame header declares. The block sizes are in bytes and
    /// also give the frame's length, which is what makes the index walk
    /// possible; `bDouble` is inferred from them because TRR stores no
    /// precision flag of its own.
    struct FrameHeader
    {
        int natom;
        int box_size;
        int vir_size;
        int pres_size;
        int x_size;
        int v_size;
        int f_size;
        bool bDouble;

        /// Bytes of block data following the header.
        qint64 payloadBytes() const
        {
            return static_cast<qint64>(box_size) + vir_size + pres_size + x_size + v_size +
                   f_size;
        }

        /// Whether this frame carries coordinates at all (some do not).
        bool hasCoords() const
        {
            return x_size > 0;
        }
    };

    /// Read a frame header at the current position. Returns false at a clean
    /// end of stream, and throws on a corrupt or truncated one.
    bool readFrameHeader(XdrInStream &xdr, FrameHeader &hdr);

    /// Read the blocks following a header: the box into cell, the coordinates
    /// into filecrd (resized to natom*3, left untouched when the frame has
    /// none), skipping virial / pressure / velocities / forces.
    void readFrameBody(XdrInStream &xdr, const FrameHeader &hdr,
                       std::vector<qfloat32> &filecrd, qfloat32 cell[6]);

    /// Walk the file recording where each kept frame starts, then hand the
    /// block back to this reader for on-demand loading.
    void indexFrames(qlib::InStream &ins, const TrajBlockPtr &pTB,
                     const TrajectoryPtr &pTraj);

    /// Read every frame into the block up front.
    void readAllFrames(qlib::InStream &ins, const TrajBlockPtr &pTB,
                       const TrajectoryPtr &pTraj);

    /// Check the file's atom count against the topology and size the block's
    /// per-frame arrays accordingly. Returns the block's atom count.
    int checkNatomAgainstTopology(int natom, const TrajectoryPtr &pTraj) const;
};

}  // namespace mdtools

#endif
