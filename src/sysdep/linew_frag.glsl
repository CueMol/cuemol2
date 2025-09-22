// -*-Mode: C++;-*-
//
//  Default fragment shader for OpenGL
//

uniform float frag_alpha;
uniform float stippleLen;
uniform vec4 u_color;
uniform bool use_u_color;

// Fog
uniform float u_fogEnd;
uniform float u_fogScale;
uniform vec3 u_fogColor;

////////////////////
// Varying

varying float v_length;
varying float v_fogCoord;

void main(void)
{
    vec4 color;

    if (stippleLen > 0.0) {
        float stipos = mod(v_length, stippleLen);
        if (stipos < stippleLen * 0.5) {
            // gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
            discard;
        }
    }

    if (use_u_color) {
        color = u_color;
    } else {
        color = gl_Color;
    }

    float fog = (u_fogEnd - v_fogCoord) * u_fogScale;
    fog = clamp(fog, 0.0, 1.0);

    float alpha = color.a * frag_alpha;
    vec3 fogmixed = mix(u_fogColor, vec3(color), fog);
    color = vec4(fogmixed, alpha);

    gl_FragColor = color;
}
