//
// AxCueMol2.h
//

#pragma once

#include "resource.h"

#include <qlib/LString.hpp>

//class CATLLogTracer;

///
/// Main singleton object for the CueMol2 ActiveX control
///  This class corresponds to XPCCueMol in the mozilla-xpc version,
///  (but has no COM interface.)
///
class CAxCueMol2
{
  friend class CAxCueMol2Module;

public:
  // CAtlDllT

  CAxCueMol2();
  virtual ~CAxCueMol2();

private:
  BOOL m_bInit;
  BOOL m_bInitFailed;
  BOOL m_bUIInitialized;

  HINSTANCE m_hModuleInst;

  qlib::LString m_strVersion, m_strBuild;

  /// Singleton instance of CueMol2 control
  static CAxCueMol2 *m_spInstance;

public:
  BOOL isInitialized() const {
    return m_bInit;
  }

  BOOL isInitFailed() const {
    return m_bInitFailed;
  }

  BOOL init();
  
  void fini();

  HINSTANCE getInstHandle() const {
    return m_hModuleInst;
  }

  /// Guess conf path from modulename
  qlib::LString guessConfPath() const;

  inline qlib::LString getVersion() const {
    return m_strVersion;
  }
  inline qlib::LString getBuild() const {
    return m_strBuild;
  }


  //
  // Static methods
  //

  static CAxCueMol2 *getInstance() {
    return m_spInstance;
  }

  static void initModule() {
    m_spInstance = new CAxCueMol2;
  }
  static void finiModule() {
    delete m_spInstance;
  }

};

