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
///  - Update: the same traversal is run again over a mesh recorded by Build.
///    The topology (primitives, hit names) is kept and only positions/normals
///    (UPD_GEOM) and/or colors (UPD_COLOR) are overwritten in recording order,
///    either in the builder's own arrays or, once the mesh is in a
///    TrigGpuPrim (releaseVertexData()), directly in the primitive's vertex
///    array. finish() reports whether the traversal produced exactly the same
///    topology; if not, the caller has to rebuild.
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

    struct Prim
    {
        int type;
        int first;
        int count;
    };

    TubeMeshBuilder();
    ~TubeMeshBuilder();

    // Mode control

    /// Forward all calls to pdl.
    void startDirect(DisplayContext *pdl);

    /// Start recording a new mesh (drops the previous one).
    void startBuild(qlib::uid_t nSceneID);

    /// Start overwriting the recorded mesh (flags: UPD_GEOM | UPD_COLOR):
    /// in pDirect (the vertex array of the TrigGpuPrim filled by toGpuPrim())
    /// if given, in the builder's own arrays otherwise. pDirect is required
    /// after releaseVertexData().
    void startUpdate(qlib::uid_t nSceneID, int nFlags,
                     gfx::TrigGpuPrim::TrigVertAttr *pDirect = nullptr);

    /// End the current traversal. In update mode, returns false if the
    /// traversal did not reproduce the recorded topology.
    bool finish();

    /// Drop the recorded mesh.
    void clear();

    /// Drop the vertex data (positions, normals, colors, hit names) once it
    /// is in a TrigGpuPrim, keeping the topology for the update check.
    void releaseVertexData();

    /// True while the builder holds its own vertex data.
    bool hasVertexData() const { return !m_bReleased; }

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

    void vertex(const Vector4D &v)
    {
        if (m_nMode == MODE_UPDATE && m_pDirect != nullptr && m_nVertCur < m_nVerts) {
            // write straight into the vertex array of the GPU primitive
            gfx::TrigGpuPrim::TrigVertAttr &va = m_pDirect[m_nVertCur];
            ++m_nVertCur;
            if (m_nUpdFlags & UPD_GEOM) {
                va.x = float(v.x());
                va.y = float(v.y());
                va.z = float(v.z());
                va.nx = m_curNorm[0];
                va.ny = m_curNorm[1];
                va.nz = m_curNorm[2];
            }
            if (m_nUpdFlags & UPD_COLOR) {
                va.r = gfx::getRCode(m_curCol);
                va.g = gfx::getGCode(m_curCol);
                va.b = gfx::getBCode(m_curCol);
                va.a = gfx::getACode(m_curCol);
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

    /// Allocate prim and fill it with the recorded mesh. The polygon mode of
    /// prim must be set by the caller beforehand.
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

    // primitive in progress
    int m_nPrimType;
    int m_nPrimFirst;

    // number of recorded vertices (kept after releaseVertexData())
    int m_nVerts;
    bool m_bReleased;

    // update target in the GPU primitive (null: the own arrays)
    gfx::TrigGpuPrim::TrigVertAttr *m_pDirect;

    // update cursors
    int m_nVertCur;
    int m_nPrimCur;
    bool m_bMismatch;

    // recorded mesh
    std::vector<float> m_pos;
    std::vector<float> m_norm;
    std::vector<qlib::quint32> m_col;
    std::vector<qlib::quint32> m_name;
    std::vector<Prim> m_prims;

    bool isRecording() const
    {
        return m_nMode == MODE_BUILD || m_nMode == MODE_UPDATE;
    }
    void startPrim(int nType);

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
            return;
        }
        const double rlen = 1.0 / len;
        m_curNorm[0] = float(n.x() * rlen);
        m_curNorm[1] = float(n.y() * rlen);
        m_curNorm[2] = float(n.z() * rlen);
    }
};

}  // namespace molvis

#endif
