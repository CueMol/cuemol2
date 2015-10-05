// -*-Mode: C++;-*-
//
//  CueMol native XML format top/par file reader class
//

#ifndef XML_TOPPAR_FILE_HPP
#define XML_TOPPAR_FILE_HPP

#include "molstr.hpp"

#include <qlib/LString.hpp>
#include <qlib/ExpatInStream.hpp>
#include <qlib/MapTable.hpp>

namespace molstr {

  using qlib::LString;
  using qlib::ExpatInStream;

  class ParamDB;
  class TopoDB;
  class ResiToppar;
  class ResiPatch;

  class XMLTopparFile;

  class XMLTopparParser : public qlib::ExpatInStream
  {
  public:
    std::list<LString> m_tagstk;
    XMLTopparFile *m_pReader;

  public:
    XMLTopparParser(InStream &r)
      : ExpatInStream(r)
    {
    }
    
    virtual ~XMLTopparParser()
    {
    }
    
    virtual void startElement(const LString &name, const ExpatInStream::Attributes &attrs);
  
    virtual void endElement(const LString &name);
  
    virtual void charData(const LString &sbuf)
    {
    }
  
    LString getParentTag(int nas = 1) const {
      std::list<LString>::const_iterator iter = m_tagstk.begin();
      std::list<LString>::const_iterator end = m_tagstk.end();
      if (iter==end) return LString();
      for (int i=0; i<nas && iter!=end; ++i)
	++iter;
      if (iter==end) return LString();
      return *iter;
    }

    bool tagMatch2(const char *tag1, const char *tag2) const;
    bool tagMatch3(const char *tag1, const char *tag2, const char *tag3) const;

  };

  /////////////////////////////////

  class XMLTopparFile
  {
  private:
    // building parameter dictionaly
    ParamDB *m_pParamDB;

    // building residue topology/param dictionaly
    TopoDB *m_pTopoDB;

    int m_nResids;
    int m_nLinks;
    
  public:
    typedef qlib::MapTable<LString> Attrs;

  public:
    XMLTopparFile();
    virtual ~XMLTopparFile();

    /// attach ParamDB obj to this I/O obj
    void attach(ParamDB *ppardic,
		TopoDB *ptpdic);

    /// detach ParamDB obj from this I/O obj
    void detach();

    //

    /// read XML format parameter file from "filename"
    bool read(const char *filename);

    void read(qlib::InStream &ins);

    //////////////////////
    // tag processing

  private:
    /// current processing residue
    ResiToppar *m_pCurResid;

    /// current processing patch
    ResiPatch *m_pCurPatch;

    /// curreent namespace
    LString m_curNS;

  public:
    void startTopResid(const Attrs &attrs);
    void endTopResid();

    /// resid-atoms tag processing (set namespace)
    void startTopAtoms(const Attrs &attrs);
    void endTopAtoms();

    /// resid-atom tag processing
    void startTopAtom(const Attrs &attrs);

    /// resid-bond tag processing
    void startTopBond(const Attrs &attrs);

    /// resid-synonym tag processing
    void startResAlias(const Attrs &attrs);

    /// atom-synonym tag processing
    void startAtomAlias(const Attrs &attrs);

    /// resid-ring tag processing
    void startResRing(const Attrs &attrs);

    void startResSidech(const Attrs &attrs, bool bSideCh);

    void startResProp(const Attrs &attrs);

    //

    void startLink(const Attrs &attrs);
    void endLink();

    void startLinkTarg(const Attrs &attrs);
    void startLinkBond(const Attrs &attrs);

    /// param-atom tag processing
    void startParAtom(const Attrs &attrs);

    static int convBondType(const LString &);

  };

}

#endif // XML_PAR_FILE_H__
