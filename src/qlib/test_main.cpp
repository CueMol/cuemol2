#include <common.h>

#include <qlib/qlib.hpp>

#include <qlib/LMsgLog.hpp>
#include <qlib/LString.hpp>
#include <qlib/ClassRegistry.hpp>
#include <qlib/LClass.hpp>
#include <qlib/LWrapper.hpp>
#include <qlib/LDynamic.hpp>
#include <qlib/LDOM2Stream.hpp>
#include <qlib/StringStream.hpp>

#include "TestClass.hpp"

using namespace qlib;

//int prop_test();
int test_main();

int main()
{
  if (qlib::init())
    LOG_DPRINTLN("OK.");
  else
    LOG_DPRINTLN("Init: ERROR!!");

  test_main();

  qlib::fini();
  return 0;
}

int test_main()
{
  ClassRegistry *pMgr = ClassRegistry::getInstance();
  qlib::LClass *pcls;
  LVariant result;

  ////////

  pcls = pMgr->getClassObj("ClassB");
  LOG_DPRINTLN("classB: %s", typeid(*pcls).name());

  ClassBPtr hobjB(dynamic_cast<ClassB *>(pcls->createObj()));

  // qlib::LWrapper *pwB = hobjB.createWrapper();

  ////////

  pcls = pMgr->getClassObj("ClassA");
  LOG_DPRINTLN("classA: %s", typeid(*pcls).name());

  ClassAPtr hobjA(dynamic_cast<ClassA *>(pcls->createObj()));

  // qlib::LWrapper *pwA = hobjA.createWrapper();

  ////////

  hobjA->getProperty("prop1", result);
  LOG_DPRINTLN("get A::prop1: %d, default flag=%d",
	       result.getIntValue(), hobjA->isPropDefault("prop1"));
  

  hobjA->setProperty("prop1", 123);
  hobjA->getProperty("prop1", result);
  LOG_DPRINTLN("get A::prop1: %d==123 default flag=%d",
	       result.getIntValue(),
	       hobjA->isPropDefault("prop1"));
  // MB_ASSERT(result.getIntValue()==123);


  ////////

  hobjB->setProperty("prop3", LVariant(&hobjA, LVariant::copy_tag() ));
  hobjB->getProperty("prop3", result);
  LOG_DPRINTLN("set B::prop3: %p", hobjA.get());
  LOG_DPRINTLN("get B::prop3: %p", result.getObjectPtr() );
  //MB_ASSERT(hobjA.get()==(result.getObjectSmartPtr<ClassAPtr>()).get());

  ////////
  // Method invocation test (1): value and sptr arguments
  LOG_DPRINTLN("\n\nMethod invocation test (1): value and sptr arguments");
  {
    qlib::LVarArgs args(2);
    args.at(0).shareObjectPtr(&hobjA);
    args.at(1).shareObjectPtr(&hobjA);
    bool res = hobjB->invokeMethod("foo2", args);
    LOG_DPRINTLN("ClassA::foo2 method called: res==%d", res);
  }

  ////////
  // Method invocation test (2): return value sptr
  LOG_DPRINTLN("\n\nMethod invocation test (2): return value sptr");

  {
    qlib::LVarArgs args(0);
    bool res = hobjB->invokeMethod("foo3", args);

    ClassA *ptmp = args.retval().getObjectPtrT<ClassA>();

    LOG_DPRINTLN("foo3() result: %p", ptmp );
    MB_ASSERT(hobjA.get()==ptmp);
  }
  

  ////////
  // Property-redirection test
  LOG_DPRINTLN("\n\nProperty-redirection test");

  hobjB->setProperty("prop4", LVariant(24680));
  hobjB->getProperty("prop4", result);
  LOG_DPRINTLN("get B::prop4: %d==24680", result.getIntValue());
  MB_ASSERT(result.getIntValue()==24680);

  ////////
  // Enum test
  LOG_DPRINTLN("\n\nEnum test");

  {
    LOG_DPRINTLN("enumprop:");
    qlib::PropSpec ps;
    hobjA->getPropSpecImpl("enumprop", &ps);
    MB_ASSERT(ps.pEnumDef!=NULL);
    std::map<LString, int>::const_iterator iter = ps.pEnumDef->begin();
    for (; iter!=ps.pEnumDef->end(); ++iter)
      LOG_DPRINTLN("enum: %s->%d", (iter->first).c_str(), iter->second);

    hobjA->setPropStr("enumprop", "qux");
    hobjA->getProperty("enumprop", result);
    LOG_DPRINTLN("enumprop: set(qux) --> get(%s)", result.toString().c_str());
  }

  ////////
  // Setter autoconversion test (1): string to vector
  {
    LOG_DPRINTLN("\n\nSetter autoconversion test (1): string to vector");
    hobjB->setProperty("vecprop", LVariant("(0.1, 0.2, 0.3, 0.4)") );
    hobjB->getProperty("vecprop", result);
    LOG_DPRINTLN("get B::vecprop: %s", result.getBareObjectPtr()->toString().c_str());
  }

  ////////
  // Setter autoconversion test (2): custom fromString() test

  LOG_DPRINTLN("\n\nSetter autoconversion test (2): custom fromString() test");
  hobjA->setProperty("prop3", LVariant("B") );

  ////////
  // Serialization test

  LString written;
  {
    LOG_DPRINTLN("\n\nSerialization test");
    qlib::LDom2Tree tree("root");
    // hobjB->writeTo2(tree.current());
    tree.serialize(hobjB.get());
    tree.dump();

    qlib::StrOutStream sos;
    qlib::LDom2OutStream dos(sos);
    dos.write(&tree);
    sos.close();
    written = sos.getString();
    LOG_DPRINTLN("XML:\n%s\n", written.c_str());
  }

  //
  {
    LOG_DPRINTLN("\n\nDeSerialization test");
    qlib::LDom2Tree tree2;
    qlib::StrInStream sis(written);
    qlib::LDom2InStream dis(sis);
    dis.read(tree2);
    tree2.dump();

    qlib::LScriptable *pNewObj = dynamic_cast<qlib::LScriptable*>(tree2.deserialize());

    pNewObj->getProperty("vecprop", result);
    LOG_DPRINTLN("NewObj ::vecprop: %s", result.getBareObjectPtr()->toString().c_str());

    delete pNewObj;
  }

  // delete hobjB;
  // delete hobjA;
  LOG_DPRINTLN("\n\nOK");
  return 0;
}

