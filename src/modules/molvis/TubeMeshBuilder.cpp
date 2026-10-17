// -*-Mode: C++;-*-
//
//  Tube mesh builder implementation
//

#include <common.h>

#include "TubeMeshBuilder.hpp"

#include <gfx/DisplayContext.hpp>
#include <gfx/SolidColor.hpp>
#include <gfx/TrigGpuPrim.hpp>

using namespace molvis;
using qlib::quint32;

TubeMeshBuilder::TubeMeshBuilder()
    : m_nMode(MODE_NONE),
      m_nUpdFlags(0),
      m_pdl(nullptr),
      m_nSceneID(qlib::invalid_uid),
      m_curCol(0),
      m_curName(0),
      m_nPrimType(-1),
      m_nPrimFirst(0),
      m_nVertCur(0),
      m_nPrimCur(0),
      m_bMismatch(false)
{
    m_curNorm[0] = 1.0f;
    m_curNorm[1] = 0.0f;
    m_curNorm[2] = 0.0f;
}

TubeMeshBuilder::~TubeMeshBuilder()
{
}

//////////////////////////////////////////////////////////////////////////
// Mode control

void TubeMeshBuilder::startDirect(DisplayContext *pdl)
{
    m_nMode = MODE_DIRECT;
    m_pdl = pdl;
}

void TubeMeshBuilder::startBuild(qlib::uid_t nSceneID)
{
    clear();
    m_nMode = MODE_BUILD;
    m_nUpdFlags = UPD_GEOM | UPD_COLOR;
    m_pdl = nullptr;
    m_nSceneID = nSceneID;

    // Same initial state as gfx::DisplayList
    m_curCol = gfx::SolidColor::createRGB(0.5, 0.5, 0.5)->getDevCode(nSceneID);
    m_curName = gfx::encodeHitName(-1);
    m_nPrimType = -1;
}

void TubeMeshBuilder::startUpdate(qlib::uid_t nSceneID, int nFlags)
{
    m_nMode = MODE_UPDATE;
    m_nUpdFlags = nFlags;
    m_pdl = nullptr;
    m_nSceneID = nSceneID;
    m_curCol = gfx::SolidColor::createRGB(0.5, 0.5, 0.5)->getDevCode(nSceneID);
    m_nPrimType = -1;
    m_nVertCur = 0;
    m_nPrimCur = 0;
    m_bMismatch = false;
}

bool TubeMeshBuilder::finish()
{
    bool bOK = true;
    if (m_nMode == MODE_UPDATE) {
        bOK = !m_bMismatch && m_nVertCur == getVertexSize() &&
              m_nPrimCur == int(m_prims.size());
    }
    m_nMode = MODE_NONE;
    m_pdl = nullptr;
    return bOK;
}

void TubeMeshBuilder::clear()
{
    m_pos.clear();
    m_norm.clear();
    m_col.clear();
    m_name.clear();
    m_prims.clear();
}

//////////////////////////////////////////////////////////////////////////
// Drawing interface

void TubeMeshBuilder::color(const gfx::ColorPtr &pCol)
{
    if (m_nMode == MODE_DIRECT) {
        m_pdl->color(pCol);
        return;
    }
    // The update traversal may skip the color computation (null color)
    if (isRecording() && (m_nUpdFlags & UPD_COLOR) && !pCol.isnull())
        m_curCol = pCol->getDevCode(m_nSceneID);
}

void TubeMeshBuilder::loadName(int nName)
{
    if (m_nMode == MODE_DIRECT) {
        m_pdl->loadName(nName);
        return;
    }
    if (m_nMode == MODE_BUILD)
        m_curName = gfx::encodeHitName(nName);
}

void TubeMeshBuilder::normal(const Vector4D &n)
{
    if (m_nMode == MODE_DIRECT) {
        m_pdl->normal(n);
        return;
    }
    if (!isRecording() || !(m_nUpdFlags & UPD_GEOM))
        return;

    // Same normalization as gfx::DisplayList::normal()
    const double len = n.length();
    if (len < F_EPS4) {
        m_curNorm[0] = 1.0f;
        m_curNorm[1] = 0.0f;
        m_curNorm[2] = 0.0f;
        return;
    }
    m_curNorm[0] = float(n.x() / len);
    m_curNorm[1] = float(n.y() / len);
    m_curNorm[2] = float(n.z() / len);
}

void TubeMeshBuilder::startPrim(int nType)
{
    if (m_nMode == MODE_BUILD) {
        m_nPrimType = nType;
        m_nPrimFirst = getVertexSize();
    }
    else if (m_nMode == MODE_UPDATE) {
        if (m_nPrimCur >= int(m_prims.size()) || m_prims[m_nPrimCur].type != nType ||
            m_prims[m_nPrimCur].first != m_nVertCur)
            m_bMismatch = true;
        m_nPrimType = nType;
        m_nPrimFirst = m_nVertCur;
    }
}

