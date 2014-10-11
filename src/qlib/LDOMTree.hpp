// -*-Mode: C++;-*-
//
// Light-weight DOM-like tree class for serialization
//
// $Id: LDOMTree.hpp,v 1.4 2010/01/24 15:23:45 rishitani Exp $
//

#ifndef LDOM_TREE_HPP_INCLUDE_
#define LDOM_TREE_HPP_INCLUDE_

///////////////////////////

#include "qlib.hpp"
#include "LPropSupport.hpp"

namespace qlib {

  namespace detail {
    struct LDomNode;
    typedef std::list<LDomNode*> NodeList;

    struct LDomNode {
      /** type name of this node */
      LString type_name;

      /** flag: list or hash */
      bool blist;

      /** value of this node */
      LString value;

      /** child nodes (elements or attributes) */
      NodeList children;

      mutable NodeList::const_iterator cur_child;

      ////////////////////////

      LDomNode() : blist(false) {}

      virtual ~LDomNode() {
        NodeList::const_iterator iter = children.begin();
        for (; iter!=children.end(); ++iter)
          delete *iter;
      }

      void first() const { cur_child = children.begin(); }
      bool hasMore() const { return cur_child != children.end(); }
      void next() const { ++cur_child; }
      LDomNode *getCurChild() const { return *cur_child; }

      virtual void dump() const {
        MB_DPRINTLN("type_name=["+type_name+"]");
        MB_DPRINTLN("blist=["+LString::fromBool(blist)+"]");
        MB_DPRINTLN("value=["+value+"]");
        MB_DPRINTLN("children={");
        for (first(); hasMore(); next())
          getCurChild()->dump();
        MB_DPRINTLN("}");
      }

    };

    struct LDomListElem : public LDomNode {
      virtual ~LDomListElem() {}
    };

    struct LDomPropElem : public LDomNode {
      virtual ~LDomPropElem() {}

      /** key name (ID) of this node */
      LString name;

      /** flag: attribute or element */
      bool battr;

      LDomPropElem() : battr(false) {}

      virtual void dump() const {
        MB_DPRINTLN("ID name=["+name+"]");
        MB_DPRINTLN("battr=["+LString::fromBool(battr)+"]");

        LDomNode::dump();
      }
    };

  }

  using qlib::detail::LDomNode;
  using qlib::detail::LDomListElem;
  using qlib::detail::LDomPropElem;
  using qlib::detail::NodeList;

/**
 */
class LDomTree
{
public:
  
  LDomNode m_top;

  NodeList m_current;

  LDomNode *current() {
    return m_current.front();
  }

public:
  LDomTree() {
    m_current.push_front(&m_top);
  }
  ~LDomTree() {}


  void setTypeName(const char *name) {
    LDomNode &cnode = * current();
    cnode.type_name = name;
  }

  void setName(const char *name) {
    LDomPropElem *pelem = dynamic_cast<LDomPropElem *>(current());
    if (pelem)
      pelem->name = name;
    else {
      MB_ASSERT(false);
    }
  }

  /*
  void setValue(const LVariant &value) {
    LDomNode &cnode = * current();
    cnode.value = value;
  }
*/

  void appendAttrNode(const LString &key, const LString &value) {
    pushPropElem();
    setName(key);

    LDomNode *pNode = current();
    LDomPropElem *pPE = static_cast<LDomPropElem *>(pNode);
    pNode->value = value;
    pPE->battr = true;

    popNode();
  }

  void appendListNode(const LString &value) {
    pushListElem();

    LDomNode *pNode = current();
    pNode->value = value;

    popNode();
  }

  //////

  void pushNode(LDomNode *pNewNode) {
    LDomNode &cnode = * current();
    cnode.children.push_back(pNewNode);
    m_current.push_front(pNewNode);
  }

  void pushNode(bool blist = false) {
    LDomNode *pNewNode = MB_NEW LDomNode;
    pNewNode->blist = blist;
    pushNode(pNewNode);
  }
  
  void pushPropElem(bool blist = false) {
    LDomPropElem *pNewNode = MB_NEW LDomPropElem;
    pNewNode->blist = blist;
    pushNode(pNewNode);
  }

  void pushListElem(bool blist = false) {
    LDomListElem *pNewNode = MB_NEW LDomListElem;
    pNewNode->blist = blist;
    pushNode(pNewNode);
  }

  void traverse() {
    if (current()->hasMore()) {
      m_current.push_front(current()->getCurChild());
    }
    else {
      MB_THROW(NullPointerException, "LDOMTree::traverse() cannot traverse to the child node!!");
    }
  }

  void popNode() {
    m_current.pop_front();
  }

  static int getElemCount(LDomNode &node) {
    int n = 0;
    NodeList::const_iterator iter = node.children.begin();
    for (; iter!=node.children.end(); ++iter) {
      LDomPropElem *pPE = dynamic_cast<LDomPropElem *>(*iter);
      if (pPE && pPE->battr) continue;
      ++n;
    }
    return n;
  }

  void dump() const {
    m_top.dump();
  }

};

}

#endif

