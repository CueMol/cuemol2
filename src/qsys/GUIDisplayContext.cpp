// -*-Mode: C++;-*-
//
//  GUI display context implementation
//

#include <common.h>

#include "GUIDisplayContext.hpp"
#include "View.hpp"
#include <gfx/TextRenderManager.hpp>
#include <gfx/PixelBuffer.hpp>
#include <gfx/ShaderObject.hpp>
#include "ShaderObjMgr.hpp"

namespace qsys {

GUIDisplayContext::GUIDisplayContext() : super_t() {}

GUIDisplayContext::~GUIDisplayContext() {}

void GUIDisplayContext::setTargetView(qsys::View *pView)
{
    super_t::setTargetView(pView);
    setSceneID(pView->getSceneID());
    setViewID(pView->getUID());
}

//////////

gfx::ShaderObject *GUIDisplayContext::loadShaderObject(const LString &name,
                                                       const LString &vert_path,
                                                       const LString &frag_path)
{
    qlib::uid_t sceneID = getSceneID();
    qsys::ShaderObjMgr *pMgr = qsys::ShaderObjMgr::getInstance();

    // Check cache first
    gfx::ShaderObject *pExisting = pMgr->getShaderObject(name, sceneID);
    if (pExisting != nullptr) return pExisting;

    // Delegate compilation to the backend (OcDisplayContext)
    gfx::ShaderObject *pNew = createShaderObject(name, vert_path, frag_path);
    if (pNew == nullptr) return nullptr;

    // Register in cache
    pMgr->registerShaderObject(name, sceneID, pNew);
    return pNew;
}

void GUIDisplayContext::drawString(const Vector4D &pos, const qlib::LString &str)
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

// DisplayContext *GUIDisplayContext::createDisplayList()
// {
//     OcDisplayList *pdl = MB_NEW OcDisplayList();
//     // Targets the same view as this
//     pdl->setTargetView(getTargetView());
//     pdl->setAlpha(getAlpha());
//     pdl->setMaterial(getMaterial());
//     // pdl->setUseShaderAlpha(useShaderAlpha());
//     pdl->setPixSclFac(getPixSclFac());
//     return pdl;
// }

// void GUIDisplayContext::callDisplayList(DisplayContext *pdl)
// {
//     OcDisplayList *poc = dynamic_cast<OcDisplayList *>(pdl);
//     if (poc != NULL && poc->isValid()) {
//         poc->callDisplayListImpl(this);
//     }
// }

// bool GUIDisplayContext::isCompatibleDL(DisplayContext *pdl) const
// {
//     OcDisplayList *poc = dynamic_cast<OcDisplayList *>(pdl);
//     if (poc != NULL) {
//         return true;
//     }
//     return false;
// }

}  // namespace qsys
