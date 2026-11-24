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

    if (!shaderResponse.ok) {
        throw new Error("Could not load WGSL shader.");
    }

    const shaderCode = await shaderResponse.text();

    const shaderModule = device.createShaderModule({
        code: shaderCode
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
            GPUBufferUsage.VERTEX |
            GPUBufferUsage.COPY_DST
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
                format: "float32x2",
                offset: 0,
                shaderLocation: 0
            },
            {
                format: "float32x2",
                offset: 8,
                shaderLocation: 1
            },
            {
                format: "float32x2",
                offset: 16,
                shaderLocation: 2
            },
            {
                format: "float32x2",
                offset: 24,
                shaderLocation: 3
            },
            {
                format: "float32x3",
                offset: 32,
                shaderLocation: 4
            },
            {
                format: "float32",
                offset: 44,
                shaderLocation: 5
            },
            {
                format: "float32x3",
                offset: 48,
                shaderLocation: 6
            },
            {
                format: "float32",
                offset: 60,
                shaderLocation: 7
            }
        ]
    };

    // Uniform buffer
    const uniformBuffer = device.createBuffer({
        size: 8,
        usage:
            GPUBufferUsage.UNIFORM |
            GPUBufferUsage.COPY_DST
    });

    device.queue.writeBuffer(
        uniformBuffer,
        0,
        new Float32Array([
            canvas.width,
            canvas.height
        ])
    );

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

    // Start rendering
    function render() {

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

    requestAnimationFrame(render);
}
