// -*-Mode: C++;-*-
//
//  vertex shader for spheres
//

////////////////////
// Uniform variables

// edge rendering
uniform float u_edge;

////////////////////
// Vertex attributes

// position
attribute vec4 a_vertex;

// radius
attribute float a_radius;

// color
attribute vec4 a_color;

// impostor
attribute vec2 a_impos;

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
  vec4 pos;
  //gl_Position = ftransform();
  pos = a_vertex;
  
  pos = gl_ModelViewMatrix * pos;
  pos.xy = pos.xy + a_impos.xy * (a_radius + u_edge);
  v_ecpos = pos;
  pos = gl_ProjectionMatrix * pos;

  gl_Position = pos; //vec4(pos, 1.0);

  v_edgeratio = (a_radius + u_edge)/a_radius;
  v_impos = a_impos * v_edgeratio;
  v_radius = a_radius;
  v_color = a_color;

  //gl_Position = vec4(0,0,0,0);
  //v_color = vec4(1,1,1,1);
  // gl_FrontColor = gl_Color;
}

