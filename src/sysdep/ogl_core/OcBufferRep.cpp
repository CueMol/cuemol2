// -*-Mode: C++;-*-
//
//  OpenGL Buffer Object representation
//

#include <common.h>
#include "OglCommon.hpp"

#include "OcBufferRep.hpp"
#include <gfx/DisplayContext.hpp>
#include <gfx/DrawAttrArray.hpp>
#include <qsys/SceneManager.hpp>
#include <sysdep/OglProgramObject.hpp>
#include <sysdep/ShaderSetupHelper.hpp>
#include <sysdep/OglError.hpp>

namespace sysdep {

// static
GLenum OcBufferRep::convDrawMode(int nMode)
{
    GLenum mode;
    switch (nMode) {
        case DrawElem::DRAW_POINTS:
            mode = GL_POINTS;
            break;
        case DrawElem::DRAW_LINE_STRIP:
            mode = GL_LINE_STRIP;
            break;
        case DrawElem::DRAW_LINE_LOOP:
            mode = GL_LINE_LOOP;
            break;
        case DrawElem::DRAW_LINES:
            mode = GL_LINES;
            break;
        case DrawElem::DRAW_TRIANGLE_STRIP:
            mode = GL_TRIANGLE_STRIP;
            break;
        case DrawElem::DRAW_TRIANGLE_FAN:
            mode = GL_TRIANGLE_FAN;
            break;
        case DrawElem::DRAW_TRIANGLES:
            mode = GL_TRIANGLES;
            break;
        case DrawElem::DRAW_QUAD_STRIP:
            mode = GL_QUAD_STRIP;
            break;
        case DrawElem::DRAW_QUADS:
            mode = GL_QUADS;
            break;
        case DrawElem::DRAW_POLYGON:
            mode = GL_POLYGON;
            break;
        default: {
            LString msg = "Ogl DrawElem: invalid draw mode";
            LOG_DPRINTLN(msg);
            MB_THROW(qlib::RuntimeException, msg);
        }
    }
    return mode;
}

// static
int OcBufferRep::convGLConsts(int id)
{
    switch (id) {
        case qlib::type_consts::QTC_BOOL:
            return GL_BOOL;
        case qlib::type_consts::QTC_UINT8:
            return GL_UNSIGNED_BYTE;
        case qlib::type_consts::QTC_UINT16:
            return GL_UNSIGNED_SHORT;
        case qlib::type_consts::QTC_UINT32:
            return GL_UNSIGNED_INT;
        case qlib::type_consts::QTC_INT8:
            return GL_BYTE;
        case qlib::type_consts::QTC_INT16:
            return GL_SHORT;
        case qlib::type_consts::QTC_INT32:
            return GL_INT;
        case qlib::type_consts::QTC_FLOAT32:
            return GL_FLOAT;
        case qlib::type_consts::QTC_FLOAT64:
            return GL_DOUBLE;
        default:
            return -1;
    }
}

// static
int OcBufferRep::convGLNorm(int id)
{
    if (id == qlib::type_consts::QTC_FLOAT32 || id == qlib::type_consts::QTC_FLOAT64)
        return GL_FALSE;
    else
        return GL_TRUE;
}

void OcBufferRep::create(gfx::DisplayContext *pdc, const gfx::AbstDrawAttrs &ada)
{
    glGenBuffers(1, &m_nBufID);
    m_nViewID = pdc->getViewID();

    // Init VBO & copy data
    glBindBuffer(GL_ARRAY_BUFFER, m_nBufID);
    glBufferData(GL_ARRAY_BUFFER, ada.getDataSize(), ada.getData(), GL_STATIC_DRAW);

    if (ada.getType() == AbstDrawElem::VA_ATTR_INDS) {
        glGenBuffers(1, &m_nIndBufID);
        glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, m_nIndBufID);
        glBufferData(GL_ELEMENT_ARRAY_BUFFER, ada.getIndDataSize(), ada.getIndData(),
                     GL_STATIC_DRAW);
    }
}

void OcBufferRep::bind()
{
    glBindBuffer(GL_ARRAY_BUFFER, m_nBufID);
    if (m_nIndBufID != 0) {
        glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, m_nIndBufID);
    }
}

