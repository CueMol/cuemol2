#include <common.h>

#include "OcDisplayContext.hpp"

#include <gfx/DrawAttrArray.hpp>
#include <qsys/SceneManager.hpp>

#include "OcDisplayList.hpp"
// #include "OcView.hpp"

// #include "ProgObjMgr.hpp"
#include "OglProgObjMgr.hpp"

namespace sysdep {

using gfx::AbstDrawElem;
using gfx::DisplayContext;
using gfx::DrawElem;

OcDisplayContext::~OcDisplayContext() {}

void OcDisplayContext::setTargetView(qsys::View *pView)
{
    super_t::setTargetView(pView);
    m_nViewID = pView->getUID();
    m_nSceneID = pView->getSceneID();
}

void OcDisplayContext::startSection(const qlib::LString &section_name)
{
    m_sectionName = section_name;
}

void OcDisplayContext::endSection()
{
    m_sectionName = "";
}

bool OcDisplayContext::isFile() const
{
    return false;
}

bool OcDisplayContext::canCreateDL() const
{
    return true;
}

gfx::DisplayContext *OcDisplayContext::createDisplayList()
{
    OcDisplayList *pdl = MB_NEW OcDisplayList();

    // Targets the same view as this
    pdl->setTargetView(getTargetView());

    printf("createDisplayList OK\n");
    return pdl;
}

bool OcDisplayContext::isCompatibleDL(DisplayContext *pdl) const
{
    OcDisplayList *psrc = dynamic_cast<OcDisplayList *>(pdl);
    if (psrc == nullptr) return false;
    return true;
}

void OcDisplayContext::callDisplayList(DisplayContext *pdl)
{
    // printf("callDisplayList called\n");
    OcDisplayList *psrc = dynamic_cast<OcDisplayList *>(pdl);
    if (psrc == nullptr || !psrc->isValid()) return;

    // Lines
    auto *pLines = psrc->getLineArray();
    if (pLines != nullptr) {
        drawElem(*pLines);
    }

    // Triangles
    auto *pTrigs = psrc->getTrigArray();
    if (pTrigs != nullptr) {
        drawElem(*pTrigs);
    }

    // Trig mesh
    auto *pMesh = psrc->getTrigMesh();
    if (pMesh != nullptr) {
        drawElem(*pMesh);
    }

    // printf("callDisplayList OK\n");
}

//////////

void OcDisplayContext::vertex(const qlib::Vector4D &) {}
void OcDisplayContext::normal(const qlib::Vector4D &) {}
void OcDisplayContext::color(const gfx::ColorPtr &c) {}

void OcDisplayContext::pushMatrix()
{
    if (m_matstack.size() <= 0) {
        Matrix4D m;
        m_matstack.push_front(m);
        return;
    }
    const Matrix4D &top = m_matstack.front();
    m_matstack.push_front(top);
}
void OcDisplayContext::popMatrix()
{
    if (m_matstack.size() <= 1) {
        LString msg("POVWriter> FATAL ERROR: cannot popMatrix()!!");
        LOG_DPRINTLN(msg);
        MB_THROW(qlib::RuntimeException, msg);
        return;
    }
    m_matstack.pop_front();
}
void OcDisplayContext::multMatrix(const qlib::Matrix4D &mat)
{
    Matrix4D top = m_matstack.front();
    top.matprod(mat);
    m_matstack.front() = top;

    // check unitarity
    // checkUnitary();
}
void OcDisplayContext::loadMatrix(const qlib::Matrix4D &mat)
{
    m_matstack.front() = mat;

    // check unitarity
    // checkUnitary();
}

void OcDisplayContext::setPolygonMode(int id) {}
void OcDisplayContext::startPoints() {}
void OcDisplayContext::startPolygon() {}
void OcDisplayContext::startLines() {}
void OcDisplayContext::startLineStrip() {}
void OcDisplayContext::startTriangles() {}
void OcDisplayContext::startTriangleStrip() {}
void OcDisplayContext::startTriangleFan() {}
void OcDisplayContext::startQuadStrip() {}
void OcDisplayContext::startQuads() {}
void OcDisplayContext::end() {}

OglProgramObject *OcDisplayContext::createProgramObject(const LString &name)
{
    MB_ASSERT(qsys::View::hasVS());

    OglProgObjMgr *pMgr = OglProgObjMgr::getInstance();

    return pMgr->createProgramObject(name, this);

    // auto pMgr = OglProgObjMgr::getInstance();
    // auto ppo = pMgr->getProgramObject(name, getSceneID());
    // if (ppo != nullptr) {
    //     return ppo;
    // }
    // ppo = createProgObjImpl();
    // pMgr->registerProgramObject(name, getSceneID(), ppo);
    // return ppo;
}

OglProgramObject *OcDisplayContext::getProgramObject(const LString &name)
{
    auto pMgr = OglProgObjMgr::getInstance();
    return pMgr->getProgramObject(name, this);
    // return pMgr->getProgramObject(name, getSceneID());
}

}  // namespace sysdep
