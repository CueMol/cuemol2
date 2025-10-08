// -*-Mode: C++;-*-
//
//  mapmesh_vertex.glsl:
//    vertex shader
//

uniform vec4 u_color;

////////////////////
// Vertex attributes

in vec4 aVertex;


////////////////////
// Varying variables

out vec4 v_frontColor;

void main(void)
{
    gl_Position = aVertex;
    // TODO: remove
    v_frontColor = u_color;
}

