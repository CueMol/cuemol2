// -*-Mode: C++;-*-
//
//  molecular surface builder
//
// $Id: RSComponent.cpp,v 1.2 2011/02/11 06:54:22 rishitani Exp $

#include <common.h>
#include "surface.hpp"

#ifdef SURF_BUILDER_TEST

#include "MolSurfBuilder.hpp"
#include "RSComponent.hpp"

using namespace surface;

RSComponent::~RSComponent()
{
/*
  std::for_each(m_verteces.begin(), m_verteces.end(),
                qlib::delete_ptr<RSVertex *>());
*/
  
  std::for_each(m_edges.begin(), m_edges.end(),
                qlib::delete_ptr<RSEdge *>());

  std::for_each(m_faceset.begin(), m_faceset.end(),
                qlib::delete_ptr<RSFace *>());

  std::for_each(m_arcs.begin(), m_arcs.end(),
                qlib::delete_ptr<SESArc *>());
  
  std::for_each(m_verts.begin(), m_verts.end(),
                qlib::delete_ptr<RSVert *>());
  
}

RSFace *RSComponent::addFace(int idx_i, int idx_j, int idx_k)
{
  if (findFace(idx_i, idx_j, idx_k)!=NULL) {
    //MB_DPRINTLN("Cannot add: (%d,%d,%d)", idx_i, idx_j, idx_k);
    return NULL;
  }
  //MB_DPRINTLN("Add: (%d,%d,%d)", idx_i, idx_j, idx_k);
  
  RSFace *pF = MB_NEW RSFace;
  pF->idx[0] = idx_i;
  pF->idx[1] = idx_j;
  pF->idx[2] = idx_k;
  //m_faces.push_back(pF);
  m_faceset.insert(pF);

  return pF;
}

RSFace *RSComponent::findFace(int iv1, int iv2, int iv3)
{
  RSFace dumf(iv1, iv2, iv3);
  RSFaceSet::const_iterator iter = m_faceset.find(&dumf);
  if (iter==m_faceset.end())
    return NULL;
  return *iter;
}

RSEdge *RSComponent::addEdge(int idx_i, int idx_j)
{
  RSEdge *pE = MB_NEW RSEdge;
  pE->idx[0] = idx_i;
  pE->idx[1] = idx_j;
  m_edges.push_back(pE);
  return pE;
}

/////////////////////////////////////////////////////////////////

RSVert *RSComponent::addVert(int idx)
{
  RSVert *pV = MB_NEW RSVert(idx);
  m_verts.push_back(pV);
  return pV;
}

#endif // SURF_BUILDER_TEST

