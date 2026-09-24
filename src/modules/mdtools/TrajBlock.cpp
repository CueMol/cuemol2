// -*-Mode: C++;-*-
//
// MD trajectory block data class
//

#include <common.h>
#include "TrajBlock.hpp"

#include <qlib/LExceptions.hpp>
#include <qlib/LString.hpp>

#include <qlib/parallel.hpp>

#include <algorithm>
#include <climits>
#include <condition_variable>
#include <cstdlib>
#include <cstring>
#include <exception>
#include <mutex>

using namespace mdtools;
using qlib::LString;

//////////
// TrajBlockReader: lazy frame loading support.
//
// setupLazyBlock() and getTargTrajOf() need the complete Trajectory type and
// are defined in Trajectory.cpp, next to getTargTraj() and scatterCoords().

bool TrajBlockReader::canLazyLoad(qlib::InStream &ins) const
{
    if (!isLazyLoad()) return false;

    // Reopening the source later is the whole premise; see the header for why
    // each of these rules it out.
    if (!ins.isSeekable()) return false;
    if (getPath().isEmpty()) return false;
    if (getCompressMode() != COMP_NONE) return false;
    if (getBase64Flag()) return false;

    // A non-NULL smart-pointer counter means some LScrSp already owns this
    // reader, so the block can share ownership. Without one, constructing a
    // pointer from `this` would invent an owner for an object somebody else
    // frees by other means.
    return getSpRefCounter() != NULL;
}

void TrajBlockReader::checkIndexedRange(qlib::InStream &ins, qint64 endPos) const
{
    if (endPos <= 0) return;

    if (!ins.seekTo(endPos - 1) || ins.read() < 0) {
        MB_THROW(qlib::FileFormatException,
                 LString::format("Trajectory file is truncated (expected at least "
                                 "%lld bytes): %s",
                                 static_cast<long long>(endPos), getPath().c_str()));
    }
}

std::unique_ptr<qlib::InStream> TrajBlockReader::openAtFrame(int ifrm) const
{
    const int nfrm = static_cast<int>(m_frmOffsets.size());
    if (nfrm == 0) {
        MB_THROW(qlib::RuntimeException,
                 "Trajectory block was read eagerly; it has no frame index to "
                 "load a single frame from");
    }
    if (ifrm < 0 || ifrm >= nfrm) {
        MB_THROW(qlib::RuntimeException,
                 LString::format("Trajectory frame %d is outside the indexed range "
                                 "(0..%d)",
                                 ifrm, nfrm - 1));
    }

    std::unique_ptr<qlib::InStream> pIn(createInStream());
    if (!pIn->seekTo(m_frmOffsets[ifrm])) {
        MB_THROW(qlib::FileFormatException,
                 LString::format("Cannot seek to frame %d in %s", ifrm,
                                 getPath().c_str()));
    }
    return pIn;
}

// NOTE: TrajBlockReader::getTargTraj() (which resolves the parent Trajectory
// from its UID) is defined together with the Trajectory class, since it needs
// the complete Trajectory type. DCDTrajReader is its only caller.

/// One background decode. The task fills `frame` or `err` and sets `done`;
/// the loading thread waits on `cv` for it.
struct TrajBlock::PrefetchSlot
{
    std::mutex mtx;
    std::condition_variable cv;
    bool done = false;
    DetachedFrame frame;
    std::exception_ptr err;

    bool isDone()
    {
        std::lock_guard<std::mutex> lk(mtx);
        return done;
    }
};

int TrajBlock::s_nPrefetchDepth = 4;

void TrajBlock::setPrefetchDepth(int n)
{
    s_nPrefetchDepth = std::max(0, n);
}

int TrajBlock::getPrefetchDepth()
{
    return s_nPrefetchDepth;
}

TrajBlock::TrajBlock()
    : m_nIndex(0),
      m_nCrds(0),
      m_bOnDemand(false),
      m_nResident(0),
      m_nUseTick(0),
      m_nLastLoad(-1)
{
}

TrajBlock::~TrajBlock()
{
    clear();
}

void TrajBlock::allocate(int natom, int nsize)
{
    clear();
    m_nCrds = natom * 3;

    m_data.reserve(nsize);
    for (int i = 0; i < nsize; ++i) {
        PosArray *p = MB_NEW PosArray();
        p->allocate(m_nCrds);
        m_data.push_back(p);
    }
    m_flags.assign(nsize, false);

    // allocate cell dimension array
    m_cells.assign(static_cast<size_t>(CELL_SIZE) * nsize, 0.0f);
}

