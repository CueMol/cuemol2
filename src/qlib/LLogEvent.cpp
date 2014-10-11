// -*-Mode: C++;-*-
//
//  Log event class
//
#include <common.h>

#include "LLogEvent.hpp"

using namespace qlib;

LLogEvent::~LLogEvent()
{
}

LCloneableObject *LLogEvent::clone() const
{
  return MB_NEW LLogEvent(*this);
}

LString LLogEvent::getJSON() const
{
  LString json = "{ ";
  json += "\"newline\": ";
  json += isNL()?"true":"false";
  json += ", \"content\": \"";
  json += getMessage().escapeQuots();
  json += "\" }";
  return json;
}

