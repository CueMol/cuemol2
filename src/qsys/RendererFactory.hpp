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

#include <map>
#include <utility>
#include <vector>

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
    /// Property values applied to a renderer created through an alias, in order.
    typedef std::vector<std::pair<LString, LString> > PresetList;

  private:
    struct AliasEntry
    {
      /// Registered type name the alias resolves to.
      LString target;
      /// Property presets applied after creation.
      PresetList presets;
    };

    typedef std::map<LString, AliasEntry> aliastab_t;

    /// Renamed/merged renderer type names, kept so old scene files still load.
    aliastab_t m_aliastab;

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

    /**
       Register an obsolete renderer type name resolving to a registered one.

       create(oldName) then builds newName and applies the presets as user
       values (the default flags are cleared, so reapplyStyle() keeps them),
       and the renderer is saved back under newName. Aliases are invisible to
       searchCompatibleRenderers(), so they are never offered in the GUI.
    */
    void registAlias(const LString &oldName, const LString &newName,
                     const PresetList &presets = PresetList());

    /// Unregister an alias. Returns false when oldName is not an alias.
    bool unregistAlias(const LString &oldName);

    /// True when nickname is an alias of another (registered) renderer type.
    bool isAlias(const LString &nickname) const
    {
      return m_aliastab.find(nickname)!=m_aliastab.end();
    }

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
