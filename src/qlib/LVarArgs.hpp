//
// Function argument class using variant
//

#ifndef __QLIB_VAR_ARGS_HPP__
#define __QLIB_VAR_ARGS_HPP__

#include "qlib.hpp"

#include "LVariant.hpp"
#include "LExceptions.hpp"

namespace qlib {

  class QLIB_API LVarArgs
  {
  public:
    LVarArgs(int nsize = 0)
      : m_nSize(nsize), m_pthis(NULL)
    {
      if (nsize>0)
	m_data = MB_NEW LVariant[nsize];
      else
	m_data = NULL;
    }

    ~LVarArgs()
    {
      if (m_data!=NULL)
	delete [] m_data;
    }
    
    int getSize() const { return m_nSize; }

    void checkArgSize(int n) const {
      if (m_nSize!=n) {
	LString msg = LString::format("Argument size mismatch %d != %d", n, m_nSize);
	MB_THROW(IllegalArgumentException, msg);
      }
    }

    const LVariant &get(int n) const {
      MB_ASSERT(n<m_nSize);
      return m_data[n];
    }

    LVariant &at(int n) {
      MB_ASSERT(n<m_nSize);
      return m_data[n];
    }

    ////

    const LVariant &retval() const {
      return m_retval;
    }

    LVariant &retval() {
      return m_retval;
    }

    void setRetVoid() {
      m_retval.setNull();
    }

    ////

    void setThisPtr(LScriptable *pthis) {
      m_pthis = pthis;
    }

    LScriptable *getThisPtr2() const {
      return m_pthis;
    }

    template<class _Type>
    _Type *getThisPtr() const
    {
      if (m_pthis==NULL) {
        MB_DPRINTLN("LVarArgs::getThisPtr() m_pthis is NULL");
	return NULL;
      }

      LScriptable *pscr = (m_pthis->isSmartPtr()) ? m_pthis->getSPInner() : m_pthis;

      if (pscr==NULL) {
        MB_DPRINTLN("LVarArgs::getThisPtr() this is NULL");
	return NULL;
      }

      _Type *pret = dynamic_cast<_Type *>(pscr);
      if (pret==NULL) {
	MB_DPRINTLN("cannot dyncast %p(%s) to %s",
		    m_pthis,
		    typeid(*m_pthis).name(),
		    typeid(_Type).name());
	return NULL;
      }
      return pret;
    }

    /*
    // _Type must be a client of the smartptr!!
    template<class _Type>
    LScrSp<_Type> getThisSmartPtr() const
    {
      LScrSp<_Type> spret = LScrSp<_Type>::createFrom(m_pthis);
      if (spret.isnull()) {
	MB_DPRINTLN("cannot dyncast %p(%s) to %s",
		    m_pthis, typeid(*m_pthis).name(),
		    typeid(spret).name());
      }
      return spret;
    }
     */

    ////

  private:
    int m_nSize;

    LScriptable *m_pthis;
    LVariant *m_data;
    LVariant m_retval;
  };

}

#endif
