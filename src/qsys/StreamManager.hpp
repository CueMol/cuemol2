//
// Stream manager singleton class
//
// $Id: StreamManager.hpp,v 1.17 2010/12/15 00:19:08 rishitani Exp $
//

#ifndef QSYS_STREAM_MANAGER_HPP_INCLUDE_
#define QSYS_STREAM_MANAGER_HPP_INCLUDE_

#include <qlib/IndexedTable.hpp>
#include <qlib/LScrObjects.hpp>
#include <qlib/MapTable.hpp>
#include <qlib/SingletonBase.hpp>

#include "InOutHandler.hpp"
#include "Object.hpp"
#include "qsys.hpp"
//#include <qlib/LByteArray.hpp>

using qlib::LString;

namespace qlib {
class InStream;
class LByteArray;
}  // namespace qlib

namespace qsys {

class ObjReader;
class IOThread;

struct StreamHandlerInfo
{
    LString nickname;
    LString descr;
    LString fext;
    qlib::LClass *pClass;
    // bool bWriter;
    int nCatID;
};

/// Stream manager singleton class.
class QSYS_API StreamManager : public qlib::LSingletonScrObject,
                               public qlib::SingletonBase<StreamManager>
{
    MC_SCRIPTABLE;

private:
    // for compatibility
    using ReaderInfo = StreamHandlerInfo;
    
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

    // int loadObjectAsync(const LString &ftype);
    int loadObjectAsync(qlib::LScrSp<ObjReader> pReader);
    void supplyDataAsync(int id, qlib::LScrSp<qlib::LByteArray> pbuf, int nlen);
    ObjectPtr waitLoadAsync(int id);

    /////////////////////////////////////////////////////
    // Object reader/writer management

    /// Register an object reader by C++-ABI name
    /// Class must be registered to ClassRegistry.
    template <class T>
    void registReader()
    {
        regIOHImpl(typeid(T).name());
    }

    /// Register an object writer by C++-ABI name
    /// Class must be registered to ClassRegistry.
    template <class T>
    void registWriter()
    {
        regIOHImpl(typeid(T).name());
    }

    /// Unregister an object reader.
    bool unregistReader(const LString &abiname, bool bWriter = false);

    bool isReaderRegistered(const LString &abiname);

    LString getReaderInfoJSON() const;
    LString getWriterInfoJSON() const;

    /// Get Stream handler info in JSON format (type 2)
    LString getInfoJSON2() const;

    /// Get Stream handler info
    const auto &getStreamHandlerInfo() const {
        return m_rdrinfotab;
    }

    InOutHandler *createHandlerPtr(const LString &nickname, int nCatID) const;

    ObjReader *createReaderPtr(const LString &nickname) const;

    InOutHandlerPtr createHandler(const LString &nickname, int nCatID) const
    {
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
    /// @param type_ovwr new renderer type (renderer type attr in the stream will be
    /// changed to type_ovwr)
    /// @return XML byte stream
    qlib::LByteArrayPtr toXML2(const qlib::LScrObjBasePtr &pObj,
                               const LString &type_ovwr);

    /// Convert renderers (in array) to XML byte stream
    /// @param objs renderer ptrs stored in variant array
    /// @return XML byte stream
    qlib::LByteArrayPtr arrayToXML(const qlib::LVarArray &objs)
    {
        return rendGrpToXML(objs, LString());
    }

    /// Convert renderer group (in array) to XML byte stream
    /// @param objs renderer ptrs stored in variant array
    /// @param grpname name ob the group stored in the stream
    /// @return XML byte stream
    qlib::LByteArrayPtr rendGrpToXML(const qlib::LVarArray &objs,
                                     const LString &grpname);

    /// Convert XML byte stream to object (obj, rend, etc.)
    /// @param pObj XML byte stream
    /// @param nSceneID ID of the scene that will be used to evaluate the XML attrubutes
    /// (i.e., color and selection)
    /// @return new object created from the stream (obj, rend, etc.)
    qlib::LScrObjBasePtr fromXML(const qlib::LByteArrayPtr &pObj, qlib::uid_t nSceneID);

    qlib::LVarArray rendArrayFromXML(const qlib::LByteArrayPtr &pbuf,
                                     qlib::uid_t nSceneID);

    /// For enum (ID) handling
    inline int getCAT_OBJREADER() const { return InOutHandler::IOH_CAT_OBJREADER; }
    inline int getCAT_OBJWRITER() const { return InOutHandler::IOH_CAT_OBJWRITER; }

    inline int getCAT_RENDTOFILE() const { return InOutHandler::IOH_CAT_RENDTOFILE; }
    inline int getCAT_SCEREADER() const { return InOutHandler::IOH_CAT_SCEREADER; }
    inline int getCAT_SCEWRITER() const { return InOutHandler::IOH_CAT_SCEWRITER; }
    
    inline int getCOMP_NONE() const { return InOutHandler::COMP_NONE; }
    inline int getCOMP_GZIP() const { return InOutHandler::COMP_GZIP; }
    inline int getCOMP_BZIP2() const { return InOutHandler::COMP_BZIP2; }
    inline int getCOMP_XZIP() const { return InOutHandler::COMP_XZIP; }

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

}  // namespace qsys

SINGLETON_BASE_DECL(qsys::StreamManager);

#endif
