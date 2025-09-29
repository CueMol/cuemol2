// -*-Mode: C++;-*-
//
//  OpenGL display context implementation
//

#include <common.h>

#ifdef HAVE_GL_GLEW_H
#define GLEW_STATIC
#include <GL/glew.h>
#endif

#if defined(_WIN32)
#include <windows.h>
#endif

#ifdef HAVE_GL_GL_H
#include <GL/gl.h>
#elif defined(HAVE_OPENGL_GL_H)
#include <OpenGL/gl.h>
#else
#error no gl.h
#endif

#ifdef HAVE_GL_GLU_H
#include <GL/glu.h>
#elif defined(HAVE_OPENGL_GLU_H)
#include <OpenGL/glu.h>
#else
#error no glu.h
#endif

#include "OcDisplayContext.hpp"
#include "OcDisplayList.hpp"
// #include "OcView.hpp"
#include "OglProgramObject.hpp"
#include "OglProgObjMgr.hpp"
#include "OcPixDraw.hpp"

#include <gfx/TextRenderManager.hpp>
#include <gfx/PixelBuffer.hpp>
#include <gfx/SolidColor.hpp>
#include <gfx/Mesh.hpp>
#include <gfx/DrawAttrArray.hpp>
#include <gfx/ColProfMgr.hpp>

#include <qsys/Scene.hpp>
#include <qsys/SceneManager.hpp>
#include <qsys/style/StyleMgr.hpp>

