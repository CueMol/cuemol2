// -*-Mode: C++;-*-
//
// Scene application data: per-application objects stored in the scene file
//

#ifndef QSYS_SCENE_APP_DATA_HPP_INCLUDED
#define QSYS_SCENE_APP_DATA_HPP_INCLUDED

#include "qsys.hpp"

#include <qlib/LScrObjects.hpp>
#include <qlib/LScrSmartPtr.hpp>
#include <qlib/LUIDObject.hpp>
#include <qlib/LPropEvent.hpp>

namespace qsys {

  using qlib::LString;

  /// Base class of the objects kept in Scene's app-data store.
  ///
  /// Each entry is serialized as an <appdata id="..." type="..."> child of
  /// <scene>; the persistent properties declared in the subclass' .qif are the
  /// schema of the entry, so type checking and version tolerance come from the
  /// standard property machinery (unknown property: ignored, invalid value:
  /// skipped). Property names "id" and "type" are reserved for the element
  /// attributes and must not be declared by a subclass.
  ///
  /// The object is a UID object whose property changes are recorded in the
  /// owning scene's undo manager and reported as SCE_SCENE_APPDATA_CHG scene
  /// events, so an edit through the scripting interface behaves like an edit
  /// of any other scene content. Subclasses only declare properties.
  class QSYS_API SceneAppData :
    public qlib::LNoCopyScrObject,
    public qlib::LUIDObject,
    public qlib::LPropEventListener
  {
  public:
    typedef qlib::LNoCopyScrObject super_t;

  private:
    /// unique ID of this object
    qlib::uid_t m_uid;

    /// UID of the owning scene (invalid_uid until attached)
    qlib::uid_t m_nSceneID;

    /// app-data id (the "id" attribute of the element, e.g. "render")
    LString m_id;

  public:
    SceneAppData();
    ~SceneAppData() override;

    qlib::uid_t getUID() const { return m_uid; }

    void setSceneID(qlib::uid_t id) { m_nSceneID = id; }
    qlib::uid_t getSceneID() const { return m_nSceneID; }

    void setAppDataID(const LString &id) { m_id = id; }
    const LString &getAppDataID() const { return m_id; }

    /// owning scene (null when the scene is gone or not attached)
    ScenePtr getScene() const;

    /// Root UID for the undo/redo (PropEditInfo) target resolution
    qlib::uid_t getRootUID() const override;

    /// Property changed: record undo info and fire the scene event
    void propChanged(qlib::LPropEvent &ev) override;
  };

  typedef qlib::LScrSp<SceneAppData> SceneAppDataPtr;

}

#endif
