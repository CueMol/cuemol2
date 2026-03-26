// -*-Mode: C++;-*-
//
// DisplayList.cpp: backend-independent display list using GpuPrim
//

#include <common.h>

#include "DisplayList.hpp"
#include "AbstractColor.hpp"
#include "Mesh.hpp"
#include "SolidColor.hpp"

#include <qlib/LTypes.hpp>

namespace gfx {

DisplayList::DisplayList()
    : m_pLineObj(nullptr),
      m_pTrigObj(nullptr),
      m_pTrigMeshObj(nullptr),
      m_fValid(false),
      m_nDrawMode(DRAWMODE_NONE),
      m_pColor(gfx::SolidColor::createRGB(0.5, 0.5, 0.5)),
      m_fPrevPosValid(false),
      m_prevCol(0)
{
    pushMatrix();
    loadIdent();
    m_vertLineWidth = -1.0;
    m_bVertStipple = false;
    m_bSetColor = false;
    m_nPolyMode = gfx::AbstDrawElem::DRAW_TRIANGLES;
    m_nDetail = 5;
}

DisplayList::~DisplayList()
{
    delete m_pLineObj;
    delete m_pTrigObj;
    delete m_pTrigMeshObj;
}

void DisplayList::vertex(const qlib::Vector4D &aV)
{
    qlib::Vector4D v(aV);
    xform_vec(v);

#ifdef MB_DEBUG
    if (!qlib::isFinite(v.x()) || !qlib::isFinite(v.y()) || !qlib::isFinite(v.z())) {
        LOG_DPRINTLN("DisplayList> ERROR: invalid vertex");
    }
#endif

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
            m_vertLineWidth = getLineWidth();
            if (getLineStipple() == 0xFFFF)
                m_bVertStipple = false;
            else
                m_bVertStipple = true;
            break;

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
            m_vertLineWidth = getLineWidth();
            if (getLineStipple() == 0xFFFF)
                m_bVertStipple = false;
            else
                m_bVertStipple = true;
            break;

        case DRAWMODE_TRIGS:
            addTrigVert(v, m_norm, color_value);
            break;

        case DRAWMODE_TRIGSTRIP:
            m_mesh.addVertex(v, m_norm, color_value);
            break;

        case DRAWMODE_TRIGFAN:
            m_mesh.addVertex(v, m_norm, color_value);
            break;
    }
}

void DisplayList::normal(const qlib::Vector4D &av)
{
    qlib::Vector4D v(av);
    xform_norm(v);

#ifdef MB_DEBUG
    if (!qlib::isFinite(v.x()) || !qlib::isFinite(v.y()) || !qlib::isFinite(v.z())) {
        LOG_DPRINTLN("DisplayList> ERROR: invalid mesh norm");
    }
#endif

    const double len = v.length();
    if (len < F_EPS4) {
        LOG_DPRINTLN("DisplayList> Normal vector <%f,%f,%f> is too small.", v.x(),
                     v.y(), v.z());
        m_norm = qlib::Vector4D(1.0, 0.0, 0.0);
        return;
    }
    m_norm = v.scale(1.0 / len);
}

void DisplayList::color(const gfx::ColorPtr &c)
{
    m_pColor = c;
    m_bSetColor = true;
}

void DisplayList::setPolygonMode(int id)
{
    if (id == POLY_POINT) {
        MB_DPRINTLN("POLY_POINT mode is not supported (ignored)");
    } else if (id == POLY_LINE) {
        m_nPolyMode = gfx::AbstDrawElem::DRAW_LINES;
        MB_DPRINTLN("POLY_LINE mode is not supported (ignored)");
    } else {
        m_nPolyMode = gfx::AbstDrawElem::DRAW_TRIANGLES;
    }
}

void DisplayList::startPoints()
{
    m_nDrawMode = DRAWMODE_POINTS;
}

void DisplayList::startPolygon()
{
    MB_DPRINTLN("polygon is not supported (vertex command ignored.)");
}

