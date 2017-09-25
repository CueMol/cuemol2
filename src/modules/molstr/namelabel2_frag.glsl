// -*-Mode: C++;-*-
//
//  NameLabel2 fragment shader for OpenGL
//

#ifdef USE_TBO
#  define LabelTex samplerBuffer
#else
#extension GL_EXT_gpu_shader4 : enable 
#  define LabelTex sampler2D
#endif

@include "lib_common.glsl"

////////////////////
// Uniform variables

// label color (incl. transparency)
uniform vec4 u_color;

uniform vec2 u_winsz;

uniform LabelTex labelTex;

varying vec2 v_labpos;
varying float v_width;
varying float v_addr;

float getLabelPix(vec2 pos)
{
  int ind = int(v_addr) + int(pos.x) + int(pos.y) * int(v_width);

#ifdef USE_TBO
  float x = texelFetch(labelTex, ind).r;
#else
  ivec2 iv;
  iv.x = int( mod(ind, TEX2D_WIDTH) );
  iv.y = ind/TEX2D_WIDTH;
  float x = texelFetch2D(labelTex, iv, 0).r;
#endif
  
  /*
  int ind = int(v_labpos.x);
  int indy = int(v_labpos.y);
  if (ind%2==0) {
    if (indy%2==0)
      return 0.0f;
    else
      return 1.0f;
  }
  else {
    if (indy%2==0)
      return 1.0f;
    else
      return 0.0f;
  }
*/
  /*
  int ind = int(v_labpos.x);
  int indy = int(v_labpos.y)%5;
  int mod = 1 << indy;
  ind /= mod;
  if (ind%2==0) return 1.0f;
  else return 0.0f;
*/
  
/*
  int ind = int(gl_FragCoord.x);
  int indy = int(gl_FragCoord.y);
  int mod = 1 << indy;
  ind /= mod;
  if (ind%2==0) return 1.0f;
  else return 0.0f;
*/
  
  //float x = pos.x/v_width;
  //float x = v_width/100.0f;


  return x;
}

void main (void)
{
  float c = getLabelPix(v_labpos);
  //gl_FragColor = calcFogAlpha(gl_Color, gl_FogFragCoord, frag_alpha);

  gl_FragColor = vec4(u_color.xyz, u_color.w*c);
}

