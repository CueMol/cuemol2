// -*-Mode: C++;-*-
//
// Sphere set/surface tesselation object
//

#ifndef GFX_SPHERESET_HPP_INCLUDE_
#define GFX_SPHERESET_HPP_INCLUDE_

#include "gfx.hpp"
#include <qlib/Vector4D.hpp>
#include <qlib/LTypes.hpp>
#include "SolidColor.hpp"
#include "DrawElem.hpp"

namespace gfx {

  using qlib::Vector4D;

  template <typename _Vector>
  class SphereSet
  {
  private:
    typedef _Vector pos_type;
    typedef typename _Vector::value_type rad_type;

    struct Sphere {
      pos_type pos;
      rad_type rad;
      ColorPtr col;
    };

    typedef std::vector<Sphere> datatype;

    datatype m_data;

  public:

    void create(int nsize)
    {
      m_data.resize(nsize);
    }

    void sphere(int index, const pos_type &pos, rad_type r, const ColorPtr &col)
    {
      m_data[index].pos = pos;
      m_data[index].rad = r;
      m_data[index].col = col;
    }

    const pos_type &getPos(int isph) const
    {
      return m_data[isph].pos;
    }

    rad_type getRadius(int isph) const
    {
      return m_data[isph].rad;
    }

    const ColorPtr &getColor(int isph) const {
      return m_data[isph].col;
    }

    int getSize() const { return m_data.size(); }

  };

  ///////////////

  template <class _Trait, typename _Vector=qlib::Vector4D>
  class SphereTess
  {
  private:
    /// tesselation detail level (common to all spheres)
    int m_nDetail;

    /// Tesselation output data
    _Trait m_trait;
    
    /// Sphere dataset
    SphereSet<_Vector> m_sphrs;

  public:
    SphereTess()
    {
    }
    
    ~SphereTess()
    {
    }

    _Trait &getTrait() { return m_trait; }

	void create(int natoms, int ndetail)
    {
      m_sphrs.create(natoms);
      m_nDetail = ndetail;
    }

    SphereSet<_Vector> &getSphrs()
    {
      return m_sphrs;
    }

    /// render a sphere

    void estimateMeshSize(int &nverts, int &nfaces)
    {
      const int ndetail = m_nDetail;

      nverts = 0;
      nfaces = 0;
      
      int i;
      int nLat = ndetail+1;
      int nLng, nLngPrev=0;
      
      const double rad = 10000.0;
      const double dmax = (M_PI*rad)/double(ndetail+1);
      
      for (i=0; i<=nLat; ++i) {
        if (i==0) {
          ++nverts;
          nLngPrev=0;
        }
        else if (i==nLat) {
          ++nverts;
          nfaces += nLngPrev;
        }
        else {
          const double th = double(i)*M_PI/double(nLat);
          const double ri = rad*::sin(th);
          nLng = (int) ::ceil(ri*M_PI*2.0/dmax);
          
          nverts += nLng;
          nfaces += nLng + nLngPrev;
          
          nLngPrev=nLng;
        }
      } // for (i)

      // MB_DPRINTLN("Sph> nverts = %d, nfaces = %d", nverts, nfaces);
    }


