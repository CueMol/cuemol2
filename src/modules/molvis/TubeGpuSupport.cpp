// -*-Mode: C++;-*-
//
//  GPU mesh support for the tube-like renderers
//

#include <common.h>

#include "TubeGpuSupport.hpp"

#include <gfx/DisplayContext.hpp>
#include <qsys/ObjectEvent.hpp>
#include <qlib/parallel.hpp>

#include <algorithm>
#include <atomic>
#include <limits>

using namespace molvis;
using gfx::DisplayContext;

int TubeGpuSupport::s_nParallelMinVerts = TubeGpuSupport::TG_DEFAULT_PARALLEL_MIN_VERTS;
size_t TubeGpuSupport::s_nMaxBufferBytes = 0;

namespace {

/// The primitive's re-upload flags for the builder's update flags
int toPrimUpdateFlags(int nMeshFlags)
{
    int nFlags = 0;
    if (nMeshFlags & TubeMeshBuilder::UPD_GEOM) nFlags |= gfx::TrigGpuPrim::UPD_GEOM;
    if (nMeshFlags & TubeMeshBuilder::UPD_COLOR) nFlags |= gfx::TrigGpuPrim::UPD_COLOR;
    return nFlags;
}

}  // namespace

TubeGpuSupport::TubeGpuSupport()
    : m_bCheckShader(false),
      m_bUseShader(false),
      m_bTopoValid(false),
      m_bHasMesh(false),
      m_nDirty(0),
      m_nPolyMode(DisplayContext::POLY_FILL),
      m_bColorOnly(false),
      m_nLastPass(TG_PASS_NONE),
      m_bChunked(false),
      m_bParallel(false),
      m_bTooLarge(false)
{
}

TubeGpuSupport::TubeGpuSupport(const TubeGpuSupport &)
    : TubeGpuSupport()
{
}

TubeGpuSupport::~TubeGpuSupport()
{
}

bool TubeGpuSupport::tubeGpuPrepare(DisplayContext *pdc)
{
    if (!tubeGpuIsEnabled() || pdc->isFile()) return false;

    if (!m_bCheckShader) {
        m_bUseShader = m_prim.init(pdc);
        m_bCheckShader = true;
    }
    if (!m_bUseShader) return false;

    // The index buffer is laid out for fill or wireframe at allocation
    const int nPolyMode = (pdc->getPolygonMode() == DisplayContext::POLY_LINE)
                              ? DisplayContext::POLY_LINE
                              : DisplayContext::POLY_FILL;
    if (m_bTopoValid && nPolyMode != m_nPolyMode) m_bTopoValid = false;

    m_nLastPass = TG_PASS_NONE;
    if (!m_bTopoValid) {
        build(pdc, nPolyMode);
        m_nLastPass = m_bTooLarge ? TG_PASS_TOO_LARGE : TG_PASS_BUILD;
        return true;
    }

    if (m_nDirty != 0) {
        // The update traversal writes straight into the attribute blocks of
        // the primitive (see updateMesh()): only the upload of the blocks it
        // wrote is left
        const int nFlags = m_nDirty;
        if (updateMesh()) {
            if (m_bHasMesh) m_prim.markUpdated(toPrimUpdateFlags(nFlags));
            m_nLastPass = m_bChunked ? TG_PASS_CHUNKED : TG_PASS_SERIAL;
        }
        else {
            MB_DPRINTLN("TubeGpuSupport> topology changed, rebuild the mesh");
            build(pdc, nPolyMode);
            m_nLastPass = m_bTooLarge ? TG_PASS_TOO_LARGE : TG_PASS_BUILD;
        }
    }
    return true;
}

void TubeGpuSupport::buildMesh(int nMaxVerts)
{
    m_mb.startBuild(tubeGpuSceneID(), nMaxVerts);
    tubeGpuRenderMesh();
    m_mb.finish();

    m_nDirty = 0;
    m_bTopoValid = true;
    m_bHasMesh = m_mb.getFaceSize() > 0;
}

bool TubeGpuSupport::updateMesh()
{
    const int nFlags = m_nDirty;
    m_nDirty = 0;
    m_bChunked = false;
    m_bParallel = false;
    if (!m_bTopoValid || nFlags == 0) return m_bTopoValid;
    // The update goes into the primitive's vertex array; without faces there
    // is no primitive and nothing to update
    if (!m_bHasMesh) return true;
    const gfx::TrigGpuPrim::PackedArrays dst = m_prim.getPackedArrays();

    if (nFlags == TubeMeshBuilder::UPD_GEOM &&
        tubeGpuCanUpdateChunks() && m_mb.chunksCoverAll()) {
        // Coordinate-only update of a mesh made of independent chunks: the
        // chunks write disjoint vertex ranges, so redraw them in parallel.
        // A small mesh is cheaper to update (and prepare) on this thread (see
        // TG_DEFAULT_PARALLEL_MIN_VERTS). (Colors are not computed here; a
        // color update goes through the serial traversal below.)
        m_bParallel = m_mb.getVertexSize() >= s_nParallelMinVerts;
        qlib::SerialScope serial(!m_bParallel);

        tubeGpuPrepareChunkUpdate();
        const qlib::uid_t nSceneID = tubeGpuSceneID();
        std::atomic<bool> bOK(true);
        auto updateChunk = [&](std::size_t i) {
            TubeMeshBuilder mb;
            mb.startChunkUpdate(nSceneID, nFlags, dst, m_mb, int(i));
            tubeGpuUpdateChunk(int(i), &mb);
            if (!mb.finish()) bOK = false;
        };
        qlib::parallel_for(0, m_mb.getChunks().size(), updateChunk);
        m_bChunked = true;
        return bOK;
    }

    m_mb.startUpdate(tubeGpuSceneID(), nFlags, dst);
    tubeGpuRenderMesh();
    return m_mb.finish();
}

