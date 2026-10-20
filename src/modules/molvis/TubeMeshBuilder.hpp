// -*-Mode: C++;-*-
//
//  Tube mesh builder: the drawing sink of the tube-like renderers
//

#ifndef MOLVIS_TUBE_MESH_BUILDER_HPP_INCLUDED
#define MOLVIS_TUBE_MESH_BUILDER_HPP_INCLUDED

#include "molvis.hpp"

#include <vector>

#include <gfx/gfx.hpp>
#include <gfx/AbstractColor.hpp>
#include <gfx/TrigGpuPrim.hpp>
#include <qlib/Vector4D.hpp>

namespace gfx {
class DisplayContext;
}  // namespace gfx

namespace molvis {

using gfx::DisplayContext;
using qlib::Vector4D;

///
/// Drawing sink of the tube/ribbon/cartoon renderers.
///
/// The renderers and TubeSection draw through this class with the same
/// immediate-mode calls they used to issue on a DisplayContext (color,
/// loadName, normal, triangle strips and fans). What happens to them depends
/// on the mode:
///
///  - Direct: every call is forwarded to a DisplayContext as is. Used for the
///    display-list path, file export and the hittest-less fallback, so their
///    output does not change.
///  - Build: the mesh is recorded (positions, normals, colors, hit names and
///    the strip/fan primitives) and can then be turned into a TrigGpuPrim.
///  - Update: the same traversal (or one chunk of it) is run again over a
///    mesh recorded by Build and put in a TrigGpuPrim (toGpuPrim()). The
///    topology (primitives, hit names) is kept and only positions/normals
///    (UPD_GEOM) and/or colors (UPD_COLOR) are overwritten in recording
///    order, directly in the primitive's vertex array. finish() reports
///    whether the traversal produced exactly the same topology; if not, the
///    caller has to rebuild.
///
/// Ring bands (Build and Update only): a tube body is a series of rings of
/// section vertices. Drawn as triangle strips, every strip holds two rings,
/// so each ring is computed and stored twice. A renderer can instead start
/// the first strip with startRingStrip() and continue with startRingBand(),
/// which takes the vertices of the new ring only and connects them to the
/// previous ring by index, with the same triangles as the strip it replaces.
///
class MOLVIS_API TubeMeshBuilder
{
public:
    static const int MODE_NONE = 0;
    static const int MODE_DIRECT = 1;
    static const int MODE_BUILD = 2;
    static const int MODE_UPDATE = 3;

    static const int UPD_GEOM = 1;
    static const int UPD_COLOR = 2;

    static const int PRIM_STRIP = 0;
    static const int PRIM_FAN = 1;
    /// Triangles between the previous ring (ref, refStride) and the count
    /// vertices from first: the strip new0, old0, new1, old1, ...
    static const int PRIM_BAND = 2;

    struct Prim
    {
        int type;
        int first;
        int count;
        /// PRIM_BAND: first vertex and vertex stride of the previous ring
        int ref = -1;
        int refStride = 0;
    };

    /// A part of the traversal that can be re-run on its own (one segment):
    /// the vertices and primitives it wrote in build mode
    struct Chunk
    {
        int firstVert;
        int nVerts;
        int firstPrim;
        int nPrims;
    };

    TubeMeshBuilder();
    ~TubeMeshBuilder();

    // Mode control

    /// Forward all calls to pdl.
    void startDirect(DisplayContext *pdl);

    /// Start recording a new mesh (drops the previous one).
    void startBuild(qlib::uid_t nSceneID);

    /// Start overwriting the recorded mesh (flags: UPD_GEOM | UPD_COLOR) in
    /// dst, the attribute blocks of the LAYOUT_PACKED TrigGpuPrim filled by
    /// toGpuPrim().
    void startUpdate(qlib::uid_t nSceneID, int nFlags,
                     const gfx::TrigGpuPrim::PackedArrays &dst);

    /// Start overwriting chunk ichunk of the mesh recorded by parent, in dst
    /// (the attribute blocks of parent's TrigGpuPrim). This builder only
    /// writes the chunk's vertices, so builders of distinct chunks can run
    /// concurrently. finish() reports whether the chunk was reproduced.
    void startChunkUpdate(qlib::uid_t nSceneID, int nFlags,
                          const gfx::TrigGpuPrim::PackedArrays &dst,
                          const TubeMeshBuilder &parent, int ichunk);

