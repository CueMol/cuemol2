// -*-Mode: C++;-*-
//
// View: Abstract object for the view
//
// $Id: View.hpp,v 1.49 2011/03/18 05:53:45 rishitani Exp $
//

#ifndef QSYS_VIEW_HPP_INCLUDE_
#define QSYS_VIEW_HPP_INCLUDE_

#include "qsys.hpp"

#include <qlib/ObjectManager.hpp>
#include <qlib/LScrObjects.hpp>
#include <qlib/LScrSmartPtr.hpp>
#include <qlib/LScrCallBack.hpp>
#include <qlib/TimerEvent.hpp>

#include <qlib/Vector4D.hpp>
#include <qlib/LQuat.hpp>

#include "InDevEvent.hpp"
#include "ViewEvent.hpp"
#include "Camera.hpp"
#include "style/StyleSupports.hpp"

using qlib::LString;
using qlib::Vector4D;
using qlib::LQuat;

namespace gfx {
  class DisplayContext;
  class Hittest;
}

namespace qsys {

  using gfx::DisplayContext;

  class ViewInputConfig;
  class StyleSheet;
  class MomentumScroll;
  class ViewCap;
  class ViewFactory;

  class QSYS_API View :
    public qlib::LNoCopyScrObject,
    public InDevListener,
    public qlib::LUIDObject,
    public StyleSupports,
    public StyleResetPropImpl,
    public qlib::TimerListener
  {
    MC_SCRIPTABLE;

  private:
    typedef qlib::LNoCopyScrObject super_t;

    qlib::uid_t m_uid;
    LString m_name;
    bool m_bActive;

    ViewInputConfig *m_pInConf;

    /// Scroll effect impl.
    MomentumScroll *m_pMscr;

  private:
    /// Current camera for this view
    Camera m_curcam;

  private:
    /** ID of the scene to which this object belongs. */
    qlib::uid_t m_nSceneID;

    ViewEventCaster *m_pEvtCaster;

    /////////////////////////////

    /// Width of the view (in pixel)
    int m_nWidth;

    /// Height of the view (in pixel)
    int m_nHeight;

    /// Input event listeners
    InDevEventCaster m_listeners;

    /// Mouse operation mode (zoom/slab/rotz/traz/dist)
    int m_nMouseMode;

    bool m_bCenterChanged;

    /// Name of the mouse cursor type
    LString m_cursorName;

  private:

    /////////////////////////////
    View(const View &r);

    //// = operator (avoid copy operation)
    const View &operator=(const View &arg)
    {
      return *this;
    }

    //////////

  public:
    View();

    virtual ~View();
  
    //////////
  
  public:
    qlib::uid_t getUID() const { return m_uid; }

    LString getName() const { return m_name; }
    void setName(const LString &name) { m_name = name; }

    bool isActive() const { return m_bActive; }
    void setActive(bool b) { m_bActive = b; }

    void setSceneID(qlib::uid_t nid);
    qlib::uid_t getSceneID() const { return m_nSceneID; }

    ScenePtr getScene() const;

    virtual LString toString() const;

    virtual void dump() const;

    virtual gfx::DisplayContext *getDisplayContext() =0;

    virtual void drawScene() =0;
    virtual void swapBuffers();

    virtual void unloading();

    ////////////////////
    // Camera

    //bool saveTo(CameraPtr rcam) const;
    //bool loadFrom(CameraPtr rcam);

    /// Get copy of the view's camera
    CameraPtr getCamera() const {
      CameraPtr rval(MB_NEW Camera(m_curcam));
      return rval;
    }

    /// set camera
    void setCamera(CameraPtr rcam) {
      setCameraAnim(rcam, false);
    }

    /// set camera with animation
    void setCameraAnim(CameraPtr rcam, bool bAnim);

    /// View distance
    double getViewDist() const { return m_curcam.getCamDist(); }

    virtual void setViewDist(double d);

    /// Zoom factor (view angle)
    virtual void setZoom(double f);

    double getZoom() const {
      return m_curcam.getZoom();
    }

    /// Slab depth
    virtual void setSlabDepth(double d);
    double getSlabDepth() const {
      return m_curcam.getSlabDepth();
    }

    // Get View center
    qlib::Vector4D getViewCenter() const {
      return m_curcam.m_center;
    }

    // Set View center
    virtual void setViewCenter(const qlib::Vector4D &pos);

    // Set View center by mouse dragging
    virtual void setViewCenterDrag(const qlib::Vector4D &pos);

    // Set View center with animation
    void setViewCenterAnim(const qlib::Vector4D &pos);

    // Get View center (for scripting iface)
    qlib::LScrVector4D getViewCenterScr() const {
      return qlib::LScrVector4D(getViewCenter());
    }

    // Set View rotation quaternion
    virtual void setRotQuat(const qlib::LQuat &q);

    // Get View rotation quaternion
    qlib::LQuat getRotQuat() const {
      return m_curcam.getRotQuat();
    }

    // Get View rotation quaternion (for scripting iface)
    qlib::LScrQuat getRotQuatScr() const {
      return qlib::LScrQuat(getRotQuat());
    }

    virtual void setPerspec(bool b);
    bool isPerspec() const {
      return m_curcam.m_fPerspec;
    }
    
    int getCenterMark() const {
      return m_curcam.getCenterMark();
    }
    void setCenterMark(int nMode) {
      if (m_curcam.getCenterMark() != nMode) {
        m_curcam.setCenterMark(nMode);
	setUpdateFlag();
      }
    }

    // view direction vectors
    /// Get up-direction vector (in world coord)
    Vector4D getUpVector() const;
    Vector4D getRightVector() const;
    Vector4D getForwardVector() const;

    /////////////////////////////////////////////////////////
    // Stereo View

    int getStereoMode() const {
      return m_curcam.getStereoMode();
    }
    virtual void setStereoMode(int nMode);

    double getStereoDist() const {
      return m_curcam.m_fStereoDist;
    }
    void setStereoDist(double d) {
      if (!qlib::isNear4(m_curcam.m_fStereoDist, d)) {
        m_curcam.m_fStereoDist = d;
	setUpdateFlag();
      }
    }

    /// Query HW stereo impl
    virtual bool hasHWStereo() const;

  private:
    bool m_bSwapStereoEyes;

  public:

    bool isSwapStereoEyes() const {
      return m_bSwapStereoEyes;
    }
    void setSwapStereoEyes(bool b) {
      if (b!=m_bSwapStereoEyes) {
        m_bSwapStereoEyes = b;
	setUpdateFlag();
      }
    }
    

    ////////////////////
    // Other view props
  private:
    bool m_bTransMMS;
    bool m_bRotMMS;

  public:
    /// translation momentum scroll
    bool isTransMMS() const {
      return m_bTransMMS;
    }
    void setTransMMS(bool b) {
      m_bTransMMS = b;
    }

    bool isRotMMS() const {
      return m_bRotMMS;
    }
    void setRotMMS(bool b) {
      m_bRotMMS = b;
    }

    void cancelMomentumScroll();

    /////////////////////////////////////////////////////////
    // Projection

  protected:
    /// setup the projection matrix
    virtual void setUpProjMat(int w, int h) =0;
    
  private:
    bool m_bProjChg;
    
  public:
    void setProjChange() { m_bProjChg = true; } 
    void resetProjChgFlag() { m_bProjChg = false; } 
    bool isProjChange() const { return m_bProjChg; }

  protected:
    /// ID for setUpModelMat() method
    enum {
      MM_NORMAL=0,
      MM_STEREO_LEFT=1,
      MM_STEREO_RIGHT=2
    };

    /// Setup the projection matrix for stereo
    /// @param nid==MM_NORMAL : normal mode
    ///        nid==MM_STEREO_LEFT : stereo left eye
    ///        nid==MM_STEREO_RIGHT : stereo right eye
    virtual void setUpModelMat(int nid) =0;

  public:
    /// reverse projection from view to world coord
    void convZTrans(double dz, Vector4D &vec) const;
    void convXYTrans(double dx, double dy, Vector4D &vec) const;

    /////////////////////////////////////////////////////////
    // Viewport size

    /// get view width in pixel
    inline int getWidth() const
    {
      return m_nWidth;
    }
    
    /// get view height in pixel
    inline int getHeight() const
    {
      return m_nHeight;
    }

    /// Set view size (without firing events and changing matrices)
    void setViewSize(int w, int h) {
      if (w==m_nWidth && h==m_nHeight)
	return;
      m_nWidth = w;
      m_nHeight = h;
      setProjChange();
    }

    /// View size was changed to (cx,cy)
    virtual void sizeChanged(int cx, int cy);

    //
    //  Scaling factor implementation (for HiRES display) 
    // 

  private:
    bool m_bUseSclFac;
    double m_sclfac_x, m_sclfac_y;

  public:
    void setSclFac(double x, double y) {
      m_bUseSclFac = true;
      m_sclfac_x = x;
      m_sclfac_y = y;
    }
    void unsetSclFac() {
      m_bUseSclFac = false;
      m_sclfac_x = 1.0;
      m_sclfac_y = 1.0;
    }
    inline bool useSclFac() const { return m_bUseSclFac; }
    inline double getSclFacX() const { return m_sclfac_x; }
    inline double getSclFacY() const { return m_sclfac_y; }

    inline int convToBackingX(int x) const {
      if (m_bUseSclFac)
	return int( double(x) * m_sclfac_x );
      else
	return x;
    }
    inline int convToBackingY(int x) const {
      if (m_bUseSclFac)
	return int( double(x) * m_sclfac_y );
      else
	return x;
    }

    /////////////////////////////////////////////////////////
    // Events

    /// Lowlevel device event: add user-input device event listener 
    int addListener(InDevListener *p);
    // int addListener(qlib::LSCBPtr scb);

    /// Lowlevel device event: remove user-input device event listener
    bool removeListener(InDevListener *p);
    bool removeListener(int nid);

    // /// Hilevel view event
    // int addViewListener(ViewEventListener *pL);
    // bool removeViewListener(ViewEventListener *pL);
    void fireViewEvent(ViewEvent &ev);

    /////////////////////////////////////////////////////////
    // InDevEvent message handlers
    
    /// mouse drag start event
    virtual bool mouseDragStart(InDevEvent &);
    
    /// mouse drag move event
    virtual bool mouseDragMove(InDevEvent &);
    
    /// mouse drag end event
    virtual bool mouseDragEnd(InDevEvent &);
    
    /// mouse click event (L,M,R button)
    virtual bool mouseClicked(InDevEvent &);
    
    /// mouse double click event (L,M,R button)
    virtual bool mouseDoubleClicked(InDevEvent &);
    
    /// mouse double click event (L,M,R button)
    virtual bool mouseWheel(InDevEvent &);
    
    ////////////////////////////////////////////////
    // Hit test operations
    
    /// Perform renderer hittest
    virtual LString hitTest(int x, int y);
    
    /// Perform hittest by rectangle (in screen coordinate system)
    /// @param bNearest only returns the hittest result for the nearest renderer
    virtual LString hitTestRect(int x, int y, int w, int h, bool bNearest);

    ////////////////////////////////////////////////
    // Framebuffer operations
    
    virtual void readPixels(int x, int y, int width, int height, char *pbuf, int nbufsize, int ncomp);
    
    /// Create a new off-screen view compatible with this view
    virtual View *createOffScreenView(int w, int h, int aa_depth);

  private:
    
    /////////////////////////////////////////////////////////////
    // Helper methods for InDevEvent handling
    
    // void clickHelper(InDevEvent &ev, bool fDbl);
    // void zoomSlab(double delslab, double delzoom);
    // void rotTranZ(double delrot, double deltran);
    void rotXY(double posx, double posy,
               double delx, double dely,
	       double width, double height);
    // static void projSphere(Vector3D &vec, double tkrad);

    bool handleMouseDragImpl(int xid, double delta);

    /////////////////////////////////////////////////////////////

  public:
    /// Fire Input-device event (invoked by impl)
    void fireInDevEvent(InDevEvent &ev);

    /// Timer event handling (TimerListener impl)
    virtual bool onTimer(double t, qlib::time_value curr, bool bLast);

    /////////////////////////////////////////////////////////////
    // Utility routines

  private:
    bool m_bUpdateRequired;

  public:

    /// Rotate view around axes (ax, ay, az are in degree units)
    void rotateView(double ax, double ay, double az);

    /// Translate view
    void translateView(double x, double y, double z);

    /// Translate view (the same as translateView() with generating XXX_PROPDRG type event)
    void translateViewDrag(double x, double y, double z);
    
    /// Create quaternion rotation (x1,y1) --> (x2,y2)
    void trackBallMove(double curX, double curY, double prevX, double prevY);

    /// Calculate the track-ball rotation
    void getTrackRotQuat(double curX, double curY,
                         double prevX, double prevY,
                         Vector4D &axis_phi, double &rphi);
    
    bool safeSetCurrent();

    gfx::DisplayContext *getSiblingCtxt();

    void setUpdateFlag() { m_bUpdateRequired = true; }
    bool getUpdateFlag() const { return m_bUpdateRequired; }
    // void setUpdateFlag() {}
    void clearUpdateFlag() { m_bUpdateRequired = false; }


    void checkAndUpdate() {
      if (m_bUpdateRequired) {
        drawScene();
      }
      clearUpdateFlag();
    }

    void forceRedraw() {
      drawScene();
      clearUpdateFlag();
    }

    //////////
    // for property event propagation
    virtual qlib::uid_t getRootUID() const;

    void setCursor(const LString &cursor);
    LString getCursor() const { return m_cursorName; }

    ////////////////////////////////////////
    // Drawing object (for UI) support
  private:
    typedef std::map<LString, DrawObjPtr> drawobjtab_t;
    drawobjtab_t m_drawObjTab;

  public:
    DrawObjPtr getDrawObj(const LString &clsname);

    void showDrawObj(DisplayContext *pdc);
    void showDrawObj2D(DisplayContext *pdc);

    ////////////////////////////////////////
    // Style supports

  private:
    StyleSheet *m_pStyles;

    void fireStyleEvents();

  public:
    /// Reset to the stylesheet values (impl)
    virtual bool resetProperty(const LString &propnm);

    virtual StyleSheet *getStyleSheet() const;
    virtual void styleChanged(StyleEvent &);
    virtual qlib::uid_t getStyleCtxtID() const;
    
    /// Apply style sheet
    /// (name_list should be comma-separated list of style names)
    void applyStyles(const LString &name_list);

    /// Get current stylesheet names (comma-sep list)
    LString getStyleNames() const;

    /// Add style name (--> this should be removed!!)
    /// If the style exists, the order is changed to the first pos.
    bool pushStyle(const LString &name);

    /// Remove styles that match the regex (--> this should be removed!!)
    bool removeStyleRegex(const LString &regex);

    ////////////////////////////////////////
    // Static methods

    static void setViewFactory(ViewFactory *pVF);

    /// Create system-dependent view object
    static View *createView();

  private:
    /// view factory
    static ViewFactory *m_spViewFac;

    /// view capability info
    static ViewCap * m_spViewCap;
    
  public:
    static ViewCap *getViewCap() {
      return m_spViewCap;
    }
    
    static void setViewCap(ViewCap *p) {
      m_spViewCap = p;
    }
    
    static bool hasVS();
    static bool hasGS();
    static bool hasFBO();
    static bool hasVBO();

  };

  /// View factory superclass
  class QSYS_API ViewFactory
  {
  public:
    ViewFactory() {}
    virtual ~ViewFactory() {}

    virtual View* create() =0;

  };
}

#endif
