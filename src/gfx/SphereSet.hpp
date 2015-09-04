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

  template <class _Trait>
  class SphereSetTmpl
  {
  private:
    _Trait m_data;
    
  public:
    SphereSetTmpl()
    {
    }
    
    ~SphereSetTmpl()
    {
    }

    _Trait &getdata() { return m_data; }

    /// render a sphere

    void estimateMeshSize(int ndetail, int &nverts, int &nfaces)
    {
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
      const Vector4D v1 = m_data.getPos(isph);
      const double rad = m_data.getRadius(isph);
      const int ndetail = m_data.getDetail(isph);

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
      for (i=0; i<=nLat; ++i) {
        quint32 ind;

        if (i==0) {
          ind = ivt;
          m_data.color(isph, ivt);
          m_data.normal(ivt, Vector4D(0, 0, 1));
          m_data.vertex(ivt, Vector4D(0, 0, rad) + v1);
          ++ivt;
          ppindx[i] = MB_NEW quint32[1];
          ppindx[i][0] = ind;
        }
        else if (i==nLat) {
          ind = ivt;
          m_data.color(isph, ivt);
          m_data.normal(ivt, Vector4D(0, 0, -1));
          m_data.vertex(ivt, Vector4D(0, 0, -rad) + v1);
          ++ivt;
          ppindx[i] = MB_NEW quint32[1];
          ppindx[i][0] = ind;
        }
        else {
          Vector4D vec, norm;
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
            m_data.color(isph, ivt);
            m_data.normal(ivt, norm);
            m_data.vertex(ivt, vec + v1);
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
            m_data.face(ifc, n1, n2, n3);
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
            m_data.face(ifc, n1, n2, n3);
            ++ifc;
          }
        }
        else /*if (i==2)*/ {

          int j = 0, k = 0;
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
              m_data.face(ifc, n1, n2, n3);
              ++ifc;
              ++j;
            }
            else /*if (bJ==0)*/ {
              quint32 n1 = piJ[j];
              quint32 n2 = piK[k];
              quint32 n3 = piK[k+1];
              m_data.face(ifc, n1, n2, n3);
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
      inline Vector4D makenorm(const Vector4D &pos1,
                               const Vector4D &pos2,
                               const Vector4D &pos3)
      {
        const Vector4D v12 = pos2 - pos1;
        const Vector4D v23 = pos3 - pos2;
        Vector4D vn = v12.cross(v23);
        const double dnorm = vn.length();
        // if (dnorm<dtol) {
        //   TODO: throw error!!
        // }
        vn /= dnorm;
        return vn;
      }
    
    int selectTrig(quint32 j, quint32 k, quint32 j1, quint32 k1)
    {
      Vector4D vj = m_data.getVertex(j);
      Vector4D vk = m_data.getVertex(k);
      Vector4D vj1 = m_data.getVertex(j1);
      Vector4D vk1 = m_data.getVertex(k1);
      
      Vector4D nj1 = makenorm(vj, vk, vj1);
      Vector4D nk1 = makenorm(vj, vk, vk1);
      
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

  class VBOSphereSet_traits
  {
  private:
    struct Sphere {
      Vector4D posr;
      quint32 ccode;
    };

    typedef std::vector<Sphere> datatype;
    
    typedef SphereSetTmpl<VBOSphereSet_traits> outer_t;

    datatype m_data;

    /// default alpha (multiplied to all alpha comp)
    double m_defAlpha;

    /// tesselation detail (common to all spheres)
    int m_nDetail;

  public:
    VBOSphereSet_traits() : m_defAlpha(1.0), m_nDetail(10)
    {
    }
    
    ~VBOSphereSet_traits()
    {
    }

    void setAlpha(double d) { m_defAlpha = d; }

    void create(int nsize, int ndetail)
    {
      m_nDetail = ndetail;
      m_data.resize(nsize);
    }

    void sphere(int index, const Vector4D &pos, double r, const ColorPtr &col)
    {
      m_data[index].posr = pos;
      m_data[index].posr.w() = r;
      if (qlib::isNear4(m_defAlpha, 1.0)) {
        m_data[index].ccode = col->getCode();
      }
      else {
        m_data[index].ccode = gfx::mixAlpha(col->getCode(), m_defAlpha);
      }
    }

    const Vector4D &getPos(int isph) const
    {
      return m_data[isph].posr;
    }
    double getRadius(int isph) const
    {
      return m_data[isph].posr.w();
    }
    int getDetail(int isph) const
    {
      return m_nDetail;
    }

    /////////////////////////////

    DrawElemVNCI32 *m_pVary;

    void color(quint32 isph, quint32 ivert)
    {
      quint32 col = m_data[isph].ccode;
      m_pVary->color(ivert, col);
    }

    void normal(quint32 ind, const Vector4D &v)
    {
      m_pVary->normal(ind, v);
    }

    void vertex(quint32 ind, const Vector4D &v)
    {
      m_pVary->vertex(ind, v);
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
      pOuter->estimateMeshSize(m_nDetail, nverts, nfaces);
      int nsphs = m_data.size();
      
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

  ////////////////////////////////////////////////////////////////////////////////

/*

  class GFX_API SphereSet
  {
  private:
    struct ElemType
    {
      Vector4D posr;
      quint32 ccode;
    };

    std::deque<ElemType> m_data;
    
    /// tesselation detail
    int m_nDetail;

    /// default alpha (multiplied to all alpha comp)
    double m_defAlpha;

    /// built draw elem object
    DrawElemVNCI32 *m_pDrawElem;

  public:
    SphereSet();
    virtual ~SphereSet();

    void setAlpha(double d) { m_defAlpha = d; }

    /// estimate size / allocate draw elem object
    void create(int nsize, int ndetail);

    /// render a sphere
    void sphere(int index, const Vector4D &pos, double r, const ColorPtr &col);

    /// build draw elem objects
    DrawElem *buildDrawElem();

  private:
    void estimateMeshSize(int &, int &);
    void buildSphere(int i, int &ivt, int &ifc);
    int selectTrig(int j, int k, int j1, int k1);
    
  };

*/

}

#endif

