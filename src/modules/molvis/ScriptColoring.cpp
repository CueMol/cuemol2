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
#include <qsys/SysConfig.hpp>
#include <modules/molstr/MolCoord.hpp>

using namespace molvis;
using namespace molstr;
using gfx::ColorPtr;
using qsys::RendererPtr;
using qsys::ScenePtr;

ScriptColoring::ScriptColoring()
{
  m_bOK = false;
  m_pInterp = NULL;
  resetAllProps();
}

ScriptColoring::~ScriptColoring()
{
}

bool ScriptColoring::start(MolCoordPtr pMol, Renderer *pRend)
{
  if (m_script.isEmpty()) {
    m_bOK = false;
    return false;
  }

  m_bOK = true;
  m_pMol = pMol;
  m_pRend = RendererPtr(pRend);

  ScenePtr pSc = m_pMol->getScene();
  m_pInterp = jsbr::createInterp(pSc.copy());

  // setup system default script path
  qsys::SysConfig *pconf = qsys::SysConfig::getInstance();
  LString scrdir = pconf->get("script_dir");
  if (!scrdir.isEmpty())
    m_pInterp->setScriptPath("system", pconf->convPathName(scrdir));

  m_pInterp->execFile("startup.js");

  LString scr;
  scr += "function main(atom, resid) {\n";
  scr += m_script;
  scr += "\n};\n";
  m_pInterp->eval(scr);

  // define the global variables
  m_pInterp->defineVar("obj", pMol.copy());
  if (pRend!=NULL) {
    m_pInterp->defineVar("rend", m_pRend.copy());
  }
  
  return true;
}

ColorPtr ScriptColoring::findAndFillCache(MolAtomPtr pAtom)
{
  if (!m_bOK)
    return ColorPtr();
    
  int aid = pAtom->getID();
  mapping_t::const_iterator iter = m_map.find(aid);
  if (iter!=m_map.end()) {
    return iter->second;
  }
  
  MolResiduePtr pRes = pAtom->getParentResidue();

  //qlib::LVarArgs args;

  qlib::LVarArgs args(2);
  args.at(0) = qlib::LVariant(pAtom.copy());
  args.at(1) = qlib::LVariant(pRes.copy());

  bool res = m_pInterp->invokeMethod("main", args);
  if (!res) {
    // ERROR: main is not defined!! --> stop script coloring
    m_bOK = false;
    return ColorPtr();
  }

  if (!args.retval().isObject()) {
    // ERROR: returned value is not object
    return ColorPtr();
  }

  LScriptable *pScrObj = args.retval().getBareObjectPtr();
  gfx::AbstractColor *pCol = dynamic_cast<gfx::AbstractColor *>(pScrObj);
  if (pCol==NULL) {
    // ERROR: returned value is not color
    return ColorPtr();
  }
  
  ColorPtr color = ColorPtr(pCol);
  m_map.insert(mapping_t::value_type(aid, color));
  return color;
}

bool ScriptColoring::getAtomColor(MolAtomPtr pAtom, ColorPtr &color)
{
  ColorPtr rval = findAndFillCache(pAtom);
  if (rval.isnull())
    return false;

  color = rval;
  return true;
}

void ScriptColoring::end()
{
  m_pMol = MolCoordPtr();
  m_pRend = RendererPtr();
  if (m_pInterp!=NULL)
    delete m_pInterp;
}

void ScriptColoring::writeTo2(qlib::LDom2Node *pNode) const
{
  // write properties
  super_t::writeTo2(pNode);

  qlib::LDom2Node *pChNode = pNode->appendChild();
  pChNode->setTagName("script");
  // pChNode->setValue(getScript());
  pChNode->appendContents(getScript());
  pChNode->setAttrFlag(false);
  pChNode->setReadOnly(false);
  pChNode->setDefaultFlag(false);
}

void ScriptColoring::readFrom2(qlib::LDom2Node *pNode)
{
  super_t::readFrom2(pNode);

  for (pNode->firstChild(); pNode->hasMoreChild(); pNode->nextChild()) {
    qlib::LDom2Node *pChNode = pNode->getCurChild();
    LString tag = pChNode->getTagName();
    if (tag.equals("script")) {
      LString value = pChNode->getValue();
      LString contents = pChNode->getContents();
      if (value.isEmpty() && !contents.isEmpty())
        value = contents;
      setScript(value);
    }
  }
}

