// -*-Mode: C++;-*-
//
//  File display context rendering internal data
//

#ifndef REND_INTERNAL_DATA_HPP_INCLUDED
#define REND_INTERNAL_DATA_HPP_INCLUDED

#include "render.hpp"

#include <gfx/DisplayContext.hpp>
#include <gfx/ColorTable.hpp>
#include <qlib/LString.hpp>
#include <qlib/LStream.hpp>

#include "MeshData.hpp"
#include "GraphEdge.hpp"

namespace qlib {
  class PrintStream;
}

namespace render {

  using qlib::LString;
  using qlib::Vector4D;
  using qlib::OutStream;
  using gfx::ColorTable;
  using gfx::ColorPtr;
  using qlib::PrintStream;
  using gfx::DisplayContext;

  class FileDisplayContext;

  /// Internal data structure for FileDisplayContext
  class RENDER_API RendIntData
  {
    //private:
  public:

    typedef ColorTable::elem_t ColIndex;

    /// target name
    LString m_name;

    /// Output texture type
    bool m_fUseTexBlend;

    /// Color table
    ColorTable m_clut;

    /// Clipping plane (negative value: no clipping)
    double m_dClipZ;

    /// style name list of Renderer used for this rendering
    LString m_styleNames;

    /// Parent display context
    FileDisplayContext *m_pdc;

    //////////

    /// Line object
    struct Line
    {
      /// Line verteces
      Vector4D v1, v2;

      /// Line color
      ColIndex col;

      /// Line width in pixel unit
      double w;
    };

    std::deque<Line *> m_lines;

    //////////

    /// Cylinder object
    struct Cyl
    {
      /// location of termini
      Vector4D v1, v2;

      /// color
      ColIndex col;

      /// width of termini
      double w1, w2;

      /// terminal cap flag
      bool bcap;

      /// detail level for tesselation
      int ndetail;

      /// transformation matrix
      Matrix4D *pTransf;

      /// ctor
      Cyl() : w1(1.0), w2(1.0), bcap(false), ndetail(1), pTransf(NULL) {}

      ///dtor
      ~Cyl() {
        if (pTransf!=NULL) delete pTransf;
      }
    };

    typedef std::deque<Cyl *> CylList;

    CylList m_cylinders;

    //////////

    /// Sphere object
    struct Sph {
      Vector4D v1;
      ColIndex col;
      double r;
      int ndetail;
    };

    typedef std::deque<Sph *> SphList;

    /// sphere data
    SphList m_spheres;

    /// point data
    SphList m_dots;

    //////////

    /// Mesh object
    Mesh m_mesh;

    /// Mesh pivot
    int m_nMeshPivot;

    /// Mesh vertex's attribute array
    ///  only used for special case,
    ///  in which hint data of edge rendering is required
    std::deque<int> *m_pVAttrAry;

  public:
    RendIntData(FileDisplayContext *pdc);
    virtual ~RendIntData();

    //void start(OutStream *fp, OutStream *ifp, const char *name);
    void start(const char *name);
    void end();

    /// Append line segment
    void line(const Vector4D &v1, const Vector4D &v2, double w, const ColorPtr &col = ColorPtr());

    /// Append point
    void dot(const Vector4D &v1, double w, const ColorPtr &col = ColorPtr());

    /// Append cylinder
    void cylinder(const Vector4D &v1, const Vector4D &v2,
                  double w1, double w2, bool bcap,
                  int ndet, const Matrix4D *ptrf,
                  const ColorPtr &col = ColorPtr());

    /// Append sphere
    void sphere(const Vector4D &v1, double w, int ndet, const ColorPtr &col = ColorPtr());

    //////////
    // Mesh drawing operations

    void meshStart(int nmode);
    void meshEndTrigs();
    void meshEndTrigStrip();
    void meshEndFan();

    /// Mesh generation for trigs & trigstrip
    void meshVertex(const Vector4D &v1, const Vector4D &n1, const ColorPtr &col, int nattr=DisplayContext::DVA_NONE)
    {
      m_mesh.addVertex(v1, n1, convCol(col));
      if (m_pVAttrAry!=NULL)
        m_pVAttrAry->push_back(nattr);
    }