void DisplayList::startLines()
{
    if (m_nDrawMode != DRAWMODE_NONE) {
        MB_DPRINTLN("DisplayList::startLines ERR: %d", m_nDrawMode);
        MB_THROW(qlib::RuntimeException, "DisplayList: Unexpected condition");
        return;
    }
    m_nDrawMode = DRAWMODE_LINES;
    m_vertLineWidth = -1.0;
    m_bVertStipple = false;
    m_bSetColor = false;
}

void DisplayList::startLineStrip()
{
    if (m_nDrawMode != DRAWMODE_NONE) {
        MB_THROW(qlib::RuntimeException, "DisplayList: Unexpected condition");
        return;
    }
    m_nDrawMode = DRAWMODE_LINESTRIP;
    m_vertLineWidth = -1.0;
    m_bVertStipple = false;
    m_bSetColor = false;
}

void DisplayList::startTriangles()
{
    if (m_nDrawMode != DRAWMODE_NONE) {
        MB_THROW(qlib::RuntimeException, "DisplayList: Unexpected condition");
        return;
    }
    m_nDrawMode = DRAWMODE_TRIGS;
}

void DisplayList::startTriangleStrip()
{
    if (m_nDrawMode != DRAWMODE_NONE) {
        MB_THROW(qlib::RuntimeException, "DisplayList: Unexpected condition");
        return;
    }
    m_nDrawMode = DRAWMODE_TRIGSTRIP;
    m_mesh.start(gfx::GrowMesh<qlib::quint32>::GM_TRIGSTRIP);
}

void DisplayList::startTriangleFan()
{
    if (m_nDrawMode != DRAWMODE_NONE) {
        MB_THROW(qlib::RuntimeException, "DisplayList: Unexpected condition");
        return;
    }
    m_nDrawMode = DRAWMODE_TRIGFAN;
    m_mesh.start(gfx::GrowMesh<qlib::quint32>::GM_TRIGFAN);
}

void DisplayList::end()
{
    switch (m_nDrawMode) {
        case DRAWMODE_LINES:
        case DRAWMODE_LINESTRIP:
            m_fPrevPosValid = false;
            break;

        case DRAWMODE_TRIGS:
            break;

        case DRAWMODE_TRIGFAN:
            m_mesh.end();
            break;

        case DRAWMODE_TRIGSTRIP:
            m_mesh.end();
            break;
    }
    m_nDrawMode = DRAWMODE_NONE;
}

void DisplayList::drawLine(const qlib::Vector4D &v1, qlib::quint32 c1,
                           const qlib::Vector4D &v2, qlib::quint32 c2)
{
    m_lineBuf.push_back(LineDrawAttr{v1, c1});
    m_lineBuf.push_back(LineDrawAttr{v2, c2});
}

void DisplayList::addTrigVert(const qlib::Vector4D &v1, const qlib::Vector4D &n1,
                              qlib::quint32 c1)
{
    m_trigBuf.push_back(TrigVertBuf{
        qfloat32(v1.x()),
        qfloat32(v1.y()),
        qfloat32(v1.z()),
        qfloat32(n1.x()),
        qfloat32(n1.y()),
        qfloat32(n1.z()),
        c1,
    });
}

bool DisplayList::recordStart()
{
    MB_DPRINTLN("DisplayList::recordStart called");

    delete m_pLineObj;
    m_pLineObj = nullptr;

    delete m_pTrigObj;
    m_pTrigObj = nullptr;

    delete m_pTrigMeshObj;
    m_pTrigMeshObj = nullptr;

    m_lineBuf.clear();
    m_trigBuf.clear();
    m_mesh.clear();

    m_fValid = false;

    clearMatStack();

    return true;
}

void DisplayList::recordEnd()
{
    MB_DPRINTLN("DisplayList::recordEnd called");

    m_fValid = true;

    // Convert sphere/cylinder data into m_mesh (indexed tri mesh)
    convertToMesh();
}

bool DisplayList::isDisplayList() const
{
    return true;
}

