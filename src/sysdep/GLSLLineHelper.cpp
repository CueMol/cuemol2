#include <common.h>

#include "GLSLLineHelper.hpp"

#include <gfx/DrawAttrArray.hpp>
#include <sysdep/OglDisplayContext.hpp>
#include <sysdep/OglProgramObject.hpp>
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
            ssh.createProgObj("gpu_line", "%%CONFDIR%%/data/shaders/linew_vert.glsl",
                              "%%CONFDIR%%/data/shaders/linew_frag.glsl");

    if (m_pPO == NULL) {
        LOG_DPRINTLN("GLSLLine> ERROR: cannot create progobj.");
        return false;
    }

    // setup attributes
    m_nIndLoc = m_pPO->getAttribLocation("a_index");
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

    data.setAttrSize(5);
    data.setAttrInfo(0, m_nVertex1Loc, 3, qlib::type_consts::QTC_FLOAT32,
                     offsetof(LineElem, x1));
    data.setAttrInfo(1, m_nVertex2Loc, 3, qlib::type_consts::QTC_FLOAT32,
                     offsetof(LineElem, x2));
    data.setAttrInfo(2, m_nCol1Loc, 4, qlib::type_consts::QTC_UINT8,
                     offsetof(LineElem, r1));
    data.setAttrInfo(3, m_nCol2Loc, 4, qlib::type_consts::QTC_UINT8,
                     offsetof(LineElem, r2));
    data.setAttrInfo(4, m_nIndLoc, 1, qlib::type_consts::QTC_FLOAT32,
                     offsetof(LineElem, ind));
}

void GLSLLineHelper::alloc(int nverts)
{
    m_pDrawAry = MB_NEW LineArray();
    LineArray &data = *m_pDrawAry;

    data.alloc(nverts * 3);
    data.setDrawMode(gfx::AbstDrawElem::DRAW_TRIANGLES);

    MB_DPRINTLN("GLSLLine> allocated %d vertices", nverts);

    // assign index
    for (int i = 0; i < nverts * 3; i++) {
        data.at(i).ind = i % 6;
    }
}

void GLSLLineHelper::color(int ind, quint32 devcode)
{
    auto &data = *m_pDrawAry;
    const auto ind2 = ind / 2;
    const auto flag = ind % 2;

    const auto ind3 = ind2 * 6;

    MB_ASSERT(ind3 >= 0);
    MB_ASSERT(ind3 < data.getSize());

    if (flag == 0) {
        for (int j = 0; j < 6; j++) {
            data.at(ind3 + j).r1 = (qbyte)gfx::getRCode(devcode);
            data.at(ind3 + j).g1 = (qbyte)gfx::getGCode(devcode);
            data.at(ind3 + j).b1 = (qbyte)gfx::getBCode(devcode);
            data.at(ind3 + j).a1 = (qbyte)gfx::getACode(devcode);
        }
    } else {
        for (int j = 0; j < 6; j++) {
            data.at(ind3 + j).r2 = (qbyte)gfx::getRCode(devcode);
            data.at(ind3 + j).g2 = (qbyte)gfx::getGCode(devcode);
            data.at(ind3 + j).b2 = (qbyte)gfx::getBCode(devcode);
            data.at(ind3 + j).a2 = (qbyte)gfx::getACode(devcode);
        }
    }
}

void GLSLLineHelper::vertex(int ind, const Vector4D &v)
{
    auto &data = *m_pDrawAry;

    const auto ind2 = ind / 2;
    const auto flag = ind % 2;

    const auto ind3 = ind2 * 6;

    // MB_DPRINTLN("vertex: %d (%f,%f,%f)", ind, v.x(), v.y(), v.z());
    MB_ASSERT(ind3 >= 0);
    MB_ASSERT(ind3 < data.getSize());

    if (flag == 0) {
        for (int j = 0; j < 6; j++) {
            data.at(ind3 + j).x1 = (qfloat32)v.x();
            data.at(ind3 + j).y1 = (qfloat32)v.y();
            data.at(ind3 + j).z1 = (qfloat32)v.z();
        }
    } else {
        for (int j = 0; j < 6; j++) {
            data.at(ind3 + j).x2 = (qfloat32)v.x();
            data.at(ind3 + j).y2 = (qfloat32)v.y();
            data.at(ind3 + j).z2 = (qfloat32)v.z();
        }
    }
}

void GLSLLineHelper::draw(gfx::DisplayContext *pdc)
{
    if (m_pDrawAry == nullptr) {
        return;
    }

    setupAttrs();

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
    // MB_DPRINTLN("GLSLLine> linew=%f (pixscl=%f)", linew, pdc->getPixSclFac());

    m_pPO->enable();
    m_pPO->setUniformF("frag_alpha", pdc->getAlpha());
    m_pPO->setUniformF("lineWidth", linew * pdc->getPixSclFac());
    m_pPO->setUniformF("stippleLen", m_stippleLen);
    m_pPO->setUniformF("screenSize", w, h);
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
