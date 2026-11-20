"use strict";

// Importing function
import {readPlyFile } from "./PLYParser.js";


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
        await fetch("w18_p2.wgsl")
            .then(response => response.text());
        console.log("Shader loaded: ");
        console.log(shaderCode);

    const shaderModule =
        device.createShaderModule({
            code: shaderCode
        });

    //Loading Lego File
    const elements = await readPlyFile('./lego-2d-sorted.ply');
    const vertices = elements.find(e => e.name === 'vertex');
    
    console.log(vertices);
    console.log("Number of vertices:", vertices.count);
    console.log("Vertex Stride:", vertices.stride);

    const gaussian_splats = elements[0];

    // Vertex Buffer
    const vertexBuffer = device.createBuffer({
        size: gaussian_splats.data.byteLength, 
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST{);

    device.queue.writeBuffer(vertexBuffer, 0, gaussian_splats.data);

    const vertexBufferLayout = {
        arrayStride: 64,
        stepMode: "instance",
        attributes: [{
            format: "float32x2",
            offset: 0,
            shaderLocation: 0},
         {
             format: "float32x2",
             offset: 8,
             shaderLocation: 1},
         {
             format: "float32x2",
             offset: 16,
             shaderLocation: 2},
         {
             format: "float32x2",
             offset: 24,
             shaderLocation: 3},
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
                    

// POSITION BUFFER
const positionBuffer = device.createBuffer({
    size: positions.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
});

device.queue.writeBuffer(positionBuffer, 0, positions);

// COLOUR BUFFER
const colorBuffer = device.createBuffer({
    size: colors.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
});

device.queue.writeBuffer(colorBuffer, 0, colors);

 
    // RENDER PIPELINE

    const pipeline =
        device.createRenderPipeline({
            layout: "auto",
            vertex: {
                module: shaderModule,
                entryPoint: "vs_main",
                buffers: [
                    positionBufferLayout,
                    colorBufferLayout
                ]
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
                            operation: "add",
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
            },
        });

    // RENDER FUNCTION

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

        renderPass.setVertexBuffer(0, positionBuffer);
        renderPass.setVertexBuffer(1, colorBuffer);

        // Four vertices for each of three instances
        renderPass.draw(4, 3);

        renderPass.end();

        device.queue.submit([
            commandEncoder.finish()
        ]);

        requestAnimationFrame(render);
    }

    // START RENDERING
    requestAnimationFrame(render);
}
