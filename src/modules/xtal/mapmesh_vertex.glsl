// -*-Mode: C++;-*-
//
//  mapmesh_vertex.glsl:
//    vertex shader
//

#version 120

//attribute ivec4 InVertex;
//varying ivec4 GeomVertex;

void main(void)
{
  // gl_TexCoord[0]=gl_MultiTexCoord0;

  // gl_Position=ftransform();
  gl_Position=gl_Vertex;

  gl_FrontColor=gl_Color;
}

