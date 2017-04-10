// -*-Mode: C++;-*-
//
// Style/color database
//

#ifndef GFX_STYLE_SET_HPP_INCLUDED
#define GFX_STYLE_SET_HPP_INCLUDED

#include <qsys/qsys.hpp>
#include <gfx/gfx.hpp>

#include <qlib/LScrObjects.hpp>
#include <qlib/LScrSmartPtr.hpp>
#include <qlib/mcutils.hpp>
#include <qlib/MapTable.hpp>
#include <qlib/LUIDObject.hpp>

#include <gfx/Material.hpp>

#define STYLEMGR_DB_DELIM ":"

namespace qlib {
  class PrintStream;
  class InStream;
  class OutStream;
  class LDom2Node;
}

namespace qsys {

  using qlib::LString;
  using qlib::LDom2Node;
  using gfx::ColorPtr;
  using gfx::Material;

  class StyleSet;
  MC_DECL_SCRSP(StyleSet);

  ///
  /// Style definition, consisting of palette, materials, renderer styles, etc.
  ///
  class QSYS_API StyleSet
       : public qlib::LUIDObject,
         public qlib::LNoCopyScrObject
  {
    MC_SCRIPTABLE;

  private:
    typedef std::map<LString, ColorPtr> palette_t;
    typedef std::map<LString, LString> strdata_t;
    typedef std::map<LString, LDom2Node*> data_t;

    typedef qlib::MapPtrTable<Material> matdata_t;

    /// Named color definitions
    palette_t m_palette;

    /// String data definitions
    strdata_t m_strdata;

    /// Structured data definitions
    data_t m_data;

    /// Material definition
    matdata_t m_matdata;

    // TO DO: linked style set belongs to multiple scenes

    /// ID of the Scene to which this StyleSet belongs
    qlib::uid_t m_nSceneID;

    /// source file name this style is loaded from
    LString m_source;

    /// Name (string ID) of this style set
    LString m_name;

    /// ID override flag (for deserialization)
    bool m_bOverrideID;

    /// read-only flag
    bool m_bReadOnly;

    /// modified flag
    bool m_bModified;

    /// Unique ID of this style set
    qlib::uid_t m_nUID;
    
  public:
    
    StyleSet();

    ~StyleSet();

    //////////
    // Generic properties

    void setContextID(qlib::uid_t id) { m_nSceneID = id; }
    qlib::uid_t getContextID() const { return m_nSceneID; }

    // void setID(qlib::uid_t id) { m_nSceneID = id; }
    qlib::uid_t getUID() const { return m_nUID; }

    void setSource(const LString &src) { m_source =src; }
    const LString &getSource() const { return m_source; }

    void setName(const LString &name) { m_name = name; }
    const LString &getName() const { return m_name; }

    void setReadOnly(bool val) { m_bReadOnly = val; }
    bool isReadOnly() const { return m_bReadOnly; }

    void setModified(bool val) { m_bModified = val; }
    bool isModified() const { return m_bModified; }

    void setOverrideID(bool val) { m_bOverrideID = val; }
    bool isOverrideID() const { return m_bOverrideID; }

    //////////
    // Color data methods

    typedef palette_t::const_iterator coldata_iterator;
    coldata_iterator colBegin() const { return m_palette.begin(); }
    coldata_iterator colEnd() const { return m_palette.end(); }

    bool getColor(const LString &key, ColorPtr &rcol) const;
    bool hasColor(const LString &rkey) const;
    bool setColor(const LString &rkey, const ColorPtr &pCol);
    bool removeColor(const LString &rkey);

    /// Get color by color name (for scripting interface)
    ColorPtr getColor(const LString &key) const;

    /// Get list of color definitions in JSON format
    LString getColorDefsJSON(bool bParen=true) const;

    //////////
    // String data methods

    typedef strdata_t::const_iterator strdata_iterator;
    strdata_iterator strBegin() const { return m_strdata.begin(); }
    strdata_iterator strEnd() const { return m_strdata.end(); }

    /// get string data (returns true if found)
    bool getString(const LString &key, LString &rval) const;
    bool hasString(const LString &key) const;
    /// set (rewrite/append) string data (returns true if appended)
    bool setString(const LString &key, const LString &value);
    /// remove string data (returns true if removed)
    bool removeString(const LString &key);

    LString getStrData(const LString &cat, const LString &key) const;

    bool hasStrData(const LString &cat, const LString &key) const;

    bool setStrData(const LString &cat, const LString &key, const LString &value);

    bool removeStrData(const LString &cat, const LString &key);

    /// Get string data names with specified category in JSON format
    /// dbname: data base name
    /// cat: category
    LString getStrDataNamesJSON(const LString &dbname, const LString &cat, bool bParen) const;

    LString getStrDataNamesJSON(const LString &cat) const {
      return getStrDataNamesJSON("string", cat, true);
    }

    /// Special access method for path category string data
    /// (string is separated by comma and %%CONFDIR%% is replaced with conf dir path)
    LString getPath(const LString &key) const;

    ////////////////////////////////////////////////////
    // Style (Structured data) methods

    /// get structured data (LDom2Node) by key
    LDom2Node *getData(const LString &key) const;
    
    bool hasData(const LString &key) const;

    /// Put structured data (LDom2Node) with key name
    ///  this method returns false if key name is already used
    bool putData(const LString &key, LDom2Node *pNode);

    /// Remove structured data by key name
    bool removeData(const LString &key);

    typedef data_t::const_iterator data_iterator;
    data_iterator dataBegin() const { return m_data.begin(); }
    data_iterator dataEnd() const { return m_data.end(); }

    // style-specific structured data methods

    /// Get style node by style name
    ///  This method is a wrapper for getData() for style nodes.
    LDom2Node *getStyleNode(const LString &name) const {
      LString key = StyleSet::makeStyleKey(name);
      return getData(key);
    }

    /// Put style node by style name
    ///  This method is a wrapper for putData() for style nodes.
    ///  This method returns false if key name is already used
    bool putStyleNode(const LString &name, LDom2Node *pNode) {
      LString key = StyleSet::makeStyleKey(name);
      return putData(key, pNode);
    }
    /// Remove style node by style name
    ///  This method is a wrapper of removeData() for style nodes.
    bool removeStyleNode(const LString &name) {
      LString key = StyleSet::makeStyleKey(name);
      return removeData(key);
    }

    bool removeStyle(const LString &name) { return removeStyleNode(name); }
    bool hasStyle(const LString &name) const {
      LString key = StyleSet::makeStyleKey(name);
      return hasData(key);
    }
    
    /// Get style info in JSON format
    /// bParen: with/without array parens
    LString getStyleNamesJSON(bool bParen=true) const;

    ////////////////////////////////////////////////////
    // Material data methods

    bool putMaterial(const LString &id, const LString &type, const LString &value);
    bool putMaterial(const LString &id, int type, double value);
    Material *getMaterial(const LString &id) const;

    typedef matdata_t::const_iterator matdata_iterator;
    matdata_iterator matBegin() const { return m_matdata.begin(); }
    matdata_iterator matEnd() const { return m_matdata.end(); }

    LString getMaterialNamesJSON(bool bParen = true) const;
    

    //////////
    // serialization/deserialization methods
    
    void writeToDataNode(qlib::LDom2Node *pNode) const;
    
    /// color table serialization
    void writeColToDataNode(qlib::LDom2Node *pNode) const;
    /// string table serialization
    void writeStrToDataNode(qlib::LDom2Node *pNode) const;
    /// style (structured data) table serialization
    void writeStyleToDataNode(qlib::LDom2Node *pNode) const;
    /// material table serialization
    void writeMatToDataNode(qlib::LDom2Node *pNode) const;

    // void readFromDataNode(qlib::LDom2Node *pNode);

    //////////

    /// decode string data key
    static bool decodeStrDataKey(const LString &inkey, LString &dbname, LString &tagname, LString &id);

    /// Convert selection, etc to the string data key
    /// dbname:
    /// tagname:
    /// id:
    static inline LString makeStrDataKey(const LString &dbname, const LString &tagname, const LString &id)
    {
      return dbname + STYLEMGR_DB_DELIM  + tagname  +STYLEMGR_DB_DELIM + id;
    }

    //

    /// Convert the style name to the structured data key name
    static inline LString makeStyleKey(const LString &arg)
    {
      return arg + STYLEMGR_DB_DELIM + "style";
    }

    //

  };

  /// Cascading list of style set objects.
  /// StyleSet nearer the front has higher priority.
  class StyleList : public std::list<StyleSetPtr>
  {
  public:
    ~StyleList();

    StyleSetPtr findSet(const LString &id) const;
  };

}

#endif

