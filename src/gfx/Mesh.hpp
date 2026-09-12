// -*-Mode: C++;-*-
//
//  Triangle mesh object
//  $Id: Mesh.hpp,v 1.4 2011/04/07 07:56:47 rishitani Exp $
//

#ifndef GFX_MESH_HPP_INCLUDED
#define GFX_MESH_HPP_INCLUDED

#include "AbstractColor.hpp"
#include <qlib/Vector4D.hpp>
#include <qlib/LString.hpp>

#include <unordered_map>
#include <vector>

namespace gfx {

  using qlib::Vector4D;

  /// Triangle mesh handed to DisplayContext::drawMesh().
  ///
  /// Vertex colours are stored as indices into a per-mesh palette of the
  /// distinct colour objects the renderer passed to color(), not as one
  /// ColorPtr per vertex: a ColorPtr is a 72-byte scriptable smart pointer,
  /// three times the position and normal together, and a surface coloured
  /// by a potential ramp hands in a fresh 256-byte GradientColor for every
  /// vertex. Such a GradientColor is decomposed into its two component
  /// colours and its parameter here, so the palette holds only the handful
  /// of base colours and each vertex costs 16 bytes whatever the colouring.
  /// getCol() reconstructs the same colour on demand.
  class GFX_API Mesh
  {
  public:
    /// Palette index meaning "no colour": cid2 of a plain-coloured vertex,
    /// cid1 of a vertex that was never coloured.
    static constexpr quint32 NO_COLOR = 0xFFFFFFFFu;

    /// Colour of one vertex: a palette entry, or a GradientColor as the two
    /// palette entries of its components and its parameter. rho stays a
    /// double so the reconstructed colour blends exactly as the original.
    struct VertCol
    {
      quint32 cid1;
      quint32 cid2;
      double rho;
    };

  private:

    int m_nVerts;
    int m_nFaces;

    std::vector<float> m_verts;
    std::vector<float> m_norms;
    std::vector<VertCol> m_vcols;
    std::vector<int> m_faces;

    /////
    // palette of distinct base colours

    std::vector<ColorPtr> m_palette;

    /// Material names referenced by the palette; [0] is the empty name.
    std::vector<LString> m_palMats;

    /// (material index << 32 | colour code) -> palette index
    std::unordered_map<quint64, quint32> m_palIndex;

    /// colour object -> palette index, for the objects the palette retains
    std::unordered_map<const AbstractColor *, quint32> m_palPtrIndex;

    /////
    // current vertex attributes

    Vector4D m_curNorm;

    VertCol m_curCol;

    /// The object color() was last called with (identity shortcut).
    ColorPtr m_pCurCol;

    /// The components of the last GradientColor seen: a ramp reuses its stop
    /// colours, so most gradient vertices resolve with two pointer compares.
    ColorPtr m_pLastC1;
    ColorPtr m_pLastC2;
    quint32 m_lastCid1;
    quint32 m_lastCid2;

    /////

  public:
    Mesh();

    virtual ~Mesh();

    void init(int nverts, int nfaces);


    ////////////////////////////////////////

    bool reduce(int nverts, int nfaces);

    void setVertex(int i, const Vector4D &v);


    inline void setVertex(int i, float x, float y, float z)
    {
      m_verts[i*3+0] = x;
      m_verts[i*3+1] = y;
      m_verts[i*3+2] = z;

      m_norms[i*3+0] = (float) m_curNorm.x();
      m_norms[i*3+1] = (float) m_curNorm.y();
      m_norms[i*3+2] = (float) m_curNorm.z();

      m_vcols[i] = m_curCol;
    }

    inline void setVertex(int i, float x, float y, float z, float nx, float ny, float nz)
    {
      m_verts[i*3+0] = x;
      m_verts[i*3+1] = y;
      m_verts[i*3+2] = z;

      m_norms[i*3+0] = nx;
      m_norms[i*3+1] = ny;
      m_norms[i*3+2] = nz;

      m_vcols[i] = m_curCol;
    }

    Vector4D getVertex(int i) const {
      return Vector4D (m_verts[i*3+0],
                       m_verts[i*3+1],
                       m_verts[i*3+2]);
    }

    void normal(const Vector4D &n) {
      m_curNorm = n;
    }
    Vector4D getNormal(int i) const {
      return Vector4D (m_norms[i*3+0],
                       m_norms[i*3+1],
                       m_norms[i*3+2]);
    }

    /// Set the colour of the vertices that follow. A GradientColor is stored
    /// as its components and parameter; any other colour as a palette entry.
    void color(const ColorPtr &c);

    void setFace(int fid, int vid1, int vid2, int vid3) {
      MB_ASSERT(fid<m_nFaces);
      m_faces[fid*3+0] = vid1;
      m_faces[fid*3+1] = vid2;
      m_faces[fid*3+2] = vid3;
    }

    ////////////////////////////////////////

    int getVertSize() const {
      return m_nVerts;
    }

    int getFaceSize() const {
      return m_nFaces;
    }

    const int *getFaces() const {
      return &m_faces[0];
    }

    /// Colour of vertex iv. A plain colour is the object passed to color();
    /// a gradient is rebuilt from its components. False when iv is out of
    /// range or the vertex was never coloured.
    bool getCol(ColorPtr &c, int iv) const;

    /// Number of distinct base colours the mesh refers to.
    int getPaletteSize() const {
      return (int) m_palette.size();
    }

  private:
    /// Palette index of a base colour, adding it when new.
    quint32 palIndex(const ColorPtr &pc);

  };

}

#endif //

