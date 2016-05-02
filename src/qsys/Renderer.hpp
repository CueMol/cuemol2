// -*-Mode: C++;-*-
//
// Renderer classes draw Object's contents to the View
//

#ifndef QSYS_RENDERER_HPP_INCLUDE_
#define QSYS_RENDERER_HPP_INCLUDE_

#include "qsys.hpp"

#include <qlib/ObjectManager.hpp>
#include <qlib/LScrSmartPtr.hpp>
#include <qlib/LScrVector4D.hpp>
#include <qlib/LPropEvent.hpp>
#include <qlib/LScrMatrix4D.hpp>
#include <gfx/AbstractColor.hpp>
#include <gfx/DisplayContext.hpp>
#include "style/StyleSupports.hpp"
#include "RendererEvent.hpp"
#include "ObjectEvent.hpp"
#include "SceneEvent.hpp"

using qlib::LString;

namespace gfx {
  class Hittest;
  class RawHitData;
}

namespace qsys {

  using gfx::DisplayContext;
  class StyleSheet;

  class QSYS_API Renderer :
    //public StyleScrObject,
    public qlib::LSimpleCopyScrObject,
    public StyleSupports,
    public StyleResetPropImpl,
    public qlib::LUIDObject,
    public qlib::LPropEventListener,
    public ObjectEventListener,
    public SceneEventListener
  {
    MC_SCRIPTABLE;

  public:

    typedef qlib::LSimpleCopyScrObject super_t;
    //typedef StyleScrObject super_t;

    RendererEventCaster *m_pEvtCaster;

  private:

    /// ID of the scene to which this renderer belongs
    qlib::uid_t m_nSceneID;

    qlib::uid_t m_uid;
    
    qlib::uid_t m_nClientObj;

    /// Name of this renderer
    LString m_name;

    /// Visibility
    bool m_bVisible;

    /// Locked/unlocked (for user editing)
    bool m_bLocked;

    /// display order (for GUI display)
    int m_nUIOrder;
    
    /// Group Name (for grouping in GUI display; defalyt="")
    LString m_groupName;

    /// style sheet
    StyleSheet *m_pStyles;

  public:
    Renderer();
    Renderer(const Renderer &r);
    virtual ~Renderer();
  
    //////////

  private:
    /// = operator (for avoiding copy operation)
    const Renderer &operator=(const Renderer &arg)
    {
      return *this;
    }

    //////////

  public:

    virtual const char *getTypeName() const =0;

    virtual bool isCompatibleObj(ObjectPtr pobj) const =0;

    virtual LString toString() const;

    /// Called just before this object is unloaded
    virtual void unloading();

    /// Get the center coordinates of the rendering contents
    virtual qlib::Vector4D getCenter() const =0;

    /// Returns True if getCenter() can return valid center.
    virtual bool hasCenter() const;

    /// Returns true if rendering contains transparent objects.
    /// (In OpenGL impl, transparent objects should be rendered without depth testing.)
    virtual bool isTransp() const;

    virtual bool isDispLater() const;

    //////////
    // Rendering

    /// Display renderers in the scene to the frame buffer (3D/structure).
    virtual void display(DisplayContext *pdc) =0;

    /// Display 2D labels (UI elements /w depth)
    virtual void displayLabels(DisplayContext *pdc);

    //////////
    // Hittest

    void processHit(DisplayContext *pdc);

    virtual void displayHit(DisplayContext *pdc);

    /// Hittest support check (default is not support hittest)
    virtual bool isHitTestSupported() const;

    /// Hittest result interpretation
    virtual LString interpHit(const gfx::RawHitData &);
    
    //////////

    virtual void setSceneID(qlib::uid_t nid);

    qlib::uid_t getSceneID() const { return m_nSceneID; }
    ScenePtr getScene() const;

    qlib::uid_t getUID() const { return m_uid; }

    void setName(const LString &n) { m_name = n; }
    const LString &getName() const { return m_name; }

    void setVisible(bool b) { m_bVisible = b; }
    bool isVisible() const { return m_bVisible; }

    void setUILocked(bool b) { m_bLocked = b; }
    bool isUILocked() const { return m_bLocked; }

    qlib::LScrVector4D getCenterScr() const {
      return qlib::LScrVector4D(getCenter());
    }

    void setUIOrder(int n) { m_nUIOrder = n; }
    int getUIOrder() const { return m_nUIOrder; }

    void setGroupName(const LString &n) { m_groupName = n; }
    const LString &getGroupName() const { return m_groupName; }

    //////////////////////////////////////////////////
    // Client object management

    virtual void attachObj(qlib::uid_t obj_uid);

    virtual qlib::uid_t detachObj();

    qlib::uid_t getClientObjID() const {
      return m_nClientObj;
    }

    ObjectPtr getClientObj() const;


    //////////////////////////////////////////////////
    // Style supports

    /// Reset to the stylesheet values (impl)
    virtual bool resetProperty(const LString &propnm);

    /// Get stylesheet of this renderer
    virtual StyleSheet *getStyleSheet() const;

    /// Style event listener
    virtual void styleChanged(StyleEvent &);

    /// Style context ID (==scene ID)
    virtual qlib::uid_t getStyleCtxtID() const;

    /// Apply style sheet
    /// (name_list should be comma-separated list of style names)
    void applyStyles(const LString &name_list);

    /// Re-apply the current style names (calls m_pStyle->apply())
    void reapplyStyle();

    /// Get current stylesheet names (comma-sep list)
    LString getStyleNames() const;

    // // Removed (2.1.0/120408)
    // bool pushStyle(const LString &name);
    // bool removeStyleRegex(const LString &regex);

  private:
    void fireStyleEvents();

    void setupStyleUndo(const LString &, const LString &);

    //////////////////////////////////////////////////
    // Default material&transparency

  private:
    /// default material name
    LString m_defMatName;

    /// default alpha
    double m_defAlpha;

    /// default transformation matrix
    qlib::Matrix4D m_xformMat;

  public:
    LString getDefaultMaterial() const {
      return m_defMatName;
    }
    void setDefaultMaterial(const LString &str) {
      m_defMatName = str;
    }

    double getDefaultAlpha() const {
      return m_defAlpha;
    }
    void setDefaultAlpha(double f) {
      m_defAlpha = f;
    }

    qlib::Matrix4D getXformMatrix() const {
      return m_xformMat;
    }

    void setXformMatrix(const qlib::Matrix4D &m) {
      m_xformMat = m;
    }

  private:
    /// Edge/silhouette line mode
    //  (for cartoon rendering using povray, etc)
    //  values are defined in gfx::DisplayContext
    int m_nEdgeLineType;

    /// Width of edge lines
    double m_dEdgeLineWidth;

    /// Color of edge lines
    gfx::ColorPtr m_pEgLineCol;

  public:
    double getEdgeLineWidth() const {
      return m_dEdgeLineWidth;
    }
    void setEdgeLineWidth(double f) {
      m_dEdgeLineWidth = f;
    }

    const gfx::ColorPtr &getEdgeLineColor() const
    {
      return m_pEgLineCol;
    }
    void setEdgeLineColor(const gfx::ColorPtr &r)
    {
      m_pEgLineCol = r;
    } 

    /// Edge line types
    enum {
      ELT_NONE = gfx::DisplayContext::ELT_NONE,
      ELT_EDGES = gfx::DisplayContext::ELT_EDGES,
      ELT_SILHOUETTE = gfx::DisplayContext::ELT_SILHOUETTE,
      //ELT_OPQ_EDGES = gfx::DisplayContext::ELT_OPQ_EDGES,
      //ELT_OPQ_SILHOUETTE = gfx::DisplayContext::ELT_OPQ_SILHOUETTE
    };

    int getEdgeLineType() const {
      return m_nEdgeLineType;
    }
    void setEdgeLineType(int n) {
      m_nEdgeLineType = n;
    }


    ////////////////////////////////////////////////////////////
    // Event related operations

    int addListener(RendererEventListener *pL);
    bool removeListener(RendererEventListener *pL);
    void fireRendererEvent(RendererEvent &ev);

    /// object changed event (do nothing)
    virtual void objectChanged(ObjectEvent &ev);

    /// scene changed event (for onloaded event)
    virtual void sceneChanged(SceneEvent &ev);

    /// For property event propagation
    virtual qlib::uid_t getRootUID() const;
    
    /// Property event handler
    virtual void propChanged(qlib::LPropEvent &ev);

    /// Serialization
    virtual void writeTo2(qlib::LDom2Node *pNode) const;
    virtual void readFrom2(qlib::LDom2Node *pNode);

  };

} // namespace qsys

#endif // QSYS_RENDERER_HPP_INCLUDE_

