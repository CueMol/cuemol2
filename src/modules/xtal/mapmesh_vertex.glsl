// -*-Mode: C++;-*-
//
//  mapmesh_vertex.glsl:
//    vertex shader
//

uniform vec4 u_color;

uniform int ncol;
uniform int nrow;
uniform int nsec;

////////////////////
// Vertex attributes

in vec4 aVertex;


////////////////////
// Varying variables

out vec4 v_frontColor;

void main(void)
{
  gl_Position = aVertex;

  // int id = gl_InstanceID;
    // int id = gl_VertexID;
    // int iz = id / (ncol * nrow);
    // int temp = id - iz * ncol * nrow;
    // int iy = temp / ncol;
    // int ix = temp - iy * ncol;
    
    // gl_Position = vec4(float(ix), float(iy), float(iz), 1.0);

    // TODO: remove
    v_frontColor = u_color;
}