    /// End the current traversal. In update mode, returns false if the
    /// traversal did not reproduce the recorded topology.
    bool finish();

    /// In build mode, mark the start / end of a chunk (see Chunk). No-op in
    /// the other modes.
    void beginChunk()
    {
        if (m_nMode != MODE_BUILD) return;
        m_nChunkVert = m_nVerts;
        m_nChunkPrim = int(m_prims.size());
    }
    void endChunk()
    {
        if (m_nMode != MODE_BUILD) return;
        m_chunks.push_back(Chunk{m_nChunkVert, m_nVerts - m_nChunkVert, m_nChunkPrim,
                                 int(m_prims.size()) - m_nChunkPrim});
    }

    const std::vector<Chunk> &getChunks() const { return m_chunks; }

    /// True if the chunks hold every recorded vertex (the mesh can be
    /// updated chunk by chunk).
    bool chunksCoverAll() const;

    /// Drop the recorded mesh.
    void clear();

    /// Drop the vertex data (positions, normals, colors, hit names) once it
    /// is in a TrigGpuPrim, keeping the topology for the update check.
    void releaseVertexData();

    int getMode() const { return m_nMode; }

    /// Update flags (UPD_GEOM / UPD_COLOR) of the current update traversal.
    int getUpdateFlags() const { return m_nUpdFlags; }
    bool isDirect() const { return m_nMode == MODE_DIRECT; }

    /// True if the caller has to compute colors for this traversal.
    bool wantColor() const
    {
        return m_nMode != MODE_UPDATE || (m_nUpdFlags & UPD_COLOR) != 0;
    }

    /// True if the caller has to compute hit names for this traversal.
    bool wantName() const { return m_nMode != MODE_UPDATE; }

    // Drawing interface (the subset of DisplayContext the renderers use).
    // The update into the GPU primitive (every coordinate or color update)
    // is inlined here; the other modes go to the out-of-line versions.

    void color(const gfx::ColorPtr &pCol)
    {
        if (m_nMode == MODE_UPDATE && !(m_nUpdFlags & UPD_COLOR)) return;
        colorSlow(pCol);
    }

    void loadName(int nName)
    {
        if (m_nMode == MODE_UPDATE) return;
        loadNameSlow(nName);
    }

    void normal(const Vector4D &n)
    {
        if (m_nMode != MODE_UPDATE) {
            normalSlow(n);
            return;
        }
        if (!(m_nUpdFlags & UPD_GEOM)) return;
        setCurNorm(n);
    }

    void startTriangleStrip();
    void startTriangleFan();

    /// A triangle strip of ring pairs (new ring vertex, previous ring vertex)
    /// whose new-ring vertices a following startRingBand() can reuse.
    void startRingStrip();

    /// A band of the vertices of a new ring only, connected to the ring of
    /// the preceding ring strip or band (hasRing() must be true). The band
    /// must have as many vertices as that ring.
    void startRingBand();

    /// True if the last primitive was a ring strip or band whose ring
    /// startRingBand() can connect to (never in direct mode, nor when ring
    /// sharing is disabled).
    bool hasRing() const
    {
        return s_bShareRings && isRecording() && m_nRingFirst >= 0;
    }

    /// Enable / disable ring bands for all builders (enabled by default;
    /// disabled, the renderers draw every strip with both rings).
    static void setRingSharing(bool b) { s_bShareRings = b; }
    static bool isRingSharing() { return s_bShareRings; }

    void vertex(const Vector4D &v)
    {
        if (m_nMode == MODE_UPDATE && m_dst.pos != nullptr && m_nVertCur < m_nVerts) {
            // write straight into the attribute blocks of the GPU primitive
            const int i = m_nVertCur;
            ++m_nVertCur;
            if (m_nUpdFlags & UPD_GEOM) {
                float *p = m_dst.pos + 3 * i;
                p[0] = float(v.x());
                p[1] = float(v.y());
                p[2] = float(v.z());
                m_dst.norm[i] = m_curNormPacked;
            }
            if (m_nUpdFlags & UPD_COLOR) {
                qlib::qbyte *c = m_dst.color + 4 * i;
                c[0] = gfx::getRCode(m_curCol);
                c[1] = gfx::getGCode(m_curCol);
                c[2] = gfx::getBCode(m_curCol);
                c[3] = gfx::getACode(m_curCol);
            }
            return;
        }
        vertexSlow(v);
    }

