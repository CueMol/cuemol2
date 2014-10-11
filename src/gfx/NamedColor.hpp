// -*-Mode: C++;-*-
//
//  Named color class
//
// $Id: NamedColor.hpp,v 1.6 2011/04/10 10:46:09 rishitani Exp $

#ifndef GFX_NAMED_COLOR_HPP_INCLUDE_
#define GFX_NAMED_COLOR_HPP_INCLUDE_

#include "gfx.hpp"
#include "AbstractColor.hpp"

using qlib::LString;

namespace qlib {
  class Vector4D;
}

class NamedColor_wrap;

namespace gfx {

  MB_DECL_EXCPT_CLASS(GFX_API, UnknownColorNameException, qlib::RuntimeException);

  ///
  /// Named color resolver abstract class
  ///  (--> implemented in style manager)
  class GFX_API NamedColorResolver
  {
  public:
    virtual ~NamedColorResolver();

    /// Resolve named color
    virtual ColorPtr getColor(const LString &rkey) =0;
    
    /// Resolve named color with scene ID
    virtual ColorPtr getColor(const LString &rkey, qlib::uid_t nScopeID) =0;

    /// Get current context ID
    virtual qlib::uid_t getContextID() =0;

    //////////
    
    virtual qlib::uid_t makeCache() =0;
    virtual bool isCached(qlib::uid_t uid) const =0;
    virtual void setCached(qlib::uid_t uid, bool) =0;
    virtual void invalidateCache() =0;

  };

  ///
  /// Named color class
  ///
  class GFX_API NamedColor : public AbstractColor
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    typedef AbstractColor super_t;

    friend class ::NamedColor_wrap;

  private:
    /// Name of the named color
    LString m_name;

    /// context (=scene) ID to which this named color belongs
    qlib::uid_t m_nCtxtID;

    /// Cached refering color (in StyleMgr)
    mutable ColorPtr m_pRef;

    /// Cache validity flag for named color
    // mutable bool m_bCache;
    mutable qlib::uid_t m_nCacheID;

    /// overrided material name
    LString m_material;

    /// overrided transparency
    double m_dSetAlpha;
    
    /// modification by HSB model
    double m_dModHue;
    double m_dModSat;
    double m_dModBri;

  public:
    NamedColor();
    NamedColor(const NamedColor &r);
    NamedColor(const LString &name);
    NamedColor(const LString &name, qlib::uid_t nCtxtID);

    virtual ~NamedColor();
    
    /// = operator
    const NamedColor &operator=(const NamedColor &r);

    ///////////////////////////
    // Common access interfaces

    virtual int r() const;
    virtual int g() const;
    virtual int b() const;
    virtual int a() const;

    virtual quint32 getCode() const;

    virtual LString getMaterial() const;
    
    virtual bool equals(const AbstractColor &c) const;
    
    virtual bool isStrConv() const;
    virtual LString toString() const;

    ///////////////////////////

    void setMaterial(const LString &mat) { m_material = mat; }

    const LString &getName() const { return m_name; }

    bool isAlphaDefault() const {
      if (m_dSetAlpha<-0.01)
	return true;
      return false;
    }

    ////////////

    static void setResolver(NamedColorResolver *p);
    static NamedColorResolver *getResolver();

    ////////////

  private:

    bool isModSet() const;
    quint32 decodeModSet() const;

    void updateNamedColor() const;

    /// Named color resolver object (static)
    static NamedColorResolver *m_pResolver;

    bool isCached() const;
    void setCached() const;
  };

}

#endif // GFX_COLOR_HPP_INCLUDE_

