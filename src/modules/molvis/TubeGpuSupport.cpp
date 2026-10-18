// -*-Mode: C++;-*-
//
//  GPU mesh support for the tube-like renderers
//

#include <common.h>

#include "TubeGpuSupport.hpp"

#include <gfx/DisplayContext.hpp>
#include <qsys/ObjectEvent.hpp>

using namespace molvis;
using gfx::DisplayContext;

TubeGpuSupport::TubeGpuSupport()
    : m_bCheckShader(false),
      m_bUseShader(false),
      m_bTopoValid(false),
      m_bHasMesh(false),
      m_nDirty(0),
      m_nPolyMode(DisplayContext::POLY_FILL),
      m_bColorOnly(false)
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

    if (!m_bTopoValid) {
        build(pdc, nPolyMode);
        return true;
    }

    if (m_nDirty != 0) {
        const int nFlags = m_nDirty;
        if (tubeGpuUpdateMesh()) {
            if (m_bHasMesh) m_mb.updateGpuPrim(m_prim, nFlags);
        }
        else {
            MB_DPRINTLN("TubeGpuSupport> topology changed, rebuild the mesh");
            build(pdc, nPolyMode);
        }
    }
    return true;
}

void TubeGpuSupport::tubeGpuBuildMesh()
{
    m_mb.startBuild(tubeGpuSceneID());
    tubeGpuRenderMesh();
    m_mb.finish();

    m_nDirty = 0;
    m_bTopoValid = true;
    m_bHasMesh = m_mb.getFaceSize() > 0;
}

bool TubeGpuSupport::tubeGpuUpdateMesh()
{
    const int nFlags = m_nDirty;
    m_nDirty = 0;
    if (!m_bTopoValid || nFlags == 0) return m_bTopoValid;
    m_mb.startUpdate(tubeGpuSceneID(), nFlags);
    tubeGpuRenderMesh();
    return m_mb.finish();
}

void TubeGpuSupport::build(DisplayContext *pdc, int nPolyMode)
{
    tubeGpuBuildMesh();
    m_nPolyMode = nPolyMode;
    if (!m_bHasMesh) {
        m_prim.invalidate();
        return;
    }
    m_prim.setPolygonMode(nPolyMode);
    m_mb.toGpuPrim(pdc, m_prim);
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
