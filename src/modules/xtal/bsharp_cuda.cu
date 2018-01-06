// -*-Mode: C++;-*-
//
//  CUDA bsharp implementation
//

#include "StrFac.hpp"

using namespace xtal;

__global__
void convtoary_herm_kern(StrFac *dp_hkl, int HKLSZ,
                         float *dp_recip, int NX, int NY, int NZ, int NXX,
                         float fscl, float b_factor,
                         float m00, float m11, float m22, float m01, float m02, float m12)
{
  const int ithr = blockIdx.x*blockDim.x + threadIdx.x;
  if (ithr>=HKLSZ) return;
  
  int ih = dp_hkl[ithr].ih;
  int ik = dp_hkl[ithr].ik;
  int il = dp_hkl[ithr].il;

  float f_re = dp_hkl[ithr].f_re;
  float f_im = dp_hkl[ithr].f_im;

  float irs = ih*(ih*m00 + ik*m01 + il*m02) + ik*(ik*m11 + il*m12) + il*(il*m22);
  float bscl = float(exp(-b_factor * irs * 0.25f));

  ih = (ih+10000*NX)%NX;
  ik = (ik+10000*NY)%NY;
  il = (il+10000*NZ)%NZ;

  // Make Friedel pair index
  int mh = (NX-ih)%NX;
  int mk = (NY-ik)%NY;
  int ml = (NZ-il)%NZ;

  float re = fscl * bscl * f_re;
  float im = fscl * bscl * f_im;

  int idx;

  // Hermitian case: fill the hemisphere (of L>ncc)
  //  with the Friedel pairs of the refls.
  if (ih<NXX) {
    idx = ih + (ik + il*NY)*NXX;
    dp_recip[idx*2+0] = re;
    dp_recip[idx*2+1] = -im;
  }
  if (mh<NXX) {
    idx = mh + (mk + ml*NY)*NXX;
    dp_recip[idx*2+0] = re;
    dp_recip[idx*2+1] = im;
  }
}

void convtoary_herm_cuda(int NBLK, int NTHR,
                         StrFac *dp_hkl, int HKLSZ,
                         float *dp_recip, int NX, int NY, int NZ, int NXX,
                         float fscl, float b_factor,
                         float m00, float m11, float m22, float m01, float m02, float m12)
{
  convtoary_herm_kern<<<NBLK, NTHR>>>(dp_hkl, HKLSZ,
                                      dp_recip, NX, NY, NZ, NXX,
                                      fscl, b_factor,
                                      m00, m11, m22, m01, m02, m12);
}

//////////

__inline__ __device__
float MIN(float x, float y) {
  return ((x < y) ? x : y);
}

__inline__ __device__
float MAX(float x, float y) {
  return ((x > y) ? x : y);
}

__inline__ __device__
void warpReduce(float &val, float &val2, float &vmin, float &vmax)
{
  val += __shfl_down(val, 16);
  val2 += __shfl_down(val2, 16);
  vmin = MIN(vmin, __shfl_down(vmin, 16));
  vmax = MAX(vmax, __shfl_down(vmax, 16));

  val += __shfl_down(val, 8);
  val2 += __shfl_down(val2, 8);
  vmin = MIN(vmin, __shfl_down(vmin, 8));
  vmax = MAX(vmax, __shfl_down(vmax, 8));

  val += __shfl_down(val, 4);
  val2 += __shfl_down(val2, 4);
  vmin = MIN(vmin, __shfl_down(vmin, 4));
  vmax = MAX(vmax, __shfl_down(vmax, 4));

  val += __shfl_down(val, 2);
  val2 += __shfl_down(val2, 2);
  vmin = MIN(vmin, __shfl_down(vmin, 2));
  vmax = MAX(vmax, __shfl_down(vmax, 2));

  val += __shfl_down(val, 1);
  val2 += __shfl_down(val2, 1);
  vmin = MIN(vmin, __shfl_down(vmin, 1));
  vmax = MAX(vmax, __shfl_down(vmax, 1));
}

