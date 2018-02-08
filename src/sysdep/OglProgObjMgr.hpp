// -*-Mode: C++;-*-
//
// OpenGL program object manager
//

#ifndef SYSDEP_PROG_OBJ_MANAGER_HPP_
#define SYSDEP_PROG_OBJ_MANAGER_HPP_

#include "sysdep.hpp"

#include <qlib/SingletonBase.hpp>
#include <qsys/SceneEvent.hpp>

namespace sysdep {

  using qlib::LString;
  class OglProgramObject;
  class OglDisplayContext;

  ///
  ///  Program object manager
  ///
  class SYSDEP_API OglProgObjMgr
       : public qlib::SingletonBase<OglProgObjMgr>,
         public qsys::SceneEventListener
  {
  private:
    typedef std::map<LString, OglProgramObject *>  data_t;

    data_t m_data;

  public:
    OglProgObjMgr() {}
    ~OglProgObjMgr() {}

    OglProgramObject *createProgramObject(const LString &name, OglDisplayContext *pdc);
    OglProgramObject *getProgramObject(const LString &name, OglDisplayContext *pdc);
    
    virtual void sceneChanged(qsys::SceneEvent &ev);

  };

  
}

#endif

