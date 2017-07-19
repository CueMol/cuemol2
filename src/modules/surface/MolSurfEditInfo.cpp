// -*-Mode: C++;-*-
//
// Molecular surface edit information
//
// $Id: MolSurfEditInfo.cpp,v 1.1 2011/04/09 12:17:09 rishitani Exp $

#include <common.h>

#include "MolSurfEditInfo.hpp"

#include "MolSurfObj.hpp"

using namespace surface;

MolSurfEditInfo::MolSurfEditInfo()
  : m_nVerts(0), m_pVerts(NULL), m_nFaces(0), m_pFaces(NULL)
{
}

MolSurfEditInfo::~MolSurfEditInfo()
{
  clear();
}

void MolSurfEditInfo::setup(MolSurfObj *psurf)
{
  int i;

  m_nTgtUID = psurf->getUID();
  clear();
  
  // copy original vertex and face data
  m_nVerts = psurf->getVertSize();
  m_pVerts = MB_NEW MSVert[m_nVerts];
  for (i=0; i<m_nVerts; ++i) {
    // copy non-xformed data
    m_pVerts[i] = psurf->getVertAt(i);
  }
  
  m_nFaces = psurf->getFaceSize();
  m_pFaces = MB_NEW MSFace[m_nFaces];
  for (i=0; i<m_nFaces; ++i)
    m_pFaces[i] = psurf->getFaceAt(i);
}

void MolSurfEditInfo::clear()
{
  m_nVerts = m_nFaces = 0;
  if (m_pVerts!=NULL)
    delete [] m_pVerts;
  m_pVerts = NULL;
  if (m_pFaces!=NULL)
    delete [] m_pFaces;
  m_pFaces = NULL;
}

MolSurfObj *MolSurfEditInfo::getTargetObj() const
{
  MolSurfObj *pobj =
    qlib::ObjectManager::sGetObj<MolSurfObj>(m_nTgtUID);
  
  return pobj;
}

/** perform undo */
bool MolSurfEditInfo::undo()
{
  MolSurfObj *pSurf = getTargetObj();
  if (pSurf==NULL)
    return false;

  std::swap(pSurf->m_nVerts, m_nVerts);
  std::swap(pSurf->m_pVerts, m_pVerts);

  std::swap(pSurf->m_nFaces, m_nFaces);
  std::swap(pSurf->m_pFaces, m_pFaces);

  // notify structural change
  /*
  MbObjChangedEvent ev;
  ev.setTarget(pSurf);
  pSurf->fireMbObjEvent(ev);
   */

  {
    qsys::ObjectEvent obe;
    obe.setType(qsys::ObjectEvent::OBE_CHANGED);
    obe.setTarget(pSurf->getUID());
    obe.setDescr("structure");
    pSurf->fireObjectEvent(obe);
  }

  return true;
}

/** perform redo */
bool MolSurfEditInfo::redo()
{
  MolSurfObj *pSurf = getTargetObj();
  if (pSurf==NULL)
    return false;

  std::swap(pSurf->m_nVerts, m_nVerts);
  std::swap(pSurf->m_pVerts, m_pVerts);

  std::swap(pSurf->m_nFaces, m_nFaces);
  std::swap(pSurf->m_pFaces, m_pFaces);
  
  // notify structural change
  /*
  MbObjChangedEvent ev;
  ev.setTarget(pSurf);
  pSurf->fireMbObjEvent(ev);
   */

  {
    qsys::ObjectEvent obe;
    obe.setType(qsys::ObjectEvent::OBE_CHANGED);
    obe.setTarget(pSurf->getUID());
    obe.setDescr("structure");
    pSurf->fireObjectEvent(obe);
  }

  return true;
}

bool MolSurfEditInfo::isUndoable() const
{
  return true;
}

bool MolSurfEditInfo::isRedoable() const
{
  return true;
}

