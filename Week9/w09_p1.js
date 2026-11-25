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

    // Button Code 
    const bounceButton = document.getElementById("bouncer");

    // Load Image
    const imageResponse = await fetch("xamp23.png")
    const imageBlob = await imageResponse.blob();
    const marbleBitmap = await createImageBitmap(imageBlob);
    
    // Create GPU texture
    const marbleTexture = device.createTexture({
        size: [marbleBitmap.width, marbleBitmap.height],
        format: "rgba8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
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
    
        // Ground quad vertices: x, y, z
    const groundVertices = new Float32Array([
        -2, -1, -1,
         2, -1, -1,
         2, -1, -5,
        -2, -1, -5
    ]);
    
    // Texture coordinates: u, v
    const groundTexCoords = new Float32Array([
        0, 0,
        1, 0,
        1, 1,
        0, 1
    ]);
    
    // Two triangles forming the quad
    const groundIndices = new Uint16Array([
        0, 1, 2,
        0, 2, 3
    ]);
    
    // Create ground buffers
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
    console.log("Material color sample:",
        Array.from(colors.slice(0, 20))
    );

    let minColor = Infinity;
    let maxColor = -Infinity;

    for (const color of colors) {
        minColor = Math.min(minColor, color);
        maxColor = Math.max(maxColor, color);
    }

    console.log("Color range:", {
        min: minColor,
        max: maxColor
    });

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

    // Model matrix: scale to one quarter
    const s0 = 0.5;
    const scaleMatrix = new Float32Array([
        s0, 0,    0,    0,
        0,    s0, 0,    0,
        0,    0,    s0, 0,
        0,    0,    0,    1
    ]);

    const a = -Math.PI / 2;
    const c = Math.cos(a), s = Math.sin(a);
    const rotationMatrix = new Float32Array([
        1, 0, 0, 0,
        0, c, s, 0,
        0, -s, c, 0,
        0, 0, 0, 1
    ]);

    // Model matrix: translate by (0, -1, -3)
    const halfHeight = 0.5 * (max[2] - min[2]) * normalizationScale * s0;
    const translationMatrix = new Float32Array([
        1, 0,  0,  0,
        0, 1,  0,  0,
        0, 0,  1,  0,
        0, -1 + halfHeight, -3, 1
    ]);

    // Combine translation and scaling
    const modelMatrix = multiplyMatrices(
        translationMatrix,
        multiplyMatrices(rotationMatrix, scaleMatrix)
    );

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

    // Combine projection and view matrices
    const viewProjectionMatrix = multiplyMatrices(
        projectionMatrix,
        viewMatrix
    );

    // Camera buffer: two 4x4 matrices = 128 bytes
    const cameraBuffer = device.createBuffer({
        size: 128,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    // Animation variables
    let animationEnabled = false;
    let animationFrameId = null;
    
    let currentY = -1;
    let direction = 1;
    
    const minY = -1;
    const maxY = 0.5;
    const speed = 0.8; // Movement speed
    let previousTime = 0;

    // Create render pipeline
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

    // Create bind group
    const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),

        entries: [{
            binding: 0,
            resource: {
                buffer: cameraBuffer
            }
        }]
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

    // Update camera and model matrices in uniform buffer
    const cameraData = new Float32Array(32);

    cameraData.set(viewProjectionMatrix, 0);
    cameraData.set(modelMatrix, 16);

    device.queue.writeBuffer(
        cameraBuffer,
        0,
        cameraData
    );

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
        renderPass.setIndexBuffer(groundIndexBuffer, "uint16");
        
        renderPass.drawIndexed(6);

        // Draw Teapot
        renderPass.setPipeline(pipeline);
        renderPass.setBindGroup(0, bindGroup);

        renderPass.setVertexBuffer(0, vertexBuffer);
        renderPass.setVertexBuffer(1, normalBuffer);
        renderPass.setVertexBuffer(2, colorBuffer);

        renderPass.setIndexBuffer(indexBuffer, "uint32");

        renderPass.drawIndexed(indices.length);

        renderPass.end();

        device.queue.submit([
            commandEncoder.finish()
        ]);
    }

    // Render the teapot
    // Animation function
    function animate(timestamp) {
    
        if (previousTime === 0) {
            previousTime = timestamp;
        }
    
        const deltaTime = (timestamp - previousTime) / 1000;
        previousTime = timestamp;
    
        // Update vertical position
        currentY += direction * speed * deltaTime;
    
        // Reverse direction at the limits
        if (currentY >= maxY) {
            currentY = maxY;
            direction = -1;
        }
    
        if (currentY <= minY) {
            currentY = minY;
            direction = 1;
        }
    
        // Create updated translation matrix
        const translationMatrix = new Float32Array([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, currentY + halfHeight, -3, 1
        ]);
    
        // Update model matrix
        const modelMatrix = multiplyMatrices(
            translationMatrix,
            multiplyMatrices(rotationMatrix, scaleMatrix)
        );
    
        // Update camera buffer
        const cameraData = new Float32Array(32);
    
        cameraData.set(viewProjectionMatrix, 0);
        cameraData.set(modelMatrix, 16);
    
        device.queue.writeBuffer(
            cameraBuffer,
            0,
            cameraData
        );
    
        // Render the scene
        render();
    
        // Continue animation
        animationFrameId = requestAnimationFrame(animate);
    }
    
    // Start bouncing
    // Render the scene when the page loads
render();

// Button controls
    bounceButton.addEventListener("click", () => {
    
        animationEnabled = !animationEnabled;
    
        if (animationEnabled) {
    
            previousTime = 0;
            animationFrameId = requestAnimationFrame(animate);
    
            bounceButton.textContent = "Stop Bouncing";
    
        } else {
    
            cancelAnimationFrame(animationFrameId);
    
            bounceButton.textContent = "Bounce";
        }
    });
}
// Camera helper functions

function normalize(v) {
    const length = Math.hypot(v[0], v[1], v[2]);

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

// Start the application
main().catch(error => {
    console.error("Application error:", error);
});
