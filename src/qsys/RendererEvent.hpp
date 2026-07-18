// -*-Mode: C++;-*-
//
// Renderer related events
//

#ifndef QSYS_RENDERER_EVENT_HPP_
#define QSYS_RENDERER_EVENT_HPP_

#include "qsys.hpp"
#include "QsysEvent.hpp"
#include <qlib/EventCaster.hpp>

namespace qsys {

using qlib::LString;

class QSYS_API RendererEvent : public QsysEvent
{
private:
  
public:
  enum {
    RNE_CHANGED = 2,
    RNE_PROPCHG = 3
  };
  
  //////////
  
public:
  RendererEvent()
       : QsysEvent()
    {}

  RendererEvent(const RendererEvent &ev)
       : QsysEvent(ev)
    {}

  ~RendererEvent() override;

  LCloneableObject *clone() const override;

  //////////

  LString getJSON() const override;
  bool getCategory(LString &category, int &nSrcType, int &nEvtType) const override;

};

/////////////////////////////

/// Interface of the RendererEvent listener
class QSYS_API RendererEventListener
{
public:
  virtual void rendererChanged(RendererEvent &) =0;
};

/////////////////////////////

class RendererEventCaster : public qlib::LEventCaster<RendererEvent, RendererEventListener>
{
public:
  void execute(RendererEvent &ev, RendererEventListener *p) override
  {
    p->rendererChanged(ev);
  }
};

} // namespace qsys

#endif

