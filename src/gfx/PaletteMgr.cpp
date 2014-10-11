// -*-Mode: C++;-*-
//
// System color palette database
//
// $Id: PaletteMgr.cpp,v 1.2 2009/12/01 15:18:11 rishitani Exp $

#include <common.h>

#include "PaletteMgr.hpp"
#include "SolidColor.hpp"

#include <qlib/ExpatInStream.hpp>

SINGLETON_BASE_IMPL(gfx::PaletteMgr);

using namespace gfx;

PaletteMgr::PaletteMgr()
{
}

PaletteMgr::~PaletteMgr()
{
}

SolidColorPtr PaletteMgr::get(const LString &rkey) const
{
  LString key = rkey.toLowerCase();
  //LString fqn = LString("default")+delimitor+key;
  const_iterator iter = m_data.find(key);
  if (iter==m_data.end()) 
   return SolidColorPtr();
  return iter->second;
}

bool PaletteMgr::put(const LString &rkey, const LString &value)
{
  LString key = rkey.toLowerCase();
  const_iterator iter = m_data.find(key);
  if (iter!=m_data.end())
    return false;

  SolidColorPtr rcol(new SolidColor);
  if (!rcol->fromString(value))
    return false;
  
  return m_data.insert(data_t::value_type(key, rcol)).second;
}

namespace {

  /**
     parser for the system config in xml format
  */
  class PaletteMgrTabReader : public qlib::ExpatInStream
  {
  private:
    PaletteMgr *m_pDB;
    
  public:
    PaletteMgrTabReader(InStream &r) : ExpatInStream(r), m_pDB(NULL) {
    }
    
    virtual ~PaletteMgrTabReader() {
    }
    
    void setDB(PaletteMgr *pDB) {
      m_pDB = pDB;
    }
    
    //////////////////////////////////////////////////////////////////////////////

    virtual void startElement(const LString &name, const Attributes &attr) {
      if (name.equals("palette")) {
        return;
      }
      
      if (!name.equals("color")) {
        setError("Unknown entry found.");
        return;
      }
      
      int i;
      LString strName, strValue;

      Attributes::const_iterator iter = attr.begin();
      for (; iter!=attr.end(); ++iter) {
        const LString &prop = iter->first;
        const LString &val = iter->second;
        if (prop.equals("name"))
	  strName = val;
        else if (prop.equals("value"))
	  strValue = val;
      }

      // Entry must has key attribute
      if (strName.isEmpty() || strValue.isEmpty()) {
        setError("Color entry without name or value  attribute was found.");
        return;
      }

      m_pDB->put(strName, strValue);
    }

    virtual void endElement(const LString &name) {
      //if (name.equals("entry"))
      //endEntry();
    }

  };

} // namespace

void PaletteMgr::read(qlib::InStream &ins)
{
  PaletteMgrTabReader reader(ins);
  reader.setDB(this);
  reader.parse();
  return;
}

