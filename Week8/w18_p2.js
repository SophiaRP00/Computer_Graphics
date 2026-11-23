
"use strict";

import { readPlyFile } from "./PLYParser.js";

window.onload = async function() {
    const status = document.createElement("pre");
    status.style.fontWeight = "bold";
    status.style.padding = "10px";
    status.style.whiteSpace = "pre-wrap";
    status.style.overflowWrap = "anywhere";

    const canvas = document.getElementById("s224222");

    if (canvas) {
        document.body.insertBefore(status, canvas);
    } else {
        document.body.appendChild(status);
    }

    try {
        status.textContent = "Starting WebGPU...";

        await main(status);

    } catch (error) {
        status.textContent = "ERROR:\n" + error.message;
    }
};


async function main(status) {

    // Check WebGPU
    if (!navigator.gpu) {
        throw new Error("WebGPU is not supported.");
    }

    const adapter = await navigator.gpu.requestAdapter();

    if (!adapter) {
        throw new Error("No WebGPU adapter found.");
    }

    const device = await adapter.requestDevice();

    // Display uncaught GPU errors
    device.addEventListener("uncapturederror", event => {
        status.textContent =
            "GPU ERROR:\n" + event.error.message;
    });

    // Canvas
    const canvas = document.getElementById("s224222");

    if (!canvas) {
        throw new Error("Canvas not found.");
    }

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

    // Load WGSL shader
    status.textContent = "Loading shader...";

    const shaderResponse = await fetch("w18_p2.wgsl");

    if (!shaderResponse.ok) {
        throw new Error("Could not load WGSL shader.");
    }

    const shaderCode = await shaderResponse.text();

    const shaderModule = device.createShaderModule({
        code: shaderCode
    });

    // Check shader compilation
    const compilationInfo =
        await shaderModule.getCompilationInfo();

    const shaderMessages = compilationInfo.messages;

    if (shaderMessages.length > 0) {
        status.textContent = shaderMessages.map(message =>
            message.type.toUpperCase() +
            " (line " + message.lineNum + "): " +
            message.message
        ).join("\n");
    }

    const shaderErrors = shaderMessages.filter(
        message => message.type === "error"
    );

    if (shaderErrors.length > 0) {
        throw new Error(
            shaderErrors.map(message =>
                "Line " + message.lineNum + ": " +
                message.message
            ).join("\n")
        );
    }

    // Load PLY
    status.textContent = "Loading Lego splats...";

    const elements =
        await readPlyFile("./lego-2d-sorted.ply");

    const gaussian_splats = elements[0];

    if (!gaussian_splats) {
        throw new Error("No PLY elements found.");
    }

    if (gaussian_splats.stride !== 64) {
        throw new Error(
            "Incorrect stride: " + gaussian_splats.stride
        );
    }

    if (
        gaussian_splats.data.byteLength !==
        gaussian_splats.count * 64
    ) {
        throw new Error("PLY data size is incorrect.");
    }

    // Read first splat colour
    const firstSplat = new DataView(
        gaussian_splats.data.buffer,
        gaussian_splats.data.byteOffset,
        gaussian_splats.data.byteLength
    );

    const red = firstSplat.getFloat32(32, true);
    const green = firstSplat.getFloat32(36, true);
    const blue = firstSplat.getFloat32(40, true);

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
    status.textContent = "Creating render pipeline...";

    device.pushErrorScope("validation");

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

    const pipelineError = await device.popErrorScope();

    if (pipelineError) {
        throw new Error(
            "Pipeline error:\n" + pipelineError.message
        );
    }

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
    status.textContent =
        "Shader compiled successfully.\n" +
        "Pipeline created successfully.\n" +
        "Splats: " + gaussian_splats.count + "\n" +
        "First RGB: " +
        red.toFixed(4) + ", " +
        green.toFixed(4) + ", " +
        blue.toFixed(4);

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
                }]
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
