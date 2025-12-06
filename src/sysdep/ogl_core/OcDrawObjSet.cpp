// -*-Mode: C++;-*-
//
// OpenGL implementation of DrawObjSet
//

#include <common.h>
#include "OglCommon.hpp"
#include "GLSLLineHelper2.hpp"
#include "OcDrawObjSet.hpp"

namespace sysdep {

OcDrawObjSet::OcDrawObjSet() : m_pGlslLine(nullptr) {}

OcDrawObjSet::~OcDrawObjSet()
{
    if (m_pGlslLine != nullptr) {
        delete m_pGlslLine;
    }
}

void OcDrawObjSet::allocLines(int nlines)
{
    MB_ASSERT(m_pGlslLine == nullptr);
    m_pGlslLine = MB_NEW GLSLLineHelper();
    m_pGlslLine->alloc(nlines * 2);
}

void OcDrawObjSet::setLineWidth(float width)
{
    if (m_pGlslLine != nullptr) {
        m_pGlslLine->setLineWidth(width);
    }
}

void OcDrawObjSet::setNoDepth(bool bNoDepth)
{
    if (m_pGlslLine != nullptr) {
        m_pGlslLine->setNoDepth(bNoDepth);
    }
}

void OcDrawObjSet::setStipple(bool bStipple)
{
    if (m_pGlslLine != nullptr) {
        m_pGlslLine->setStipple(bStipple);
    }
}

void OcDrawObjSet::setLine(int idx, const qlib::Vector4D &v1, qlib::quint32 cc1,
                         const qlib::Vector4D &v2, qlib::quint32 cc2)
{
    MB_ASSERT(m_pGlslLine != nullptr);

    m_pGlslLine->vertex(idx * 2, v1);
    m_pGlslLine->color(idx * 2, cc1);

    m_pGlslLine->vertex(idx * 2 + 1, v2);
    m_pGlslLine->color(idx * 2 + 1, cc2);
}

void OcDrawObjSet::draw(gfx::DisplayContext *pdc) const
{
    if (m_pGlslLine != nullptr) {
        m_pGlslLine->initShader(pdc);
        m_pGlslLine->draw(pdc);
    }
}

}  // namespace sysdep
