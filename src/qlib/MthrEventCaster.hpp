// -*-Mode: C++;-*-
//
// Multi-thread Event multicaster class
//

#ifndef QLIB_MTHR_EVENT_CASTER_H__
#define QLIB_MTHR_EVENT_CASTER_H__

#include "qlib.hpp"
#include "EventCaster.hpp"
#include <mutex>

namespace qlib {

  ///
  /// Multi-thread-aware event caster class
  ///
  template <class _EvntType, class _EvCallBkType>
  class LMthrEventCaster : public LEventCaster<_EvntType, _EvCallBkType>
  {
  private:
    mutable std::mutex m_mlsnr;
    mutable std::mutex m_mlck;

  public:
    typedef LEventCaster<_EvntType, _EvCallBkType> super_t;
    typedef typename super_t::iterator iterator;
    typedef typename super_t::const_iterator const_iterator;

  public:
    /** default ctor */
    LMthrEventCaster() : super_t() {}

    /** dtor */
    ~LMthrEventCaster() override {}

    /////////////////////////////////////////
    // Lock

    void lock() {
      std::lock_guard<std::mutex> lk(m_mlck);
      super_t::lock();
    }

    void unlock() {
      std::lock_guard<std::mutex> lk(m_mlck);
      super_t::unlock();
    }

    bool isLocked() const {
      std::unique_lock<std::mutex> lk(m_mlck, std::try_to_lock);
      if (!lk.owns_lock()) return true;
      return super_t::isLocked();
    }

    /////////////////////////////////////////
    // Event Listener management

    iterator find(_EvCallBkType *pCB) {
      std::lock_guard<std::mutex> lk(m_mlck);
      return super_t::find(pCB);
    }

    iterator find(int nid) {
      std::lock_guard<std::mutex> lk(m_mlck);
      return super_t::find(nid);
    }

    bool isRegistered(_EvCallBkType *pCB) const {
      std::lock_guard<std::mutex> lk(m_mlck);
      return super_t::isRegistered(pCB);
    }

    bool isRegistered(int nid) const {
      std::lock_guard<std::mutex> lk(m_mlck);
      return super_t::isRegistered(nid);
    }

    int add(_EvCallBkType *pCB) {
      std::lock_guard<std::mutex> lk(m_mlck);
      return super_t::add(pCB);
    }

    bool remove(_EvCallBkType *pCB) {
      std::lock_guard<std::mutex> lk(m_mlck);
      return super_t::remove(pCB);
    }

    _EvCallBkType *remove(int nid) {
      std::lock_guard<std::mutex> lk(m_mlck);
      return super_t::remove(nid);
    }

    void clear() {
      std::lock_guard<std::mutex> lk(m_mlck);
      super_t::clear();
    }

    /////////////////////////////////////////
    // Event broadcasting methods

    bool lockedFire(_EvntType &ev) {
      EventManager *pMgr = EventManager::getInstance();
      if (!pMgr->isMainThread()) {
	pMgr->delegateEventFire(&ev, this);
	return true;
      }

      {
	std::lock_guard<std::mutex> lk(m_mlck);
	return super_t::lockedFire(ev);
      }
    }

  };

} // namespace qlib

#endif
