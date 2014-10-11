// -*-Mode: C++;-*-
//
// Undo/Redo information (using QScript)
//
// $Id: EditInfo.cpp,v 1.1 2009/08/02 07:41:55 rishitani Exp $

#include <common.hpp>

#include "EditInfo.hpp"

#include <qlib/LChar.hpp>
#include <mbsys/MbSysDB.hpp>
#include <interp/IrCompiler.hpp>
#include <interp/IrInterp.hpp>

using qlib::LChar;
using qs::IrCompiler;
using qs::IrInterp;

EditInfo::~EditInfo() {}

ScriptEditInfo::ScriptEditInfo()
     : m_pUData(NULL), m_pRData(NULL), m_fNopUndo(false), m_fNopRedo(false)
{
}

ScriptEditInfo::~ScriptEditInfo()
{
  if (m_pUData!=NULL)
    m_pUData->release();
  m_pUData = NULL;

  if (m_pRData!=NULL)
    m_pRData->release();
  m_pRData = NULL;
}

void ScriptEditInfo::clear()
{
  if (m_pUData!=NULL)
    m_pUData->release();
  m_pUData = NULL;

  if (m_pRData!=NULL)
    m_pRData->release();
  m_pRData = NULL;

  m_fNopUndo = false;
  m_fNopRedo = false;
}

bool ScriptEditInfo::setUndoScript(const char *uscript)
{
  if (m_pUData!=NULL)
    m_pUData->release();
  m_pUData = NULL;

  if (LChar::length(uscript)<=0) {
    m_fNopUndo = true;
    return true;
  }

  IrCompiler cmp;
  IrHandle *parry;

  // compile the undo-script into the layer-1 array
  parry = cmp.compileMem(uscript, LChar::length(uscript));
  if (parry==NULL) {
    LOG_DPRINTLN("ScriptEdit: compilation error");
    LOG_DPRINTLN(uscript);
    return false;
  }
  m_pUData = parry;
  m_pUData->addRef();
  m_uscript = uscript;
  return true;
}

bool ScriptEditInfo::setRedoScript(const char *rscript)
{
  if (m_pRData!=NULL)
    m_pRData->release();
  m_pRData = NULL;

  if (LChar::length(rscript)<=0) {
    m_fNopRedo = true;
    return true;
  }

  IrCompiler cmp;
  IrHandle *parry;

  // compile the redo-script into the layer-1 array
  parry = cmp.compileMem(rscript, LChar::length(rscript));
  if (parry==NULL) {
    LOG_DPRINTLN("ScriptEdit: compilation error");
    LOG_DPRINTLN(rscript);
    return false;
  }
  m_pRData = parry;
  m_pRData->addRef();
  m_rscript = rscript;
  return true;
}

/** perform undo */
bool ScriptEditInfo::undo()
{
  if (m_pUData==NULL) {
    if (m_fNopUndo)
      return true;
    return false;
  }

  // get the interpreter instance
  MbSysDB *pDB = MbSysDB::getInstance();
  IrInterp *pin = pDB->getInterp();

  // execute the undo script
  if (!pin->execute(m_pUData)) {
    LOG_DPRINTLN("*** ScritpEdit:interpretor error ***");
    return false;
  }

  return true;
}

/** perform redo */
bool ScriptEditInfo::redo()
{
  if (m_pRData==NULL){
    if (m_fNopRedo)
      return true;
    return false;
  }

  // get the interpreter instance
  MbSysDB *pDB = MbSysDB::getInstance();
  IrInterp *pin = pDB->getInterp();

  // execute the redo script
  if (!pin->execute(m_pRData)) {
    LOG_DPRINTLN("*** ScritpEdit:interpretor error ***");
    return false;
  }

  return true;
}

bool ScriptEditInfo::isUndoable() const
{
  if (m_pUData==NULL) {
    if (m_fNopUndo)
      return true;
    else
      return false;
  }
  return true;
}

bool ScriptEditInfo::isRedoable() const
{
  if (m_pRData==NULL) {
    if (m_fNopRedo)
      return true;
    else
      return false;
  }
  return true;
}

/** get description of this edit */
LString ScriptEditInfo::getDesc() const
{
  return m_desc;
}