    void buildSphere(int isph, int &ivt, int &ifc)
    {
      const _Vector v1 = m_sphrs.getPos(isph);
      const double rad = m_sphrs.getRadius(isph);
      const int ndetail = m_nDetail;

      // int col = pSph->ccode;
      const double dmax = (M_PI*rad)/double(ndetail+1);

      quint32 i, j;
      int ivtbase = ivt;
      int ifcbase = ifc;
      quint32 nLat = ndetail+1;

      // detail in longitude direction is automatically determined by stack radius
      quint32 nLng;

      //MB_DPRINTLN("buildSphere v1=(%f,%f,%f) r=%f",
      //v1.x(), v1.y(), v1.z(), rad);
      // MB_DPRINTLN("sphere R=%f, nLat=%d (%f)", rad, nLat, rad*M_PI/dmax);

      quint32 **ppindx = MB_NEW quint32 *[nLat+1];

      // generate verteces

      m_trait.setColor(m_sphrs.getColor(isph));

      for (i=0; i<=nLat; ++i) {
        quint32 ind;

        if (i==0) {
          ind = ivt;
          m_trait.normal(ivt, _Vector(0, 0, 1));
          m_trait.vertex(ivt, _Vector(0, 0, rad) + v1);
          ++ivt;
          ppindx[i] = MB_NEW quint32[1];
          ppindx[i][0] = ind;
        }
        else if (i==nLat) {
          ind = ivt;
          m_trait.normal(ivt, _Vector(0, 0, -1));
          m_trait.vertex(ivt, _Vector(0, 0, -rad) + v1);
          ++ivt;
          ppindx[i] = MB_NEW quint32[1];
          ppindx[i][0] = ind;
        }
        else {
          _Vector vec, norm;
          const double th = double(i)*M_PI/double(nLat);
          const double ri = rad*::sin(th);
          vec.z()  = rad*::cos(th);
          nLng = (int) ::ceil(ri*M_PI*2.0/dmax);
          ppindx[i] = MB_NEW quint32[nLng+2];
          ppindx[i][0] = nLng;
          const double start_phi = double(i%2) * 3.0 / nLng;
          //MB_DPRINTLN("Lat: %d start phi=%f", i, start_phi);
          for (j=0; j<nLng; ++j) {
            double ph = double(j)*M_PI*2.0/double(nLng) + start_phi;
            vec.x() = ri*::cos(ph);
            vec.y() = ri*::sin(ph);
            norm = vec.normalize();

            ind = ivt;
            m_trait.normal(ivt, norm);
            m_trait.vertex(ivt, vec + v1);
            ++ivt;

            ppindx[i][j+1] = ind;
          }
          ppindx[i][j+1] = ppindx[i][1];
        }
      } // for (i)

      // build faces from verteces
      for (i=0; i<nLat; ++i) {
        if (i==0) {
          quint32 ipiv = ppindx[0][0];
          quint32 nLng = ppindx[1][0];
          for (j=0; j<nLng; ++j) {
            quint32 n1 = ipiv;
            quint32 n2 = ppindx[1][j+1];
            quint32 n3 = ppindx[1][j+2];
            m_trait.face(ifc, n1, n2, n3);
            ++ifc;
          }
        }
        else if (i==nLat-1) {
          quint32 ipiv = ppindx[nLat][0];
          quint32 nLng = ppindx[nLat-1][0];
          for (j=0; j<nLng; ++j) {
            quint32 n1 = ppindx[nLat-1][j+2];
            quint32 n2 = ppindx[nLat-1][j+1];
            quint32 n3 = ipiv;
            m_trait.face(ifc, n1, n2, n3);
            ++ifc;
          }
        }
        else /*if (i==2)*/ {

          quint32 j = 0, k = 0;
          int bJ;

          quint32 jmax = ppindx[i][0];
          quint32 *piJ = &(ppindx[i][1]);

          quint32 kmax = ppindx[i+1][0];
          quint32 *piK = &(ppindx[i+1][1]);

          //      double am1, am2;
          while (j+1<=jmax || k+1<=kmax) {
            if (j+1>jmax) bJ = 0;
            else if (k+1>kmax) bJ = 1;
            else bJ = selectTrig(piJ[j], piK[k], piJ[j+1], piK[k+1]);

            if (bJ==1) {
              quint32 n1 = piJ[j];
              quint32 n2 = piK[k];
              quint32 n3 = piJ[j+1];
              m_trait.face(ifc, n1, n2, n3);
              ++ifc;
              ++j;
            }
            else /*if (bJ==0)*/ {
              quint32 n1 = piJ[j];
              quint32 n2 = piK[k];
              quint32 n3 = piK[k+1];
              m_trait.face(ifc, n1, n2, n3);
              ++ifc;
              ++k;
            }
          } // while

        }
      } // for (i)

      for (i=0; i<=nLat; ++i)
        delete [] ppindx[i];
      delete [] ppindx;

      //MB_DPRINTLN("ivt incr=%d", ivt - ivtbase);
      //MB_DPRINTLN("ifc incr=%d", ifc - ifcbase);
    }

