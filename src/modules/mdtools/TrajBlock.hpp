// -*-Mode: C++;-*-
//
// MD trajectory block data class
//

#ifndef MDTOOLS_TRAJ_BLOCK_HPP_INCLUDED
#define MDTOOLS_TRAJ_BLOCK_HPP_INCLUDED

#include "mdtools.hpp"
#include <qlib/Array.hpp>
#include <functional>
#include <map>
#include <memory>
#include <vector>

#include <qsys/Object.hpp>
#include <qsys/ObjReader.hpp>

namespace qlib {
class TaskGroup;
}

namespace mdtools {

class TrajBlock;

/// One frame decoded away from the worker thread: coordinates for the
/// trajectory's loaded atoms (Angstrom, xyz interleaved) and the unit cell.
struct DetachedFrame
{
    std::vector<qfloat32> crd;
    qfloat32 cell[6];
};

/// A self-contained frame decode, safe to run on another thread: it holds
/// plain copies of what it needs (path, offset, atom map) and touches no
/// reader, block or trajectory. Throws as loadFrm() would on a bad frame.
typedef std::function<void(DetachedFrame &)> DetachedDecode;

///
/// Abstract base for trajectory readers that fill TrajBlock coordinate frames.
///
/// Holds the lazy-load flag and the parent-trajectory UID, and declares the
/// per-frame loader hook. The getTargTraj() resolver that maps the UID to a
/// Trajectory is added together with the Trajectory class.
///
/// Reading a trajectory comes in two shapes:
///
/// - Eager: read() decodes every frame into the block up front. Always
///   available, and the only option when the source cannot be reopened and
///   seeked (see canLazyLoad()).
/// - Lazy: read() only walks the file to record where each kept frame starts
///   (getFrameOffsets()), then hands the block back to this reader through
///   TrajBlock::setTrajLoader(). Trajectory::getTrajBlkImpl() calls
///   TrajBlock::load() the first time a frame is displayed, which reaches
///   loadFrm() here, which reopens the source and decodes that one frame.
///
/// Lazy is about WHEN frames are decoded, not how much memory the block
/// reserves: TrajBlock::allocate() still allocates every frame's array. What
/// it saves is the whole-file decode at open (a large trajectory no longer
/// stalls the worker) and the decode of frames nobody ever looks at -- and
/// since qlib::Array does not zero its storage, untouched frames stay
/// uncommitted pages rather than resident memory.
///
class MDTOOLS_API TrajBlockReader : public qsys::ObjReader
{
    typedef qsys::ObjReader super_t;

public:
    TrajBlockReader() : super_t(), m_bLazyLoad(true), m_nTrajUID(qlib::invalid_uid) {}

    /// Load one frame into pTB, for a block this reader indexed lazily.
    /// Throws when the block was read eagerly (no frame index to seek with).
    virtual void loadFrm(int ifrm, TrajBlock *pTB) = 0;

    /// A decode of frame ifrm that TrajBlock can run ahead of time on a worker
    /// thread (see DetachedDecode). Built on the calling thread, which may
    /// read the reader and the trajectory; the returned job may not. Empty
    /// when this reader cannot decode a frame that way; the block then loads
    /// the frame through loadFrm() when it is shown.
    virtual DetachedDecode makeDetachedDecode(int ifrm, TrajBlock *pTB)
    {
        return DetachedDecode();
    }

private:
    bool m_bLazyLoad;

public:
    /// Ask for (or refuse) deferred frame loading. On by default; canLazyLoad()
    /// still has the final say, and a source it rejects is read eagerly.
    void setLazyLoad(bool b) { m_bLazyLoad = b; }
    bool isLazyLoad() const { return m_bLazyLoad; }

private:
    qlib::uid_t m_nTrajUID;

public:
    qlib::uid_t getTargTrajUID() const { return m_nTrajUID; }
    void setTargTrajUID(qlib::uid_t uid) { m_nTrajUID = uid; }

    /// Resolve the parent Trajectory (by the target UID, or the attached
    /// block's trajectory UID). Defined with the Trajectory class.
    TrajectoryPtr getTargTraj() const;

protected:
    /// Scatter file-order interleaved coordinates (natomFile atoms, xyz per
    /// atom, in the file's native unit) into pcoord for the trajectory's loaded
    /// atoms, multiplying by scale (nm -> Angstrom = 10). Uses the trajectory's
    /// selection index map, or the identity map when the topology is not loaded
    /// yet (.qsc loads the coordinate block before the topology). Defined with
    /// the Trajectory class.
    void scatterCoords(const TrajectoryPtr &pTraj, const std::vector<qfloat32> &filecrd,
                       int natomFile, qfloat32 *pcoord, float scale);

    // ---- Lazy frame loading ----

