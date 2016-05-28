// -*-Mode: C++;-*-
//
//
//

#include <common.h>

#include "CmsXform.hpp"

#ifdef HAVE_LCMS2_H
#define CMS_DLL
#include <lcms2.h>
#else
typedef void *cmsHTRANSFORM;
#endif

using namespace gfx;
using namespace gfx::detail;

CmsXformRep::CmsXformRep()
     : m_hTr1(NULL), m_hTr2(NULL)
{
}

CmsXformRep::~CmsXformRep()
{
  cleanup();
}

void CmsXformRep::cleanup()
{
#ifdef HAVE_LCMS2_H
  if (m_hTr1)
    cmsDeleteTransform(static_cast<cmsHTRANSFORM>(m_hTr1));
  m_hTr1 = NULL;
  if (m_hTr2)
    cmsDeleteTransform(static_cast<cmsHTRANSFORM>(m_hTr2));
  m_hTr2 = NULL;
#endif
}


//////////////////////////////////////////////

CmsXform::CmsXform()
     : m_pimpl(MB_NEW detail::CmsXformRep())
{
}

CmsXform::CmsXform(const CmsXform &r)
     : m_pimpl(r.m_pimpl)
{
}

const CmsXform &CmsXform::operator=(const CmsXform &arg)
{
  if(&arg!=this){
    m_pimpl = arg.m_pimpl;
  }
  return *this;
}

/// load from icc file
void CmsXform::loadIccFile(const LString &path)
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

void CmsXform::reset()
{
  m_pimpl->cleanup();
}

bool CmsXform::isProfOK() const
{
  if (m_pimpl->m_hTr1!=NULL && m_pimpl->m_hTr2!=NULL)
    return true;
  else
    return false;
}

void CmsXform::doxform(quint32 incode, quint32 &routcode) const
{
#ifdef HAVE_LCMS2_H
  if (m_pimpl->m_hTr1==NULL || m_pimpl->m_hTr2==NULL) {
    //MB_THROW(qlib::RuntimeException, "profile not loaded");
    routcode = incode;
    return;
  }
  
  quint8 inbuf[4];
  quint8 cmykbuf[4];
  
  inbuf[0] = getRCode(incode);
  inbuf[1] = getGCode(incode);
  inbuf[2] = getBCode(incode);
  
  cmsDoTransform(static_cast<cmsHTRANSFORM>(m_pimpl->m_hTr1), inbuf, cmykbuf, 1);
  cmsDoTransform(static_cast<cmsHTRANSFORM>(m_pimpl->m_hTr2), cmykbuf, inbuf, 1);
  
  //inbuf[3] = getACode(incode);
  //routcode = *((quint32 *)inbuf);
  routcode = makeRGBACode(inbuf[0], inbuf[1], inbuf[2], getACode(incode));
#else
  routcode = incode;
#endif
}

