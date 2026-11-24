
struct VertexInput {
    @location(0) position: vec3f,
    @location(1) color: vec3f,
    @location(2) opacity: f32,
    @location(3) sigmaI: vec4f,
    @location(4) sigmaII: vec2f,
};

struct CameraUniforms {
    viewMatrix: mat4x4f,
    projectionMatrix: mat4x4f,
    resolution: vec2f,
    padding: vec2f,
};

@group(0) @binding(0)
var<uniform> camera: CameraUniforms;

// Vertex shader output
struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) color: vec3f,
    @location(1) opacity: f32,
    @location(2) splatPosition: vec2f,
    @location(3) invCovariance: vec3f,
    @location(4) @interpolate(flat) instanceIndex: u32,
};

// Fragment shader input
struct FragmentInput {
    @location(0) color: vec3f,
    @location(1) opacity: f32,
    @location(2) splatPosition: vec2f,
    @location(3) invCovariance: vec3f,
    @location(4) @interpolate(flat) instanceIndex: u32,

};

@vertex
fn vs_main(
    @builtin(vertex_index) vertexIndex: u32,
    @builtin(instance_index) instanceIndex: u32,
    input: VertexInput
) -> VertexOutput {

    var output: VertexOutput;

    output.color = input.color;
    output.opacity = input.opacity;
    output.instanceIndex = instanceIndex;

    // Transform the Gaussian centre into camera space.
    let viewCenter = camera.viewMatrix * vec4f(input.position, 1.0);

    // Avoid projecting Gaussians behind or too close to the camera.
    if (viewCenter.z >= -0.1) {
        output.position = vec4f(2.0, 2.0, 2.0, 1.0);
        output.splatPosition = vec2f(0.0);
        output.invCovariance = vec3f(1.0, 0.0, 1.0);
        return output;
    }

    // Project the Gaussian centre.
    let clipCenter = camera.projectionMatrix * viewCenter;
    let ndc = clipCenter.xy / clipCenter.w;

    let centerPixel = vec2f(
        (ndc.x + 1.0) * 0.5 * camera.resolution.x,
        (1.0 - ndc.y) * 0.5 * camera.resolution.y
    );

    // Reconstruct the symmetric 3D covariance matrix.
    // xx, xy, xz, yy, yz, zz
    let xx = input.sigmaI.x;
    let xy = input.sigmaI.y;
    let xz = input.sigmaI.z;
    let yy = input.sigmaI.w;
    let yz = input.sigmaII.x;
    let zz = input.sigmaII.y;

    let covarianceWorld = mat3x3f(
        vec3f(xx, xy, xz),
        vec3f(xy, yy, yz),
        vec3f(xz, yz, zz)
    );

    // Rotate covariance from world space into camera space.
    let viewRotation = mat3x3f(
        camera.viewMatrix[0].xyz,
        camera.viewMatrix[1].xyz,
        camera.viewMatrix[2].xyz
    );

    let covarianceView =
        viewRotation * covarianceWorld * transpose(viewRotation);

    let focalX = camera.projectionMatrix[0][0];
    let focalY = camera.projectionMatrix[1][1];

    let x = viewCenter.x;
    let y = viewCenter.y;
    let z = viewCenter.z;

    let j0 = vec2f(
        -0.5 * camera.resolution.x * focalX / z,
        0.0
    );

    let j1 = vec2f(
        0.0,
        0.5 * camera.resolution.y * focalY / z
    );

    let j2 = vec2f(
        0.5 * camera.resolution.x * focalX * x / (z * z),
        -0.5 * camera.resolution.y * focalY * y / (z * z)
    );

    // Project the 3D covariance into a 2D screen-space covariance.
    let cxx = covarianceView[0][0];
    let cxy = covarianceView[1][0];
    let cxz = covarianceView[2][0];
    let cyy = covarianceView[1][1];
    let cyz = covarianceView[2][1];
    let czz = covarianceView[2][2];

    var sxx =
        cxx * j0.x * j0.x +
        cyy * j1.x * j1.x +
        czz * j2.x * j2.x +
        2.0 * cxy * j0.x * j1.x +
        2.0 * cxz * j0.x * j2.x +
        2.0 * cyz * j1.x * j2.x;

    var sxy =
        cxx * j0.x * j0.y +
        cxy * (j0.x * j1.y + j1.x * j0.y) +
        cxz * (j0.x * j2.y + j2.x * j0.y) +
        cyy * j1.x * j1.y +
        cyz * (j1.x * j2.y + j2.x * j1.y) +
        czz * j2.x * j2.y;

    var syy =
        cxx * j0.y * j0.y +
        cyy * j1.y * j1.y +
        czz * j2.y * j2.y +
        2.0 * cxy * j0.y * j1.y +
        2.0 * cxz * j0.y * j2.y +
        2.0 * cyz * j1.y * j2.y;

    // Small screen-space filter to avoid degenerate ellipses.
    sxx += 0.3;
    syy += 0.3;

    // Invert the 2D covariance matrix.
    let determinant = sxx * syy - sxy * sxy;

    if (determinant <= 0.00000001) {
        output.position = vec4f(2.0, 2.0, 2.0, 1.0);
        output.splatPosition = centerPixel;
        output.invCovariance = vec3f(1.0, 0.0, 1.0);
        return output;
    }

    output.splatPosition = centerPixel;

    output.invCovariance = vec3f(
        syy / determinant,
        -sxy / determinant,
        sxx / determinant
    );

    // Find the principal axes of the 2D covariance.
    let trace = sxx + syy;
    let discriminant = sqrt(
        max((sxx - syy) * (sxx - syy) + 4.0 * sxy * sxy, 0.0)
    );

    let lambda1 = max(0.5 * (trace + discriminant), 0.3);
    let lambda2 = max(0.5 * (trace - discriminant), 0.3);

    let angle = 0.5 * atan2(2.0 * sxy, sxx - syy);

    let direction1 = vec2f(cos(angle), sin(angle));
    let direction2 = vec2f(-sin(angle), cos(angle));

    // Draw the quad approximately three standard deviations wide.
    let halfSide1 = 3.0 * sqrt(lambda1);
    let halfSide2 = 3.0 * sqrt(lambda2);

    // Four corners of the quad.
    var corners = array<vec2f, 4>(
        vec2f(-1.0, -1.0),
        vec2f( 1.0, -1.0),
        vec2f(-1.0,  1.0),
        vec2f( 1.0,  1.0)
    );

    let corner = corners[vertexIndex];

    let offset =
        corner.x * halfSide1 * direction1 +
        corner.y * halfSide2 * direction2;

    let pixelPosition = centerPixel + offset;

    // Convert pixel coordinates back to normalized device coordinates.
    let quadNdc = vec2f(
        2.0 * pixelPosition.x / camera.resolution.x - 1.0,
        1.0 - 2.0 * pixelPosition.y / camera.resolution.y
    );

    output.position = vec4f(
        quadNdc,
        clipCenter.z / clipCenter.w,
        1.0
    );

    return output;
}

