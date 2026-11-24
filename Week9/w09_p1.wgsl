
struct Camera {
    viewProjection: mat4x4<f32>,
    rotation: f32
};

@group(0) @binding(0)
var<uniform> camera: Camera;


struct VertexInput {
    @location(0) position: vec4<f32>,
    @location(1) normal: vec4<f32>,
    @location(2) color: vec4<f32>
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) normal: vec3<f32>,
    @location(1) color: vec4<f32>
};


@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {

    var output: VertexOutput;

    let c = cos(camera.rotation);
    let s = sin(camera.rotation);

    let rotatedPosition = vec4<f32>(
        c * input.position.x + s * input.position.z,
        input.position.y,
        -s * input.position.x + c * input.position.z,
        1.0
    );

    output.position = camera.viewProjection * rotatedPosition;

    // Display normals as RGB colors.
    output.normal = normalize(input.normal.xyz);
    output.color = input.color;

    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {

    let lightDirection = normalize(vec3<f32>(1.0, 1.0, 1.0));

    let diffuse = max(
        dot(normalize(input.normal), lightDirection),
        0.0
    );

    let ambient = 0.3;
    let lighting = ambient + 0.7 * diffuse;

    return vec4<f32>(
        input.color.rgb * lighting,
        input.color.a
    );
}
