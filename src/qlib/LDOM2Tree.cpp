// -*-Mode: C++;-*-
//
// Object serialization streams
//
// $Id: LDOM2Tree.cpp,v 1.10 2010/12/24 18:43:48 rishitani Exp $

#include <common.h>

#include "LDOM2Tree.hpp"
#include "LExceptions.hpp"
#include "LScriptable.hpp"
#include "ClassRegistry.hpp"
#include "LVariant.hpp"

using namespace qlib;

LDom2Node::LDom2Node(const LDom2Node &src)
{
  tag_name = src.tag_name;
  value = src.value;
  m_contents = src.m_contents;
  m_typeName = src.m_typeName;
  m_bReadOnly = src.m_bReadOnly;
  m_bIsDefault = src.m_bIsDefault;
  m_bIsAttr = src.m_bIsAttr;
  m_bConsumed = src.m_bConsumed;

  BOOST_FOREACH(LDom2Node *pChNode, src.m_children) {
    LDom2Node *pNewNode = MB_NEW LDom2Node(*pChNode);
    m_children.push_back(pNewNode);
  };

  // XX: ??
  // m_children;

  m_pContainer = NULL;

  if (src.m_pContainer!=NULL) {
    LOG_DPRINTLN("ERROR> copy(): data source node was not correctly copied!!");
  }
}

LDom2Node::~LDom2Node()
{
  //std::for_each( m_children.begin(), m_children.end(), delete_ptr<LDom2Node *>() );
  BOOST_FOREACH(LDom2Node *pNode, m_children) {
    if (pNode!=NULL)
      delete pNode;
  };
}

LScriptable *LDom2Node::createObjByTypeName() const
{
  LString type_name = getTypeName();
  //LString type_name = getStrAttr("type");
  if (type_name.isEmpty()) {
    // ERROR
    LOG_DPRINTLN("empty type name");
    return NULL;
  }

  ClassRegistry *pMgr = ClassRegistry::getInstance();
  LClass *pClass = pMgr->getClassObj(type_name);
  if (pClass==NULL) {
    LOG_DPRINTLN("ERROR class \"%s\" is not defined", type_name.c_str());
    return NULL;
  }

  // createScrObj() creates SmartPtr object, if the class supports it.
  LDynamic *pNewObj = pClass->createScrObj();
  if (pNewObj==NULL) {
    LOG_DPRINTLN("ERROR cannot instantiate object");
    return NULL;
  }
  LScriptable *pS = dynamic_cast<LScriptable *>(pNewObj);
  if (pS==NULL) {
    delete pNewObj;
    LOG_DPRINTLN("ERROR cannot instantiate object");
    return NULL;
  }
  return pS;
}

void LDom2Node::setTypeNameByObj(const LScriptable *pObj)
{
  LClass *pCls = pObj->getClassObj();
  LString clsname = pCls->getClassName();
  setTypeName(clsname);
  // putStrAttr("type", clsname);
}

LString LDom2Node::getStrAttr(const LString &key) const
{
  BOOST_FOREACH(LDom2Node *pnode, m_children) {
    if (pnode->getTagName().equals(key)) {
      if (!pnode->value.isEmpty()) {
        return pnode->value;
      }
    }
  };

  return LString();
}

bool LDom2Node::getBoolAttr(const LString &key) const
{
  LString sval = getStrAttr(key);
  if (sval.equalsIgnoreCase("true")||
      sval.equalsIgnoreCase("yes"))
    return true;
      
  return false;
}

/*bool LDom2Node::hasAttr(const LString &key) const
{
  BOOST_FOREACH(LDom2Node *pnode, m_children) {
    if (pnode->getTagName().equals(key))
      return true;
  };

  return false;
}*/

bool LDom2Node::removeChild(const LString &key)
{
  NodeList::iterator iter = m_children.begin();
  NodeList::iterator iter_end = m_children.end();

  for (; iter!=iter_end; ++iter) {
    if ((*iter)->getTagName().equals(key)) {
      if (*iter!=NULL) delete *iter;
      m_children.erase(iter);
      return true;
    }
  }

  return false;
}

void LDom2Node::appendChild(LDom2Node *pNewNode)
{
  m_children.push_back(pNewNode);
  m_cur_child = m_children.end();
  --m_cur_child;
  return;
}

LDom2Node *LDom2Node::appendChild()
{
  LDom2Node *pNewNode = MB_NEW LDom2Node();
  appendChild(pNewNode);
  return pNewNode;
}

/// Set string attribute (overwrite old value if exists)
LDom2Node *LDom2Node::setStrAttr(const LString &tag, const LString &value)
{
  LDom2Node *pNewNode = findChild(tag);
  if (pNewNode==NULL)
    pNewNode = appendChild(tag);
  
  pNewNode->setAttrFlag(true);
  pNewNode->setReadOnly(false);
  pNewNode->setDefaultFlag(false);
  pNewNode->setValue(value);
  
  return pNewNode;
}

