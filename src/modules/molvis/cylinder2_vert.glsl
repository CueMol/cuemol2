// -*-Mode: C++;-*-
//
//  vertex shader for cylinders (ver. 2)
//

#ifndef USE_TBO
#  extension GL_EXT_gpu_shader4 : enable 
#endif

@include "lib_common.glsl"
@include "lib_atoms.glsl"

////////////////////
// Vertex attributes

// position
attribute vec2 a_ind12;

////////////////////
// Uniform variables

uniform AtomCrdTex coordTex;
uniform AtomColTex colorTex;

uniform float u_rad;

////////////////////
// Varying variables

varying vec4 v_color;
varying vec2 v_impos;
varying vec4 v_ecpos;

varying float v_ndec;

////////////////////
// Program

void main()
{
  const float u_edge = 0.05;
  vec2 dsps[4]=vec2[]( vec2(-1,-1), vec2(1,-1), vec2(-1,1), vec2(1,1) );

  int aind1 = int( a_ind12.x );
  int aind2 = int( a_ind12.y );
  int vid = gl_VertexID%4;

  vec4 pos1 = getAtomPos(coordTex, aind1);
  vec4 pos2 = getAtomPos(coordTex, aind2);
  //vec4 mpos = (pos1 + pos2)*0.5;
  vec4 mpos = pos2;

  vec4 ec_pos1 = gl_ModelViewMatrix * pos1;
  vec4 ec_mpos = gl_ModelViewMatrix * mpos;

  vec4 ec_dir = (ec_mpos - ec_pos1);
  float len = length(ec_dir.xyz);
  //float vw_len = length(ec_dir.xy);

  // Calc h vector
  vec2 n_vw = normalize(ec_dir.xy);
  vec2 n_hdir = vec2(n_vw.y, -n_vw.x);
  vec2 hdir = n_hdir * (u_rad + u_edge);

  // Calc trig of phi
  // Invert the direction for vid=2,3
  //   (ec_dir = ec_pos1-ec_mpos for vid=2,3)
  float sinph = ec_dir.z / len * (-dsps[vid].y);
  float rcosph = inversesqrt(1.0-sinph*sinph);
  float tanph = sinph * rcosph;
  float abs_tanph = abs(tanph);

  vec3 n_kdir = normalize(ec_dir.xyz);
  vec3 kdir = n_kdir * u_rad * abs_tanph * (-dsps[vid].y);

  vec4 vw_pos;
  float sig, ksig;
  
  if (vid==0) {
    vw_pos = ec_pos1;
    //v_color = vec4(1,0,0,1);
  }
  else if (vid==1) {
    vw_pos = ec_pos1;
    //v_color = vec4(0,1,0,1);
  }
  else if (vid==2) {
    vw_pos = ec_mpos;
    //v_color = vec4(0,0,1,1);
  }
  else {
    vw_pos = ec_mpos;
    //v_color = vec4(1,1,1,1);
  }

  // Displace vertex position to the X direction
  vw_pos.xy += hdir*dsps[vid].x;

  v_impos = dsps[vid];

  // Displace imposter position to the X direction,
  // if edge is enabled.
  v_impos.x *= (1.0 + u_edge/u_rad);
  
  v_ndec = 2.0 * u_rad * abs_tanph / len;

  if (sinph>0) {
    vw_pos.xyz -= kdir;
    v_impos.y *= (1.0 + v_ndec);
  }

/*
  if (vid==0||vid==1) {
    if (sinph>0) {
      vw_pos.xyz -= kdir;
      v_impos.y *= (1.0 + v_ndec);
    }
  }
  else {
    if (sinph<0) {
      vw_pos.xyz -= kdir;
      v_impos.y *= (1.0 + v_ndec);
    }
  }
*/
  
  
  gl_Position = gl_ProjectionMatrix * vw_pos;

  v_color = getAtomColor(colorTex, aind1);
}