void TrajBlock::allocateOnDemand(int natom, int nsize)
{
    clear();
    m_nCrds = natom * 3;
    m_data.assign(nsize, nullptr);
    m_flags.assign(nsize, false);
    m_lastUse.assign(nsize, 0);
    m_cells.assign(static_cast<size_t>(CELL_SIZE) * nsize, 0.0f);
    m_bOnDemand = true;
}

TrajBlock::PosArray *TrajBlock::allocFrame(int ifrm, int ncrds)
{
    PosArray *p = MB_NEW PosArray();
    p->allocate(ncrds < 0 ? m_nCrds : ncrds);
    m_data[ifrm] = p;
    return p;
}

void TrajBlock::initFrames(int natom)
{
    clear();
    m_nCrds = natom * 3;
}

qfloat32 *TrajBlock::appendFrame()
{
    PosArray *p = MB_NEW PosArray();
    p->allocate(m_nCrds);
    m_data.push_back(p);
    m_flags.push_back(false);
    m_cells.resize(m_cells.size() + CELL_SIZE, 0.0f);
    return &(*p)[0];
}

void TrajBlock::clear()
{
    cancelPrefetch();
    for (PosArray *p : m_data) {
        delete p;
    }
    m_data.clear();
    m_flags.clear();
    m_cells.clear();
    m_lastUse.clear();
    m_nResident = 0;
    m_nUseTick = 0;
    m_bOnDemand = false;
}

void TrajBlock::selectAtoms(const quint32 *pidx, int nsel)
{
    const int nNew = nsel * 3;
    for (size_t f = 0; f < m_data.size(); ++f) {
        PosArray *pOld = m_data[f];
        if (pOld == nullptr) continue;
        if (!m_flags[f]) {
            // Nothing decoded into it yet: an on-demand frame is allocated
            // again at the new size when first written, an eager one now.
            delete pOld;
            m_data[f] = nullptr;
            if (!m_bOnDemand) allocFrame(static_cast<int>(f), nNew);
            continue;
        }
        PosArray *pNew = MB_NEW PosArray();
        pNew->allocate(nNew);
        for (int j = 0; j < nsel; ++j) {
            const size_t k = size_t(pidx[j]) * 3;
            (*pNew)[j * 3 + 0] = (*pOld)[k + 0];
            (*pNew)[j * 3 + 1] = (*pOld)[k + 1];
            (*pNew)[j * 3 + 2] = (*pOld)[k + 2];
        }
        delete pOld;
        m_data[f] = pNew;
    }
    m_nCrds = nNew;
}

bool TrajBlock::isAllLoaded() const
{
    for (size_t i = 0; i < m_flags.size(); ++i) {
        if (!m_flags[i]) return false;
    }

    return true;
}

// 2 GiB: a 100k-atom trajectory of a thousand frames still fits whole, as it
// did before there was a limit, while a 4M-atom system (47 MB a frame) keeps
// about 45 frames instead of every frame it has ever shown.
size_t TrajBlock::s_nCacheLimitBytes = size_t(2) << 30;

void TrajBlock::setCacheLimitBytes(size_t nbytes)
{
    s_nCacheLimitBytes = nbytes;
}

size_t TrajBlock::getCacheLimitBytes()
{
    return s_nCacheLimitBytes;
}

int TrajBlock::maxResidentFrames() const
{
    const size_t frameBytes = size_t(m_nCrds) * sizeof(qfloat32);
    if (frameBytes == 0) return getSize();
    const size_t n = s_nCacheLimitBytes / frameBytes;
    // Two, so that the frame being replaced and the one replacing it can
    // coexist; frame averaging reads its window one frame at a time.
    return static_cast<int>(std::max<size_t>(2, std::min<size_t>(n, size_t(INT_MAX))));
}

void TrajBlock::evictFor(int keep)
{
    if (!m_bOnDemand) return;
    const int nmax = maxResidentFrames();
    while (m_nResident >= nmax) {
        // Linear scan: a block has thousands of frames at most, and this runs
        // once per decoded frame, next to a decode that costs milliseconds.
        int victim = -1;
        for (int i = 0; i < getSize(); ++i) {
            if (i == keep || !m_flags[i] || m_data[i] == nullptr) continue;
            if (victim < 0 || m_lastUse[i] < m_lastUse[victim]) victim = i;
        }
        if (victim < 0) return;
        delete m_data[victim];
        m_data[victim] = nullptr;
        m_flags[victim] = false;
        --m_nResident;
    }
}

