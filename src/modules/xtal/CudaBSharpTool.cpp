// -*-Mode: C++;-*-
//
// B-sharpening tool using CUDA impl
//

#include <common.h>
#include "CudaBSharpTool.hpp"

#ifdef HAVE_CUDA

#include <sysdep/CudartCompContext.hpp>
#include <cuda_runtime.h>
#include <cufft.h>

#include <sysdep/OglTexture.hpp>

using namespace xtal;

CudaBSharpTool::CudaBSharpTool()
     : super_t()
{
  dp_hkl = NULL;
  dp_recip = NULL;
  dp_map = NULL;
  dp_tmp = NULL;
  m_fftplan = 0;
  m_gfxRes = NULL;
  m_bUseCUDA = true;
}

CudaBSharpTool::~CudaBSharpTool()
{
  clear();
}

void CudaBSharpTool::attach(const qsys::ObjectPtr &pMap)
{
  super_t::attach(pMap);

  /// allocate CUDA resources

  const int NX = m_na;
  const int NY = m_nb;
  const int NZ = m_nc;
  const int NSIZE = NX*NY*NZ;

  // reciprocal array size (Hermite mode)
  const int NXX = NX/2 + 1;
  const int NR_SIZE = NXX*NY*NZ;

  const int HKLSZ = m_pHKLList->size();

  m_bUseCUDA = true;

  try {

    // HKL list
    chkCudaErr(
      cudaMalloc(&dp_hkl, sizeof(StrFac)*HKLSZ));
    
    // src host hkl --> device dp_hkl copy
    chkCudaErr(
      cudaMemcpy(dp_hkl, m_pHKLList->data(), sizeof(StrFac)*HKLSZ, cudaMemcpyHostToDevice));
    
    chkCudaErr(
      cudaMalloc(&dp_recip, sizeof(cufftComplex)*NR_SIZE));
    
    chkCudaErr(
      cudaMalloc(&dp_map, sizeof(float)*NSIZE));
    
    int NTMP = (NSIZE/NTHR + 1)*4;
    chkCudaErr(
      cudaMalloc(&dp_tmp, sizeof(float)*NTMP));
    
    m_fftplan;
    if (cufftPlan3d(&m_fftplan, NZ, NY, NX, CUFFT_C2R) != CUFFT_SUCCESS) {
      MB_THROW(qlib::RuntimeException, "CUFFT error: Plan creation failed");
    }
    
    /*
  void *dp_bmap;
  cudaMalloc(&dp_bmap, sizeof(char)*NSIZE);
  if (cudaGetLastError() != cudaSuccess){
    fprintf(stderr, "Cuda error: Failed to allocate\n");
    return;
  }
     */
    
    gfx::Texture *pTex = qlib::ensureNotNull( m_pMap->getMapTex() );
    sysdep::OglTextureRep *pRep = qlib::ensureNotNull( dynamic_cast<sysdep::OglTextureRep *>(pTex->getRep()) );
    GLuint vbo = pRep->getBufID();
    
    cudaGraphicsResource *tbo_cuda;
    chkCudaErr(
      cudaGraphicsGLRegisterBuffer( &tbo_cuda, vbo, cudaGraphicsMapFlagsWriteDiscard ));
    m_gfxRes = tbo_cuda;
  }
  catch (qlib::LException &e) {
    LOG_DPRINTLN("CudaBSharpTool> CUDA init failed -> use CPU version");
    m_bUseCUDA = false;
    return;
  }
  
  LOG_DPRINTLN("CudaBSharpTool> attach OK");
}

void CudaBSharpTool::clear()
{
  super_t::clear();

  /// free CUDA resources
  if (dp_hkl != NULL) {
    cudaFree(dp_hkl);
    dp_hkl = NULL;
  }
  if (dp_recip != NULL) {
    cudaFree(dp_recip);
    dp_recip = NULL;
  }
  if (dp_map != NULL) {
    cudaFree(dp_map);
    dp_map = NULL;
  }
  if (dp_tmp != NULL) {
    cudaFree(dp_tmp);
    dp_tmp = NULL;
  }

  if (m_fftplan!=0) {
    cufftDestroy(m_fftplan);
    m_fftplan = 0;
  }
  
  if (m_gfxRes!=NULL) {
    cudaGraphicsResource *tbo_cuda = static_cast<cudaGraphicsResource *>(m_gfxRes);
    cudaGraphicsUnregisterResource(tbo_cuda);
    m_gfxRes = NULL;
  }
}


