// -*-Mode: C++;-*-
//
// XML parser for Object serialization/deserialization classes
//

#ifndef LOBJ_STREAM_XMLPARSER2_HPP_INCLUDED
#define LOBJ_STREAM_XMLPARSER2_HPP_INCLUDED

#include "ExpatInStream.hpp"

namespace qlib {

  //
  //  Create LDOM tree from XML stream using Expat library
  //
  class XMLParser2 : public ExpatInStream
  {
  public:
    LDom2Tree *m_pData;

  public:
    XMLParser2(InStream &r)
      : ExpatInStream(r), m_pData(NULL)
    {
    }
    
    ~XMLParser2() override {
    }
    
    void startElement(const LString &name, const ExpatInStream::Attributes &attrs) override
    {
      //MB_DPRINTLN("Start Element: tag= %s depth=%d",name.c_str(), getDepth());

      LDom2Node *pParNode = m_pData->current();
      LDom2Node *pNode;

      if (getDepth()==0) {
	pNode = pParNode;
      }
      else {
	pNode = pParNode->appendChild();
	m_pData->traverse();
      }

      pNode->setTagName(name);
    
      // process attributes
      ExpatInStream::Attributes::const_iterator iter = attrs.begin();
      ExpatInStream::Attributes::const_iterator iend = attrs.end();
      for (; iter!=iend; ++iter) {
	const LString &key = iter->first;
	const LString &val = iter->second;
	//MB_DPRINTLN("  element attr: key=%s value=%s", key.c_str(), val.c_str());
	if (key.equals("type")) {
	  // The "type" attribute is stored in both typeName prop and attribute array
	  pNode->setTypeName(val);
	  //continue;
	}
	if (key.equals("value")) {
	  pNode->setValue(val);
	  continue;
	}
	pNode->appendStrAttr(key, val);
      }

      m_pData->current()->clearContents();
    }
  
    void endElement(const LString &name) override {
      //MB_DPRINTLN("End Element: tag= %s depth=%d",name.c_str(), getDepth());
      if (getDepth()>0)
	m_pData->popNode();
    }
  
    void charData(const LString &sbuf) override {
      //MB_DPRINTLN("charData: [%s]", sbuf.c_str());
      //m_pData->current()->value += sbuf;
      m_pData->current()->appendContents(sbuf);
    }
  
  };

}

#endif

