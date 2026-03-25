#include <common.h>

#include "GLSLLineHelper2.hpp"

#include <gfx/DrawAttrArray.hpp>
#include <gfx/DisplayContext.hpp>

#include <gfx/ShaderObject.hpp>
#include <sysdep/ShaderSetupHelper.hpp>

namespace sysdep {

bool GLSLLineHelper::initShader(gfx::DisplayContext *pdc)
{
    if (m_bInitialized) return true;

    MB_ASSERT(m_pPO == NULL);
    ShaderSetupHelper ssh(pdc);

    if (!ssh.checkEnvVS()) {
        MB_DPRINTLN("GLShader not supported");
        return false;
    }

    if (m_pPO == NULL)
        m_pPO =
            ssh.createProgObj("gpu_line", "%%CONFDIR%%/data/shaders/linew2_vert.glsl",
                              "%%CONFDIR%%/data/shaders/linew_frag.glsl");

    if (m_pPO == NULL) {
        LOG_DPRINTLN("GLSLLine> ERROR: cannot create progobj.");
        return false;
    }

    // setup attributes
    // m_nIndLoc = m_pPO->getAttribLocation("a_index");
    m_nVertex1Loc = m_pPO->getAttribLocation("a_vertex1");
    m_nVertex2Loc = m_pPO->getAttribLocation("a_vertex2");
    m_nCol1Loc = m_pPO->getAttribLocation("a_color1");
    m_nCol2Loc = m_pPO->getAttribLocation("a_color2");

    m_bInitialized = true;
    return true;
}

void GLSLLineHelper::setupAttrs()
{
    MB_ASSERT(m_pDrawAry != NULL);
    LineArray &data = *m_pDrawAry;

    if (data.getAttrSize() > 0) {
        // already setup
        return;
    }

    data.setAttrSize(4);
    data.setAttrInfo(0, m_nVertex1Loc, 3, qlib::type_consts::QTC_FLOAT32,
                     offsetof(LineElem, x1));
    data.setAttrInfo(1, m_nVertex2Loc, 3, qlib::type_consts::QTC_FLOAT32,
                     offsetof(LineElem, x2));
    data.setAttrInfo(2, m_nCol1Loc, 4, qlib::type_consts::QTC_UINT8,
                     offsetof(LineElem, r1));
    data.setAttrInfo(3, m_nCol2Loc, 4, qlib::type_consts::QTC_UINT8,
                     offsetof(LineElem, r2));

    const int ndiv = 1;
    data.setAttrDivisor(0, ndiv);
    data.setAttrDivisor(1, ndiv);
    data.setAttrDivisor(2, ndiv);
    data.setAttrDivisor(3, ndiv);
}

void GLSLLineHelper::alloc(int nverts)
{
    m_pDrawAry = MB_NEW LineArray();
    LineArray &data = *m_pDrawAry;
    const int nelems = nverts / 2;
    data.alloc(nelems);
    data.allocInd(6);
    data.assignInds({0, 1, 2, 2, 1, 3});
    data.setDrawMode(gfx::AbstDrawElem::DRAW_TRIANGLES);
    data.setNumInstances(nelems);

    MB_DPRINTLN("GLSLLine> allocated %d vertices", nelems);
}

void GLSLLineHelper::color(int ind, quint32 devcode)
{
    auto &data = *m_pDrawAry;

    const auto ind2 = ind / 2;
    MB_ASSERT(ind2 >= 0);
    MB_ASSERT(ind2 < data.getSize());

    if (ind % 2 == 0) {
        data.at(ind2).r1 = (qbyte)gfx::getRCode(devcode);
        data.at(ind2).g1 = (qbyte)gfx::getGCode(devcode);
        data.at(ind2).b1 = (qbyte)gfx::getBCode(devcode);
        data.at(ind2).a1 = (qbyte)gfx::getACode(devcode);
    } else {
        data.at(ind2).r2 = (qbyte)gfx::getRCode(devcode);
        data.at(ind2).g2 = (qbyte)gfx::getGCode(devcode);
        data.at(ind2).b2 = (qbyte)gfx::getBCode(devcode);
        data.at(ind2).a2 = (qbyte)gfx::getACode(devcode);
    }
}

void GLSLLineHelper::vertex(int ind, const Vector4D &v)
{
    auto &data = *m_pDrawAry;

    const auto ind2 = ind / 2;

    // MB_DPRINTLN("vertex: %d (%f,%f,%f)", ind, v.x(), v.y(), v.z());
    MB_ASSERT(ind2 >= 0);
    MB_ASSERT(ind2 < data.getSize());

    if (ind % 2 == 0) {
        data.at(ind2).x1 = (qfloat32)v.x();
        data.at(ind2).y1 = (qfloat32)v.y();
        data.at(ind2).z1 = (qfloat32)v.z();
    } else {
        data.at(ind2).x2 = (qfloat32)v.x();
        data.at(ind2).y2 = (qfloat32)v.y();
        data.at(ind2).z2 = (qfloat32)v.z();
    }
}

void GLSLLineHelper::draw(gfx::DisplayContext *pdc)
{
    if (m_pDrawAry == nullptr) {
        return;
    }

    setupAttrs();

    // // Get screen size from viewport
    // qlib::Vector4D vp = pDC->getViewport();
    // float w = (float)vp.z();
    // float h = (float)vp.w();

    auto pview = pdc->getTargetView();
    if (pview == nullptr) {
        MB_DPRINTLN("GLSLLine> ERROR: no target view");
        return;
    }
    float w = pview->getWidth();
    float h = pview->getHeight();

    float linew = m_linew;
    if (linew < 0.0) {
        linew = pdc->getLineWidth();
    }

    float stippleLen = 0.0;
    if (isStipple()) stippleLen = 8.0f;

    m_pPO->enable();

    if (!isUseVertColor()) {
        // use single color
        m_pPO->setUniform("use_u_color", true);
        float r = 0.5, g = 0.5, b = 0.5;
        pdc->getDevRGBColor(pdc->getColor(), r, g, b);
        m_pPO->setUniformF("u_color", r, g, b, 1.0);
        // MB_DPRINTLN("*** UseUniformColor RGB=%f %f %f pdc=%p", r, g, b, pdc);
    } else {
        m_pPO->setUniform("use_u_color", false);
    }

    m_pPO->setupFog(pdc);
    m_pPO->setupMat(pdc);

    m_pPO->setUniformF("frag_alpha", pdc->getAlpha());
    m_pPO->setUniformF("lineWidth", linew);
    m_pPO->setUniformF("stippleLen", stippleLen);
    m_pPO->setUniformF("screenSize", w, h);

    // if (true) {
    if (m_bNoDepth) {
        m_pPO->setUniform("u_nodepth", 1);
    } else {
        m_pPO->setUniform("u_nodepth", 0);
    }

    pdc->drawElem(*m_pDrawAry);
    m_pPO->disable();
}

void GLSLLineHelper::invalidate()
{
    if (m_pDrawAry != nullptr) {
        delete m_pDrawAry;
        m_pDrawAry = nullptr;
        MB_DPRINTLN("GLSLLine> deleted draw array");
    }
}

}  // namespace sysdep
