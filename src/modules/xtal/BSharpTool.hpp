
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

  class BSharpTool : public qlib::LNoCopyScrObject
  {
    MC_SCRIPTABLE;

  private:
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
    
    void attach(const qsys::ObjectPtr &pMap);
    void detach();
    
    void clear();

    void preview(double b_factor);

    void apply(double b_factor);
  };

}

#endif

