// -*-Mode: C++;-*-
//
//  Triangle mesh object
//  $Id: Mesh.hpp,v 1.4 2011/04/07 07:56:47 rishitani Exp $
//

#ifndef GFX_MESH_HPP_INCLUDED
#define GFX_MESH_HPP_INCLUDED

#include "AbstractColor.hpp"
#include "ColorTable.hpp"
#include <qlib/Vector4D.hpp>

namespace gfx {

  using qlib::Vector4D;

  class GFX_API Mesh
  {
  private:

    int m_nVerts;
    int m_nFaces;

    std::vector<float> m_verts;
    std::vector<float> m_norms;
    std::vector<ColorPtr> m_colptrs;
    std::vector<int> m_faces;

    /////

    Vector4D m_curNorm;

    ColorPtr m_pCurCol;

    /////

  public:
    Mesh()
         : m_nVerts(0), m_nFaces(0)
    {
    }

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
  
      m_colptrs[i] = m_pCurCol;
    }

    inline void setVertex(int i, float x, float y, float z, float nx, float ny, float nz)
    {
      m_verts[i*3+0] = x;
      m_verts[i*3+1] = y;
      m_verts[i*3+2] = z;
      
      m_norms[i*3+0] = nx;
      m_norms[i*3+1] = ny;
      m_norms[i*3+2] = nz;
  
      m_colptrs[i] = m_pCurCol;
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

    void color(const ColorPtr &c);
    //void color(const ColorPtr &c, const LString &mtr);

    void setFace(int fid, int vid1, int vid2, int vid3) {
      //MB_ASSERT(m_pFaces!=NULL);
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

    const float *getFloatVerts() const {
      return &m_verts[0];
    }

    const float *getFloatNorms() const {
      return &m_norms[0];
    }

    const int *getFaces() const {
      return &m_faces[0];
    }

    //bool getRGBAFloatCol(float &r, float &g, float &b, float &a, int iv) const;
    bool getCol(ColorPtr &c, int iv) const;

    bool convRGBAByteCols(quint8 *pcols, int nsize, int defalpha=255, qlib::uid_t nSceneID=qlib::invalid_uid) const;

    /*
private:
  int clutNewColor(unsigned int ccode);

  unsigned char convRho(double rho) const {
    double tr = qlib::trunc(rho, 0.0, 1.0);
    return (unsigned char) (tr*255.0+0.5);
  }*/
  };

}

#endif //