// Random number generator for stochastic transparency.
fn randomNumber(pixel: vec2f, instanceIndex: u32) -> f32 {

    let x = u32(pixel.x);
    let y = u32(pixel.y);

    var seed = x * 1973u
             + y * 9277u
             + instanceIndex * 26699u
             + 0x68bc21ebu;

    seed = seed ^ (seed >> 16u);
    seed = seed * 0x7feb352du;
    seed = seed ^ (seed >> 15u);
    seed = seed * 0x846ca68bu;
    seed = seed ^ (seed >> 16u);

    return f32(seed) / 4294967296.0;
}

@fragment
fn fs_main(
    input: FragmentInput,
    @builtin(position) fragCoord: vec4f
) -> @location(0) vec4f {

    // Difference between fragment position and splat centre
    let delta = fragCoord.xy - input.splatPosition;

    // Inverse covariance matrix
    let xx = input.invCovariance.x;
    let xy = input.invCovariance.y;
    let yy = input.invCovariance.z;

    // Gaussian exponent
    let power =
        xx * delta.x * delta.x
        + 2.0 * xy * delta.x * delta.y
        + yy * delta.y * delta.y;

    // Gaussian alpha
    let alpha = input.opacity * exp(-0.5 * power);

    // Generate random number for Stochastic
    let xi = randomNumber(fragCoord.xy, input.instanceIndex);
    
    // Stochastic selection
    if (xi > alpha) {
        discard;
    }
    
    // Return opaque colour
    return vec4f(input.color, 1.0);
    }
