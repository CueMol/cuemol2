// -*-Mode: C++;-*-
//
// MD trajectory block data class
//

#include <common.h>
#include "TrajBlock.hpp"

#include <qlib/LExceptions.hpp>
#include <qlib/LString.hpp>

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

TrajBlock::TrajBlock() : m_nIndex(0), m_nCrds(0) {}

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
    for (PosArray *p : m_data) {
        delete p;
    }
    m_data.clear();
    m_flags.clear();
    m_cells.clear();
}

bool TrajBlock::isAllLoaded() const
{
    for (size_t i = 0; i < m_flags.size(); ++i) {
        if (!m_flags[i]) return false;
    }

    return true;
}

void TrajBlock::load(int ifrm)
{
    if (m_flags[ifrm]) return;

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

    m_pReader->loadFrm(ifrm, this);

    m_flags[ifrm] = true;

    if (isAllLoaded()) {
        // all frames loaded --> release the reader
        m_pReader = TrajBlockReaderPtr();
        LOG_DPRINTLN("TrajBlk> load %d-%d done", m_nIndex, m_nIndex + getSize() - 1);
    }
}
