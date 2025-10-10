// -*-Mode: C++;-*-
//
// Spheres and cylinders
//

#pragma once

namespace gfx {

/**
   Cylinder object
*/
template <class _TVector, class _TColor, class _TXform>
class Cylinder
{
public:
    /**
       location of termini
    */
    _TVector v1, v2;

    /**
       color
    */
    _TColor col;

    /// width of termini
    double w1, w2;

    /// terminal cap flag
    bool bcap;

    /// detail level for tesselation
    int ndetail;

    /// transformation matrix
    _TXform *pTransf;

    /**
       ctor
       @note default width is 1.0
    */
    Cylinder() : w1(1.0), w2(1.0), bcap(false), ndetail(1), pTransf(nullptr) {}

    /**
       dtor
    */
    ~Cylinder()
    {
        if (pTransf != nullptr) delete pTransf;
    }
};

/**
   Cylinder list object
*/
template <class _TVector, class _TXform, class _TMesh>
class CylinderList
{
public:
    using _TColor = typename _TMesh::color_t;
    using cylinder_t = Cylinder<_TVector, _TColor, _TXform>;
    using data_t = std::deque<cylinder_t *>;

    data_t m_data;

    /**
       Add a cylinder to the list
       @param v1 location of one terminus
       @param v2 location of the other terminus
       @param w1 width of the terminus at v1
       @param w2 width of the terminus at v2
       @param col color
       @param ndet detail level for tesselation
       @param bcap if true, terminal caps are generated
       @param ptrf pointer to the transformation matrix (can be NULL)
    */
    void add(const Vector4D &v1, const Vector4D &v2, double w1, double w2, _TColor col,
             int ndet, bool bcap, const _TXform *ptrf)
    {
        auto p = MB_NEW cylinder_t();
        p->v1 = v1;
        p->v2 = v2;
        p->col = col;
        p->w1 = w1;
        p->w2 = w2;
        p->ndetail = ndet;
        p->bcap = bcap;

        if (ptrf == NULL)
            p->pTransf = NULL;
        else
            p->pTransf = MB_NEW Matrix4D(*ptrf);

        MB_DPRINTLN("cyl.add ndet=%d" , ndet);
        m_data.push_back(p);
    }

    /**
       Erase all cylinders
    */
    void eraseCyls()
    {
        qlib::delete_and_clear<data_t, cylinder_t>(m_data);
    }

    /**
         Generate mesh data from the cylinder list
         @param pMesh pointer to the mesh object to be filled
         @param bErase if true, the cylinder list is erased after the mesh generation
     */
    void makeMesh(_TMesh *pMesh, bool bErase)
    {
        for (const cylinder_t *p : m_data) {
            makeMeshImpl(pMesh, p);
        }

        if (bErase) eraseCyls();

        return;
    }

