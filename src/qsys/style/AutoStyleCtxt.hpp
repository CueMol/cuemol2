// -*-Mode: C++;-*-
//
// Automatic stylemgr pus/pop context caller
//

#ifndef GFX_AUTOSTYLECTXT_HPP_INCLUDED
#define GFX_AUTOSTYLECTXT_HPP_INCLUDED

#include "StyleMgr.hpp"

namespace qsys {

class AutoStyleCtxt
{
private:
  qlib::uid_t m_nCtxtID;
  StyleMgr *m_pSM;

public:
  AutoStyleCtxt(qlib::uid_t nCtxtID) : m_nCtxtID(nCtxtID), m_pSM(NULL)
  {
    BeginRequest();
  }

  ~AutoStyleCtxt() {EndRequest();}

  void EndRequest() {
    if (m_nCtxtID!=qlib::invalid_uid)
      m_pSM->popContextID();
  }

private:
  void BeginRequest() {
    m_pSM = StyleMgr::getInstance();
    if (m_nCtxtID!=qlib::invalid_uid)
      m_pSM->pushContextID(m_nCtxtID);
  }
};

}

#endif

