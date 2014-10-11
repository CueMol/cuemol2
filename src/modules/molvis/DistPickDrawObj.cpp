// -*-Mode: C++;-*-
//
//  
//
// $Id: DistPickDrawObj.cpp,v 1.3 2010/12/03 17:47:08 rishitani Exp $

#include <common.h>
#include "DistPickDrawObj.hpp"

#include <modules/molstr/MolAtom.hpp>
#include <modules/molstr/AtomIterator.hpp>
#include <gfx/DisplayContext.hpp>
#include <qsys/SceneManager.hpp>

using namespace molvis;

DistPickDrawObj::DistPickDrawObj()
{
  m_color = gfx::SolidColor::createRGB(1.0, 1.0, 1.0);
}

DistPickDrawObj::~DistPickDrawObj()
{
}

void DistPickDrawObj::display(DisplayContext *pdc)
{
  pdc->color(m_color);
  pdc->setLineWidth(4.0);
  pdc->startLines();

  data_t::const_iterator iter = m_data.begin();
  data_t::const_iterator eiter = m_data.end();
  for (; iter!=eiter; ++iter) {
    const Vector4D &pos = *iter;
    pdc->drawAster(pos, 0.25f);
  }

  pdc->end();
}

void DistPickDrawObj::display2D(DisplayContext *pdc)
{
}

 void DistPickDrawObj::setEnabled(bool f)
{
  super_t::setEnabled(f);
  if (!f)
    m_data.clear();
}

void DistPickDrawObj::append(qlib::uid_t mol_id, int naid)
{
  MolCoordPtr pMol = qsys::SceneManager::getObjectS(mol_id);
  if (pMol.isnull())
    return;
  molstr::MolAtomPtr pAtom = pMol->getAtom(naid);
  m_data.push_back(pAtom->getPos());
}

