// -*-Mode: C++;-*-
//
//  Default fragment shader for OpenGL
//

uniform float frag_alpha;
uniform float stippleLen;
uniform vec4 u_color;
uniform bool use_u_color;

varying float v_length;

void main(void)
{
    vec4 color;

    if (stippleLen > 0.0) {
        float stipos = mod(v_length, stippleLen);
        if (stipos < stippleLen*0.5) {
            // gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
            discard;
        }
    }
    
    if (use_u_color) {
        color = u_color;
    }
    else {
        color = gl_Color;
    }

    float z = gl_FogFragCoord;

    float fog;
    fog = (gl_Fog.end - z) * gl_Fog.scale;
    fog = clamp(fog, 0.0, 1.0);

    float alpha = color.a * frag_alpha;
    vec3 fogmixed = mix(vec3(gl_Fog.color), vec3(color), fog);
    color = vec4(fogmixed, alpha);

    gl_FragColor = color;
}
