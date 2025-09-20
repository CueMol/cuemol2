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
    pdl->setAlpha(getAlpha());
    pdl->setMaterial(getMaterial());
    pdl->setPixSclFac(getPixSclFac());

    MB_DPRINTLN("createDisplayList OK");
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
    OcDisplayList *poc = dynamic_cast<OcDisplayList *>(pdl);
    if (poc != NULL && poc->isValid()) {
        poc->callDisplayListImpl(this);
    }

    LString msg(
        "OcDisplayContext::callDisplayList: FATAL ERROR: Incompatible DL type!!");
    LOG_DPRINTLN(msg);
    MB_THROW(qlib::RuntimeException, msg);
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

void OcDisplayContext::setMaterImpl(const LString &name)
{
    // if (m_curMater.equals(name)) return;
    // m_curMater = name;

    // qsys::StyleMgr *pSM = qsys::StyleMgr::getInstance();
    // double dvalue;

    // // Default Material: (defined in OglView; plastic-like shading)
    // //  Ambient = 0.2 (*(1,1,1))
    // //  Diffuse = 0.8
    // //  Specular = 0.4
    // double amb = 0.2, diff = 0.8, spec = 0.4;
    // double shin = 32.0;

    // dvalue = pSM->getMaterial(name, gfx::Material::MAT_AMBIENT);
    // if (dvalue >= -0.1) {
    //     amb = dvalue;
    // }

    // dvalue = pSM->getMaterial(name, gfx::Material::MAT_DIFFUSE);
    // if (dvalue >= -0.1) {
    //     diff = dvalue;
    // }

    // dvalue = pSM->getMaterial(name, gfx::Material::MAT_SPECULAR);
    // if (dvalue >= -0.1) {
    //     spec = dvalue;
    // }

    // dvalue = pSM->getMaterial(name, gfx::Material::MAT_SHININESS);
    // if (dvalue >= -0.1) {
    //     shin = dvalue;
    // }

    // GLfloat tmpv[4] = {0.0, 0.0, 0.0, 1.0};

    // tmpv[0] = tmpv[1] = tmpv[2] = float(amb);
    // glLightfv(GL_LIGHT0, GL_AMBIENT, tmpv);

    // tmpv[0] = tmpv[1] = tmpv[2] = float(diff);
    // glLightfv(GL_LIGHT0, GL_DIFFUSE, tmpv);

    // tmpv[0] = tmpv[1] = tmpv[2] = float(spec);
    // glLightfv(GL_LIGHT0, GL_SPECULAR, tmpv);

    // glMaterialf(GL_FRONT_AND_BACK, GL_SHININESS, float(shin));

    // LOG_DPRINTLN("OglSetMaterial %s a=%f,d=%f,s=%f,sh=%f",
    // name.c_str(), amb, diff, spec, shin);
}

}  // namespace sysdep
