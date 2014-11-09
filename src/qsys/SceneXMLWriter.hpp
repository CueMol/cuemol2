// -*-Mode: C++;-*-
//
//  XML format Scene writer
//

#ifndef QSYS_SCENE_XML_WRITER_HPP_INCLUDED
#define QSYS_SCENE_XML_WRITER_HPP_INCLUDED

#include "qsys.hpp"

#include "Scene.hpp"
#include "InOutHandler.hpp"
#include <qlib/LByteArray.hpp>

namespace qsys {

  using qlib::LString;

  /// XML-format Scene Writer
  class QSYS_API SceneXMLWriter : public InOutHandler
  {
    MC_SCRIPTABLE;

  private:

    ScenePtr m_pClient;

    bool m_bForceEmbedAll;

    int m_nCompMode;

    bool m_bBase64;

    LString m_strVer;

    //////////

  public:
    SceneXMLWriter();

    virtual ~SceneXMLWriter();

    /// Get category ID
    virtual int getCatID() const;

    virtual void write();

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

    /////////////
    // Compression setting

    // compression type
    virtual int getCompressMode() const;
    virtual void setCompressMode(int);

    // Base64 encoding flag
    virtual bool getBase64Flag() const;
    virtual void setBase64Flag(bool);

    // Embed-all flag
    bool getEmbedAll() const {
      return m_bForceEmbedAll;
    }
    void setEmbedAll(bool b) {
      m_bForceEmbedAll = b;
    }

    // version
    LString getVersion() const {
      return m_strVer;
    }
    void setVersion(const LString &s) {
      m_strVer = s;
    }

    void setDefaultOpts(ScenePtr pScene);

    /// Convert object (rend, obj, cam) to bytearray
    qlib::LByteArrayPtr toByteArray(const qlib::LScrSp<qlib::LScrObjBase> &pSObj)
    {
      return toByteArray(pSObj, LString());
    }

    /// Convert object (rend, obj, cam) to bytearray (with type overwrite option)
    /// type overwrite option is valid for renderers
    qlib::LByteArrayPtr toByteArray(const qlib::LScrSp<qlib::LScrObjBase> &pSObj,
                                    const LString &type_ovwr);

    qlib::LByteArrayPtr
      SceneXMLWriter::rendArrayToByteArray(const std::list<RendererPtr> &pArray);

  private:
    void procDataChunks(qlib::LDom2OutStream &oos, qlib::LDom2Node *pNode);

  };
}

#endif

