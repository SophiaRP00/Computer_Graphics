
"use strict";

// Import PLY parser
import { readPlyFile } from "./PLYParser.js";

// Start when the page has loaded
window.onload = async function() {

    const status = document.createElement("p");
    status.style.fontWeight = "bold";
    status.style.padding = "8px";

    const canvas = document.getElementById("s224222");

    if (canvas) {
        document.body.insertBefore(status, canvas);
    } else {
        document.body.appendChild(status);
    }

    try {
        status.textContent = "1. Starting WebGPU...";

        await main(status);

        status.textContent = "6. Rendering loop started.";

    } catch (error) {
        status.textContent = "ERROR: " + error.message;
    }
};


async function main(status)
{
    // Check WebGPU
    if (!navigator.gpu) {
        throw new Error("WebGPU is not supported by this browser.");
    }

    const gpu = navigator.gpu;

    status.textContent = "2. Requesting GPU adapter...";

    const adapter = await gpu.requestAdapter();

    if (!adapter) {
        throw new Error("No WebGPU adapter found.");
    }

    const device = await adapter.requestDevice();

    status.textContent = "3. GPU device created.";

    // Canvas
    const canvas = document.getElementById("s224222");

    if (!canvas) {
        throw new Error("Canvas s224222 not found.");
    }

    const context = canvas.getContext("webgpu");

    if (!context) {
        throw new Error("Could not create WebGPU canvas context.");
    }

    const canvasFormat =
        navigator.gpu.getPreferredCanvasFormat();

    context.configure({
        device: device,
        format: canvasFormat
    });

    // Load shader
    status.textContent = "4. Loading shader...";

    const shaderResponse = await fetch("w18_p2.wgsl");

    if (!shaderResponse.ok) {
        throw new Error("Could not load shader file.");
    }

    const shaderCode = await shaderResponse.text();

    const shaderModule = device.createShaderModule({
        code: shaderCode
    });

    // Load Lego PLY file
    status.textContent = "5. Loading Lego PLY file...";

    const elements = await readPlyFile("./lego-2d-sorted.ply");

    const gaussian_splats = elements[0];

    if (!gaussian_splats) {
        throw new Error("No PLY elements found.");
    }

    if (gaussian_splats.stride !== 64) {
        throw new Error("Unexpected vertex stride: " +
                        gaussian_splats.stride);
    }

    if (gaussian_splats.data.byteLength !==
        gaussian_splats.count * 64) {
        throw new Error("PLY data size does not match vertex count.");
    }

    status.textContent =
        "6. PLY loaded: " + gaussian_splats.count + " splats.";

    // Vertex Buffer
    const vertexBuffer = device.createBuffer({
        size: gaussian_splats.data.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });

    device.queue.writeBuffer(
        vertexBuffer,
        0,
        gaussian_splats.data
    );

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

    // Uniform Buffer
    const uniformBuffer = device.createBuffer({
        size: 8,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    device.queue.writeBuffer(
        uniformBuffer,
        0,
        new Float32Array([canvas.width, canvas.height])
    );

    // Render Pipeline
    status.textContent = "7. Creating render pipeline...";

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
                format: canvasFormat,

                blend: {
                    color: {
                        srcFactor: "src-alpha",
                        dstFactor: "one-minus-src-alpha",
                        operation: "add"
                    },

                    alpha: {
                        srcFactor: "one",
                        dstFactor: "one-minus-src-alpha",
                        operation: "add"
                    }
                }
            }]
        },

        primitive: {
            topology: "triangle-strip"
        }
    });

    const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),

        entries: [{
            binding: 0,
            resource: {
                buffer: uniformBuffer
            }
        }]
    });

    status.textContent = "8. Pipeline created. Starting rendering...";

    function render() {

    const commandEncoder = device.createCommandEncoder();

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
            }]
        });

    // TEMPORARY TEST:
    // Do not draw any Gaussian splats.

    renderPass.end();

    device.queue.submit([
        commandEncoder.finish()
    ]);

    requestAnimationFrame(render);
}
