"use strict";

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
        await fetch("w18_1.wgsl")
            .then(response => response.text());
        console.log("Shader loaded: ");
        console.log(shaderCode);

    const shaderModule =
        device.createShaderModule({
            code: shaderCode
        });

    // Point Rendering

    const positionBufferLayout = {
      arrayStride: 2 * 4, 
      stepMode: "instance",
      attributes: [{
        format: 'float32x2',
        offset: 0,
        shaderLocation: 0,      
      }],
    };

    const colorBufferLayout = {
      arrayStride: 4 * 4, 
      stepMode: "instance",
      attributes: [{
        format: 'float32x4',
        offset: 0,
        shaderLocation: 1,      
      }],
    }; 

    // POINT POSITIONS (x, y)
const positions = new Float32Array([
    -0.5, 0.0,  // Red
     0.0, 0.0,  // Green
     0.5, 0.0   // Blue
]);

// POINT COLOURS (RGBA)
const colors = new Float32Array([
    1.0, 0.0, 0.0, 0.3,  // Red
    0.0, 1.0, 0.0, 0.3,  // Green
    0.0, 0.0, 1.0, 0.3   // Blue
]);

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
                    r: 0,
                    g: 0,
                    b: 0,
                    a: 1
                },

                loadOp: "clear",
                storeOp: "store"
            }]
        });

    // SET PIPELINE
    renderPass.setPipeline(pipeline);

    // POSITION BUFFER
    renderPass.setVertexBuffer(
        0,
        positionBuffer
    );

    // COLOUR BUFFER
    renderPass.setVertexBuffer(
        1,
        colorBuffer
    );

    // DRAW 4 VERTICES FOR 3 INSTANCES
    renderPass.draw(4, 3);

    renderPass.end();

    device.queue.submit([
        commandEncoder.finish()
    ]);

    requestAnimationFrame(render);
}

// START RENDERING
requestAnimationFrame(render);

    const pipeline =
        device.createRenderPipeline({
            layout: "auto",
            vertex: {
                module:
                    shaderModule,
                entryPoint:
                    "vs_main",
                buffers: [positionBufferLayout, colorBufferLayout]
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

    // CAMERA - Translation & 45 Degree Angle

    const aspect =
        canvas.width / canvas.height;

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

