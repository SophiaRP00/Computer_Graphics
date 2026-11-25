async function main() {

    // Initialise WebGPU
    if (!navigator.gpu) {
        console.error("WebGPU is not supported!");
        return;
    }

    const canvas = document.getElementById("s224222");
    const adapter = await navigator.gpu.requestAdapter();

    if (!adapter) {
        console.error("No WebGPU adapter found!");
        return;
    }

    const device = await adapter.requestDevice();
    const context = canvas.getContext("webgpu");
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

    context.configure({
        device: device,
        format: canvasFormat,
        alphaMode: "opaque"
    });

    console.log("WebGPU initialized!");

    // Load shader
    const shaderResponse = await fetch("w09_p1.wgsl");

    if (!shaderResponse.ok) {
        throw new Error("Could not load w09_p1.wgsl");
    }

    const shaderCode = await shaderResponse.text();
    const shaderModule = device.createShaderModule({
        code: shaderCode
    });

    // Buttons
    const bounceButton = document.getElementById("bouncer");
    const lightButton = document.getElementById("light");

    if (!bounceButton || !lightButton) {
        throw new Error("Could not find animation buttons in HTML!");
    }

    // Load marble image
    const imageResponse = await fetch("xamp23.png");

    if (!imageResponse.ok) {
        throw new Error("Could not load xamp23.png");
    }

    const imageBlob = await imageResponse.blob();
    const marbleBitmap = await createImageBitmap(imageBlob);

    // Create GPU texture
    const marbleTexture = device.createTexture({
        size: [marbleBitmap.width, marbleBitmap.height],
        format: "rgba8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING |
               GPUTextureUsage.COPY_DST |
               GPUTextureUsage.RENDER_ATTACHMENT
    });

    // Copy image into GPU texture
    device.queue.copyExternalImageToTexture(
        { source: marbleBitmap },
        { texture: marbleTexture },
        [marbleBitmap.width, marbleBitmap.height]
    );

    // Create texture sampler
    const marbleSampler = device.createSampler({
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
        magFilter: "linear",
        minFilter: "linear"
    });

    // Ground quad vertices
    const groundVertices = new Float32Array([
        -2, -1, -1,
         2, -1, -1,
         2, -1, -5,
        -2, -1, -5
    ]);

    // Texture coordinates
    const groundTexCoords = new Float32Array([
        0, 0,
        1, 0,
        1, 1,
        0, 1
    ]);

    // Ground indices
    const groundIndices = new Uint16Array([
        0, 1, 2,
        0, 2, 3
    ]);

    // Create GPU buffers
    function createGPUBuffer(data, usage) {

        const buffer = device.createBuffer({
            size: data.byteLength,
            usage: usage,
            mappedAtCreation: true
        });

        const mapped = buffer.getMappedRange();

        new Uint8Array(mapped).set(
            new Uint8Array(
                data.buffer,
                data.byteOffset,
                data.byteLength
            )
        );

        buffer.unmap();
        return buffer;
    }

    const groundVertexBuffer = createGPUBuffer(
        groundVertices,
        GPUBufferUsage.VERTEX
    );

    const groundTexCoordBuffer = createGPUBuffer(
        groundTexCoords,
        GPUBufferUsage.VERTEX
    );

    const groundIndexBuffer = createGPUBuffer(
        groundIndices,
        GPUBufferUsage.INDEX
    );

    // Load Utah teapot OBJ file
    const drawingInfo = await readOBJFile(
        "utah_teapot.obj",
        1.0,
        false
    );

    if (!drawingInfo) {
        console.error("Could not load OBJ file!");
        return;
    }

    const vertices = drawingInfo.vertices;
    const normals = drawingInfo.normals;
    const colors = drawingInfo.colors;
    const indices = drawingInfo.indices;

    console.log("OBJ file loaded successfully!");
    console.log("Number of indices:", indices.length);

    // Normalise model coordinates
    const normalizedVertices = new Float32Array(vertices);

    let min = [Infinity, Infinity, Infinity];
    let max = [-Infinity, -Infinity, -Infinity];

    for (let i = 0; i < vertices.length; i += 4) {

        for (let j = 0; j < 3; j++) {

            min[j] = Math.min(min[j], vertices[i + j]);
            max[j] = Math.max(max[j], vertices[i + j]);

        }
    }

    const center = min.map(
        (value, i) => (value + max[i]) / 2
    );

    const size = Math.max(
        max[0] - min[0],
        max[1] - min[1],
        max[2] - min[2]
    );

    if (!Number.isFinite(size) || size === 0) {
        console.error("Invalid model dimensions!");
        return;
    }

    const normalizationScale = 1.8 / size;

    for (let i = 0; i < vertices.length; i += 4) {

        for (let j = 0; j < 3; j++) {

            normalizedVertices[i + j] =
                (vertices[i + j] - center[j]) * normalizationScale;
        }
    }

    // Create teapot GPU buffers
    const vertexBuffer = createGPUBuffer(
        normalizedVertices,
        GPUBufferUsage.VERTEX
    );

    const normalBuffer = createGPUBuffer(
        normals,
        GPUBufferUsage.VERTEX
    );

    const colorBuffer = createGPUBuffer(
        colors,
        GPUBufferUsage.VERTEX
    );

    const indexBuffer = createGPUBuffer(
        indices,
        GPUBufferUsage.INDEX
    );

    console.log("GPU buffers created!");

    // Model scale
    const s0 = 0.5;

    const scaleMatrix = new Float32Array([
        s0, 0,  0,  0,
        0,  s0, 0,  0,
        0,  0,  s0, 0,
        0,  0,  0,  1
    ]);

    // Rotate teapot upright
    const a = -Math.PI / 2;
    const c = Math.cos(a);
    const s = Math.sin(a);

    const rotationMatrix = new Float32Array([
        1, 0,  0, 0,
        0, c,  s, 0,
        0, -s, c, 0,
        0, 0,  0, 1
    ]);

    // Teapot position
    const halfHeight =
        0.5 * (max[2] - min[2]) * normalizationScale * s0;

    // Camera view
    const eye = [0, -0.5, 0];
    const target = [0, -0.5, -3];

    const viewMatrix = lookAt(
        eye,
        target,
        [0, 1, 0]
    );

    // Projection matrix
    const projectionMatrix = perspective(
        Math.PI / 4,
        canvas.width / canvas.height,
        0.1,
        100
    );

    const viewProjectionMatrix = multiplyMatrices(
        projectionMatrix,
        viewMatrix
    );

    // Initial animation positions
    let currentY = -1;
    let direction = 1;
    const minY = -1;
    const maxY = 0.5;
    const speed = 0.8;

    let previousTime = 0;

    // Point light animation
    let lightPosition = [2, 2, -2];

    let lightAngle = 0;
    const lightSpeed = 1.0;

    let previousLightTime = 0;

    // Animation controls
    let animationEnabled = false;
    let animationFrameId = null;

    let lightAnimationEnabled = false;
    let lightAnimationFrameId = null;

    // Camera buffer:
    // 16 floats for viewProjection
    // 16 floats for modelMatrix
    // 4 floats for lightPosition
    const cameraBuffer = device.createBuffer({
        size: 144,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    // Create teapot render pipeline
    const pipeline = device.createRenderPipeline({

        layout: "auto",

        vertex: {
            module: shaderModule,
            entryPoint: "vertexMain",

            buffers: [
                {
                    arrayStride: 16,
                    attributes: [{
                        shaderLocation: 0,
                        offset: 0,
                        format: "float32x4"
                    }]
                },
                {
                    arrayStride: 16,
                    attributes: [{
                        shaderLocation: 1,
                        offset: 0,
                        format: "float32x4"
                    }]
                },
                {
                    arrayStride: 16,
                    attributes: [{
                        shaderLocation: 2,
                        offset: 0,
                        format: "float32x4"
                    }]
                }
            ]
        },

        fragment: {
            module: shaderModule,
            entryPoint: "fragmentMain",

            targets: [{
                format: canvasFormat
            }]
        },

        primitive: {
            topology: "triangle-list",
            cullMode: "none"
        },

        depthStencil: {
            depthWriteEnabled: true,
            depthCompare: "less",
            format: "depth24plus"
        }
    });

    // Create ground render pipeline
    const groundPipeline = device.createRenderPipeline({

        layout: "auto",

        vertex: {
            module: shaderModule,
            entryPoint: "groundVertexMain",

            buffers: [
                {
                    arrayStride: 12,
                    attributes: [{
                        shaderLocation: 0,
                        offset: 0,
                        format: "float32x3"
                    }]
                },
                {
                    arrayStride: 8,
                    attributes: [{
                        shaderLocation: 1,
                        offset: 0,
                        format: "float32x2"
                    }]
                }
            ]
        },

        fragment: {
            module: shaderModule,
            entryPoint: "groundFragmentMain",

            targets: [{
                format: canvasFormat
            }]
        },

        primitive: {
            topology: "triangle-list",
            cullMode: "none"
        },

        depthStencil: {
            depthWriteEnabled: true,
            depthCompare: "less",
            format: "depth24plus"
        }
    });

    // Teapot bind group
    const bindGroup = device.createBindGroup({

        layout: pipeline.getBindGroupLayout(0),
        entries: [{
            binding: 0,
            resource: {
                buffer: cameraBuffer
            }
        }]
    });

    // Ground bind group
    const groundBindGroup = device.createBindGroup({

        layout: groundPipeline.getBindGroupLayout(0),

        entries: [
            {
                binding: 0,
                resource: { buffer: cameraBuffer }
            },
            {
                binding: 1,
                resource: marbleTexture.createView()
            },
            {
                binding: 2,
                resource: marbleSampler
            }
        ]
    });

    // Create depth texture
    const depthTexture = device.createTexture({

        size: [
            canvas.width,
            canvas.height
        ],

        format: "depth24plus",
        usage: GPUTextureUsage.RENDER_ATTACHMENT
    });

    // Update uniform buffer
    function updateUniformBuffer() {

        const translationMatrix = new Float32Array([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, currentY + halfHeight, -3, 1
        ]);

        const modelMatrix = multiplyMatrices(
            translationMatrix,
            multiplyMatrices(rotationMatrix, scaleMatrix)
        );

        const cameraData = new Float32Array(36);
        cameraData.set(viewProjectionMatrix, 0);
        cameraData.set(modelMatrix, 16);

        cameraData.set([
            lightPosition[0],
            lightPosition[1],
            lightPosition[2],
            1.0
        ], 32);

        device.queue.writeBuffer(
            cameraBuffer,
            0,
            cameraData
        );
    }

    // Render function
    function render() {
        const commandEncoder = device.createCommandEncoder();
        const renderPass = commandEncoder.beginRenderPass({

            colorAttachments: [
                {
                    view: context.getCurrentTexture().createView(),
                    clearValue: {
                        r: 0.65,
                        g: 0.83,
                        b: 0.95,
                        a: 1.0
                    },

                    loadOp: "clear",
                    storeOp: "store"
                }
            ],

            depthStencilAttachment: {
                view: depthTexture.createView(),

                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store"
            }
        });

        // Draw ground
        renderPass.setPipeline(groundPipeline);
        renderPass.setBindGroup(0, groundBindGroup);
        renderPass.setVertexBuffer(0, groundVertexBuffer);
        renderPass.setVertexBuffer(1, groundTexCoordBuffer);

        renderPass.setIndexBuffer(
            groundIndexBuffer,
            "uint16"
        );

        renderPass.drawIndexed(6);

        // Draw teapot
        renderPass.setPipeline(pipeline);
        renderPass.setBindGroup(0, bindGroup);
        renderPass.setVertexBuffer(0, vertexBuffer);
        renderPass.setVertexBuffer(1, normalBuffer);
        renderPass.setVertexBuffer(2, colorBuffer);

        renderPass.setIndexBuffer(
            indexBuffer,
            "uint32"
        );

        renderPass.drawIndexed(indices.length);
        renderPass.end();

        device.queue.submit([
            commandEncoder.finish()
        ]);
    }

    // Teapot bouncing animation
    function animate(timestamp) {

        if (previousTime === 0) {
            previousTime = timestamp;
        }

        const deltaTime = (timestamp - previousTime) / 1000;
        previousTime = timestamp;

        currentY += direction * speed * deltaTime;

        if (currentY >= maxY) {
            currentY = maxY;
            direction = -1;
        }

        if (currentY <= minY) {
            currentY = minY;
            direction = 1;
        }

        updateUniformBuffer();
        render();

        if (animationEnabled) {
            animationFrameId = requestAnimationFrame(animate);
        }
    }

    // Point light circular animation
    function animatePointLight(timestamp) {

        if (previousLightTime === 0) {
            previousLightTime = timestamp;
        }

        const deltaTime =
            (timestamp - previousLightTime) / 1000;

        previousLightTime = timestamp;

        // Update angle
        lightAngle += lightSpeed * deltaTime;

        // Circular path:
        // Centre (0, 2, -2)
        // Radius 2
        // Parallel to XZ-plane
        lightPosition = [
            2 * Math.cos(lightAngle),
            2,
            -2 + 2 * Math.sin(lightAngle)
        ];

        updateUniformBuffer();
        render();

        if (lightAnimationEnabled) {
            lightAnimationFrameId =
                requestAnimationFrame(animatePointLight);
        }
    }

    // Initial render
    updateUniformBuffer();
    render();

    // Bounce button
    bounceButton.addEventListener("click", () => {

        animationEnabled = !animationEnabled;

        if (animationEnabled) {
            previousTime = 0;
            animationFrameId =
                requestAnimationFrame(animate);

            bounceButton.textContent = "Stop Bouncing";

        } else {

            cancelAnimationFrame(animationFrameId);
            bounceButton.textContent = "Bounce";
        }
    });

    // Point light button
    lightButton.addEventListener("click", () => {
        lightAnimationEnabled = !lightAnimationEnabled;

        if (lightAnimationEnabled) {
            previousLightTime = 0;
            lightAnimationFrameId =
                requestAnimationFrame(animatePointLight);

            lightButton.textContent = "Stop Point Light";

        } else {

            cancelAnimationFrame(lightAnimationFrameId);
            lightButton.textContent = "Animate Point Light";
        }
    });

    console.log("Application ready!");
}

// Camera helper functions
function normalize(v) {
    const length = Math.hypot(
        v[0],
        v[1],
        v[2]
    );

    return [
        v[0] / length,
        v[1] / length,
        v[2] / length
    ];
}

function cross(a, b) {
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0]
    ];
}