void TubeMeshBuilder::startTriangleStrip()
{
    if (m_nMode == MODE_DIRECT)
        m_pdl->startTriangleStrip();
    else
        startPrim(PRIM_STRIP);
}

void TubeMeshBuilder::startTriangleFan()
{
    if (m_nMode == MODE_DIRECT)
        m_pdl->startTriangleFan();
    else
        startPrim(PRIM_FAN);
}

void TubeMeshBuilder::vertex(const Vector4D &v)
{
    if (m_nMode == MODE_DIRECT) {
        m_pdl->vertex(v);
        return;
    }

    if (m_nMode == MODE_BUILD) {
        m_pos.push_back(float(v.x()));
        m_pos.push_back(float(v.y()));
        m_pos.push_back(float(v.z()));
        m_norm.push_back(m_curNorm[0]);
        m_norm.push_back(m_curNorm[1]);
        m_norm.push_back(m_curNorm[2]);
        m_col.push_back(m_curCol);
        m_name.push_back(m_curName);
        return;
    }

    if (m_nMode != MODE_UPDATE)
        return;

    const int i = m_nVertCur;
    ++m_nVertCur;
    if (i >= getVertexSize()) {
        m_bMismatch = true;
        return;
    }
    if (m_nUpdFlags & UPD_GEOM) {
        m_pos[i * 3 + 0] = float(v.x());
        m_pos[i * 3 + 1] = float(v.y());
        m_pos[i * 3 + 2] = float(v.z());
        m_norm[i * 3 + 0] = m_curNorm[0];
        m_norm[i * 3 + 1] = m_curNorm[1];
        m_norm[i * 3 + 2] = m_curNorm[2];
    }
    if (m_nUpdFlags & UPD_COLOR)
        m_col[i] = m_curCol;
}

void TubeMeshBuilder::end()
{
    if (m_nMode == MODE_DIRECT) {
        m_pdl->end();
        return;
    }

    if (m_nMode == MODE_BUILD) {
        const int nCount = getVertexSize() - m_nPrimFirst;
        m_prims.push_back(Prim{m_nPrimType, m_nPrimFirst, nCount});
    }
    else if (m_nMode == MODE_UPDATE) {
        if (m_nPrimCur >= int(m_prims.size()) ||
            m_prims[m_nPrimCur].count != m_nVertCur - m_nPrimFirst)
            m_bMismatch = true;
        ++m_nPrimCur;
    }
    m_nPrimType = -1;
}

void TubeMeshBuilder::setPolygonMode(int nMode)
{
    if (m_nMode == MODE_DIRECT) m_pdl->setPolygonMode(nMode);
}

void TubeMeshBuilder::attribute(int nAttr)
{
    if (m_nMode == MODE_DIRECT) m_pdl->attribute(nAttr);
}

void TubeMeshBuilder::setLighting(bool b)
{
    if (m_nMode == MODE_DIRECT) m_pdl->setLighting(b);
}

//////////////////////////////////////////////////////////////////////////
// GPU primitive

int TubeMeshBuilder::getFaceSize() const
{
    int nFaces = 0;
    for (const Prim &p : m_prims) {
        if (p.count >= 3) nFaces += p.count - 2;
    }
    return nFaces;
}

void TubeMeshBuilder::toGpuPrim(DisplayContext *pdc, gfx::TrigGpuPrim &prim) const
{
    const int nVerts = getVertexSize();
    const int nFaces = getFaceSize();
    prim.alloc(pdc, nVerts, nFaces);

    updateGpuPrim(prim, UPD_GEOM | UPD_COLOR);
    for (int i = 0; i < nVerts; ++i) prim.setHitName(i, m_name[i]);

    // Same triangulation (and winding) as gfx::GrowMesh
    int iface = 0;
    for (const Prim &p : m_prims) {
        const int b = p.first;
        for (int i = 2; i < p.count; ++i) {
            if (p.type == PRIM_FAN)
                prim.setFace(iface, b + i - 1, b + i, b);
            else if (i % 2 == 0)
                prim.setFace(iface, b + i - 2, b + i - 1, b + i);
            else
                prim.setFace(iface, b + i, b + i - 1, b + i - 2);
            ++iface;
        }
    }
    prim.setUpdated(true);
}

void TubeMeshBuilder::updateGpuPrim(gfx::TrigGpuPrim &prim, int nFlags) const
{
    const int nVerts = getVertexSize();
    for (int i = 0; i < nVerts; ++i) {
        if (nFlags & UPD_GEOM) {
            prim.setVertex(i, getPos(i));
            prim.setNormal(i, getNorm(i));
        }
        if (nFlags & UPD_COLOR)
            prim.setColor(i, m_col[i]);
    }
    prim.setUpdated(true);
}
