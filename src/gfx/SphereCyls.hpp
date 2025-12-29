// -*-Mode: C++;-*-
//
// Spheres and cylinders
//

#pragma once

namespace gfx {

///
/// Cylinder object
///
template <class _TVector, class _TColor, class _TXform>
class Cylinder
{
public:
    /// location of termini
    _TVector v1, v2;

    /// color
    _TColor col;

    /// width of termini
    double w1, w2;

    /// terminal cap flag
    bool bcap;

    /// detail level for tesselation
    int ndetail;

    /// transformation matrix
    _TXform *pTransf;

    ///
    ///  default ctor
    /// @note default width is 1.0
    ///
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

        if (ptrf == nullptr)
            p->pTransf = nullptr;
        else
            p->pTransf = MB_NEW _TXform(*ptrf);

        MB_DPRINTLN("cyl.add ndet=%d", ndet);
        m_data.push_back(p);
    }

    /**
       Erase all cylinders
    */
    void eraseAll()
    {
        qlib::delete_and_clear<data_t, cylinder_t>(m_data);
    }

    /**
         Generate mesh data from the cylinder list
         @param pMesh pointer to the mesh object to be filled
     */
    void makeMesh(_TMesh *pMesh)
    {
        for (const auto *p : m_data) {
            makeMeshImpl(pMesh, p);
        }
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
        _TXform mat = _TXform::makeRotMat(nn, n1);

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

        _TXform xfm;
        if (pCyl->pTransf != NULL) {
            xfm = *(pCyl->pTransf);
        }

        xfm.matprod(_TXform::makeTransMat(cylv2));
        xfm.matprod(mat);

        int ivbot = -1;
        if (bcap) {
            // bottom terminal vertex (at the center of the disk)
            ivbot = pMesh->addVertex(_TVector(0, 0, 0), _TVector(0, 0, -1), col, xfm);
            for (th = 0.0, i = 0; i < NDIVR; ++i, th += dth) {
                const double costh = ::cos(th);
                const double sinth = ::sin(th);
                const double xx = w1 * costh;
                const double yy = w1 * sinth;
                pMesh->addVertex(_TVector(xx, yy, 0),
                                 _TVector(0, 0, -1), col, xfm);
            }
        }

        int ivcyl = -1;
        for (j = 0; j < NDIVV; ++j) {
            const double ww = w1 + dw * double(j);
            const double zz = dlen * double(j);
            for (th = 0.0, i = 0; i < NDIVR; ++i, th += dth) {
                const double costh = ::cos(th);
                const double sinth = ::sin(th);
                const double xx = ww * costh;
                const double yy = ww * sinth;
                int iv = pMesh->addVertex(_TVector(xx, yy, zz),
                                          _TVector(costh, sinth, 0), col, xfm);
                if (ivcyl < 0) {
                    ivcyl = iv;
                }
            }
        }

        int ivtop = -1;
        if (bcap) {
            // top terminal vertex (at the center of the disk)
            ivtop =
                pMesh->addVertex(_TVector(0, 0, len), _TVector(0, 0, 1), col, xfm);
            for (th = 0.0, i = 0; i < NDIVR; ++i, th += dth) {
                const double costh = ::cos(th);
                const double sinth = ::sin(th);
                const double xx = w2 * costh;
                const double yy = w2 * sinth;
                int iv = pMesh->addVertex(_TVector(xx, yy, len),
                                          _TVector(0, 0, 1), col, xfm);
            }
        }

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
            const int u = j * NDIVR;
            const int v = (j + 1) * NDIVR;
            for (i = 0; i < NDIVR; ++i) {
                const int ii = i % NDIVR;
                const int jj = (i + 1) % NDIVR;
                pMesh->addFace(ivcyl + u + ii, ivcyl + u + jj, ivcyl + v + jj, nfmode);
                pMesh->addFace(ivcyl + u + ii, ivcyl + v + jj, ivcyl + v + ii, nfmode);
            }
        }

        // top disk
        if (bcap) {
            for (i = 0; i <= NDIVR; ++i) {
                const int ii = i % NDIVR;
                const int jj = (i + 1) % NDIVR;
                pMesh->addFace(ivtop, ivtop + 1 + ii, ivtop + 1 + jj, nfmode);
            }
        }
    }
};

//////////

///
/// Sphere object
///
template <class _TVector, class _TColor, class _TXform>
class Sphere
{
public:
    /// location of center
    _TVector v1;

