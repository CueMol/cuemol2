// -*-Mode: C++;-*-
//
//  Metaseq Display context implementation class
//

#ifndef MQO_DISPLAY_CONTEXT_HPP_INCLUDED__
#define MQO_DISPLAY_CONTEXT_HPP_INCLUDED__

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

class MqoDisplayContext : public FileDisplayContext
{
protected:

  /// output mqo file
  qlib::OutStream *m_pMqoOut;

  qlib::MapPtrTable<RendIntData> m_data;

  /// Mqo material table (name => mat index)
  qlib::MapTable<int> m_mattab;

  /// Mqo material table (name => color vector)
  qlib::MapTable<Vector4D> m_coltab;

  /// Mqo material table (name => style's material name)
  qlib::MapTable<LString> m_styMatTab;

  int m_nMatInd;

  /// Gradient division number
  int m_nGradDiv;
  
public:
  MqoDisplayContext();
  virtual ~MqoDisplayContext();

  ///////////////////////////////

  void startRender();
  void endRender();

  virtual void startSection(const LString &name);
  virtual void endSection();

  ////////////////////////////////////////////////////////////
  // Metaseq implementation

  void init(qlib::OutStream *pMqoOut);

  // Mqo object/material access methods
  int getMqoMatNames(std::deque<LString> &names) const;
  bool getMqoMatColor(const LString name, Vector4D &vcol) const;

  int getMqoObjNames(std::deque<LString> &names) const;
  RendIntData *getIntData(const LString &name) const {
    return m_data.get(name);
  }

  LString getMqoStyleMat(const LString name) const {
    return m_styMatTab.get(name);
  }

  void setGradSteps(int n) { m_nGradDiv = n; }

private:
  void writeHeader();
  void writeTailer();

  void writeMaterials();
  void writeObject(RendIntData *pDat);

  int getMatIndex(RendIntData *pDat, const RendIntData::ColIndex &col);

  void writeColor(int index, RendIntData *pdat, const RendIntData::ColIndex &ic);

  //////////

  /// Make internal mesh buffer (m_verts/m_faces)
  void buildMeshes(RendIntData *pDat);

  /// Write internal mesh buffer (m_verts/m_faces) to the stream
  void writeMeshes();

  /// Internal mesh buffer (verteces)
  std::deque<Vector4D> m_verts;

  /// Internal mesh buffer (faces)
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

