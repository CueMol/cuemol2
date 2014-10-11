// -*-Mode: C++;-*-
//
// Camera-related editinfo classes
//

#ifndef QSYS_CAMERA_EDIT_INFO_HPP_INCLUDED
#define QSYS_CAMERA_EDIT_INFO_HPP_INCLUDED

#include "qsys.hpp"

#include "EditInfo.hpp"

namespace qsys {

  ///
  /// Camera creation edit info
  ///
  class CameraCreateEditInfo : public EditInfo
  {
  private:
    qlib::uid_t m_nSceneID;
    CameraPtr m_pTgtObj;

    bool m_bCreate;

  public:

    CameraCreateEditInfo()
         : m_nSceneID(qlib::invalid_uid), m_bCreate(false)
    {
    }
    
    virtual ~CameraCreateEditInfo()
    {
    }

    void setupCreate(qlib::uid_t scid, const CameraPtr &pcam)
    {
      m_nSceneID = scid;
      m_pTgtObj = pcam;
      m_bCreate = true;
    }

    void setupDestroy(qlib::uid_t scid, const CameraPtr &pcam)
    {
      m_nSceneID = scid;
      m_pTgtObj = pcam;
      m_bCreate = false;
    }

    /// perform undo 
    virtual bool undo()
    {
      Scene *pScene;
      pScene = qlib::ObjectManager::sGetObj<Scene>(m_nSceneID);
      if (pScene==NULL) return false;

      LString name = m_pTgtObj->m_name;
      bool res;
      if (m_bCreate) {
        // Undo of create camera
        res = pScene->destroyCamera(name);
        if (!res) {
          LOG_DPRINTLN("Undo of create camera \"%s\" failed", name.c_str());
          return false;
        }
      }
      else {
        // Undo of destroy camera
        if (pScene->hasCamera(name)) {
          LOG_DPRINTLN("Undo of destroy camera \"%s\" failed", name.c_str());
          return false;
        }
        pScene->setCamera(name, m_pTgtObj);
      }

      return true;
    }

    /// perform redo
    virtual bool redo()
    {
      Scene *pScene;
      pScene = qlib::ObjectManager::sGetObj<Scene>(m_nSceneID);
      if (pScene==NULL) return false;

      LString name = m_pTgtObj->m_name;
      bool res;
      if (m_bCreate) {
        // Redo of create camera
        if (pScene->hasCamera(name)) {
          LOG_DPRINTLN("Redo of create camera \"%s\" failed", name.c_str());
          return false;
        }
        pScene->setCamera(name, m_pTgtObj);
      }
      else {
        // Redo of destroy camera
        res = pScene->destroyCamera(name);
        if (!res) {
          LOG_DPRINTLN("Undo of create camera (destroy camera) \"%s\" failed", name.c_str());
          return false;
        }
      }

      return true;
    }

    virtual bool isUndoable() const
    {
      Scene *pScene;
      pScene = qlib::ObjectManager::sGetObj<Scene>(m_nSceneID);
      if (pScene==NULL) return false;
      return true;
    }

    virtual bool isRedoable() const
    {
      return isUndoable();
    }

  };

  /////////////////////////////////////////////////////

  ///
  /// Camera prop edit info
  ///
  class CameraPropEditInfo : public EditInfo
  {
  private:
    /// Target scene ID
    qlib::uid_t m_nSceneID;

    /// Target camera name
    LString m_camname;

    // /// Target property name
    // LString m_propname;
    
    /// new value (after)
    Camera m_newvalue;

    /// old value (before)
    Camera m_oldvalue;

  public:

    CameraPropEditInfo()
         : m_nSceneID(qlib::invalid_uid)
    {
    }
    
    virtual ~CameraPropEditInfo()
    {
    }

    void setup(qlib::uid_t scid, const LString &name,
               const CameraPtr &pbefore, const CameraPtr &pafter)
    {
      m_nSceneID = scid;
      m_camname = name;
      m_newvalue = *(pafter.get());
      m_oldvalue = *(pbefore.get());
    }

    /// perform undo 
    virtual bool undo()
    {
      Scene *pScene;
      pScene = qlib::ObjectManager::sGetObj<Scene>(m_nSceneID);

      if (pScene==NULL)
        return false;

      if (!pScene->hasCamera(m_camname)) {
        LOG_DPRINTLN("Undo of set prop camera \"%s\" failed", m_camname.c_str());
        return false;
      }
      
      // Undo: set "before" camera
      CameraPtr pCam(MB_NEW Camera(m_oldvalue));
      pScene->setCamera(m_camname, pCam);

      return true;
    }

    /// perform redo
    virtual bool redo()
    {
      Scene *pScene;
      pScene = qlib::ObjectManager::sGetObj<Scene>(m_nSceneID);

      if (pScene==NULL)
        return false;

      if (!pScene->hasCamera(m_camname)) {
        LOG_DPRINTLN("Redo of set prop camera \"%s\" failed", m_camname.c_str());
        return false;
      }
      
      // Redo: set "after" camera
      CameraPtr pCam(MB_NEW Camera(m_newvalue));
      pScene->setCamera(m_camname, pCam);

      return true;
    }

    virtual bool isUndoable() const
    {
      Scene *pScene;
      pScene = qlib::ObjectManager::sGetObj<Scene>(m_nSceneID);
      if (pScene==NULL) return false;

      if (!pScene->hasCamera(m_camname))
        return false;

      return true;
    }

    virtual bool isRedoable() const
    {
      return isUndoable();
    }

  };

}

#endif