    /// Whether read() may index this source and defer the frames themselves.
    ///
    /// Every condition is about loadFrm() being able to come back for the data
    /// later, long after read() returned and the stream it was given was
    /// destroyed (ObjReader::read() deletes it immediately):
    ///
    /// - the stream must be seekable -- a decoder in between (gzip, base64)
    ///   makes it a one-way pipe, and so do non-file sources;
    /// - there must be a path to reopen, and no decoding on top of it;
    /// - this reader must already be owned by a smart pointer, because the
    ///   block co-owns it through setTrajLoader() and the reference counter
    ///   lives on the object. A reader built on the stack (gtest) or with a
    ///   raw new/delete (Object::readFromStream, the .qsc restore path) has
    ///   none yet, and handing one to the block would hand it a dangling
    ///   pointer and a double free.
    ///
    /// A source that fails any of these is read eagerly, which is always
    /// correct -- only slower.
    bool canLazyLoad(qlib::InStream &ins) const;

    /// Absolute byte offset of the start of each KEPT frame (nevery already
    /// applied, so entry i is the frame that becomes block frame i). Empty
    /// when the block was read eagerly.
    const std::vector<qint64> &getFrameOffsets() const
    {
        return m_frmOffsets;
    }

    /// Record the frame index built by read(); see getFrameOffsets().
    void setFrameOffsets(std::vector<qint64> offsets)
    {
        m_frmOffsets = std::move(offsets);
    }

    /// Verify the source really holds every byte the frame index claims, by
    /// touching the last one. An MD run killed mid-write leaves a truncated
    /// final frame, which an index walk cannot notice on its own -- the header
    /// that announced the frame is intact, the data behind it is not.
    /// Throws qlib::FileFormatException when it is missing, so a truncated
    /// file fails at open the way an eager read fails on it.
    void checkIndexedRange(qlib::InStream &ins, qint64 endPos) const;

    /// Size pTB for nkept frames, leave every frame unloaded, and wire the
    /// block back to this reader so TrajBlock::load() can reach loadFrm().
    /// Defined with the Trajectory class.
    void setupLazyBlock(const TrajBlockPtr &pTB, const TrajectoryPtr &pTraj, int nAtoms,
                        int nkept);

    /// Reopen the source and seek to the start of frame ifrm, for loadFrm().
    /// Throws when there is no frame index or ifrm is out of its range.
    std::unique_ptr<qlib::InStream> openAtFrame(int ifrm) const;

    /// Resolve the parent Trajectory during a lazy load. Unlike getTargTraj()
    /// this does not need the reader to still be attached: by the time a frame
    /// is displayed it is not, so the block carries the UID instead. Defined
    /// with the Trajectory class.
    TrajectoryPtr getTargTrajOf(TrajBlock *pTB) const;

private:
    /// Frame index; see getFrameOffsets().
    std::vector<qint64> m_frmOffsets;
};

MC_DECL_SCRSP(TrajBlockReader);

///////////////////////

///
/// One contiguous block of MD trajectory coordinate frames.
///
/// Stores one flat float array (x,y,z interleaved, natom*3) per frame plus a
/// per-frame unit-cell array and a "loaded" flag. Frames may be filled lazily
/// through an attached TrajBlockReader.
///
class MDTOOLS_API TrajBlock : public qsys::Object
{
    MC_SCRIPTABLE;

private:
    typedef qlib::Array<qfloat32> PosArray;

    typedef std::vector<PosArray *> data_t;

    /// coordinates array (one PosArray of m_nCrds floats per frame)
    data_t m_data;

    /// start frame index of this block
    int m_nIndex;

    /// number of coordinates per frame (natom*3)
    int m_nCrds;

public:
    /// Size of cell dimension array (symm matrix)
    static const int CELL_SIZE = 6;

private:
    /// Cell dimension array (CELL_SIZE * m_nSize)
    typedef std::vector<float> CellArray;

    CellArray m_cells;

public:
    /// default ctor
    TrajBlock();

    /// dtor
    virtual ~TrajBlock();

    /// Allocate coord array (natom x nsize frames)
    void allocate(int natom, int nsize);

    /// Size the block for nsize frames of natom atoms without allocating any
    /// frame's coordinates: a frame gets its storage when it is first written
    /// (getCrdArray) and may give it back again under the cache limit. This is
    /// the lazy-loading layout; allocate() is the eager one.
    void allocateOnDemand(int natom, int nsize);

    /// Prepare for streaming appends: set the per-frame atom count and drop any
    /// existing frames. Used by readers that do not know the frame count up
    /// front (XTC/TRR); frames are added one at a time via appendFrame().
    void initFrames(int natom);

    /// Append one empty frame and return its coordinate array (m_nCrds floats).
    /// The frame's cell array is available via getCellArray(getSize()-1).
    /// initFrames() or allocate() must have set the atom count first.
    qfloat32 *appendFrame();

    void clear();

