// -*-Mode: C++;-*-
//
//  OpenGL display context implementation
//

#include <common.h>
#include "OglCommon.hpp"

#include "OcDisplayContext.hpp"
#include "OcPixDraw.hpp"
#include "OcBufferRep.hpp"

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

void OcDisplayContext::setFrontFace(bool bCCW)
{
    glFrontFace(bCCW ? GL_CCW : GL_CW);
}

void OcDisplayContext::setCullFace(bool f /*=true*/)
{
    if (f)
        glEnable(GL_CULL_FACE);
    else
        glDisable(GL_CULL_FACE);
}

void OcDisplayContext::setInvertColorBlend(bool bInv)
{
    if (bInv) {
        glEnable(GL_BLEND);
        glBlendFunc(GL_ONE_MINUS_DST_COLOR, GL_ZERO);
    } else {
        glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
    }
}

void OcDisplayContext::clearBuffer(const gfx::ColorPtr &pcol)
{
    glClearColor(float(pcol->fr()), float(pcol->fg()), float(pcol->fb()), 1.0f);
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
}

gfx::VBORep *OcDisplayContext::createVBORep(const gfx::AbstDrawAttrs &ada)
{
    OcBufferRep *pRep = MB_NEW OcBufferRep();
    pRep->create(this, ada);
    return pRep;
}

gfx::PixRep *OcDisplayContext::createPixRep(const gfx::PixelBuffer &pixbuf)
{
    OcTexRep *pRep = MB_NEW OcTexRep();
    pRep->create(this, pixbuf);
    return pRep;
}

gfx::BufTexRep *OcDisplayContext::createBufTexRep()
{
    OcBufTexRep *p = MB_NEW OcBufTexRep();
    p->init(this);
    return p;
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

}  // namespace sysdep
