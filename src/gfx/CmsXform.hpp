// -*-Mode: C++;-*-
//
// Color management system transformation class
//

#ifndef GFX_CMS_XFORM_HPP_INCLUDED
#define GFX_CMS_XFORM_HPP_INCLUDED

#include "gfx.hpp"

#include <qlib/LString.hpp>
#include <qlib/LTypes.hpp>
#include <qlib/SmartPtr.hpp>
#include "AbstractColor.hpp"

#define USEPROOFING 1

namespace gfx {

  using qlib::LString;

  // implementation
  namespace detail {

    class GFX_API CmsXformRep
    {
    public:
#ifdef USEPROOFING
      /// transformation handle proofing transform
      void *m_hTr;
      void *m_hTrChk;
#else
      /// transformation handle RGB->CMYK
      void *m_hTr1;

      /// transformation handle CMYK->RGB
      void *m_hTr2;
#endif
      
      CmsXformRep();

      ~CmsXformRep();

      void cleanup();
    };
  } // namespace detail

  class GFX_API CmsXform
  {
  private:
    qlib::sp<detail::CmsXformRep> m_pimpl;
    
    bool m_bEnabled;

    int m_nIntent;

    LString m_info;
    
  public:
    /// default ctor
    CmsXform();

    /// copy ctor
    CmsXform(const CmsXform &r);

    /// copy op
    const CmsXform &operator=(const CmsXform &arg);

    /// load from icc file
    void loadIccFile(const LString &path);

    void reset();

    bool isProfOK() const;

    void doXForm(quint32 incode, quint32 &routcode) const;

    /// check if the color is in the gamut
    bool isInGamut(quint32 incode) const;

    bool isEnabled() const { return m_bEnabled; }
    void setEnabled(bool b) { m_bEnabled = b; }

    int getIccIntent() const { return m_nIntent; }
    void setIccIntent(int n) { m_nIntent = n; }

    const LString &getInfo() const { return m_info; }
  };
  
}// namespace gfx


#endif

