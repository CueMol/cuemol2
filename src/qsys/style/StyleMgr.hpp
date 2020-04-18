// -*-Mode: C++;-*-
//
// Style/color database
//

#ifndef QSYS_STYLE_MGR_HPP_INCLUDED
#define QSYS_STYLE_MGR_HPP_INCLUDED

#include <qsys/qsys.hpp>

#include <qlib/SingletonBase.hpp>
#include <qlib/LScrObjects.hpp>
#include <qlib/mcutils.hpp>
#include <qlib/MapTable.hpp>
#include <qlib/EventCaster.hpp>
#include <qlib/SmartPtr.hpp>

#include <gfx/gfx.hpp>
#include <gfx/Material.hpp>

#include "StyleSupports.hpp"

namespace qlib {
  class PrintStream;
  class InStream;
  class OutStream;
  class LDom2Node;
}

namespace qsys {

  MC_DECL_SCRSP(StyleSet);

  class StyleList;
  class StyleEvent;
  class StyleEventCaster;

  using qlib::LString;
  using qlib::LDom2Node;
  using gfx::ColorPtr;
  using gfx::Material;

  ///
  /// Style database (singleton, scriptable)
  ///
  class QSYS_API StyleMgr : public qlib::LSingletonScrObject,
  public qlib::SingletonBase<StyleMgr>
  {
    MC_SCRIPTABLE;

  private:
    typedef qlib::SingletonBase<StyleMgr> super_t;
    
    typedef std::map<qlib::uid_t, StyleList *> data2_t;

    /// Mapping from Scene ID to StyleList
    data2_t m_data2;

    /// Current context (==scene) ID
    // qlib::uid_t m_nCurCtxtID;
    std::list<qlib::uid_t> m_curCtxtStack;

    /// Global context
    StyleList *m_pGlob;

    /// Default style directory
    LString m_defaultDir;

  public:
    void setDefaultDir(const LString &dir) { m_defaultDir = dir; }
    LString getDefaultDir() const { return m_defaultDir; }

    ////////////////////////////////////////////
  public:
    
    StyleMgr();
    virtual ~StyleMgr();
    
    //////////////////////////////
    // context management

    /// set current context ID (usually context ID is scene ID)
    void setContextID(qlib::uid_t nid) {
      *(m_curCtxtStack.begin()) = nid;
      // m_nCurCtxtID = nid;
    }

    void pushContextID(qlib::uid_t nid) {
      m_curCtxtStack.push_front(nid);
    }

    void popContextID() {
      m_curCtxtStack.pop_front();
    }

    /// get current context ID
    qlib::uid_t getContextID() const {
      return *(m_curCtxtStack.begin());
      //return m_nCurCtxtID;
    }

    /// destroy all stylesheets related to context ID nid (usually context ID is scene ID)
    void destroyContext(qlib::uid_t nid);

    //////////////////////////////

    /// Get style list by context(=scene) ID.
    /// If style list doesn't exist, new style list will be created
    StyleList *getCreateStyleList(qlib::uid_t nSceneID);

    /// Check whether the styles belong to the scene (scene ID) is modified or not.
    bool isModified(qlib::uid_t nSceneID) const;

    
    //////////////////////////////////////
    // StyleSet operation methods
    //  (impl is in StyleMgrStyleImpl.cpp)
    
    qlib::uid_t hasStyleSet(const LString &id, qlib::uid_t ctxt);

    /// Add new style to the last of the style set
    StyleSetPtr createStyleSet(const LString &id, qlib::uid_t ctxt);
    
    /// Add new style to the last of the style set (scripting interface)
    qlib::uid_t createStyleSetScr(const LString &id, qlib::uid_t ctxt);
    
    /// Register existing style set object at nord (for Undo/Redo)
    bool registerStyleSet(StyleSetPtr pSet, int nbefore, qlib::uid_t ctxt);

    /// Destroy style set by UID (nStyleSetID)
    bool destroyStyleSet(qlib::uid_t nScopeID, qlib::uid_t nStyleSetID);

    // TO DO: remove impl (use StyleSet method)
    /// Get source property of the style set
    LString getStyleSetSource(qlib::uid_t nStyleSetID) const;
    
    /// Get StyleSet by StyleSetID
    StyleSetPtr getStyleSetById2(qlib::uid_t nStyleSetID) const;

    // TO DO: remove impl
    /// Get StyleSet by StyleSetID (old impl)
    StyleSetPtr getStyleSetById(qlib::uid_t nScopeID, qlib::uid_t nStyleSetID)
    {
      return getStyleSetById2(nStyleSetID);
    }

    /// Save style set to file (impl: StyleMgrStyleImpl.cpp)
    bool saveStyleSetToFile(qlib::uid_t nScopeID, qlib::uid_t nStyleSetID, const LString &path);

    /// Load styleset from file and returns styleset UID (impl: StyleMgrStyleImpl.cpp)
    qlib::uid_t loadStyleSetFromFile(qlib::uid_t nScopeID, const LString &path, bool bReadOnly);

    /// Retrieve info for style sets of the scene
    LString getStyleSetsJSON(qlib::uid_t nSceneID);

    //////////////////////////////////////////////////////////////////////
    // Color methods

    /// get style color
    ColorPtr getColor(const LString &key);
    /// get style color (in scene scope)
    ColorPtr getColor(const LString &key, qlib::uid_t nScopeID);

    // TO DO: remove impl (use StyleSet method)
    /// get color from the specified style set (nScopeID:nStyleSetID)
    ColorPtr getColor(const LString &key, qlib::uid_t nScopeID, qlib::uid_t nStyleSetID);

    // TO DO: remove impl (use StyleSet method)
    /// set color to the specified style set (nScopeID:nStyleSetID)
    ///  returns true if new color is appended (impl: StyleColor.cpp)
    bool setColor(const LString &key, const ColorPtr &color,
                  qlib::uid_t nScopeID, qlib::uid_t nStyleSetID);

    // TO DO: remove impl (use StyleSet method)
    /// remove color from the specified style set (nScopeID:nStyleSetID)
    ///   returns true if color is removed successfully (impl: StyleColor.cpp)
    bool removeColor(const LString &key, qlib::uid_t nScopeID, qlib::uid_t nStyleSetID);

    /// Get color definitions (for GUI, defined in StyleColor.cpp)
    LString getColorDefsJSON(qlib::uid_t nScopeID, qlib::uid_t nStyleSetID = qlib::invalid_uid);

    /// Compile and create new color object (for GUI)
    ColorPtr compileColor(const LString &rep, qlib::uid_t nScopeID);
    
  public:
    //////////////////////////////////////////////////////////////////////
    // Material methods

    //Material *getMaterial(const LString &mat_id, qlib::uid_t nScopeID);

    /// Get renderer-type-dependent string material definition
    LString getMaterial(const LString &mat_id, const LString &rend_type);

    /// Get material definition for internal (OpenGL) renderer
    ///  (nType is type enum defined in Material.hpp)
    double getMaterial(const LString &mat_id, int nType);

    /// Get material name list (for GUI)
    LString getMaterialNamesJSON(qlib::uid_t nScopeID, qlib::uid_t nStyleSetID = qlib::invalid_uid);

  private:
    Material *getMaterialImpl(const LString &mat_id, const LString &rend_type, int nType, qlib::uid_t nScopeID);

  public:
    //////////////////////////////////////////////////////////////////////
    // String data methods

    /// Retrieve the rendering-type specific configuration by key name (e.g. preamble, etc)
    LString getConfig(const LString &key, const LString &rend_type);

    /// Retrieve the string data by key name (e.g. selection, etc)
    LString getStrData(const LString &cat, const LString &key, qlib::uid_t nScopeID);

    /// Special access method for path category string data
    /// (string is separated by comma and %%CONFDIR%% is replaced with conf dir path)
    int getMultiPath(const LString &key, qlib::uid_t nScopeID, std::list<LString> &ls);

    /// Get string definitions (for GUI)
    LString getStrDataDefsJSON(const LString &cat,
                               qlib::uid_t nScopeID,
                               qlib::uid_t nStyleSetID = qlib::invalid_uid);

    // TO DO: remove impl (use StyleSet method)
    LString getStrData(const LString &cat, const LString &key, qlib::uid_t nScopeID, qlib::uid_t nStyleSetID);

    // TO DO: remove impl (use StyleSet method)
    /// set string data to the specified style set (nScopeID:nStyleSetID)
    ///  returns true if new data is appended
    bool setStrData(const LString &cat, const LString &key, const LString &value,
                    qlib::uid_t nScopeID, qlib::uid_t nStyleSetID);

    // TO DO: remove impl (use StyleSet method)
    /// remove string data from the specified style set (nScopeID:nStyleSetID)
    ///   returns true if data is removed successfully
    bool removeStrData(const LString &cat, const LString &key, qlib::uid_t nScopeID, qlib::uid_t nStyleSetID);

  private:
    LString getStrImpl(const LString &key, qlib::uid_t nScopeID);

  public:
    /////////////////////////////////////////////////////////
    // Style methods (impl is partly in StyleMgrStyleImpl.cpp)

    /// Get style node by style name
    LDom2Node *getStyleNode(const LString &stylename, qlib::uid_t ctxt)
    {
      return getStyleNodeImpl(LString(), stylename, LString(), ctxt, false);
    }

    /// Get style node by style name and prop name in dot notation
    LDom2Node *getStyleNode2(const LString &stylename,
                             const LString &prop_names,
                             qlib::uid_t ctxt) {
      return getStyleNodeImpl(LString(), stylename, prop_names, ctxt, false);
    }

  private:
    LDom2Node *getStyleNodeImpl(const LString &set_id,
                             const LString &stylename,
                             const LString &prop_names,
                             qlib::uid_t ctxt,
                             bool bCreate);
  public:
    LString getStyleValue(qlib::uid_t ctxt, const LString &setid, const LString &dotname);
    
    void setStyleValue(qlib::uid_t ctxt, const LString &setid, const LString &dotname,
                       const LString &value);

    LString getStyleNamesJSON(qlib::uid_t nSceneID);

    void createStyleFromObj(qlib::uid_t ctxt, qlib::uid_t setid, const LString &name,
                            const qlib::LScrSp<qlib::LScrObjBase> &pSObj);

  private:
    LDom2Node *extractStyleNodeFromObj(qlib::uid_t ctxt, qlib::LScrObjBase *pSObj, int nLevel, bool bResolveStyle);

  private:
    /// Search style nodes recursively to get a node with name, keyname
    LDom2Node *findStyleNodeByName(LDom2Node *pSty, const LString &keyname, bool bCreate);

    void fireEventImpl(qlib::uid_t uid, const LString &setname);

    ////////////////////////////////////////////////////////////
    // Style event management

  private:
    StyleEventCaster *m_pLsnrs;

    typedef std::set<std::pair<qlib::uid_t, LString> > PendEventSet;

    /// Pending style-update events
    PendEventSet m_pendEvts;

  public:

    void addListener(StyleEventListener *pLsnr);

    void removeListener(StyleEventListener *pLsnr);

    void fireEvent(StyleEvent &evt);

    void clearPendingEvents();
    void firePendingEvents();

    //////////
    // Initializer/finalizer

    static bool init();
    
    static void fini();
  };

  /////////////////////////

  class StyleEventCaster
       : public qlib::LEventCaster<StyleEvent, StyleEventListener>
  {
    virtual void execute(StyleEvent &ev, StyleEventListener *p)
    {
      p->styleChanged(ev);
    }
  };

}

SINGLETON_BASE_DECL(qsys::StyleMgr);

#endif
