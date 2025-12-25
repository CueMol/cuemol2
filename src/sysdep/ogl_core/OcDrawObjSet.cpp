// -*-Mode: C++;-*-
//
// OpenGL implementation of DrawObjSet
//

#include <common.h>
#include "OglCommon.hpp"
#include "GLSLLineHelper2.hpp"
#include "GLSLTrigHelper.hpp"
#include "OcDrawObjSet.hpp"

namespace sysdep {

OcDrawObjSet::OcDrawObjSet() : m_pGlslLine(nullptr), m_pGlslTrigMesh(nullptr) {}

OcDrawObjSet::~OcDrawObjSet()
{
    if (m_pGlslLine != nullptr) {
        delete m_pGlslLine;
    }

    if (m_pGlslTrigMesh != nullptr) {
        delete m_pGlslTrigMesh;
    }
}

//////////

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

void OcDrawObjSet::setLineUpdated(bool bUpdated)
{
    if (m_pGlslLine != nullptr) {
        m_pGlslLine->setUpdated(bUpdated);
    }
}

//////////

void OcDrawObjSet::allocTrigMesh(int nverts, int nfaces)
{
    MB_ASSERT(m_pGlslTrigMesh == nullptr);
    m_pGlslTrigMesh = MB_NEW GLSLTrigHelper();
    m_pGlslTrigMesh->alloc(nverts, nfaces);
}

void OcDrawObjSet::setTrigMeshVertex(int idx, const qlib::Vector4D &v)
{
    MB_ASSERT(m_pGlslTrigMesh != nullptr);
    m_pGlslTrigMesh->vertex(idx, v);
}

void OcDrawObjSet::setTrigMeshNormal(int idx, const qlib::Vector4D &n)
{
    MB_ASSERT(m_pGlslTrigMesh != nullptr);
    m_pGlslTrigMesh->normal(idx, n);
}

void OcDrawObjSet::setTrigMeshColor(int idx, qlib::quint32 cc)
{
    MB_ASSERT(m_pGlslTrigMesh != nullptr);
    m_pGlslTrigMesh->color(idx, cc);
}

void OcDrawObjSet::setTrigMeshFace(int idx, int v1, int v2, int v3)
{
    MB_ASSERT(m_pGlslTrigMesh != nullptr);
    m_pGlslTrigMesh->face(idx, v1, v2, v3);
}

void OcDrawObjSet::setTrigMeshUpdated(bool bUpdated)
{
    if (m_pGlslTrigMesh != nullptr) {
        m_pGlslTrigMesh->setUpdated(bUpdated);
    }
}

void OcDrawObjSet::draw(gfx::DisplayContext *pdc) const
{
    if (m_pGlslLine != nullptr) {
        m_pGlslLine->initShader(pdc);
        if (isInvertColor()) {
            glEnable(GL_BLEND);
            glBlendFunc(GL_ONE_MINUS_DST_COLOR, GL_ZERO);
        }
        m_pGlslLine->draw(pdc);
        if (isInvertColor()) {
            glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
        }
    }

    if (m_pGlslTrigMesh != nullptr) {
        m_pGlslTrigMesh->initShader(pdc);
        if (isInvertColor()) {
            glEnable(GL_BLEND);
            glBlendFunc(GL_ONE_MINUS_DST_COLOR, GL_ZERO);
        }
        m_pGlslTrigMesh->draw(pdc);
        if (isInvertColor()) {
            glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
        }
        MB_DPRINTLN("OcDrawObjSet: draw trig mesh OK");
    }
}

}  // namespace sysdep
