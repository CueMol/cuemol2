// Temporal-jitter compose fragment shader.
//
// Used by both the accumulate and the display steps of the temporal jitter
// supersampling path:
//   accumulate: additive blend (ONE,ONE), u_weight = 1/N, src = the per-sample
//               3D color -> the float accumulation target sums sample/N.
//   display:    no blend, u_weight = N/(sampleCount), src = the accumulation
//               target -> normalizes the partial sum to an average for output.

uniform sampler2D u_colorTex;
uniform float u_weight;

in vec2 v_uv;

out vec4 o_FragColor;

void main()
{
    o_FragColor = texture(u_colorTex, v_uv) * u_weight;
}
