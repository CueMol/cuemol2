#include "umbreon_smoke.hpp"

#include <umbreon/umbreon.hpp>

namespace raytrace {

UmbreonSmokeResult renderUmbreonSmoke()
{
    umbreon::Scene scene;

    // One quad in the z=0 plane facing +Z (two de-indexed triangles). umbreon
    // meshes are de-indexed: triangle i uses vertices [3i, 3i+1, 3i+2], and every
    // corner carries its own position, normal and rgb+opacity color.
    umbreon::Mesh &mesh = scene.mesh;
    const umbreon::Vec3 corners[6] = {{-1, -1, 0}, {1, -1, 0}, {1, 1, 0},
                                      {-1, -1, 0}, {1, 1, 0},  {-1, 1, 0}};
    for (const umbreon::Vec3 &c : corners) {
        mesh.positions.push_back(c);
        mesh.normals.push_back({0.0f, 0.0f, 1.0f});
        mesh.colors.push_back({0.2f, 0.4f, 0.8f, 1.0f});  // rgb + opacity
    }
    mesh.material.ambient = 0.2f;
    mesh.material.diffuse = 0.8f;

    // Orthographic camera looking down -Z at the quad.
    scene.camera.position = {0.0f, 0.0f, 5.0f};
    scene.camera.direction = {0.0f, 0.0f, -1.0f};
    scene.camera.up = {0.0f, 1.0f, 0.0f};
    scene.camera.orthographic = true;
    scene.camera.height = 2.5f;

    umbreon::DistantLight light;
    light.direction = {0.0f, 0.0f, -1.0f};
    light.color = {1.0f, 1.0f, 1.0f};
    light.intensity = 1.0f;
    scene.lights.push_back(light);

    scene.background = {0.0f, 0.0f, 0.0f};
    scene.ambientColor = {1.0f, 1.0f, 1.0f};

    umbreon::RenderOptions opt;
    opt.width = 64;
    opt.height = 64;

    const umbreon::FrameResult frame = umbreon::render(scene, opt);

    UmbreonSmokeResult res;
    res.width = frame.width;
    res.height = frame.height;
    res.renderSeconds = frame.renderSeconds;

    // Count pixels whose linear RGB is not (near) the black background, i.e. the
    // lit quad actually rendered into the frame.
    std::size_t lit = 0;
    const std::size_t pixels = frame.color.size() / 4;
    for (std::size_t i = 0; i < pixels; ++i) {
        const float r = frame.color[i * 4 + 0];
        const float g = frame.color[i * 4 + 1];
        const float b = frame.color[i * 4 + 2];
        if (r > 1.0e-4f || g > 1.0e-4f || b > 1.0e-4f) ++lit;
    }
    res.nonBackgroundPixels = lit;
    return res;
}

}  // namespace raytrace
