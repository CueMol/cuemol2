// -*-Mode: C++;-*-
//
//  XML format Scene Reader
//

#ifndef QSYS_SCENE_XML_READER_HPP_INCLUDED
#define QSYS_SCENE_XML_READER_HPP_INCLUDED

#include "qsys.hpp"

#include "Scene.hpp"
#include "InOutHandler.hpp"

namespace qlib {
  class LDom2InStream;
}

namespace qsys {

  using qlib::LString;
  using qlib::LDom2Node;
  using qlib::LDataSrcContainer;

  class QSYS_API SceneXMLReader : public InOutHandler
  {
    MC_SCRIPTABLE;

  private:

    ScenePtr m_pClient;

    //////////

  public:
    SceneXMLReader();

    virtual ~SceneXMLReader();

    /// Get category ID
    virtual int getCatID() const;

    virtual void read();

    /// Read from bytearray
    // This method just return the resulting object, and not register to the attached scene.
    qlib::LScrSp<qlib::LScrObjBase> fromByteArray(const qlib::LScrSp<qlib::LByteArray> &pbuf);

    ////////////////////////////////////////
    // Client management

    /// attach to and lock the target object
    virtual void attach(ScenePtr pScene);

    /// detach from the target object
    virtual ScenePtr detach();

    ScenePtr getClient() const { return m_pClient; }

    /////////////////////////////////
    // Attributes

    /// Get name of the writer
    virtual const char *getName() const;

    /// Get file-type description
    virtual const char *getTypeDescr() const;

    /// Get file extension
    virtual const char *getFileExt() const;

  private:
    LString m_errmsg;

  public:
    /// Get error message
    LString getErrMsg() const {
      return m_errmsg;
    }

  private:

    void procDataSrcLoad(qlib::LDom2InStream &ois, LDom2Node *pNode);
    void procDataChunks(qlib::LDom2InStream &ois, LDom2Node *pNode);

    void loadObjFromSrc(LDataSrcContainer *pCnt, const LString &src, const LString &altsrc);

    //////////

/*
    std::map<LString, LDataSrcContainer *> m_chunkmap;
    std::map<LString, LString> m_typemap;

    void clearChunkMap()
    {
      m_chunkmap.clear();
      m_typemap.clear();
    }

    void addChunkMap(const LString &src, LDataSrcContainer *pCnt, const LString &type) {
      m_chunkmap.insert(std::pair<LString, LDataSrcContainer *>(src, pCnt));
      m_typemap.insert(std::pair<LString, LString>(src, type));
    }

    LDataSrcContainer *findChunkObj(const LString &chunkid) const
    {
      std::map<LString, LDataSrcContainer *>::const_iterator ci = m_chunkmap.find(chunkid);
      if (ci==m_chunkmap.end()) {
        LString msg = LString::format("Chunk (ID: \"%s\") is not found", chunkid.c_str());
        LOG_DPRINTLN("SceneXMLRead> %s", msg.c_str());
        MB_THROW(qlib::IOException, msg);
      }
      return ci->second;
    }

    LString findChunkType(const LString &chunkid) const
    {
      std::map<LString, LString>::const_iterator ci = m_typemap.find(chunkid);
      if (ci==m_typemap.end()) {
        LString msg = LString::format("Chunk type (ID: \"%s\") is not found", chunkid.c_str());
        LOG_DPRINTLN("SceneXMLRead> %s", msg.c_str());
        MB_THROW(qlib::IOException, msg);
      }
      return ci->second;
    }
*/
    
  };

  ////////////////////////////////////////////////////////////


}

#endif