void TrajBlock::cancelPrefetch()
{
    if (m_pTasks) m_pTasks->wait();
    m_prefetch.clear();
    m_nLastLoad = -1;
}

bool TrajBlock::takePrefetched(int ifrm)
{
    auto it = m_prefetch.find(ifrm);
    if (it == m_prefetch.end()) return false;
    std::shared_ptr<PrefetchSlot> slot = it->second;
    m_prefetch.erase(it);
    {
        std::unique_lock<std::mutex> lk(slot->mtx);
        slot->cv.wait(lk, [&slot] { return slot->done; });
    }
    // A failed decode is redone by loadFrm(), which raises the error where
    // the caller expects it. A frame decoded for a different atom count
    // (the load selection changed since) is no use either.
    if (slot->err || slot->frame.crd.size() != size_t(m_nCrds)) return false;
    std::memcpy(getCrdArray(ifrm), slot->frame.crd.data(), size_t(m_nCrds) * sizeof(qfloat32));
    std::memcpy(getCellArray(ifrm), slot->frame.cell, sizeof(slot->frame.cell));
    return true;
}

void TrajBlock::prefetchAfter(int ifrm)
{
    const int depth = std::min(s_nPrefetchDepth, maxResidentFrames() - 1);
    const int dir = (m_nLastLoad >= 0 && ifrm < m_nLastLoad) ? -1 : 1;
    m_nLastLoad = ifrm;
    if (depth <= 0 || !m_bOnDemand || m_pReader.isnull()) return;
    if (!qlib::TaskGroup::available()) return;

    // Frames decoded ahead that playback has moved away from (it reversed,
    // or jumped) are only memory now.
    for (auto it = m_prefetch.begin(); it != m_prefetch.end();) {
        if (std::abs(it->first - ifrm) > depth && it->second->isDone())
            it = m_prefetch.erase(it);
        else
            ++it;
    }

    for (int k = 1; k <= depth; ++k) {
        const int j = ifrm + dir * k;
        if (j < 0 || j >= getSize()) break;
        if (m_flags[j] || m_prefetch.count(j) > 0) continue;
        DetachedDecode job;
        try {
            job = m_pReader->makeDetachedDecode(j, this);
        } catch (...) {
            // A prefetch is only ever an optimisation; the frame being shown
            // has been loaded already, and a later load() reports the error.
            return;
        }
        if (!job) return;
        if (!m_pTasks) m_pTasks.reset(MB_NEW qlib::TaskGroup());
        auto slot = std::make_shared<PrefetchSlot>();
        m_prefetch[j] = slot;
        m_pTasks->run([slot, job]() {
            DetachedFrame frame;
            std::exception_ptr err;
            try {
                job(frame);
            } catch (...) {
                err = std::current_exception();
            }
            {
                std::lock_guard<std::mutex> lk(slot->mtx);
                slot->frame = std::move(frame);
                slot->err = err;
                slot->done = true;
            }
            slot->cv.notify_all();
        });
    }
}

void TrajBlock::load(int ifrm)
{
    if (!m_lastUse.empty()) m_lastUse[ifrm] = ++m_nUseTick;
    if (m_flags[ifrm]) {
        // Held already; keep the frames after it coming all the same.
        if (!m_pReader.isnull()) prefetchAfter(ifrm);
        return;
    }

    if (m_pReader.isnull()) {
        LString msg = LString::format("Cannot load TrajBlock %d (reader is null)", ifrm);
        LOG_DPRINTLN("TrajBlk> ERROR: %s", msg.c_str());
        MB_THROW(qlib::RuntimeException, msg);
        return;
    }

    if (m_pReader->getPath().isEmpty()) {
        // TODO: check readability of the reader's source path
        m_pReader->setPath(getSource());
    }

    evictFor(ifrm);
    if (!takePrefetched(ifrm)) m_pReader->loadFrm(ifrm, this);

    m_flags[ifrm] = true;
    ++m_nResident;
    prefetchAfter(ifrm);

    // The reader is kept while a released frame may still need decoding again.
    if (isAllLoaded() && (!m_bOnDemand || maxResidentFrames() >= getSize())) {
        // all frames loaded --> release the reader
        m_pReader = TrajBlockReaderPtr();
        LOG_DPRINTLN("TrajBlk> load %d-%d done", m_nIndex, m_nIndex + getSize() - 1);
    }
}
