#include <common.h>

#include "GLSLTrigHelper.hpp"

#include <gfx/DrawAttrArray.hpp>
#include <sysdep/OglProgramObject.hpp>
#include <sysdep/ShaderSetupHelper.hpp>

namespace sysdep {

bool GLSLTrigHelper::initShader(gfx::DisplayContext *pdc)
{
    if (m_bInitialized) return true;

    MB_ASSERT(m_pPO == nullptr);
    ShaderSetupHelper ssh(pdc);

    if (!ssh.checkEnvVS()) {
        MB_DPRINTLN("GLShader not supported");
        return false;
    }

    //

    if (m_pPO == nullptr) {
        m_pPO = ssh.createProgObj("gpu_trig", "%%CONFDIR%%/data/shaders/trig_vert.glsl",
                                  "%%CONFDIR%%/data/shaders/trig_frag.glsl");
    }
    if (m_pPO == nullptr) {
        LOG_DPRINTLN("GLSLTrig> ERROR: cannot create progobj.");
        return false;
    }
    MB_DPRINTLN("GLSLTrig> create progobj gpu_trig OK.");

    // setup attributes
    m_nVertexLoc = m_pPO->getAttribLocation("aVertex");
    m_nNormLoc = m_pPO->getAttribLocation("aNormal");
    m_nColLoc = m_pPO->getAttribLocation("aColor");

    //

    if (m_pEdgePO == nullptr) {
        m_pEdgePO = ssh.createProgObj("gpu_trig_edge",
                                      "%%CONFDIR%%/data/shaders/trigedge_vert.glsl",
                                      "%%CONFDIR%%/data/shaders/trigedge_frag.glsl");
    }
    if (m_pEdgePO == nullptr) {
        LOG_DPRINTLN("GLSLTrig> ERROR: cannot create edge progobj.");
        return false;
    }

    m_nEVertLoc = m_pEdgePO->getAttribLocation("aVertex");
    m_nENormLoc = m_pEdgePO->getAttribLocation("aNormal");

    MB_ASSERT(m_nVertexLoc == m_nEVertLoc);
    MB_ASSERT(m_nNormLoc == m_nENormLoc);

    m_bInitialized = true;
    return true;
}

void GLSLTrigHelper::setupAttrs()
{
    MB_ASSERT(m_pDrawElems != nullptr);
    auto &data = *m_pDrawElems;

    if (data.getAttrSize() > 0) {
        // already setup
        return;
    }

    data.setAttrSize(3);
    data.setAttrInfo(0, m_nVertexLoc, 3, qlib::type_consts::QTC_FLOAT32,
                     offsetof(TrigVertAttr, x));
    data.setAttrInfo(1, m_nNormLoc, 3, qlib::type_consts::QTC_FLOAT32,
                     offsetof(TrigVertAttr, nx));
    data.setAttrInfo(2, m_nColLoc, 4, qlib::type_consts::QTC_UINT8,
                     offsetof(TrigVertAttr, r));
}

void GLSLTrigHelper::alloc(int nverts, int nfaces)
{
    m_pDrawElems = MB_NEW TrigMesh();
    auto &data = *m_pDrawElems;

    data.alloc(nverts);
    data.allocInd(nfaces * 3);
    data.setDrawMode(gfx::AbstDrawElem::DRAW_TRIANGLES);
    // data.setDrawMode(gfx::AbstDrawElem::DRAW_LINES);

    MB_DPRINTLN("GLSLTrig> allocated %d vertices %d faces", nverts, nfaces);
}

void GLSLTrigHelper::color(int ind, quint32 devcode)
{
    auto &data = *m_pDrawElems;
    data.at(ind).r = (qbyte)gfx::getRCode(devcode);
    data.at(ind).g = (qbyte)gfx::getGCode(devcode);
    data.at(ind).b = (qbyte)gfx::getBCode(devcode);
    data.at(ind).a = (qbyte)gfx::getACode(devcode);
}

void GLSLTrigHelper::vertex(int ind, const Vector4D &v)
{
    auto &data = *m_pDrawElems;
    data.at(ind).x = (qfloat32)v.x();
    data.at(ind).y = (qfloat32)v.y();
    data.at(ind).z = (qfloat32)v.z();
}

void GLSLTrigHelper::normal(int ind, const Vector4D &n)
{
    auto &data = *m_pDrawElems;
    data.at(ind).nx = (qfloat32)n.x();
    data.at(ind).ny = (qfloat32)n.y();
    data.at(ind).nz = (qfloat32)n.z();
}

void GLSLTrigHelper::face(int ind, int v1, int v2, int v3)
{
    auto &data = *m_pDrawElems;
    data.atind(ind * 3) = v1;
    data.atind(ind * 3 + 1) = v2;
    data.atind(ind * 3 + 2) = v3;
}

void GLSLTrigHelper::draw(gfx::DisplayContext *pdc)
{
    if (m_pDrawElems == nullptr) {
        return;
    }

    initShader(pdc);
    setupAttrs();

    // TODO: draw mode impl
    // m_pDrawElems->setDrawMode(m_nPolyMode);

    // draw edges
    if (getEdgeLineType() != gfx::DisplayContext::ELT_NONE) {
        drawEdges(pdc);
    }

    // Debug: dump face indices
    // auto &data = *m_pDrawElems;
    // for (int i=0; i<data.getIndSize(); ++i) {
    //     MB_DPRINTLN("face %d: %d", i, data.atind(i));
    // }

    m_pPO->enable();
    m_pPO->setupFog(pdc);
    m_pPO->setupMat(pdc);

    m_pPO->setUniformF("frag_alpha", pdc->getAlpha());
    // m_pPO->setUniformF("frag_alpha", 1.0);

    // m_pPO->setUniform("enable_lighting", pdc->isLighting());
    m_pPO->setUniform("enable_lighting", false);

    if (m_bNoDepth) {
        m_pPO->setUniform("u_nodepth", 1);
    } else {
        m_pPO->setUniform("u_nodepth", 0);
    }

    pdc->drawElem(*m_pDrawElems);
    m_pPO->disable();
}

void GLSLTrigHelper::drawEdges(gfx::DisplayContext *pdc)
{
    float r = .0, g = .0, b = .0;
    pdc->getDevRGBColor(pdc->getEdgeLineColor(), r, g, b);
    float alpha = pdc->getAlpha();

    if (getEdgeLineType() == gfx::DisplayContext::ELT_EDGES) {
        m_pEdgePO->enable();
        m_pEdgePO->setupFog(pdc);
        m_pEdgePO->setupMat(pdc);
        m_pEdgePO->setUniformF("frag_alpha", alpha);
        m_pEdgePO->setUniformF("edge_width", pdc->getEdgeLineWidth());
        m_pEdgePO->setUniformF("edge_color", r, g, b, alpha);
        glEnable(GL_CULL_FACE);
        glFrontFace(GL_CW);
        pdc->drawElem(*m_pDrawElems);
        m_pEdgePO->disable();
        glFrontFace(GL_CCW);
        glDisable(GL_CULL_FACE);
    }
}

void GLSLTrigHelper::invalidate()
{
    if (m_pDrawElems != nullptr) {
        delete m_pDrawElems;
        m_pDrawElems = nullptr;
        MB_DPRINTLN("GLSLLine> deleted draw array");
    }
}

}  // namespace sysdep
