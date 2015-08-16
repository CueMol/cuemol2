// -*-Mode: C++;-*-
//
//  mapmesh_vertex.glsl:
//    vertex shader
//

#version 140
#extension GL_ARB_compatibility : enable

void main(void)
{
  gl_Position=gl_Vertex;
  gl_FrontColor=gl_Color;
}

