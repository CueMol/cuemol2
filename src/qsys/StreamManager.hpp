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
    /// Convert object to XML byte stream
    /// @param pObj object to be serialized to the stream
    /// @return XML byte stream
    qlib::LByteArrayPtr toXML(const qlib::LScrObjBasePtr &pObj);

    /// Convert renderer to XML byte stream
    /// @param pObj renderer to be serialized to the stream
    /// @param type_ovwr new renderer type (renderer type attr in the stream will be changed to type_ovwr)
    /// @return XML byte stream
    qlib::LByteArrayPtr toXML2(const qlib::LScrObjBasePtr &pObj,
                               const LString &type_ovwr);

    /// Convert renderers (in array) to XML byte stream
    /// @param objs renderer ptrs stored in variant array
    /// @return XML byte stream
    qlib::LByteArrayPtr arrayToXML(const qlib::LVarArray &objs) {
      return rendGrpToXML(objs, LString());
    }

    /// Convert renderer group (in array) to XML byte stream
    /// @param objs renderer ptrs stored in variant array
    /// @param grpname name ob the group stored in the stream
    /// @return XML byte stream
    qlib::LByteArrayPtr rendGrpToXML(const qlib::LVarArray &objs, const LString &grpname);

    /// Convert XML byte stream to object (obj, rend, etc.)
    /// @param pObj XML byte stream
    /// @param nSceneID ID of the scene that will be used to evaluate the XML attrubutes (i.e., color and selection)
    /// @return new object created from the stream (obj, rend, etc.)
    qlib::LScrObjBasePtr fromXML(const qlib::LByteArrayPtr &pObj,
                                 qlib::uid_t nSceneID);

    qlib::LVarArray rendArrayFromXML(const qlib::LByteArrayPtr &pbuf,
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

SINGLETON_BASE_DECL(qsys::StreamManager);

#endif
