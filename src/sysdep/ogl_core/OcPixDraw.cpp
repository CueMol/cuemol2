// -*-Mode: C++;-*-
//
// OpenGL texture representation for pixel buffer drawing
//

#include <common.h>

#include "OcPixDraw.hpp"
#include "OglCommon.hpp"
#include <qsys/SceneManager.hpp>
#include <sysdep/OglError.hpp>

namespace sysdep {

void OcTexRep::create(gfx::DisplayContext *pdc, const gfx::PixelBuffer &pixbuf)
{
    GLuint texid = 0;
    glGenTextures(1, &texid);
    m_nBufID = texid;
    m_nViewID = pdc->getViewID();

    const int ow = pixbuf.getWidth();
    const int oh = pixbuf.getHeight();

    glActiveTexture(GL_TEXTURE0);
    CHK_GLERROR("glActiveTexture");
    glBindTexture(GL_TEXTURE_2D, texid);
    CHK_GLERROR("glBindTexture");
    // PixelBuffer rows are tightly packed; the default GL_UNPACK_ALIGNMENT
    // of 4 made GL read past the buffer for widths that are not a multiple
    // of 4
    GLint prevAlign = 4;
    glGetIntegerv(GL_UNPACK_ALIGNMENT, &prevAlign);
    glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RED, ow, oh, 0, GL_RED, GL_UNSIGNED_BYTE,
                 pixbuf.data());
    CHK_GLERROR("glTexImage2D");
    glPixelStorei(GL_UNPACK_ALIGNMENT, prevAlign);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
    glBindTexture(GL_TEXTURE_2D, 0);

    MB_DPRINTLN("create texture (%d, %d) OK.", ow, oh);
}

OcTexRep::~OcTexRep()
{
    MB_DPRINTLN("OcTexRep::~OcTexRep view=%d, tex=%d", (int)m_nViewID, m_nBufID);

    qsys::ViewPtr rvw = qsys::SceneManager::getViewS(m_nViewID);
    if (rvw.isnull()) {
        MB_DPRINTLN("OcTexRep> unknown parent view (%d), Texture %d cannot be deleted",
                    (int)m_nViewID, m_nBufID);
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

void OcTexRep::bind(int texUnit)
{
    glActiveTexture(GL_TEXTURE0 + texUnit);
    CHK_GLERROR("glActiveTexture");
    glBindTexture(GL_TEXTURE_2D, m_nBufID);
    CHK_GLERROR("glBindTexture");
}

void OcTexRep::unbind()
{
    glBindTexture(GL_TEXTURE_2D, 0);
}

}  // namespace sysdep
