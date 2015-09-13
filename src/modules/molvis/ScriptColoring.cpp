// -*-Mode: C++;-*-
//
//  Script coloring class implementation
//
//  $Id: ScriptColoring.cpp,v 1.12 2011/01/23 07:25:32 rishitani Exp $

#include <common.h>
#include "molvis.hpp"
#include "ScriptColoring.hpp"

#include <qlib/LVarArgs.hpp>
#include <jsbr/jsbr.hpp>
#include <jsbr/Interp.hpp>
#include <modules/molstr/MolCoord.hpp>

using namespace molvis;
using namespace molstr;
using gfx::ColorPtr;
using qsys::RendererPtr;
using qsys::ScenePtr;

ScriptColoring::ScriptColoring()
{
  resetAllProps();
}

ScriptColoring::~ScriptColoring()
{
}

bool ScriptColoring::start(MolCoordPtr pMol, Renderer *pRend)
{
  m_pMol = pMol;
  m_pRend = RendererPtr(pRend);

  ScenePtr pSc = m_pMol->getScene();
  m_pInterp = jsbr::createInterp(pSc.copy());

  return true;
}

bool ScriptColoring::getAtomColor(MolAtomPtr pAtom, ColorPtr &color)
{
  qlib::LVarArgs args;
  bool res = m_pInterp->invokeMethod("main", args);
  if (!res) {
    return false;
  }
  return true;
}

bool ScriptColoring::getResidColor(MolResiduePtr pResid, ColorPtr &rColor)
{
  return false;
}

void ScriptColoring::end()
{
  m_pMol = MolCoordPtr();
  m_pRend = RendererPtr();
  delete m_pInterp;
}

/*
qsys::ScenePtr ScriptColoring::getScene() const
{
  qsys::ScenePtr pScene;

  qlib::uid_t rootuid = getRootUID();
  if (rootuid==qlib::invalid_uid)
    return pScene;

  {
    // try renderer
    qsys::Renderer *pTgtRoot =
      qlib::ObjectManager::sGetObj<qsys::Renderer>(rootuid);
    if (pTgtRoot!=NULL)
      return pTgtRoot->getScene();
  }
  
  {
    // try object
    qsys::Object *pTgtRoot =
      qlib::ObjectManager::sGetObj<qsys::Object>(rootuid);
    if (pTgtRoot!=NULL)
      return pTgtRoot->getScene();
  }

  return pScene;
}
*/

