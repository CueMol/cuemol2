// -*-Mode: C++;-*-
//
//  OpenGL display context implementation
//

#include <common.h>
#include "OglCommon.hpp"

#include "OcDisplayContext.hpp"
#include "OcPixDraw.hpp"
#include <gfx/PixDrawObj2.hpp>
#include "OcBufferRep.hpp"
#include "OcDrawObjSet.hpp"

#include <sysdep/OglProgramObject.hpp>

#include <gfx/PixelBuffer.hpp>
#include "OcBufTexRep.hpp"
#include <gfx/SolidColor.hpp>
#include <gfx/Mesh.hpp>
#include <gfx/DrawAttrArray.hpp>
#include <gfx/ColProfMgr.hpp>

#include <sysdep/OglError.hpp>

namespace sysdep {

using gfx::AbstDrawElem;
using gfx::DisplayContext;

OcDisplayContext::OcDisplayContext() : super_t()
{
    m_pPixDrawObj = nullptr;
}

OcDisplayContext::~OcDisplayContext() {}

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
    if (m_pPixDrawObj == nullptr) {
        m_pPixDrawObj = MB_NEW gfx::PixDrawObj2();
        m_pPixDrawObj->init(this);
    }

    // Create OcTexRep if not yet set on this PixelBuffer (GL-specific, stays here)
    OcTexRep *pRep = static_cast<OcTexRep *>(data.getRep());
    if (pRep == nullptr) {
        pRep = MB_NEW OcTexRep();
        pRep->create(this, data);
        data.setRep(pRep);
    }

    gfx::ColorPtr col = acol;
    if (acol.isnull()) {
        // use current color
        col = super_t::getColor();
    }

    m_pPixDrawObj->draw(this, pos, data, col);
}

void OcDisplayContext::drawElem(const AbstDrawElem &ade)
{
    const int ntype = ade.getType();
    MB_ASSERT(ntype == AbstDrawElem::VA_ATTRS || ntype == AbstDrawElem::VA_ATTR_INDS);

    const gfx::AbstDrawAttrs &ada = static_cast<const gfx::AbstDrawAttrs &>(ade);

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

//////////

gfx::DrawObjSet *OcDisplayContext::createDrawObjSet() const
{
    return MB_NEW OcDrawObjSet();
}

void OcDisplayContext::drawObjSet(const gfx::DrawObjSet &dos)
{
    const OcDrawObjSet &ocdos = dynamic_cast<const OcDrawObjSet &>(dos);
    ocdos.draw(this);
}

//////////

void OcDisplayContext::clearBuffer(const gfx::ColorPtr &pcol)
{
    glClearColor(float(pcol->fr()), float(pcol->fg()), float(pcol->fb()), 1.0f);
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
}

//////////

gfx::ShaderObject *OcDisplayContext::createShaderObject(const LString &name,
                                                        const LString &vert_path,
                                                        const LString &frag_path)
{
    OglProgramObject *pPO = new OglProgramObject();
    if (!pPO->init()) {
        LOG_DPRINTLN("OcDisplayContext> ERROR: cannot initialize OglProgramObject <%s>.",
                     name.c_str());
        delete pPO;
        return nullptr;
    }

    try {
        pPO->loadShader("vert", vert_path, GL_VERTEX_SHADER);
        pPO->loadShader("frag", frag_path, GL_FRAGMENT_SHADER);
        pPO->link();
    } catch (...) {
        LOG_DPRINTLN("OcDisplayContext> FATAL ERROR: loadShader(%s) failed!!", name.c_str());
        delete pPO;
        return nullptr;
    }

    return pPO;
}

void OcDisplayContext::setFrontFace(bool bCCW)
{
    glFrontFace(bCCW ? GL_CCW : GL_CW);
}

gfx::BufTexRep *OcDisplayContext::createBufTexRep()
{
    OcBufTexRep *p = MB_NEW OcBufTexRep();
    p->init(this);
    return p;
}

}  // namespace sysdep
