// -*-Mode: C++;-*-
//
// Thrift RMI Manager
//

#ifndef THRIFT_MANAGER_HPP_INCLUDED
#define THRIFT_MANAGER_HPP_INCLUDED

#include "xrbr.hpp"

#include <qlib/LScrObjects.hpp>
#include <qlib/SingletonBase.hpp>
#include <qlib/mcutils.hpp>
#include <qlib/LThread.hpp>

#include "RMIMgr.hpp"

namespace xrbr {

  ///
  /// Thrift server thread class
  ///
  class XRBR_API ThriftThrImpl
    : public qlib::LThread
  {
    virtual void run();
  };

  ///
  ///  Singleton class for Thrift RMI Manager
  ///
  class XRBR_API ThriftMgr : public MgrImpl
  {

  public:
    
    ThriftMgr();
    virtual ~ThriftMgr();
    
    ///////////////////////

  private:
    ThriftThrImpl *m_pThr;
    
  public:
    /// Start new thrift server thread
    /// (be called by main thread)
    void start();

    ///////////////////////


  };

}

#endif

