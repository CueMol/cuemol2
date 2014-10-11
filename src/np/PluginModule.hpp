//
// CueMol2 application loader/unloader class
//
// $Id: PluginModule.hpp,v 1.2 2008/11/30 12:43:06 rishitani Exp $

#ifndef __NP_PLUGIN_MODULE_HPP_INCLUDED__
#define __NP_PLUGIN_MODULE_HPP_INCLUDED__

namespace np {

  class PluginModule
  {
  private:
    static PluginModule *s_pInstance;

  public:
    PluginModule();
    virtual ~PluginModule();

    /////////////////////////////////////////////

    /** Load/initialize the CueMol2 application */
    static bool init();

    /** Unoad/finalize the CueMol2 application */
    static void fini();

    static PluginModule *getInstance() {
      return s_pInstance;
    }
  };
  
}

#endif // __NP_PLUGIN_HPP_INCLUDED__