    int getSize() const
    {
        return m_data.size();
    }

private:
    /**
       Internal function to generate mesh data from a single cylinder
       @param pMesh pointer to the mesh object to be filled
       @param pCyl pointer to the cylinder object
    */
    void makeMeshImpl(_TMesh *pMesh, const cylinder_t *pCyl)
    {
        _TVector cylv1(pCyl->v1), cylv2(pCyl->v2);
        _TColor col = pCyl->col;

        MB_DPRINTLN("=== Cyls::makeMeshImpl ===");

        _TVector nn = cylv1 - cylv2;
        double len = nn.length();
        if (len <= F_EPS4) {
            // ignore a degenerated cylinder
            return;
        }

        nn = cylv1 - cylv2;
        len = nn.length();
        nn = nn.scale(1.0 / len);

        MB_DPRINTLN("nn: (%f,%f,%f)", nn.x(), nn.y(), nn.z());
        MB_DPRINTLN("v1: (%f,%f,%f)", cylv1.x(), cylv1.y(), cylv1.z());
        MB_DPRINTLN("v2: (%f,%f,%f)", cylv2.x(), cylv2.y(), cylv2.z());

        const _TVector ex(1, 0, 0), ey(0, 1, 0), ez(0, 0, 1);
        _TVector n1, n2;
        if (qlib::abs(nn.dot(ex)) < 0.9) {
            n1 = nn.cross(ex);
        } else if (qlib::abs(nn.dot(ey)) < 0.9) {
            n1 = nn.cross(ey);
        } else if (qlib::abs(nn.dot(ez)) < 0.9) {
            n1 = nn.cross(ez);
        } else {
            LOG_DPRINTLN("ConvCYL fatal error !!");
            return;
        }
        n1 = n1.normalize();
        Matrix4D mat = Matrix4D::makeRotMat(nn, n1);

        //
        // generate verteces
        //

        int i, j;
        double th;
        const double w2 = pCyl->w1;
        const double w1 = pCyl->w2;
        const bool bcap = pCyl->bcap;

        const int NDIVR = 2 * (pCyl->ndetail + 1);
        const double dth = (M_PI * 2.0) / NDIVR;

        // const int NDIVV = qlib::max(2, (int) ::floor(len/((pCyl->w1)*dth)));
        const int NDIVV = 2;
        const double dw = (w2 - w1) / double(NDIVV - 1);
        const double dlen = len / double(NDIVV - 1);

        MB_DPRINTLN("cyl ndiv r,v =(%d, %d)", NDIVR, NDIVV);

        Matrix4D xfm;
        if (pCyl->pTransf != NULL) xfm = *(pCyl->pTransf);

        xfm.matprod(Matrix4D::makeTransMat(cylv2));
        xfm.matprod(mat);

        // bottom terminal vertex (at the center of the disk)
        const int ivbot =
            pMesh->addVertex(_TVector(0, 0, 0), _TVector(0, 0, -1), col, xfm);

        for (j = 0; j < NDIVV; ++j) {
            const double ww = w1 + dw * double(j);
            const double zz = dlen * double(j);
            for (th = 0.0, i = 0; i < NDIVR; ++i, th += dth) {
                const double costh = ::cos(th);
                const double sinth = ::sin(th);
                const double xx = ww * costh;
                const double yy = ww * sinth;
                pMesh->addVertex(_TVector(xx, yy, zz), _TVector(costh, sinth, 0), col,
                                 xfm);
            }
        }

        // top terminal vertex (at the center of the disk)
        const int ivtop =
            pMesh->addVertex(_TVector(0, 0, len), _TVector(0, 0, 1), col, xfm);

        //
        // connect verteces & make faces
        //

        int nfmode = bcap ? MeshFace::MFMOD_CYL : MeshFace::MFMOD_NORGLN;

        // bottom disk
        if (bcap) {
            for (i = 0; i <= NDIVR; ++i) {
                const int ii = i % NDIVR;
                const int jj = (i + 1) % NDIVR;
                pMesh->addFace(ivbot, ivbot + 1 + jj, ivbot + 1 + ii, nfmode);
            }
        }

        // cylinder body
        for (j = 0; j < NDIVV - 1; ++j) {
            const int u = 1 + j * NDIVR;
            const int v = 1 + (j + 1) * NDIVR;
            for (i = 0; i < NDIVR; ++i) {
                const int ii = i % NDIVR;
                const int jj = (i + 1) % NDIVR;
                pMesh->addFace(ivbot + u + ii, ivbot + u + jj, ivbot + v + jj, nfmode);
                pMesh->addFace(ivbot + u + ii, ivbot + v + jj, ivbot + v + ii, nfmode);
            }
        }

        // top disk
        if (bcap) {
            for (i = 0; i <= NDIVR; ++i) {
                const int ii = i % NDIVR;
                const int jj = (i + 1) % NDIVR;

                pMesh->addFace(ivtop, ivbot + 1 + (NDIVV - 1) * NDIVR + ii,
                               ivbot + 1 + (NDIVV - 1) * NDIVR + jj, nfmode);
            }
        }
    }
};

// /// Sphere object
// class Sphere {
// public:
//   _TVector v1;
//   ColIndex col;
//   double r;
//   int ndetail;
// };

}  // namespace gfx
