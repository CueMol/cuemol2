// -*-Mode: C++;-*-
//
//  Default vertex shader for OpenGL
//

////////////////////
// Uniforms
uniform vec2 screenSize;
uniform float lineWidth;
uniform float stippleLen;

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
// Varying

varying float v_length;
varying float v_fogCoord;

////////////////////

float ffog(in float ecDistance)
{
    return abs(ecDistance);
}

void main(void)
{
    vec4 ecpos1 = gl_ModelViewMatrix * a_vertex1;
    vec4 clipPos1 = gl_ProjectionMatrix * ecpos1;

    vec4 ecpos2 = gl_ModelViewMatrix * a_vertex2;
    vec4 clipPos2 = gl_ProjectionMatrix * ecpos2;

    vec2 p1_screen = ((clipPos1.xy / clipPos1.w) * 0.5 + 0.5) * screenSize;
    vec2 p2_screen = ((clipPos2.xy / clipPos2.w) * 0.5 + 0.5) * screenSize;

    vec2 direction = normalize(p2_screen - p1_screen);
    vec2 normal = vec2(-direction.y, direction.x);

    vec2 offset = (normal * lineWidth * 0.5) / screenSize * 2.0;
    vec4 of4 = vec4(offset * clipPos1.w, 0.0, 0.0);

    float vlen;
    if (stippleLen > 0.0) {
        vlen = length(p1_screen.xy - p2_screen.xy);
    } else {
        vlen = 0.0;
    }

    int ind = int(a_index);
    if (ind == 0) {
        // P0
        // gl_Position = vec4(clipPos1.xy / clipPos1.w + offset, clipPos1.z /
        // clipPos1.w, 1.0);
        gl_Position = clipPos1 + of4;
        v_fogCoord = ffog(ecpos1.z);
        gl_FrontColor = a_color1;
        v_length = 0.0;
    } else if (ind == 1) {
        // P1
        // gl_Position = vec4(clipPos1.xy / clipPos1.w - offset, clipPos1.z /
        // clipPos1.w, 1.0);
        gl_Position = clipPos1 - of4;
        v_fogCoord = ffog(ecpos1.z);
        gl_FrontColor = a_color1;
        v_length = 0.0;
    } else if (ind == 2) {
        // P2
        // gl_Position = projection * (p2 + vec4(normal, 0.0, 0.0));
        gl_Position = clipPos2 + of4;
        v_fogCoord = ffog(ecpos2.z);
        gl_FrontColor = a_color2;
        v_length = vlen;
    } else if (ind == 3) {
        // P2
        // gl_Position = projection * (p2 + vec4(normal, 0.0, 0.0));
        gl_Position = clipPos2 + of4;
        v_fogCoord = ffog(ecpos2.z);
        gl_FrontColor = a_color2;
        v_length = vlen;
    } else if (ind == 4) {
        // P1
        // gl_Position = projection * (p1 - vec4(normal, 0.0, 0.0));
        gl_Position = clipPos1 - of4;
        v_fogCoord = ffog(ecpos1.z);
        gl_FrontColor = a_color1;
        v_length = 0.0;
    } else {
        // P3
        // gl_Position = projection * (p2 - vec4(normal, 0.0, 0.0));
        gl_Position = clipPos2 - of4;
        v_fogCoord = ffog(ecpos2.z);
        gl_FrontColor = a_color2;
        v_length = vlen;
    }

    // gl_FrontColor = vec4(1.0, 1.0, 1.0, 1.0);
}