void CudaBSharpTool::preview(double b_factor)
{
  if ( !m_bUseCUDA ) {
    super_t::preview(b_factor);
    return;
  }

  convtoary_herm(float(b_factor));

  if (cufftExecC2R(m_fftplan, (cufftComplex *)dp_recip, (float *)dp_map) != CUFFT_SUCCESS){
    MB_THROW(qlib::RuntimeException, "CUFFT cufftExecC2R failed.");
  }

  calcmapstat_herm();

  MB_DPRINTLN("Preview Map (bsharp=%f) statistics:", b_factor);
  MB_DPRINTLN("   minimum: %f", m_min);
  MB_DPRINTLN("   maximum: %f", m_max);
  MB_DPRINTLN("   mean   : %f", m_mean);
  MB_DPRINTLN("   r.m.s.d: %f", m_rmsd);

  m_pMap->setMapStats(m_min,m_max,m_mean,m_rmsd);

  makebmap();

  m_pMap->fireMapPreviewChgEvent();

}

void convtoary_herm_cuda(int NBLK, int NTHR,
                         StrFac *dp_hkl, int HKLSZ,
                         float *dp_recip, int NX, int NY, int NZ, int NXX,
                         float fscl, float b_factor,
                         float m00, float m11, float m22, float m01, float m02, float m12);

void CudaBSharpTool::convtoary_herm(float b_factor)
{
  const int NX = m_na;
  const int NY = m_nb;
  const int NZ = m_nc;
  const int NSIZE = NX*NY*NZ;

  // reciprocal array size (Hermite mode)
  const int NXX = NX/2 + 1;
  const int NR_SIZE = NXX*NY*NZ;

  const int HKLSZ = m_pHKLList->size();

  float m00, m11, m22, m01, m02, m12;
  m_pHKLList->m_ci.calcRecipTensor(m00, m11, m22, m01, m02, m12);
  float fscl = 1.0f/m_pHKLList->m_ci.volume();

  cudaMemset(dp_recip, 0, NR_SIZE*sizeof(float)*2);

  int NBLK = HKLSZ/NTHR;
  if (HKLSZ%NTHR!=0)
    NBLK ++;

  MB_DPRINTLN("Launch convtoary_kern NBLK=%d, NTHR=%d", NBLK, NTHR);

  convtoary_herm_cuda(NBLK, NTHR,
                      (StrFac*)dp_hkl, HKLSZ,
                      (float*)dp_recip, NX, NY, NZ, NXX,
                      fscl, b_factor,
                      m00, m11, m22, m01, m02, m12);
  
#ifdef DEBUG
  {
    // print partial results
    CompArray tmp(NXX, NY, NZ);
    cudaMemcpy( (void*)(tmp.data()), dp_recip, NR_SIZE*sizeof(float)*2, cudaMemcpyDeviceToHost);
    if (cudaGetLastError() != cudaSuccess){
      fprintf(stderr, "Cuda error: Failed to memcopy\n");
    }

    MB_DPRINTLN("convtoarray bfac=%f", b_factor);
    int h,k,l;
    for (l=0; l<2; ++l)
      for (k=0; k<2; ++k)
        for (h=0; h<2; ++h)
          MB_DPRINTLN("(%d %d %d) f=%f, %f", h, k, l,
                      tmp.at(h,k,l).real(), tmp.at(h,k,l).imag());
  }
#endif
}

void mapstat4_cuda(int NBLK, int NTHR, float *dp_map, int NSIZE, float *dp_tmp);
void mapstat4_cuda2(int NBLK, int NTHR, float *dp_in, int NSIZE);

