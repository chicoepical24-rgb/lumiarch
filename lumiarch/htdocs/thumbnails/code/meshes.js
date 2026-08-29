// meshes.js
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { processTexture } from './builder.js';

const objLoader = new OBJLoader();
const textureLoader = new THREE.TextureLoader();

export function loadSpecialMesh(parentMesh, meshData, fixPath) {
    const props = meshData.properties;
    const meshPath = fixPath(props.MeshPath || "");
    const texPath = fixPath(props.TexturePath || "");
    const meshScale = parseVector(props.Size || "1, 1, 1");

    // Hide the original placeholder geometry
    if (Array.isArray(parentMesh.material)) {
        parentMesh.material.forEach(m => { m.visible = false; });
    } else if (parentMesh.material) {
        parentMesh.material.visible = false;
    }

    if (!meshPath || meshPath === "N/A") return;

    objLoader.load(meshPath, (object) => {
        // ALWAYS check parentMesh.userData.xmlColor inside the callback
        // This ensures if a skin tone was applied while loading, we use it now.
        const currentColor = parentMesh.userData.xmlColor || { r: 1, g: 1, b: 1 };

        object.traverse((child) => {
            if (child.isMesh) {
                child.userData.isVisualMesh = true;

                if (child.geometry.attributes.color) {
                    child.geometry.deleteAttribute('color');
                }

                // Initial material setup with the current color
                child.material = new THREE.MeshStandardMaterial({
                    color: new THREE.Color(currentColor.r, currentColor.g, currentColor.b),
                    roughness: 0.5,
                    metalness: 0.0,
                    vertexColors: false,
                    side: THREE.DoubleSide
                });

                if (texPath && texPath !== "" && texPath !== "N/A") {
                    textureLoader.load(texPath, (tex) => {
                        // Re-check color again in case it changed during texture load
                        const latestColor = parentMesh.userData.xmlColor || currentColor;
                        const processedTex = processTexture(tex.image, latestColor);
                        
                        child.material.map = processedTex;
                        child.material.color.set(0xffffff); 
                        child.material.needsUpdate = true;
                    });
                }
                
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        object.scale.set(meshScale[0], meshScale[1], meshScale[2]);
        object.rotation.y = Math.PI; 

        parentMesh.add(object); 
        parentMesh.dispatchEvent({ type: 'MeshLoaded', visualMesh: object });
    });
}

function parseVector(str) {
    if (!str || typeof str !== 'string') return [1, 1, 1];
    return str.split(',').map(v => parseFloat(v.trim()) || 1);
}