    void end();

    /// Forwarded in direct mode only (the GPU mesh does not use them).
    void setPolygonMode(int nMode);
    void attribute(int nAttr);
    void setLighting(bool b);

    // Recorded mesh

    int getVertexSize() const { return m_nVerts; }
    int getFaceSize() const;
    const std::vector<Prim> &getPrims() const { return m_prims; }

    Vector4D getPos(int i) const
    {
        return Vector4D(m_pos[i * 3 + 0], m_pos[i * 3 + 1], m_pos[i * 3 + 2]);
    }
    Vector4D getNorm(int i) const
    {
        return Vector4D(m_norm[i * 3 + 0], m_norm[i * 3 + 1], m_norm[i * 3 + 2]);
    }
    qlib::quint32 getColor(int i) const { return m_col[i]; }
    qlib::quint32 getHitName(int i) const { return m_name[i]; }

    /// Allocate prim (in TrigGpuPrim::LAYOUT_PACKED, the layout the update
    /// traversal writes) and fill it with the recorded mesh. The polygon mode
    /// of prim must be set by the caller beforehand.
    void toGpuPrim(DisplayContext *pdc, gfx::TrigGpuPrim &prim) const;

private:
    int m_nMode;
    int m_nUpdFlags;
    DisplayContext *m_pdl;
    qlib::uid_t m_nSceneID;

    // current state
    qlib::quint32 m_curCol;
    qlib::quint32 m_curName;
    float m_curNorm[3];
    // m_curNorm packed for the GPU primitive (TrigGpuPrim::packNormal())
    qlib::quint32 m_curNormPacked;

    // primitive in progress
    int m_nPrimType;
    int m_nPrimFirst;
    // the primitive in progress is a ring strip / band
    bool m_bRingPrim;

    // the ring a band can connect to: its first vertex, the stride between
    // its vertices and their number (m_nRingFirst < 0: none)
    int m_nRingFirst;
    int m_nRingStride;
    int m_nRingSize;

    static bool s_bShareRings;

    // number of recorded vertices (kept after releaseVertexData())
    int m_nVerts;
    bool m_bReleased;

    // update target: the attribute blocks of the GPU primitive
    gfx::TrigGpuPrim::PackedArrays m_dst;

    // update cursors (and the ends of the range to update)
    int m_nVertCur;
    int m_nPrimCur;
    int m_nPrimEnd;
    bool m_bMismatch;

    // primitives to check the update against (another builder's for a
    // chunk update, null for the own ones)
    const std::vector<Prim> *m_pPrimsRef;

    // chunks recorded in build mode
    std::vector<Chunk> m_chunks;
    int m_nChunkVert;
    int m_nChunkPrim;

    // recorded mesh
    std::vector<float> m_pos;
    std::vector<float> m_norm;
    std::vector<qlib::quint32> m_col;
    std::vector<qlib::quint32> m_name;
    std::vector<Prim> m_prims;

    const std::vector<Prim> &prims() const
    {
        return (m_pPrimsRef != nullptr) ? *m_pPrimsRef : m_prims;
    }

    bool isRecording() const
    {
        return m_nMode == MODE_BUILD || m_nMode == MODE_UPDATE;
    }
    void startPrim(int nType, bool bRing = false);
    void resetRing() { m_nRingFirst = -1; }

    void colorSlow(const gfx::ColorPtr &pCol);
    void loadNameSlow(int nName);
    void normalSlow(const Vector4D &n);
    void vertexSlow(const Vector4D &v);

    /// Same normalization as gfx::DisplayList::normal()
    void setCurNorm(const Vector4D &n)
    {
        const double len = n.length();
        if (len < F_EPS4) {
            m_curNorm[0] = 1.0f;
            m_curNorm[1] = 0.0f;
            m_curNorm[2] = 0.0f;
        }
        else {
            const double rlen = 1.0 / len;
            m_curNorm[0] = float(n.x() * rlen);
            m_curNorm[1] = float(n.y() * rlen);
            m_curNorm[2] = float(n.z() * rlen);
        }
        m_curNormPacked =
            gfx::TrigGpuPrim::packUnitNormal(m_curNorm[0], m_curNorm[1], m_curNorm[2]);
    }
};

}  // namespace molvis

#endif
