// -*-Mode: C++;-*-
//
// System color palette database
//
// $Id: PaletteMgr.hpp,v 1.1 2009/07/11 15:57:46 rishitani Exp $

#ifndef GFX_PALETTE_MGR_HPP_
#define GFX_PALETTE_MGR_HPP_

#include "gfx.hpp"

#include <qlib/MapTable.hpp>
#include <qlib/LVariant.hpp>
#include <qlib/SingletonBase.hpp>

#include "AbstractColor.hpp"

namespace qlib {
  class PrintStream;
  class InStream;
  class OutStream;
}

namespace gfx {

  using qlib::LString;

  /**
     System color palette database
  */
  class GFX_API PaletteMgr : public qlib::SingletonBase<PaletteMgr>
  {
  public:
    class Section;
    
    static const char delimitor = ':';
    
  private:
    typedef std::map<LString, SolidColorPtr> data_t;
    
    data_t m_data;

  public:
    typedef data_t::iterator iterator;
    typedef data_t::const_iterator const_iterator;
    
  public:
    
    ////////////////////////////////////////////
    //
    
    PaletteMgr();
    virtual ~PaletteMgr();
    
    SolidColorPtr get(const LString &key) const;
    
    bool put(const LString &key, const LString &value);
    
    // bool put(const LString &key, const SolidColorPtr col);

    //
    
    void read(qlib::InStream &ins);
    // void write(qlib::OutStream &outs);
    
  private:
    qlib::PrintStream *m_pOut;
    std::list<LString> m_keyname;
    
    //void writeSection(Section *pSec);
    
  public:
    //////////
    // Initializer/finalizer

    static bool init()
    {
      return qlib::SingletonBase<PaletteMgr>::init();
    }
    
    static void fini()
    {
      qlib::SingletonBase<PaletteMgr>::fini();
    }
  };

}

#endif
