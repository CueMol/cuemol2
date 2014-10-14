// -*-Mode: C++;-*-
//
//  Python Interpreter Bridge
//

#include "pybr.hpp"

#include <qlib/LScrObjects.hpp>
#include <qlib/SingletonBase.hpp>
#include <qlib/mcutils.hpp>

#ifndef PYBR_PYTHON_BRIDGE_HPP
#define PYBR_PYTHON_BRIDGE_HPP

namespace pybr {

  using qlib::LString;

  ///
  /// Process manager singleton class
  /// 
  class PYBR_API PythonBridge
    : public qlib::LSingletonScrObject,
      public qlib::SingletonBase<PythonBridge>
  {
    MC_SCRIPTABLE;

  public:
    PythonBridge();
    virtual ~PythonBridge();

    void runFile(const LString &filename);
    void runFile2(const LString &filename, qlib::uid_t scene_id, qlib::uid_t view_id);

  public:
    // these methods are called by ClassReg (ignore)
    static bool initClass(qlib::LClass *);
    static void finiClass(qlib::LClass *);

  };


}

#endif