void LDom2Node::setupByVariant(const LVariant &value)
{
  if (value.isObject()) {
    LScriptable *pObj = value.getObjectPtr();
    setupByObject(pObj);
    return;
  }
    
  // Non-object variant should be string convertable
  MB_ASSERT(value.isStrConv());

  // String node will be written as attribute (if supported)
  setValue(value.toString());
  setAttrFlag(true);
}

void LDom2Node::setupByObject(const LScriptable *pObj)
{
  if (pObj->isStrConv()) {
    setValue(pObj->toString());
    setAttrFlag(true);
  }
  else {
    setTypeNameByObj(pObj);
    setAttrFlag(false);
    pObj->writeTo2(this);
  }
}

void LDom2Node::popBackChild()
{
  if (m_children.size()==0) return;
  LDom2Node *pPop = m_children.back();
  m_children.pop_back();
  m_cur_child = m_children.begin();
  delete pPop;
}

LDom2Node *LDom2Node::findChild(const LString &key) const
{
  BOOST_FOREACH(LDom2Node *pnode, m_children) {
    if (pnode->getTagName().equals(key)) {
      return pnode;
    }
  };
  return NULL;
}

bool LDom2Node::isChildrenConsumed() const
{
  BOOST_FOREACH(LDom2Node *pNode, m_children) {
    //NodeList::const_iterator iter = m_children.begin();
    //for (; iter!=m_children.end(); ++iter) {
    //LDom2Node *pNode = *iter;
    if (!pNode->isConsumed())
      return false;
  }
  return true;
}


void LDom2Node::dump() const
{
  MB_DPRINT("tag_name=["+tag_name+"]");
  MB_DPRINT(", type=["+m_typeName+"]");
  MB_DPRINT(" def:%d ro:%d a:%d c:%d ", m_bIsDefault, m_bReadOnly, m_bIsAttr, m_bConsumed);
  if (getChildCount()==0) {
    MB_DPRINTLN(", value=["+value+"]");
  }
  else {
    MB_DPRINTLN(", children= {");
    BOOST_FOREACH (LDom2Node *p, m_children) {
      if (p==NULL)
        MB_DPRINTLN("(nil)\n");
      else
        p->dump();
    }
    MB_DPRINTLN("}");
  }
}

bool LDom2Node::isLeaf() const
{
  //if (!m_children.empty())
  //return false;

  if (!m_typeName.isEmpty())
    return false;

  //if (!m_bIsAttr)
  //return false;

  return true;
}

//
// Convert LDOM2 node to variant
//
bool LDom2Node::convToVariant(LVariant &variant)
{

  if (isLeaf()) {
    variant.setStringValue(getValue());
    return true;
  }

  // Instantiate object from LDom2Node object
  // createObj() creates SmartPtr object, if the class supports it.
  LScriptable *pS = createObjByTypeName();
  if (pS==NULL) {
	  MB_DPRINTLN("Fatal Error: node instantiation failed");
    return false;
  }
  // setup child properties/values
  pS->readFrom2(this);
  variant.setObjectPtr(pS);
  
  return true;
}

void LDom2Node::appendErrMsg(const char *fmt, ...)
{
  const int bufsize = 1024;
  char sbuf[bufsize];
  va_list marker;

  va_start(marker, fmt);

#ifdef WIN32
  _vsnprintf(sbuf, sizeof sbuf, fmt, marker);
#else

# ifdef HAVE_VSNPRINTF
  vsnprintf(sbuf, sizeof sbuf, fmt, marker);
# else
  vsprintf(sbuf, fmt, marker);
# endif

#endif

  va_end(marker);

  sbuf[bufsize-1] = '\0';
  LString msg(sbuf);
  
  m_errMsgs.push_back(msg);
  LOG_DPRINTLN("%s", msg.c_str());
}

LString LDom2Node::getErrorMsgs() const
{
  LString rval;
  BOOST_FOREACH (LDom2Node* p, m_children) {
    if (p!=NULL)
      rval += p->getErrorMsgs();
  }
  
  if (m_errMsgs.size()>0) {
    rval += LString::join("\n", m_errMsgs) + "\n";
  }

  return rval;
}

/////////////////////////////////////////////////////////////////////

void LDom2Tree::traverse()
{
  if (current()->hasMoreChild()) {
    m_current.push_front(current()->getCurChild());
  }
  else {
    MB_THROW(NullPointerException, "LDOMTree::traverse() cannot traverse to the child node!!");
  }
}

void LDom2Tree::serialize(LScriptable *pObj, bool bUseTypeName /*= true*/)
{
  LDom2Node *pNode = m_current.front();
  if (bUseTypeName)
    pNode->setTypeNameByObj(pObj);
  pObj->writeTo2(pNode);
}

void LDom2Tree::deserialize(LScriptable *pObj) const
{
  LDom2Node *pNode = m_current.front();
  // LScriptable *pObj = pNode->createObjByTypeName();
  pObj->readFrom2(pNode);
  // return pObj;
}

