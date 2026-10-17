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

bool TubeGpuSupport::tgPrepare(DisplayContext *pdc)
{
    if (!tgIsEnabled() || pdc->isFile()) return false;

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
        if (tgUpdateMesh()) {
            if (m_bHasMesh) m_mb.updateGpuPrim(m_prim, nFlags);
        }
        else {
            MB_DPRINTLN("TubeGpuSupport> topology changed, rebuild the mesh");
            build(pdc, nPolyMode);
        }
    }
    return true;
}

void TubeGpuSupport::tgBuildMesh()
{
    m_mb.startBuild(tgSceneID());
    tgRenderMesh();
    m_mb.finish();

    m_nDirty = 0;
    m_bTopoValid = true;
    m_bHasMesh = m_mb.getFaceSize() > 0;
}

bool TubeGpuSupport::tgUpdateMesh()
{
    const int nFlags = m_nDirty;
    m_nDirty = 0;
    if (!m_bTopoValid || nFlags == 0) return m_bTopoValid;
    m_mb.startUpdate(tgSceneID(), nFlags);
    tgRenderMesh();
    return m_mb.finish();
}

void TubeGpuSupport::build(DisplayContext *pdc, int nPolyMode)
{
    tgBuildMesh();
    m_nPolyMode = nPolyMode;
    if (!m_bHasMesh) {
        m_prim.invalidate();
        return;
    }
    m_prim.setPolygonMode(nPolyMode);
    m_mb.toGpuPrim(pdc, m_prim);
}

void TubeGpuSupport::tgDraw(DisplayContext *pdc)
{
    if (!m_bHasMesh) return;
    m_prim.setEdgeLineType(pdc->getEdgeLineType());
    m_prim.draw(pdc);
}

bool TubeGpuSupport::tgDisplay(DisplayContext *pdc)
{
    if (!tgPrepare(pdc)) return false;
    if (!m_bHasMesh) return true;
    tgPreRender(pdc);
    tgDraw(pdc);
    tgPostRender(pdc);
    return true;
}

bool TubeGpuSupport::tgDisplayPick(DisplayContext *pdc)
{
    if (!tgPrepare(pdc)) return false;
    tgDraw(pdc);
    return true;
}

void TubeGpuSupport::tgOnInvalidateDisplay()
{
    if (!m_bColorOnly || !tgMarkDirty(TubeMeshBuilder::UPD_COLOR)) tgInvalidate();
}

bool TubeGpuSupport::tgOnAtomsMoved(qsys::ObjectEvent &ev)
{
    if (ev.getType() != qsys::ObjectEvent::OBE_CHANGED ||
        !ev.getDescr().equals("atomsMoved"))
        return false;
    return tgMarkDirty(TubeMeshBuilder::UPD_GEOM);
}

void TubeGpuSupport::tgInvalidate()
{
    m_bTopoValid = false;
    m_bHasMesh = false;
    m_nDirty = 0;
    m_mb.clear();
    m_prim.invalidate();
}

bool TubeGpuSupport::tgMarkDirty(int nFlags)
{
    if (!m_bTopoValid) return false;
    m_nDirty |= nFlags;
    return true;
}

void TubeGpuSupport::tgUnload()
{
    tgInvalidate();
}
