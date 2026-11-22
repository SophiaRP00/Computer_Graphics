
"use strict";

/**
 * @typedef {{name: String, type: String}} PlyProperty
 * @typedef {{name: String, count: number, properties: PlyProperty[], stride: number, data: Uint8Array}} PlyElements
 */

export async function readPlyFile(fileName)
{
    const response = await fetch(fileName);

    if (!response.ok) {
        throw new Error("Could not load PLY file: " + response.status);
    }

    // Use arrayBuffer for broader browser compatibility
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    let pos = 0;
    const elements = [];

    while (pos < bytes.length) {
        const lineStart = pos;

        while (pos < bytes.length && bytes[pos++] !== 0x0a);

        const lineEnd = pos;

        const line = new TextDecoder("ascii").decode(
            bytes.subarray(lineStart, lineEnd)
        ).trim();

        const words = line.split(/\s+/);

        if (words.length >= 3 && words[0] === "element") {
            elements.push({
                name: words[1],
                count: parseInt(words[2]),
                properties: [],
                stride: 0,
                data: new Uint8Array()
            });
        }

        if (words.length >= 3 && words[0] === "property") {
            elements[elements.length - 1].properties.push({
                name: words[2],
                type: words[1]
            });
        }

        if (line === "end_header") break;
    }

    let data = bytes.subarray(pos);

    for (const element of elements) {
        for (const property of element.properties) {
            element.stride += sizeOfType(property.type);
        }

        const size = element.stride * element.count;

        element.data = data.subarray(0, size);
        data = data.subarray(size);
    }

    console.log("PLY file successfully loaded:", elements);

    return elements;
}

function sizeOfType(type) {
    switch (type) {
        case "float": return 4;
        case "uint": return 4;
        default:
            throw new Error("Unsupported PLY property type: " + type);
    }
}
