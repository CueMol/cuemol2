//
// CueMol2 application loader/unloader class
//
// $Id: PluginModule.cpp,v 1.2 2008/11/30 12:43:06 rishitani Exp $

#include <common.h>
#include "npcommon.h"
#include "PluginModule.hpp"
#include <qlib/qlib.hpp>

using namespace np;

PluginModule *PluginModule::s_pInstance;

PluginModule::PluginModule()
{
}

PluginModule::~PluginModule()
{
}

//static 
bool PluginModule::init()
{
  qlib::init();

  s_pInstance = new PluginModule;

  MB_DPRINTLN("CueMol2 plugin: initialized");
  return true;
}

// static
void PluginModule::fini()
{
  MB_DPRINTLN("CueMol2 plugin: finalizing...");
  MB_ASSERT(s_pInstance!=NULL);
  delete s_pInstance;

  qlib::fini();

}

