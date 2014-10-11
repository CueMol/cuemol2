// -*-Mode: C++;-*-
//
// AnimObj: animation object superclass
//

#ifndef QSYS_ANIMOBJ_HPP_INCLUDED
#define QSYS_ANIMOBJ_HPP_INCLUDED

#include <qsys/qsys.hpp>

#include <qlib/LScrObjects.hpp>
#include <qlib/LScrSmartPtr.hpp>
#include <qlib/LScrTime.hpp>
#include <qlib/ObjectManager.hpp>
#include <qlib/mcutils.hpp>
#include <qlib/Utils.hpp>
#include <qlib/LPropEvent.hpp>

class AnimObj_wrap;

namespace qsys {

  class AnimMgr;

  class QSYS_API AnimObj :
    public qlib::LSimpleCopyScrObject,
    public qlib::LUIDObject
  {
    MC_SCRIPTABLE;
    friend class ::AnimObj_wrap;

  private:
    qlib::LString m_name;
    qlib::time_value m_start;
    qlib::time_value m_end;

    double m_quadric;

    int m_state;

    /// unique object ID
    qlib::uid_t m_uid;

    /// disabled flag
    bool m_bDisabled;

  public:
    enum {
      AO_PRE,
      AO_ACTIVE,
      AO_POST
    };

  public:
    /// default ctor
    AnimObj();

    /// copy ctor
    AnimObj(const AnimObj &arg);

    /// dtor
    virtual ~AnimObj();

    virtual void onTimerPre(qlib::time_value elapsed, AnimMgr *pMgr);
    virtual void onTimer(qlib::time_value elapsed, AnimMgr *pMgr);
    virtual void onTimerPost(qlib::time_value elapsed, AnimMgr *pMgr);

    virtual void onStart(qlib::time_value elapsed, AnimMgr *pMgr);
    virtual void onEnd(qlib::time_value elapsed, AnimMgr *pMgr);
    
    ///////////////////////////////////////////
    // getter/setter for persistent properties

    qlib::uid_t getUID() const { return m_uid; }

    qlib::LScrTime getScrStart() const {
      return qlib::LScrTime(m_start);
    }

    void setScrStart(const qlib::LScrTime &value) {
      setStart(value.getValue());
    }
    
    qlib::time_value getStart() const {
      return m_start;
    }

    void setStart(qlib::time_value value);

    /////

    qlib::LScrTime getScrEnd() const {
      return qlib::LScrTime(m_end);
    }

    void setScrEnd(const qlib::LScrTime &value) {
      setEnd( value.getValue() );
    }
    
    qlib::time_value getEnd() const {
      return m_end;
    }

    void setEnd(qlib::time_value value);

    /////
    
    qlib::LString getName() const {
      return m_name;
    }

    bool isDisabled() const {
      return m_bDisabled;
    }

    void setDisabled(bool val) {
      m_bDisabled = val;
    }

    ////////////////////////////////////////
    // other methods

    int getState() const { return m_state; }
    void setState(int n) { m_state = n; }

    qlib::LReal getQuadric() const {
      return m_quadric;
    }

    void setQuadric(qlib::LReal val);

    double convRho(double rho) const {
      if (rho<0.5)
        return convRhoImpl(rho);
      else
        return 1.0 - convRhoImpl(1.0 - rho);
    }

    double getRho(qlib::time_value elapsed) const {
      double span = double(getEnd() - getStart());
      if (qlib::isNear4(span, 0.0)) {
        // degenerated case (end==start)
        if (elapsed-getStart()<0)
          return 0.0;
        else
          return 1.0;
      }
      double rho = double(elapsed-getStart())/span;
      rho = qlib::trunc(rho, 0.0, 1.0);
      return convRho(rho);
    }

  private:
    double convRhoImpl(double rho) const {
      if (rho<m_quadric) {
        // quadric region
        return m_coeff * rho * rho;
      }
      else {
        // linear region
        return m_grad * rho + m_absc;
      }
    }

  private:
    double m_coeff, m_absc, m_grad;
  };

  typedef qlib::LScrSp<AnimObj> AnimObjPtr;

}

#endif


