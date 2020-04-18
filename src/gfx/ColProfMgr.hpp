// -*-Mode: C++;-*-
//
// Color profile manager
//

#ifndef GFX_COLOR_PROFILE_MANAGER_HPP_
#define GFX_COLOR_PROFILE_MANAGER_HPP_

#include "gfx.hpp"

#include <qlib/SingletonBase.hpp>
#include <qlib/Vector4D.hpp>
#include "CmsXform.hpp"

namespace gfx {

  using qlib::LString;
  using qlib::Vector4D;

  //
  //  Color profile manager class
  //
  class GFX_API ColProfMgr : public qlib::SingletonBase<ColProfMgr>
  {
  private:
    
    typedef std::map<qlib::uid_t, CmsXform *> data_t;

    /// Mapping from Scene ID to cms transform obj
    data_t m_data;

  public:
    
    ////////////////////////////////////////////
    //
    
    ColProfMgr() {}
    ~ColProfMgr();
    

    void registerCms(qlib::uid_t uid);
    void unregCms(qlib::uid_t uid);

    CmsXform *getCmsByID(qlib::uid_t uid) const;

    void doXForm(qlib::uid_t uid, const quint32 &incol, quint32 &outcol) const;
    void doXForm(qlib::uid_t uid, const Vector4D &incol, Vector4D &outcol) const;

  private:
    
  public:
    //////////
    // Initializer/finalizer
    static bool init();
    static void fini();

    static void sRegUID(qlib::uid_t uid);
    static void sUnregUID(qlib::uid_t uid);
  };

}

SINGLETON_BASE_DECL(gfx::ColProfMgr);

#endif

