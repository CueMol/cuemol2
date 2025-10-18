// -*-Mode: C++;-*-
//
//  OpenGL display context implementation
//

#include <common.h>
#include "OglCommon.hpp"

#include "OcDisplayContext.hpp"
#include "OcDisplayList.hpp"
// #include "OcView.hpp"
#include "OglProgramObject.hpp"
#include "OglProgObjMgr.hpp"
#include "OcPixDraw.hpp"
#include "OcBufferRep.hpp"

#include <gfx/TextRenderManager.hpp>
#include <gfx/PixelBuffer.hpp>
#include <gfx/SolidColor.hpp>
#include <gfx/Mesh.hpp>
#include <gfx/DrawAttrArray.hpp>
#include <gfx/ColProfMgr.hpp>

#include <qsys/Scene.hpp>
#include <qsys/SceneManager.hpp>
#include <qsys/style/StyleMgr.hpp>
#include <sysdep/OglError.hpp>

namespace sysdep {

using gfx::AbstDrawElem;
using gfx::DisplayContext;
using gfx::DrawElem;
using gfx::DrawElemPix;

OcDisplayContext::OcDisplayContext() : super_t()
{
    m_pGluData = NULL;
    m_fcolor = Vector4D(1.0, 1.0, 1.0, 1.0);
    m_nDetail = 5;

    m_bUseShaderAlpha = false;

    m_pOcPixDraw = nullptr;
}

OcDisplayContext::~OcDisplayContext() {}

void OcDisplayContext::setTargetView(qsys::View *pView)
{
    super_t::setTargetView(pView);
    setSceneID(pView->getSceneID());
    setViewID(pView->getUID());
}

void OcDisplayContext::init() {}

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

void OcDisplayContext::setMaterImpl(const LString &name) {}

//////////

void OcDisplayContext::enableDepthTest(bool f)
{
    if (f)
        ::glDepthMask(GL_TRUE);
    else
        ::glDepthMask(GL_FALSE);
}

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

void OcDisplayContext::loadPerspProj(float width, float fasp, float slabnear,
                                     float slabfar, float distance)
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

void OcDisplayContext::drawMesh(const gfx::Mesh &mesh) {}

void OcDisplayContext::drawElem(const AbstDrawElem &ade)
{
    const int ntype = ade.getType();
    MB_ASSERT(ntype == AbstDrawElem::VA_ATTRS || ntype == AbstDrawElem::VA_ATTR_INDS);

    // shader attribute impl
    drawElemAttrs(static_cast<const gfx::AbstDrawAttrs &>(ade));
}

void OcDisplayContext::drawElemAttrs(const gfx::AbstDrawAttrs &ada)
{
    auto *pRep = static_cast<OcBufferRep *>(ada.getVBO());
    if (pRep == NULL) {
        // Make new VBO and bind it
        pRep = MB_NEW OcBufferRep();
        pRep->create(this, ada);
        ada.setVBO(pRep);
    } else {
        pRep->bind();
        pRep->update(ada);
    }

    pRep->setAttrib(ada);
    pRep->draw(ada);
    pRep->unbind(ada);
}

OglProgramObject *OcDisplayContext::createProgramObject(const LString &name)
{
    // if (!qsys::View::hasVS()) return NULL;

    OglProgObjMgr *pMgr = OglProgObjMgr::getInstance();

    return pMgr->createProgramObject(name, this);
}

OglProgramObject *OcDisplayContext::getProgramObject(const LString &name)
{
    OglProgObjMgr *pMgr = OglProgObjMgr::getInstance();

    return pMgr->getProgramObject(name, this);
}

}  // namespace sysdep
