// -*-Mode: C++;-*-
//
//  mapvol_vertex.glsl:
//    vertex shader for volume rendering
//

#version 120

uniform mat4 modelview_matrix_inverse;
varying vec3 texcoor;

void main()
{
  gl_Position = gl_ProjectionMatrix * gl_Vertex;
  //texcoor  = gl_MultiTexCoord0.xyz;
  texcoor = ( modelview_matrix_inverse * gl_Vertex ).xyz;

  gl_ClipVertex = gl_Vertex;
}

