"use strict";

import { generateMipmap, numMipLevels } from "./genmipmap.js";

window.onload = function() {
    main();
}

async function main()
{
    // Check WebGPU
    if (!navigator.gpu) {
        console.error("WebGPU is not supported by this browser.");
        return;
    }

    const gpu = navigator.gpu;
    const adapter = await gpu.requestAdapter();

    if (!adapter) {
        console.error("No WebGPU adapter found.");
        return;
    }

    const device = await adapter.requestDevice();

    // Canvas
    const canvas = document.getElementById('s224222');
    const context = canvas.getContext('webgpu');

    const canvasFormat =
        navigator.gpu.getPreferredCanvasFormat();

    context.configure({
        device: device,
        format: canvasFormat
    });


    // Load shader
    const shaderCode =
        await fetch("w06_p3.wgsl")
            .then(response => response.text());
        console.log("Shader loaded: ");
        console.log(shaderCode);

    const shaderModule =
        device.createShaderModule({
            code: shaderCode
        });

    // Load Earth Image into a texture
    // Code from slides
    const response = await fetch("earth.jpg");
    const blob = await response.blob();
    const image = await createImageBitmap(blob, { colorSpaceConversion: 'none'});

    // TETRAHEDRON - Defining terms before function
    // Setting M to 1
    const M_SQRT2 = Math.sqrt(2.0);
    const M_SQRT6 = Math.sqrt(6.0);
    let M = 5;
    let positions;
    let indices;
    let positionBuffer;
    let indexBuffer;

    const options = {
        mipmap: true,
        flipY: false,
    }; 

    // Creating texture with MIPMAPS
    var myTexture = device.createTexture({
        size: [image.width, image.height, 1],
        format: "rgba8unorm",
        mipLevelCount: options.mipmap ? numMipLevels(image.width, image.height): 1,
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
    });

    device.queue.copyExternalImageToTexture(
        { source: image, flipY: options.flipY},
        { texture: myTexture },
        { width: image.width, height: image.height},
    );

    if(options.mipmap)
        generateMipmap(device, myTexture);

    const mySampler = device.createSampler({
        addressModeU: "repeat",
        addressModeV: "clamp-to-edge",
        magFilter: "linear",
        minFilter: "linear",
        mipmapFilter: "linear",
    });

    // Creating a function to update the sphere, depending on M
    function updateSphere()
    {
    // Create original tetrahedron
    positions = [
        [0.0, 0.0, 1.0],
        [0.0, 2.0 * M_SQRT2 / 3.0, -1.0 / 3.0],
        [-M_SQRT6 / 3.0, -M_SQRT2 / 3.0, -1.0 / 3.0],
        [M_SQRT6 / 3.0, -M_SQRT2 / 3.0, -1.0 / 3.0],
    ];

    indices = new Uint32Array([
        0, 1, 2,
        0, 3, 1,
        1, 3, 2,
        0, 2, 3
    ]);

    // Subdivide
    for (let i = 0; i < M; ++i) {
        indices = subdivide_sphere(
            positions,
            indices
        );
    }

    const vertexData = flatten(positions);

    if (positionBuffer) {
        positionBuffer.destroy();
    }

    if (indexBuffer) {
        indexBuffer.destroy();
    }

    // Create new vertex buffer
    positionBuffer = device.createBuffer({
        size: vertexData.byteLength,
        usage:
            GPUBufferUsage.VERTEX |
            GPUBufferUsage.COPY_DST
    });

    device.queue.writeBuffer(
        positionBuffer,
        0,
        vertexData
    );

    // Create new index buffer
    indexBuffer = device.createBuffer({
        size: indices.byteLength,
        usage:
            GPUBufferUsage.INDEX |
            GPUBufferUsage.COPY_DST
    });

    device.queue.writeBuffer(
        indexBuffer,
        0,
        indices
    );
}

    // UNIFORM BUFFER

    const uniformBuffer = device.createBuffer({
        size: 64,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    // BIND GROUP LAYOUT

    const bindGroupLayout = device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.VERTEX,
                buffer: {
                    type: "uniform"
                }
            },
            {
                binding: 1,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {
                    sampleType: "float",
                    viewDimension: "2d"
                }
            },
            {
                binding: 2,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: {
                    type: "filtering"
                }
            }
        ]
    });

    // BIND GROUP
    const uniformBindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: uniformBuffer
                }
            },
            {
                binding: 1,
                resource: myTexture.createView()
            },
            {
                binding: 2,
                resource: mySampler
            }
        ]
    });

        // Depth Texture
        const depthTexture = device.createTexture({
            size: { width: canvas.width, height: canvas.height},
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });

    // RENDER PIPELINE

    const pipeline =
        device.createRenderPipeline({
            layout:
                device.createPipelineLayout({

                    bindGroupLayouts: [
                        bindGroupLayout
                    ]
                }),

            vertex: {
                module:
                    shaderModule,
                entryPoint:
                    "vs_main",
                buffers: [{

                    arrayStride:
                        6 * 4,

                    attributes: [
                    {
                        shaderLocation: 0,
                        offset: 0,
                        format: "float32x3"
                    },
                    {
                    shaderLocation: 1,
                    offset: 3*4,
                    format: "float32x3"
                    }
                ]
            }],
        },

            fragment: {
                module: shaderModule,
                entryPoint: "fs_main",
                targets: [{
                    format: canvasFormat
                }]
            },

            primitive: {
                topology: "triangle-list",
                frontFace: "ccw",
                cullMode: "none"
            },

            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: 'less',
                format: 'depth24plus'
            },
        });

    // CAMERA - Translation & 45 Degree Angle

    const aspect =
        canvas.width / canvas.height;


    // 45 degree vertical field of view
    const projection =
        pinhole(
            45,
            aspect,
            0.1,
            100
        );

    // DRAW  FUNCTION
    function drawSphere(
        renderpass,
        model,
        uniformBuffer,
        bindGroup,
        view)
    {
        const modelView =
            multiply(
                view,
                model
            );

        const matrix =
            multiply(
                projection,
                modelView
            );

        device.queue.writeBuffer(
            uniformBuffer,
            0,
            matrix
        );

        renderpass.setBindGroup(
            0,
            bindGroup
        );

        // Draw cube
        renderpass.drawIndexed(
            indices.length,
            1,
            0,
            0,
            0,
        );
    }

    // RENDER FUNCTION

    function render(timestamp)
    {
        const radius = 3;
        const angle = timestamp * 0.0005; // orbit speed

        const eye = [
            radius * Math.sin(angle),
            0,
            radius * Math.cos(angle)
        ];

        const view = lookAt(
            eye,
            [0, 0, 0],
            [0, 1, 0]
        );

        const commandEncoder =
            device.createCommandEncoder();

        const textureView =
            context
                .getCurrentTexture()
                .createView();

        const renderPass =
            commandEncoder.beginRenderPass({

                colorAttachments: [{

                    view:
                        textureView,

                    clearValue: {

                        r: 0,
                        g: 0,
                        b: 0,
                        a: 1
                    },

                    loadOp:
                        "clear",

                    storeOp:
                        "store"
                }],

                depthStencilAttachment: {
                view: depthTexture.createView(),
                depthLoadOp: "clear",
                depthClearValue: 1.0,
                depthStoreOp: "store", 
            }
            });


        // SET PIPELINE
        renderPass.setPipeline(
            pipeline
        );

        // SET VERTEX BUFFER
        renderPass.setVertexBuffer(
            0,
            positionBuffer
        );

        // SET INDEX BUFFER
        renderPass.setIndexBuffer(
            indexBuffer,
            "uint32"
        );

        const model3 = translation(0, 0, 0);

        drawSphere(
            renderPass,
            model3,
            uniformBuffer,
            uniformBindGroup,
            view
        );

        renderPass.end();

        device.queue.submit([
            commandEncoder.finish()
        ]);
        requestAnimationFrame(render);
    }
    // Updating the sphere instead of rendering
    updateSphere();
    requestAnimationFrame(render);
}

