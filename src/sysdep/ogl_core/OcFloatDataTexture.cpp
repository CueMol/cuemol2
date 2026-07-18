// -*-Mode: C++;-*-
//
//  OpenGL mutable float data texture (CPU floats -> sampler2D)
//

#include <common.h>

#include "OcFloatDataTexture.hpp"
#include "OglCommon.hpp"

#include <gfx/DisplayContext.hpp>
#include <qsys/SceneManager.hpp>
#include <sysdep/OglError.hpp>

namespace sysdep {

OcFloatDataTexture::OcFloatDataTexture(gfx::DisplayContext *pdc)
    : m_pdc(pdc), m_nViewID(0), m_nTex(0), m_nWidth(0), m_nHeight(0), m_nComp(0)
{
}

bool OcFloatDataTexture::create(int w, int h, int ncomp)
{
    // Only RGB (3 floats/texel) is supported in phase 1.
    if (ncomp != 3) {
        LOG_DPRINTLN("OcFloatDataTexture> unsupported ncomp=%d", ncomp);
        return false;
    }

    if (m_pdc != nullptr)
        m_nViewID = m_pdc->getViewID();
    m_nWidth = w;
    m_nHeight = h;
    m_nComp = ncomp;

    GLuint tex = 0;
    glGenTextures(1, &tex);
    m_nTex = tex;

    glBindTexture(GL_TEXTURE_2D, m_nTex);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGB32F, w, h, 0, GL_RGB, GL_FLOAT, nullptr);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    glBindTexture(GL_TEXTURE_2D, 0);

    if (glGetError() != GL_NO_ERROR) {
        LOG_DPRINTLN("OcFloatDataTexture> alloc failed (%dx%d ncomp=%d)", w, h, ncomp);
        return false;
    }

    MB_DPRINTLN("OcFloatDataTexture::create view=%d tex=%d (%dx%d ncomp=%d) OK",
                (int)m_nViewID, m_nTex, w, h, ncomp);
    return true;
}

void OcFloatDataTexture::update(const void *data)
{
    if (m_nTex == 0) return;
    glBindTexture(GL_TEXTURE_2D, m_nTex);
    glTexSubImage2D(GL_TEXTURE_2D, 0, 0, 0, m_nWidth, m_nHeight, GL_RGB, GL_FLOAT,
                    data);
    glBindTexture(GL_TEXTURE_2D, 0);
}

OcFloatDataTexture::~OcFloatDataTexture()
{
    if (m_nTex == 0) return;

    // Guard the GL context ourselves (mirrors OcDataTexture): the destructor
    // can run after the owning view's display context teardown began, so look
    // the context up by view ID instead of calling getDisplayContext().
    qsys::ViewPtr rvw = qsys::SceneManager::getViewS(m_nViewID);
    if (rvw.isnull()) {
        MB_DPRINTLN("OcFloatDataTexture> unknown parent view (%d), tex cannot be deleted",
                    (int)m_nViewID);
        return;
    }
    gfx::DisplayContext *pctxt = rvw->getDisplayContext();
    if (pctxt == nullptr) {
        MB_DPRINTLN("OcFloatDataTexture> view has no display context, tex cannot be deleted");
        return;
    }
    pctxt->setCurrent();

    glDeleteTextures(1, &m_nTex);
    MB_DPRINTLN("OcFloatDataTexture> tex=%d deleted", m_nTex);
}

void OcFloatDataTexture::bind(int texUnit)
{
    glActiveTexture(GL_TEXTURE0 + texUnit);
    glBindTexture(GL_TEXTURE_2D, m_nTex);
}

void OcFloatDataTexture::unbind()
{
    glBindTexture(GL_TEXTURE_2D, 0);
}

}  // namespace sysdep