void OcBufferRep::update(const gfx::AbstDrawAttrs &ada)
{
    if (!ada.isUpdated()) {
        return;
    }

    glBufferSubData(GL_ARRAY_BUFFER, 0, ada.getDataSize(), ada.getData());
    if (ada.getType() == AbstDrawElem::VA_ATTR_INDS) {
        glBufferSubData(GL_ELEMENT_ARRAY_BUFFER, 0, ada.getIndDataSize(),
                        ada.getIndData());
    }
}

void OcBufferRep::setAttrib(const gfx::AbstDrawAttrs &ada)
{
    size_t nattr = ada.getAttrSize();
    for (int i = 0; i < nattr; ++i) {
        int al = ada.getAttrLoc(i);
        int az = ada.getAttrElemSize(i);
        int at = ada.getAttrTypeID(i);
        int ap = ada.getAttrPos(i);
        glVertexAttribPointer(al, az, convGLConsts(at), convGLNorm(at),
                              ada.getElemSize(), (void *)ap);
        glEnableVertexAttribArray(al);
        CHK_GLERROR("glEnableVertexAttribArray(al)");
    }
}

void OcBufferRep::draw(const gfx::AbstDrawAttrs &ada)
{
    GLenum mode = convDrawMode(ada.getDrawMode());
    int itype = ada.getType();
    size_t indsz = ada.getIndElemSize();
    if (itype == AbstDrawElem::VA_ATTR_INDS) {
        if (indsz == 2)
            glDrawElements(mode, ada.getIndSize(), GL_UNSIGNED_SHORT, 0);
        else if (indsz == 4)
            glDrawElements(mode, ada.getIndSize(), GL_UNSIGNED_INT, 0);
        else {
            LOG_DPRINTLN("unsupported index element size %d", indsz);
            MB_ASSERT(false);
        }
    } else {
        glDrawArrays(mode, 0, ada.getSize());
        CHK_GLERROR("glDrawArrays(mode, 0, ada.getSize())");
    }
}

void OcBufferRep::draw(const gfx::AbstDrawAttrs &ada, int nCount, int nInsts)
{
    GLenum mode = convDrawMode(ada.getDrawMode());
    int itype = ada.getType();
    size_t indsz = ada.getIndElemSize();
    if (itype == AbstDrawElem::VA_ATTR_INDS) {
        if (indsz == 2)
            glDrawElements(mode, ada.getIndSize(), GL_UNSIGNED_SHORT, 0);
        else if (indsz == 4)
            glDrawElements(mode, ada.getIndSize(), GL_UNSIGNED_INT, 0);
        else {
            LOG_DPRINTLN("unsupported index element size %d", indsz);
            MB_ASSERT(false);
        }
    } else {
        // glDrawArrays(mode, 0, ada.getSize());
        glDrawArraysInstanced(mode, 0, nCount, nInsts);
        CHK_GLERROR("glDrawArrays(mode, 0, ada.getSize())");
    }
}

void OcBufferRep::unbind(const gfx::AbstDrawAttrs &ada)
{
    size_t nattr = ada.getAttrSize();
    for (int i = 0; i < nattr; ++i) {
        int al = ada.getAttrLoc(i);
        glDisableVertexAttribArray(al);
    }

    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, 0);
    glBindBuffer(GL_ARRAY_BUFFER, 0);
}

OcBufferRep::~OcBufferRep()
{
    MB_DPRINTLN("OcBufferRep> Destructing view=%d, buf=%d, ind=%d", m_nViewID, m_nBufID,
                m_nIndBufID);

    qsys::ViewPtr rvw = qsys::SceneManager::getViewS(m_nViewID);
    if (rvw.isnull()) {
        MB_DPRINTLN("OcBufferRep> unknown parent view (%d), Texture %d cannot be deleted",
                    m_nViewID, m_nBufID);
        return;
    }
    gfx::DisplayContext *pctxt = rvw->getDisplayContext();
    if (pctxt == nullptr) {
        MB_DPRINTLN("OcBufferRep> view has no display context, Texture %d cannot be deleted",
                    m_nBufID);
        return;
    }

    pctxt->setCurrent();
    glDeleteBuffers(1, &m_nBufID);
    if (m_nIndBufID != 0) {
        glDeleteBuffers(1, &m_nIndBufID);
    }
    MB_DPRINTLN("OcBufferRep> Buffer %d, %d deleted", m_nBufID, m_nIndBufID);
}

}  // namespace sysdep