namespace sysdep {

using gfx::AbstDrawElem;
using gfx::DisplayContext;
using gfx::DrawElem;
// using gfx::DrawElemV;
// using gfx::DrawElemVC;
// using gfx::DrawElemVNC;
// using gfx::DrawElemVNCI;
// using gfx::DrawElemVNCI32;
using gfx::DrawElemPix;

OcDisplayContext::OcDisplayContext() : super_t()
{
    m_pGluData = NULL;
    m_fcolor = Vector4D(1.0, 1.0, 1.0, 1.0);
    m_nDetail = 5;

    m_bUseShaderAlpha = false;

    m_pOcPixDraw = nullptr;
}

OcDisplayContext::~OcDisplayContext()
{
}

void OcDisplayContext::setTargetView(qsys::View *pView)
{
    super_t::setTargetView(pView);
    setSceneID(pView->getSceneID());
    setViewID(pView->getUID());
}

void OcDisplayContext::init()
{
}

bool OcDisplayContext::isFile() const
{
    return false;
}

bool OcDisplayContext::isDrawElemSupported() const
{
    return true;
}

// void OcDisplayContext::startSection(const LString &section_name)
// {
// }

// void OcDisplayContext::endSection()
// {
// }


void OcDisplayContext::setMaterial(const LString &name)
{
    super_t::setMaterial(name);
    setMaterImpl(name);
}

void OcDisplayContext::setMaterImpl(const LString &name)
{
}


//////////

void OcDisplayContext::enableDepthTest(bool f)
{
    if (f)
        ::glDepthMask(GL_TRUE);
    else
        ::glDepthMask(GL_FALSE);
}

// void OcDisplayContext::startHit(qlib::uid_t rend_uid)
// {
// }

// void OcDisplayContext::endHit()
// {
// }

// void OcDisplayContext::drawPointHit(int nid, const Vector4D &pos)
// {
// }

// void OcDisplayContext::loadName(int nameid)
// {
// }

// void OcDisplayContext::pushName(int nameid)
// {
// }

// void OcDisplayContext::popName()
// {
// }

void OcDisplayContext::setCullFace(bool f /*=true*/)
{
    if (f)
        glEnable(GL_CULL_FACE);
    else
        glDisable(GL_CULL_FACE);
}

void OcDisplayContext::drawPixels(const Vector4D &pos, const gfx::PixelBuffer &data,
                                   const gfx::ColorPtr &acol)
{
    if (m_pOcPixDraw == nullptr) {
        m_pOcPixDraw = MB_NEW OcPixDraw();
        m_pOcPixDraw->initShader(this);
    }

    if (!m_pOcPixDraw->createDrawElem(this, data)) {
        LOG_DPRINTLN("OcDisplayContext::drawPixels> failed to create DrawElem");
        return;
    }

    gfx::ColorPtr col = acol;
    if (acol.isnull()) {
        // use current color
        col = super_t::getColor();
    }

    m_pOcPixDraw->draw(this, pos, data, col);
}

void OcDisplayContext::drawString(const Vector4D &pos, const qlib::LString &str)
{
    gfx::TextRenderManager *pTRM = gfx::TextRenderManager::getInstance();
    if (pTRM == NULL) return;

    gfx::PixelBuffer pixbuf;
    if (!pTRM->renderText(str, pixbuf)) return;

    // gfx::SolidColor col(m_color);
    drawPixels(pos, pixbuf, ColorPtr());
}

// void OcDisplayContext::setPolygonMode(int id)
// {
// }

void OcDisplayContext::loadOrthoProj(float vw, float fasp, float slabnear,
                                      float slabfar)
{
    super_t::loadOrthoProj(vw, fasp, slabnear, slabfar);

    glMatrixMode(GL_PROJECTION);
    glLoadIdentity();
    loadMatrix(getProjMat());
    glMatrixMode(GL_MODELVIEW);
}

void OcDisplayContext::loadPerspProj(float width, float fasp, float slabnear, float slabfar,
                                      float distance)
{
    super_t::loadPerspProj(width, fasp, slabnear, slabfar, distance);
    glMatrixMode(GL_PROJECTION);
    glLoadIdentity();
    loadMatrix(getProjMat());
    glMatrixMode(GL_MODELVIEW);
}

//////////////////////////////////////////////////////////////////
// Display list impl

DisplayContext *OcDisplayContext::createDisplayList()
{
    OcDisplayList *pdl = MB_NEW OcDisplayList();
    // Targets the same view as this
    pdl->setTargetView(getTargetView());
    pdl->setAlpha(getAlpha());
    pdl->setMaterial(getMaterial());
    // pdl->setUseShaderAlpha(useShaderAlpha());
    pdl->setPixSclFac(getPixSclFac());
    return pdl;
}

bool OcDisplayContext::canCreateDL() const
{
    return true;
}

void OcDisplayContext::callDisplayList(DisplayContext *pdl)
{
    OcDisplayList *poc = dynamic_cast<OcDisplayList *>(pdl);
    if (poc != NULL && poc->isValid()) {
        poc->callDisplayListImpl(this);
    }
}

bool OcDisplayContext::isCompatibleDL(DisplayContext *pdl) const
{
    OcDisplayList *poc = dynamic_cast<OcDisplayList *>(pdl);
    if (poc != NULL) {
        return true;
    }
    return false;
}

bool OcDisplayContext::isDisplayList() const
{
    return false;
}

bool OcDisplayContext::recordStart()
{
    return false;
}

void OcDisplayContext::recordEnd() {}

//////////////////////////////////////////////////////////////////
// Quadric object drawing impl

// void OcDisplayContext::sphere()
// {
// }

// void OcDisplayContext::cone(double r1, double r2, const Vector4D &pos1,
//                              const Vector4D &pos2, bool bCap)
// {
// }

// void OcDisplayContext::sphere(double r, const Vector4D &vec)
// {
// }

// void OcDisplayContext::setDetail(int n)
// {
//     m_nDetail = n;
// }

// int OcDisplayContext::getDetail() const
// {
//     return m_nDetail;
// }

void OcDisplayContext::drawMesh(const gfx::Mesh &mesh)
{
}

namespace {
GLenum convDrawMode(int nMode)
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
}  // namespace

/////////////////////////////////////////////////

namespace {
class OglVBORep : public gfx::VBORep
{
public:
    qlib::uid_t m_nSceneID;
    GLuint m_nBufID;

