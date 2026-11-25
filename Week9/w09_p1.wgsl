struct Camera {
    viewProjection: mat4x4<f32>,
    modelMatrix: mat4x4<f32>,
    lightPosition: vec4<f32>
};

@group(0) @binding(0)
var<uniform> camera: Camera;

// TEAPOT SHADER
struct VertexInput {
    @location(0) position: vec4<f32>,
    @location(1) normal: vec4<f32>,
    @location(2) color: vec4<f32>
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) normal: vec3<f32>,
    @location(1) color: vec4<f32>,
    @location(2) worldPosition: vec3<f32>
};

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {

    var output: VertexOutput;
    let worldPosition = camera.modelMatrix * input.position;
    output.position = camera.viewProjection * camera.modelMatrix;

    // Display normals as RGB colors.
    output.normal = normalize((camera.modelMatrix * vec4<f32>(input.normal.xyz, 0.0)).xyz);
    output.color = input.color;

    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {

    let lightDirection = normalize(camera.lightPosition.xyz - input.worldPosition);
    let diffuse = max(dot(normalize(input.normal), lightDirection), 0.0);

    let ambient = 0.3;
    let lighting = ambient + 0.7 * diffuse;

    return vec4<f32>(
        input.color.rgb * lighting,
        input.color.a
    );
}

// GROUND SHADER 
@group(0) @binding(1)
var marbleTexture: texture_2d<f32>;

@group(0) @binding(2)
var marbleSampler: sampler;

struct GroundVertexInput {
    @location(0) position: vec3<f32>,
    @location(1) texCoord: vec2<f32>
};

struct GroundVertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texCoord: vec2<f32>
};

@vertex
fn groundVertexMain(input: GroundVertexInput) -> GroundVertexOutput {

    var output: GroundVertexOutput;

    output.position = camera.viewProjection * vec4<f32>(input.position, 1.0);
    output.texCoord = input.texCoord;
    return output;
}

@fragment
fn groundFragmentMain(input: GroundVertexOutput) -> @location(0) vec4<f32> {

    return textureSample(
        marbleTexture,
        marbleSampler,
        input.texCoord
    );
}