void TubeGpuSupport::build(DisplayContext *pdc, int nPolyMode)
{
    // A buffer larger than the context can allocate in one piece (see
    // DisplayContext::getMaxBufferBytes()) would fail the allocation, which
    // in the Electron process stops it: check the vertex buffer while
    // recording (the recording stops at the limit) and the index buffer
    // before allocating, and do not draw such a mesh.
    size_t nMaxBytes = pdc->getMaxBufferBytes();
    if (s_nMaxBufferBytes > 0) nMaxBytes = std::min(nMaxBytes, s_nMaxBufferBytes);
    const size_t nVertBytes = sizeof(gfx::TrigGpuPrim::PackedUnit);
    const int nMaxVerts =
        int(std::min(nMaxBytes / nVertBytes, size_t(std::numeric_limits<int>::max())));

    buildMesh(nMaxVerts);
    m_nPolyMode = nPolyMode;

    const size_t nIndsPerFace = (nPolyMode == DisplayContext::POLY_LINE) ? 6 : 3;
    const size_t nIndBytes =
        size_t(m_mb.getFaceSize()) * nIndsPerFace * sizeof(qlib::quint32);
    m_bTooLarge = m_mb.isOverflow() || nIndBytes > nMaxBytes;
    if (m_bTooLarge) {
        if (m_mb.isOverflow())
            LOG_DPRINTLN("TubeGpuSupport> mesh not drawn: more than %d vertices "
                         "(%lld bytes), above the buffer limit of %lld bytes",
                         nMaxVerts, (long long) (size_t(nMaxVerts) * nVertBytes),
                         (long long) nMaxBytes);
        else
            LOG_DPRINTLN("TubeGpuSupport> mesh not drawn: %d faces need an index "
                         "buffer of %lld bytes, above the buffer limit of %lld bytes",
                         m_mb.getFaceSize(), (long long) nIndBytes,
                         (long long) nMaxBytes);
        m_mb.clear();
        m_bHasMesh = false;
    }
    if (!m_bHasMesh) {
        m_prim.invalidate();
        return;
    }
    m_prim.setPolygonMode(nPolyMode);
    m_mb.toGpuPrim(pdc, m_prim);
    // the primitive holds the vertex data from here on
    m_mb.releaseVertexData();
}

void TubeGpuSupport::tubeGpuDraw(DisplayContext *pdc)
{
    if (!m_bHasMesh) return;
    m_prim.setEdgeLineType(pdc->getEdgeLineType());
    m_prim.draw(pdc);
}

bool TubeGpuSupport::tubeGpuDisplay(DisplayContext *pdc)
{
    if (!tubeGpuPrepare(pdc)) return false;
    if (!m_bHasMesh) return true;
    tubeGpuPreRender(pdc);
    tubeGpuDraw(pdc);
    tubeGpuPostRender(pdc);
    return true;
}

bool TubeGpuSupport::tubeGpuDisplayPick(DisplayContext *pdc)
{
    if (!tubeGpuPrepare(pdc)) return false;
    tubeGpuDraw(pdc);
    return true;
}

void TubeGpuSupport::tubeGpuOnInvalidateDisplay()
{
    if (!m_bColorOnly || !tubeGpuMarkDirty(TubeMeshBuilder::UPD_COLOR)) tubeGpuInvalidate();
}

bool TubeGpuSupport::tubeGpuOnAtomsMoved(qsys::ObjectEvent &ev)
{
    if (ev.getType() != qsys::ObjectEvent::OBE_CHANGED ||
        !ev.getDescr().equals("atomsMoved"))
        return false;
    return tubeGpuMarkDirty(TubeMeshBuilder::UPD_GEOM);
}

void TubeGpuSupport::tubeGpuInvalidate()
{
    m_bTopoValid = false;
    m_bHasMesh = false;
    m_bTooLarge = false;
    m_nDirty = 0;
    m_mb.clear();
    m_prim.invalidate();
}

bool TubeGpuSupport::tubeGpuMarkDirty(int nFlags)
{
    if (!m_bTopoValid) return false;
    m_nDirty |= nFlags;
    return true;
}

void TubeGpuSupport::tubeGpuUnload()
{
    tubeGpuInvalidate();
}
