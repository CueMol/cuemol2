// -*-Mode: C++;-*-
//
// DrawObj
//

#include <common.h>
#include "DrawObj.hpp"

namespace qsys {

DrawObj::DrawObj() : m_bEnabled(false) {}

DrawObj::~DrawObj() {}

void DrawObj::setEnabled(bool f)
{
    m_bEnabled = f;
}

}  // namespace qsys
