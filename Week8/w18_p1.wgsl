struct Uniforms {
    matrix: mat4x4<f32>,
};

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;

@group(0) @binding(1)
var earthTexture: texture_2d<f32>;

@group(0) @binding(2)
var earthSampler: sampler;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) kd: vec3<f32>,
};

struct VertexOutput {
    @builtin(position) clipPosition: vec4<f32>,
    @location(0) spherePosition: vec3<f32>,
    @location(1) diffuse: f32,
};

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;

    output.clipPosition =
        uniforms.matrix * vec4<f32>(input.position, 1.0);

    let n = normalize(input.position);
    let l = normalize(vec3<f32>(0.0, 0.0, 1.0));

    output.spherePosition = n;
    output.diffuse = 0.45 + 0.55 * max(dot(n, l), 0.0);

    return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let n = normalize(input.spherePosition);
    let pi = 3.14159265359;

    let u = atan2(n.z, n.x) / (2.0 * pi) + 0.5;
    let v = 0.5 - asin(clamp(n.y, -1.0, 1.0)) / pi;

    let uv = vec2<f32>(u, v);

    let earthColor = textureSample(
        earthTexture,
        earthSampler,
        uv
    );

    return vec4<f32>(
        earthColor.rgb * input.diffuse,
        earthColor.a
    );
}
