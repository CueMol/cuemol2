// -*-Mode: C++;-*-
//
//  OpenGL display context implementation
//

#include <common.h>
#include "OglCommon.hpp"

#include "OcDisplayContext.hpp"
#include "OcDisplayList.hpp"
#include "OglProgramObject.hpp"
#include "OglProgObjMgr.hpp"
#include "OcPixDraw.hpp"
#include "OcBufferRep.hpp"
#include "OcDrawObjSet.hpp"

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

#include <sysdep/ShaderSetupHelper.hpp>

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

//////////

/*
class OcDrawObjElems3D : public gfx::DrawObjElems3D
{
private:
    bool m_bInitialized;

    quint32 m_nVertexLoc;
    quint32 m_nColorLoc;

    OglProgramObject *m_pPO;

public:
    OcDrawObjElems3D() : gfx::DrawObjElems3D(), m_bInitialized(false) {}
    virtual ~OcDrawObjElems3D() {}

    bool initShader(gfx::DisplayContext *pdc)
    {
        if (m_bInitialized) return true;

        MB_ASSERT(m_pPO == NULL);
        ShaderSetupHelper ssh(pdc);

        m_pPO = ssh.createProgObj("drawobj3d",
                                  "%%CONFDIR%%/data/shaders/drawobj3d_vert.glsl",
                                  "%%CONFDIR%%/data/shaders/drawobj3d_frag.glsl");

        if (m_pPO == NULL) {
            LOG_DPRINTLN("OcPixdraw> ERROR: cannot create progobj.");
            return false;
        }

        // setup attributes
        m_nVertexLoc = m_pPO->getAttribLocation("aVertex");
        m_nColorLoc = m_pPO->getAttribLocation("aColor");

        setAttrSize(2);
        setAttrInfo(0, m_nVertexLoc, 3, qlib::type_consts::QTC_FLOAT32,
                    offsetof(elem_t, x));
        setAttrInfo(1, m_nColorLoc, 4, qlib::type_consts::QTC_UINT8,
                    offsetof(elem_t, r));

        setDrawMode(DRAW_LINES);
        m_bInitialized = true;
        return true;
    }

    void draw(gfx::DisplayContext *pdc)
    {
        MB_ASSERT(m_bInitialized);
        MB_ASSERT(m_pPO != NULL);

        m_pPO->use();

        // set uniforms if any
        // m_pPO->setupMat(pdc);
        Matrix4D mv_mat = pdc->getModelViewMat();
        auto pView = pdc->getTargetView();
        const auto vc = pView->getViewCenter();
        mv_mat.translate(vc);
        // mv_mat.translate(Vector4D(0, 0, -50));
        m_pPO->setMatrix("u_ModelViewMatrix", mv_mat);

        const double cx = pView->getWidth();
        const double cy = pView->getHeight();
        const double fasp = cx / cy;
        const double vw = cy / 2.0;
        const double slabnear = 150;
        const double slabfar = 250;
        MB_DPRINTLN("OcDrawObjElems3D::draw> cx=%f, cy=%f", cx, cy);

        const auto proj_mat =
            DisplayContext::makeOrthoProjMat(vw, fasp, slabnear, slabfar);
        m_pPO->setMatrix("u_ProjectionMatrix", proj_mat);

        // draw call
        pdc->drawElem(*this);

        m_pPO->disable();
    }
};
*/

gfx::DrawObjSet *OcDisplayContext::createDrawObjSet() const
{
    return MB_NEW OcDrawObjSet();
}

void OcDisplayContext::drawObjSet(const gfx::DrawObjSet &dos)
{
    const OcDrawObjSet &ocdos = dynamic_cast<const OcDrawObjSet &>(dos);
    ocdos.draw(this);

    /*
    const OcDrawObjElems3D &ocattr = dynamic_cast<const OcDrawObjElems3D &>(attr);

    OcDrawObjElems3D *pocattr = const_cast<OcDrawObjElems3D *>(&ocattr);
    if (!pocattr->initShader(this)) {
        LOG_DPRINTLN("OcDisplayContext::drawObjElems3D> shader init failed");
        return;
    }

    glEnable(GL_BLEND);
    // glBlendFunc(GL_ONE_MINUS_DST_COLOR, GL_ZERO);
    glBlendFunc(GL_ONE_MINUS_DST_COLOR, GL_ONE_MINUS_SRC_COLOR);

    pocattr->draw(this);

    glDisable(GL_BLEND);
    */
}

}  // namespace sysdep
