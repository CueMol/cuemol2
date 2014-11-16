#
#
#

namespace cpp xrbr
namespace py qm2thrift

exception AuthException {
  1: string why
}

exception PropertyException {
  1: string why
}

exception ValueException {
  1: string why
}

enum Type {
  LT_NULL = 0,
  LT_BOOLEAN = 1,
  LT_INTEGER = 2,
  LT_REAL    = 3,
  LT_STRING  = 4,
  LT_OBJECT  = 5,
#  LT_SMARTPTR = 6,
  LT_ENUM  = 7,
  LT_ARRAY = 8,
  LT_DICT  = 9,
}

struct Variant {
  1: Type type,

  2: optional bool boolValue,

  3: optional i32 intValue,

  4: optional double realValue,

  5: optional string strValue,

  6: optional i32 objidValue,
  7: optional string className,
}

service CueMol {
   void test()

   i32 createObj(1:string cred, 2:string clsnm)
   i32 getService(1:string cred, 2:string clsnm)
   void destroyObj(1:string cred, 2:i32 objid)
   oneway void destroyObjAsyn(1:string cred, 2:i32 objid)

   byte hasProp(1:string cred, 2:i32 objid, 3:string propnm)
   Variant getProp(1:string cred, 2:i32 objid, 3:string propnm)
   void setProp(1:string cred, 2:i32 objid, 3:string propnm, 4: Variant value)

   Variant callMethod(1:string cred, 2:i32 objid, 3:string mthnm, 4: list<Variant> argv)

}

