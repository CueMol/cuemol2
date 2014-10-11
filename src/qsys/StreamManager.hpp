//
// Stream manager singleton class
//
// $Id: StreamManager.hpp,v 1.17 2010/12/15 00:19:08 rishitani Exp $
//

#ifndef QSYS_STREAM_MANAGER_HPP_INCLUDE_
#define QSYS_STREAM_MANAGER_HPP_INCLUDE_

#include "qsys.hpp"
#include "Object.hpp"
#include "InOutHandler.hpp"

#include <qlib/LScrObjects.hpp>
#include <qlib/SingletonBase.hpp>
#include <qlib/MapTable.hpp>
#include <qlib/IndexedTable.hpp>
//#include <qlib/LByteArray.hpp>

using qlib::LString;

namespace qlib {
  class InStream;
  class LByteArray;
}

namespace qsys {

  class ObjReader;
  class IOThread;

  /// Stream manager singleton class.
  /// This service will be indirectly used from UI/Script,
  /// so this class is not exposed to the scriptable interface.
  ///
  class QSYS_API StreamManager : public qlib::LSingletonScrObject,
				 public qlib::SingletonBase<StreamManager>
  {
    MC_SCRIPTABLE;

  private:
    struct ReaderInfo {
      LString nickname;
      LString descr;
      LString fext;
      qlib::LClass *pClass;
      // bool bWriter;
      int nCatID;
    };

    typedef qlib::MapTable<ReaderInfo> data_t;

    data_t m_rdrinfotab;

    //////////

    typedef qlib::IndexedTable<IOThread> IOThreadTable;

    IOThreadTable m_iotab;

  public:
    StreamManager();

    virtual ~StreamManager();

    // /// Create new object and read data from the stream.
    // ObjectPtr loadObject(const LString &url, const LString &ftype);

    //int loadObjectAsync(const LString &ftype);
    int loadObjectAsync(qlib::LScrSp<ObjReader> pReader);
    void supplyDataAsync(int id, qlib::LScrSp<qlib::LByteArray> pbuf, int nlen);
    ObjectPtr waitLoadAsync(int id);

    // /// Read data from the stream to the existing object.
    // /// (used in scene loader)
    // bool readObjectFrom(ObjectPtr obj, const LString &url, const LString &ftype);
    // bool readObjectFrom(ObjectPtr obj, qlib::InStream &ins, const LString &ftype);

    /////////////////////////////////////////////////////
    // Object reader/writer management

    /// Register an object reader by C++-ABI name
    /// Class must be registered to ClassRegistry.
    template <class T>
    void registReader() {
      regIOHImpl(typeid(T).name());
    }

    /// Register an object writer by C++-ABI name
    /// Class must be registered to ClassRegistry.
    template <class T>
    void registWriter() {
      regIOHImpl(typeid(T).name());
    }

    /// Unregister an object reader.
    bool unregistReader(const LString &abiname, bool bWriter = false);

    bool isReaderRegistered(const LString &abiname);

    LString getReaderInfoJSON() const;
    LString getWriterInfoJSON() const;

    /// Get IO handler info in JSON format (type 2)
    LString getInfoJSON2() const;

    // /// Get Renderer names for objects to be created by the reader. (for Open_File dialog)
    // LString getInitRendererNames(const LString &rdrnm) const;

    InOutHandler *createHandlerPtr(const LString &nickname, int nCatID) const;

    ObjReader *createReaderPtr(const LString &nickname) const;

    InOutHandlerPtr createHandler(const LString &nickname, int nCatID) const {
      return InOutHandlerPtr(createHandlerPtr(nickname, nCatID));
    }

    /// Returns comma separated list of compatible ObjWriter names for the object
    LString findCompatibleWriterNamesForObj(qlib::uid_t objid);

  private:
    LString getIOHInfoJSONImpl(int aCatID) const;

    /// Register an object reader/writer by C++-ABI name (implementation)
    void regIOHImpl(const LString &abiname);

    //////////

  public:
    qlib::LScrSp<qlib::LByteArray> toXML(const qlib::LScrSp<qlib::LScrObjBase> &pObj);
    qlib::LScrSp<qlib::LByteArray> toXML2(const qlib::LScrSp<qlib::LScrObjBase> &pObj,
                                          const LString &type_ovwr);
    qlib::LScrSp<qlib::LScrObjBase> fromXML(const qlib::LScrSp<qlib::LByteArray> &pObj,
                                            qlib::uid_t nSceneID);

  public:
  
    //////////
    // Initializer/finalizer (called from qlib-appfw)

    static bool initClass(qlib::LClass *pcls)
    {
      return qlib::SingletonBase<StreamManager>::init();
    }
    
    static void finiClass(qlib::LClass *pcls)
    {
      qlib::SingletonBase<StreamManager>::fini();
    }

  };

}

#endif

