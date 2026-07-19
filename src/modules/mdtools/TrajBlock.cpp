// -*-Mode: C++;-*-
//
// MD trajectory block data class
//

#include <common.h>
#include "TrajBlock.hpp"

#include <qlib/LString.hpp>

using namespace mdtools;
using qlib::LString;

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
