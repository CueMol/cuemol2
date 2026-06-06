// Depth visualization fragment shader.
// Samples the off-screen depth texture and outputs a linearized grayscale
// image (near = bright, far = dark). Assumes a perspective projection; for an
// orthographic view the mapping is still monotonic.

uniform sampler2D u_depthTex;
uniform float u_near;
uniform float u_far;

in vec2 v_uv;

out vec4 o_FragColor;

void main()
{
    float d = texture(u_depthTex, v_uv).r;        // window depth [0,1]
    float z_ndc = d * 2.0 - 1.0;                  // NDC depth [-1,1]
    float denom = (u_far + u_near) - z_ndc * (u_far - u_near);
    float lin = (2.0 * u_near * u_far) / denom;   // eye-space distance
    float g = clamp((lin - u_near) / (u_far - u_near), 0.0, 1.0);
    o_FragColor = vec4(vec3(1.0 - g), 1.0);
}
