//
// Renderer factory singleton class
//
// $Id: RendererFactory.hpp,v 1.2 2009/02/25 12:27:43 rishitani Exp $
//

#ifndef QSYS_RENDERER_FACTORY_HPP_INCLUDE_
#define QSYS_RENDERER_FACTORY_HPP_INCLUDE_

#include "qsys.hpp"
// #include "Renderer.hpp"

#include <qlib/LString.hpp>
#include <qlib/mcutils.hpp>
#include <qlib/SingletonBase.hpp>
#include <qlib/MapTable.hpp>

using qlib::LString;

namespace qsys {

  class Renderer;

  /**
     Renderer factory singleton class
  */

  class QSYS_API RendererFactory :
    public qlib::SingletonBase<RendererFactory>
  {
  private:
    typedef qlib::SingletonBase<RendererFactory> super_t;

    typedef qlib::MapTable<RendererPtr> rendtab_t;

    rendtab_t m_rendtab;

  public:
    RendererFactory();

    virtual ~RendererFactory();

    /////////////////////////////////////////////////////

    /**
       Register a renderer reader by C++-ABI name
       Class must be registered to ClassRegistry.
    */
    void regist(const LString &abiname);

    /**
       Unregister an object reader.
    */
    bool unregist(const LString &abiname);

    bool isRegistered(const LString &abiname);

    RendererPtr create(const LString &nickname);

    int searchCompatibleRenderers(ObjectPtr pobj, std::list<LString> &result);

    /////////////////////////////////////////////////////
    // convenience methods

    template <typename _Class>
    void regist() {
      regist(typeid(_Class).name());
    }

    template <typename _Class>
    void unregist() {
      unregist(typeid(_Class).name());
    }

    template <typename _Class>
    bool isRegistered() {
      return isRegistered(typeid(_Class).name());
    }

    static bool init()
    {
      return super_t::init();
    }

    static void fini()
    {
      super_t::fini();
    }
  };

}

SINGLETON_BASE_DECL(qsys::RendererFactory);

#endif
