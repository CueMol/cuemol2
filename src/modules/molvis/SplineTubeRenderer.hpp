// -*-Mode: C++;-*-
//
//  Spline-based tube renderers drawn from the GPU mesh
//

#ifndef MOLVIS_SPLINE_TUBE_RENDERER_HPP_INCLUDED
#define MOLVIS_SPLINE_TUBE_RENDERER_HPP_INCLUDED

#include "molvis.hpp"
#include "SplineRenderer.hpp"
#include "TubeGpuRenderer.hpp"

#include <vector>

namespace molvis {

///
/// Common base of the spline-based renderers drawn from the GPU mesh (tube,
/// ribbon): the segments are drawn by renderSplineTo(), and a coordinate
/// update redraws them concurrently (TubeGpuSupport's chunked update, one
/// chunk per segment).
///
class MOLVIS_API SplineTubeRenderer : public TubeGpuRenderer<SplineRenderer>
{
private:
    typedef TubeGpuRenderer<SplineRenderer> super_t;

public:
    SplineTubeRenderer();
    ~SplineTubeRenderer() override;

    /// Starts the traversal (a host calls this from its beginRend())
    void beginRend(DisplayContext *pdl) override;

    /// Draws the segment through renderSplineTo(); in build mode, records it
    /// as one chunk of the mesh
    void renderSpline(DisplayContext *pdl, SplineCoeff *pCoeff,
                      MolResiduePtr pStartRes, double fstart,
                      MolResiduePtr pEndRes, double fend) override;

    /// Draw one segment to pmb. Must use no renderer state that it writes,
    /// so that segments can be drawn concurrently.
    virtual void renderSplineTo(TubeMeshBuilder *pmb, SplineCoeff *pCoeff,
                                const MolResiduePtr &pStartRes, double fstart,
                                const MolResiduePtr &pEndRes, double fend) = 0;

protected:
    void tubeGpuOnMovedAtoms() override { markSplineCoeffsMoved(); }

    bool tubeGpuCanUpdateChunks() const override;
    void tubeGpuPrepareChunkUpdate() override { prepareSplineCoeffs(); }
    void tubeGpuUpdateChunk(int i, TubeMeshBuilder *pmb) override;

private:
    /// A segment drawn by the last build traversal (one chunk each, in
    /// drawing order)
    struct Seg
    {
        SplineCoeff *pCoeff;
        MolResiduePtr pStartRes;
        double fstart;
        MolResiduePtr pEndRes;
        double fend;
    };
    std::vector<Seg> m_segs;

    /// Spline topology generation the segments refer to (their SplineCoeff
    /// pointers are valid only for it)
    int m_nSegTopoGen;
};

}  // namespace molvis

#endif
