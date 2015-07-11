// -*-Mode: C++;-*-
//
// Camera: object for the set of view setting
//
// $Id: Camera.hpp,v 1.7 2011/01/03 16:47:05 rishitani Exp $
//

#ifndef QSYS_CAMERA_HPP_INCLUDE_
#define QSYS_CAMERA_HPP_INCLUDE_

#include "qsys.hpp"

#include <qlib/ObjectManager.hpp>
#include <qlib/LScrVector4D.hpp>
#include <qlib/LScrQuat.hpp>
#include <qlib/LDataSrcContainer.hpp>
#include "ObjectEvent.hpp"

namespace qsys {

  using qlib::LString;
  using qlib::Vector4D;
  using qlib::LScrVector4D;
  using qlib::LQuat;
  using qlib::LScrQuat;

  //////////////////////////////////////////////////////////////////
  // Visibility setting

  struct VisSetElem
  {
    bool bVis;
    bool bObj;
  };
  
  class VisSetting : public std::map<qlib::uid_t, VisSetElem>
  {
    typedef std::map<qlib::uid_t, VisSetElem> super_t;
  public:
    void save(ObjectPtr pObj);
    void save(RendererPtr pRend);
    void set(ObjectPtr pObj, bool b);
    void set(RendererPtr pRend, bool b);
  };

  //////////////////////////////////////////////////////////////////
  // Camera object

  class QSYS_API Camera :
    public qlib::LSimpleCopyScrObject,
    public qlib::LDataSrcContainer
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    typedef qlib::LSimpleCopyScrObject super_t;

  public:

    /// Stereo mode ID
    enum {
      CSM_NONE =0,
      CSM_PARA =1,
      CSM_CROSS =2,
      CSM_HW_QBUF =3,
      CSM_HW_AUTO =4,
    };

    /// Center mark ID
    enum {
      CCM_NONE,
      CCM_CROSS,
      CCM_AXIS,
      CCM_CUBE
    };

  public:

    /// Name of the camera
    LString m_name;

    /// Stereo mode
    int m_nStereoMode;

    /// inter-ocular distance
    double m_fStereoDist;

    /// Projection mode
    bool m_fPerspec;

    /// View center position
    Vector4D m_center;

    /// View rotation quaternion
    LQuat m_rotQuat;

  private:
    /// Depth of the slab
    double m_fSlabDepth;

    /// Zoom
    double m_fZoom;

    /// Camera distance
    double m_dCamDist;

    /// center mark type
    int m_nCenterMark;

    /// Source path of the camera
    LString m_source;

    /// Alternative source path of the camera
    LString m_altsrc;

  public:
    
    /// Get/set camera name
    const LString &getName() const {
      return m_name;
    }
    void setName(const LString &val) {
      m_name = val;
    }

    /// Get/set stereo mode
    int getStereoMode() const {
      return m_nStereoMode;
    }
    void setStereoMode(int val) {
      m_nStereoMode = val;
    }

    /// Set distance from camera to view center
    void setCamDist(double d) {
      if (d<=0.1)
        d = 0.1;
      if (d>=10000.0)
        d = 10000.0;
      m_dCamDist = d;
    }

    double getCamDist() const {
      return m_dCamDist;
    }

    /// Get/set center mark type
    int getCenterMark() const {
      return m_nCenterMark;
    }
    void setCenterMark(int val) {
      m_nCenterMark = val;
    }

    /// Source path of the camera (empty if embeded)
    LString getSource() const {
      return m_source;
    }
    void setSource(const LString &src) {
      m_source = src;
    }

    /// Alternative source path of the camera
    LString getAltSrc() const {
      return m_altsrc;
    }
    void setAltSrc(const LString &src) {
      m_altsrc = src;
    }

    bool isPerspec() const {
      return m_fPerspec;
    }
    void setPerspec(bool b) {
      m_fPerspec = b;
    }

    ///
    LScrQuat getRotQuat() const {
      return LScrQuat(m_rotQuat);
    }
    void setRotQuat(const LScrQuat &q) {
      m_rotQuat = LQuat(q);
    }
    void setRotQuat(const LQuat &q) {
      m_rotQuat = q;
    }

