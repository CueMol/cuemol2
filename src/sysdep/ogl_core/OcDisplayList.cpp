// -*-Mode: C++;-*-
//
// OpenGL core profile display list emulation
//

#include <common.h>

#include "OcDisplayList.hpp"
#include "OglDisplayContext.hpp"
#include "OglProgramObject.hpp"
#include "GLSLLineHelper.hpp"
#include "ShaderSetupHelper.hpp"

#include <qsys/View.hpp>

namespace sysdep {

OcDisplayList::OcDisplayList()
    :  // m_pLineArray(nullptr),
      m_pGlslLine(nullptr),
      m_pTrigArray(nullptr),
      m_pTrigMesh(nullptr),
      m_pTrigPO(nullptr),
      m_fValid(false),
      m_nDrawMode(DRAWMODE_NONE),
      m_pColor(gfx::SolidColor::createRGB(0.5, 0.5, 0.5)),
      m_fPrevPosValid(false),
      m_prevCol(0)
{
    m_matstack.clear();
    pushMatrix();
    loadIdent();
    m_vertLineWidth = -1.0;
    m_lineWidth = -1.0;
}

OcDisplayList::~OcDisplayList()
{
    // if (m_pLineArray) delete m_pLineArray;
    if (m_pGlslLine) delete m_pGlslLine;
    if (m_pTrigArray) delete m_pTrigArray;
}

qlib::uid_t OcDisplayList::getSceneID() const
{
    return getTargetView()->getSceneID();
}

void OcDisplayList::setLineWidth(double lw)
{
    MB_DPRINTLN("OcDisplayList::setLineWidth> lw=%f", lw);
    m_lineWidth = lw;
}

void OcDisplayList::vertex(const Vector4D &aV)
{
    // printf("vert (%f,%f,%f)\n", aV.x(), aV.y(), aV.z());
    Vector4D v(aV);
    xform_vec(v);
    // printf("vert (%f,%f,%f)\n", v.x(), v.y(), v.z());

#ifdef MB_DEBUG
    if (!qlib::isFinite(v.x()) || !qlib::isFinite(v.y()) || !qlib::isFinite(v.z())) {
        LOG_DPRINTLN("ERROR: invalid vertex");
    }
#endif

    // printf("draw mode %d\n", m_nDrawMode);
    auto color_value = m_pColor->getDevCode(getSceneID());
    switch (m_nDrawMode) {
        default:
        case DRAWMODE_NONE:
            MB_DPRINTLN("vertex command ignored.");
            break;

        case DRAWMODE_LINES:
            if (!m_fPrevPosValid) {
                m_prevPos = v;
                m_prevCol = color_value;
                m_fPrevPosValid = true;
            } else {
                drawLine(v, color_value, m_prevPos, m_prevCol);
                m_fPrevPosValid = false;
            }
            // MB_DPRINTLN("line width = %f <-- %f", m_vertLineWidth, m_lineWidth);
            m_vertLineWidth = m_lineWidth;
            break;

            //////////////////////////////////////////////////////
        case DRAWMODE_LINESTRIP:
            if (!m_fPrevPosValid) {
                m_prevPos = v;
                m_prevCol = color_value;
                m_fPrevPosValid = true;
            } else {
                drawLine(v, color_value, m_prevPos, m_prevCol);
                m_prevPos = v;
                m_prevCol = color_value;
            }
            m_vertLineWidth = m_lineWidth;
            break;

            //////////////////////////////////////////////////////
        case DRAWMODE_TRIGS:
            addTrigVert(v, m_norm, color_value);
            break;

            //////////////////////////////////////////////////////
        case DRAWMODE_TRIGSTRIP:
            m_mesh.addVertex(v, m_norm, color_value);
            break;

            //////////////////////////////////////////////////////
        case DRAWMODE_TRIGFAN:
            m_mesh.addVertex(v, m_norm, color_value);
            break;
    }
}

void OcDisplayList::normal(const Vector4D &av)
{
    Vector4D v(av);
    xform_norm(v);

#ifdef MB_DEBUG
    if (!qlib::isFinite(v.x()) || !qlib::isFinite(v.y()) || !qlib::isFinite(v.z())) {
        LOG_DPRINTLN("FileDC> ERROR: invalid mesh norm");
    }
#endif

    const double len = v.length();
    if (len < F_EPS4) {
        LOG_DPRINTLN("FileDisp> Normal vector <%f,%f,%f> is too small.", v.x(), v.y(),
                     v.z());
        m_norm = Vector4D(1.0, 0.0, 0.0);
        return;
    }
    m_norm = v.scale(1.0 / len);
}

void OcDisplayList::color(const gfx::ColorPtr &c)
{
    m_pColor = c;
}

void OcDisplayList::pushMatrix()
{
    if (m_matstack.size() <= 0) {
        Matrix4D m;
        m_matstack.push_front(m);
        return;
    }
    const Matrix4D &top = m_matstack.front();
    m_matstack.push_front(top);
}
void OcDisplayList::popMatrix()
{
    if (m_matstack.size() <= 1) {
        LString msg("POVWriter> FATAL ERROR: cannot popMatrix()!!");
        LOG_DPRINTLN(msg);
        MB_THROW(qlib::RuntimeException, msg);
        return;
    }
    m_matstack.pop_front();
}
void OcDisplayList::multMatrix(const qlib::Matrix4D &mat)
{
    Matrix4D top = m_matstack.front();
    top.matprod(mat);
    m_matstack.front() = top;

    // check unitarity
    // checkUnitary();
}
void OcDisplayList::loadMatrix(const qlib::Matrix4D &mat)
{
    m_matstack.front() = mat;

    // check unitarity
    // checkUnitary();
}

void OcDisplayList::setPolygonMode(int id)
{
    MB_DPRINTLN("setPolygonMode is not supported (ignored.)");
}

void OcDisplayList::startPoints()
{
    m_nDrawMode = DRAWMODE_POINTS;
}

void OcDisplayList::startPolygon()
{
    MB_DPRINTLN("polygon is not supported (vertex command ignored.)");
}

void OcDisplayList::startLines()
{
    if (m_nDrawMode != DRAWMODE_NONE) {
        MB_DPRINTLN("OcDisplayList::startLines ERR: %d", m_nDrawMode);
        MB_THROW(qlib::RuntimeException, "OcDisplayList: Unexpected condition");
        return;
    }
    m_nDrawMode = DRAWMODE_LINES;
    m_vertLineWidth = -1.0;
    // printf("OcDisplayList::startLines OK\n");
}

void OcDisplayList::startLineStrip()
{
    if (m_nDrawMode != DRAWMODE_NONE) {
        MB_THROW(qlib::RuntimeException, "OcDisplayList: Unexpected condition");
        return;
    }
    m_nDrawMode = DRAWMODE_LINESTRIP;
    m_vertLineWidth = -1.0;
}

void OcDisplayList::startTriangles()
{
    if (m_nDrawMode != DRAWMODE_NONE) {
        MB_THROW(qlib::RuntimeException, "OcDisplayList: Unexpected condition");
        return;
    }
    m_nDrawMode = DRAWMODE_TRIGS;
    // if (m_nPolyMode == POLY_FILL || m_nPolyMode == POLY_FILL_NORGLN ||
    //     m_nPolyMode == POLY_FILL_XX)
    //     m_pIntData->meshStart(m_nDrawMode);
    // else if (m_nPolyMode == POLY_LINE) {
    //     m_nVertCnt = 0;
    //     m_vectmp.resize(3);
    // }
}

void OcDisplayList::startTriangleStrip()
{
    if (m_nDrawMode != DRAWMODE_NONE) {
        MB_THROW(qlib::RuntimeException, "OcDisplayList: Unexpected condition");
        return;
    }
    m_nDrawMode = DRAWMODE_TRIGSTRIP;
    m_mesh.start(gfx::GrowMesh::GM_TRIGSTRIP);
    // m_pIntData->meshStart(m_nDrawMode);
}

void OcDisplayList::startTriangleFan()
{
    if (m_nDrawMode != DRAWMODE_NONE) {
        MB_THROW(qlib::RuntimeException, "OcDisplayList: Unexpected condition");
        return;
    }
    m_nDrawMode = DRAWMODE_TRIGFAN;
    m_mesh.start(gfx::GrowMesh::GM_TRIGFAN);
    // m_pIntData->meshStart(m_nDrawMode);
}

void OcDisplayList::end()
{
    switch (m_nDrawMode) {
        case DRAWMODE_LINES:
        case DRAWMODE_LINESTRIP:
            m_fPrevPosValid = false;
            break;

        case DRAWMODE_TRIGS:
            // m_pIntData->meshEndTrigs();
            break;

        case DRAWMODE_TRIGFAN:
            m_mesh.end();
            // m_pIntData->meshEndFan();
            break;

        case DRAWMODE_TRIGSTRIP:
            m_mesh.end();
            // m_pIntData->meshEndTrigStrip();
            break;
    }
    m_nDrawMode = DRAWMODE_NONE;
}

void OcDisplayList::drawLine(const Vector4D &v1, qlib::quint32 c1, const Vector4D &v2,
                             qlib::quint32 c2)
{
    m_lineBuf.push_back(LineDrawAttr{v1, c1});
    m_lineBuf.push_back(LineDrawAttr{v2, c2});
}

void OcDisplayList::addTrigVert(const Vector4D &v1, const Vector4D &n1,
                                qlib::quint32 c1)
{
    m_trigBuf.push_back(TrigVertAttr{
        qfloat32(v1.x()),
        qfloat32(v1.y()),
        qfloat32(v1.z()),
        qbyte(gfx::getRCode(c1)),
        qbyte(gfx::getGCode(c1)),
        qbyte(gfx::getBCode(c1)),
        qbyte(gfx::getACode(c1)),
        qfloat32(n1.x()),
        qfloat32(n1.y()),
        qfloat32(n1.z()),
    });
}

bool OcDisplayList::recordStart()
{
    MB_DPRINTLN("OcDisplayList::recordStart called");
    if (m_pGlslLine != nullptr) {
        MB_DPRINTLN("delete %p", m_pGlslLine);
        delete m_pGlslLine;
        m_pGlslLine = nullptr;
    }

    if (m_pTrigArray) {
        MB_DPRINTLN("delete %p", m_pTrigArray);
        delete m_pTrigArray;
        m_pTrigArray = nullptr;
    }

    m_fValid = false;

    m_matstack.clear();
    pushMatrix();
    loadIdent();

    return true;
}

void OcDisplayList::createLineArray()
{
    // Create Line attr array
    const size_t nelems_line = m_lineBuf.size();
    MB_DPRINTLN("OcDisplayList.createLinearray> nelems_line=%zu", nelems_line);
    if (nelems_line > 0) {
        MB_ASSERT(m_pGlslLine == nullptr);
        m_pGlslLine = MB_NEW GLSLLineHelper();
        m_pGlslLine->alloc(nelems_line);
        size_t i = 0;
        for (const auto &elem : m_lineBuf) {
            MB_ASSERT(i < nelems_line);
            m_pGlslLine->color(i, elem.cc);
            m_pGlslLine->vertex(i, elem.pos);
            ++i;
        }
        // MB_DPRINTLN("createLineArray> line width = %f", m_vertLineWidth);
        m_pGlslLine->setLineWidth(m_vertLineWidth);
        m_lineBuf.clear();
    }
}

void OcDisplayList::createTrigArray()
{
    MB_ASSERT(m_pTrigArray == nullptr);
    const size_t nelems_trig = m_trigBuf.size();
    MB_DPRINTLN("OcDisplayList.createTrigArray> nelems_trig=%zu", nelems_trig);
    if (nelems_trig > 0) {
        MB_ASSERT(m_pTrigArray == nullptr);
        m_pTrigArray = new TrigVertArray();
        m_pTrigArray->setDrawMode(gfx::AbstDrawElem::DRAW_TRIANGLES);
        // m_pTrigArray->setAttrSize(3);
        // m_pTrigArray->setAttrInfo(0, DSLOC_VERT_POS, 4,
        // qlib::type_consts::QTC_FLOAT32,
        //                           offsetof(TrigVertAttr, x));
        // m_pTrigArray->setAttrInfo(1, DSLOC_VERT_COLOR, 4,
        //                           qlib::type_consts::QTC_FLOAT32,
        //                           offsetof(TrigVertAttr, r));
        // m_pTrigArray->setAttrInfo(2, DSLOC_VERT_NORMAL, 4,
        //                           qlib::type_consts::QTC_FLOAT32,
        //                           offsetof(TrigVertAttr, nx));
        m_pTrigArray->alloc(nelems_trig);

        size_t i = 0;
        for (const auto &elem : m_trigBuf) {
            MB_ASSERT(i < nelems_trig);
            m_pTrigArray->at(i) = elem;
            ++i;
        }
        m_pTrigArray->setUpdated(true);
        m_trigBuf.clear();
    }
}

void OcDisplayList::createTrigMesh()
{
    // Create Trig attr indexed array
    MB_ASSERT(m_pTrigMesh == nullptr);
    const size_t nMeshVerts = m_mesh.getVertexSize();
    const size_t nMeshFaces = m_mesh.getFaceSize();
    if (nMeshFaces > 0) {
        MB_ASSERT(m_pTrigMesh == nullptr);
        m_pTrigMesh = new TrigMesh();
        m_pTrigMesh->setDrawMode(gfx::AbstDrawElem::DRAW_TRIANGLES);
        // m_pTrigMesh->setAttrSize(3);
        // m_pTrigMesh->setAttrInfo(0, DSLOC_VERT_POS, 4,
        // qlib::type_consts::QTC_FLOAT32,
        //                          offsetof(TrigVertAttr, x));
        // m_pTrigMesh->setAttrInfo(1, DSLOC_VERT_COLOR, 4,
        // qlib::type_consts::QTC_FLOAT32,
        //                          offsetof(TrigVertAttr, r));
        // m_pTrigMesh->setAttrInfo(2, DSLOC_VERT_NORMAL, 4,
        //                          qlib::type_consts::QTC_FLOAT32,
        //                          offsetof(TrigVertAttr, nx));
        m_pTrigMesh->alloc(nMeshVerts);
        m_pTrigMesh->allocInd(nMeshFaces * 3);
        size_t i = 0;
        for (const auto *pelem : m_mesh.getVertexData()) {
            const auto &c1 = pelem->c;
            const auto &v1 = pelem->v;
            const auto &n1 = pelem->n;
            m_pTrigMesh->at(i) = TrigVertAttr{
                qfloat32(v1.x()),
                qfloat32(v1.y()),
                qfloat32(v1.z()),
                qbyte(gfx::getRCode(c1)),
                qbyte(gfx::getGCode(c1)),
                qbyte(gfx::getBCode(c1)),
                qbyte(gfx::getACode(c1)),
                qfloat32(n1.x()),
                qfloat32(n1.y()),
                qfloat32(n1.z()),
            };
            i++;
        }
        i = 0;
        for (const auto &elem : m_mesh.getFaceData()) {
            m_pTrigMesh->atind(i) = elem.iv1;
            m_pTrigMesh->atind(i + 1) = elem.iv2;
            m_pTrigMesh->atind(i + 2) = elem.iv3;
            i += 3;
        }
        m_pTrigMesh->setUpdated(true);
        m_mesh.clear();
    }
}

void OcDisplayList::recordEnd()
{
    MB_DPRINTLN("OcDisplayList::recordEnd called");
    // MB_ASSERT(m_pLineArray == nullptr);

    // Mark as valid
    m_fValid = true;

    // Line
    createLineArray();

    // Create Trig attr array
    createTrigArray();

    // Create Trig attr indexed array
    createTrigMesh();
}

void OcDisplayList::initShader(gfx::DisplayContext *pdc)
{
    if (m_pTrigPO != nullptr) {
        return;
    }
    ShaderSetupHelper ssh(pdc);

    if (!ssh.checkEnvVS()) {
        MB_DPRINTLN("GLShader not supported");
    }
    m_pTrigPO = ssh.createProgObj("gpu_trig", "%%CONFDIR%%/data/shaders/trig_vert.glsl",
                                  "%%CONFDIR%%/data/shaders/trig_frag.glsl");

    // setup attributes
    m_nVertexLoc = m_pTrigPO->getAttribLocation("aVertex");
    m_nColLoc = m_pTrigPO->getAttribLocation("aColor");
    m_nNormLoc = m_pTrigPO->getAttribLocation("aNormal");
}

void OcDisplayList::setupTrigArrayAttrs()
{
    if (m_pTrigArray == nullptr) {
        return;
    }
    auto &data = *m_pTrigArray;
    if (data.getAttrSize() > 0) {
        // already setup
        return;
    }
    data.setAttrSize(3);
    data.setAttrInfo(0, m_nVertexLoc, 3, qlib::type_consts::QTC_FLOAT32,
                     offsetof(TrigVertAttr, x));
    data.setAttrInfo(1, m_nColLoc, 4, qlib::type_consts::QTC_UINT8,
                     offsetof(TrigVertAttr, r));
    data.setAttrInfo(2, m_nNormLoc, 3, qlib::type_consts::QTC_FLOAT32,
                     offsetof(TrigVertAttr, nx));
}

void OcDisplayList::setupTrigMeshAttrs()
{
    if (m_pTrigMesh == nullptr) {
        return;
    }
    auto &data = *m_pTrigMesh;
    if (data.getAttrSize() > 0) {
        // already setup
        return;
    }
    data.setAttrSize(3);
    data.setAttrInfo(0, m_nVertexLoc, 3, qlib::type_consts::QTC_FLOAT32,
                     offsetof(TrigVertAttr, x));
    data.setAttrInfo(1, m_nColLoc, 4, qlib::type_consts::QTC_UINT8,
                     offsetof(TrigVertAttr, r));
    data.setAttrInfo(2, m_nNormLoc, 3, qlib::type_consts::QTC_FLOAT32,
                     offsetof(TrigVertAttr, nx));
}

void OcDisplayList::drawTrigArray(gfx::DisplayContext *pdc)
{
    if (m_pTrigArray == nullptr) {
        return;
    }
    initShader(pdc);
    setupTrigArrayAttrs();
    m_pTrigPO->enable();
    m_pTrigPO->setUniformF("frag_alpha", pdc->getAlpha());
    m_pTrigPO->setUniform("enable_lighting", true);
    pdc->drawElem(*m_pTrigArray);
    m_pTrigPO->disable();
}

void OcDisplayList::drawTrigMesh(gfx::DisplayContext *pdc)
{
    if (m_pTrigMesh == nullptr) {
        return;
    }
    initShader(pdc);
    setupTrigMeshAttrs();
    m_pTrigPO->enable();
    m_pTrigPO->setUniformF("frag_alpha", pdc->getAlpha());
    m_pTrigPO->setUniform("enable_lighting", true);
    pdc->drawElem(*m_pTrigMesh);
    m_pTrigPO->disable();
}

gfx::DisplayContext *OcDisplayList::createDisplayList()
{
    return nullptr;
}

bool OcDisplayList::canCreateDL() const
{
    return false;
}

bool OcDisplayList::isDisplayList() const
{
    return true;
}

void OcDisplayList::callDisplayListImpl(OglDisplayContext *pdc)
{
    // Lines
    if (m_pGlslLine != nullptr) {
        m_pGlslLine->initShader(pdc);
        m_pGlslLine->draw(pdc);
    }

    // Triangles
    drawTrigArray(pdc);
    // auto *pTrigs = getTrigArray();
    // if (pTrigs != nullptr) {
    //     initShader(pdc);
    //     setupTrigArrayAttrs();
    //     pdc->drawElem(*pTrigs);
    // }

    // Trig mesh
    drawTrigMesh(pdc);
    // auto *pMesh = getTrigMesh();
    // if (pMesh != nullptr) {
    //     initShader(pdc);
    //     setupTrigMeshAttrs();
    //     pdc->drawElem(*pMesh);
    // }
}

}  // namespace sysdep
