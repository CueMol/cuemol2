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

bool TubeMeshBuilder::s_bShareRings = true;

TubeMeshBuilder::TubeMeshBuilder()
    : m_nMode(MODE_NONE),
      m_nUpdFlags(0),
      m_pdl(nullptr),
      m_nSceneID(qlib::invalid_uid),
      m_curCol(0),
      m_curName(0),
      m_nPrimType(-1),
      m_nPrimFirst(0),
      m_bRingPrim(false),
      m_nRingFirst(-1),
      m_nRingStride(0),
      m_nRingSize(0),
      m_nVerts(0),
      m_bReleased(false),
      m_dst{nullptr, nullptr, nullptr, nullptr},
      m_nVertCur(0),
      m_nPrimCur(0),
      m_nPrimEnd(0),
      m_bMismatch(false),
      m_pPrimsRef(nullptr),
      m_nChunkVert(0),
      m_nChunkPrim(0)
{
    m_curNorm[0] = 1.0f;
    m_curNorm[1] = 0.0f;
    m_curNorm[2] = 0.0f;
    m_curNormPacked = gfx::TrigGpuPrim::packNormal(1.0f, 0.0f, 0.0f);
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
    resetRing();
}

void TubeMeshBuilder::startUpdate(qlib::uid_t nSceneID, int nFlags,
                                  const gfx::TrigGpuPrim::PackedArrays &dst)
{
    MB_ASSERT(dst.pos != nullptr);
    m_dst = dst;
    m_nMode = MODE_UPDATE;
    m_nUpdFlags = nFlags;
    m_pdl = nullptr;
    m_nSceneID = nSceneID;
    m_curCol = gfx::SolidColor::createRGB(0.5, 0.5, 0.5)->getDevCode(nSceneID);
    m_nPrimType = -1;
    m_nVertCur = 0;
    m_nPrimCur = 0;
    m_nPrimEnd = int(m_prims.size());
    m_pPrimsRef = nullptr;
    m_bMismatch = false;
    resetRing();
}

void TubeMeshBuilder::startChunkUpdate(qlib::uid_t nSceneID, int nFlags,
                                       const gfx::TrigGpuPrim::PackedArrays &dst,
                                       const TubeMeshBuilder &parent, int ichunk)
{
    MB_ASSERT(dst.pos != nullptr);
    const Chunk &ck = parent.m_chunks[ichunk];
    m_nMode = MODE_UPDATE;
    m_nUpdFlags = nFlags;
    m_pdl = nullptr;
    m_nSceneID = nSceneID;
    m_dst = dst;
    m_bReleased = true;  // no vertex data of its own
    m_curCol = parent.m_curCol;
    m_nPrimType = -1;
    // the range of the chunk: m_nVerts is the end of the writable range
    m_nVertCur = ck.firstVert;
    m_nVerts = ck.firstVert + ck.nVerts;
    m_nPrimCur = ck.firstPrim;
    m_nPrimEnd = ck.firstPrim + ck.nPrims;
    m_pPrimsRef = &parent.m_prims;
    m_bMismatch = false;
    resetRing();
}

bool TubeMeshBuilder::chunksCoverAll() const
{
    if (m_chunks.empty()) return false;
    long nverts = 0;
    for (const Chunk &ck : m_chunks) nverts += ck.nVerts;
    return nverts == m_nVerts;
}

bool TubeMeshBuilder::finish()
{
    bool bOK = true;
    if (m_nMode == MODE_UPDATE) {
        bOK = !m_bMismatch && m_nVertCur == m_nVerts && m_nPrimCur == m_nPrimEnd;
    }
    m_nMode = MODE_NONE;
    m_pdl = nullptr;
    m_dst = gfx::TrigGpuPrim::PackedArrays{nullptr, nullptr, nullptr, nullptr};
    return bOK;
}

void TubeMeshBuilder::clear()
{
    releaseVertexData();
    m_prims.clear();
    m_chunks.clear();
    m_nVerts = 0;
    m_bReleased = false;
}

void TubeMeshBuilder::releaseVertexData()
{
    // swap with empty vectors to free the memory
    std::vector<float>().swap(m_pos);
    std::vector<float>().swap(m_norm);
    std::vector<qlib::quint32>().swap(m_col);
    std::vector<qlib::quint32>().swap(m_name);
    m_bReleased = true;
}

//////////////////////////////////////////////////////////////////////////
// Drawing interface

void TubeMeshBuilder::colorSlow(const gfx::ColorPtr &pCol)
{
    if (m_nMode == MODE_DIRECT) {
        m_pdl->color(pCol);
        return;
    }
    // The update traversal may skip the color computation (null color)
    if (isRecording() && (m_nUpdFlags & UPD_COLOR) && !pCol.isnull())
        m_curCol = pCol->getDevCode(m_nSceneID);
}

void TubeMeshBuilder::loadNameSlow(int nName)
{
    if (m_nMode == MODE_DIRECT) {
        m_pdl->loadName(nName);
        return;
    }
    if (m_nMode == MODE_BUILD)
        m_curName = gfx::encodeHitName(nName);
}

