//
// Light-weight viewer services (class method implementations)
//

#ifndef LWVIEWER_MANAGER_HPP_INCLUDE_
#define LWVIEWER_MANAGER_HPP_INCLUDE_

#include "lwview.hpp"

#include <qlib/LScrObjects.hpp>
#include <qlib/SingletonBase.hpp>
#include <qlib/mcutils.hpp>
#include <qsys/qsys.hpp>

namespace lwview {

  using qlib::LString;

  //// Light-weight viewer services (class method implementations)
  class LWVIEW_API LWViewerManager : public qlib::LSingletonScrObject,
  public qlib::SingletonBase<LWViewerManager>
  {
    MC_SCRIPTABLE;

  private:
    /// copy animation settings
    void copyAnim(qsys::ScenePtr pScene, qsys::ScenePtr pNewScene);

  public:
    LWViewerManager();

    virtual ~LWViewerManager();

    //////////
    // services

    //void test(qsys::ScenePtr pScene);
    //void saveLWSceneAs(qsys::ScenePtr pScene, qsys::ViewPtr pView, const LString &path);
    void convToLWScene(qsys::ScenePtr pScene, qsys::ScenePtr pNewScene);

    //////////
    // Initializer/finalizer (called from qlib-appfw)

    static bool initClass(qlib::LClass *pcls)
    {
      return qlib::SingletonBase<LWViewerManager>::init();
    }
    
    static void finiClass(qlib::LClass *pcls)
    {
      qlib::SingletonBase<LWViewerManager>::fini();
    }

  };

}

#endif

