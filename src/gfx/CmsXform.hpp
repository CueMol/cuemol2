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

namespace gfx {

  using qlib::LString;

  // implementation
  namespace detail {

    class GFX_API CmsXformRep
    {
    public:
      /// transformation handle RGB->CMYK
      void *m_hTr1;

      /// transformation handle CMYK->RGB
      void *m_hTr2;

      CmsXformRep();

      ~CmsXformRep();

      void cleanup();
    };
  } // namespace detail

  class GFX_API CmsXform
  {
  private:
    qlib::sp<detail::CmsXformRep> m_pimpl;
    
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

    void doxform(quint32 incode, quint32 &routcode) const;

  };
  
}// namespace gfx


#endif

