// -*-Mode: C++;-*-
//
// smart pointer for scriptable objects
//
// $Id: LScrSmartPtr.cpp,v 1.20 2010/09/15 15:42:44 rishitani Exp $

#include <common.h>

#include "LScrSmartPtr.hpp"

using namespace qlib;

LSupScrSp::LSupScrSp(LScriptable *p /*= 0*/)
  : m_ptr(p)
{
  if (p!=NULL) {
    int *pcnt = p->getSpRefCounter();
    if (pcnt!=NULL) {
      m_pcnt = pcnt;
      ++*m_pcnt;
      //MB_DPRINTLN("SP: reusing from client %p, cnt=%p (%s)",
      //m_ptr, m_pcnt, typeid(*m_ptr).name());
      return;
    }
  }

  try { // prevent leak if new throws
	// We don't use leak check new op. for sp to supress leak dump messages.
    m_pcnt = new count_type(1);
  }
  catch(...) {
    if (p!=NULL)
      delete p;
    throw;
  }

  if (p!=NULL) {
    p->setSpRefCounter(m_pcnt);
  }

  /*
  if (p) {
    MB_DPRINTLN("SP: created client %p, cnt=%p(%d), type=%s",
		m_ptr, m_pcnt, *m_pcnt, typeid(*m_ptr).name());
  }
  else {
    MB_DPRINTLN("SP: created client %p, cnt=%p(%d)",
		m_ptr, m_pcnt, *m_pcnt);
  }
  */
}

LSupScrSp::~LSupScrSp()
{
  MB_ASSERT(m_pcnt);

  if(--*m_pcnt == 0) {

    if (m_ptr==NULL) {
      //MB_DPRINTLN("*** WARNING SP: deleting client %p, cnt=%p",
      //m_ptr, m_pcnt);
      delete m_pcnt;
    }
    else {
      //MB_DPRINTLN("SP: deleting client %p, cnt=%p (%s)",
      //m_ptr, m_pcnt, typeid(*m_ptr).name());
      delete m_ptr;
      delete m_pcnt;
    }
  }
}

void LSupScrSp::check_copy()
{
/*
  LString clsnm = typeid(*m_ptr).name();
  if (clsnm.equals("class qsys::Scene")) {
    MB_DPRINTLN("qsys::Scene refctr = %d", *m_pcnt);
  }
  */
}

bool LSupScrSp::isStrConv() const
{
  if (m_ptr)
    return m_ptr->isStrConv();
  else
    return false;
}

LString LSupScrSp::toString() const
{
  if (m_ptr)
    return m_ptr->toString();
  else
    return LString();
}

LClass *LSupScrSp::getScrClassObj() const
{
  if (m_ptr)
    return m_ptr->getScrClassObj();
  else
    return NULL;
}

bool LSupScrSp::implements(const qlib::LString &nm) const
{
  if (m_ptr)
    return m_ptr->implements(nm);
  else
    return false;
}

void LSupScrSp::writeTo2(LDom2Node *pNode) const
{
  if (m_ptr)
    m_ptr->writeTo2(pNode);
}

void LSupScrSp::readFrom2(LDom2Node *pNode)
{
  if (m_ptr)
    m_ptr->readFrom2(pNode);
}

LClass *LSupScrSp::getClassObj() const
{
  return m_ptr->getClassObj();
}
    
bool LSupScrSp::isSmartPtr() const
{
  return true;
}

LScriptable *LSupScrSp::getSPInner() const
{
  return get();
}

LScriptable *LSupScrSp::copy() const
{
  LObject *pnew = clone();
  // LScriptable *pret = reinterpret_cast<LScriptable *>(pnew);
  // MB_ASSERT(pret==dynamic_cast<LScriptable *>(pnew));

  LScriptable *pret = dynamic_cast<LScriptable *>(pnew);
  return pret;
}

void LSupScrSp::destruct()
{
  delete this;
}

///////////////////////////
// Property support

bool LSupScrSp::getProperty(const LString &propnm, LVariant &presult) const
{
  return m_ptr->getProperty(propnm, presult);
}

bool LSupScrSp::setProperty(const LString &propnm, const LVariant &pvalue)
{
  return m_ptr->setProperty(propnm, pvalue);
}

//

LString LSupScrSp::getPropTypeName(const LString &nm) const
{
  return m_ptr->getPropTypeName(nm);
}

bool LSupScrSp::hasProperty(const LString &propnm) const
{
  return m_ptr->hasProperty(propnm);
}

bool LSupScrSp::hasWritableProperty(const LString &propnm) const
{
  return m_ptr->hasWritableProperty(propnm);
}

bool LSupScrSp::hasPropDefault(const LString &propnm) const
{
  return m_ptr->hasPropDefault(propnm);
}

bool LSupScrSp::isPropDefault(const LString &propnm) const
{
  return m_ptr->isPropDefault(propnm);
}

bool LSupScrSp::resetProperty(const LString &propnm)
{
  return m_ptr->resetProperty(propnm);
}

//

bool LSupScrSp::getPropertyImpl(const LString &propnm, LVariant &presult) const
{
  return m_ptr->getPropertyImpl(propnm, presult);
}

bool LSupScrSp::setPropertyImpl(const LString &propnm, const LVariant &pvalue)
{
  return m_ptr->setPropertyImpl(propnm, pvalue);
}

bool LSupScrSp::resetPropertyImpl(const LString &propnm)
{
  return m_ptr->resetPropertyImpl(propnm);
}

bool LSupScrSp::getPropSpecImpl(const LString &propnm, PropSpec *pspec) const
{
  return m_ptr->getPropSpecImpl(propnm, pspec);
}

void LSupScrSp::getPropNames(std::set<LString> &rs) const
{
  m_ptr->getPropNames(rs);
}

//

qlib::uid_t LSupScrSp::getRootUID() const
{
  return m_ptr->getRootUID();
}

//////////

bool LSupScrSp::hasMethod(const qlib::LString &nm) const
{
  return m_ptr->hasMethod(nm);
}
bool LSupScrSp::invokeMethod(const qlib::LString &nm, qlib::LVarArgs &args)
{
  return m_ptr->invokeMethod(nm, args);
}

