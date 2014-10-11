// -*-Mode: C++;-*-
//
// XML input stream using expat library
//
// $Id: ExpatInStream.hpp,v 1.3 2009/05/04 18:01:21 rishitani Exp $

#ifndef __EXPAT_IN_STREAM_H__
#define __EXPAT_IN_STREAM_H__

#include "qlib.hpp"

#define XML_STATIC
#include <expat/expat.h>

#include "FormatStream.hpp"
#include "LExceptions.hpp"
#include "LChar.hpp"

namespace qlib {

  class QLIB_API ExpatInStream : public FormatInStream
  {
  public:
    typedef FormatInStream super_t;
    
  private:
    enum { bufsize = 2048 };
    XML_Parser m_parser;
    bool m_bError;
    LString m_errorMsg;
    int m_nDepth;

    ExpatInStream() : super_t() {}
    explicit ExpatInStream(ExpatInStream &r) {}

  public:
    typedef std::list<std::pair<LString, LString> > Attributes;

    explicit ExpatInStream(InStream &r);

    virtual ~ExpatInStream();

    XML_Parser getParser() { return m_parser; }

    bool getError() const { return m_bError; }

    void setError(const LString &msg);

    const LString &getErrorMsg() const { return m_errorMsg; }

    void parse();

    int getLineNo();

    void incrDepth() { ++m_nDepth; }
    void decrDepth() { --m_nDepth; }
    int getDepth() const { return m_nDepth; }

    virtual void startElement(const LString &name, const Attributes &attrs) =0;
    virtual void endElement(const LString &name) =0;
    virtual void charData(const LString &sbuf);
    virtual void comment(const LString &sbuf);

    virtual void startCdata();
    virtual void endCdata();

    void setBaseURI(const char *uri);
    void procExtEntity(const char *fname, const char *szctxt);

  private:

    static void sStartElem(void *userData, const char *name, const char **attr);
    static void sEndElem(void *userData, const char *name);
    static void sCharData(void *,const XML_Char *,int);
    
    /**
       External entity (i.e. include) handling
    */
    static int sExtEntity(XML_Parser parser,
			  const XML_Char *context,
			  const XML_Char *base,
			  const XML_Char *systemId,
			  const XML_Char *publicId);

    /** Processing Instruction */
    static void sProcInst(void *userData,
			  const XML_Char *target,
			  const XML_Char *data);

    /** Comment handling */
    static void sComment(void *userData,
			 const XML_Char *data);

    /** CDATA section handling */
    static void sStartCdata(void *userData);

    /** CDATA section handling */
    static void sEndCdata(void *userData);

  };

}


#endif // __EXPAT_IN_STREAM_H__
