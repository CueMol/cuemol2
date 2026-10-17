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
#include <qlib/Vector4D.hpp>

namespace gfx {
class DisplayContext;
class TrigGpuPrim;
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
///    (UPD_GEOM) and/or colors (UPD_COLOR) are overwritten in recording order.
///    finish() reports whether the traversal produced exactly the same
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

    /// Start overwriting the recorded mesh (flags: UPD_GEOM | UPD_COLOR).
    void startUpdate(qlib::uid_t nSceneID, int nFlags);

    /// End the current traversal. In update mode, returns false if the
    /// traversal did not reproduce the recorded topology.
    bool finish();

    /// Drop the recorded mesh.
    void clear();

    int getMode() const { return m_nMode; }
    bool isDirect() const { return m_nMode == MODE_DIRECT; }

    /// True if the caller has to compute colors for this traversal.
    bool wantColor() const
    {
        return m_nMode != MODE_UPDATE || (m_nUpdFlags & UPD_COLOR) != 0;
    }

    /// True if the caller has to compute hit names for this traversal.
    bool wantName() const { return m_nMode != MODE_UPDATE; }

    // Drawing interface (the subset of DisplayContext the renderers use)

    void color(const gfx::ColorPtr &pCol);
    void loadName(int nName);
    void normal(const Vector4D &n);
    void startTriangleStrip();
    void startTriangleFan();
    void vertex(const Vector4D &v);
    void end();

    /// Forwarded in direct mode only (the GPU mesh does not use them).
    void setPolygonMode(int nMode);
    void attribute(int nAttr);
    void setLighting(bool b);

    // Recorded mesh

    int getVertexSize() const { return int(m_col.size()); }
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

    /// Rewrite the vertex data of a prim filled by toGpuPrim() (flags:
    /// UPD_GEOM | UPD_COLOR) and mark it for upload.
    void updateGpuPrim(gfx::TrigGpuPrim &prim, int nFlags) const;

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
};

}  // namespace molvis

#endif
