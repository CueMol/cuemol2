// -*-Mode: C++;-*-
//
//  Pixel drawing shader for OpenGL
//

// #version 120

////////////////////
// Uniform variables

// uniform mat4 u_mvpMatrix;
uniform vec3 u_position;
uniform vec2 u_size;

////////////////////
// Vertex attributes

attribute vec2 a_vertex;
attribute vec2 a_texCoord;

////////////////////
// Varying variables

varying vec2 v_texCoord;

void main()
{
    // Create quad at specified position with specified size
    vec3 worldPos = u_position + vec3(a_vertex * u_size, 0.0);

    gl_Position = gl_ModelViewProjectionMatrix * vec4(worldPos, 1.0);

    v_texCoord = a_texCoord;
}
