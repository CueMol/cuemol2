// -*-Mode: C++;-*-
//
//  Atom coordinate common functions
//

#ifdef USE_TBO
#  define AtomCrdTex samplerBuffer
#  define AtomColTex samplerBuffer
#else
// #extension GL_EXT_gpu_shader4 : enable 
#  define AtomCrdTex sampler2D
#  define AtomColTex sampler2D
#endif

#ifndef TEX2D_WIDTH
#  define TEX2D_WIDTH 1024
#endif

vec4 getAtomPos(in AtomCrdTex tex, in int ind)
{
#ifdef USE_TBO
  return vec4( texelFetch(tex, ind).xyz, 1.0);
#else
  ivec2 iv;
  iv.x = int( mod(ind, TEX2D_WIDTH) );
  iv.y = ind/TEX2D_WIDTH;
  return vec4( texelFetch2D(tex, iv, 0).xyz , 1.0);
#endif
}

vec4 getAtomColor(in AtomColTex tex, in int ind)
{
#ifdef USE_TBO
  return texelFetch(tex, ind);
#else
  ivec2 iv;
  iv.x = int( mod(ind, TEX2D_WIDTH) );
  iv.y = ind/TEX2D_WIDTH;
  return texelFetch2D(tex, iv, 0);
#endif
}

