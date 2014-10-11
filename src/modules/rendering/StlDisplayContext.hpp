// -*-Mode: C++;-*-
//
//  STL (Stereolithography) Display context implementation class
//

#ifndef STL_DISPLAY_CONTEXT_HPP_INCLUDED__
#define STL_DISPLAY_CONTEXT_HPP_INCLUDED__

#include "render.hpp"

#include "FileDisplayContext.hpp"
#include "RendIntData.hpp"
#include <qlib/LString.hpp>
#include <qlib/MapTable.hpp>

namespace qlib {
  class OutStream;
}

namespace render {

class RendIntData;

class StlDisplayContext : public FileDisplayContext
{
protected:

  /// output mqo file
  qlib::OutStream *m_pStlOut;

  qlib::MapPtrTable<RendIntData> m_data;

public:
  StlDisplayContext();
  virtual ~StlDisplayContext();

  ///////////////////////////////

  void startRender();
  void endRender();

  virtual void startSection(const LString &name);
  virtual void endSection();

  ////////////////////////////////////////////////////////////
  // Metaseq implementation

  void init(qlib::OutStream *pStlOut);

private:
  void writeHeader();
  void writeTailer();

  void writeMaterials();
  void writeObject(RendIntData *pDat);

  int getMatIndex(RendIntData *pDat, const RendIntData::ColIndex &col);
  void writeMeshes(RendIntData *pDat);
  void writeCylSph(RendIntData *pDat);
  //void writeSphere(RendIntData *pDat, RendIntData::Sph *p);
  void writeCyl(RendIntData *pDat, RendIntData::Cyl *p);

  void writeColor(int index, RendIntData *pdat, const RendIntData::ColIndex &ic);

  void convLines(RendIntData *pDat);

  void writeMesh2();
  std::deque<Vector4D> m_verts;
  std::deque<int> m_faces;

  int putVert(const Vector4D &v) {
    int ret = m_verts.size();
    m_verts.push_back(v);
    return ret;
  }

  void putFace(int i, int j, int k, int c=0) {
    m_faces.push_back(i);
    m_faces.push_back(j);
    m_faces.push_back(k);
    m_faces.push_back(c);
  }

};

}

#endif

