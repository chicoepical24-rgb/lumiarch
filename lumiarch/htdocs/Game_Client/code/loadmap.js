import { parseLumisle } from './parser.js';
import { buildWorkspace } from './builder.js';

export async function loadMap(path, scene, world) {
    try {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`${path} missing`);
        const xmlText = await response.text();
        
        const parsedData = parseLumisle(xmlText);
        buildWorkspace(scene, parsedData, world);
        
        return parsedData;
    } catch (err) {
        console.error("Map loading failure:", err);
        throw err;
    }
}