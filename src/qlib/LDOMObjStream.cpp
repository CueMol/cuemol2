// -*-Mode: C++;-*-
//
// Object serialization streams
//
// $Id: LDOMObjStream.cpp,v 1.14 2009/11/09 14:12:52 rishitani Exp $

#include <common.h>

#if 0
#include "LDOMObjStream.hpp"
#include "LScriptable.hpp"

using namespace qlib;

LDOMObjOutStream::~LDOMObjOutStream()
{
}

void LDOMObjOutStream::writeTop(LSerializable *pTopObj)
{
  LScriptable *pScr = dynamic_cast<LScriptable *>(pTopObj);
  if (!pScr) {
    LOG_DPRINTLN("ObjOutStream.writeTop> cannot serialize %p", pTopObj);
    return;
  }
  LClass *pCls = pScr->getClassObj();
  LString clsname = pCls->getClassName();
  MB_DPRINTLN("writeTop name=%s", clsname.c_str());

  m_data.pushNode();
  m_data.setTypeName(clsname);
  pTopObj->writeTo(*this);
  m_data.popNode();
}

/////

void LDOMObjOutStream::startList(const LString &name)
{
  m_data.pushNode(true);
  m_data.setTypeName(name);
}

void LDOMObjOutStream::endList()
{
  m_data.popNode();
}

/////

//static 
LString LDOMObjOutStream::getTypeName(const LScriptable *pScr)
{
  LString rval;
  if (!pScr) return rval;
  if (pScr->isSmartPtr() && pScr->getSPInner()==NULL)
    return rval;
  LClass *pCls = pScr->getClassObj();
  rval = pCls->getClassName();
  MB_DPRINTLN("writeObject name=%s", rval.c_str());
  return rval;
}

void LDOMObjOutStream::writeObject(const LScriptable *pScr)
{
  const LSerializable *pPC = dynamic_cast<const LSerializable *>(pScr);
  if (pPC)
    pPC->writeTo(*this);
}

void LDOMObjOutStream::writeListElem(const LVariant &value)
{
  if (value.isStrConv()) {
    m_data.appendListNode(value.toString());
    return;
  }

  m_data.pushListElem();
  writeVariant(value);
  m_data.popNode();
}

void LDOMObjOutStream::writeListElemObject(const LScriptable *pScr)
{
  LString clsname = getTypeName(pScr);
  if (clsname.isEmpty())
    return;

  m_data.pushListElem();
  m_data.setTypeName(clsname);
  writeObject(pScr);
  m_data.popNode();
}

void LDOMObjOutStream::writeProp(const LString &name, const LVariant &value)
{
  if (value.isStrConv()) {
    m_data.appendAttrNode(name, value.toString());
    return;
  }

  m_data.pushPropElem();
  m_data.setName(name);
  writeVariant(value);
  m_data.popNode();
}

void LDOMObjOutStream::writePropObject(const LString &name, const LScriptable *pScr)
{
  LString clsname = getTypeName(pScr);
  if (clsname.isEmpty())
    return;

  m_data.pushPropElem();
  m_data.setName(name);
  m_data.setTypeName(clsname);
  writeObject(pScr);
  m_data.popNode();
}

/////

void LDOMObjOutStream::writeVariant(const LVariant &value)
{
  LDomNode *pNode = m_data.current();
  LDomPropElem *pPE = dynamic_cast<LDomPropElem *>(pNode);
  
  /*
  if (value.type!=LVariant::LT_OBJECT) {
    pNode->value = value.toString();
    if (pPE)
      pPE->battr = true;
    return;
  }
   */
  
  qlib::LScriptable *pObj = value.getBareObjectPtr();
  if (pObj==NULL)
    return;

  /*
  if (pObj->isStrConv()) {
    pNode->value = pObj->toString();
    if (pPE)
      pPE->battr = true;
    return;
  }
   */

  LSerializable *pPC = dynamic_cast<LSerializable *>(pObj);
  if (pPC) {
    pPC->writeTo(*this);
  }
}

///////////////////////////////////////////////////////////

LDOMObjInStream::~LDOMObjInStream()
{
}

#include "ClassRegistry.hpp"

