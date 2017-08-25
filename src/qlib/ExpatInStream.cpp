// -*-Mode: C++;-*-
//
// XML input stream using expat library
//
// $Id: ExpatInStream.cpp,v 1.3 2009/12/13 10:35:51 rishitani Exp $

#include <common.h>

#include "ExpatInStream.hpp"
#include "FileStream.hpp"
#include "LChar.hpp"

#include <boost/filesystem/operations.hpp>
#include <boost/filesystem/path.hpp>

using namespace qlib;
namespace fs = boost::filesystem;

ExpatInStream::ExpatInStream(InStream &r)
     : super_t(r)
{
  //m_parser =  XML_ParserCreate(NULL);
  m_parser =  XML_ParserCreate("UTF-8");
  XML_SetUserData(m_parser, this);
  XML_SetElementHandler(m_parser,
                        ExpatInStream::sStartElem,
                        ExpatInStream::sEndElem);
  
  XML_SetCharacterDataHandler(m_parser,
			      sCharData);

  XML_SetExternalEntityRefHandler(m_parser, sExtEntity);
  
  XML_SetParamEntityParsing(m_parser, XML_PARAM_ENTITY_PARSING_UNLESS_STANDALONE);

  XML_SetProcessingInstructionHandler(m_parser, sProcInst);
  XML_SetCommentHandler(m_parser, sComment);
  XML_SetCdataSectionHandler(m_parser, sStartCdata, sEndCdata);

  m_nDepth = 0;
  m_bError = false;
}

ExpatInStream::~ExpatInStream()
{
  XML_ParserFree(m_parser);
}

void ExpatInStream::setError(const LString &msg)
{
  m_errorMsg = msg;
  m_errorMsg.append(LString::format(" at line %d",
                                    XML_GetCurrentLineNumber(m_parser)));
  MB_DPRINTLN(m_errorMsg);
  m_bError = true;
}

int ExpatInStream::getLineNo()
{
  return XML_GetCurrentLineNumber(getParser());
}

void ExpatInStream::setBaseURI(const char *uri)
{
  XML_SetBase(getParser(), uri);
}


void ExpatInStream::parse()
{
  // check base URI

  LString s = getURI();
  MB_DPRINTLN("ExpatInStream getURI: <%s>", s.c_str());

  fs::path srcpath(s.c_str());
#if (BOOST_FILESYSTEM_VERSION==2)
  LString base_dir = srcpath.parent_path().directory_string();
#else
  LString base_dir = srcpath.parent_path().string();
#endif

  if (!base_dir.isEmpty())
    setBaseURI(base_dir);

  //detail::AbstFIOImpl *pimpl =
  //dynamic_cast<detail::AbstFIOImpl *>(getImpl().get());
  //if (pimpl!=NULL) {
  //MB_DPRINTLN("File: base URI %s", pimpl->getDirName().c_str());
  //setBaseURI((pimpl->getDirName())+LString(MB_PATH_SEPARATOR));
  //}

  char buf[bufsize];
  bool done=false;
  do {
    int len = super_t::read(buf, 0, sizeof(buf));
    done = len < sizeof(buf);
    if (XML_Parse(getParser(), buf, len, done) == XML_STATUS_ERROR) {
      LString msg =
        LString::format("%s at line %d\n",
                        XML_ErrorString(XML_GetErrorCode(getParser())),
                        getLineNo());
      MB_DPRINTLN("ExpatInStream> error: %s", msg.c_str());
      MB_THROW(qlib::IOException, msg);
    }
    else if (getError()) {
      MB_DPRINTLN("ExpatInStream> error: %s", getErrorMsg().c_str());
      MB_THROW(qlib::IOException, getErrorMsg());
    }
  } while (!done);
}

/**
   process external entity (local file only)
*/
void ExpatInStream::procExtEntity(const char *fname, const char *szctxt)
{
  // XML_Parser expar = XML_ExternalEntityParserCreate(m_parser, szctxt, NULL);
  XML_Parser expar = XML_ExternalEntityParserCreate(m_parser, szctxt, "UTF-8");

  try {

    FileInStream fis;
    fis.open(fname);

    char buf[bufsize];
    bool done=false;
    do {
      int len = fis.read(buf, 0, sizeof(buf));
      done = len < sizeof(buf);
      if (XML_Parse(expar, buf, len, done) == XML_STATUS_ERROR) {
	LString msg =
	  LString::format("%s at line %d\n",
			  XML_ErrorString(XML_GetErrorCode(expar)),
			  XML_GetCurrentLineNumber(expar));
	MB_THROW(qlib::IOException, msg);
      }
      else if (getError()) {
	MB_THROW(qlib::IOException, getErrorMsg());
      }
    } while (!done);

  }
  catch (...) {
    XML_ParserFree(expar);
    throw;
  }

  XML_ParserFree(expar);
}

