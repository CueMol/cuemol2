// -*-Mode: C++;-*-
//
// Object: base class of data object
//

#ifndef QSYS_OBJECT_HPP_INCLUDE_
#define QSYS_OBJECT_HPP_INCLUDE_

#include "qsys.hpp"

#include <qlib/ObjectManager.hpp>
#include <qlib/LScrObjects.hpp>
#include <qlib/LScrSmartPtr.hpp>
#include <qlib/mcutils.hpp>
#include <qlib/MapTable.hpp>
#include <qlib/LDataSrcContainer.hpp>
//#include <qlib/Matrix4D.hpp>

#include "ObjectEvent.hpp"
#include "Renderer.hpp"

namespace qlib {
  class LDom2Tree;
  class InStream;
}

namespace qsys {

  using qlib::LString;
  using qlib::LDom2Node;

  class ObjLoadEditInfo;

  class QSYS_API Object :
    public qlib::LNoCopyScrObject,
    public qlib::LUIDObject,
    public qlib::LDataSrcContainer,
    public qlib::LPropEventListener
  {
    MC_SCRIPTABLE;

    friend class ObjLoadEditInfo;

  public:
    // type definitions
    //typedef std::map<LString, ObjExtDataPtr> ExtDataTab;
    typedef qlib::MapTable<ObjExtDataPtr> ExtDataTab;

    typedef qlib::LNoCopyScrObject super_t;
    // typedef qlib::LSimpleCopyScrObject super_t;

  private:
    //////////////////////////////////////////////////
    // properties/etc

    /// Unique ID of this object
    qlib::uid_t m_uid;

    /// ID of the scene to which this object belongs
    qlib::uid_t m_nSceneID;

    /// Name of this object
    LString m_name;

    /// Modified flag
    bool m_bModified;

    /// source (file path)
    LString m_source;
    /// alternative source path
    LString m_altsrc;
    /// reader type of source
    LString m_sourcetype;
    /// reader option of source
    LDom2Node *m_pReaderOpts;

    /// Visibility
    bool m_bVisible;

    /// Locked/unlocked (for user editing)
    bool m_bLocked;

    /// collapsed state (for GUI impl)
    bool m_bUICollapsed;

    /// display order (for GUI impl)
    int m_nUIOrder;

    /// default transformation matrix
    qlib::Matrix4D m_xformMat;

    /////

    /// object event implementation
    ObjectEventCaster *m_pEvtCaster;

    /// Extension data
    ExtDataTab m_extdat;

    //////////////////////////////////////////////////
    // 

    /// = operator (avoid copy operation)
    Object(const Object &r)
    {
      MB_ASSERT(false);
    }

    /// = operator (avoid copy operation)
    const Object &operator=(const Object &arg)
    {
      MB_ASSERT(false);
      return *this;
    }

    virtual qlib::LCloneableObject *clone() const {
      MB_ASSERT(false);
      return NULL;
    }
    
    //////////////////////////////////////////////////

  public:
    // default ctor
    Object();

    // dtor
    virtual ~Object();
  
    /// convert to string
    virtual LString toString() const;

    /// show debug message (to error log)
    virtual void dump() const;

    //////////

    const LString &getName() const { return m_name; }
    void setName(const LString &name) { m_name = name; }
    
    /// Get modified flag (read only from UI)
    bool getModifiedFlag() const { return m_bModified; }
    void setModifiedFlag(bool b) { m_bModified = b; }

    void setVisible(bool b) { m_bVisible = b; }
    bool isVisible() const { return m_bVisible; }

    void setUILocked(bool b) { m_bLocked = b; }
    bool isUILocked() const { return m_bLocked; }

    void setUICollapsed(bool b) { m_bUICollapsed = b; }
    bool isUICollapsed() const { return m_bUICollapsed; }

    void setUIOrder(int n) { m_nUIOrder = n; }
    int getUIOrder() const { return m_nUIOrder; }

    // transformation
    /// Get transformation matrix
    qlib::Matrix4D getXformMatrix() const {
      return m_xformMat;
    }

    /// Set transformation matrix
    virtual void setXformMatrix(const qlib::Matrix4D &m);

    //

    const LString &getSource() const {
      return m_source;
    }
    void setSource(const LString &name) {
      m_source = name;
    }

    const LString &getAltSource() const {
      return m_altsrc;
    }
    void setAltSource(const LString &name) {
      m_altsrc = name;
    }
    
    void setReaderOpts(LDom2Node *ptree);
    LDom2Node *getReaderOpts() const { return m_pReaderOpts; }

    //////////

    const LString &getSourceType() const {
      return m_sourcetype;
    }
    void setSourceType(const LString &name) {
      m_sourcetype = name;
    }
    
    /// Read object from stream (LDataSrcContiner implementation)
    virtual void readFromStream(qlib::InStream &ins);

    /// Update src path prop (after reading from src or alt_src)
    virtual void updateSrcPath(const LString &srcpath);

    ////////////////////////////////////////////////////////////
  
    qlib::uid_t getUID() const { return m_uid; }
    void setUID(qlib::uid_t) {
      MB_ASSERT(false);
    }

    void setSceneID(qlib::uid_t nid) { m_nSceneID = nid; }
    
    qlib::uid_t getSceneID() const { return m_nSceneID; }
    ScenePtr getScene() const;

    /// Unloading from scene (i.e. destructing)
    virtual void unloading();

    /// Attached to ObjReader (i.e. start of loading)
    virtual void readerAttached();

    /// Detached from ObjReader (i.e. end of loading)
    virtual void readerDetached();

    ////////////////////////////////////////////////////////////
    // Renderer management methods

  private:
    typedef std::map<qlib::uid_t, RendererPtr> rendtab_t;
    rendtab_t m_rendtab;

  public:
    typedef rendtab_t::const_iterator RendIter;

    /// Create new renderer (and attach to this object)
    RendererPtr createRenderer(const LString &tpnm);

    /// Attach existing renderer to this object
    void attachRenderer(const RendererPtr &pRend);

    RendererPtr getRenderer(qlib::uid_t uid) const;
    RendererPtr getRendByName(const LString &name);
    RendererPtr getRendByName(const LString &name, const LString &tpnm);
    RendererPtr getRendererByType(const LString &tpnm);
    RendererPtr getRendererByIndex(int ind);
    bool destroyRenderer(qlib::uid_t uid);


    RendIter beginRend() const { return m_rendtab.begin(); }
    RendIter endRend() const { return m_rendtab.end(); }
    int getRendCount() const { return m_rendtab.size(); }

    /// Returns comma separated list of compatible Renderer names
    LString searchCompatibleRendererNames();

    int getRendUIDs(qlib::UIDList &uids) const;

    LString getFlatRendListJSON() const;
    LString getGroupedRendListJSON() const;
    LString getFilteredRendListJSON(const LString &grpfilt) const;

    /// Create preset renderer (=renderer group)
    RendererPtr createPresetRenderer(const LString &preset_name,
                                     const LString &grp_name,
                                     const LString &name_prefix);

    //////////
    // Scripting interface wrapper
    LString getRendUIDList() const;

    ////////////////////////////////////////////////////////////
    // Extension data management

    //int getExtDataSize() const;
    LString getExtDataNames() const;

    /// Get or create extdata. Create new extdata if not present
    ObjExtDataPtr getCreateExtData(const LString &name);

    /// Get extdata. returns null obj if not present.
    ObjExtDataPtr getExtData(const LString &name) const;

    void removeExtData(const LString &name);

    void setExtData(ObjExtDataPtr p);

    

    ////////////////////////////////////////////////////////////
    // Event related operations

    int addListener(ObjectEventListener *pL);
    bool removeListener(ObjectEventListener *pL);
    void fireObjectEvent(ObjectEvent &ev);

    /// for property event propagation
    virtual qlib::uid_t getRootUID() const;

    /// property event handler for object properties
    virtual void propChanged(qlib::LPropEvent &ev);

    ////////////////////////////////////////////////////////////
    // Serialization/Deserialization

    virtual void writeTo2(LDom2Node *pNode) const;
    virtual void readFrom2(LDom2Node *pNode);

    /// convert rel and abs of src and alt_src paths
    void convSrcPath(const LString &src_str,
                     const LString &alt_src_str,
                     LDom2Node *pNode,
                     bool bSetProp) const;

    virtual void forceEmbed();

    virtual void setDataChunkName(const LString &name, LDom2Node *pNode, int nQdfVer);

  private:
    void registerRendererImpl(RendererPtr);

  };

}

#endif