LSerializable *LDOMObjInStream::readObjImpl()
{
  LString clsname = m_data.current()->type_name;
//  const int ncs = m_pCurNode->children.size();
//  const int nelems = LDomTree::getElemCount(*m_pCurNode);
//  const int nattrs = ncs-nelems;

  ClassRegistry *pMgr = ClassRegistry::getInstance();
  LClass *pClass = pMgr->getClassObj(clsname);
  if (pClass==NULL) {
    LOG_DPRINTLN("ERROR class \"%s\" is not defined", clsname.c_str());
    return NULL;
  }
  
  // createScrObj() creates SmartPtr object, if the class supports it.
  LDynamic *pNewObj = pClass->createScrObj();
  if (pNewObj==NULL) {
    LOG_DPRINTLN("ERROR cannot instantiate class \"%s\"", clsname.c_str());
    return NULL;
  }
  LSerializable *pS = dynamic_cast<LSerializable *>(pNewObj);
  if (pS==NULL) {
    LOG_DPRINTLN("ERROR cannot instantiate class \"%s\"", clsname.c_str());
    return NULL;
  }

  pS->readFrom(*this);

  return pS;
}

void LDOMObjInStream::firstChild()
{
  m_data.current()->first();
}

bool LDOMObjInStream::hasMoreChild()
{
  return m_data.current()->hasMore();
}

void LDOMObjInStream::nextChild()
{
  m_data.current()->next();
}

LString LDOMObjInStream::getChildID()
{
  LDomNode *pNode = m_data.current()->getCurChild();
  LDomPropElem *pPE = dynamic_cast<LDomPropElem *>(pNode);
  if (pPE==NULL) return LString();
  return pPE->name;
}

LSerializable *LDOMObjInStream::readChildObj()
{
  m_data.traverse();
  LSerializable *pRet = readObjImpl();
  m_data.popNode();
  return pRet;
}

void LDOMObjInStream::readChildData(LVariant &value)
{
  //LDomNode *pNode = m_data.current()->getCurChild();
  m_data.traverse();

  for (;;) {

    LDomNode *pNode = m_data.current();

    if (pNode->children.size()==0) {
      value.setStringValue(pNode->value);
      break;
    }

    //
    // Case: structured value
    //

    if (!value.isObject()) {
      // data inconsistency !!
      reportError();
      break;
    }
      
    LScriptable *pObjOrig = value.getObjectPtr();
    if (pObjOrig!=NULL) {
      // TO DO!!
      // Check compatibility between "value" and LDOM data
      LString clsnm = LDOMObjOutStream::getTypeName(pObjOrig);
      LString domname = m_data.current()->type_name;
      if (clsnm.equals(domname)) {
        // compatible object --> don't create new one
        pObjOrig->readFrom(*this);
        break;
      }
    }
      
    // incompatible obj --> create new obj based on the LDOM typename
    LSerializable *ptmp = readObjImpl();
    LScriptable *pObj = dynamic_cast<LScriptable *>(ptmp);
    if (pObj==NULL) {
      LOG_DPRINTLN("ERROR!!");
      reportError();
      delete ptmp;
      break;
    }
    else {
      // variant "value" own the created object "pObj"
      //LScrSp<LScriptable> *pSpObj = new LScrSp<LScriptable>(pObj);
      //value.setObjectPtr(pSpObj);
      value.setObjectPtr(pObj);
    }

    break;
  }
  m_data.popNode();
}

void LDOMObjInStream::reportError()
{
  LDomNode *pNode = m_data.current();
  LString msg = LString::format("Error occurred at node type=<%s> value=<%s> blist=%d nchild=%d",
                                pNode->type_name.c_str(),
                                pNode->value.c_str(),
                                (int) pNode->blist,
                                pNode->children.size());
                                
  LOG_DPRINTLN("LDOMObjInStream> %s", msg.c_str());
}

bool LDOMObjInStream::startList(const LString &name)
{
  for (firstChild(); hasMoreChild(); nextChild()) {
    LDomNode *pNode = m_data.current()->getCurChild();
    const LString &tnm = pNode->type_name;
    if (tnm.equals(name)) {
      m_data.traverse();
      return true;
    }
  }
  return false;
}

void LDOMObjInStream::endList()
{
  m_data.popNode();
}

#endif
