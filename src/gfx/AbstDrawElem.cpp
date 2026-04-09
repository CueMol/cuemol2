// -*-Mode: C++;-*-
//
// Abstract draw element implementation
//

#include <common.h>

#include "AbstDrawElem.hpp"

namespace gfx {

AbstDrawElem::AbstDrawElem()
    : m_nSize(0),
      m_pVBORep(NULL),
      m_nDrawMode(DRAW_POINTS),
      m_bUpdate(false)
{
}

AbstDrawElem::~AbstDrawElem()
{
    if (m_pVBORep != NULL) delete m_pVBORep;
}

void AbstDrawElem::invalidateCache() const
{
    if (m_pVBORep != NULL) delete m_pVBORep;
    m_pVBORep = NULL;
}

}  // namespace gfx
