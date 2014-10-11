
#ifndef __TEST_CLASS_A__
#define __TEST_CLASS_A__

#include <qlib/LString.hpp>
#include <qlib/LScrObjects.hpp>
#include <qlib/LScrSmartPtr.hpp>
#include <qlib/LScrVector4D.hpp>
#include <qlib/mcutils.hpp>

namespace qlib {
  class LClass;
}

class LClass_ClassA;


using qlib::LObject;
using qlib::LClass;
using qlib::LString;
using qlib::LReal;
using qlib::LDynamic;
using qlib::LScrSp;
using qlib::LScrVector4D;

class ClassA;
typedef LScrSp<ClassA> ClassAPtr;

//MCINFO: class test::ClassA
class QLIB_API ClassA : public qlib::LSimpleCopyScrObject
{

  MC_SCRIPTABLE;
  MC_CLONEABLE;

private:
  //friend class ClassA_wrap;
  //friend class SPtrClassA_wrap;
public:

  bool m_bProp0;

  int m_nProp1;

  int m_nEnumProp;
  enum {
    ENUM_TYPE0 = 0,
    ENUM_TYPE1 = 1,
    ENUM_TYPE2 = 2,
    ENUM_TYPE3 = 3,
  };

  double m_dProp;

  LString m_strProp;

  LScrVector4D m_vecProp;

  ClassAPtr m_pProp3;

public:
  ClassA() : m_bProp0(true), m_nProp1(100), m_dProp(1.2345), m_strProp("pospos"), m_prop4(123)
  {
    LOG_DPRINTLN("ClassA (%p) created", this);
    //m_vecProp = LScrSp<qlib::LScrVector4D>(MB_NEW qlib::LScrVector4D(3,2,1,0));
    resetAllProps();
  }

  ClassA(const ClassA &r)
    : m_nProp1(r.m_nProp1), m_strProp(r.m_strProp)
  {
    LOG_DPRINTLN("ClassA copy (%p) created", this);
  }

  virtual ~ClassA()
  {
    LOG_DPRINTLN("ClassA(%p) destructed", this);
  }

public:

  /** assignment operator */
  const ClassA &operator=(const ClassA &arg) {
    if(&arg!=this) {
      m_nProp1 = arg.m_nProp1;
      m_strProp = arg.m_strProp;
    }
    return *this;
  }

  void foo(int v, const LString &str, double d) {
    m_strProp = LString::format("value is %d and %s", v, str.c_str());
    m_dProp = d;
    LOG_DPRINTLN("FOO CALLED: int=%d, str=%s, real=%f", v, m_strProp.c_str(), d);
    return; // m_strProp;
  }
    
  void foo2(const ClassA &rA, ClassAPtr spA) {
    MB_DPRINTLN("ClassA::foo2() called");
    return;
  }

  ClassAPtr foo3() {
    MB_DPRINTLN("ClassA::foo3() called");
    return m_pProp3;
  }

  LString toString() const {
    return LString::format("ClassA(%d, %s)",
			   m_nProp1, m_strProp.c_str());
  }

  int m_prop4;

  int get_prop4() const {
    MB_DPRINTLN("ClassA::get_prop4() called");
    return m_prop4;
  }

  void set_prop4(int n) {
    MB_DPRINTLN("ClassA::set_prop4() called");
    m_prop4 = n;
  }

  static ClassA *fromStringS(const LString &aStr);
};

//////////////////////////////////////////////////////////////

//MCINFO: class test::ClassB extends (test::ClassA)
class QLIB_API ClassB : public ClassA
{
  MC_SCRIPTABLE;
  MC_CLONEABLE;
  
public:
  //friend class ClassB_wrap;
  //friend class SPtrClassB_wrap;
  //private:
  
public:
  ClassB() : ClassA() {
    LOG_DPRINTLN("ClassB (%p) created", this);
  }
  virtual ~ClassB() {
    LOG_DPRINTLN("ClassB(%p) destructed", this);
  }
  
  LString toString() const {
    return LString::format("ClassB (%s)", ClassA::toString().c_str());
  }
  
  void bar(double r) {
    MB_DPRINTLN("ClassB::bar(%f) called", r);
    return;
  }
};

typedef LScrSp<ClassB> ClassBPtr;

//////////////////////////////////////////////////////////////

class QLIB_API ClassS : public qlib::LSingletonScrObject
{
  MC_SCRIPTABLE;

private:
  ClassS() {
    printf("ClassS created\n");
  }
  virtual ~ClassS() { LOG_DPRINTLN("ClassS(%p) destructed", this); }

public:
  LString toString() const {
    LOG_DPRINTLN("ClassS::toString() called");
    return LString::format("ClassS");
  }

  static ClassS *getInstance() {
    return s_pInst;
  }

  static bool initClass(qlib::LClass *) {
    s_pInst = MB_NEW ClassS;
    if (!s_pInst) return false;
    return true;
  }

  static void finiClass(qlib::LClass *) {
    if (s_pInst!=NULL) delete s_pInst;
  }

private:
  static ClassS *s_pInst;
};

#if 0
  //////////////////////////////////////////////////////////////

  //MCINFO: class test::ClassC extends (test::ClassA)
  class ClassC : public ClassA
  {
    MC_SCRIPTABLE;
    // MC_CLONEABLE;

  private:

    MC_PROPDEF(LReal, m_dProp3, prop3);
    MC_PROPDEF(bool, m_bProp4, prop4);
    MC_PROPDEF(test::ClassA *, m_pObjProp5, prop5);

  public:
    ClassC() : m_dProp3(3.14), m_bProp4(true) {
      m_pObjProp5 = MB_NEW ClassA;
      // m_pObjProp5->addRef();
      printf("ClassC created\n");
    }

    virtual ~ClassC() {
      if (m_pObjProp5!=NULL) m_pObjProp5->destruct();
      printf("ClassC(%p) destructed\n", this);
    }

    MC_MTHDEF0(LString, toString);
    LString toString() const {
      return LString::format("ClassC(%f, %d, %p)", m_dProp3, m_bProp4, m_pObjProp5);
    }

    MC_MTHDEF0(test::ClassA *, getObjProp5);
    ClassA *getObjProp5() const {
      m_pObjProp5->addRef();
      return m_pObjProp5;
    }

    MC_MTHDEF2(void, setObjProp5, "(test::ClassA*)");
    void setObjProp5(ClassA *pobj)
    {
      if (m_pObjProp5!=NULL)
	m_pObjProp5->release();
      m_pObjProp5 = pobj;
      if (m_pObjProp5!=NULL)
	m_pObjProp5->addRef();
    }
  };
#endif

#endif // __TEST_CLASS_A__