#if 0
namespace io = boost::iostreams;
typedef io::stream<io::file_sink> myofstream;

int test_main()
{
  io::filtering_ostream *pstr = MB_NEW io::filtering_ostream;
  pstr->push(io::bzip2_compressor());
  pstr->push(io::file_sink("foo.bar.bz2"));
  BoostOutStream bos(pstr);
  PrintStream ps(bos);

  for (int i=0; i<10000; ++i)
    ps.format("lskadfjasldfsdf %d", i);
}
#endif


#if 0
int prop_test()
{
  ClassRegistry *pMgr = ClassRegistry::getInstance();
  qlib::LClass *pcls;
  
  ////////

  pcls = pMgr->getClassObj("ClassA");
  if (pcls==NULL) {
    LOG_DPRINTLN("ClassA class obj failed");
    return 0;
  }

  ClassA *pnewobj = dynamic_cast<ClassA *>(pcls->createObj());
  ClassA *pobj2 = dynamic_cast<ClassA *>(pcls->createObj());
  if (pnewobj==NULL) {
    LOG_DPRINTLN("ClassA instance failed");
    return 0;
  }

  ClassAPtr hnewobj(pnewobj);
  ClassAPtr hobj2(pobj2);

  // qlib::LWrapper *pwr = dynamic_cast<qlib::LWrapper *>(pcls);
  qlib::LWrapper *pwr = hnewobj.createWrapper();

  

  ////////

  pcls = pMgr->getClassObj("ClassB");

  if (pcls==NULL) {
    LOG_DPRINTLN("ClassB class obj failed");
    return 0;
  }
  LOG_DPRINTLN("classB: %s", typeid(*pcls).name());
  ClassB *pobjB = dynamic_cast<ClassB *>(pcls->createObj());
  if (pobjB==NULL) {
    LOG_DPRINTLN("ClassB instance failed");
    return 0;
  }

  ClassBPtr hobjB(pobjB);
  // qlib::LWrapper *pBwr = dynamic_cast<qlib::LWrapper *>(pcls);
  qlib::LWrapper *pBwr = hobjB.createWrapper();

  ////////

  pwr->setProp("prop1", LVariant(123));

  pwr->setProp("prop3", LVariant(&hobj2));
  LOG_DPRINTLN("----------");
  LVariant result;
  pwr->getProp("prop1", result);
  LOG_DPRINTLN("get prop1: %d", result.getIntValue());

  sleep(1);
  pwr->getProp("prop3", result);
  LOG_DPRINTLN("333333333333333");
  LOG_DPRINTLN("get prop3: %p", result.getObjectValue());
  LOG_DPRINTLN("444444444444444");
  LOG_DPRINTLN("555555555555");

  {
    qlib::LVarArgs args(3);
    args.at(0).setIntValue(1234);
    args.at(1).setStringValue("xxx");
    args.at(2).shareObjectPtr(&hobj2);
    bool res = pwr->invokeMethod("foo", args);
    LOG_DPRINTLN("foo method called: %d", res);
  }

  {
    qlib::LVarArgs args(0);
    bool res = pwr->invokeMethod("toString", args);
    LOG_DPRINTLN("toString method called: %d, %s", res, args.retval().getStringValue().c_str());
  }
  
  {
    qlib::LVarArgs args(0);
    bool res = pBwr->invokeMethod("toString", args);
    LOG_DPRINTLN("toString method called: %d, %s", res, args.retval().getStringValue().c_str());
  }

  {
    LVariant result;
    pwr->getProp("prop1", result);
    LOG_DPRINTLN("get prop1: %d", result.getIntValue());
  }


  //pnewobj->destruct();
  //pobjB->destruct();

  delete pwr;
  delete pBwr;
  return 0;
}
#endif
