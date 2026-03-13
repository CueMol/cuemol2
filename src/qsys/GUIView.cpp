// -*-Mode: C++;-*-
//
// View: Generic Molecule View Class
//
// $Id: View.cpp,v 1.48 2011/03/13 12:02:45 rishitani Exp $
//

#include <common.h>
#include "GUIView.hpp"

#include <gfx/HittestContext.hpp>
#include "SceneManager.hpp"
#include "Renderer.hpp"
#include "ViewInputConfig.hpp"

namespace qsys {

GUIView::GUIView() : View() {}
GUIView::~GUIView() {}

using gfx::HittestContext;

LString GUIView::hitTest(int ax, int ay)
{
    m_hitdata.clear();

    int x = convToBackingX(ax);
    int y = convToBackingY(ay);

    // HittestContext *phc = MB_NEW HittestContext();
    HittestContext hc;

    double dHitPrec =
        convToBackingX(qsys::ViewInputConfig::getInstance()->getHitPrec());

    // Perform hittest (single hit)
    if (!hitTestImpl(&hc, Vector4D(x, y, dHitPrec, dHitPrec), false, 1.0))
        return LString();

    m_hitdata.createNearest(&hc);

    qlib::uid_t rend_id = m_hitdata.getNearestRendID();
    if (rend_id == qlib::invalid_uid) {
        // hit nothing
        return LString();
    }

    qsys::RendererPtr pRend = SceneManager::getRendererS(rend_id);
    if (pRend.isnull()) {
        LOG_DPRINTLN("FATAL ERROR: Unknown renderer id %d", rend_id);
        return LString();
    }

    qlib::uid_t sceneid = pRend->getSceneID();
    qlib::uid_t objid = pRend->getClientObjID();

    qsys::ObjectPtr pObj = SceneManager::getObjectS(objid);
    if (pObj.isnull()) {
        LOG_DPRINTLN("FATAL ERROR: Unknown object id %d", objid);
        return LString();
    }

    MB_DPRINTLN("Hittest OK: sc=%d, rend=%d, obj=%d", sceneid, rend_id, objid);

    LString rval;
    {
        rval += "{";
        rval += pRend->interpHit(m_hitdata);
        rval += LString::format("\"scene_id\": %d,\n", sceneid);
        rval += LString::format("\"rend_id\": %d,\n", rend_id);
        rval += LString::format("\"rendtype\": \"%s\",\n", pRend->getTypeName());
        rval += LString::format("\"rend_name\": \"%s\",\n", pRend->getName().c_str());
        rval += LString::format("\"obj_id\": %d,\n", objid);
        rval += LString::format("\"obj_name\": \"%s\"\n", pObj->getName().c_str());
        rval += "}";
    }

    return rval;
}

LString GUIView::hitTestRect(int ax, int ay, int aw, int ah, bool bNearest)
{
    int x = convToBackingX(ax);
    int y = convToBackingY(ay);
    int w = convToBackingX(aw);
    int h = convToBackingY(ah);

    double cnx = double(x) + double(w) / 2.0;
    double cny = double(y) + double(h) / 2.0;

    // HittestContext *phc = MB_NEW HittestContext();
    HittestContext hc;

    // Perform hittest (multiple hit)
    if (!hitTestImpl(&hc, Vector4D(cnx, cny, w, h), true, 1.0)) return LString();

    m_hitdata.createAll(&hc);

    int nrend = m_hitdata.getRendSize();
    if (nrend == 0)  // no hit
        return LString();

    std::vector<qlib::uid_t> rend_ids;
    if (bNearest) {
        nrend = 1;
        rend_ids.resize(1);
        rend_ids[0] = m_hitdata.getNearestRendID();
    } else {
        rend_ids.resize(nrend);
        m_hitdata.getRendArray(rend_ids.data(), nrend);
    }

    ////////////////////////

    std::set<int> objids;

    LString rval;
    rval += "[";

    for (int ii = 0; ii < nrend; ++ii) {
        qlib::uid_t rend_id = rend_ids[ii];

        if (rend_id == qlib::invalid_uid) {
            // empty entry
            continue;
        }

        qsys::RendererPtr pRend = SceneManager::getRendererS(rend_id);
        if (pRend.isnull()) {
            LOG_DPRINTLN("GUIView.hitTestRect> FATAL ERROR: Unknown renderer id %d",
                         rend_id);
            return LString();
        }

        qlib::uid_t objid = pRend->getClientObjID();

        if (objids.find(objid) != objids.end()) {
            MB_DPRINTLN(
                "GUIView.hitTestRect> duplicated objid %d for rendid %d ignored", objid,
                rend_id);
            continue;
        }
        objids.insert(objid);

        qlib::uid_t sceneid = pRend->getSceneID();

        qsys::ObjectPtr pObj = SceneManager::getObjectS(objid);
        if (pObj.isnull()) {
            LOG_DPRINTLN("FATAL ERROR: Unknown object id %d", objid);
            return LString();
        }

        if (ii > 0) rval += ",";
        rval += "{";
        rval += LString::format("\"rend_id\": %d,\n", rend_id);

        rval += pRend->interpHit(m_hitdata);
        rval += LString::format("\"obj_id\": %d", objid);
        rval += "}";
        // MB_DPRINTLN("Hittest OK: sc=%d, rend=%d, obj=%d", sceneid, rend_id, objid);
    }
    rval += "]";

    return rval;
}

bool GUIView::hitTestImpl(gfx::DisplayContext *pdc, const Vector4D &parm, bool fGetAll,
                          double far_factor)
{
    qsys::ScenePtr pScene = getScene();
    if (pScene.isnull()) {
        MB_DPRINTLN("hitTest: invalid scene %d !!", getSceneID());
        return false;
    }

    HittestContext *phc = static_cast<HittestContext *>(pdc);

    // setUpHitProjMat(pdc, parm, far_factor);
    double slabdepth = getSlabDepth();
    if (slabdepth <= 0.1) slabdepth = 0.1;

    const double zoom = getZoom();
    const double dist = getViewDist();

    const double slabnear = dist - slabdepth / 2.0f;
    const double slabfar = dist + slabdepth * far_factor;
    const double vw = zoom / 2.0;
    const double cx = convToBackingX(getWidth());
    const double cy = convToBackingY(getHeight());
    const double fasp = cx / cy;

    MB_DPRINTLN("HitTestImpl> near=%f, far=%f, vw=%f, fasp=%f", slabnear, slabfar, vw,
                fasp);

    // Setup projection matrix
    Matrix4D projmat;
    if (isPerspec()) {
        projmat = DisplayContext::makePersProjMat(vw, fasp, slabnear, slabfar, dist);
        // projmat = DisplayContext::makeOrthoProjMat(vw, fasp, slabnear, slabfar);
    } else {
        projmat = DisplayContext::makeOrthoProjMat(vw, fasp, slabnear, slabfar);
    }

    /////
    // GLint viewport[4] = {0, 0, GLint(cx), GLint(cy)};
    // gluPickMatrix((GLfloat)parm.x(), (GLfloat)(cy - parm.y()),parm.z(), parm.w(),
    // viewport);
    const double pickx = parm.x();
    const double picky = cy - parm.y();
    const double deltax = parm.z();
    const double deltay = parm.w();

    Matrix4D pickmat;
    // Scale (cx / deltax, cy / deltay, 1)
    pickmat.aij(1, 1) = cx / deltax;
    pickmat.aij(2, 2) = cy / deltay;

    // Translate ((cx - 2.0 * pickx) / deltax, (cy - 2.0 * picky) / deltay, 0)
    pickmat.aij(1, 4) = (cx - 2.0 * pickx) / deltax;
    pickmat.aij(2, 4) = (cy - 2.0 * picky) / deltay;
    // pickmat.aij(3, 4) = 1.0;

    MB_DPRINTLN("PickMat:");
    pickmat.dump();

    MB_DPRINTLN("ProjMat:");
    projmat.dump();

    /////

    // phc->m_projMat = projmat.mul(pickmat);
    phc->m_projMat = pickmat.mul(projmat);

    // MB_DPRINTLN("PickMat * ProjMat:");
    // phc->m_projMat.dump();

    // 0 == no stereo
    // setUpModelMat(MM_NORMAL);
    phc->loadIdent();
    phc->translate(Vector4D(0, 0, -getViewDist()));
    phc->rotate(getRotQuat());
    const qlib::Vector4D c = getViewCenter();
    phc->translate(-c);

    // MB_DPRINTLN("*** ModelMat:");
    // phc->getModelViewMat().dump();

    pScene->processHit(phc);

    // phc->dump();

    return true;
}

//////////
// Framebuffer operations

qsys::View *GUIView::createOffScreenView(int w, int h, int aa_depth)
{
    return nullptr;
}

void GUIView::readPixels(int x, int y, int width, int height, char *pbuf, int nbufsize,
                         int ncomp)
{
}

}  // namespace qsys
