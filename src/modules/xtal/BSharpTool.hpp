
#ifndef XTAL_BSHARP_TOOL_INCLUDED
#define XTAL_BSHARP_TOOL_INCLUDED

#include "xtal.hpp"
#include <qlib/LScrObjects.hpp>
#include <qlib/LScrSmartPtr.hpp>
#include <qlib/mcutils.hpp>
#include <qlib/Array.hpp>
#include <qsys/qsys.hpp>
#include "DensityMap.hpp"

namespace xtal {

  using qlib::FloatArray;
  using qlib::CompArray;

  class HKLList;

  class XTAL_API BSharpTool : public qlib::LNoCopyScrObject
  {
    MC_SCRIPTABLE;

  protected:
    DensityMapPtr m_pMap;

    FloatArray *m_pFloatMap;

    CompArray *m_pRecipAry;

    int m_na, m_nb, m_nc;
    HKLList *m_pHKLList;

  public:

    BSharpTool()
         : m_pFloatMap(NULL), m_pRecipAry(NULL)
    {
    }

    virtual ~BSharpTool();
    
    virtual void attach(const qsys::ObjectPtr &pMap);
    virtual void detach();
    
    virtual void clear();

    virtual void preview(double b_factor);

    virtual void apply(double b_factor);
  };

}

#endif

