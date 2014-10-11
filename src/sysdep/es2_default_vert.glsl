// -*-Mode: C++;-*-
//
//  Default vertex shader for OpenGL ES2
//

////////////////////
// Vertex attributes

// position
attribute vec4 a_vertex;
// normal
attribute vec4 a_normal;
// color
attribute vec4 a_color;

////////////////////
// Uniform variables

// Model-View projection matrix
uniform mat4 mvp_matrix;

////////////////////
// Varying variables

varying vec4 v_color;

////////////////////
// Program

void main()
{
  //vec4 xxx = a_normal;
  gl_Position = mvp_matrix * a_vertex;
  v_color = a_color;

  //gl_Position = vec4(0,0,0,0);
  //v_color = vec4(1,1,1,1);
}

