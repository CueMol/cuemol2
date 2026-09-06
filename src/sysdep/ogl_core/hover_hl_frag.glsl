// Hover highlight overlay fragment shader.
//
// Reads the integer pick ID buffer (R = renderer index, G = element name,
// B = outer name; 0 = nothing drawn) and paints the element whose ID equals
// u_hlId: a translucent fill inside the element plus an edge band on its
// boundary. The boolean mask is bilinearly weighted across the four
// surrounding pick texels, so the (half resolution) pick buffer yields a
// smooth edge without any neighbour search. Drawn over the finished frame with
// alpha blending; fragments outside the element are discarded.

uniform highp usampler2D u_pickTex;
uniform ivec3 u_hlId;        // (rendIdx, encodeHitName(atom), encodeHitName(outer))
uniform vec2 u_pickTexSize;  // pick buffer size in texels
uniform vec4 u_fillColor;    // rgb + strength inside the element
uniform vec4 u_edgeColor;    // rgb + strength of the boundary band

in vec2 v_uv;

out vec4 o_FragColor;

float hitAt(ivec2 p)
{
    p = clamp(p, ivec2(0), ivec2(u_pickTexSize) - 1);
    uvec3 id = texelFetch(u_pickTex, p, 0).xyz;
    return all(equal(id, uvec3(u_hlId))) ? 1.0 : 0.0;
}

void main()
{
    vec2 q = v_uv * u_pickTexSize - 0.5;
    ivec2 p0 = ivec2(floor(q));
    vec2 f = fract(q);
    float c = mix(mix(hitAt(p0), hitAt(p0 + ivec2(1, 0)), f.x),
                  mix(hitAt(p0 + ivec2(0, 1)), hitAt(p0 + ivec2(1, 1)), f.x), f.y);
    if (c <= 0.0) discard;

    // 4c(1-c) peaks on the mask boundary (c = 0.5) and is 0 inside / outside.
    float edge = 4.0 * c * (1.0 - c);
    vec3 rgb = mix(u_fillColor.rgb, u_edgeColor.rgb, edge);
    float a = max(u_fillColor.a * c, u_edgeColor.a * edge);
    o_FragColor = vec4(rgb, a);
}
