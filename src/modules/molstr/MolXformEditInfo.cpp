// -*-Mode: C++;-*-
//
// Structure-transforming edit information
//
// $Id: MolXformEditInfo.cpp,v 1.1 2010/11/17 04:14:32 rishitani Exp $

#include <common.h>

#include "MolXformEditInfo.hpp"

#include "MolCoord.hpp"
#include "AtomIterator.hpp"

using namespace molstr;

MolXformEditInfo::MolXformEditInfo()
{
}

MolXformEditInfo::~MolXformEditInfo()
{
  clear();
}

/** save atom positions before transformation */
void MolXformEditInfo::saveBeforePos(MolCoordPtr pmol)
{
  saveBeforePos(pmol, SelectionPtr());
}

void MolXformEditInfo::saveBeforePos(MolCoordPtr pmol, SelectionPtr hsel)
{
  m_nTgtUID = pmol->getUID();
  clear();
  
  AtomIterator iter(pmol, hsel);
  for (iter.first(); iter.hasMore(); iter.next()) {
    int id  = iter.getID();
    MolAtomPtr pAtom = iter.get();
    m_before.push_back(data_t::value_type(id, pAtom->getPos()));
  }
}

/** save atom positions after transformation */
void MolXformEditInfo::saveAfterPos(MolCoordPtr pmol)
{
  saveAfterPos(pmol, SelectionPtr());
}

void MolXformEditInfo::saveAfterPos(MolCoordPtr pmol, SelectionPtr hsel)
{
  MB_ASSERT(m_nTgtUID==pmol->getUID());
  
  AtomIterator iter(pmol, hsel);
  for (iter.first(); iter.hasMore(); iter.next()) {
    int id  = iter.getID();
    MolAtomPtr pAtom = iter.get();
    m_after.push_back(data_t::value_type(id, pAtom->getPos()));
  }
}

void MolXformEditInfo::clear()
{
  if (m_before.size()>0)
    m_before.erase(m_before.begin(), m_before.end());
  if (m_after.size()>0)
    m_after.erase(m_after.begin(), m_after.end());
}

bool MolXformEditInfo::moveImpl(data_t &data)
{
  MolCoord *pmol =
    qlib::ObjectManager::sGetObj<MolCoord>(m_nTgtUID);

  if (pmol==NULL)
    return false;

  // reset to the before/after pos
  data_t::const_iterator iter = data.begin();
  for (; iter!=data.end(); ++iter) {
    int aid = iter->first;
    const Vector4D &pos = iter->second;
    MolAtomPtr pAtom = pmol->getAtom(aid);
    if (pAtom.isnull()) {
      LOG_DPRINTLN("MolXfrmEdit> mol:%d, aid:%d not found (undo may be uncomplete!!)",
                   m_nTgtUID, aid);
      continue;
    }
    pAtom->setPos(pos);
  }

  pmol->fireAtomsMoved();
  return true;
}

/// perform undo
bool MolXformEditInfo::undo()
{
  // reset to the before pos
  return moveImpl(m_before);
}

/// perform redo
bool MolXformEditInfo::redo()
{
  // reset to the before pos
  return moveImpl(m_after);
}

bool MolXformEditInfo::isUndoable() const
{
  return true;
}

bool MolXformEditInfo::isRedoable() const
{
  return true;
}