    virtual ~OglVBORep()
    {
        qsys::ScenePtr rsc = qsys::SceneManager::getSceneS(m_nSceneID);
        if (rsc.isnull()) {
            MB_DPRINTLN("OglVBO> unknown scene, VBO %d cannot be deleted", m_nBufID);
            return;
        }

        qsys::Scene::ViewIter viter = rsc->beginView();
        if (viter == rsc->endView()) {
            MB_DPRINTLN("OglVBO> no view, VBO %d cannot be deleted", m_nBufID);
            return;
        }

        qsys::ViewPtr rvw = viter->second;
        if (rvw.isnull()) {
            // If any views aren't found, it is no problem,
            // because the parent context (and also all DLs) may be already destructed.
            return;
        }
        gfx::DisplayContext *pctxt = rvw->getDisplayContext();
        pctxt->setCurrent();

        GLuint buffers[1];
        buffers[0] = m_nBufID;
        glDeleteBuffers(1, buffers);
    }
};
}  // namespace

void OcDisplayContext::drawElem(const AbstDrawElem &ade)
{
    const int ntype = ade.getType();
    MB_ASSERT(ntype == AbstDrawElem::VA_ATTRS || ntype == AbstDrawElem::VA_ATTR_INDS);

    // shader attribute impl
    drawElemAttrs(static_cast<const gfx::AbstDrawAttrs &>(ade));
}

namespace {
int convGLConsts(int id)
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

int convGLNorm(int id)
{
    if (id == qlib::type_consts::QTC_FLOAT32 || id == qlib::type_consts::QTC_FLOAT64)
        return GL_FALSE;
    else
        return GL_TRUE;
}
}  // namespace

void OcDisplayContext::drawElemAttrs(const gfx::AbstDrawAttrs &ada)
{
    int itype = ada.getType();

    GLuint nvbo = 0;
    GLuint nvbo_ind = 0;

    if (ada.getVBO() == NULL) {
        // Make VBO for attribute array
        glGenBuffers(1, &nvbo);
        OglVBORep *pRep = MB_NEW OglVBORep();
        pRep->m_nBufID = nvbo;
        pRep->m_nSceneID = getSceneID();
        ada.setVBO(pRep);

        // Init VBO & copy data
        glBindBuffer(GL_ARRAY_BUFFER, nvbo);
        glBufferData(GL_ARRAY_BUFFER, ada.getDataSize(), ada.getData(), GL_STATIC_DRAW);

        if (itype == AbstDrawElem::VA_ATTR_INDS) {
            // Make VBO for indices
            glGenBuffers(1, &nvbo_ind);
            OglVBORep *pRep = MB_NEW OglVBORep();
            pRep->m_nBufID = nvbo_ind;
            pRep->m_nSceneID = getSceneID();
            ada.setIndexVBO(pRep);

            glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, nvbo_ind);
            glBufferData(GL_ELEMENT_ARRAY_BUFFER, ada.getIndDataSize(),
                         ada.getIndData(), GL_STATIC_DRAW);
        }
    } else {
        OglVBORep *pRep = (OglVBORep *)ada.getVBO();
        nvbo = pRep->m_nBufID;
        glBindBuffer(GL_ARRAY_BUFFER, nvbo);

        if (itype == AbstDrawElem::VA_ATTR_INDS) {
            OglVBORep *pRep = (OglVBORep *)ada.getIndexVBO();
            nvbo_ind = pRep->m_nBufID;
            glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, nvbo_ind);
        }

        if (ada.isUpdated()) {
            glBufferSubData(GL_ARRAY_BUFFER, 0, ada.getDataSize(), ada.getData());
            if (itype == AbstDrawElem::VA_ATTR_INDS) {
                glBufferSubData(GL_ELEMENT_ARRAY_BUFFER, 0, ada.getIndDataSize(),
                                ada.getIndData());
            }
        }
    }

    size_t nattr = ada.getAttrSize();
    for (int i = 0; i < nattr; ++i) {
        int al = ada.getAttrLoc(i);
        int az = ada.getAttrElemSize(i);
        int at = ada.getAttrTypeID(i);
        int ap = ada.getAttrPos(i);
        glVertexAttribPointer(al, az, convGLConsts(at), convGLNorm(at),
                              ada.getElemSize(), (void *)ap);
        glEnableVertexAttribArray(al);
    }

    GLenum mode = convDrawMode(ada.getDrawMode());
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
    }

    for (int i = 0; i < nattr; ++i) {
        int al = ada.getAttrLoc(i);
        glDisableVertexAttribArray(al);
    }

    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, 0);
    glBindBuffer(GL_ARRAY_BUFFER, 0);
}

OglProgramObject *OcDisplayContext::createProgramObject(const LString &name)
{
    if (!qsys::View::hasVS()) return NULL;

    OglProgObjMgr *pMgr = OglProgObjMgr::getInstance();

    return pMgr->createProgramObject(name, this);
}

OglProgramObject *OcDisplayContext::getProgramObject(const LString &name)
{
    OglProgObjMgr *pMgr = OglProgObjMgr::getInstance();

    return pMgr->getProgramObject(name, this);
}

}  // namespace sysdep