void TubeMeshBuilder::normalSlow(const Vector4D &n)
{
    if (m_nMode == MODE_DIRECT) {
        m_pdl->normal(n);
        return;
    }
    if (!isRecording() || !(m_nUpdFlags & UPD_GEOM))
        return;
    setCurNorm(n);
}

void TubeMeshBuilder::startPrim(int nType, bool bRing)
{
    m_bRingPrim = bRing;
    if (m_nMode == MODE_BUILD) {
        m_nPrimType = nType;
        m_nPrimFirst = getVertexSize();
    }
    else if (m_nMode == MODE_UPDATE) {
        const std::vector<Prim> &ps = prims();
        if (m_nPrimCur >= m_nPrimEnd || ps[m_nPrimCur].type != nType ||
            ps[m_nPrimCur].first != m_nVertCur ||
            (nType == PRIM_BAND && ps[m_nPrimCur].ref != m_nRingFirst))
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

void TubeMeshBuilder::startRingStrip()
{
    if (m_nMode == MODE_DIRECT)
        m_pdl->startTriangleStrip();
    else
        startPrim(PRIM_STRIP, true);
}

void TubeMeshBuilder::startRingBand()
{
    MB_ASSERT(hasRing());
    startPrim(PRIM_BAND, true);
}

void TubeMeshBuilder::vertexSlow(const Vector4D &v)
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
        ++m_nVerts;
        return;
    }

    if (m_nMode != MODE_UPDATE)
        return;

    // The update writes are inline (vertex()); reaching here in update mode
    // means more vertices than recorded
    ++m_nVertCur;
    m_bMismatch = true;
}

void TubeMeshBuilder::end()
{
    if (m_nMode == MODE_DIRECT) {
        m_pdl->end();
        return;
    }

    int nCount = 0;
    if (m_nMode == MODE_BUILD) {
        nCount = getVertexSize() - m_nPrimFirst;
        Prim prim{m_nPrimType, m_nPrimFirst, nCount};
        if (m_nPrimType == PRIM_BAND) {
            MB_ASSERT(nCount == m_nRingSize);
            prim.ref = m_nRingFirst;
            prim.refStride = m_nRingStride;
        }
        m_prims.push_back(prim);
    }
    else if (m_nMode == MODE_UPDATE) {
        nCount = m_nVertCur - m_nPrimFirst;
        if (m_nPrimCur >= m_nPrimEnd || prims()[m_nPrimCur].count != nCount)
            m_bMismatch = true;
        ++m_nPrimCur;
    }

    // The ring a following band connects to: the leading vertex of each
    // pair of a ring strip, or every vertex of a band
    if (m_bRingPrim && m_nPrimType == PRIM_STRIP) {
        m_nRingFirst = m_nPrimFirst;
        m_nRingStride = 2;
        m_nRingSize = (nCount + 1) / 2;
    }
    else if (m_bRingPrim && m_nPrimType == PRIM_BAND) {
        m_nRingFirst = m_nPrimFirst;
        m_nRingStride = 1;
        m_nRingSize = nCount;
    }
    else {
        resetRing();
    }
    m_bRingPrim = false;
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
        // a band is the strip of its vertices paired with the previous ring's
        const int nStrip = (p.type == PRIM_BAND) ? 2 * p.count : p.count;
        if (nStrip >= 3) nFaces += nStrip - 2;
    }
    return nFaces;
}

void TubeMeshBuilder::toGpuPrim(DisplayContext *pdc, gfx::TrigGpuPrim &prim) const
{
    MB_ASSERT(!m_bReleased);
    const int nVerts = getVertexSize();
    const int nFaces = getFaceSize();
    // The update traversal writes into the attribute blocks of this layout
    prim.setLayout(gfx::TrigGpuPrim::LAYOUT_PACKED);
    prim.alloc(pdc, nVerts, nFaces);

    for (int i = 0; i < nVerts; ++i) {
        prim.setVertex(i, getPos(i));
        prim.setNormal(i, getNorm(i));
        prim.setColor(i, m_col[i]);
        prim.setHitName(i, m_name[i]);
    }

    // Same triangulation (and winding) as gfx::GrowMesh
    int iface = 0;
    for (const Prim &p : m_prims) {
        const int b = p.first;
        if (p.type == PRIM_BAND) {
            // strip vertex k: the new ring's k/2-th vertex (even k) or the
            // previous ring's (k-1)/2-th (odd k)
            auto sv = [&p](int k) {
                return (k % 2 == 0) ? p.first + k / 2 : p.ref + (k / 2) * p.refStride;
            };
            for (int i = 2; i < 2 * p.count; ++i) {
                if (i % 2 == 0)
                    prim.setFace(iface, sv(i - 2), sv(i - 1), sv(i));
                else
                    prim.setFace(iface, sv(i), sv(i - 1), sv(i - 2));
                ++iface;
            }
            continue;
        }
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