function dot(a, b) {
    return (
        a[0] * b[0] +
        a[1] * b[1] +
        a[2] * b[2]
    );
}

// Camera view matrix
function lookAt(eye, target, up) {

    const zAxis = normalize([
        eye[0] - target[0],
        eye[1] - target[1],
        eye[2] - target[2]
    ]);

    const xAxis = normalize(cross(up, zAxis));
    const yAxis = cross(zAxis, xAxis);

    return new Float32Array([

        xAxis[0], yAxis[0], zAxis[0], 0,
        xAxis[1], yAxis[1], zAxis[1], 0,
        xAxis[2], yAxis[2], zAxis[2], 0,

        -dot(xAxis, eye),
        -dot(yAxis, eye),
        -dot(zAxis, eye),
        1
    ]);
}

// Perspective projection matrix
function perspective(fov, aspect, near, far) {

    const f = 1 / Math.tan(fov / 2);
    return new Float32Array([

        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, far / (near - far), -1,
        0, 0, (near * far) / (near - far), 0

    ]);
}
// Matrix multiplication
function multiplyMatrices(a, b) {
    const result = new Float32Array(16);
    for (let column = 0; column < 4; column++) {
        for (let row = 0; row < 4; row++) {

            result[column * 4 + row] =
                a[row] * b[column * 4] +
                a[4 + row] * b[column * 4 + 1] +
                a[8 + row] * b[column * 4 + 2] +
                a[12 + row] * b[column * 4 + 3];
        }
    }

    return result;
}

// Start application
main().catch(error => {
    console.error("Application error:", error);
});
