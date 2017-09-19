// -*-Mode: C++;-*-
//
//  Default fragment shader for OpenGL
//

@include "lib_common.glsl"

////////////////////
// Uniform variables

uniform float frag_alpha;

uniform vec2 u_winsz;

uniform samplerBuffer labelTex;

varying vec2 v_labpos;
varying float v_width;
varying float v_addr;

float getLabelPix(vec2 pos)
{
  int ind = int(v_addr) + int(pos.x) + int(pos.y) * int(v_width);

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
  
  float x = texelFetch(labelTex, ind).r;
  //float x = pos.x/v_width;
  //float x = v_width/100.0f;


  return x;
}

void main (void)
{
  float c = getLabelPix(v_labpos);
  //gl_FragColor = calcFogAlpha(gl_Color, gl_FogFragCoord, frag_alpha);
  gl_FragColor = vec4(1,0,0,c);
}

