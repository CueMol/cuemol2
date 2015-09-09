// -*-Mode: C++;-*-
//
// Multi-thread Event multicaster class
//

#ifndef QLIB_MTHR_EVENT_CASTER_H__
#define QLIB_MTHR_EVENT_CASTER_H__

#include "qlib.hpp"
#include "EventCaster.hpp"

#ifdef HAVE_BOOST_THREAD
#  include <boost/thread.hpp>
#endif  

namespace qlib {

#ifdef HAVE_BOOST_THREAD

  ///
  /// Multi-thread-aware event caster class
  ///
  template <class _EvntType, class _EvCallBkType>
  class LMthrEventCaster : public LEventCaster<_EvntType, _EvCallBkType>
  {
  private:
    mutable boost::mutex m_mlsnr;
    mutable boost::mutex m_mlck;

  public:
    typedef LEventCaster<_EvntType, _EvCallBkType> super_t;
    typedef typename super_t::iterator iterator;
    typedef typename super_t::const_iterator const_iterator;

  public:
    /** default ctor */
    LMthrEventCaster() : super_t() {}

    /** dtor */
    virtual ~LMthrEventCaster() {}

    /////////////////////////////////////////
    // Lock

    void lock() {
      boost::mutex::scoped_lock lk(m_mlck);
      super_t::lock();
    }

    void unlock() {
      boost::mutex::scoped_lock lk(m_mlck);
      super_t::unlock();
    }

    bool isLocked() const {
      boost::mutex::scoped_try_lock lk(m_mlck);
      if (!lk) return true;
      return super_t::isLocked();
    }

    /////////////////////////////////////////
    // Event Listener management

    iterator find(_EvCallBkType *pCB) {
      boost::mutex::scoped_lock lk(m_mlck);
      return super_t::find(pCB);
    }

    iterator find(int nid) {
      boost::mutex::scoped_lock lk(m_mlck);
      return super_t::find(nid);
    }

    bool isRegistered(_EvCallBkType *pCB) const {
      boost::mutex::scoped_lock lk(m_mlck);
      return super_t::isRegistered(pCB);
    }

    bool isRegistered(int nid) const {
      boost::mutex::scoped_lock lk(m_mlck);
      return super_t::isRegistered(nid);
    }

    int add(_EvCallBkType *pCB) {
      boost::mutex::scoped_lock lk(m_mlck);
      return super_t::add(pCB);
    }

    bool remove(_EvCallBkType *pCB) {
      boost::mutex::scoped_lock lk(m_mlck);
      return super_t::remove(pCB);
    }

    _EvCallBkType *remove(int nid) {
      boost::mutex::scoped_lock lk(m_mlck);
      return super_t::remove(nid);
    }

    void clear() {
      boost::mutex::scoped_lock lk(m_mlck);
      super_t::clear();
    }

    /////////////////////////////////////////
    // Event broadcasting methods

    bool lockedFire(_EvntType &ev) {
      //boost::thread::id mthid = EventManager::getMainThrID();
      EventManager *pMgr = EventManager::getInstance();
      if (!pMgr->isMainThread()) {
	pMgr->delegateEventFire(&ev, this);
	return true;
      }

      {
	boost::mutex::scoped_lock lk(m_mlck);
	return super_t::lockedFire(ev);
      }
    }

  };

#else
  // TO DO: XXX
#endif
  

} // namespace qlib

#endif
