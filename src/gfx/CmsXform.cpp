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
#ifdef USEPROOFING
     : m_hTr(NULL), m_hTrChk(NULL)
#else
     : m_hTr1(NULL), m_hTr2(NULL)
#endif
{
}

CmsXformRep::~CmsXformRep()
{
  cleanup();
}

void CmsXformRep::cleanup()
{
#ifdef HAVE_LCMS2_H

#ifdef USEPROOFING
  if (m_hTr)
    cmsDeleteTransform(static_cast<cmsHTRANSFORM>(m_hTr));
  m_hTr = NULL;
  if (m_hTrChk)
    cmsDeleteTransform(static_cast<cmsHTRANSFORM>(m_hTrChk));
  m_hTrChk = NULL;
#else
  if (m_hTr1)
    cmsDeleteTransform(static_cast<cmsHTRANSFORM>(m_hTr1));
  m_hTr1 = NULL;
  if (m_hTr2)
    cmsDeleteTransform(static_cast<cmsHTRANSFORM>(m_hTr2));
  m_hTr2 = NULL;
#endif

#endif
}


//////////////////////////////////////////////

CmsXform::CmsXform()
     : m_pimpl(MB_NEW detail::CmsXformRep()), m_bEnabled(true), m_nIntent(0)
{
}

CmsXform::CmsXform(const CmsXform &r)
     : m_pimpl(r.m_pimpl), m_bEnabled(r.m_bEnabled)
{
}

const CmsXform &CmsXform::operator=(const CmsXform &arg)
{
  if(&arg!=this){
    m_pimpl = arg.m_pimpl;
    m_bEnabled = arg.m_bEnabled;
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

  int nProofIntent = m_nIntent;
  

#ifdef USEPROOFING
  cmsUInt16Number alarm[cmsMAXCHANNELS];
  for (int i=0; i < cmsMAXCHANNELS; i++)
    alarm[i] = 0xFFFF;
  cmsSetAlarmCodes(alarm);

  m_pimpl->m_hTr = cmsCreateProofingTransform(hInProf,
                                              TYPE_RGB_8,
                                              hInProf,
                                              TYPE_RGB_8,
                                              hOutProf,
                                              nProofIntent,
                                              //INTENT_ABSOLUTE_COLORIMETRIC,
                                              INTENT_PERCEPTUAL,
                                              cmsFLAGS_SOFTPROOFING);

  cmsHPROFILE hNullProf = cmsCreateNULLProfile();
  m_pimpl->m_hTrChk = cmsCreateProofingTransform(hInProf,
                                                 TYPE_RGB_DBL,
                                                 hNullProf,
                                                 TYPE_GRAY_DBL,
                                                 hOutProf,
                                                 nProofIntent,
                                                 nProofIntent,
                                                 cmsFLAGS_SOFTPROOFING|cmsFLAGS_GAMUTCHECK|cmsFLAGS_NOCACHE);
  LOG_DPRINTLN("dwin=%X, dwout=%X, dwflags=%x\n", TYPE_RGB_DBL, TYPE_GRAY_DBL, cmsFLAGS_SOFTPROOFING|cmsFLAGS_GAMUTCHECK|cmsFLAGS_NOCACHE);
  cmsCloseProfile(hNullProf);
#else
  m_pimpl->m_hTr1 = cmsCreateTransform(hInProf,
                                       TYPE_RGB_8,
                                       hOutProf,
                                       //TYPE_CMYK_8,
                                       TYPE_CMYK_FLT,
                                       nProofIntent, 0);
  m_pimpl->m_hTr2 = cmsCreateTransform(hOutProf,
                                       //TYPE_CMYK_8,
                                       TYPE_CMYK_FLT,
                                       hInProf,
                                       TYPE_RGB_8,
                                       //INTENT_ABSOLUTE_COLORIMETRIC,
                                       INTENT_PERCEPTUAL,
                                       0);

#endif

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
#ifdef USEPROOFING
  if (m_pimpl->m_hTr!=NULL)
#else
  if (m_pimpl->m_hTr1!=NULL && m_pimpl->m_hTr2!=NULL)
#endif
    return true;
  else
    return false;
}

void CmsXform::doxform(quint32 incode, quint32 &routcode) const
{
#ifdef HAVE_LCMS2_H
  if (!m_bEnabled ||
#ifdef USEPROOFING
      m_pimpl->m_hTr==NULL
#else
      m_pimpl->m_hTr1==NULL || m_pimpl->m_hTr2==NULL
#endif
      ) {
    routcode = incode;
    return;
  }
  
  quint8 inbuf[4];
  quint8 outbuf[4];
  
  inbuf[0] = getRCode(incode);
  inbuf[1] = getGCode(incode);
  inbuf[2] = getBCode(incode);
  
#ifdef USEPROOFING
  cmsDoTransform(static_cast<cmsHTRANSFORM>(m_pimpl->m_hTr), inbuf, outbuf, 1);
  double gamutchk;
  double inbuf2[4];
  inbuf2[0] = getRCode(incode);
  inbuf2[1] = getGCode(incode);
  inbuf2[2] = getBCode(incode);
  cmsDoTransform(static_cast<cmsHTRANSFORM>(m_pimpl->m_hTrChk), inbuf2, &gamutchk, 1);
  MB_DPRINTLN("CMS> %02X:%02X:%02X --> %02X:%02X:%02X (%f)",
              inbuf[0],inbuf[1],inbuf[2],
              outbuf[0],outbuf[1],outbuf[2],
              gamutchk);
#else  
  //quint8 cmykbuf[4];
  float cmykbuf[4];
  cmsDoTransform(static_cast<cmsHTRANSFORM>(m_pimpl->m_hTr1), inbuf, cmykbuf, 1);
  cmsDoTransform(static_cast<cmsHTRANSFORM>(m_pimpl->m_hTr2), cmykbuf, outbuf, 1);
MB_DPRINTLN("CMS> %02X:%02X:%02X --> %.2f:%.2f:%.2f:%.2f --> %02X:%02X:%02X",
            inbuf[0],inbuf[1],inbuf[2],
            cmykbuf[0],cmykbuf[1],cmykbuf[2],cmykbuf[3],
            outbuf[0],outbuf[1],outbuf[2]);
#endif

  routcode = makeRGBACode(outbuf[0], outbuf[1], outbuf[2], getACode(incode));

#else
  routcode = incode;
#endif
}

