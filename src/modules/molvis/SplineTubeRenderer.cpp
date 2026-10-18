// -*-Mode: C++;-*-
//
//  Spline-based tube renderers drawn from the GPU mesh
//

#include <common.h>

#include "SplineTubeRenderer.hpp"

using namespace molvis;

SplineTubeRenderer::SplineTubeRenderer()
        : m_nSegTopoGen(-1)
{
}

SplineTubeRenderer::~SplineTubeRenderer()
{
}

void SplineTubeRenderer::beginRend(DisplayContext *pdl)
{
    tubeGpuBeginRend(pdl);
    if (pdl==NULL && tubeGpuBuilder().getMode()==TubeMeshBuilder::MODE_BUILD) {
        // the segments of the mesh being built (see renderSpline())
        m_segs.clear();
        m_nSegTopoGen = -1;
    }
    super_t::beginRend(pdl);
}

void SplineTubeRenderer::renderSpline(DisplayContext *pdl, SplineCoeff *pCoeff,
                                                                            MolResiduePtr pStartRes, double fstart,
                                                                            MolResiduePtr pEndRes, double fend)
{
    TubeMeshBuilder &mb = tubeGpuBuilder();
    // Building the GPU mesh: record the segment as one chunk, so that a
    // coordinate update can redraw the segments concurrently
    const bool bRecord = (mb.getMode()==TubeMeshBuilder::MODE_BUILD);
    if (bRecord) {
        mb.beginChunk();
        m_segs.push_back(Seg{pCoeff, pStartRes, fstart, pEndRes, fend});
        m_nSegTopoGen = getSplineTopoGen();
    }
    renderSplineTo(&mb, pCoeff, pStartRes, fstart, pEndRes, fend);
    if (bRecord)
        mb.endChunk();
}

bool SplineTubeRenderer::tubeGpuCanUpdateChunks() const
{
    // seg-end fade evaluates the selection (not thread-safe); the segments'
    // coeffs must be of the current spline topology
    return !isSegEndFade() && isSplineTopoValid() && getSplineTopoGen()==m_nSegTopoGen;
}

void SplineTubeRenderer::tubeGpuUpdateChunk(int i, TubeMeshBuilder *pmb)
{
    const Seg &seg = m_segs[i];
    renderSplineTo(pmb, seg.pCoeff, seg.pStartRes, seg.fstart, seg.pEndRes, seg.fend);
}
