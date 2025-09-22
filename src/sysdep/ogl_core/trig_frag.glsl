// -*-Mode: C++;-*-
//
//  Triangle fragment shader for OpenGL
//

////////////////////
// Uniform variables

uniform float frag_alpha;

// Fog
uniform float u_fogEnd;
uniform float u_fogScale;
uniform vec3 u_fogColor;

////////////////////
// Varying variables

varying vec4 vFrontColor;
varying float vFogFragCoord;

void main(void)
{
    vec4 color = vFrontColor;

    float fog = (u_fogEnd - vFogFragCoord) * u_fogScale;
    fog = clamp(fog, 0.0, 1.0);

    float alpha = color.a * frag_alpha;
    vec3 fogmixed = mix(u_fogColor, vec3(color), fog);
    color = vec4(fogmixed, alpha);

    gl_FragColor = color;
}
