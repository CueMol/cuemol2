// -*-Mode: C++;-*-
//
// Renderer group
//

#ifndef QSYS_RENDERER_GROUP_HPP_INCLUDE_
#define QSYS_RENDERER_GROUP_HPP_INCLUDE_

#include "qsys.hpp"

#include "Renderer.hpp"

namespace qsys {

  class QSYS_API RendGroup : public Renderer
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;
    
  private:
    /*
    typedef std::set<qlib::uid_t> uidset_t;

    /// Set of Renderer uid in this group
    uidset_t m_childRends;
    */

    /// collapsed state (for GUI impl)
    bool m_bUICollapsed;

  public:
    RendGroup();
    virtual ~RendGroup();
  
    //////////

  public:

    virtual const char *getTypeName() const;

    virtual bool isCompatibleObj(ObjectPtr pobj) const;

    virtual LString toString() const;

    /// Called just before this object is unloaded
    virtual void unloading();

    virtual qlib::Vector4D getCenter() const;
    virtual bool hasCenter() const;

    /// Display renderers in the scene to the frame buffer
    virtual void display(DisplayContext *pdc);

    void setUICollapsed(bool b) { m_bUICollapsed = b; }
    bool isUICollapsed() const { return m_bUICollapsed; }

  };

  MC_DECL_SCRSP(RendGroup);

} // namespace qsys

#endif // QSYS_RENDERER_GROUP_HPP_INCLUDE_

