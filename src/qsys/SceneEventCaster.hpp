// -*-Mode: C++;-*-
//
// Object related events
//
// $Id: SceneEventCaster.hpp,v 1.1 2009/04/05 15:23:28 rishitani Exp $

#ifndef QSYS_SCENE_EVENT_CASTER_HPP_
#define QSYS_SCENE_EVENT_CASTER_HPP_

#include "qsys.hpp"
#include "SceneEvent.hpp"

namespace qsys {

  class SceneEventCaster : public qlib::LEventCaster<SceneEvent, SceneEventListener>
  {
  public:
    virtual void execute(SceneEvent &ev, SceneEventListener *p)
    {
      p->sceneChanged(ev);
    }
  };
  
}

#endif