    static
      inline _Vector makenorm(const _Vector &pos1,
                               const _Vector &pos2,
                               const _Vector &pos3)
      {
        const _Vector v12 = pos2 - pos1;
        const _Vector v23 = pos3 - pos2;
        _Vector vn = v12.cross(v23);
        const double dnorm = vn.length();
        // if (dnorm<dtol) {
        //   TODO: throw error!!
        // }
        vn /= dnorm;
        return vn;
      }
    
    int selectTrig(quint32 j, quint32 k, quint32 j1, quint32 k1)
    {
      _Vector vj = m_trait.getVertex(j);
      _Vector vk = m_trait.getVertex(k);
      _Vector vj1 = m_trait.getVertex(j1);
      _Vector vk1 = m_trait.getVertex(k1);
      
      _Vector nj1 = makenorm(vj, vk, vj1);
      _Vector nk1 = makenorm(vj, vk, vk1);
      
      double detj = nj1.dot(vk1-vk);
      double detk = nk1.dot(vj1-vj);
      
      if (detj<0 && detk>=0)
        return 1; // select j1
      
      if (detj>=0 && detk<0)
        return 0; // select k1
      
      MB_DPRINTLN("SelectTrig warning; (%d,%d,%d,%d) detj=%f, detk=%f", j, k, j1, k1, detj, detk);
      return 2;
    }
    
  };

  //////////////////////////////////////////////////////////////////////////////

  class VBOSphereTessTraits
  {
  private:
    
    typedef SphereTess<VBOSphereTessTraits> outer_t;

    /// default alpha (multiplied to all alpha comp)
    double m_defAlpha;

    /// Current color
    quint32 m_ccode;

    /// output vertex array
    DrawElemVNCI32 *m_pVary;

  public:
    VBOSphereTessTraits() : m_defAlpha(1.0), m_ccode(0), m_pVary(NULL)
    {
    }
    
    ~VBOSphereTessTraits()
    {
    }

    /////////////////////////////

    void setAlpha(double d) { m_defAlpha = d; }

    void setColor(const ColorPtr &col)
    {
      // XXX: device color/CMYK??
      if (qlib::isNear4(m_defAlpha, 1.0)) {
        m_ccode = col->getCode();
      }
      else {
        m_ccode = gfx::mixAlpha(col->getCode(), m_defAlpha);
      }
    }

    void normal(quint32 ind, const Vector4D &v)
    {
      m_pVary->normal(ind, v);
    }

    void vertex(quint32 ind, const Vector4D &v)
    {
      m_pVary->vertex(ind, v);
      m_pVary->color(ind, m_ccode);
    }

    void face(quint32 ifc, quint32 n1, quint32 n2, quint32 n3)
    {
      m_pVary->setIndex3(ifc, n1, n2, n3);
    }

    Vector4D getVertex(quint32 ind) const {
      Vector4D rv;
      m_pVary->getVertex(ind, rv);
      return rv;
    }

    /// build draw elem objects
    DrawElem *buildDrawElem(outer_t *pOuter)
    {
      int nverts,  nfaces; 
      pOuter->estimateMeshSize(nverts, nfaces);
      int nsphs = pOuter->getSphrs().getSize();
      
      int nvtot = nverts*nsphs;
      int nftot = nfaces*nsphs;
      MB_DPRINTLN("Sph> nv_tot = %d, nf_fot = %d", nvtot, nftot);
      
      // Create DrawElemVNCI (or VNI?) object
      m_pVary = MB_NEW gfx::DrawElemVNCI32();
      m_pVary->startIndexTriangles(nvtot, nftot);
      
      int ivt = 0, ifc = 0;
      for (int i=0; i<nsphs; ++i) {
        pOuter->buildSphere(i, ivt, ifc);
      }

      return m_pVary;
    }

  };


}

#endif

