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

  template <typename _Vector, typename _Color>
  class SphereSet
  {
  private:
    typedef _Vector pos_type;
    typedef _Color color_type;
    typedef typename _Vector::value_type rad_type;

    struct Sphere {
      pos_type pos;
      rad_type rad;
      color_type col;
    };

    typedef std::vector<Sphere> datatype;

    datatype m_data;

  public:

    void create(int nsize)
    {
      m_data.resize(nsize);
    }

    void set(int index, const pos_type &pos, rad_type r, const color_type &col)
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

    const color_type &getColor(int isph) const {
      return m_data[isph].col;
    }

    int getSize() const { return m_data.size(); }

  };

  ///////////////

  template <class _Trait, typename _Vector=qlib::Vector4D, typename _Color=ColorPtr>
  class SphereTess
  {
  private:
    /// tesselation detail level (common to all spheres)
    int m_nDetail;

    /// Tesselation output data
    _Trait m_trait;
    
    /// Sphere dataset
    SphereSet<_Vector, _Color> m_data;

    typedef _Vector pos_type;
    typedef typename _Vector::value_type scalar_type;

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
      m_data.create(natoms);
      m_nDetail = ndetail;
    }

    SphereSet<_Vector,_Color> &getData()
    {
      return m_data;
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
      
      const scalar_type rad = scalar_type(10000);
      const scalar_type dmax = scalar_type(M_PI*rad)/scalar_type(ndetail+1);
      
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
          const scalar_type th = scalar_type(i*M_PI)/scalar_type(nLat);
          const scalar_type ri = rad*scalar_type( sin(th) );
          nLng = int( ceil(ri*M_PI*2.0/dmax) );
          
          nverts += nLng;
          nfaces += nLng + nLngPrev;
          
          nLngPrev=nLng;
        }
      } // for (i)

      // MB_DPRINTLN("Sph> nverts = %d, nfaces = %d", nverts, nfaces);
    }


    void build(int isph, int &ivt, int &ifc)
    {
      const pos_type v1 = m_data.getPos(isph);
      const scalar_type rad = m_data.getRadius(isph);
      const int ndetail = m_nDetail;

      // int col = pSph->ccode;
      const scalar_type dmax = scalar_type(M_PI*rad)/scalar_type(ndetail+1);

      quint32 i, j;
      int ivtbase = ivt;
      int ifcbase = ifc;
      //quint32 nLat = ndetail+1;
      quint32 nLat = quint32(ndetail/2) * 2;

      // detail in longitude direction is automatically determined by stack radius
      quint32 nLng;

      //MB_DPRINTLN("build v1=(%f,%f,%f) r=%f",
      //v1.x(), v1.y(), v1.z(), rad);
      MB_DPRINTLN("sphere nDet=%d, nLat=%d", ndetail, nLat);

      quint32 **ppindx = MB_NEW quint32 *[nLat+1];

      // generate verteces

      m_trait.setColor(m_data.getColor(isph));

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
          const scalar_type th = scalar_type(i)*M_PI/scalar_type(nLat);
          const scalar_type ri = rad * scalar_type(sin(th));
          vec.z()  = rad * scalar_type(cos(th));
          nLng = int( ceil(ri*M_PI*2.0/dmax) );

          MB_DPRINTLN("   iLat=%d nLng=%d", i, nLng);

          ppindx[i] = MB_NEW quint32[nLng+2];
          ppindx[i][0] = nLng;
          const scalar_type start_phi = scalar_type(i%2) * scalar_type(3) / scalar_type(nLng);
          //MB_DPRINTLN("Lat: %d start phi=%f", i, start_phi);
          for (j=0; j<nLng; ++j) {
            const scalar_type ph = scalar_type(j*2)*M_PI/scalar_type(nLng) + start_phi;
            vec.x() = ri * scalar_type( cos(ph) );
            vec.y() = ri * scalar_type( sin(ph) );
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
        return vn.normalize();
        // const scalar_type dnorm = vn.length();
        // if (dnorm<dtol) {
        //   TODO: throw error!!
        // }
        // vn /= dnorm;
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
      
      scalar_type detj = nj1.dot(vk1-vk);
      scalar_type detk = nk1.dot(vj1-vj);
      
      if (detj<0 && detk>=0)
        return 1; // select j1
      
      if (detj>=0 && detk<0)
        return 0; // select k1
      
      //MB_DPRINTLN("SelectTrig warning; (%d,%d,%d,%d) detj=%f, detk=%f", j, k, j1, k1, detj, detk);
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

    void setTarget(gfx::DrawElemVNCI32 *pVBO) {
      m_pVary = pVBO;
    }

    /*
    /// build draw elem objects
    DrawElem *buildDrawElem(outer_t *pOuter)
    {
      int nverts,  nfaces; 
      pOuter->estimateMeshSize(nverts, nfaces);
      int nsphs = pOuter->getData().getSize();
      
      int nvtot = nverts*nsphs;
      int nftot = nfaces*nsphs;
      MB_DPRINTLN("Sph> nv_tot = %d, nf_fot = %d", nvtot, nftot);
      
      // Create DrawElemVNCI (or VNI?) object
      m_pVary = MB_NEW gfx::DrawElemVNCI32();
      m_pVary->startIndexTriangles(nvtot, nftot);
      
      int ivt = 0, ifc = 0;
      for (int i=0; i<nsphs; ++i) {
        pOuter->build(i, ivt, ifc);
      }

      return m_pVary;
    }
     */
  };

  //////////////////////////////////////////////////////////////////////////////

  
  class SingleTessTrait
  {
  private:
    
    //typedef _Tess<SingleTessTrait> outer_t;

    /// output vertex array
    gfx::DrawElemVNCI32 *m_pVary;

  public:
    SingleTessTrait() : m_pVary(NULL)
    {
    }
    
    ~SingleTessTrait()
    {
    }

    /////////////////////////////

    void setColor(const ColorPtr &col)
    {
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

    void setTarget(gfx::DrawElemVNCI32 *pVBO) {
      m_pVary = pVBO;
    }

    /*
    /// build draw elem objects
    gfx::DrawElemVNCI32 *buildDrawElem(outer_t *pOuter)
    {
      int nverts, nfaces;
      pOuter->estimateMeshSize(nverts, nfaces);
      
      // Create DrawElemVNCI (or VNI?) object
      m_pVary = MB_NEW gfx::DrawElemVNCI32();
	  m_pVary->startIndexTriangles(nverts, nfaces);
      
      int ivt = 0, ifc = 0;
      pOuter->build(0, ivt, ifc);

      return m_pVary;
    }
     */
  };

}

#endif

