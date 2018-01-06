
#ifndef XTAL_CUDA_BSHARP_TOOL_INCLUDED
#define XTAL_CUDA_BSHARP_TOOL_INCLUDED

#include "xtal.hpp"

#include "BSharpTool.hpp"

namespace xtal {

  using qlib::FloatArray;
  using qlib::CompArray;

  class HKLList;

  class XTAL_API CudaBSharpTool : public BSharpTool
  {
    MC_SCRIPTABLE;

    typedef BSharpTool super_t;

  private:
    // CUDA device ptrs
    /// HKL list
    void *dp_hkl;
    /// Reciprocal array
    void *dp_recip;
    /// Float map
    void *dp_map;
    /// Temp array for stat calc
    void *dp_tmp;

    /// cufft plan
    int m_fftplan;

    /// Cuda graphics resource (OpenGL TBO)
    void *m_gfxRes;

    /// Thread number per block
    static const int NTHR = 1024;

  public:

    CudaBSharpTool();

    virtual ~CudaBSharpTool();
    
    virtual void attach(const qsys::ObjectPtr &pMap);
    // virtual void detach();
    
    virtual void clear();

    virtual void preview(double b_factor);

    // virtual void apply(double b_factor);

  private:
    void convtoary_herm(float b_factor);

    float m_min,m_max,m_mean,m_rmsd;

    void calcmapstat_herm();

    void makebmap();

  };

}

#endif


