// -*-Mode: C++;-*-
//
//  OpenGL off-screen render target (framebuffer object)
//

#include <common.h>

#include "OcRenderTarget.hpp"
#include "OglCommon.hpp"

#include <gfx/DisplayContext.hpp>
#include <qsys/SceneManager.hpp>
#include <sysdep/OglError.hpp>

namespace sysdep {

OcRenderTarget::OcRenderTarget()
    : m_nViewID(0),
      m_nFBO(0),
      m_nColorTex(0),
      m_nDepthTex(0),
      m_nNormalTex(0),
      m_nWidth(0),
      m_nHeight(0),
      m_nFlags(0)
{
    m_savedVp[0] = m_savedVp[1] = m_savedVp[2] = m_savedVp[3] = 0;
}

bool OcRenderTarget::init(gfx::DisplayContext *pdc, int w, int h, int flags)
{
    m_nViewID = pdc->getViewID();
    m_nWidth = w;
    m_nHeight = h;
    m_nFlags = flags;

    GLuint fbo = 0;
    glGenFramebuffers(1, &fbo);
    m_nFBO = fbo;

    GLuint tex = 0;
    glGenTextures(1, &tex);
    m_nColorTex = tex;

    if (m_nFlags & gfx::RT_DEPTH_TEX) {
        tex = 0;
        glGenTextures(1, &tex);
        m_nDepthTex = tex;
    }

    if (m_nFlags & gfx::RT_NORMAL_RGB16F) {
        tex = 0;
        glGenTextures(1, &tex);
        m_nNormalTex = tex;
    }
    CHK_GLERROR("OcRenderTarget::init gen");

    allocAttachments(w, h);

    glBindFramebuffer(GL_FRAMEBUFFER, m_nFBO);

    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D,
                           m_nColorTex, 0);
    if (m_nDepthTex != 0) {
        glFramebufferTexture2D(GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT, GL_TEXTURE_2D,
                               m_nDepthTex, 0);
    }

    if (m_nNormalTex != 0) {
        glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT1, GL_TEXTURE_2D,
                               m_nNormalTex, 0);
        GLenum bufs[2] = {GL_COLOR_ATTACHMENT0, GL_COLOR_ATTACHMENT1};
        glDrawBuffers(2, bufs);
    } else {
        GLenum bufs[1] = {GL_COLOR_ATTACHMENT0};
        glDrawBuffers(1, bufs);
    }
    CHK_GLERROR("OcRenderTarget::init attach");

    GLenum status = glCheckFramebufferStatus(GL_FRAMEBUFFER);
    glBindFramebuffer(GL_FRAMEBUFFER, 0);

    if (status != GL_FRAMEBUFFER_COMPLETE) {
        LOG_DPRINTLN("OcRenderTarget> FBO incomplete: 0x%x (%dx%d)", status, w, h);
        return false;
    }

    MB_DPRINTLN("OcRenderTarget::init view=%d fbo=%d color=%d depth=%d normal=%d (%dx%d) OK",
                m_nViewID, m_nFBO, m_nColorTex, m_nDepthTex, m_nNormalTex, w, h);
    return true;
}

void OcRenderTarget::allocAttachments(int w, int h)
{
    // Color attachment 0 (RGBA8)
    glBindTexture(GL_TEXTURE_2D, m_nColorTex);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, w, h, 0, GL_RGBA, GL_UNSIGNED_BYTE,
                 nullptr);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);

    // Depth attachment (sampleable DEPTH_COMPONENT24)
    if (m_nDepthTex != 0) {
        glBindTexture(GL_TEXTURE_2D, m_nDepthTex);
        glTexImage2D(GL_TEXTURE_2D, 0, GL_DEPTH_COMPONENT24, w, h, 0,
                     GL_DEPTH_COMPONENT, GL_UNSIGNED_INT, nullptr);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    }

    // Optional MRT normal attachment 1 (RGB16F)
    if (m_nNormalTex != 0) {
        glBindTexture(GL_TEXTURE_2D, m_nNormalTex);
        glTexImage2D(GL_TEXTURE_2D, 0, GL_RGB16F, w, h, 0, GL_RGB, GL_FLOAT, nullptr);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    }

    glBindTexture(GL_TEXTURE_2D, 0);
    CHK_GLERROR("OcRenderTarget::allocAttachments");
}