__inline__ __device__
void blkReduce(float &val, float &val2, float &vmin, float &vmax)
{
  static __shared__ float shared[32*4]; // Shared mem for 32 partial sums
  int lane = threadIdx.x % warpSize;
  int wid = threadIdx.x / warpSize;

  warpReduce(val, val2, vmin, vmax);

  // Write reduced value to shared memory
  if (lane==0) {
    shared[wid*4+0] = val;
    shared[wid*4+1] = val2;
    shared[wid*4+2] = vmin;
    shared[wid*4+3] = vmax;
  }

  // Wait for all partial reductions
  __syncthreads();

  //read from shared memory only if that warp existed
  if (threadIdx.x < blockDim.x / warpSize) {
    val = shared[lane*4+0];
    val2 = shared[lane*4+1];
    vmin = shared[lane*4+2];
    vmax = shared[lane*4+3];
  }
  else {
    val = 0.0f;
    val2 = 0.0f;
    vmin = 1.0e10f;
    vmax = -1.0e10f;
  }

  if (wid==0) {
    warpReduce(val, val2, vmin, vmax);
  }
}

__global__
void mapstat4_kern(float *dp_map, int NSIZE, float *dp_tmp)
{
  const int ithr = blockIdx.x*blockDim.x + threadIdx.x;

  float val = (ithr<NSIZE)?dp_map[ithr]:0.0f;
  float val2 = val*val;
  float vmin = val;
  float vmax = val;

  blkReduce(val, val2, vmin, vmax);

  if (threadIdx.x == 0) {
    dp_tmp[blockIdx.x * 4 + 0] = val;
    dp_tmp[blockIdx.x * 4 + 1] = val2;
    dp_tmp[blockIdx.x * 4 + 2] = vmin;
    dp_tmp[blockIdx.x * 4 + 3] = vmax;
  }

  /*
  if (threadIdx.x == 0 && blockIdx.x<5) {
    //printf("mapstat4_kern %d : val=%f, val2=%f, vmin=%f, vmax=%f\n", blockIdx.x, val, val2, vmin, vmax);
    printf("mapstat4_kern %d : val=%f, val2=%f, vmin=%f, vmax=%f\n",blockIdx.x,
           dp_tmp[blockIdx.x * 4 + 0],
           dp_tmp[blockIdx.x * 4 + 1],
           dp_tmp[blockIdx.x * 4 + 2],
           dp_tmp[blockIdx.x * 4 + 3]);
  }
  */
}

void mapstat4_cuda(int NBLK, int NTHR, float *dp_map, int NSIZE, float *dp_tmp)
{
  mapstat4_kern<<<NBLK,NTHR>>>(dp_map, NSIZE, dp_tmp);
}

__global__
void mapstat4_kern2(float *dp_in, int NSIZE)
{
  const int ithr = blockIdx.x*blockDim.x + threadIdx.x;

  float val,val2,vmin,vmax;

  if (ithr<NSIZE) {
    val = dp_in[ithr*4+0];
    val2 = dp_in[ithr*4+1];
    vmin = dp_in[ithr*4+2];
    vmax = dp_in[ithr*4+3];
  }
  else {
    val = 0.0f;
    val2 = 0.0f;
    vmin = 1.0e10f;
    vmax = -1.0e10f;
  }

  blkReduce(val, val2, vmin, vmax);

  if (threadIdx.x == 0) {
    dp_in[blockIdx.x * 4 + 0] = val;
    dp_in[blockIdx.x * 4 + 1] = val2;
    dp_in[blockIdx.x * 4 + 2] = vmin;
    dp_in[blockIdx.x * 4 + 3] = vmax;
  }
}

void mapstat4_cuda2(int NBLK, int NTHR, float *dp_in, int NSIZE)
{
  mapstat4_kern2<<<NBLK,NTHR>>>(dp_in, NSIZE);
}

//////////

__global__
void makebmap_kern(float *dp_map, int NSIZE, float *dp_tmp, unsigned char *dp_bmap)
{
  const int ithr = blockIdx.x*blockDim.x + threadIdx.x;
  if (ithr>=NSIZE) return;

  float rhomin = dp_tmp[2];
  float rhomax = dp_tmp[3];
  float step = (rhomax - rhomin)/256.0f;
  float base = rhomin;

  float rho = dp_map[ithr];
  rho = (rho-base)/step;
  if (rho<0.0f) rho = 0.0f;
  if (rho>255.0f) rho = 255.0f;

  dp_bmap[ithr] = (unsigned char) rho;
}

void makebmap_cuda(int NBLK, int NTHR, float *dp_map, int NSIZE, float *dp_tmp, unsigned char *dp_bmap)
{
  makebmap_kern<<<NBLK, NTHR>>>((float*)dp_map, NSIZE, (float*)dp_tmp, (unsigned char *)dp_bmap);
}


