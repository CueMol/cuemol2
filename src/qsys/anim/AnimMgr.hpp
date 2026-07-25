// -*-Mode: C++;-*-
//
// AnimMgr: animation management obj for the scene
//

#ifndef QSYS_ANIMMGR_HPP_INCLUDED
#define QSYS_ANIMMGR_HPP_INCLUDED

#include <qsys/qsys.hpp>

#include <qlib/LScrObjects.hpp>
#include <qlib/LScrSmartPtr.hpp>
#include <qlib/LScrTime.hpp>
#include <qlib/ObjectManager.hpp>
#include <qlib/LPropEvent.hpp>
#include <qlib/mcutils.hpp>
#include <qlib/TimerEvent.hpp>
#include <qsys/SceneEvent.hpp>
#include <qsys/Camera.hpp>
#include "AnimObj.hpp"

class AnimMgr_wrap;

namespace qlib {
  class EventManager;
}

namespace qsys {

  class SceneExporter;
  class AnimObjEvent;

  /// Animation manager
  class QSYS_API AnimMgr :
    public qlib::LNoCopyScrObject,
    public qlib::LUIDObject,
    public qlib::TimerListener,
    public qlib::LPropEventListener,
    public SceneEventListener
  {
    MC_SCRIPTABLE;

    friend class ::AnimMgr_wrap;

  private:

    /// unique ID of this object
    qlib::uid_t m_uid;

    qlib::EventManager *m_pEvMgr;

    qlib::time_value m_timeStart;
    qlib::time_value m_timeEnd;

    qlib::time_value m_timeRemain;

    /// Elapsed time (read-only prop)
    qlib::time_value m_timeElapsed;

    /// state of anim
    int m_nState;

    qlib::uid_t m_nTgtSceneID;

    ViewPtr m_pTgtView;

    CameraPtr m_pStartCam;

    CameraPtr m_pWorkCam;

    struct timeline_tuple {
      int event_type;
      AnimObjPtr pObj;
      timeline_tuple(int av, AnimObjPtr pv) : event_type(av), pObj(pv) {}
    };
    typedef std::multimap<qlib::time_value, timeline_tuple> timeline;

    /// Pre-animation values of the properties overwritten by the anim objs.
    /// Key is "<target uid>:<propname>", the same format as the prop_tl key
    /// built in startImpl(). Filled through savePropVal() and written back
    /// by restoreProps().
    typedef std::map<LString, qlib::LVariant> propsave_t;
    propsave_t m_propSave;

    /// True only while a loop playback is starting its next lap, where the
    /// values saved before the first lap must be carried over. Every other
    /// startImpl() re-saves from the current scene state, so a playback
    /// abandoned without reaching stop() (dialog closed mid-render, fatal
    /// error) cannot leave a stale save behind for the next one.
    bool m_bLoopLap;

    //////////////////////
    //  persistent workarea

    typedef std::deque<AnimObjPtr> data_t;
    data_t m_data;

    /// duration (length) of this animation
    qlib::time_value m_length;

    /// loop flag of this animation
    bool m_loop;

    /// Name of the startig camera of this animation
    LString m_startCamName;

  public:
    
    // State of animation
    enum {
      AM_STOP,
      AM_RUNNING,
      AM_PAUSED
    };

    typedef qlib::LNoCopyScrObject super_t;

    ///////////////////////////////////////////////

    /// default ctor
    AnimMgr();

    /// dtor
    ~AnimMgr() override;

    void setTgtSceneID(qlib::uid_t nID) { m_nTgtSceneID = nID; }
    ScenePtr getTgtScene() const;

    qlib::uid_t getUID() const { return m_uid; }

    ///////////////////////////////////////////////
    // player interface

    /// start animation
    void start(ViewPtr pView);
    /// stop animation
    void stop();
    /// pause animation
    void pause();
    
    /// jump to the specified time frame (and pause)
    void goTime(qlib::time_value to_tv, ViewPtr pView);
    void goTimeScr(const qlib::LScrTime &tv, ViewPtr pView);

    CameraPtr getWorkCam() const { return m_pWorkCam; }
    void setWorkCam(CameraPtr pCam) {
      m_pWorkCam = CameraPtr( static_cast<Camera *>(pCam->copy()) );
    }

    ViewPtr getTgtView() const { return m_pTgtView; }

    /// Save the current value of a property, so that it is restored when
    /// playback stops. Called from PropAnim::onPropSave() implementations.
    /// Saving the same target/property twice is a no-op, so overlapping
    /// anims keep the value from before the first one ran.
    void savePropVal(qlib::uid_t tgt_uid, const LString &propnm);

    /// Timer event handling (TimerListener impl)
    bool onTimer(double t, qlib::time_value curr, bool bLast) override;

    /// scene event handler (to remove the view reference on view destruction)
    void sceneChanged(SceneEvent &) override;

    /////////////////
    // implementation
  private:

    void startImpl();

    void onTimerImpl(qlib::time_value elapsed);

    void fireEvent(AnimObjEvent &ev);

    /// Write back all values saved by savePropVal() and clear the table.
    /// Targets that no longer exist are skipped silently (a renderer can be
    /// deleted while an animation runs).
    void restoreProps();

  public:

    ///////////////////////////////////////////////////
    // methods that changes (edit/modify) the animation 

    /// clear the animation table
    void clear();

    /// get animation object by index
    AnimObjPtr getAt(int index) const;

    /// Get animation object by name
    /// @param name name of anim obj to retrieve
    AnimObjPtr getByName(const LString &name) const;

    /// Append animation object to the last of the anim table
    /// @param pAnimObj animation object to append
    void append(AnimObjPtr pAnimObj);

    /// Insert animation object
    /// @param nInsBef index of reference anim obj
    /// @param pAnimObj animation object to insert before the nInsBef obj
    void insertBefore(int nInsBef, AnimObjPtr pAnimObj);

    /// Remove the animation obj refered by the index
    /// @param index index of anim obj to delete
    bool removeAt(int index);

    /// Resolve relative start/end times
    /// @throw throws exception when time resolution is failed
    void resolveRelTime();

  private:
    /// update internal data structure (total length) after modification
    void update();

    /// append implementation (w/o event/undo op.)
    void appendImpl(AnimObjPtr pAnimObj);

    /// Resolve relative start/end times (implementation)
    void resolveTimeImpl(AnimObjPtr pObj);

  public:
    /////////////////////////////////////////////////
    // rendering interface

    /// setup rendering mode (for frames from tv_start to tv_end)
    /// @returns number of frames in tv_start~tv_end
    int setupRender(const qlib::LScrTime &tv_start,
                    const qlib::LScrTime &tv_end,
                    double frame_rate);

    int getFrameNo() const {
      return m_nCurrFrame;
    }

    // void skipFrames();

    /// Write single frame using the SceneExporter
    void writeFrame(qlib::LScrSp<SceneExporter> pWriter);

    /// Prepare the exporter for the current frame WITHOUT writing it: attach
    /// the target scene, apply this frame's animation state and hand the
    /// frame's camera to the exporter.
    /// Returns false when the frame sequence is already exhausted.
    /// Pairs with endFrame(); an exporter that renders asynchronously
    /// (e.g. UmbreonSceneExporter) runs between the two calls.
    bool beginFrame(qlib::LScrSp<SceneExporter> pWriter);

    /// Detach the exporter and advance to the next frame (see beginFrame()).
    void endFrame(qlib::LScrSp<SceneExporter> pWriter);

    /////////////////
    // implementation
  private:
    double m_delt;
    int m_nStartFrame;
    int m_nEndFrame;
    int m_nCurrFrame;

  public:
    /////////////////////////////////////////////////
    // getter/setter

    int getPlayState() const { return m_nState; }

    LString getStartCamName() const { return m_startCamName; }
    void setStartCamName(const LString &value) { m_startCamName = value; }

    qlib::LScrTime getScrLength() const {
      return qlib::LScrTime(m_length);
    }

    void setScrLength(const qlib::LScrTime &value) {
      m_length = value.getValue();
    }

    qlib::time_value getLength() const {
      return m_length;
    }

    void setLength(qlib::time_value value) {
      m_length = value;
    }
    
    bool isLoop() const {
      return m_loop;
    }

    void setLoop(bool value) {
      m_loop = value;
    }

    qlib::LScrTime getScrElapsed() const {
      return qlib::LScrTime(m_timeElapsed);
    }

    /// get the count of the anim objects
    int getSize() const {
      return m_data.size();
    }
    
    ////////////////////////////////////////////////////

    /// For property event propagation
    qlib::uid_t getRootUID() const override;
    
    /// Property event handler (for child animation objs)
    void propChanged(qlib::LPropEvent &ev) override;

    ////////////////////////////////////////////////////
    // Serialization/Deserialization

    /// Serialize this scene to the stream
    void writeTo2(qlib::LDom2Node *pNode) const override;

    /// Serialize this scene to the localfile
    void readFrom2(qlib::LDom2Node *pNode) override;
  };

}

#endif

