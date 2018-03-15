// -*-Mode: C++;-*-
//
//  Python Interpreter Bridge
//

#include <common.h>
#include <qlib/LDebug.hpp>
#include <qlib/LChar.hpp>

#include <Python.h>

#include "pybr.hpp"
#include "PythonBridge.hpp"

using namespace pybr;
using qlib::LChar;

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
  
  int i;
  int argc = m_cmdargs.size();
  wchar_t **argv = new wchar_t *[argc];
  for (i=0; i<argc; ++i) {
    //argv[i] = LChar::dup(m_cmdargs[i]);
    argv[i] = Py_DecodeLocale(m_cmdargs[i].c_str(), NULL);
  }
  PySys_SetArgvEx(argc, argv, 0);
  for (i=0; i<argc; ++i) {
    PyMem_RawFree(argv[i]);
  }
  delete [] argv;

  int res = PyRun_SimpleFile(fp, path.c_str());
  
  fclose(fp);
  
  if (res<0) {
    LString msg = LString::format("cannot run file: %s", path.c_str());
    MB_THROW(qlib::IOException, msg);
    return;
  }

}

void PythonBridge::runFile3(const LString &filename, qlib::uid_t scene_id, qlib::uid_t view_id, const LString &args)
{
  LString cmd;

  // WARNING: args must be properly formatted!
  cmd = LString("arguments = ") + args;
  PyRun_SimpleString(cmd);

  cmd = LString::format("scene_id = %d", scene_id);
  PyRun_SimpleString(cmd);

  cmd = LString::format("view_id = %d", view_id);
  PyRun_SimpleString(cmd);

  runFile(filename);
}

void PythonBridge::runFile2(const LString &filename, qlib::uid_t scene_id, qlib::uid_t view_id)
{
  LString argv = "None";

  runFile3(filename, scene_id, view_id, argv);
}

void PythonBridge::runString(const LString &src)
{
  PyRun_SimpleString(src.c_str());
}

void PythonBridge::runInteractiveShell()
{
  //runString("import code\n"
  //"import readline\n"
  //"code.interact()\n");
  PyImport_ImportModule("readline");
  PyRun_InteractiveLoop(stdin, "");
}


