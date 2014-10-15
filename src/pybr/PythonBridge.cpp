// -*-Mode: C++;-*-
//
//  Python Interpreter Bridge
//

#include <Python.h>
#include <common.h>
#include <qlib/LDebug.hpp>

#include "pybr.hpp"
#include "PythonBridge.hpp"

using namespace pybr;

SINGLETON_BASE_IMPL(PythonBridge);

// automatic initialization by ClassRegistry
bool PythonBridge::initClass(qlib::LClass *pcls)
{
  return qlib::SingletonBase<PythonBridge>::init();
}

// automatic finalization by ClassRegistry (not used!!)
void PythonBridge::finiClass(qlib::LClass *pcls)
{
  qlib::SingletonBase<PythonBridge>::fini();
}

PythonBridge::PythonBridge()
{
}

PythonBridge::~PythonBridge()
{
}

void PythonBridge::runFile(const LString &path)
{
  FILE *fp = fopen(path.c_str(), "r");
  if (fp==NULL) {
    LString msg = LString::format("cannot open file: %s", path.c_str());
    // return false;
    MB_THROW(qlib::IOException, msg);
    return;
  }
  
  int res = PyRun_SimpleFile(fp, path.c_str());
  
  fclose(fp);
  
  if (res<0) {
    LString msg = LString::format("cannot run file: %s", path.c_str());
    MB_THROW(qlib::IOException, msg);
    return;
  }

}

void PythonBridge::runFile2(const LString &filename, qlib::uid_t scene_id, qlib::uid_t view_id)
{
  LString cmd;

  cmd = LString::format("scene_id = %d", scene_id);
  PyRun_SimpleString(cmd);

  cmd = LString::format("view_id = %d", view_id);
  PyRun_SimpleString(cmd);

  runFile(filename);
}


