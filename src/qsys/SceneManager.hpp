//
// Scene manager singleton class
//
// $Id: SceneManager.hpp,v 1.18 2010/10/12 14:20:14 rishitani Exp $
//

#ifndef QSYS_SCENE_MANAGER_HPP_INCLUDE_
#define QSYS_SCENE_MANAGER_HPP_INCLUDE_

#include "qsys.hpp"

#include <qlib/LScrObjects.hpp>
#include <qlib/LScrSmartPtr.hpp>
#include <qlib/SingletonBase.hpp>
#include <qlib/mcutils.hpp>
#include <qlib/EventManager.hpp>

#include "Scene.hpp"
#include "Object.hpp"

namespace qsys {

  class QSYS_API SceneManager
       : public qlib::LSingletonScrObject,
	 public qlib::SingletonBase<SceneManager>,
         public qlib::IdleTask
  {
    MC_SCRIPTABLE;

  public:
    typedef std::map<qlib::uid_t, ScenePtr> data_t;

  private:
    /// Scenes in this instance
    data_t m_data;

  public:
    SceneManager();

    virtual ~SceneManager();

  public:
  
    /// Create new empty scene
    ScenePtr createScene();

    /// Get scene object by UID
    ScenePtr getScene(qlib::uid_t uid) const;

    /// Get scene by name (only returns first maching scene)
    ScenePtr getSceneByName(const LString &name) const;

    /// Destroy scene object by UID
    bool destroyScene(qlib::uid_t uid);

    // /// Deserialize this scene from the localfile with intype format
    // ScenePtr loadSceneFrom(const LString &localfile, const LString &type);

    void dump() const;

    /// get all Scene's UID list in comma-separated string
    LString getSceneUIDList() const;

    /// Destroy all scenes.
    void destroyAllScenes();

    /// Check and update all scenes
    void checkAndUpdateScenes() const;

    // Active scene (in this process)
  private:
    /// Active scene's ID
    /// Only one scene becomes active in one process
    qlib::uid_t m_nActiveSceneID;

  public:
    void setActiveSceneID(qlib::uid_t uid);

    qlib::uid_t getActiveSceneID() const {
      return m_nActiveSceneID;
    }
    

    //////////

    qlib::LScrSp<qlib::LScrObjBase> getUIDObj(qlib::uid_t uid) const;

    ViewPtr getView(qlib::uid_t uid) const;
    ObjectPtr getObject(qlib::uid_t uid) const;
    RendererPtr getRenderer(qlib::uid_t uid) const;

    static ScenePtr getSceneS(qlib::uid_t uid);
    static ObjectPtr getObjectS(qlib::uid_t uid);
    static ViewPtr getViewS(qlib::uid_t uid);
    static RendererPtr getRendererS(qlib::uid_t uid);

    //////////

    static bool initClass(qlib::LClass *pcls);
    static void finiClass(qlib::LClass *pcls);

  private:
    bool registScene(ScenePtr pScene) {
      qlib::uid_t uid = pScene->getUID();
      return m_data.insert(data_t::value_type(uid, pScene)).second;
    }

    //////////
  private:

    /// CueMol version information
    struct VersionInfo
    {
      void set(int n1, int n2, int n3, int n4, const char *szBuildID) {
        major_version = n1;
        minor_version = n2;
        revision = n3;
        build_no = n4;
        build_id = szBuildID;
      }
      
      int major_version;
      int minor_version;
      int revision;
      int build_no;
      LString build_id;
    };

    VersionInfo m_verInfo;
    LString m_strVerInfo;

  public:

    /// Get the version name of this release
    const LString &getVersion() const { return m_strVerInfo; }

    int getMajorVer() const { return m_verInfo.major_version; }
    int getMinorVer() const { return m_verInfo.minor_version; }
    int getRevision() const { return m_verInfo.revision; }
    int getBuildNo() const { return m_verInfo.build_no; }

    /// Get ID of this release
    const LString &getBuildID() const { return m_verInfo.build_id; }
    
    LString getVerArchName() const;

  private:
    ///////////////////////
    // performance measure

    //static const int NAVERSIZE = 100;
    //std::vector<qint64> m_busytimes;
    //int m_nBusyTimeIndex;
    //bool m_bPerfMeas;
    //void *m_pTimer;

  public:
    void enablePerfMeas(int nID);
    void disablePerfMeas();
    //void setBusyTime(quint64 nanosec);

    /// Idle task support:
    /// Check scene update periodically
    virtual void doIdleTask();
 
  };

}

SINGLETON_BASE_DECL(qsys::SceneManager);

#endif
