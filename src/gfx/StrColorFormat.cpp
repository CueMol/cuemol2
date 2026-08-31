// -*-Mode: C++;-*-
//
//  Color name parsing
//
// $Id: StrColorFormat.cpp,v 1.6 2011/04/10 10:46:09 rishitani Exp $

#include <common.h>

#include "SolidColor.hpp"
#include "NamedColor.hpp"
#include "ColCompiler.hpp"

#include <qlib/Vector4D.hpp>
#include <qlib/LExceptions.hpp>
#include <qlib/LDOM2Tree.hpp>

using namespace gfx;
using qlib::Vector4D;

AbstractColor *AbstractColor::fromStringS(const qlib::LString &aSrc)
{
  return ColCompiler::compileS(aSrc);
}

AbstractColor *AbstractColor::fromNode(qlib::LDom2Node *pNode)
{
  LString value = pNode->getValue();
  AbstractColor *pCol = AbstractColor::fromStringS(value);

  // the color string did not compile: nothing to apply the modifiers to
  if (pCol==NULL) {
    LOG_DPRINTLN("AbstractColor.fromNode> invalid color \"%s\"", value.c_str());
    return NULL;
  }

  if (pNode->getChildCount()==0) {
    // pChNode has no child nodes ==> no modifications
    return pCol;
  }

  // apply modifications
  pCol->readFrom2(pNode);

  return pCol;
}