void DisplayList::createLineObj(DisplayContext *pdc)
{
    const size_t nelems = m_lineBuf.size();
    MB_DPRINTLN("DisplayList.createLineObj> nelems=%zu", nelems);
    if (nelems == 0) return;

    MB_ASSERT(m_pLineObj == nullptr);
    m_pLineObj = MB_NEW gfx::LineGpuPrim();
    m_pLineObj->init(pdc);
    m_pLineObj->alloc(nelems / 2);

    for (size_t i = 0; i < nelems; i += 2) {
        m_pLineObj->setLine(i / 2,
                            m_lineBuf[i].pos, m_lineBuf[i].cc,
                            m_lineBuf[i + 1].pos, m_lineBuf[i + 1].cc);
    }
    auto lw = m_vertLineWidth;
    if (lw < 0) {
        lw = pdc->getLineWidth();
        if (lw < 0) {
            lw = 1.0;
        }
    }
    m_pLineObj->setLineWidth(lw * pdc->getPixSclFac());
    m_pLineObj->setStipple(m_bVertStipple);
    m_pLineObj->setUpdated(true);
    if (!m_bSetColor) {
        m_pLineObj->setUseVertColor(false);
    }
    m_lineBuf.clear();
}

void DisplayList::createTrigObj(DisplayContext *pdc)
{
    const size_t n = m_trigBuf.size();
    MB_DPRINTLN("DisplayList.createTrigObj> nverts=%zu", n);
    if (n == 0) return;

    MB_ASSERT(m_pTrigObj == nullptr);
    m_pTrigObj = MB_NEW gfx::TrigGpuPrim();
    m_pTrigObj->init(pdc);
    m_pTrigObj->alloc(n, n / 3);

    for (size_t i = 0; i < n; ++i) {
        const auto &e = m_trigBuf[i];
        m_pTrigObj->setVertex(i, qlib::Vector4D(e.x, e.y, e.z));
        m_pTrigObj->setNormal(i, qlib::Vector4D(e.nx, e.ny, e.nz));
        m_pTrigObj->setColor(i, e.cc);
    }
    for (size_t i = 0; i < n / 3; ++i) {
        m_pTrigObj->setFace(i, i * 3, i * 3 + 1, i * 3 + 2);
    }
    m_pTrigObj->setUpdated(true);
    m_trigBuf.clear();
}

void DisplayList::createTrigMeshObj(DisplayContext *pdc)
{
    const size_t nMeshVerts = m_mesh.getVertexSize();
    const size_t nMeshFaces = m_mesh.getFaceSize();
    MB_DPRINTLN("DisplayList.createTrigMeshObj> Verts=%zu, Faces=%zu", nMeshVerts,
                nMeshFaces);
    if (nMeshFaces == 0) return;

    MB_ASSERT(m_pTrigMeshObj == nullptr);
    m_pTrigMeshObj = MB_NEW gfx::TrigGpuPrim();
    m_pTrigMeshObj->init(pdc);
    m_pTrigMeshObj->alloc(nMeshVerts, nMeshFaces);

    size_t i = 0;
    for (const auto *pelem : m_mesh.getVertexData()) {
        const auto &c1 = pelem->c;
        const auto &v1 = pelem->v;
        const auto &n1 = pelem->n;
        m_pTrigMeshObj->setVertex(i, v1);
        m_pTrigMeshObj->setNormal(i, n1);
        m_pTrigMeshObj->setColor(i, c1);
        ++i;
    }
    i = 0;
    for (const auto &face : m_mesh.getFaceData()) {
        m_pTrigMeshObj->setFace(i, face.iv1, face.iv2, face.iv3);
        ++i;
    }
    m_pTrigMeshObj->setUpdated(true);
    m_mesh.clear();
}

