// -*-Mode: C++;-*-
//
// Color management system transformation class
//

#ifndef GFX_CMS_XFORM_HPP_INCLUDED
#define GFX_CMS_XFORM_HPP_INCLUDED

#include "gfx.hpp"

#include <qlib/SmartPtr.hpp>

#ifdef HAVE_LCMS2_H
#define CMS_DLL
#include <lcms2.h>
#else
typedef void *cmsHTRANSFORM;
#endif

namespace gfx {

  // implementation
  namespace detail {

    class GFX_API CmsXformRep
    {
    public:
      /// transformation handle RGB->CMYK
      cmsHTRANSFORM m_hTr1;

      /// transformation handle CMYK->RGB
      cmsHTRANSFORM m_hTr2;

      CmsXformRep()
           : m_hTr1(NULL), m_hTr2(NULL)
      {
      }

      ~CmsXformRep()
      {
        cleanup();
      }
      
      void cleanup()
      {
#ifdef HAVE_LCMS2_H
        if (m_hTr1)
          cmsDeleteTransform(m_hTr1);
        m_hTr1 = NULL;
        if (m_hTr2)
          cmsDeleteTransform(m_hTr2);
        m_hTr2 = NULL;
#endif
      }

    };
  } // namespace detail

  class GFX_API CmsXform
  {
  private:
    qlib::sp<detail::CmsXformRep> m_pimpl;
    
  public:
    /// default ctor
    CmsXform()
         : m_pimpl(MB_NEW detail::CmsXformRep())
    {
    }

    /// copy ctor
    CmsXform(const CmsXform &r)
         : m_pimpl(r.m_pimpl)
    {
    }

    /// copy op
    const CmsXform &operator=(const CmsXform &arg) {
      if(&arg!=this){
        m_pimpl = arg.m_pimpl;
      }
      return *this;
    }

    /// load from icc file
    void loadIccFile(const LString &path)
    {
#ifdef HAVE_LCMS2_H
      m_pimpl->cleanup();
      cmsHPROFILE hInProf = cmsCreate_sRGBProfile();
      cmsHPROFILE hOutProf = cmsOpenProfileFromFile(path, "r");
      if (hOutProf==NULL) {
        MB_THROW(qlib::IOException, "cannot open icc file: "+path);
        return;
      }
      m_pimpl->m_hTr1 = cmsCreateTransform(hInProf,
                                           TYPE_RGB_8,
                                           hOutProf,
                                           TYPE_CMYK_8,
                                           INTENT_PERCEPTUAL, 0);
      m_pimpl->m_hTr2 = cmsCreateTransform(hOutProf,
                                           TYPE_CMYK_8,
                                           hInProf,
                                           TYPE_RGB_8,
                                           INTENT_PERCEPTUAL, 0);
      cmsCloseProfile(hInProf);
      cmsCloseProfile(hOutProf);
#endif
      return;
    }

    void reset() {
      m_pimpl->cleanup();
    }

    bool isProfOK() const {
      if (m_pimpl->m_hTr1!=NULL && m_pimpl->m_hTr2!=NULL)
        return true;
      else
        return false;
    }

    void doxform(quint32 incode, quint32 &routcode) const
    {
#ifdef HAVE_LCMS2_H
      if (m_pimpl->m_hTr1==NULL || m_pimpl->m_hTr2==NULL) {
        MB_THROW(qlib::RuntimeException, "profile not loaded");
        return;
      }

      quint8 inbuf[4];
      quint8 cmykbuf[4];

      inbuf[0] = getRCode(incode);
      inbuf[1] = getGCode(incode);
      inbuf[2] = getBCode(incode);

      cmsDoTransform(m_pimpl->m_hTr1, inbuf, cmykbuf, 1);
      cmsDoTransform(m_pimpl->m_hTr2, cmykbuf, inbuf, 1);
      
      inbuf[3] = getACode(incode);

      routcode = *((quint32 *)inbuf);
#else
      routcode = incode;
#endif
    }

  };
  
}// namespace gfx


#endif

