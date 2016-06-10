// -*-Mode: C++;-*-
//
//  Abstract scene exporter class
//

#ifndef QSYS_SCENE_EXPORTER_HPP_INCLUDED
#define QSYS_SCENE_EXPORTER_HPP_INCLUDED

#include "qsys.hpp"

#include "Scene.hpp"
#include "InOutHandler.hpp"

namespace qsys {

  using qlib::LString;
  //using qlib::FileOutStream;
  //using qlib::FileInStream;
  //using qlib::StreamBundle;

  class QSYS_API SceneExporter : public InOutHandler
  {
    MC_SCRIPTABLE;

    typedef InOutHandler super_t;

  private:

    ScenePtr m_pClient;

    CameraPtr m_pCamera;

    LString m_cameraName;

    /// hint of image size (w/h) rendered by this exporter
    int m_nWidth, m_nHeight;
    
  public:
    SceneExporter() : m_nWidth(0), m_nHeight(0) {}

    virtual ~SceneExporter();

    /// Get category ID (obj reader/writer, scene exporter, etc)
    virtual int getCatID() const;

    virtual void write() =0;

    ///////////////////////////////////////////////////////

    /// attach to and lock the target object
    virtual void attach(ScenePtr pScene);

    /// detach from the target object
    virtual ScenePtr detach();

    ///////////////////////////////////////////////////////
    // properties

    /// set camera object (object setting overrides cameraName setting)
    void setCamera(CameraPtr pCam){
      m_pCamera = pCam;
    }
    
    /// get camera object (object setting overrides cameraName setting)
    CameraPtr getCamera() const;

    void setCameraName(const LString &nm) { m_cameraName = nm; }
    LString getCameraName() const { return m_cameraName; }

    void setWidth(int val) { m_nWidth = val; }
    int getWidth() const { return m_nWidth; }
    void setHeight(int val) { m_nHeight = val; }
    int getHeight() const { return m_nHeight; }
    
    ///////////////////////////////////////////////////////
    // Utility routines

    /// Get the client scene ptr
    ScenePtr getClient() const { return m_pClient; }

    /// Convert abs subpath to relative (to mainpath)
    LString makeRelSubPath(const LString &sub_name);

  };

}

#endif // ABSTRACT_SCENE_WRITER_HPP_INCLUDED_

