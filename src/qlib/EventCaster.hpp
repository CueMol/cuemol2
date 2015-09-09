// -*-Mode: C++;-*-
//
// Event multicaster class
//

#ifndef QLIB_EVENT_CASTER_H__
#define QLIB_EVENT_CASTER_H__

#include "qlib.hpp"
#include "EventManager.hpp"

namespace qlib {

  ///
  /// Event multicaster class
  ///

  template <class _EvntType, class _EvCallBkType>
  class LEventCaster : public LEventCasterBase
  {
  public:
    typedef std::pair<int, _EvCallBkType *> value_type;
  
  protected:
    typedef std::list<value_type> data_type;
  
    int m_nLastID;
    data_type m_listenerList;
  
  public:
    typedef typename data_type::iterator iterator;
    typedef typename data_type::const_iterator const_iterator;
  
  public:
    /// default ctor
    LEventCaster() : LEventCasterBase(), m_nLastID(0) {}
  
    /// dtor
    virtual ~LEventCaster() {}
  
    /////////////////////////////////////////
    // Event Listener management
    //
  
    //iterator begin() { return m_listenerList.begin(); }
    //iterator end() { return m_listenerList.end(); }
    const_iterator begin() const { return m_listenerList.begin(); }
    const_iterator end() const { return m_listenerList.end(); }
  
    /// Search a listener by pointer (pCB) and returns iterator pointing it
    iterator find(_EvCallBkType *pCB)
    {
      iterator iter = m_listenerList.begin();
      iterator eiter = m_listenerList.end();
      for (; iter!=eiter; ++iter)
	if (iter->second == pCB)
	  break;
      return iter;
    }
  
    /// Search a listener by ID (nid) and returns iterator pointing it
    iterator find(int nid)
    {
      iterator iter = m_listenerList.begin();
      iterator eiter = m_listenerList.end();
      for (; iter!=eiter; ++iter)
	if (iter->first == nid)
	  break;
      return iter;
    }
  
    /// check whether a listner is registered or not by pointer (pCB)
    bool isRegistered(_EvCallBkType *pCB) const
    {
      const_iterator iter = m_listenerList.begin();
      const_iterator eiter = m_listenerList.end();
      for (; iter!=eiter; ++iter)
	if (iter->second == pCB)
	  return true;
      return false;
    }
  
    /// check whether a listner is registered or not by index (nid)
    bool isRegistered(int nid) const
    {
      const_iterator iter = m_listenerList.begin();
      const_iterator eiter = m_listenerList.end();
      for (; iter!=eiter; ++iter)
	if (iter->first == nid)
	  return true;
      return false;
    }
  
    /// add a new event listener (pCB)
    int add(_EvCallBkType *pCB)
    {
      if (isLocked()) {
	MB_ASSERT(false);
	return -1;
      }
    
      {
	AutoEventCastLock lock(this);
      
	iterator iter = find(pCB);
	if (iter!=m_listenerList.end()) {
	  // pCB is already registered !!
	  return -1;
	}
      
	int newid = m_nLastID;
	++m_nLastID;
	m_listenerList.push_back(value_type(newid, pCB));
      
	return newid;
      }
    }

    /// remove event listener by pointer (pCB)
    /// removing will fail if this caster has been locked by other operations
    bool remove(_EvCallBkType *pCB)
    {
      if (isLocked()) {
	MB_ASSERT(false);
	return false;
      }
    
      {
	AutoEventCastLock lock(this);
	iterator iter = find(pCB);
	if (iter==m_listenerList.end()) {
	  // not registered !!
	  return false;
	}
	m_listenerList.erase(iter);
      
	return true;
      }
    }
    
    /// remove event listener by pointer (pCB)
    /// removing will fail if this caster has been locked by other operations
    _EvCallBkType *remove(int nid)
    {
      if (isLocked()) {
	MB_ASSERT(false);
	return NULL;
      }

      {
	AutoEventCastLock lock(this);
	iterator iter = find(nid);
	if (iter==m_listenerList.end()) {
	  // not registered !!
	  return NULL;
	}
	_EvCallBkType *pCB = iter->second;
	m_listenerList.erase(iter);
	return pCB;
      }
    }

    /// remove all event listeners
    void clear()
    {
      if (isLocked()) {
	MB_ASSERT(false);
	return;
      }
      {
	AutoEventCastLock lock(this);
	m_listenerList.erase(m_listenerList.begin(), m_listenerList.end());
      }
    }

    /////////////////////////////////////////
    // Event broadcasting methods
    //
  
    void fire(_EvntType &ev)
    {
      const_iterator iter = m_listenerList.begin();
      const_iterator eiter = m_listenerList.end();
      for ( ; iter!=eiter; iter++)
	execute(ev, iter->second);
    }
  
    bool lockedFire(_EvntType &ev)
    {
      if (isLocked()) {
	//MB_ASSERT(false);
	return false;
      }
      {
	AutoEventCastLock lock(this);
	fire(ev);
      }
      return true;
    }

    bool isEmpty() const {
      return (m_listenerList.empty());
    }

    int getSize() const {
      return m_listenerList.size();
    }

    /// make a copy of listener list and fire events for the copied listeners
    void replicaFire(_EvntType &ev)
    {
      if (isEmpty())
	return;
    
      int i, nsize = m_listenerList.size();
      std::vector<_EvCallBkType *> cblist(nsize);
    
      if (isLocked()) {
	MB_ASSERT(false);
	return;
      }
    
      {
	// make copy of listener list
	AutoEventCastLock lock(this);
	const_iterator iter = m_listenerList.begin();
	const_iterator eiter = m_listenerList.end();
	for (i=0 ; iter!=eiter; iter++, i++)
	  cblist[i] = (iter->second);
	// unlock();
      }
      
      for (i=0; i<nsize; ++i)
	execute(ev, cblist[i]);
    }

    virtual void fireEvent(LEvent *rpEvent)
    {
      _EvntType *pEv = dynamic_cast<_EvntType *>(rpEvent);
      if (pEv==NULL) {
	// TO DO: throw xcpt
	MB_ASSERT(false);
	return;
      }
      fire(*pEv);
    }
    
    virtual void execute(_EvntType &ev, _EvCallBkType *p) =0;
  };
  

} // namespace qlib

#endif
