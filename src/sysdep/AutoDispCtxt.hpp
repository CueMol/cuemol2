// -*-Mode: C++;-*-
//
// Automatic stylemgr pus/pop context caller
//

#ifndef SYSDEP_AUTODISPCTXT_HPP_INCLUDED
#define SYSDEP_AUTODISPCTXT_HPP_INCLUDED

namespace sysdep {

  using gfx::DisplayContext;
  using qsys::View;

  class AutoDispCtxt
  {
    private:
    DisplayContext *m_pDC;
    View *m_pView;
    View *m_pOldView;

  public:
    AutoDispCtxt(View *pview) : m_pDC(NULL), m_pView(pview), m_pOldView(NULL) {
      BeginRequest();
    }

    ~AutoDispCtxt() {
      EndRequest();
    }

    DisplayContext *getDC() const { return m_pDC; }

  private:
    void BeginRequest() {
      m_pDC = m_pView->getDisplayContext();
	  m_pOldView = m_pDC->getTargetView();
	  m_pDC->setTargetView(m_pView);
      m_pDC->setCurrent();
    }

    void EndRequest() {
      m_pDC->setTargetView(m_pOldView);
    }

  };

}

#endif

