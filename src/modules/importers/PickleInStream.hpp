// -*-Mode: C++;-*-
//
// Python pickle binary input filter stream
//

#ifndef PICKLE_INPUT_STREAM_HPP_INCLUDED
#define PICKLE_INPUT_STREAM_HPP_INCLUDED

#include "importers.hpp"

#include <qlib/BinStream.hpp>
#include <qlib/LExceptions.hpp>
#include <qlib/LVariant.hpp>
#include <qlib/LVarList.hpp>
#include <qlib/LVarDict.hpp>

namespace importers {

  using qlib::LString;
  using qlib::LVariant;
  using qlib::LVarList;
  using qlib::LVarDict;

  ///
  ///  Python pickle binary input filter stream
  ///    Adapted from org.jmol.adapter.readers.pymol.PickleReader.java
  ///
  class IMPORTERS_API PickleInStream : public qlib::BinInStream
  {
  public:
    typedef qlib::BinInStream super_t;
      
  public:
    PickleInStream() : super_t(),
    m_lastMark(0), m_markCount(0), m_retrieveCount(0)
    {
    }

    PickleInStream(InStream &r) : super_t(r),
    m_lastMark(0), m_markCount(0), m_retrieveCount(0)
    {
    }

    /// copy ctor
    PickleInStream(PickleInStream &r) : super_t(r),
    m_lastMark(0), m_markCount(0), m_retrieveCount(0)
    {
    }

    /// dtor
    virtual ~PickleInStream();

    /// copy operator
    const PickleInStream &operator=(const PickleInStream &arg) {
      super_t::operator=(arg);
      return *this;
    }

  private:

    static const int APPEND = 97; /* a */
    static const int APPENDS = 101; /* e */
    static const int BINFLOAT = 71; /* G */
    static const int BININT = 74; /* J */
    static const int BININT1 = 75; /* K */
    static const int BININT2 = 77; /* M */
    static const int BINPUT = 113; /* q */
    static const int BINSTRING = 84; /* T */
    static const int BINUNICODE = 87; /* X */
    static const int BUILD = 98; /* b */
    static const int EMPTY_DICT = 125; /* } */
    static const int EMPTY_LIST = 93; /* ] */
    static const int GLOBAL = 99; /* c */
    static const int LONG_BINPUT = 114; /* r */
    static const int MARK = 40; /* ( */
    static const int NONE = 78; /* N */
    static const int OBJ = 111; /* o */
    static const int SETITEM = 115; /* s */
    static const int SETITEMS = 117; /* u */
    static const int SHORT_BINSTRING = 85; /* U */
    static const int STOP = 46; /* . */
    static const int BINGET = 104; /* h */
    static const int LONG_BINGET = 106; /* j */
    static const int TUPLE = 116; /* t */
    static const int INT = 73; /* I */

    typedef qlib::LVariant variant_t;

    //////////////////////////////////////
    // read binary data

    double readDouble()
    {
      double rval;
      super_t::read((char*)&rval, 0, sizeof (double));
      qlib::LByteNormalizeBE<double>::doit(rval);
      return rval;
    }

    qint32 readIntLE()
    {
      qint32 rval;
      super_t::read((char*)&rval, 0, sizeof (qint32));
      //LOG_DPRINTLN("ReadIntLE pre=%d", rval);
      qlib::LByteNormalize<qint32>::doit(rval);
      //LOG_DPRINTLN("ReadIntLE post=%d", rval);
      return rval;
    }

    LString readString()
    {
      LString rval;
      while (true) {
        int b = read();
        if (b == 0xA)
          break;
        //sb.appendC((char) b);
        rval += char(b);
      }
      return rval;
    }

    //////////////////////////////////////

    LVariant *createNull()
    {
      return MB_NEW LVariant();
    }
    LVariant *createInt(int n)
    {
      return MB_NEW LVariant(n);
    }
    LVariant *createString(const LString &s)
    {
      return MB_NEW LVariant(s);
    }
    LVariant *createFloat(double f)
    {
      return MB_NEW LVariant(f);
    }

    LVariant *createDict()
    {
      return MB_NEW LVariant(MB_NEW LVarDict());
    }

    LVariant *createList(int n=0)
    {
      return MB_NEW LVariant(MB_NEW LVarList(n));
    }
    

    //////////////////////////////////////
    // STACK

    /// stack of reading data
    LVarList m_stack; 

    void push(LVariant *o)
    {
      //if (logging
      //&& (o instanceof String || o instanceof Double || o instanceof Integer))
      //log((o instanceof String ? "'" + o + "'" : o) + ", ");
      m_stack.push_back(o);
    }
    
    LVariant *peek() {
      return m_stack.back();
      //return m_stack.get(stack.size() - 1);
    }
    
    LVariant *pop()
    {
      LVariant *rval = m_stack.back();
      m_stack.pop_back();
      return rval;
      //return stack.remove(stack.size() - 1);
    }
    
    //////////////////////////////////////
    // MARK

    /// Mark stack
    std::list<int> m_marks;
    int m_lastMark;
    int m_markCount;
    
    void putMark(int i)
    {
      //if (logging)
      //log("\n " + Integer.toHexString((int) binaryDoc.getPosition()) + " [");
      
      m_marks.push_back(i);
      m_lastMark = i;
      
      m_markCount++;
      
      switch (m_markCount) {
      case 2:
        // XXX: TO DO implem
        //   thisSection = stack.get(i - 2);
        //   inMovie = "movie".equals(thisSection);
        //   inNames = "names".equals(thisSection);
        break;
      default:
        break;
      }
    }
    
    int getMark()
    {
      int rval = m_marks.back();
      m_marks.pop_back();
      --m_markCount;
      return rval;
    }

    //////////////////////////////////////
    // MEMO

    typedef std::map<int, LVariant*> ValTable;
    ValTable m_memo; // = new Hashtable<Integer, Object>();
    int m_retrieveCount;
    
    void putMemo(int i, bool doCheck)
    {
      LVariant *o = peek();
      
      if (o->isString()) {
        // XXX: handle the inMovie case
        // if (doCheck && markCount >= 6 || markCount == 3 && inMovie)
        //  return;
        if (doCheck && m_markCount >= 6)
          return;
        m_memo.insert(ValTable::value_type(i, o));
        //MB_DPRINTLN("caching string");
        //System.out.println("caching string " + o + " at " + binaryDoc.getPosition());
      }
    }
  
    LVariant *getMemo(int i)
    {
      ValTable::const_iterator iter = m_memo.find(i);
      if (iter==m_memo.end()) {
        MB_DPRINTLN("  ERROR!! memo %d not found!!", i);
        return NULL;
      }
      LVariant *o = iter->second;
      //Object o = memo.get(Integer.valueOf(i));
      //if (o == null)
      //return o;
      //System.out.println("retrieving string " + o + " at " + binaryDoc.getPosition());

      //MB_DPRINTLN("retrieving string");
      m_retrieveCount++;
      
      return o;
    }
    
    LVariant *getObjects(int mark)
    {
      int ssz = m_stack.size();
      //MB_DPRINTLN("GetObjects %d - %d", mark, ssz);
      int n = ssz - mark;
      LVariant *pargs = createList(n);

      //for (int j = 0; j < n; j++)
      //args->m_listValue.push_back(NULL);
      //args.addLast(null);
      
      for (int j = n, i = ssz; --i >= mark;) {
        pargs->getListPtr()->at(--j) = pop();
      }
      
      return pargs;
    }

    //////////////////////////////////////


  public:
    //////////////////////////////////////

    LVariant *getMap();

  }; // class PickleInStream

}

#endif

