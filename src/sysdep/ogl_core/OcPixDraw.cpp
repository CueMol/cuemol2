// -*-Mode: C++;-*-
//
// OpenGL core profile display list emulation
//

#include <common.h>

#include "OcPixDraw.hpp"
#include <qsys/SceneManager.hpp>
#include <sysdep/OglProgramObject.hpp>
#include <sysdep/ShaderSetupHelper.hpp>

namespace sysdep {

void OcTexRep::create(gfx::DisplayContext *pdc, const gfx::PixelBuffer &pixbuf)
{
    GLuint texid = 0;
    // create texture
    glGenTextures(1, &texid);
    m_nBufID = texid;
    m_nViewID = pdc->getViewID();

    const int ow = pixbuf.getWidth();
    const int oh = pixbuf.getHeight();
    MB_DPRINTLN("OcTexRep::create tex=%d (%d x %d)", m_nBufID, ow, oh);

    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, texid);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_ALPHA, ow, oh, 0, GL_ALPHA, GL_UNSIGNED_BYTE,
                 pixbuf.data());
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
    glBindTexture(GL_TEXTURE_2D, 0);
}

OcTexRep::~OcTexRep()
{
    MB_DPRINTLN("OcTexRep::~OcTexRep view=%d, tex=%d", m_nViewID, m_nBufID);

    qsys::ViewPtr rvw = qsys::SceneManager::getViewS(m_nViewID);
    if (rvw.isnull()) {
        MB_DPRINTLN("OcTexRep> unknown parent view (%d), Texture %d cannot be deleted",
                    m_nViewID, m_nBufID);
        return;
    }

    gfx::DisplayContext *pctxt = rvw->getDisplayContext();
    if (pctxt == nullptr) {
        MB_DPRINTLN("OcTexRep> view has no display context, Texture %d cannot be deleted",
                    m_nBufID);
        return;
    }

    pctxt->setCurrent();
    glDeleteTextures(1, &m_nBufID);
    MB_DPRINTLN("OcTexRep> Texture %d deleted", m_nBufID);
}

//////////

bool OcPixDraw::initShader(gfx::DisplayContext *pdc)
{
    if (m_bInitialized) return true;

    MB_ASSERT(m_pPO == NULL);
    ShaderSetupHelper ssh(pdc);

    if (!ssh.checkEnvVS()) {
        MB_DPRINTLN("GLShader not supported");
        return false;
    }

    if (m_pPO == NULL)
        m_pPO =
            ssh.createProgObj("pixdraw", "%%CONFDIR%%/data/shaders/pixdraw_vert.glsl",
                              "%%CONFDIR%%/data/shaders/pixdraw_frag.glsl");

    if (m_pPO == NULL) {
        LOG_DPRINTLN("OcPixdraw> ERROR: cannot create progobj.");
        return false;
    }

    // setup attributes
    m_nVertexLoc = m_pPO->getAttribLocation("a_vertex");
    m_nTexCoordLoc = m_pPO->getAttribLocation("a_texCoord");

    alloc();

    m_bInitialized = true;
    return true;
}

void OcPixDraw::setupAttrs()
{
    MB_ASSERT(m_pDrawAry != NULL);
    QuadArray &data = *m_pDrawAry;

    if (data.getAttrSize() > 0) {
        // already setup
        return;
    }

    data.setAttrSize(2);
    data.setAttrInfo(0, m_nVertexLoc, 2, qlib::type_consts::QTC_FLOAT32,
                     offsetof(Elem, x));
    data.setAttrInfo(1, m_nTexCoordLoc, 2, qlib::type_consts::QTC_FLOAT32,
                     offsetof(Elem, tx));
}

void OcPixDraw::alloc()
{
    int nverts = 4;
    m_pDrawAry = MB_NEW QuadArray();
    QuadArray &data = *m_pDrawAry;

    data.alloc(nverts);
    data.setDrawMode(gfx::AbstDrawElem::DRAW_TRIANGLE_STRIP);

    // assign data
    data.at(0) = {
        0.0f, 1.0f, 0.0f, 1.0f,  // Top-left
    };
    data.at(1) = {
        1.0f, 1.0f, 1.0f, 1.0f,  // Top-right
    };
    data.at(2) = {
        0.0f, 0.0f, 0.0f, 0.0f,  // Bottom-left
    };
    data.at(3) = {
        1.0f, 0.0f, 1.0f, 0.0f  // Bottom-right
    };
}

bool OcPixDraw::createDrawElem(gfx::DisplayContext *pdc,const gfx::PixelBuffer &pixbuf)
{
    if (!m_bInitialized) {
        LOG_DPRINTLN("OcPixdraw> ERROR: not initialized.");
        return false;
    }

    OcTexRep *pRep = static_cast<OcTexRep *>(pixbuf.getRep());
    if (pRep != nullptr) {
        return true;
    }

    pRep = MB_NEW OcTexRep();
    pRep->create(pdc, pixbuf);
    pixbuf.setRep(pRep);

    return true;
}

void OcPixDraw::draw(gfx::DisplayContext *pdc, const Vector4D &pos,
                     const gfx::PixelBuffer &pixbuf, const gfx::ColorPtr &pcol)
{
    MB_ASSERT(m_bInitialized);

    if (m_pDrawAry == NULL) {
        return;
    }

    OcTexRep *pRep = static_cast<OcTexRep *>(pixbuf.getRep());
    if (pRep == nullptr) {
        MB_DPRINTLN("OcPixDraw> texture rep is null");
        return;
    }

    auto pView = pdc->getTargetView();
    if (pView == nullptr) {
        MB_DPRINTLN("GLSLLine> ERROR: no target view");
        return;
    }

    const int w = pixbuf.getWidth();
    const int h = pixbuf.getHeight();

    float r = 1.0, g = 1.0, b = 1.0;
    pdc->getDevRGBColor(pcol, r, g, b);

    float view_w = pView->getWidth();
    float view_h = pView->getHeight();

    setupAttrs();

    m_pPO->enable();
    m_pPO->setupFog(pdc);
    m_pPO->setUniformF("frag_alpha", pdc->getAlpha());
    m_pPO->setUniformF("u_position", pos.x(), pos.y(), pos.z());
    m_pPO->setUniformF("u_size", w, h);
    m_pPO->setUniformF("u_viewportSize", view_w, view_h);
    m_pPO->setUniformF("u_colorBias", r, g, b);
    m_pPO->setUniformF("u_texture", 0);

    // Bind texture
    auto texid = pRep->m_nBufID;
    glEnable(GL_TEXTURE_2D);
    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, texid);

    pdc->drawElem(*m_pDrawAry);

    glBindTexture(GL_TEXTURE_2D, 0);
    glDisable(GL_TEXTURE_2D);
    m_pPO->disable();
}

void OcPixDraw::invalidate()
{
    if (m_pDrawAry != NULL) {
        delete m_pDrawAry;
        m_pDrawAry = NULL;
        MB_DPRINTLN("OcPixdraw> deleted draw array");
    }
}

}  // namespace sysdep
