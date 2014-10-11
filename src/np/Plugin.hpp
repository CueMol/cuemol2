//
// CueMol2 plugin class
//
// $Id: Plugin.hpp,v 1.10 2009/08/13 08:46:06 rishitani Exp $

#ifndef __NP_PLUGIN_HPP_INCLUDED__
#define __NP_PLUGIN_HPP_INCLUDED__

#include <qsys/View.hpp>

namespace np {

  class Plugin
  {
    //private:
  protected:
    NPP m_pNPInstance;

    NPWindow *m_pWindow;
    NPStream *m_pNPStream;
    bool m_bInitialized;
    NPObject *m_pScriptableObject;

    qsys::ViewPtr m_rview;

  protected:
    qlib::uid_t m_nSceneID;
    qlib::uid_t m_nViewID;
    bool bindCommon(int nSceneID, int nViewID);

  public:
    Plugin(NPP pNPInstance);
    virtual ~Plugin();

    virtual bool init(NPWindow* pNPWindow);
    virtual void fini();
    virtual void setWindow(NPWindow* pNPWindow);
    virtual void windowResized(NPWindow* pNPWindow);

    /** Event handling for OS X */
    virtual int handleEvent(void*);

    /** bind to the view */
    virtual bool bind(int nSceneID, int nViewID) =0;

    virtual void unbind();

    /////////////////////////////

    qsys::ViewPtr getViewPtr() const {
      return m_rview;
    }

    void setViewPtr(qsys::ViewPtr aView) {
      m_rview = aView;
    }

    bool isInitialized() {
      return m_bInitialized;
    }
  
    NPObject *getScriptableObject();

  };
  
  // factory method for Plugin object creation
  Plugin *createPluginObj(NPP);
}

#endif // __NP_PLUGIN_HPP_INCLUDED__
