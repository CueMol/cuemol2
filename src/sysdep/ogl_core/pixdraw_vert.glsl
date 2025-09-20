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
uniform vec2 u_viewportSize;

////////////////////
// Vertex attributes

attribute vec2 a_vertex;
attribute vec2 a_texCoord;

////////////////////
// Varying variables

varying vec2 v_texCoord;

// void main()
// {
//     // Create quad at specified position with specified size
//     vec3 worldPos = u_position + vec3(a_vertex * u_size, 0.0);

//     gl_Position = gl_ModelViewProjectionMatrix * vec4(worldPos, 1.0);

//     v_texCoord = a_texCoord;
// }

void main()
{
    // Transform 3D position to clip space
    vec4 clipPos = gl_ModelViewProjectionMatrix * vec4(u_position, 1.0);

    // Convert to normalized device coordinates for screen space calculations
    vec2 ndcPos = clipPos.xy / clipPos.w;

    // Convert pixel size to NDC size
    vec2 ndcSize = (u_size / u_viewportSize); // * 2.0;

    // Create quad in screen space with pixel-accurate size
    vec2 quadPos = ndcPos + (a_vertex * ndcSize);

    // Output in clip space (let OpenGL do perspective division)
    gl_Position = vec4(quadPos * clipPos.w, clipPos.z, clipPos.w);

    v_texCoord = a_texCoord;
}