void CudaBSharpTool::calcmapstat_herm()
{
  const int NX = m_na;
  const int NY = m_nb;
  const int NZ = m_nc;
  const int NSIZE = NX*NY*NZ;

  int NTMP = (NSIZE/NTHR + 1)*4;

#ifdef DEBUG
  // print CPU reduction results
  {
    std::vector<float> tmp(NSIZE);
    cudaMemcpy( (void*)(&tmp[0]), dp_map, NSIZE*sizeof(float), cudaMemcpyDeviceToHost);
    if (cudaGetLastError() != cudaSuccess){
      fprintf(stderr, "Cuda error: Failed to memcopy\n");
    }
    for (int j=0; j<1; j++) {
      float sum = 0.0f;
      float sum2 = 0.0f;
      float vmin = 1.0e10f;
      float vmax = -1.0e10f;
      for (int i=0; i<NSIZE; ++i) {
        float rho=tmp[j*1024+i];
        sum += rho;
        sum2 += rho*rho;
        vmin = qlib::min(vmin, rho);
        vmax = qlib::max(vmax, rho);
      }

      MB_DPRINTLN("===== %d =====", j);
      MB_DPRINTLN("CPU Sum = %f", sum);
      MB_DPRINTLN("CPU Sum2 = %f", sum2);
      MB_DPRINTLN("CPU Min = %f", vmin);
      MB_DPRINTLN("CPU Max = %f", vmax);
    }
  }
#endif

  // calc number of partial sums
  int npart = NSIZE/NTHR;
  if (NSIZE%NTHR!=0)
    npart ++;

  mapstat4_cuda(npart, NTHR, (float*)dp_map, NSIZE, (float*)dp_tmp);

#ifdef DEBUG
  MB_DPRINTLN("Launch mapstat3_kern NBLK=%d, NTHR=%d", npart, NTHR);
  cudaDeviceSynchronize();
  if (cudaGetLastError() != cudaSuccess){
    fprintf(stderr, "Cuda error: Failed to launch\n");
  }
#endif


#ifdef DEBUG
  {
    // print partial reduction results
    std::vector<float> tmp(NTMP);
    cudaMemcpy( (void*)(&tmp[0]), dp_tmp, NTMP*sizeof(float), cudaMemcpyDeviceToHost);
    if (cudaGetLastError() != cudaSuccess){
      fprintf(stderr, "Cuda error: Failed to memcopy\n");
    }

    for (int i=0; i<1; ++i) {
      MB_DPRINTLN("===== %d =====", i);
      MB_DPRINTLN("GPU Sum = %f", tmp[i*4+0]);
      MB_DPRINTLN("GPU Sum2 = %f", tmp[i*4+1]);
      MB_DPRINTLN("GPU Min = %f", tmp[i*4+2]);
      MB_DPRINTLN("GPU Max = %f", tmp[i*4+3]);
    }


    float sum = 0.0f;
    float sum2 = 0.0f;
    float vmin = 1.0e10f;
    float vmax = -1.0e10f;
    for (int i=0; i<NTMP/4; ++i) {
      //for (int i=0; i<896; ++i) {
      sum += tmp[i*4+0];
      sum2 += tmp[i*4+1];
      vmin = qlib::min(vmin, tmp[i*4+2]);
      vmax = qlib::max(vmax, tmp[i*4+3]);
    }

    MB_DPRINTLN("==========");
    MB_DPRINTLN("CGPU Sum = %f", sum);
    MB_DPRINTLN("CGPU Sum2 = %f", sum2);
    MB_DPRINTLN("CGPU Min = %f", vmin);
    MB_DPRINTLN("CGPU Max = %f", vmax);

  }
#endif

  //
  // Reduce partial sums/results
  //
  while (npart>1) {
    int nblk2 = npart/NTHR;
    if (npart%NTHR!=0)
      nblk2++;
    mapstat4_cuda2(nblk2, NTHR, (float*)dp_tmp, npart);
#ifdef DEBUG
    MB_DPRINTLN("Launch mapstat3_kern2 NBLK=%d, NTHR=%d", nblk2, NTHR);
#endif
    npart = nblk2;
  }

  std::vector<float> tmp(4);
  cudaMemcpy( (void*)(&tmp[0]), dp_tmp, 4*sizeof(float), cudaMemcpyDeviceToHost);
  float densum = tmp[0];
  float densqsum = tmp[1];
  m_min = tmp[2];
  m_max = tmp[3];
  m_mean = densum/float(NSIZE);
  m_rmsd = sqrt(densqsum/float(NSIZE)-m_mean*m_mean);
}

void makebmap_cuda(int NBLK, int NTHR, float *dp_map, int NSIZE, float *dp_tmp, unsigned char *dp_bmap);

void CudaBSharpTool::makebmap()
{
  const int NX = m_na;
  const int NY = m_nb;
  const int NZ = m_nc;
  const int NSIZE = NX*NY*NZ;

  int NBLK = NSIZE/NTHR;
  if (NSIZE%NTHR!=0)
    NBLK ++;

  cudaGraphicsResource *tbo_cuda = static_cast<cudaGraphicsResource *>(m_gfxRes);
  chkCudaErr(
    cudaGraphicsMapResources(1, &tbo_cuda, 0));

  unsigned char* dp_bmap;
  size_t bytes;
  chkCudaErr(
    cudaGraphicsResourceGetMappedPointer((void**)&dp_bmap, &bytes, tbo_cuda));


#ifdef DEBUG
  MB_DPRINTLN("Launch makebmap_kern NBLK=%d, NTHR=%d", NBLK, NTHR);
#endif
  makebmap_cuda(NBLK, NTHR, (float *)dp_map, NSIZE, (float *)dp_tmp, (unsigned char *)dp_bmap);

  chkCudaErr(
    cudaGraphicsUnmapResources(1, &tbo_cuda, 0));
}


#endif