// FUNCTIONS!!!

function lookAt(eye, target, up)
{
    const z = normalise([
        eye[0] - target[0],
        eye[1] - target[1],
        eye[2] - target[2]
    ]);

    const x = normalise([
        up[1] * z[2] - up[2] * z[1],
        up[2] * z[0] - up[0] * z[2],
        up[0] * z[1] - up[1] * z[0]
    ]);

    const y = [
        z[1] * x[2] - z[2] * x[1],
        z[2] * x[0] - z[0] * x[2],
        z[0] * x[1] - z[1] * x[0]
    ];

    return new Float32Array([
        x[0], y[0], z[0], 0,
        x[1], y[1], z[1], 0,
        x[2], y[2], z[2], 0,
        -dot(x, eye), -dot(y, eye), -dot(z, eye), 1
    ]);
}

function dot(a, b)
{
    return a[0] * b[0] +
           a[1] * b[1] +
           a[2] * b[2];
}


// PINHOLE PROJECTION
function pinhole(
    FOV_Y,
    aspect,
    near,
    far)
{
    const f =
        1 /
        Math.tan(
            FOV_Y / 2 *
            Math.PI / 180
        );


    return new Float32Array([

        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, far / (near - far), -1,
        0, 0, (near * far) / (near - far), 0
    ]);
}

