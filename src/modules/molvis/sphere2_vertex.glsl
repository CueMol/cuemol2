// -*-Mode: C++;-*-
//
//  vertex shader for spheres
//

#ifndef TEX2D_WIDTH
#  define TEX2D_WIDTH 1024
#endif

//#extension GL_ARB_compatibility : enable

////////////////////
// Uniform variables

#ifdef USE_TBO
uniform samplerBuffer coordTex;
uniform samplerBuffer colorTex;
#else
#extension GL_EXT_gpu_shader4 : enable 
uniform sampler2D coordTex;
uniform sampler2D colorTex;
#endif

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

vec4 getAtomPos(in int ind)
{
#ifdef USE_TBO
  return vec4( texelFetch(coordTex, ind).xyz, 1.0);
#else
  ivec2 iv;
  iv.x = int( mod(ind, TEX2D_WIDTH) );
  iv.y = ind/TEX2D_WIDTH;
  return vec4( texelFetch2D(coordTex, iv, 0).xyz , 1.0);
#endif
}

vec4 calcColor(in int ind)
{
#ifdef USE_TBO
  return texelFetch(colorTex, ind);
#else
  ivec2 iv;
  iv.x = int( mod(ind, TEX2D_WIDTH) );
  iv.y = ind/TEX2D_WIDTH;
  return texelFetch2D(colorTex, iv, 0);
#endif
}

void main()
{
  vec2 dsps[4]=vec2[]( vec2(-1,-1), vec2(1,-1), vec2(-1,1), vec2(1,1) );
  //int vid = gl_VertexID%4;
  vec2 impos = dsps[gl_VertexID%4];
  int aind = gl_VertexID/4;

  vec4 pos;

  pos = getAtomPos(aind);
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

  v_color = calcColor(aind);

  //gl_Position = vec4(0,0,0,0);
  // v_color = vec4(1,0,1,1);
  // gl_FrontColor = gl_Color;
}

