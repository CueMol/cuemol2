// -*-Mode: C++;-*-
//  RendIntData_AABB.cpp
//  Edge/Silhouette rendering using AABB tree for visibility check
//

#include <common.h>

#include <gfx/Mesh.hpp>
#include <gfx/SolidColor.hpp>
#include <optional>
#include <qlib/BSPTree.hpp>
#include <qlib/PrintStream.hpp>
#include <qsys/style/StyleMgr.hpp>

#include "FileDisplayContext.hpp"
#include "RendIntData.hpp"

#define CGAL_LIB_DIAGNOSTIC
#define CGAL_HAS_NO_THREADS
#define CGAL_DISABLE_ROUNDING_MATH_CHECK
#define CGAL_INTERSECTION_VERSION 1
#include <CGAL/AABB_tree.h>  // must be inserted before kernel
// #include <CGAL/AABB_traits_3.h>
#include <CGAL/AABB_traits.h>
// #include <CGAL/AABB_triangle_primitive_3.h>
#include <CGAL/AABB_triangle_primitive.h>
#include <CGAL/Simple_cartesian.h>
#include <CGAL/basic.h>

#if 1

namespace render {

namespace {

using K = CGAL::Simple_cartesian<double>;

using Point = K::Point_3;
// typedef K::Point_3 Point;
// class Point : public K::Point_3
// {
//     typedef K::Point_3 super_t;

// public:
//     Point() : super_t() {}
//     Point(const Vector4D &av) : super_t(av.x(), av.y(), av.z()) {}
//     int id;
// };

using Segment = K::Segment_3;

using Triangle = K::Triangle_3;
// class Triangle : public K::Triangle_3
// {
//     typedef K::Triangle_3 super_t;

// public:
//     Triangle() : super_t() {}

//     Triangle(const Vector4D &v1, const Vector4D &v2, const Vector4D &v3, int aiv1,
//              int aiv2, int aiv3)
//         : super_t(Point(v1), Point(v2), Point(v3)), iv1(aiv1), iv2(aiv2), iv3(aiv3)
//     {
//     }

//     int iv1, iv2, iv3;
// };

inline auto convToPoint(const Vector4D &v)
{
    return Point(v.x(), v.y(), v.z());
}

inline auto convToTriangle(const Vector4D &v1, const Vector4D &v2, const Vector4D &v3)
{
    return Triangle(convToPoint(v1), convToPoint(v2), convToPoint(v3));
}

bool contains_id(int iv1, int iv2, int if1, int if2, int if3)
{
    if (iv1 == if1 || iv1 == if2 || iv1 == if3) return true;

    if (iv2 == if1 || iv2 == if2 || iv2 == if3) return true;

    return false;
}

using FaceId = std::tuple<int, int, int>;
using FaceVec = std::vector<Triangle>;
using FaceVecIterator = FaceVec::iterator;
using Primitive = CGAL::AABB_triangle_primitive<K, FaceVecIterator>;
// using Primitive = CGAL::AABB_triangle_primitive_3<K, FaceVecIterator>;
using AABB_triangle_traits = CGAL::AABB_traits<K, Primitive>;
// using AABB_triangle_traits = CGAL::AABB_traits_3<K, Primitive>;
using Tree = CGAL::AABB_tree<AABB_triangle_traits>;

// using SegIsec = Tree::Intersection_and_primitive_id<Segment>::Type;
using SegIsec = Tree::Object_and_primitive_id;
using SegIsecList = std::list<SegIsec>;
// using IntrsecList = std::list<Tree::Object_and_primitive_id>;

}  // namespace

/**
 * Build AABB tree from mesh faces
 * @param nexcl_mode  exclude faces with this nmode value
 */
void RendIntData::buildAABBTree(int nexcl_mode)
{
    MB_ASSERT(m_pTree == NULL);

    int i;
    MeshVert *pv1, *pv2, *pv3;

    int nverts = m_vertvec.size();
    int nfaces = m_facevec.size();
    FaceVec *pfaces = MB_NEW FaceVec();
    auto *pfaceids = MB_NEW std::vector<FaceId>();

    i=0;
    for (const SEFace &ff : m_facevec) {
        if (ff.iv1 < 0 || ff.iv2 < 0 || ff.iv3 < 0) {
            continue;
        }

        if (ff.nmode == nexcl_mode) {
            continue;
        }

        pv1 = m_vertvec[ff.iv1];
        pv2 = m_vertvec[ff.iv2];
        pv3 = m_vertvec[ff.iv3];

        // pfaces->push_back(Triangle(pv1->v, pv2->v, pv3->v, ff.iv1, ff.iv2, ff.iv3));
        pfaces->push_back(convToTriangle(pv1->v, pv2->v, pv3->v));
        pfaceids->push_back(FaceId(ff.iv1, ff.iv2, ff.iv3));
        // MB_DPRINTLN("face %d (%d,%d,%d)", i, ff.iv1, ff.iv2, ff.iv3);
        i++;
    }
    MB_DPRINTLN("faces len=%d", pfaces->size());
    MB_DPRINTLN("faceids len=%d", pfaceids->size());

    // find occluded verteces by mesh faces
    // --> write only the visible edges
    MB_DPRINTLN("AABB Tree constructing...");
    // Tree tree(faces.begin(), faces.end());
    m_pTree = MB_NEW Tree(pfaces->begin(), pfaces->end());
    m_pTreeFaces = pfaces;
    m_pTreeFaceIds = pfaceids;
    MB_DPRINTLN("Done.");
}

bool RendIntData::isVertVisible(const Vector4D &vert, int iv)
{
    // MB_DPRINTLN("isVertVisible called for iv=%d", iv);
    auto &tree = *static_cast<Tree *>(m_pTree);
    auto &faces = *static_cast<FaceVec *>(m_pTreeFaces);
    auto &faceids = *static_cast<std::vector<FaceId> *>(m_pTreeFaceIds);

    double vx, vy;
    if (m_bPerspec) {
        vx = 0.0;
        vy = 0.0;
    } else {
        vx = vert.x();
        vy = vert.y();
    }

    // check vert visibility from vcam
    K::Point_3 pcam(vx, vy, m_dViewDist);
    K::Point_3 pvert(vert.x(), vert.y(), vert.z());

    Segment segq(pcam, pvert);

    SegIsecList ilst;
    tree.all_intersections(segq, std::back_inserter(ilst));

    for (const auto &[intersection_obj, primitive_id] : ilst) {
        size_t idx = std::distance(faces.begin(), primitive_id);
        const auto &[iv1, iv2, iv3] = faceids[idx];
        if (iv == iv1 || iv == iv2 || iv == iv3) {
            continue;
        }
        return false;
    }

    return true;
}

bool RendIntData::isVertSilVisible(const Vector4D &vert, int iv)
{
    auto &tree = *static_cast<Tree *>(m_pTree);
    auto &faces = *static_cast<FaceVec *>(m_pTreeFaces);
    auto &faceids = *static_cast<std::vector<FaceId> *>(m_pTreeFaceIds);

    double vx, vy;
    if (m_bPerspec) {
        vx = 0.0;
        vy = 0.0;
    } else {
        vx = vert.x();
        vy = vert.y();
    }

    // check vert visibility from vcam
    K::Point_3 pcam(vx, vy, m_dViewDist);
    K::Point_3 pvert(vert.x(), vert.y(), vert.z());

    // Silhouette visibility check:
    K::Ray_3 rayq(pcam, pvert);

    SegIsecList ilst;
    tree.all_intersections(rayq, std::back_inserter(ilst));

    for (const auto &[intersection_obj, primitive_id] : ilst) {
        size_t idx = std::distance(faces.begin(), primitive_id);
        const auto &[fiv1, fiv2, fiv3] = faceids[idx];
        // const FaceId &fids = faceids[idx];
        // int fiv1 = std::get<0>(fids);
        // int fiv2 = std::get<1>(fids);
        // int fiv3 = std::get<2>(fids);
        if (iv == fiv1 || iv == fiv2 || iv == fiv3) {
            continue;
        }
        // MB_DPRINTLN("isVertSilVisible(iv=%d) idx=%d (%d, %d, %d) --> false",
        // iv, idx, fiv1, fiv2, fiv3);
        return false;
    }

    // MB_DPRINTLN("isVertSilVisible(iv=%d) true", iv);
    return true;
}

bool RendIntData::isVertSilVisible2(const Vector4D &vert, int iv1, int iv2)
{
    // MB_DPRINTLN("isVertSilVisible2: iv1=%d, iv2=%d", iv1, iv2);
    auto &tree = *static_cast<Tree *>(m_pTree);
    auto &faces = *static_cast<FaceVec *>(m_pTreeFaces);
    auto &faceids = *static_cast<std::vector<FaceId> *>(m_pTreeFaceIds);

    double vx, vy;
    if (m_bPerspec) {
        vx = 0.0;
        vy = 0.0;
    } else {
        vx = vert.x();
        vy = vert.y();
    }

    // check vert visibility from vcam
    K::Point_3 pcam(vx, vy, m_dViewDist);
    K::Point_3 pvert(vert.x(), vert.y(), vert.z());

    // Silhouette visibility check:
    K::Ray_3 rayq(pcam, pvert);

    SegIsecList ilst;
    tree.all_intersections(rayq, std::back_inserter(ilst));

    for (const auto &[intersection_obj, primitive_id] : ilst) {
        size_t idx = std::distance(faces.begin(), primitive_id);
        const auto &[fiv1, fiv2, fiv3] = faceids[idx];
        if (contains_id(iv1, iv2, fiv1, fiv2, fiv3)) {
            continue;
        }
        return false;
    }

    return true;
}

void RendIntData::buildVertVisList()
{
    MeshVert *pv;

    Tree &tree = *static_cast<Tree *>(m_pTree);

    int nc = m_secpts.size();
    for (int i = 0; i < nc; ++i) {
        const int iv = m_secpts[i].iv;
        pv = m_vertvec[iv];
        if (!m_bSilhouette)
            m_secpts[i].bvis = isVertVisible(pv->v, iv);
        else
            m_secpts[i].bvis = isVertSilVisible(pv->v, iv);

        m_secpts[i].nshow = 0;
    }

    MB_DPRINTLN("Vertex visibility list generated.");
}

void RendIntData::calcEdgeIntrsec()
{
    // MB_DPRINTLN("RendIntData::calcEdgeIntrsec called.");
    MB_ASSERT(m_pTree != NULL);
    Tree &tree = *static_cast<Tree *>(m_pTree);
    auto &faces = *static_cast<FaceVec *>(m_pTreeFaces);
    auto &faceids = *static_cast<std::vector<FaceId> *>(m_pTreeFaceIds);

    int i;
    MeshVert *pv1, *pv2, *pv3;

    buildVertVisList();

    for (const auto &elem : m_silEdges) {
        pv1 = m_vertvec[elem.iv1];
        pv2 = m_vertvec[elem.iv2];

        int nmode = MFMOD_MESH;
        if (elem.if1 > 0)
            nmode = m_facevec[elem.if1].nmode;
        else if (elem.if2 > 0)
            nmode = m_facevec[elem.if2].nmode;

        if (nmode != MFMOD_SPHERE) {
            SEEdge &welem = const_cast<SEEdge &>(elem);
            welem.bForceShow = true;
            continue;
        }

        const int icp1 = elem.icp1;
        const int icp2 = elem.icp2;

        if (!m_secpts[icp1].bvis && !m_secpts[icp2].bvis) {
            // hidden edge line
            continue;
        }

        Segment segq(convToPoint(pv1->v), convToPoint(pv2->v));

        SegIsecList ilst;
        tree.all_intersections(segq, std::back_inserter(ilst));

        if (ilst.empty()) continue;

        Vector4D v12 = pv2->v - pv1->v;
        double l12 = v12.length();

        for (const auto &[intersection_obj, primitive_id] : ilst) {
            size_t idx = std::distance(faces.begin(), primitive_id);
            const auto &[fiv1, fiv2, fiv3] = faceids[idx];

            if (contains_id(elem.iv1, elem.iv2, fiv1, fiv2, fiv3)) {
                continue;
            }

            // if (const Point *p = std::get_if<Point>(&intersection_obj)) {
            //     Vector4D vsec(p->x(), p->y(), p->z());
            //     double fsec = (vsec - pv1->v).length() / l12;
            //     elem.pushIsecList(fsec);
            // } else {
            //     MB_DPRINTLN("ERROR assign to pointer failed!!");
            // }
            // CGAL::Object obj = intersection_obj;
            K::Point_3 psec;
            if (CGAL::assign(psec, intersection_obj)) {
                Vector4D vsec(psec.x(), psec.y(), psec.z());
                double fsec = (vsec - pv1->v).length() / l12;
                elem.pushIsecList(fsec);
            } else {
                MB_DPRINTLN("ERROR assign to pointer failed!!");
            }
        }
    }
}

void RendIntData::cleanupSilEdgeLines()
{
    delete m_pEgMesh;
    m_pEgMesh = NULL;

    Tree *ptree = static_cast<Tree *>(m_pTree);
    delete ptree;
    m_pTree = NULL;

    auto *pfaces = static_cast<FaceVec *>(m_pTreeFaces);
    delete pfaces;
    m_pTreeFaces = NULL;

    auto *pfaceids = static_cast<std::vector<FaceId> *>(m_pTreeFaceIds);
    delete pfaceids;
    m_pTreeFaceIds = NULL;

    m_vertvec.clear();
    m_facevec.clear();
    m_silEdges.clear();
    m_secpts.clear();
}

}  // namespace render

#endif
