//
// Unique ID generation service
//
// $Id: LUIDGen.hpp,v 1.3 2009/04/04 13:56:07 rishitani Exp $

#ifndef L_UID_GEN_HPP_INCLUDED_
#define L_UID_GEN_HPP_INCLUDED_

#include "qlib.hpp"
#include "LString.hpp"
#include "SingletonBase.hpp"

#if 0
namespace qlib {

  typedef unsigned long uid_t;
  const uid_t invalid_uid = 0;

  typedef std::set<uid_t> UIDSet;

  class QLIB_API LUIDGen : public qlib::SingletonBase<LUIDGen>
  {
  private:
    uid_t m_data;

  public:
    LUIDGen() : m_data(0) {}

    uid_t get() {
      return ++m_data;
    }

    static uid_t sget() {
      LUIDGen *pS = qlib::SingletonBase<LUIDGen>::getInstance();
      return pS->get();
    }

  };

}
#endif

#endif // L_UID_GEN_HPP_INCLUDED_