    /// color
    _TColor col;

    /// radius
    double r;

    /// detail level for tesselation
    int ndetail;

    /// transformation matrix
    _TXform *pTransf;

    /// default ctor
    Sphere(const _TVector &v, _TColor c, double radius, int nDet)
        : v1(v), col(c), r(radius), ndetail(nDet), pTransf(nullptr)
    {
    }

    /// dtor
    ~Sphere()
    {
        if (pTransf != nullptr) {
            delete pTransf;
        }
    }
};

///
/// Sphere list object
///
template <class _TVector, class _TXform, class _TMesh>
class SphereList
{
public:
    using _TColor = typename _TMesh::color_t;
    using sphere_t = Sphere<_TVector, _TColor, _TXform>;
    using data_t = std::deque<sphere_t *>;

    data_t m_data;

    /// Add a sphere to the list
    /// @param v location of center
    /// @param radius radius
    /// @param color color
    /// @param nDetail detail level for tesselation
    void add(const _TVector &v, double radius, _TColor color, int nDetail,
             const _TXform *ptrf = nullptr)
    {
        auto *p = MB_NEW sphere_t(v, color, radius, nDetail);

        if (ptrf == nullptr)
            p->pTransf = nullptr;
        else
            p->pTransf = MB_NEW _TXform(*ptrf);

        m_data.push_back(p);
    }

    void eraseAll()
    {
        qlib::delete_and_clear<data_t, sphere_t>(m_data);
    }

    void makeMesh(_TMesh *pMesh, const _TXform *pXfm = nullptr)
    {
        for (const auto *p : m_data) {
            makeMeshImpl(pMesh, p, pXfm);
        }
    }

