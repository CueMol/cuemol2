// -*-Mode: C++;-*-
//
// Light-weight DOM-like tree class for serialization (2)
//
//

#ifndef LDOM2_TREE_HPP_INCLUDE_
#define LDOM2_TREE_HPP_INCLUDE_

///////////////////////////

#include "qlib.hpp"
#include "Utils.hpp"
#include "LScrSmartPtr.hpp"

namespace qlib {

class LScriptable;
class LDataSrcContainer;

class QLIB_API LDom2Node
{
public:
  typedef std::list<LDom2Node*> NodeList;

private:
  // Data structure

  /// Tag name (i.e. property name) of this node
  LString tag_name;

  /// String value of this node
  LString value;

  /// String contents of this node (i.e. XML chardata or cdata)
  LString m_contents;

  /// Type name of this node
  LString m_typeName;

  /// Readonly flag
  bool m_bReadOnly;

  /// default flag
  bool m_bIsDefault;

  /// attribute flag
  bool m_bIsAttr;

  /// consumed flag (for deserialization)
  bool m_bConsumed;

  /// Child nodes (elements or attributes)
  NodeList m_children;

  /// Error messages
  LStringList m_errMsgs;

  ////////////////////////

public:

  LDom2Node()
       : m_bReadOnly(false), m_bIsDefault(false), m_bIsAttr(false), m_bConsumed(false),
         m_pContainer(NULL)
  {}

  /// deep copy ctor
  LDom2Node(const LDom2Node &src);

  ~LDom2Node();

  ////////////////////////

  void setTagName(const LString &name) { tag_name = name; }
  LString getTagName() const { return tag_name; }

  void setTypeName(const LString &name) { m_typeName = name; }
  LString getTypeName() const { return m_typeName; }

  void setValue(const LString &name) { value = name; }
  LString getValue() const { return value; }

  void setAttrFlag(bool aValue) { m_bIsAttr = aValue; }
  bool isAttr() const { return m_bIsAttr; }

  void setDefaultFlag(bool aValue) { m_bIsDefault = aValue; }
  bool isDefault() const { return m_bIsDefault; }

  void setConsumed(bool aValue) { m_bConsumed = aValue; }
  bool isConsumed() const { return m_bConsumed; }

  void setReadOnly(bool aValue) { m_bReadOnly = aValue; }
  bool isReadOnly() const { return m_bReadOnly; }

  /// Returns whether this node is actually a leaf or not.
  bool isLeaf() const;

  /////////

  void setTypeNameByObj(const LScriptable *pObj);

  LScriptable *createObjByTypeName() const;
  
  template <class _Type>
  LScrSp<_Type> createObjByTypeNameT() const
  {
    LScrSp<_Type> rval;
    LScriptable *pScrObj = createObjByTypeName();
    if (pScrObj==NULL) {
      pScrObj->destruct();
      MB_THROW(FileFormatException, "cannot create object from type name (1)");
      return rval;
    }
    if (!pScrObj->isSmartPtr()) {
      pScrObj->destruct();
      MB_THROW(FileFormatException, "cannot create object from type name (2)");
      return rval;
    }
    
    // This cast should not be fail
    LSupScrSp *pBaseSP = static_cast<LSupScrSp *>(pScrObj);

    // This performs dynamic_cast
    rval = LScrSp<_Type>(*pBaseSP);

    if (rval.isnull()) {
      pScrObj->destruct();
      MB_THROW(FileFormatException, "cannot create object from type name (3)");
    }
    
    pScrObj->destruct();
    return rval;
  }


  ///////////////////////////
  // Construction methods

  void appendChild(LDom2Node *pChNode);
  LDom2Node *appendChild();

  LDom2Node *appendChild(const LString &tag) {
    LDom2Node *pNode = appendChild();
    pNode->setTagName(tag);
    return pNode;
  }

  /// Append string attribute
  LDom2Node *appendStrAttr(const LString &tag, const LString &value)
  {
    LDom2Node *pNewNode = appendChild(tag);
    pNewNode->setAttrFlag(true);
    pNewNode->setValue(value);
    return pNewNode;
  }

  /// Set string attribute (overwrite old value if exists)
  LDom2Node *setStrAttr(const LString &tag, const LString &value);
  
  LDom2Node *setBoolAttr(const LString &tag, bool value) {
    return setStrAttr(tag, value?"true":"false");
  }

  void setupByVariant(const LVariant &value);
  void setupByObject(const LScriptable *pObj);

  void popBackChild();

  void clearContents() { m_contents = ""; }
  void appendContents(const LString &data) { m_contents += data; }
  void setContents(const LString &data) { m_contents = data; }
  const LString &getContents() const { return m_contents; }