void DisplayList::callDisplayListImpl(gfx::DisplayContext *pdc)
{
    // Lazy initialization: create GpuPrim on first call
    if (m_pLineObj == nullptr && !m_lineBuf.empty()) {
        createLineObj(pdc);
    }
    if (m_pTrigObj == nullptr && !m_trigBuf.empty()) {
        createTrigObj(pdc);
    }
    if (m_pTrigMeshObj == nullptr && m_mesh.getFaceSize() > 0) {
        createTrigMeshObj(pdc);
    }

    // Draw
    if (m_pLineObj != nullptr) {
        m_pLineObj->draw(pdc);
    }
    if (m_pTrigObj != nullptr) {
        m_pTrigObj->setEdgeLineType(pdc->getEdgeLineType());
        m_pTrigObj->draw(pdc);
    }
    if (m_pTrigMeshObj != nullptr) {
        m_pTrigMeshObj->setEdgeLineType(pdc->getEdgeLineType());
        m_pTrigMeshObj->draw(pdc);
    }
}

void DisplayList::drawMesh(const gfx::Mesh &mesh)
{
    MB_ASSERT(m_mesh.getFaceSize() == 0 && m_pTrigMeshObj == nullptr);

    const size_t nMeshVerts = mesh.getVertSize();
    const size_t nMeshFaces = mesh.getFaceSize();
    if (nMeshFaces == 0) return;

    MB_DPRINTLN("DisplayList.drawMesh> Verts=%zu, Faces=%zu", nMeshVerts, nMeshFaces);

    qlib::uid_t nSceneID = getSceneID();
    gfx::ColorPtr pcol;
    for (size_t i = 0; i < nMeshVerts; ++i) {
        mesh.getCol(pcol, i);
        auto c1 = pcol->getDevCode(nSceneID);
        m_mesh.addVertex(mesh.getVertex(i), mesh.getNormal(i), c1);
    }

    auto faces = mesh.getFaces();
    for (size_t i = 0; i < nMeshFaces; ++i) {
        m_mesh.addFace(faces[i * 3], faces[i * 3 + 1], faces[i * 3 + 2]);
    }
}

void DisplayList::sphere()
{
    MB_DPRINTLN("DisplayList::sphere()");

    qlib::Vector4D v(0, 0, 0);
    xform_vec(v);

    auto color = m_pColor->getDevCode(getSceneID());
    const qlib::Matrix4D &mtop = getModelViewMat();
    if (mtop.isIdentAffine(F_EPS4)) {
        m_spheres.add(v, 1.0, color, m_nDetail);
    } else {
        m_spheres.add(qlib::Vector4D(0, 0, 0), 1.0, color, m_nDetail, &mtop);
    }
}

void DisplayList::cone(double r1, double r2, const qlib::Vector4D &pos1,
                       const qlib::Vector4D &pos2, bool bCap)
{
    MB_DPRINTLN("DisplayList::cone()");
    constexpr double dtol = F_EPS4;

    if (pos1.equals(pos2, dtol)) return;

    const auto &xm = getModelViewMat();
    auto xm3 = xm.getMatrix3D();
    bool bUnitary = true;
    if (!xm3.isIdent()) {
        auto test = xm3.transpose() * xm3;
        bUnitary = test.isIdent(dtol);
    }

    auto color = m_pColor->getDevCode(getSceneID());
    if (bUnitary) {
        qlib::Vector4D p1 = pos1;
        qlib::Vector4D p2 = pos2;
        xform_vec(p1);
        xform_vec(p2);
        m_cylinders.add(p1, p2, r1, r2, color, m_nDetail, bCap, NULL);
    } else {
        m_cylinders.add(pos1, pos2, r1, r2, color, m_nDetail, bCap, &xm);
    }
}

void DisplayList::setDetail(int n)
{
    MB_DPRINTLN("DisplayList::setDetail(%d)", n);
    m_nDetail = n;
}

int DisplayList::getDetail() const
{
    return m_nDetail;
}

void DisplayList::convertToMesh()
{
    MB_DPRINTLN("convertToMesh num sphs: %d", m_spheres.getSize());
    m_spheres.makeMesh(&m_mesh);
    m_spheres.eraseAll();

    MB_DPRINTLN("convertToMesh num cyls: %d", m_cylinders.getSize());
    m_cylinders.makeMesh(&m_mesh);
    m_cylinders.eraseAll();
}

}  // namespace gfx