    // / mesh generation for trigfan
    // void mesh_fan(const Vector4D &v1, const Vector4D &n1, const LColor &c1, bool bMakeTri);

    void mesh(const Matrix4D &mat, const gfx::Mesh &mesh);

    /// Convert color to internal representation
    ColIndex convCol();

    /// Convert color to internal representation (2)
    ColIndex convCol(const ColorPtr &col);

    /// convert line to cylinder
    void convLines();

    /// convert dot to sphere
    void convDots();

    /// convert spheres to mesh
    void convSpheres();

    /// convert cylinders to mesh
    void convCylinders();

    void eraseLines() {
      m_lines.erase(m_lines.begin(), m_lines.end());
    }

    void eraseCyls() {
      m_cylinders.erase(m_cylinders.begin(), m_cylinders.end());
    }
    
    void eraseSpheres() {
      m_spheres.erase(m_spheres.begin(), m_spheres.end());
    }
    
  private:
    void convSphere(Sph *);
    void convCyl(Cyl *);
    int selectTrig(int j, int k, int j1, int k1);

    /////////////////////////////////////////////////

  private:
    MeshVert *cutEdge(MeshVert *pv1, MeshVert *pv2);

  public:
    /// Mesh clipping operation
    Mesh *calcMeshClip();

  private:
    static bool isVertNear(const MeshVert &p1, const MeshVert &p2, int nmode);
    
  public:
    /// Mesh simplification
    // nmode==0: vertex compare
    // nmode==1: vertex&norm compare
    // nmode==2: vertex&norm&color compare (default)
    Mesh *simplifyMesh(Mesh *pMesh, int nmode=2);
    

    /////////////////////////////////////////////////
    // workarea for silhouette/edge extraction
  //private:
  public:
    
    /// camera position
    double m_dViewDist;

    /// Target mesh (simplified by vertex-compare mode)
    Mesh *m_pEgMesh;

    /// Silhouette (or edge) lines
    SEEdgeSet m_silEdges;

    /// Silhouette/Edge corner points
    std::vector<SEVertex> m_secpts;

    // typedef std::map<int, int> VertSet;
    // VertSet m_silVertSet;

    /// vertex array of m_pEgMesh
    std::vector<MeshVert*> m_vertvec;
    /// face array of m_pEgMesh
    std::vector<SEFace> m_facevec;

    /// AABB Tree
    void *m_pTree;
    void *m_pTreeFaces;

    /// silhouette mode
    bool m_bSilhouette;

    /// Build vertex-visibility list using AABB tree (m_pTree)
    void buildVertVisList();

  public:

    void calcSilEdgeLines(double dViewDist, double dnangl);

    void buildAABBTree(int nmode);

    void calcEdgeIntrsec();
    void calcSilhIntrsec(double);

    void cleanupSilEdgeLines();


    void writeEdgeLines(PrintStream &ps);
    void writeSilhLines(PrintStream &ps);

    void writeCornerPoints(PrintStream &ps);

  private:
    void writeEdgeLine(PrintStream &ps, const SEEdge &elem);
    void writeEdgeLine(PrintStream &ips, const SEEdge &elem,
                       double fsec1, double fsec2);
    void writeEdgeLine(PrintStream &ips,
                       const Vector4D &v1, const Vector4D &v2,
                       const Vector4D &n1, const Vector4D &n2,
                       int alpha1, int alpha2,
                       int flag =0);

    /////////////////////////////////////////////////

  public:
    const LString &getStyleNames() const {
      return m_styleNames;
    }

    inline bool isEmpty() const {
      if (m_cylinders.size()<=0 &&
          m_dots.size()<=0 &&
          m_spheres.size()<=0 &&
          m_mesh.getVertexSize()<=0 &&
          m_mesh.getFaceSize()<=0 &&
          m_lines.size()<=0 &&
          m_clut.size()<=0)
        return true;
      else
        return false;
    }

  };

}

#endif

