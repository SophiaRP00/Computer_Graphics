"use strict"
import { readPlyFile } from "./PLYParser.js";

window.onload = async function() {
    const status = document.createElement("pre");
    const canvas = document.getElementById("s224222");
    document.body.insertBefore(status, canvas);

    await main(status);
}

async function main(status) {
    const canvas = document.getElementById("s224222");
    
    // Camera settings
    const cameraTarget = [0.0, 0.0, 0.0];
    const cameraRadius = 4.0;
    const cameraHeight = 2.0;
    let cameraAngle = 0;

    let viewMatrix = new Float32Array(16);
    let projectionMatrix = new Float32Array(16);
        
    // Check WebGPU
    if (!navigator.gpu) {
        throw new Error("WebGPU is not supported.");
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        throw new Error("No WebGPU adapter found.");
    }

    const device = await adapter.requestDevice();
    const context = canvas.getContext("webgpu");

    if (!context) {
        throw new Error("Could not create WebGPU context.");
    }

    const canvasFormat =
        navigator.gpu.getPreferredCanvasFormat();

    context.configure({
        device: device,
        format: canvasFormat
    });

    const shaderResponse = await fetch("w18_p4.wgsl");
    const shaderCode = await shaderResponse.text();

    const shaderModule = device.createShaderModule({
        code: shaderCode
    });

    // Button Code 
    let orbitEnabled = true;

    const orbitButton = document.getElementById("toggle");
    
    orbitButton.addEventListener("click", () => {
        orbitEnabled = !orbitEnabled;
        orbitButton.textContent = orbitEnabled
            ? "Stop orbiting"
            : "Start orbiting";
    });

    // Load PLY
    const elements =
        await readPlyFile("./lego-simplified.ply");

    const gaussian_splats = elements[0];

    // Read first splat colour
    const firstSplat = new DataView(
        gaussian_splats.data.buffer,
        gaussian_splats.data.byteOffset,
        gaussian_splats.data.byteLength
    );

    const depthTexture = device.createTexture({
      size: [canvas.width, canvas.height],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    // Create vertex buffer
    const vertexBuffer = device.createBuffer({
        size: gaussian_splats.data.byteLength,
        usage:
            GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });

    device.queue.writeBuffer(
        vertexBuffer,
        0,
        gaussian_splats.data
    );

    // Vertex layout
    const vertexBufferLayout = {
        arrayStride: 64,
        stepMode: "instance",

        attributes: [
            {
                // Position
                format: "float32x3",
                offset: 0,
                shaderLocation: 0
            },
            {
                // Colour
                format: "float32x3",
                offset: 16,
                shaderLocation: 1
            },
            {
                // Opacity
                format: "float32",
                offset: 28,
                shaderLocation: 2
            },
            {
                // Sigma I
                format: "float32x4",
                offset: 32,
                shaderLocation: 3
            },
            {
                // Sigma II
                format: "float32x2",
                offset: 48,
                shaderLocation: 4
            },
        ]
    };

    const uniformBuffer = device.createBuffer({
    size: 144,
    usage:
        GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
   
    function updateUniformBuffer() {
    
        const uniformData = new Float32Array(36);
        uniformData.set(viewMatrix, 0);
        uniformData.set(projectionMatrix, 16);
    
        uniformData.set([
            canvas.width,
            canvas.height,
            0,
            0
        ], 32);
    
        device.queue.writeBuffer(
            uniformBuffer,
            0,
            uniformData
        );
}
    // Create render pipeline
    const pipeline = device.createRenderPipeline({
        layout: "auto",

        vertex: {
            module: shaderModule,
            entryPoint: "vs_main",
            buffers: [vertexBufferLayout]
        },

        fragment: {
            module: shaderModule,
            entryPoint: "fs_main",

            targets: [{
                format: canvasFormat
            }]
        },
        
        primitive: {
            topology: "triangle-strip"
        },
        depthStencil: {
            format: "depth24plus",
            depthWriteEnabled: true,
            depthCompare: "less"
        },
    });

    // Bind group
    const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),

        entries: [{
            binding: 0,
            resource: {
                buffer: uniformBuffer
            }
        }]
    });

    function updateCamera() {

    const cameraPosition = [
        cameraTarget[0] + cameraRadius * Math.sin(cameraAngle),
        cameraHeight,
        cameraTarget[2] + cameraRadius * Math.cos(cameraAngle)
    ];

    viewMatrix = createLookAt(
        cameraPosition,
        cameraTarget,
        [0, 1, 0]
    );

    projectionMatrix = createPerspective(
        Math.PI / 4,
        canvas.width / canvas.height,
        0.1,
        100.0
    );
}
    // Start rendering
    function render() {

        if (orbitEnabled) {
            cameraAngle += 0.005;
        }

        updateCamera();
        updateUniformBuffer();

        const commandEncoder =
            device.createCommandEncoder();

        const textureView =
            context.getCurrentTexture().createView();

        const renderPass =
            commandEncoder.beginRenderPass({
                colorAttachments: [{
                    view: textureView,

                    clearValue: {
                        r: 0.68,
                        g: 0.85,
                        b: 0.95,
                        a: 1.0
                    },

                    loadOp: "clear",
                    storeOp: "store"
                }],

                depthStencilAttachment: {
               view: depthTexture.createView(),
               depthClearValue: 1.0,
               depthLoadOp: "clear",
               depthStoreOp: "store"
}
            });

        renderPass.setPipeline(pipeline);
        renderPass.setBindGroup(0, bindGroup);
        renderPass.setVertexBuffer(0, vertexBuffer);

        // Draw every Gaussian splat
        renderPass.draw(4, gaussian_splats.count);

        renderPass.end();

        device.queue.submit([
            commandEncoder.finish()
        ]);

        requestAnimationFrame(render);
    }

    updateCamera();
    requestAnimationFrame(render);
}

function createPerspective(fov, aspect, near, far) {

    const f = 1.0 / Math.tan(fov / 2);
    const matrix = new Float32Array(16);

    matrix[0] = f / aspect;
    matrix[5] = f;

    matrix[10] = far / (near - far);
    matrix[11] = -1;

    matrix[14] = (near * far) / (near - far);

    return matrix;
}

function createLookAt(eye, target, up) {

    // Calculate forward direction
    let z = [
        eye[0] - target[0],
        eye[1] - target[1],
        eye[2] - target[2]
    ];

    let length = Math.hypot(...z);

    z = z.map(v => v / length);

    // Calculate right direction
    let x = [
        up[1] * z[2] - up[2] * z[1],
        up[2] * z[0] - up[0] * z[2],
        up[0] * z[1] - up[1] * z[0]
    ];

    length = Math.hypot(...x);

    x = x.map(v => v / length);

    // Calculate corrected up direction
    const y = [
        z[1] * x[2] - z[2] * x[1],
        z[2] * x[0] - z[0] * x[2],
        z[0] * x[1] - z[1] * x[0]
    ];

    return new Float32Array([
        x[0], y[0], z[0], 0,
        x[1], y[1], z[1], 0,
        x[2], y[2], z[2], 0,

        -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]),
        -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]),
        -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]),
        1
    ]);
}
