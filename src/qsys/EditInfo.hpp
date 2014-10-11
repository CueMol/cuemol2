// -*-Mode: C++;-*-
//
// Superclass of Undo/Redo information
//
// $Id: EditInfo.hpp,v 1.3 2010/11/17 04:14:32 rishitani Exp $

#ifndef QSYS_EDIT_INFO_HPP_INCLUDED
#define QSYS_EDIT_INFO_HPP_INCLUDED

#include "qsys.hpp"

namespace qsys {

using qlib::LString;

/**
  abstract Undo/Redoable edit information
 */
class QSYS_API EditInfo
{
public:
  virtual ~EditInfo() {}

  /** perform undo */
  virtual bool undo() =0;

  /** perform redo */
  virtual bool redo() =0;

  virtual bool isUndoable() const =0;
  virtual bool isRedoable() const =0;

};

}

#endif

