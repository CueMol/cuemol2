// -*-Mode: C++;-*-
//
//  Number label fragment shader for OpenGL
//

#define LabelTex sampler2DRect

@include "lib_common.glsl"

////////////////////
// Uniform variables

// label color (incl. transparency)
uniform vec4 u_color;

uniform vec2 u_winsz;

// number of digits per one label
uniform float u_ndigit;
// max digit width (in px)
uniform float u_digitw;
// digit data stride (in bytes)
uniform float u_digitb;

// digit image texture
uniform LabelTex labelTex;

// digit data (index in labelTex)
uniform samplerBuffer numTex;

////////////////////
// Uniform variables

// texture coordinates x, y (rel to label origin)
varying vec2 v_labpos;

// label ID (from 0)
varying float v_ilab;

float getLabelPix2(vec2 pos)
{
  float x = pos.x;
  float fdig = floor( x/u_digitw );
  float xx = x - fdig*u_digitw;
  //int idig = int(fdig);
  
  float fd = texelFetch(numTex, int(fdig)+int(v_ilab)*int(u_ndigit)).r;
  int idig = int(fd*255.0 + 0.5);

  float tx_x = float( idig*int(u_digitw) ) + xx;
  float tx_y = pos.y;

  float c = texture2DRect(labelTex, vec2(tx_x, tx_y)).r;

  return c;
}

#if 0
float getLabelPix(vec2 pos)
{
  float x = pos.x;
  float fdig = floor( x/u_digitw );
  float xx = x - fdig*u_digitw;
  //int idig = int(fdig);
  
  float fd = texelFetch(numTex, int(fdig)+int(v_ilab)*int(u_ndigit)).r;
  int idig = int(fd*255.0 + 0.5);
  //int idig = int(fd);

  int ind = idig*int(u_digitb) + int(xx) + int(pos.y)*int(u_digitw);

#ifdef USE_TBO
  float c = texelFetch(labelTex, ind).r;
#else
  ivec2 iv;
  iv.x = int( mod(ind, TEX2D_WIDTH) );
  iv.y = ind/TEX2D_WIDTH;
  float c = texelFetch2D(labelTex, iv, 0).r;
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


  return c;
  //return 1.0f;
}
#endif
  
void main (void)
{
  float c = getLabelPix2(v_labpos);
  //gl_FragColor = calcFogAlpha(gl_Color, gl_FogFragCoord, frag_alpha);

  if (c<0.1)
    discard;
  
  gl_FragColor = vec4(u_color.xyz, u_color.w*c);
  //gl_FragColor = vec4(1,1,1,1);
}

