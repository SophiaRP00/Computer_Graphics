
struct VertexInput {
    @location(0) position: vec2f,
    @location(1) halfSideLengths: vec2f,
    @location(2) direction1: vec2f,
    @location(3) direction2: vec2f,
    @location(4) color: vec3f,
    @location(5) opacity: f32,
    @location(6) invCovariance: vec3f,
    @location(7) depth: f32,
};

struct Uniforms {
    resolution: vec2f,
};

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;


struct VertexOutput {
    @builtin(position) position: vec4f,

    @location(0) color: vec3f,
    @location(1) opacity: f32,
    @location(2) splatPosition: vec2f,
    @location(3) invCovariance: vec3f,
};


@vertex
fn vs_main(
    @builtin(vertex_index) vertexIndex: u32,
    input: VertexInput
) -> VertexOutput {

    // Four corners of the quad
    var corners = array<vec2f, 4>(
        vec2f(-1.0, -1.0),
        vec2f( 1.0, -1.0),
        vec2f(-1.0,  1.0),
        vec2f( 1.0,  1.0)
    );

    // Calculate the offset for each corner
    let corner = corners[vertexIndex];

    let offset =
        corner.x * input.halfSideLengths.x * input.direction1
        +
        corner.y * input.halfSideLengths.y * input.direction2;

    // Shift the corner relative to the splat position
    let shiftedPosition = input.position + offset;

    // Convert screen coordinates to NDC
    let ndc = vec2f(
        2.0 * shiftedPosition.x / uniforms.resolution.x - 1.0,
        1.0 - 2.0 * shiftedPosition.y / uniforms.resolution.y
    );

    var output: VertexOutput;

    output.position = vec4f(ndc, 0.0, 1.0);

    // Pass Gaussian properties to fragment shader
    output.color = input.color;
    output.opacity = input.opacity;
    output.splatPosition = input.position;
    output.invCovariance = input.invCovariance;

    return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4f {
    return vec4f(1.0, 0.0, 0.0, 1.0);
}