  ///////////////////////////
  // Access/deserialization methods

private:
  mutable NodeList::iterator m_cur_child;

public:
  int getChildCount() const { return m_children.size(); }

  NodeList::const_iterator childBegin() const { return m_children.begin(); }
  NodeList::const_iterator childEnd() const { return m_children.end(); }

  void firstChild() const {
    LDom2Node *pthat = const_cast<LDom2Node *>(this);
    m_cur_child = pthat->m_children.begin();
  }
  bool hasMoreChild() const {
    LDom2Node *pthat = const_cast<LDom2Node *>(this);
    return m_cur_child != pthat->m_children.end();
  }
  void nextChild() const {
    //LDom2Node *pthat = const_cast<LDom2Node *>(this);
    //++(pthat->m_cur_child);
    ++m_cur_child;
  }
  LDom2Node *getCurChild() const {
    return *m_cur_child;
  }

  LDom2Node *detachCurChild() {
    LDom2Node *pret = *m_cur_child;
    *m_cur_child = NULL;
    return pret;
  }

  /// get first matching child string node
  LString getStrAttr(const LString &key) const;

  /// get first matching child boolean node
  bool getBoolAttr(const LString &key) const;

  // /// Returns true if attribute exists
  // bool hasAttr(const LString &key) const;

  /// remove the first matching node
  bool removeChild(const LString &key);

  /// get first matching child node
  LDom2Node *findChild(const LString &key) const;

  bool isChildrenConsumed() const;

  bool convToVariant(LVariant &variant);

  // for debug
  void dump() const;

  ///////////////////////////////////////

  /// Append error message
  void appendErrMsg(const char *fmt, ...);

  void clearErrorMsgs() {
    m_errMsgs.clear();
  }

  LString getErrorMsgs() const;

  ///////////////////////////////////////
  // data source load/save
private:
  LString m_src;
  LString m_altsrc;
  LString m_srctype;
  LDataSrcContainer *m_pContainer;

public:
  void requestDataLoad(const LString &src,
                       const LString &altsrc,
                       const LString &srctype,
                       LDataSrcContainer *pCnt)
  {
    m_src = src;
    m_altsrc = altsrc;
    m_srctype = srctype;
    m_pContainer = pCnt;
  }
  
  void requestDataEmbed(const LDataSrcContainer *pCnt)
  {
    m_src = LString();
    m_altsrc = LString();
    m_srctype = LString();
    // XXX
    m_pContainer = const_cast<LDataSrcContainer *>(pCnt);
  }
  
  LString getDataSrc() const { return m_src; }
  LString getDataAltSrc() const { return m_altsrc; }
  LString getDataSrcType() const { return m_srctype; }
  LDataSrcContainer *getDataSrcContainer() const { return m_pContainer; }

};

///////////////////////

class QLIB_API LDom2Tree
{
private:
  
  LDom2Node *m_pTop;

  LDom2Node::NodeList m_current;

public:
  LDom2Tree() {
    m_pTop = MB_NEW LDom2Node();
    m_current.push_front(m_pTop);
  }

  LDom2Tree(const LString &topname) {
    m_pTop = MB_NEW LDom2Node();
    m_pTop->setTagName(topname);
    m_current.push_front(m_pTop);
  }

  /// deep copy constructor
  LDom2Tree(const LDom2Tree &src) {
    m_pTop = MB_NEW LDom2Node(*src.m_pTop);
    m_current.push_front(m_pTop);
  }

  LDom2Tree(LDom2Node *pNode) {
    m_pTop = pNode;
    m_current.push_front(m_pTop);
  }


  ~LDom2Tree() {
    if (m_pTop!=NULL)
      delete m_pTop;
  }

  //////

  LDom2Node *top() const {
    //return const_cast<LDom2Node *>(&m_top);
    return m_pTop;
  }

  LDom2Node *current() const {
    return m_current.front();
  }

  void traverse();

  void popNode() {
    m_current.pop_front();
  }

  void dump() const {
    m_pTop->dump();
  }

  void serialize(LScriptable *pObj, bool bUseTypeName = true);

  // create new object and deserialize from this tree
  LScriptable *deserialize() const {
    LScriptable *pObj = top()->createObjByTypeName();
    deserialize(pObj);
    return pObj;
  }

  // deserialize to the existing object (pObj) from this tree
  void deserialize(LScriptable *pObj) const;

  LDom2Node *detach() {
    LDom2Node *pret = m_pTop;
    m_pTop = NULL;
    return pret;
  }
};


} // namespace qlib

#endif