void ExpatInStream::charData(const LString &sbuf)
{
}

void ExpatInStream::comment(const LString &sbuf)
{
}

void ExpatInStream::startCdata()
{
}

void ExpatInStream::endCdata()
{
}

///////////////////////////////////////////////////////////////////////

//static
void ExpatInStream::sStartElem(void *userData, const char *name, const char **attr)
{
  int i;
  LString sname(name);
  MB_ASSERT(sname.length()==strlen(name));
  Attributes attrls;

  for (i=0; attr[i]; i+=2) {
    LString key(attr[i]);
    LString val(attr[i+1]);
    attrls.push_back(Attributes::value_type(key, val));
  }
  
  ExpatInStream *pReader = (ExpatInStream *)userData;
  if (pReader->getError()) return;

  pReader->startElement(sname, attrls);
  pReader->incrDepth();
}

//static
void ExpatInStream::sEndElem(void *userData, const char *name)
{
  ExpatInStream *pReader = (ExpatInStream *)userData;
  if (pReader->getError()) return;
  pReader->decrDepth();

  LString sname(name);
  MB_ASSERT(sname.length()==strlen(name));
  pReader->endElement(sname);
}

//static
void ExpatInStream::sCharData(void *userData,
                              const XML_Char *s,
                              int len)
{
  LString sbuf(s, len);

  ExpatInStream *pReader = (ExpatInStream *)userData;
  if (pReader->getError()) return;
  pReader->charData(sbuf);
}

//static
int ExpatInStream::sExtEntity(XML_Parser parser,
			      const XML_Char *context,
			      const XML_Char *base,
			      const XML_Char *systemId,
			      const XML_Char *publicId)
{
  //MB_DPRINTLN("External Entity:\ncontext <%s>", context);
  //MB_DPRINTLN("base <%s>", base);
  //MB_DPRINTLN("sysID <%s>", systemId);
  //MB_DPRINTLN("pubID <%s>", publicId);

  //if (systemId==NULL || base==NULL)
  if (systemId==NULL || LChar::length(systemId)==0)
    return 1;

  ExpatInStream *pReader = (ExpatInStream *)XML_GetUserData(parser);

  LString uri;
  if (base!=NULL)
    uri = LString(base);
  uri += systemId;

  //MB_DPRINTLN("load file from url:<%s>", uri.c_str());

  try {
    pReader->procExtEntity(systemId, context);
  }
  catch (qlib::LException &e) {
    LOG_DPRINTLN("Error in handling external entity %s: \"%s\"",
		 systemId, e.getMsg().c_str());
    return 0;
  }

  return 1;
}


/** Processing Instruction */
void ExpatInStream::sProcInst(void *userData, const XML_Char *target,
			      const XML_Char *data)
{
  MB_DPRINTLN("Processing Instruction");
  MB_DPRINTLN("  target=<%s>", target);
  MB_DPRINTLN("  data=<%s>", data);
}

/** Comment handling */
void ExpatInStream::sComment(void *userData, const XML_Char *data)
{
  MB_DPRINTLN("Comment");
  MB_DPRINTLN("  data=<!--%s-->", data);

  LString sbuf(data);
  ExpatInStream *pReader = (ExpatInStream *)userData;
  if (pReader->getError()) return;
  pReader->comment(sbuf);
}

/** CDATA section handling */
void ExpatInStream::sStartCdata(void *userData)
{
  MB_DPRINTLN("StartCDATA(<![CDATA[)");
  ExpatInStream *pReader = (ExpatInStream *)userData;
  if (pReader->getError()) return;
  pReader->startCdata();
}

/** CDATA section handling */
void ExpatInStream::sEndCdata(void *userData)
{
  MB_DPRINTLN("EndCDATA(]]>)");
  ExpatInStream *pReader = (ExpatInStream *)userData;
  if (pReader->getError()) return;
  pReader->endCdata();
}

