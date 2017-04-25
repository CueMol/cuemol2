// -*-Mode: C++;-*-
//
// Cylinder set/surface tesselation object
//

#ifndef GFX_CYLINDERSET_HPP_INCLUDE
#define GFX_CYLINDERSET_HPP_INCLUDE

#include "gfx.hpp"
#include <qlib/Matrix3T.hpp>
#include <qlib/Vector4D.hpp>
#include <qlib/LTypes.hpp>
#include "SolidColor.hpp"
#include "DrawElem.hpp"

namespace gfx {

  using qlib::Vector4D;
  using qlib::Matrix3T;

  template <typename _Vector, typename _Color>
  class CylinderSet
  {
  private:
    typedef _Vector pos_type;
    typedef _Color color_type;
    typedef typename _Vector::value_type value_type;

    struct Cylinder {
      pos_type pos1, pos2;
      value_type rad;
      color_type col;
    };

    typedef std::vector<Cylinder> datatype;

    datatype m_data;

  public:

    void create(int nsize)
    {
      m_data.resize(nsize);
    }

    void set(int index, const pos_type &pos1, const pos_type &pos2, value_type r, const color_type &col)
    {
      m_data[index].pos1 = pos1;
      m_data[index].pos2 = pos2;
      m_data[index].rad = r;
      m_data[index].col = col;
    }

    const pos_type &getPos1(int i) const
    {
      return m_data[i].pos1;
    }
    const pos_type &getPos2(int i) const
    {
      return m_data[i].pos2;
    }

    value_type getRadius(int i) const
    {
      return m_data[i].rad;
    }

    const color_type &getColor(int i) const {
      return m_data[i].col;
    }

    int getSize() const { return m_data.size(); }

  };

  ///////////////

  template <class _Trait, typename _Vector=qlib::Vector4D, typename _Color=ColorPtr>
  class CylinderTess
  {
  private:
    typedef _Vector pos_type;
    typedef _Color color_type;
    typedef typename _Vector::value_type value_type;

    /// tesselation detail level (common to all cylinders)
    int m_nDetail;

    /// cap flag
    bool m_bCap;

    /// Tesselation output data
    _Trait m_trait;
    
    /// Cylinder dataset
    CylinderSet<_Vector, _Color> m_data;

  public:
    CylinderTess()
    {
      m_bCap = false;
    }
    
    ~CylinderTess()
    {
    }

    _Trait &getTrait() { return m_trait; }

    void setCap(bool bCap) { m_bCap = bCap; }

    void create(int natoms, int ndetail)
    {
      m_data.create(natoms);
      m_nDetail = ndetail;
    }

    CylinderSet<_Vector, _Color> &getData()
    {
      return m_data;
    }

    void estimateMeshSize(int &nverts, int &nfaces)
    {
      const int ndetail = m_nDetail;

      const int NDIVR = 2*(ndetail+1);
      const int NDIVV = 2;
      
      nverts = NDIVR * NDIVV;
      if (m_bCap)
        nverts += 2;
      
      nfaces = NDIVR * (NDIVV-1);
      if (m_bCap)
        nfaces += NDIVR * 2;

      // MB_DPRINTLN("Sph> nverts = %d, nfaces = %d", nverts, nfaces);
    }


