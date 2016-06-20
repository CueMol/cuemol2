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
  class LObjInStream3;
}

namespace qsys {

  using qlib::LString;
  using qlib::LDom2Node;
  using qlib::LDataSrcContainer;

  class QSYS_API SceneXMLReader : public InOutHandler
  {
    MC_SCRIPTABLE;

    typedef InOutHandler super_t;

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
    qlib::LScrSp<qlib::LScrObjBase> fromByteArray(const qlib::LByteArrayPtr &pbuf);

    void rendArrayFromByteArray(const qlib::LByteArrayPtr &pbuf, std::list<RendererPtr> &rends, LString &grpName);

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
    int m_nBufSz;

  public:
    /// Get buffer size
    int getBufSize() const {
      return m_nBufSz;
    }
    void setBufSize(int n) {
      m_nBufSz = n;
    }

  private:

    void procDataSrcLoad(qlib::LObjInStream3 &ois, LDom2Node *pNode);
    void procDataChunks(qlib::LObjInStream3 &ois, LDom2Node *pNode);

    void procDataSrcLoad(qlib::LDom2InStream &ois, LDom2Node *pNode);
    void procDataChunks(qlib::LDom2InStream &ois, LDom2Node *pNode);

    void loadObjFromSrc(LDataSrcContainer *pCnt, const LString &src, const LString &altsrc);


  };

  ////////////////////////////////////////////////////////////


}

#endif