    int getSize() const
    {
        return m_data.size();
    }

private:
    void makeMeshImpl(_TMesh *pMesh, const sphere_t *pSph,
                      const _TXform *pXfm = nullptr)
    {
        const _TVector v1 = pSph->v1;

        // _TVector vcam(0, 0, m_dViewDist);
        // // LOG_DPRINTLN("vcam=%s", vcam.toString().c_str());

        // if (!m_bPerspec) {
        //     vcam.x() = v1.x();
        //     vcam.y() = v1.y();
        // }

        // // LOG_DPRINTLN("vcam=%s", vcam.toString().c_str());
        // // LOG_DPRINTLN("v1=%s", v1.toString().c_str());

        // _TVector e3 = (vcam - v1).normalize();
        // _TVector e1 = e3.cross(_TVector(1, 0, 0));
        // e1 = e1.normalize();
        // _TVector e2 = e1.cross(e3);

        // Matrix4D xform = Matrix4D::makeTransMat(v1);
        // xform.matprod(Matrix4D::makeRotMat(e3, e1).transpose());
        // xform.matprod(Matrix4D::makeTransMat(-v1));

        _TXform xform;
        if (pXfm != nullptr) {
            xform = *pXfm;
        }

        if (pSph->pTransf != nullptr) {
            // xform.matprod(*(pSph->pTransf));
            xform = *pSph->pTransf;
        }

        const auto rad = pSph->r;
        const auto col = pSph->col;
        const double dmax = (M_PI * rad) / double(pSph->ndetail + 1);

        const int ivstart = pMesh->getVertexSize();

        int i, j;
        // int nLat = pSph->ndetail+1;
        int nLat = ceil(pSph->ndetail / 2.0) * 2;

        // detail in longitude direction is automatically determined by stack radius
        int nLng;

        MB_DPRINTLN("SphereList::makeMeshImp v1=(%f,%f,%f) r=%f", pSph->v1.x(),
                    pSph->v1.y(), pSph->v1.z(), pSph->r);
        MB_DPRINTLN("sphere R=%f, nLat=%d (%f)", rad, nLat, rad * M_PI / dmax);

        int **ppindx = new int *[nLat + 1];

        // generate verteces
        for (i = 0; i <= nLat; ++i) {
            int ind;
            // std::list<int> ilst;

            if (i == 0) {
                ind = pMesh->addVertex(_TVector(0, 0, rad) + v1, _TVector(0, 0, 1), col,
                                       xform);
                // ind = putVert(_TVector(0, 0, rad) + v1);

                ppindx[i] = new int[1];
                ppindx[i][0] = ind;
            } else if (i == nLat) {
                ind = pMesh->addVertex(_TVector(0, 0, -rad) + v1, _TVector(0, 0, -1),
                                       col, xform);
                // ind = putVert(_TVector(0, 0, -rad) + v1);
                // ilst.push_back(ind);

                ppindx[i] = new int[1];
                ppindx[i][0] = ind;
            } else {
                _TVector vec, norm;
                const double th = double(i) * M_PI / double(nLat);
                const double ri = rad * ::sin(th);
                vec.z() = rad * ::cos(th);
                nLng = (int)::ceil(ri * M_PI * 2.0 / dmax);
                ppindx[i] = new int[nLng + 2];
                ppindx[i][0] = nLng;
                const double start_phi = double(i % 2) * 3.0 / nLng;
                // MB_DPRINTLN("Lat: %d start phi=%f", i, start_phi);
                for (j = 0; j < nLng; ++j) {
                    double ph = double(j) * M_PI * 2.0 / double(nLng) + start_phi;
                    vec.x() = ri * ::cos(ph);
                    vec.y() = ri * ::sin(ph);
                    norm = vec.normalize();
                    ind = pMesh->addVertex(vec + v1, norm, col, xform);
                    // ind = putVert(vec + v1);

                    ppindx[i][j + 1] = ind;
                }
                ppindx[i][j + 1] = ppindx[i][1];
            }
        }  // for (i)

        // build faces from verteces
        for (i = 0; i < nLat; ++i) {
            if (i == 0) {
                int ipiv = ppindx[0][0];
                int nLng = ppindx[1][0];
                for (j = 0; j < nLng; ++j) {
                    pMesh->addFace(ipiv, ppindx[1][j + 1], ppindx[1][j + 2], 2);
                }
            } else if (i == nLat - 1) {
                int ipiv = ppindx[nLat][0];
                int nLng = ppindx[nLat - 1][0];
                for (j = 0; j < nLng; ++j) {
                    pMesh->addFace(ppindx[nLat - 1][j + 2], ppindx[nLat - 1][j + 1],
                                   ipiv, 2);
                }
            } else /*if (i==2)*/ {
                int j = 0, k = 0;
                int bJ;

                int jmax = ppindx[i][0];
                int *piJ = &(ppindx[i][1]);

                int kmax = ppindx[i + 1][0];
                int *piK = &(ppindx[i + 1][1]);

                //      double am1, am2;
                while (j + 1 <= jmax || k + 1 <= kmax) {
                    if (j + 1 > jmax)
                        bJ = 0;
                    else if (k + 1 > kmax)
                        bJ = 1;
                    else
                        bJ = selectTrig(piJ[j], piK[k], piJ[j + 1], piK[k + 1], pMesh);

                    if (bJ == 1) {
                        pMesh->addFace(piJ[j], piK[k], piJ[j + 1], 2);
                        ++j;
                    } else /*if (bJ==0)*/ {
                        pMesh->addFace(piJ[j], piK[k], piK[k + 1], 2);
                        ++k;
                    }
                }  // while
            }
        }  // for (i)

        for (i = 0; i <= nLat; ++i) delete[] ppindx[i];
        delete[] ppindx;
    }

    static int selectTrig(int j, int k, int j1, int k1, _TMesh *pMesh)
    {
        const _TVector &vj = pMesh->getVertex(j)->v;
        const _TVector &vk = pMesh->getVertex(k)->v;
        const _TVector &vj1 = pMesh->getVertex(j1)->v;
        const _TVector &vk1 = pMesh->getVertex(k1)->v;

        _TVector nj1 = makenorm(vj, vk, vj1);
        _TVector nk1 = makenorm(vj, vk, vk1);

        double detj = nj1.dot(vk1 - vk);
        double detk = nk1.dot(vj1 - vj);

        if (detj < 0 && detk >= 0) return 1;  // select j1

        if (detj >= 0 && detk < 0) return 0;  // select k1

        MB_DPRINTLN("SelectTrig warning; (%d,%d,%d,%d) detj=%f, detk=%f", j, k, j1, k1,
                    detj, detk);
        return 2;
    }

    static inline _TVector makenorm(const _TVector &pos1, const _TVector &pos2,
                                    const _TVector &pos3)
    {
        const auto v12 = pos2 - pos1;
        const auto v23 = pos3 - pos2;
        auto vn = v12.cross(v23);
        const double dnorm = vn.length();
        vn /= dnorm;
        return vn;
    }
};

}  // namespace gfx
