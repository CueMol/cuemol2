// -*-Mode: C++;-*-
//
//  Default vertex shader for OpenGL
//

////////////////////
// Uniforms
uniform vec2 screenSize;
uniform float lineWidth;

////////////////////
// Vertex attributes

// position
attribute vec4 a_vertex1;
attribute vec4 a_vertex2;

// color
attribute vec4 a_color1;
attribute vec4 a_color2;

// vertex index
attribute float a_index;

////////////////////

float ffog(in float ecDistance)
{
    return abs(ecDistance);
}

void main(void)
{
    vec4 ecpos1 = gl_ModelViewMatrix * a_vertex1;
    vec4 p1_ndc = gl_ProjectionMatrix * ecpos1;

    vec4 ecpos2 = gl_ModelViewMatrix * a_vertex2;
    vec4 p2_ndc = gl_ProjectionMatrix * ecpos2;

    vec2 p1_screen = (p1_ndc.xy / p1_ndc.w) * 0.5 + 0.5;
    vec2 p2_screen = (p2_ndc.xy / p2_ndc.w) * 0.5 + 0.5;
    p1_screen *= screenSize;
    p2_screen *= screenSize;

    vec2 direction = normalize(p2_screen - p1_screen);
    vec2 normal = vec2(-direction.y, direction.x);
 
    vec2 offset = normal * lineWidth * 0.5;
    offset.x /= screenSize.x;
    offset.y /= screenSize.y;
    offset *= 2.0;


    // vec2 dir = normalize((p2 - p1).xy);
    // vec2 normal = vec2(-dir.y, dir.x) * lineWidth * 0.5;

    // mat4 projection = gl_ProjectionMatrix;
    int ind = int(a_index);

    if (ind == 0) {
        // P0
        // gl_Position = projection * (p1 + vec4(normal, 0.0, 0.0));
        gl_Position = vec4(p1_ndc.xy / p1_ndc.w + offset, p1_ndc.z / p1_ndc.w, 1.0);
        gl_FogFragCoord = ffog(ecpos1.z);
    } else if (ind == 1) {
        // P1
        // gl_Position = projection * (p1 - vec4(normal, 0.0, 0.0));
        gl_Position = vec4(p1_ndc.xy / p1_ndc.w - offset, p1_ndc.z / p1_ndc.w, 1.0);
        gl_FogFragCoord = ffog(ecpos1.z);
    } else if (ind == 2) {
        // P2
        // gl_Position = projection * (p2 + vec4(normal, 0.0, 0.0));
        gl_Position = vec4(p2_ndc.xy / p2_ndc.w + offset, p2_ndc.z / p2_ndc.w, 1.0);
        gl_FogFragCoord = ffog(ecpos2.z);
    } else if (ind == 3) {
        // P2
        // gl_Position = projection * (p2 + vec4(normal, 0.0, 0.0));
        gl_Position = vec4(p2_ndc.xy / p2_ndc.w + offset, p2_ndc.z / p2_ndc.w, 1.0);
        gl_FogFragCoord = ffog(ecpos2.z);
    } else if (ind == 4) {
        // P1
        // gl_Position = projection * (p1 - vec4(normal, 0.0, 0.0));
        gl_Position = vec4(p1_ndc.xy / p1_ndc.w - offset, p1_ndc.z / p1_ndc.w, 1.0);
        gl_FogFragCoord = ffog(ecpos1.z);
    } else {
        // P3
        // gl_Position = projection * (p2 - vec4(normal, 0.0, 0.0));
        gl_Position = vec4(p2_ndc.xy / p2_ndc.w - offset, p2_ndc.z / p2_ndc.w, 1.0);
        gl_FogFragCoord = ffog(ecpos2.z);
    }

    // gl_FrontColor = a_color;
    gl_FrontColor = vec4(1.0, 1.0, 1.0, 1.0);
}
