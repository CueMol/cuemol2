// -*-Mode: C++;-*-
//
// OpenGL program object manager
//

#ifndef SYSDEP_PROG_OBJ_MANAGER_HPP_
#define SYSDEP_PROG_OBJ_MANAGER_HPP_

#include "sysdep.hpp"

#include <qlib/SingletonBase.hpp>

namespace sysdep {

  class OglProgramObject;

  ///
  ///  Program object manager
  ///
  class SYSDEP_API OglProgObjManager
       : public qlib::SingletonBase<OglProgObjManager>,
         public qsys::SceneEventListener
  {
  private:
    typedef std::map<LString, OglProgramObject *>  data_t;

    data_t m_data;

  public:
    OglProgObjManager() {}
    ~OglProgObjManager() {}

    OglProgramObject *createProgramObject(const LString &name, OglDisplayContext *pdc);
    OglProgramObject *getProgramObject(const LString &name, OglDisplayContext *pdc);
    
    virtual void sceneChanged(SceneEvent &ev);

  }

  
}

#endif

