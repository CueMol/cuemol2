// -*-Mode: C++;-*-
//
// JSP's taglib-like XML input stream class
//
// $Id: XmlInStream.cpp,v 1.1 2008/01/02 13:40:16 rishitani Exp $

#include <common.h>

#include "XmlInStream.hpp"

using namespace qlib;

XmlTagHandler::~XmlTagHandler()
{
}

void XmlTagHandler::setupAttr(const ExpatInStream::Attributes &attrs)
{
  m_attr.erase(m_attr.begin(), m_attr.end());

  ExpatInStream::Attributes::const_iterator iter = attrs.begin();
  for (; iter!=attrs.end(); ++iter) {
    m_attr.set(iter->first, iter->second);
  }
}

int XmlTagHandler::getLineNo() const
{
  return m_pStream->getLineNo();
}

bool XmlTagHandler::isRootTag() const
{
  XmlTagHandler *pp = m_pStream->getParentTag(1);
  return (pp==NULL);
}

/** get integer attribute */
int XmlTagHandler::getIntAttr(const LString &name) const
{
  LString val = m_attr.get(name);
  int rval;
  if (val.isEmpty()) {
    MB_THROW(InvalidAttrException,
	     LString::format("Attr %s not found", name.c_str()));
    return 0;
  }
  if (!val.toInt(&rval)) {
    MB_THROW(InvalidAttrException,
	     LString::format("Attr %s value \"%s\" is not integer",
			     name.c_str(), val.c_str()));
    return 0;
  }
  return rval;
}

bool XmlTagHandler::getIntAttr(const LString &name, int &rval) const
{
  LString val = m_attr.get(name);
  if (val.isEmpty())
    return false;
  return val.toInt(&rval);
}

/** get double real attribute */
double XmlTagHandler::getDoubleAttr(const LString &name) const
{
  LString val = m_attr.get(name);
  double rval;
  if (val.isEmpty()) {
    MB_THROW(InvalidAttrException,
	     LString::format("Attr %s not found", name.c_str()));
    return 0;
  }
  if (!val.toDouble(&rval)) {
    MB_THROW(InvalidAttrException,
	     LString::format("Attr %s value \"%s\" is not number",
			     name.c_str(), val.c_str()));
    return 0;
  }

  return rval;
}

bool XmlTagHandler::getDoubleAttr(const LString &name, double &rval) const
{
  LString val = m_attr.get(name);
  if (val.isEmpty())
    return false;
  return val.toDouble(&rval);
}

////////////////////////////////////////////////

XmlInStream::~XmlInStream()
{
  m_htab.clearAndDelete();
}

bool XmlInStream::registerTag(XmlTagHandler *pth, bool bForce)
{
  LString name = pth->getName();
  if (m_htab.get(name)!=NULL) {
    if (!bForce) return false;
    delete m_htab.remove(name);
  }

  //MB_DPRINTLN("register tag <%s> %p", name.c_str(), pth);
  m_htab.set(name, pth);
  return true;
}

XmlTagHandler *XmlInStream::getParentTag(int n) const noexcept
{
  if (n>=m_stack.size())
    return NULL;
    
  std::list<XmlTagHandler *>::const_iterator pos = m_stack.begin();
  for (; n>0 && pos!=m_stack.end(); --n,++pos) {
  }
  if (pos==m_stack.end()) return NULL;

  return *pos;
}

void XmlInStream::startElement(const LString &name, const ExpatInStream::Attributes &attrs)
{
  //MB_DPRINTLN("*** element: %s", name);
  XmlTagHandler *pth = m_htab.get(name);
  if (pth==NULL) {
    MB_DPRINTLN("Warning: unknown element <%s>", name.c_str());
    return;
  }

  m_body = "";
  pth = pth->createObj();
  pth->setParent(this);
  pth->setupAttr(attrs);
  m_stack.push_front(pth);

  try {
    pth->start();
  }
  catch (const InvalidTagException &x) {
    LOG_DPRINTLN("XmlInStream> %s", x.getMsg().c_str());
    LString msg = LString::format("Malformed tag order in \"%s\" (%s)",
				  pth->getName(), x.getMsg().c_str());
    setError(msg);
  }
  catch (const qlib::LException &x) {
    LOG_DPRINTLN("XmlInStream> %s", x.getMsg().c_str());
    LString msg = LString::format("Error in start element \"%s\" (%s)",
				  pth->getName(), x.getMsg().c_str());
    setError(msg);
  }
}

void XmlInStream::endElement(const LString &name)
{
  // MB_DPRINTLN("    element: %s *****", name);
  if (m_stack.size()<=0) return;
  XmlTagHandler *pth = m_stack.front();
  if (!name.equals(pth->getName()))
    return; // ignore unknown tag

  try {
    pth->body(m_body);
  }
  catch (const InvalidTagException &x) {
    LOG_DPRINTLN("XmlInStream> %s", x.getMsg().c_str());
    LString msg = LString::format("Malformed tag order in \"%s\" (%s)",
				  pth->getName(), x.getMsg().c_str());
    setError(msg);
  }
  catch (const qlib::LException &x) {
    LOG_DPRINTLN("XmlInStream> %s", x.getMsg().c_str());
    LString msg = LString::format("Error in body of the element \"%s\" (%s)",
				  pth->getName(), x.getMsg().c_str());
    setError(msg);
  }

  try {
    pth->end();
  }
  catch (const InvalidTagException &x) {
    LOG_DPRINTLN("XmlInStream> %s", x.getMsg().c_str());
    LString msg = LString::format("Malformed tag order in \"%s\" (%s)",
				  pth->getName(), x.getMsg().c_str());
    setError(msg);
  }
  catch (const qlib::LException &x) {
    LOG_DPRINTLN("XmlInStream> %s", x.getMsg().c_str());
    LString msg = LString::format("Error in end element \"%s\" (%s)",
				  pth->getName(), x.getMsg().c_str());
    setError(msg);
  }

  // discard processed tag
  m_stack.pop_front();
  delete pth;
}

void XmlInStream::charData(const LString &sbuf)
{
  m_body += sbuf;
  // MB_DPRINTLN("char data: \"%s\"", sbuf.c_str());
}
