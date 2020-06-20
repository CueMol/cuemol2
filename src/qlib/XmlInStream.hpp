// -*-Mode: C++;-*-
//
// JSP's taglib-like XML input stream class
//
// $Id: XmlInStream.hpp,v 1.1 2008/01/02 13:40:16 rishitani Exp $

#ifndef XML_IN_STREAM_HPP_INCLUDED_
#define XML_IN_STREAM_HPP_INCLUDED_

#include "qlib.hpp"
#include "MapTable.hpp"
#include "ExpatInStream.hpp"
#include "HashTable.hpp"

namespace qlib {

  class XmlInStream;

  MB_DECL_EXCPT_CLASS(QLIB_API, InvalidTagException, RuntimeException);
  MB_DECL_EXCPT_CLASS(QLIB_API, InvalidAttrException, RuntimeException);

  /**
     superclass of Tag handler class
  */
  class QLIB_API XmlTagHandler
  {
  public:
    typedef HashTable<LString> XmlAttr;

  protected:
    XmlAttr m_attr;
    XmlInStream *m_pStream;

  public:
    virtual ~XmlTagHandler();

    /** setup tag's attributes (called by framework) */
    void setupAttr(const ExpatInStream::Attributes &attrs);

    /** set parent stream (called by freamwork) */
    void setParent(XmlInStream *parent) {
      m_pStream = parent;
    }

    bool hasAttr(const LString &name) const {
      return m_attr.containsKey(name);
    }

    LString getAttr(const LString &name) const {
      return m_attr.get(name);
    }

    LString getAttr_throw(const LString &name) const {
      if (!m_attr.containsKey(name)) {
	MB_THROW(InvalidAttrException,
		 LString::format("Attribute \"%s\" is not found", name.c_str()));
      }
      return m_attr.get(name);
    }

    /** get integer attribute */
    int getIntAttr(const LString &name) const;
    bool getIntAttr(const LString &name, int &) const;

    /** get double real attribute */
    double getDoubleAttr(const LString &name) const;
    bool getDoubleAttr(const LString &name, double &) const;

    /** check the parent tag */
    template <class _Class> bool isParentTag(int n=1) const;

    /** check the parent tag */
    template <class _Class>
    void checkChildOf(int n=1) const {
      if (!isParentTag<_Class>(n)) {
	MB_THROW(InvalidTagException, "Invalid tag nesting");
      }
    }

    bool isRootTag() const;
      
    void checkRoot() const {
      if (!isRootTag()) {
	MB_THROW(InvalidTagException, "Invalid tag nesting");
      }
    }

    /** get the parent tag object */
    template <class _Class> _Class *getParentTag(int n=1) const noexcept;

    /** get the parent tag object (throws exception) */
    template <class _Class> _Class *getParentTag_throw(int n=1) const {
      _Class *pp = getParentTag<_Class>(n);
      if (pp==NULL) {
	MB_THROW(InvalidTagException, "Invalid tag nesting");
      }
      return pp;
    }

    void throwTagError() const {
      MB_THROW(InvalidTagException, "");
    }

    int getLineNo() const;

    ////////////////////////////////////////

    /** get tag's name to handle */
    virtual const char *getName() const =0;
    /** handle start of tag */
    virtual void start() =0;
    /** handle end of tag */
    virtual void end() {}
    /** handle body of tag */
    virtual void body(const LString &cont) {}

    /** create copy of handler */
    virtual XmlTagHandler *createObj() const =0;

  };

  ///////////////////////////////////////////////////////////////////
    
  /**
     JSP's taglib-like XML input stream class
  */
  class QLIB_API XmlInStream : public qlib::ExpatInStream
  {
  private:
    typedef qlib::HashPtrTable<XmlTagHandler> HndlrTab;
    HndlrTab m_htab;

    std::list<XmlTagHandler *> m_stack;
    LString m_body;

  public:
    XmlInStream(InStream &r)
      : ExpatInStream(r)
    {
    }
    
    virtual ~XmlInStream();
    
    bool registerTag(XmlTagHandler *pth, bool bForce=false);
    
    XmlTagHandler *getParentTag(int n) const noexcept;
    
    ////////////////////////////////////////
    
    virtual void startElement(const LString &name, const ExpatInStream::Attributes &attrs);

    virtual void endElement(const LString &name);

    virtual void charData(const LString &sbuf);
  };

  ///////////////////////////////////////////////////////////////////

  template <class _Class>
  _Class *XmlTagHandler::getParentTag(int n) const noexcept
  {
    XmlTagHandler *pp = m_pStream->getParentTag(n);
    _Class *p = dynamic_cast<_Class *>(pp);
    /*if (p==NULL) {
      MB_DPRINTLN("throwing InvalidTagException (%s)...",
		  pp->getName());
      MB_THROW(InvalidTagException, "");
      }*/
    return p;
  }

  template <class _Class>
  bool XmlTagHandler::isParentTag(int n /*=1*/) const
  {
    XmlTagHandler *pp = m_pStream->getParentTag(n);
    _Class *p = dynamic_cast<_Class *>(pp);
    return (p!=NULL);
  }

}

#endif // XML_IN_STREAM_HPP_INCLUDED_
