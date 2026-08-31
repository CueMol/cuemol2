// -*-Mode: C++;-*-
//
// Python pickle binary input filter stream
//

#include <common.h>

#include "PickleInStream.hpp"

#include <memory>
#include <string>
#include <utility>

using namespace importers;

PickleInStream::~PickleInStream()
{
/*
  if (!m_memo.empty()) {
    ValTable::iterator i = m_memo.begin();
    ValTable::iterator e = m_memo.end();
    for (;i!=e; ++i) {
      if (i->second!=NULL)
        delete i->second;
    }
  }

  if (!m_stack.empty()) {
    LVarList::iterator i = m_stack.begin();
    LVarList::iterator e = m_stack.end();
    for (;i!=e; ++i) {
      if (*i!=NULL)
        delete *i;
    }
  }
*/
}

LVariant *PickleInStream::getMap()
{
  bool bGoing = true;
  char sbuf[1024];
  
  while (bGoing) {

    int b = read();

    switch (b) {

    case EMPTY_DICT:
      // MB_DPRINTLN("EMPTY_DICT");
      push(createDict());
      break;

    case APPEND: {
      // MB_DPRINTLN("APPEND");
      LVariant *p = pop();
      LVariant *phead = peek();
      if (!phead->isList()) {
        MB_THROW(qlib::FileFormatException, "Invalid pickle format (APPEND op mismatch)");
        return NULL;
     }
      phead->getListPtr()->push_back(p);
      break;
    }

    case APPENDS: {
      int i = getMark();
      LVariant *pobjs = getObjects(i);

      // TO DO: implementation
      // if (inNames && markCount == 2){// && l.size() > 0 && l.get(0) == thisName) {
      //   int pt = (int) binaryDoc.getPosition();
      //   //System.out.println(" " + thisName + " " + filePt + " " + (pt - filePt));
      //   Lst<Object> l2 = new Lst<Object>();
      //   l2.addLast(Integer.valueOf(filePt));
      //   l2.addLast(Integer.valueOf(pt - filePt));
      //   l.addLast(l2); // [ptr to start of this PyMOL object, length in bytes ]
      // }

      LVariant *phead = peek();

      if (!phead->isList()) {
        MB_THROW(qlib::FileFormatException, "Invalid pickle format (APPEND op mismatch)");
        return NULL;
      }

      while (!pobjs->getListPtr()->empty()) {
        LVariant *p3 = pobjs->getListPtr()->front_pop_front();
        phead->getListPtr()->push_back(p3);
      }
      delete pobjs;

      // MB_DPRINTLN("APPENDS to mark=%d OK", i);
      break;
    }

    case BINFLOAT: {
      double d = readDouble();
      push(createFloat(d));
      // MB_DPRINTLN("BINFLOAT %f", d);
      break;
    }
      
    case BININT: {
      int i = readIntLE();
      push(createInt(i));
      // MB_DPRINTLN("BININT %d", i);
      break;
    }
      
    case BININT1: {
      int i = read() & 0xff;
      push(createInt(i));
      // MB_DPRINTLN("BININT1 %d", i);
      break;
    }
      
    case BININT2: {
      int b1 = read() & 0xff;
      int b2 = read() & 0xff;
      int i = b1 | (b2<<8);
      // int i = (read() & 0xff | ((read() & 0xff) << 8)) & 0xffff;
      push(createInt(i));
      //LOG_DPRINTLN("BININT2 %d", i);
      break;
    }
      
    case BINPUT: {
      int i = read();
      putMemo(i, false);
      // MB_DPRINTLN("BINPUT %d OK", i);
      break;
    }
      
    case LONG_BINPUT: {
      int i = readIntLE();
      putMemo(i, true);
      // MB_DPRINTLN("LONG_BINPUT %d OK", i);
      break;
    }
      
    case BINGET: {
      int i = read();
      LVariant *o = getMemo(i);
      if (o==NULL) {
        MB_DPRINTLN("ERROR!! BINGET %d", i);
        push(createString("BINGET"));
      }
      else {
        push(o);
      }
      // MB_DPRINTLN("BINGET %d OK", i);
      break;
    }
      
    case LONG_BINGET: {
      int i = readIntLE();
      LVariant *o = getMemo(i);
      if (o == NULL) {
        // Logger.error("did not find memo item for " + i);
        MB_DPRINTLN("ERROR!! LONGBINGET memo %d not found!!", i);
        push(createString("LONG_BINGET"));
      }
      else {
        push(o);
      }
      // MB_DPRINTLN("LONGBINGET %d OK", i);
      break;
    }
      
    case SHORT_BINSTRING: {
      int i = read() & 0xff;
      read(sbuf, 0, i);
      sbuf[i]='\0';
      // TO DO: impl??
      // if (inNames && markCount == 3 && lastMark == stack.size()) {
      //   //thisName = s;
      //   filePt = emptyListPt;
      // }
      push(createString(LString(sbuf)));
      // MB_DPRINTLN("SHORT_BINSTRING len=%d, %s", i, s.c_str());
      break;
    }
      
    case BINSTRING:
    case BINUNICODE: {
      // BINUNICODE carries UTF-8; both are stored as-is
      int i = readIntLE();
      if (i<0) {
        MB_THROW(qlib::FileFormatException, "Invalid pickle format (negative string length)");
        return NULL;
      }
      std::string s(size_t(i), '\0');
      if (i>0)
        readFully(&s[0], 0, i);
      push(createString(LString(s)));
      break;
    }
      
    case EMPTY_LIST:
      // MB_DPRINTLN("EMPTY_LIST");
      //emptyListPt = (int) binaryDoc.getPosition() - 1;
      push(createList());
      break;

    case GLOBAL: {
      // MB_DPRINTLN("GLOBAL");
      LVariant *o = createList();
      o->getListPtr()->push_back(createString("global"));
      o->getListPtr()->push_back(createString(readString()));
      o->getListPtr()->push_back(createString(readString()));
      push(o);
      break;
    }
      
    case BUILD: {
      // MB_DPRINTLN("BUILD");
      LVariant *o = pop();
      //build.addLast(o);
      delete o;
      break;
    }
      
    case MARK: {
      int i = m_stack.size();
      putMark(i);
      // MB_DPRINTLN("MARK (stack=%d)", i);
      break;
    }
      
    case NONE:
      // MB_DPRINTLN("NONE");
      push(createNull());
      break;

    case OBJ: {
      int i = getMark();
      push(getObjects(i));
      // MB_DPRINTLN("OBJ %d", i);
      break;
    }

    case SETITEM: {
      std::unique_ptr<LVariant> o(pop());
      std::unique_ptr<LVariant> pkey(pop());
      if (!pkey->isString()) {
        MB_THROW(qlib::FileFormatException, "Invalid pickle format (SETITEM op mismatch)");
        return NULL;
      }
      LVariant *phead = peek();
      if (!phead->isDict()) {
        MB_THROW(qlib::FileFormatException, "Invalid pickle format (SETITEM on non-dict)");
        return NULL;
      }
      // the dict owns the value from here on
      phead->getDictPtr()->set(pkey->getStringValue(), std::move(*o));
      break;
    }

    case SETITEMS: {
      int mark = getMark();
      std::unique_ptr<LVariant> pobjs(getObjects(mark));
      LVarList *pItems = pobjs->getListPtr();
      LVariant *phead = peek();
      if (phead->isList()) {
        while (!pItems->empty()) {
          LVariant *o3 = pItems->front_pop_front();
          phead->getListPtr()->push_back(o3);
        }
      }
      else if (phead->isDict()) {
        // the items are key/value pairs
        if (pItems->size()%2!=0) {
          MB_THROW(qlib::FileFormatException, "Invalid pickle format (SETITEMS odd item count)");
          return NULL;
        }
        while (!pItems->empty()) {
          std::unique_ptr<LVariant> pvalue(pItems->back_pop_back());
          std::unique_ptr<LVariant> pkey(pItems->back_pop_back());
          if (!pkey->isString()) {
            MB_THROW(qlib::FileFormatException, "Invalid pickle format (SETITEMS key is not a string)");
            return NULL;
          }
          phead->getDictPtr()->set(pkey->getStringValue(), std::move(*pvalue));
        }
      }
      else {
        MB_THROW(qlib::FileFormatException, "Invalid pickle format (SETITEMS op mismatch)");
        return NULL;
      }
      break;
    }

    case STOP:
      // MB_DPRINTLN("STOP");
      bGoing = false;
      break;

    case TUPLE: {
      // used for view_dict
      int i = getMark();
      push(getObjects(i));
      // MB_DPRINTLN("TUPLE %d", i);
      break;
    }

    case INT: {
      /// 0x88000000 for instance
      LString s = readString();
      int n;
      if (!s.toInt(&n)) {
        LString msg = LString::format("Invalid pickle format (invalid INT op %s)", s.c_str());
        MB_THROW(qlib::FileFormatException, msg);
        return NULL;
      }
      push(createInt(n));
      // MB_DPRINTLN("INT %d OK", n);
      break;
    }

    default: {
      // not used?
      LString msg = LString::format("Unknown opcode %d, pickle reader error", b);
      MB_THROW(qlib::FileFormatException, msg);
      return NULL;
    }
    }
  }

  LOG_DPRINTLN("PyMOL Pickle reader cached %d tokens; retrieved %d", m_memo.size(), m_retrieveCount);
  //Logger.info("PyMOL Pickle reader cached " + memo.size() + " tokens; retrieved " + retrieveCount);
  //memo = null;

  MB_DPRINTLN("====================");
  if (m_stack.empty()) {
    MB_THROW(qlib::FileFormatException, "Invalid pickle format (no object on the stack at STOP)");
    return NULL;
  }

  // the caller checks the type of the top-level object
  return m_stack.front_pop_front();
}


