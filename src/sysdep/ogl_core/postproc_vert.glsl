// Fullscreen-triangle vertex shader for post-processing passes.
// The vertex positions are already in normalized device coordinates; a single
// oversized triangle (-1,-1)(3,-1)(-1,3) covers the whole viewport.

layout(location = 0) in vec2 aVertex;

out vec2 v_uv;

void main()
{
    v_uv = aVertex * 0.5 + 0.5;
    gl_Position = vec4(aVertex, 0.0, 1.0);
}
