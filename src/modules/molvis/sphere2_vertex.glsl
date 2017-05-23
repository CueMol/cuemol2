// -*-Mode: C++;-*-
//
//  vertex shader for spheres
//

#ifndef USE_TBO
#  extension GL_EXT_gpu_shader4 : enable 
#endif

@include "lib_common.glsl"
@include "lib_atoms.glsl"

////////////////////
// Uniform variables

uniform AtomCrdTex coordTex;
uniform AtomColTex colorTex;

// edge rendering
uniform float u_edge;

////////////////////
// Vertex attributes

// radius
attribute float a_radius;

////////////////////
// Varying variables

varying vec4 v_color;
varying vec2 v_impos;
varying vec4 v_ecpos;
varying float v_radius;
varying float v_edgeratio;

////////////////////
// Program

void main()
{
  vec2 dsps[4]=vec2[]( vec2(-1,-1), vec2(1,-1), vec2(-1,1), vec2(1,1) );
  //int vid = gl_VertexID%4;

  vec2 impos = dsps[gl_VertexID%4];
  int aind = gl_VertexID/4;

  vec4 pos;

  pos = getAtomPos(coordTex, aind);
  //pos = a_vertex;
  
  pos = gl_ModelViewMatrix * pos;
  pos.xy = pos.xy + impos * (a_radius + u_edge);
  //pos.xy = pos.xy + impos * a_radius;
  v_ecpos = pos;
  pos = gl_ProjectionMatrix * pos;

  gl_Position = pos; //vec4(pos, 1.0);

  v_edgeratio = (a_radius + u_edge)/a_radius;

  v_impos = impos * v_edgeratio;
  v_radius = a_radius;

  v_color = getAtomColor(colorTex, aind);
}