OcRenderTarget::~OcRenderTarget()
{
    if (m_nFBO == 0) return;

    qsys::ViewPtr rvw = qsys::SceneManager::getViewS(m_nViewID);
    if (rvw.isnull()) {
        MB_DPRINTLN("OcRenderTarget> unknown parent view (%d), FBO cannot be deleted",
                    m_nViewID);
        return;
    }
    gfx::DisplayContext *pctxt = rvw->getDisplayContext();
    if (pctxt == nullptr) {
        MB_DPRINTLN("OcRenderTarget> view has no display context, FBO cannot be deleted");
        return;
    }
    pctxt->setCurrent();

    if (m_nColorTex != 0) glDeleteTextures(1, &m_nColorTex);
    if (m_nDepthTex != 0) glDeleteTextures(1, &m_nDepthTex);
    if (m_nNormalTex != 0) glDeleteTextures(1, &m_nNormalTex);
    glDeleteFramebuffers(1, &m_nFBO);

    MB_DPRINTLN("OcRenderTarget> fbo=%d deleted", m_nFBO);
}

void OcRenderTarget::bind()
{
    glGetIntegerv(GL_VIEWPORT, m_savedVp);
    glBindFramebuffer(GL_FRAMEBUFFER, m_nFBO);
    glViewport(0, 0, m_nWidth, m_nHeight);
    CHK_GLERROR("OcRenderTarget::bind");
}

void OcRenderTarget::unbind()
{
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
    glViewport(m_savedVp[0], m_savedVp[1], m_savedVp[2], m_savedVp[3]);
}

void OcRenderTarget::clear(float r, float g, float b, float a)
{
    glClearColor(r, g, b, a);
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
}

void OcRenderTarget::resize(int w, int h)
{
    if (w == m_nWidth && h == m_nHeight) return;
    m_nWidth = w;
    m_nHeight = h;
    allocAttachments(w, h);
}

void OcRenderTarget::bindColorTex(int idx, int texUnit)
{
    GLuint tex = (idx == 1 && m_nNormalTex != 0) ? m_nNormalTex : m_nColorTex;
    glActiveTexture(GL_TEXTURE0 + texUnit);
    glBindTexture(GL_TEXTURE_2D, tex);
}

void OcRenderTarget::bindDepthTex(int texUnit)
{
    glActiveTexture(GL_TEXTURE0 + texUnit);
    glBindTexture(GL_TEXTURE_2D, m_nDepthTex);
}

void OcRenderTarget::unbindTextures()
{
    glBindTexture(GL_TEXTURE_2D, 0);
}

void OcRenderTarget::readColor(int idx, int x, int y, int w, int h, int ncomp,
                               void *pbuf)
{
    GLenum fmt = (ncomp == 4) ? GL_RGBA : GL_RGB;
    glBindFramebuffer(GL_READ_FRAMEBUFFER, m_nFBO);
    glReadBuffer(GL_COLOR_ATTACHMENT0 + idx);
    glReadPixels(x, y, w, h, fmt, GL_UNSIGNED_BYTE, pbuf);
    glBindFramebuffer(GL_READ_FRAMEBUFFER, 0);
    CHK_GLERROR("OcRenderTarget::readColor");
}

void OcRenderTarget::blitDepthToDefault()
{
    // Copy the off-screen depth attachment into the default framebuffer so that
    // UI overlays drawn afterwards depth-test against the scene as usual. The
    // blit requires compatible depth formats (DEPTH_COMPONENT24 vs the window
    // depth buffer); a mismatch is logged and degrades only overlay occlusion.
    glBindFramebuffer(GL_READ_FRAMEBUFFER, m_nFBO);
    glBindFramebuffer(GL_DRAW_FRAMEBUFFER, 0);
    glBlitFramebuffer(0, 0, m_nWidth, m_nHeight, 0, 0, m_nWidth, m_nHeight,
                      GL_DEPTH_BUFFER_BIT, GL_NEAREST);
    glBindFramebuffer(GL_READ_FRAMEBUFFER, 0);
    glBindFramebuffer(GL_DRAW_FRAMEBUFFER, 0);
    CHK_GLERROR("OcRenderTarget::blitDepthToDefault");
}

}  // namespace sysdep
