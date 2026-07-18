// -*-Mode: C++;-*-
//
//  OpenGL immutable data texture (CPU bytes -> sampler2D)
//

#include <common.h>

#include "OcDataTexture.hpp"
#include "OglCommon.hpp"

#include <gfx/DisplayContext.hpp>
#include <qsys/SceneManager.hpp>
#include <sysdep/OglError.hpp>

namespace sysdep {

OcDataTexture::OcDataTexture()
    : m_nViewID(0), m_nTex(0), m_nWidth(0), m_nHeight(0)
{
}

bool OcDataTexture::init(gfx::DisplayContext *pdc, int w, int h, int ncomp,
                         bool linear, const void *data)
{
    m_nViewID = pdc->getViewID();
    m_nWidth = w;
    m_nHeight = h;

    // R8 (ncomp 1) or RG8 (ncomp 2). SMAA AreaTex is RG, SearchTex is R.
    GLint internalFmt;
    GLenum fmt;
    if (ncomp == 2) {
        internalFmt = GL_RG8;
        fmt = GL_RG;
    } else {
        internalFmt = GL_R8;
        fmt = GL_RED;
    }

    GLuint tex = 0;
    glGenTextures(1, &tex);
    m_nTex = tex;

    glBindTexture(GL_TEXTURE_2D, m_nTex);
    // Tightly packed CPU data (no row alignment padding).
    glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
    glTexImage2D(GL_TEXTURE_2D, 0, internalFmt, w, h, 0, fmt, GL_UNSIGNED_BYTE, data);
    const GLint filt = linear ? GL_LINEAR : GL_NEAREST;
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, filt);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, filt);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    glBindTexture(GL_TEXTURE_2D, 0);

    if (glGetError() != GL_NO_ERROR) {
        LOG_DPRINTLN("OcDataTexture> upload failed (%dx%d ncomp=%d)", w, h, ncomp);
        return false;
    }

    MB_DPRINTLN("OcDataTexture::init view=%d tex=%d (%dx%d ncomp=%d) OK", (int)m_nViewID,
                m_nTex, w, h, ncomp);
    return true;
}

OcDataTexture::~OcDataTexture()
{
    if (m_nTex == 0) return;

    // Guard the GL context ourselves (mirrors OcRenderTarget): the destructor
    // can run after the owning view's display context teardown began, so look
    // the context up by view ID instead of calling getDisplayContext().
    qsys::ViewPtr rvw = qsys::SceneManager::getViewS(m_nViewID);
    if (rvw.isnull()) {
        MB_DPRINTLN("OcDataTexture> unknown parent view (%d), tex cannot be deleted",
                    (int)m_nViewID);
        return;
    }
    gfx::DisplayContext *pctxt = rvw->getDisplayContext();
    if (pctxt == nullptr) {
        MB_DPRINTLN("OcDataTexture> view has no display context, tex cannot be deleted");
        return;
    }
    pctxt->setCurrent();

    glDeleteTextures(1, &m_nTex);
    MB_DPRINTLN("OcDataTexture> tex=%d deleted", m_nTex);
}

void OcDataTexture::bind(int texUnit)
{
    glActiveTexture(GL_TEXTURE0 + texUnit);
    glBindTexture(GL_TEXTURE_2D, m_nTex);
}

void OcDataTexture::unbind()
{
    glBindTexture(GL_TEXTURE_2D, 0);
}

}  // namespace sysdep
