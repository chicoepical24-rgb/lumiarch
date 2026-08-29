// meshes.js
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

const objLoader = new OBJLoader();
const textureLoader = new THREE.TextureLoader();

export function loadSpecialMesh(parentMesh, meshData, fixPath) {
    const props = meshData.properties;
    const meshPath = fixPath(props.MeshPath || "");
    const texPath = fixPath(props.TexturePath || "");
    const meshScale = parseVector(props.Size || "1, 1, 1");

    const finalColor = parentMesh.userData.xmlColor || { r: 1, g: 1, b: 1 };

    if (Array.isArray(parentMesh.material)) {
        parentMesh.material.forEach(m => { m.visible = false; });
    } else if (parentMesh.material) {
        parentMesh.material.visible = false;
    }

    if (!meshPath || meshPath === "N/A") return;

    objLoader.load(meshPath, (object) => {
        object.traverse((child) => {
            if (child.isMesh) {
                child.userData.isVisualMesh = true;

                if (child.geometry.attributes.color) {
                    child.geometry.deleteAttribute('color');
                }

                child.material = new THREE.MeshStandardMaterial({
                    color: new THREE.Color(finalColor.r, finalColor.g, finalColor.b),
                    roughness: 0.5,
                    metalness: 0.0,
                    vertexColors: false,
                    side: THREE.DoubleSide
                });

                if (texPath && texPath !== "" && texPath !== "N/A") {
                    textureLoader.load(texPath, (tex) => {
                        child.material.map = tex;
                        child.material.needsUpdate = true;
                    });
                }
                
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        object.scale.set(meshScale[0], meshScale[1], meshScale[2]);
        
        // FIX: Rotate the head 180 degrees to face forward
        object.rotation.y = Math.PI; 

        parentMesh.add(object); 

        // SIGNAL: Tell anyone listening that the mesh is ready
        parentMesh.dispatchEvent({ type: 'MeshLoaded', visualMesh: object });
    });
}

function parseVector(str) {
    return str.split(',').map(v => parseFloat(v.trim()));
}