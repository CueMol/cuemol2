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
  typedef ColorTable::elem_t IntColor;

  int m_nVerts;
  int m_nFaces;

  float *m_pVerts;
  float *m_pNorms;
  IntColor *m_pCols;

  int *m_pFaces;

  /////

  Vector4D m_curNorm;
  IntColor m_curCol;

  /////

  ColorTable m_clut;
  
public:
  Mesh()
       : m_nVerts(0), m_nFaces(0), m_pVerts(NULL),
         m_pNorms(NULL), m_pCols(NULL), m_pFaces(NULL)
  {
  }
  
  void init(int nverts, int nfaces)
  {
    m_nVerts = nverts;
    m_nFaces = nfaces;
    m_pVerts = new float[nverts*3];
    m_pNorms = new float[nverts*3];
    m_pCols = new IntColor[nverts];
    m_pFaces = new int[nfaces*3];
  }

  virtual ~Mesh()
  {
    if (m_pVerts!=NULL) delete [] m_pVerts;
    if (m_pNorms!=NULL) delete [] m_pNorms;
    if (m_pCols!=NULL) delete [] m_pCols;
    if (m_pFaces!=NULL) delete [] m_pFaces;
  }

  ////////////////////////////////////////

  bool reduce(int nverts, int nfaces)
  {
    if (m_nVerts<nverts || m_nFaces<nfaces)
      return false;
    m_nVerts = nverts;
    m_nFaces = nfaces;
    return true;
  }

  void setVertex(int i, const Vector4D &v);
  Vector4D getVertex(int i) const {
    return Vector4D (m_pVerts[i*3+0],
                     m_pVerts[i*3+1],
                     m_pVerts[i*3+2]);
  }
  
  void normal(const Vector4D &n) {
    m_curNorm = n;
  }
  Vector4D getNormal(int i) const {
    return Vector4D (m_pNorms[i*3+0],
                     m_pNorms[i*3+1],
                     m_pNorms[i*3+2]);
  }

  void color(const ColorPtr &c);
  void color(const ColorPtr &c, const LString &mtr);

  void setFace(int fid, int vid1, int vid2, int vid3) {
    MB_ASSERT(m_pFaces!=NULL);
    MB_ASSERT(fid<m_nFaces);
    m_pFaces[fid*3+0] = vid1;
    m_pFaces[fid*3+1] = vid2;
    m_pFaces[fid*3+2] = vid3;
  }

  ////////////////////////////////////////

  int getVertSize() const {
    return m_nVerts;
  }

  int getFaceSize() const {
    return m_nFaces;
  }

  const float *getFloatVerts() const {
    return m_pVerts;
  }

  const float *getFloatNorms() const {
    return m_pNorms;
  }

  const int *getFaces() const {
    return m_pFaces;
  }

  //bool getRGBAFloatCol(float &r, float &g, float &b, float &a, int iv) const;
  bool getCol(ColorPtr &c, int iv) const;

  bool convRGBAByteCols(unsigned char *pcols, int nsize, int defalpha=255) const;

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