    void build(int ie, int &ivt, int &ifc)
    {
      const pos_type &v1 = m_data.getPos1(ie);
      const pos_type &v2 = m_data.getPos2(ie);
      const color_type &col = m_data.getColor(ie);
      const value_type rad = m_data.getRadius(ie);
      const int ndetail = m_nDetail;

      pos_type nn = v1 - v2;
      value_type len = nn.length();
      if (len<=F_EPS4) {
        // ignore a degenerated cylinder
        return;
      }
  
      nn.divideSelf(len);

      const pos_type ex(1,0,0), ey(0,1,0), ez(0,0,1);
      pos_type n1, n2;
      if (qlib::abs(nn.dot(ex)) < 0.9) {
        n1 = nn.cross(ex);
      }
      else if (qlib::abs(nn.dot(ey)) < 0.9) {
        n1 = nn.cross(ey);
      }
      else if (qlib::abs(nn.dot(ez)) < 0.9) {
        n1 = nn.cross(ez);
      }
      else {
        LOG_DPRINTLN("ConvCYL fatal error !!");
        return;
      }
      //n1.normalizeSelf();
      n1 = n1.normalize();

      Matrix3T<value_type> rot(n1.xyz(), nn.cross(n1).xyz(), nn.xyz());

      const int NDIVR = 2*(ndetail+1);
      const value_type dth = value_type(M_PI*2.0)/value_type(NDIVR);

      const int NDIVV = 2;
      const value_type dw = value_type(0); //(w2-w1)/value_type(NDIVV-1);
      const value_type dlen = len/value_type(NDIVV-1);

      //
      // Build vertex
      //
      
      m_trait.setColor(col);

      if (m_bCap) {
        setNormal(ivt, pos_type(0,0,-1), rot);
        setVertex(ivt, pos_type(0,0,0), rot, v2);
        ++ivt;
      }
      
      int ivbot = ivt;
      int i, j;
      value_type th;
      for (j=0; j<NDIVV; ++j) {
        const value_type ww = rad + dw*value_type(j);
        const value_type zz = dlen*value_type(j);
        for (th=value_type(0), i=0; i<NDIVR; ++i, th += dth) {
          const value_type costh = value_type(cos(th));
          const value_type sinth = value_type(sin(th));
          setNormal(ivt, pos_type(costh, sinth, value_type(0)), rot);
          setVertex(ivt, pos_type(ww * costh, ww * sinth, zz), rot, v2);
          ++ivt;
        }
      }

      if (m_bCap) {
        setNormal(ivt, pos_type(0,0,1), rot);
        setVertex(ivt, pos_type(0,0,len), rot, v2);
        ++ivt;
      }

      //
      // Build faces
      //

      // bottom disk
      if (m_bCap) {
        for (i=0; i<NDIVR; ++i) {
          const int ii = i%NDIVR;
          const int jj = (i+1)%NDIVR;
          m_trait.face(ifc, ivbot-1, ivbot + jj, ivbot + ii);
          ++ifc;
        }
      }
  
      // cylinder body
      for (j=0; j<NDIVV-1; ++j) {
        const int u = j*NDIVR;
        const int v = (j+1)*NDIVR;
        for (i=0; i<NDIVR; ++i) {
          const int ii = i%NDIVR;
          const int jj = (i+1)%NDIVR;
          m_trait.face(ifc,
                      ivbot + u + ii,
                      ivbot + u + jj,
                      ivbot + v + jj);
          ++ifc;
          m_trait.face(ifc,
                      ivbot + u + ii,
                      ivbot + v + jj,
                      ivbot + v + ii);
        }
      }
      
      // top disk
      if (m_bCap) {
        for (i=0; i<NDIVR; ++i) {
          const int ii = i%NDIVR;
          const int jj = (i+1)%NDIVR;
          
          m_trait.face(ifc,
                       ivbot + NDIVV*NDIVR,
                       ivbot + (NDIVV-1)*NDIVR + ii,
                       ivbot + (NDIVV-1)*NDIVR + jj);
        }
      }
    }

    void setVertex(int iv, const pos_type &v, const qlib::Matrix3T<value_type> &rot, const pos_type &tr)
    {
      m_trait.vertex(iv, pos_type( rot.mulvec(v.xyz()) ) + tr);
    }
    void setNormal(int iv, const pos_type &v, const qlib::Matrix3T<value_type> &rot)
    {
      m_trait.normal(iv, pos_type( rot.mulvec(v.xyz()) ));
    }

  };

}

#endif

