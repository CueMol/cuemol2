//
// CueMol2 plugin class with Win32 implementation
//
// $Id: WinPlugin.hpp,v 1.6 2009/03/28 19:09:47 rishitani Exp $

#ifndef NP_WIN_PLUGIN_HPP_INCLUDED
#define NP_WIN_PLUGIN_HPP_INCLUDED

#include "Plugin.hpp"

namespace np {

  class WinPlugin : public Plugin
  {
  private:

    HWND m_hWnd;
    WNDPROC m_lpOldProc;
    HDC m_hDC;
    HGLRC m_hGL;

    sysdep::WglView *m_pCachedView;

  public:
    WinPlugin(NPP pNPInstance);

    virtual ~WinPlugin();

    virtual bool init(NPWindow* pNPWindow);

    virtual void fini();

    virtual bool bind(int nSceneID, int nViewID);

    /////////////////////////////

    LRESULT handleEvent(HWND hWnd, UINT msg, WPARAM wParam, LPARAM lParam);

    static LRESULT CALLBACK PluginWinProc(HWND hWnd, UINT msg, WPARAM wParam, LPARAM lParam);

  private:
    bool setupOpenGL();
    bool setupOpenGL2();
    void cleanupOpenGL();
    
    bool bindImpl();

  };

}

#endif // NP_WIN_PLUGIN_HPP_INCLUDED

