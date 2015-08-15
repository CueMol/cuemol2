// -*-Mode: C++;-*-
//
//  vertex shader for sphere
//

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
// Uniform variables

// Model-View projection matrix
// uniform mat4 mvp_matrix;

////////////////////
// Varying variables

varying vec4 v_color;
varying vec2 v_impos;
varying vec4 v_ecpos;
varying float v_radius;

////////////////////
// Program

void main()
{
  vec4 pos;
  //gl_Position = ftransform();
  pos = a_vertex;
  
  pos = gl_ModelViewMatrix * pos;
  pos.xy = pos.xy + a_impos.xy * a_radius;
  v_ecpos = pos;
  pos = gl_ProjectionMatrix * pos;

  gl_Position = pos; //vec4(pos, 1.0);

  v_impos = a_impos;
  v_radius = a_radius;
  v_color = a_color;

  //gl_Position = vec4(0,0,0,0);
  //v_color = vec4(1,1,1,1);
  // gl_FrontColor = gl_Color;
}

