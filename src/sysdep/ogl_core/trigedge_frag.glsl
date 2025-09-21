// -*-Mode: C++;-*-
//
//  triangle edge fragment shader for OpenGL
//

////////////////////
// Uniform variables

uniform float frag_alpha;

uniform float u_fogEnd;
uniform float u_fogScale;
uniform vec3 u_fogColor;

////////////////////
// Varying

varying vec4 v_frontColor;
varying float v_fogCoord;

void main(void)
{
    vec4 color = v_frontColor;

    float fog = (u_fogEnd - v_fogCoord) * u_fogScale;
    fog = clamp(fog, 0.0, 1.0);
    color = vec4(mix(u_fogColor, vec3(color), fog), color.a * frag_alpha);

    gl_FragColor = color;
}