    /// get coordinate array pointer of the specified frame
    qfloat32 *getCrdArray(int ifrm)
    {
        MB_ASSERT(0 <= ifrm);
        MB_ASSERT(ifrm < getSize());

        PosArray *p = m_data[ifrm];
        if (p == nullptr) p = allocFrame(ifrm);
        return &(*p)[0];
    }

    void setStartIndex(int n) { m_nIndex = n; }
    int getStartIndex() const { return m_nIndex; }

    int getSize() const { return static_cast<int>(m_data.size()); }

    int getCrdSize() const { return m_nCrds; }

    /// get cell dimension array of the specified frame
    qfloat32 *getCellArray(int ifrm = 0)
    {
        MB_ASSERT(0 <= ifrm);
        MB_ASSERT(ifrm < getSize());

        return &m_cells[ifrm * CELL_SIZE];
    }

private:
    /// Parent trajectory object UID (invalid if not attached to a trajectory)
    qlib::uid_t m_nTrajUID;

public:
    void setTrajUID(qlib::uid_t traj_uid) { m_nTrajUID = traj_uid; }

    qlib::uid_t getTrajUID() const { return m_nTrajUID; }

private:
    /// per-frame coordinates-loaded flags
    std::vector<bool> m_flags;

    TrajBlockReaderPtr m_pReader;

public:
    void setTrajLoader(const TrajBlockReaderPtr &preader) { m_pReader = preader; }

    void setLoaded(int ifrm, bool b) { m_flags[ifrm] = b; }

    bool isLoaded(int ifrm) const { return m_flags[ifrm]; }

    bool isAllLoaded() const;

    /// Make frame ifrm's coordinates available, decoding it if needed, and
    /// mark it as the most recently used frame.
    void load(int ifrm);

    /// Keep only the atoms at the given 0-based positions (ascending) of every
    /// frame, and shrink the per-frame coordinate count to nsel atoms. For a
    /// block sized for every atom in its file before the trajectory's load
    /// selection was known (a .qsc restores blocks before the topology).
    /// Frames not yet decoded simply get the new size.
    void selectAtoms(const quint32 *pidx, int nsel);

    /// Number of frames currently holding decoded coordinates through load().
    int getResidentCount() const { return m_nResident; }

    /// Upper bound on decoded coordinates one on-demand block keeps, in bytes.
    /// Past it, loading a frame first releases the least recently used one; a
    /// released frame is decoded again when it is next shown. At least two
    /// frames are always kept. Blocks read eagerly are never trimmed.
    static void setCacheLimitBytes(size_t nbytes);
    static size_t getCacheLimitBytes();

private:
    PosArray *allocFrame(int ifrm, int ncrds = -1);

    /// Frames the cache limit allows this block to keep decoded at once.
    int maxResidentFrames() const;

    /// Release least recently used frames until one more fits, keeping `keep`.
    void evictFor(int keep);

    /// True for a block laid out by allocateOnDemand().
    bool m_bOnDemand;

    /// Frames holding coordinates decoded by load(), for the cache limit.
    int m_nResident;

    /// Per-frame last-use stamps (m_nUseTick at the frame's last load()).
    std::vector<quint64> m_lastUse;
    quint64 m_nUseTick;

    static size_t s_nCacheLimitBytes;

    // ---- Prefetching ----
    //
    // After each load() the block starts decoding the next few frames in the
    // direction playback is moving, on qlib::TaskGroup threads, so that a frame
    // shown for the first time is usually decoded already. A frame is decoded
    // once: load() waits for a prefetch in flight rather than starting its own.
    // Only on-demand blocks whose reader offers makeDetachedDecode() prefetch.
    // Everything below is touched from the loading thread only; a task sees
    // nothing but its own PrefetchSlot.

    struct PrefetchSlot;

    /// Frames being (or already) decoded ahead, by frame index.
    std::map<int, std::shared_ptr<PrefetchSlot>> m_prefetch;

    std::unique_ptr<qlib::TaskGroup> m_pTasks;

    /// The frame load() saw last, for the playback direction.
    int m_nLastLoad;

    static int s_nPrefetchDepth;

    /// Submit decodes for the frames after ifrm in the playback direction.
    void prefetchAfter(int ifrm);

    /// Take frame ifrm from a prefetch, waiting for it if still running.
    /// False when there is none, or it failed; the caller then decodes.
    bool takePrefetched(int ifrm);

    /// Wait for every prefetch and drop them all.
    void cancelPrefetch();

public:
    /// How many frames ahead a lazily read block decodes in the background
    /// (default 4; 0 disables prefetching). Prefetching also needs oneTBB
    /// and more than one thread (qlib::TaskGroup::available()).
    static void setPrefetchDepth(int n);
    static int getPrefetchDepth();

    /// True while frame ifrm has a background decode, running or finished,
    /// that load() has not taken yet.
    bool isPrefetched(int ifrm) const { return m_prefetch.count(ifrm) > 0; }
};

}  // namespace mdtools

#endif
