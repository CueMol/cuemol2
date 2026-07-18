// -*-Mode: C++;-*-
//
//  OpenGL Buffer Object representation
//

#include <common.h>
#include "OglCommon.hpp"

#include "OcBufferRep.hpp"
#include <gfx/DisplayContext.hpp>
#include <gfx/AbstDrawAttrs.hpp>
#include <qsys/SceneManager.hpp>
#include <sysdep/OglError.hpp>

// #include <sysdep/OglProgramObject.hpp>
// #include <sysdep/ShaderSetupHelper.hpp>

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
    MB_DPRINTLN("OcBufferRep> Buffer %d created for view %d, size=%d", m_nBufID, (int)m_nViewID,
                (int)ada.getDataSize());

    if (ada.getType() == AbstDrawElem::VA_ATTR_INDS) {
        glGenBuffers(1, &m_nIndBufID);
        glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, m_nIndBufID);
        glBufferData(GL_ELEMENT_ARRAY_BUFFER, ada.getIndDataSize(), ada.getIndData(),
                     GL_STATIC_DRAW);
        MB_DPRINTLN("OcBufferRep> Index Buffer %d created for view %d, size=%d", m_nIndBufID, (int)m_nViewID, (int)ada.getIndDataSize());
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
        // no update
        return;
    }

    // transfer updated data to GPU by glBufferSubData
    glBufferSubData(GL_ARRAY_BUFFER, 0, ada.getDataSize(), ada.getData());

    // Indeices are always immutable in the current implementation
    // if (ada.getType() == AbstDrawElem::VA_ATTR_INDS) {
    //     glBufferSubData(GL_ELEMENT_ARRAY_BUFFER, 0, ada.getIndDataSize(),
    //                     ada.getIndData());
    // }

    // reset update flag
    ada.setUpdated(false);
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
        glVertexAttribDivisor(al, ada.getAttrDivisor(i));
        glEnableVertexAttribArray(al);
        CHK_GLERROR("glEnableVertexAttribArray(al)");
    }
}

void OcBufferRep::draw(const gfx::AbstDrawAttrs &ada)
{
    const GLenum mode = convDrawMode(ada.getDrawMode());
    const int itype = ada.getType();
    const size_t indsz = ada.getIndElemSize();
    const int ninst = ada.getNumInstances();

    if (itype == AbstDrawElem::VA_ATTR_INDS) {
        GLenum ind_type;
        if (indsz == 2) {
            ind_type = GL_UNSIGNED_SHORT;
        } else if (indsz == 4) {
            ind_type = GL_UNSIGNED_INT;
        } else {
            LOG_DPRINTLN("unsupported index element size %d", indsz);
            MB_ASSERT(false);
            return;
        }
        if (ninst <= 0) {
            glDrawElements(mode, ada.getIndSize(), ind_type, 0);
            CHK_GLERROR("glDrawElements(mode, ada.getIndSize(), ind_type, 0)");
        } else {
            glDrawElementsInstanced(mode, ada.getIndSize(), ind_type, 0, ninst);
            CHK_GLERROR("glDrawElementsInstanced(mode, ada.getIndSize(), ind_type, 0, ninst)");
            // MB_DPRINTLN("glDrawElementsInstanced(mode=%d, count=%d, type=%d, indices=0, instancecount=%d)", mode, ada.getIndSize(), ind_type, ninst);
        }
    } else if (itype == AbstDrawElem::VA_ATTRS) {
        if (ninst <= 0) {
            glDrawArrays(mode, 0, ada.getSize());
            CHK_GLERROR("glDrawArrays(mode, 0, ada.getSize())");
            return;
        } else {
            glDrawArraysInstanced(mode, 0, ada.getSize(), ninst);
            CHK_GLERROR("glDrawArraysInstanced(mode, 0, ada.getSize(), ninst)");
        }
    } else {
        LOG_DPRINTLN("unsupported draw element type %d", itype);
        MB_ASSERT(false);
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
    MB_DPRINTLN("OcBufferRep> Destructing view=%d, buf=%d, ind=%d", (int)m_nViewID, m_nBufID,
                m_nIndBufID);

    qsys::ViewPtr rvw = qsys::SceneManager::getViewS(m_nViewID);
    if (rvw.isnull()) {
        MB_DPRINTLN(
            "OcBufferRep> unknown parent view (%d), Texture %d cannot be deleted",
            (int)m_nViewID, m_nBufID);
        return;
    }
    gfx::DisplayContext *pctxt = rvw->getDisplayContext();
    if (pctxt == nullptr) {
        MB_DPRINTLN(
            "OcBufferRep> view has no display context, Texture %d cannot be deleted",
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