    ///
    LScrVector4D getCenter() const {
      return LScrVector4D(m_center);
    }
    void setCenter(const LScrVector4D &q) {
      m_center = LScrVector4D(q);
    }

    void setCenter(const Vector4D &v) {
      m_center = v;
    }

    ///
    void setZoom(double f) {
      if (f<F_EPS4)
        m_fZoom = F_EPS4;
      else
        m_fZoom = f;
    }

    double getZoom() const {
      return m_fZoom;
    }

    /// Set slab depth
    void setSlabDepth(double d) {
      if (d<=0.1)
        d = 0.1;
      if (d>=10000.0)
        d = 10000.0;
      m_fSlabDepth = d;
    }
    double getSlabDepth() const {
      return m_fSlabDepth;
    }

    //////////
    
    bool equals(const Camera &r);

    void copyFrom(const Camera&r);

    //////////

    Camera();

    Camera(const Camera&r)
         :  m_pVisSetNodes(NULL)
    {
      copyFrom(r);
    }

    const Camera &operator=(const Camera &r)
    {
      if (&r != this) {
        copyFrom(r);
      }
      return *this;
    }

    //////////
    
  private:
    /// Object/renderer visibility settings
    VisSetting m_visset;

    /// temporary settings serialized from qsc file
    qlib::LDom2Node *m_pVisSetNodes;

    /// convert m_pVisSetNodes to m_visset data
    void loadVisSetFromNodes(ScenePtr pScene);
    
  public:
    
    /// append vis flag
    /// @param tgtid object/rend ID to remove (vis flag is initialized by the current one)
    void visAppend(qlib::uid_t tgtid, bool bVis, bool bObj);

    /// remove vis flag
    /// @param tgtid target object/rend ID to remove
    /// @return false if tgtid was not found
    bool visRemove(qlib::uid_t tgtid);

    /*
    /// change vis flag
    /// @param tgtid target object/rend ID to change vis flag
    /// @param bVis true for visible
    /// @return false if tgtid was not found
    bool visChange(qlib::uid_t tgtid, bool bVis);
     */

    /// get size of the entries in the vissetflags
    int getVisSize() const {
      if (m_visset.size()==0 && m_pVisSetNodes!=NULL)
        return 1; // cannot return the actual number, but we can tell that there are more than one cameras...
      return m_visset.size();
    }

    /// Save the visibility settings of objects and renderers in the scene pScene
    /// @param pScene target scene to save the visibility flags (should be const??)
    void saveVisSettings(ScenePtr pScene);

    /// Apply the visibility settings to the objects and renderers
    /// @param pScene target scene to load the visibility flags
    void loadVisSettings(ScenePtr pScene) const;

    /// Clear visibility settings
    void clearVisSettings();

    LString getVisSetJSON() const;

    /// Called when the parent scene loading is completed
    /// just call loadVisSetFromNodes()
    void notifyLoaded(ScenePtr pScene) {
      loadVisSetFromNodes(pScene);
    }

    ////////////////////////////////////////
    // LDataSrcContainer implementation

    /// Update src path prop (after reading from src or alt_src)
    virtual void updateSrcPath(const LString &srcpath);

    virtual void readFromStream(qlib::InStream &ins);
    // virtual void readFromPath(const LString &path);


    ////////////////////////////////////////////////////////////
    // Serialization/Deserialization
    virtual void writeTo2(qlib::LDom2Node *pNode) const;
    virtual void readFrom2(qlib::LDom2Node *pNode);

    /// Save camera to the local file
    void writeFile(const LString &aLocalFile) const;

  };

  ////////////////////////////////////////////////////////////////////////
  //

  /// Camera-related event
  class QSYS_API CameraEvent : public QsysEvent
  {
  private:
    typedef QsysEvent super_t;

  public:
    // int m_nEvtType;
    LString m_name;

    //////////

  public:
    CameraEvent()
         : super_t()
    {}

    CameraEvent(const CameraEvent &ev)
         : super_t(ev)
    {}

    virtual ~CameraEvent();

    virtual LCloneableObject *clone() const;

    //////////

    virtual LString getJSON() const;
    virtual bool getCategory(LString &category, int &nSrcType, int &nEvtType) const;
  };

}

#endif
