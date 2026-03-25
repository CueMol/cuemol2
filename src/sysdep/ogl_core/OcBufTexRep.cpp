// -*-Mode: C++;-*-
//
// OpenGL buffer texture representation (GL_TEXTURE_BUFFER)
//

#include <common.h>

#include "OcBufTexRep.hpp"
#include "OglCommon.hpp"
#include <gfx/DisplayContext.hpp>
#include <qsys/SceneManager.hpp>
#include <sysdep/OglError.hpp>

namespace sysdep {

void OcBufTexRep::init(gfx::DisplayContext *pdc)
{
    m_nViewID = pdc->getViewID();

    GLuint bufid = 0;
    glGenBuffers(1, &bufid);
    m_nBufID = bufid;
    CHK_GLERROR("OcBufTexRep::init glGenBuffers");

    GLuint texid = 0;
    glGenTextures(1, &texid);
    m_nTexID = texid;
    CHK_GLERROR("OcBufTexRep::init glGenTextures");

    MB_DPRINTLN("OcBufTexRep::init view=%d, buf=%d, tex=%d", m_nViewID, m_nBufID, m_nTexID);
}

OcBufTexRep::~OcBufTexRep()
{
    MB_DPRINTLN("OcBufTexRep::~OcBufTexRep view=%d, buf=%d, tex=%d",
                m_nViewID, m_nBufID, m_nTexID);

    if (m_nBufID == 0 && m_nTexID == 0) return;

    qsys::ViewPtr rvw = qsys::SceneManager::getViewS(m_nViewID);
    if (rvw.isnull()) {
        MB_DPRINTLN("OcBufTexRep> unknown parent view (%d), buf/tex cannot be deleted",
                    m_nViewID);
        return;
    }

    gfx::DisplayContext *pctxt = rvw->getDisplayContext();
    if (pctxt == nullptr) {
        MB_DPRINTLN("OcBufTexRep> view has no display context, buf/tex cannot be deleted");
        return;
    }

    pctxt->setCurrent();

    if (m_nTexID != 0) {
        glDeleteTextures(1, &m_nTexID);
        MB_DPRINTLN("OcBufTexRep> Texture %d deleted", m_nTexID);
    }
    if (m_nBufID != 0) {
        glDeleteBuffers(1, &m_nBufID);
        MB_DPRINTLN("OcBufTexRep> Buffer %d deleted", m_nBufID);
    }
}

void OcBufTexRep::create(size_t sz, const void *data)
{
    glBindBuffer(GL_TEXTURE_BUFFER, m_nBufID);
    CHK_GLERROR("OcBufTexRep::create glBindBuffer");

    glBufferData(GL_TEXTURE_BUFFER, sz, data, GL_DYNAMIC_DRAW);
    CHK_GLERROR("OcBufTexRep::create glBufferData");

    glBindBuffer(GL_TEXTURE_BUFFER, 0);

    // Attach buffer to texture
    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_BUFFER, m_nTexID);
    glTexBuffer(GL_TEXTURE_BUFFER, GL_R8UI, m_nBufID);
    CHK_GLERROR("OcBufTexRep::create glTexBuffer");
    glBindTexture(GL_TEXTURE_BUFFER, 0);

    MB_DPRINTLN("OcBufTexRep::create size=%zu OK", sz);
}

void OcBufTexRep::update(size_t sz, const void *data)
{
    glBindBuffer(GL_TEXTURE_BUFFER, m_nBufID);
    CHK_GLERROR("OcBufTexRep::update glBindBuffer");

    glBufferSubData(GL_TEXTURE_BUFFER, 0, sz, data);
    CHK_GLERROR("OcBufTexRep::update glBufferSubData");

    glBindBuffer(GL_TEXTURE_BUFFER, 0);
}

void OcBufTexRep::bind(int texUnit)
{
    glActiveTexture(GL_TEXTURE0 + texUnit);
    CHK_GLERROR("OcBufTexRep::bind glActiveTexture");

    glBindTexture(GL_TEXTURE_BUFFER, m_nTexID);
    CHK_GLERROR("OcBufTexRep::bind glBindTexture");

    glTexBuffer(GL_TEXTURE_BUFFER, GL_R8UI, m_nBufID);
    CHK_GLERROR("OcBufTexRep::bind glTexBuffer");
}

void OcBufTexRep::unbind()
{
    glBindTexture(GL_TEXTURE_BUFFER, 0);
}

}  // namespace sysdep
