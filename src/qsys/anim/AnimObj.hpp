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
  using qlib::LString;
  using qlib::time_value;

  class QSYS_API AnimObj :
    public qlib::LSimpleCopyScrObject,
    public qlib::LUIDObject
  {
    MC_SCRIPTABLE;
    friend class ::AnimObj_wrap;

  private:
    LString m_name;
    time_value m_start;
    time_value m_end;

    double m_quadric;

    int m_state;

    /// unique object ID
    qlib::uid_t m_uid;

    /// disabled flag
    bool m_bDisabled;

    /// Reference anim obj name for
    ///  the relative start/end time definition
    LString m_refName;

    time_value m_relStart;
    time_value m_relEnd;

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

    /////////////

    qlib::LScrTime getScrAbsStart() const {
      return qlib::LScrTime(getAbsStart());
    }

    qlib::time_value getAbsStart() const {
      return m_start;
    }

    void setAbsStart(qlib::time_value value) {
      m_start = value;
    }

    //

    qlib::LScrTime getScrRelStart() const {
      return qlib::LScrTime(getRelStart());
    }

    void setScrRelStart(const qlib::LScrTime &value) {
      setRelStart(value.getValue());
    }
    
    qlib::time_value getRelStart() const {
      return m_relStart;
    }

    void setRelStart(qlib::time_value value);
    
    /////////////

    qlib::LScrTime getScrAbsEnd() const {
      return qlib::LScrTime(getAbsEnd());
    }

    qlib::time_value getAbsEnd() const {
      return m_end;
    }
    
    void setAbsEnd(qlib::time_value value) {
      m_end = value;
    }

    //

    qlib::LScrTime getScrRelEnd() const {
      return qlib::LScrTime(getRelEnd());
    }

    qlib::time_value getRelEnd() const {
      return m_relEnd;
    }

    void setScrRelEnd(const qlib::LScrTime &value) {
      setRelEnd( value.getValue() );
    }
    
    void setRelEnd(qlib::time_value value);

    /////////////
    
    const LString &getTimeRefName() const {
      return m_refName;
    }

    void setTimeRefName(const LString &nm);

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

    double getRho(qlib::time_value elapsed) const;

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

  private:
    bool m_bTimeResolved;
    bool m_bMark;

  public:
    bool isTimeResolved() const {
      return m_bTimeResolved;
    }

    void setTimeResolved(bool b) {
      m_bTimeResolved = b;
    }

    bool isMarked() const {
      return m_bMark;
    }

    void setMarked(bool b) {
      m_bMark = b;
    }

  };

  typedef qlib::LScrSp<AnimObj> AnimObjPtr;

}

#endif


