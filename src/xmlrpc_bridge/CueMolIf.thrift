#
#
#

namespace cpp xrbr
namespace py cuemol2

exception AuthException {
  1: string why
}

enum Type {
  LT_NULL = 0,
  LT_BOOLEAN = 1,
  LT_INTEGER = 2,
  LT_REAL    = 3,
  LT_STRING  = 4,
  LT_OBJECT  = 5,
#  SMARTPTR  = 6,
#  ENUM  = 7,
#  ARRAY = 8,
}

struct Variant {
  1: Type type,
  2: optional bool boolValue,
  3: optional i32 intValue,
  4: optional double realValue,
  5: optional string strValue,
  6: optional i32 objidValue,
}

service CueMol {
   void test()

   i32 createObj(1:string cred, 2:string clsnm)
   i32 getService(1:string cred, 2:string clsnm)
   void destroyObj(1:string cred, 2:i32 objid)
   oneway void destroyObjAsyn(1:string cred, 2:i32 objid)

   byte hasProp(1:string cred, 2:i32 objid, 3:string propnm)

   Variant getProp(1:string cred, 2:i32 objid, 3:string propnm)
}

