

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) color: vec4f
};

@vertex
fn vs_main(
    @builtin(vertex_index) vertexIndex: u32,
    @location(0) pointPosition: vec2f,
    @location(1) pointColor: vec4f
) -> VertexOutput {

    var corners = array<vec2f, 4>(
        vec2f(-0.5, -0.5),
        vec2f( 0.5, -0.5),
        vec2f(-0.5,  0.5),
        vec2f( 0.5,  0.5)
    );

    let width = 0.8;

    let offset = corners[vertexIndex] * width;

    var output: VertexOutput;

    output.position = vec4f(
        pointPosition + offset,
        0.0,
        1.0
    );

    output.color = pointColor;

    return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4f {
    return input.color;
}
