// -*-Mode: C++;-*-
//
// GROMACS XTC binary trajectory file reader
//

#ifndef XTC_TRAJECTORY_READER_HPP_
#define XTC_TRAJECTORY_READER_HPP_

#include "mdtools.hpp"

#include <qlib/mcutils.hpp>
#include <modules/molstr/molstr.hpp>

#include <memory>
#include <vector>

#include "TrajBlock.hpp"

namespace mdtools {

class Trajectory;
class XdrInStream;
class XtcScratchPool;

///
/// GROMACS XTC binary trajectory reader (block-centric).
///
/// Reads one XTC file into a single TrajBlock, mirroring the DCDTrajReader flow
/// (createDefaultObj() returns the block; the caller attaches it, calls read(),
/// then appends the block to the target Trajectory). XTC stores single-
/// precision positions with lossy 3D compression (uncompressed for <=9 atoms);
/// coordinates are scaled nm -> Angstrom.
///
/// XTC records neither a frame count nor a frame table, and its compressed
/// frames are variable-length, so the frame index has to be walked for: each
/// frame's fixed-size header says how many bytes of compressed data follow,
/// which gives the next frame's offset. That walk reads a handful of bytes per
/// frame instead of decompressing it, so indexing a large trajectory is cheap.
///
/// When the source can be reopened and seeked (TrajBlockReader::canLazyLoad),
/// read() only builds that index and loadFrm() decompresses one frame on
/// demand. Otherwise frames are decompressed up front and appended one at a
/// time (TrajBlock::appendFrame), which is also the path a stream with no path
/// behind it (.qsc restore, in-memory data) takes.
///
class MDTOOLS_API XtcTrajReader : public TrajBlockReader
{
    MC_SCRIPTABLE;

    typedef TrajBlockReader super_t;

public:
    XtcTrajReader();
    virtual ~XtcTrajReader();

    // ---- Information query ----

    virtual const char *getName() const override;
    virtual const char *getTypeDescr() const override;
    virtual const char *getFileExt() const override;
    virtual int canHandleContent(qlib::InStream &ins) const override;

    /// The reader's default object is a TrajBlock (appended to a Trajectory).
    virtual qsys::ObjectPtr createDefaultObj() const override;

    // ---- Read ----

    virtual bool read(qlib::InStream &ins) override;

    /// Decompress frame ifrm into pTB, for a block this reader indexed lazily.
    virtual void loadFrm(int ifrm, TrajBlock *pTB) override;

    virtual DetachedDecode makeDetachedDecode(int ifrm, TrajBlock *pTB) override;

    /// How many sets of decode buffers the background decodes have allocated
    /// so far. Bounded by how many of them ran at once, whatever the number of
    /// worker threads that ran them.
    int getDecodeScratchCount() const;

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

    /// Buffers loadFrm() decodes through, kept across frames. Each is sized by
    /// the atom count (the coordinates and the integer scratch are natom*3
    /// values, 1.3 MB apiece at 112k atoms), and allocating and zeroing them
    /// again for every frame shown was a tenth of the cost of showing one.
    std::vector<qfloat32> m_lazyFilecrd;

    /// The trajectory's file-index map as makeDetachedDecode() hands it to its
    /// jobs, shared by all of them; rebuilt when the map's size changes.
    std::shared_ptr<const std::vector<quint32>> m_pDetachedSel;
    std::vector<char> m_lazyCompressed;
    std::vector<qint32> m_lazyIntbuf;

    /// Buffers the jobs from makeDetachedDecode() decode through, lent out one
    /// set per running decode and returned after. Shared with the jobs, which
    /// may outlive this reader. Created on first use.
    std::shared_ptr<XtcScratchPool> m_pScratchPool;

    /// Read a frame header at the current position (magic through the
    /// repeated atom count), filling cell / natom / bLong. Returns false at a
    /// clean end of stream, and throws on a corrupt or truncated one.
    static bool readFrameHeader(XdrInStream &xdr, qfloat32 cell[6], int &natom, bool &bLong);

    /// Read the coordinate block that follows a header, resizing filecrd to
    /// natom*3. Coordinates stay in the file's unit (nm).
    static void readFrameCoords(XdrInStream &xdr, std::vector<qfloat32> &filecrd, int natom,
                         bool bLong);

    /// Walk the file recording where each kept frame starts, then hand the
    /// block back to this reader for on-demand loading.
    void indexFrames(qlib::InStream &ins, const TrajBlockPtr &pTB,
                     const TrajectoryPtr &pTraj);

    /// Decompress every frame into the block up front.
    void readAllFrames(qlib::InStream &ins, const TrajBlockPtr &pTB,
                       const TrajectoryPtr &pTraj);

    /// Check the file's atom count against the topology and size the block's
    /// per-frame arrays accordingly. Returns the block's atom count.
    int checkNatomAgainstTopology(int natom, const TrajectoryPtr &pTraj) const;
};

}  // namespace mdtools

#endif