// MATRIX MULTIPLICATION
function multiply(a, b)
{
    const result =
        new Float32Array(16);

    for (let col = 0; col < 4; col++) {

        for (let row = 0; row < 4; row++) {

            result[col * 4 + row] =

                a[0 * 4 + row] *
                b[col * 4 + 0]

                +

                a[1 * 4 + row] *
                b[col * 4 + 1]

                +

                a[2 * 4 + row] *
                b[col * 4 + 2]

                +

                a[3 * 4 + row] *
                b[col * 4 + 3];
        }
    }

    return result;
}

// ROTATION AROUND X & Y AXIS
function rotationX(angle)
{
    const c =
        Math.cos(angle);

    const s =
        Math.sin(angle);

    return new Float32Array([

        1, 0, 0, 0,

        0, c, s, 0,

        0, -s, c, 0,

        0, 0, 0, 1
    ]);
}

function rotationY(angle)
{
    const c =
        Math.cos(angle);

    const s =
        Math.sin(angle);

    return new Float32Array([

        c, 0, -s, 0,

        0, 1, 0, 0,

        s, 0, c, 0,

        0, 0, 0, 1
    ]);
}

// TRANSLATION
function translation(x, y, z)
{
    return new Float32Array([

        1, 0, 0, 0,

        0, 1, 0, 0,

        0, 0, 1, 0,

        x, y, z, 1
    ]);
}

// Subdivision function
// Basically taken from slides

function subdivide_sphere(positions, indices) {
    const newIndices = new Uint32Array(indices.length * 4);
    const midpointCache = new Map();

    function midpointIndex(i0, i1) {
        const a = Math.min(i0, i1);
        const b = Math.max(i0, i1);
        const key = `${a},${b}`;

        if (midpointCache.has(key)) {
            return midpointCache.get(key);
        }

        const midpoint = normalise(
            add(positions[i0], positions[i1])
        );

        const index = positions.length;
        positions.push(midpoint);
        midpointCache.set(key, index);

        return index;
    }

    for (let i = 0; i < indices.length; i += 3) {
        const i0 = indices[i];
        const i1 = indices[i + 1];
        const i2 = indices[i + 2];

        const c01 = midpointIndex(i0, i1);
        const c12 = midpointIndex(i1, i2);
        const c20 = midpointIndex(i2, i0);

        newIndices.set([
            i0, c01, c20,
            c20, c01, c12,
            c12, c01, i1,
            c20, c12, i2
        ], i * 4);
    }

    return newIndices;
}

function add(a, b)
{
    return [
        a[0] + b[0],
        a[1] + b[1],
        a[2] + b[2]
    ];
}

function normalise(v)
{
    const length =
        Math.sqrt(
            v[0] * v[0] +
            v[1] * v[1] +
            v[2] * v[2]
        );

    return [
        v[0] / length,
        v[1] / length,
        v[2] / length
    ];
}

function flatten(positions)
{
    const result =
        new Float32Array(
            positions.length * 6
        );

    // Diffuse reflection coefficient:
    const kd = [0.6,0.4, 0.87];

    for (let i = 0; i < positions.length; ++i) {

        const p = positions[i];
        // Position
        result[i * 6] =
            p[0];

        result[i * 6 + 1] =
            p[1];

        result[i * 6 + 2] =
            p[2];

        // Colour
        result[i * 6 + 3] = kd[0];
        result[i * 6 + 4] = kd[1];
        result[i * 6 + 5] = kd[2];

    }

    return result;
}