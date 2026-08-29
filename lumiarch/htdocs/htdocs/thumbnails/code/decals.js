// decals.js
import * as THREE from 'three';

const textureLoader = new THREE.TextureLoader();

function processDecalTexture(image, color) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = image.width;
    canvas.height = image.height;
    ctx.drawImage(image, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const targetR = color.r * 255;
    const targetG = color.g * 255;
    const targetB = color.b * 255;

    for (let i = 0; i < data.length; i += 4) {
        const blend = (c, t) => {
            let res = t < 128 ? (2 * c * t) / 255 : 255 - 2 * (255 - c) * (255 - t) / 255;
            return Math.min(255, res * 1.1); 
        };
        data[i]     = blend(targetR, data[i]);
        data[i + 1] = blend(targetG, data[i + 1]);
        data[i + 2] = blend(targetB, data[i + 2]);
    }
    ctx.putImageData(imageData, 0, 0);
    return new THREE.CanvasTexture(canvas);
}

export function applyDecal(parentMesh, decalData, parentSize) {
    const props = decalData.properties;
    const rawPath = props.TexturePath || "";
    if (!rawPath || rawPath === "N/A") return;

    const texturePath = rawPath.replace("lumisle://", "content/");
    const color = parseColor(props.Color3 || "255, 255, 255");
    const transparency = parseFloat(props.Transparency || 0);
    const zIndex = parseInt(props.ZIndex || 1);

    textureLoader.load(texturePath, (texture) => {
        const tex = processDecalTexture(texture.image, color);
        
        const decalMaterial = new THREE.MeshStandardMaterial({
            map: tex,
            transparent: true,
            opacity: 1 - transparency,
            depthWrite: false, 
            polygonOffset: true,
            polygonOffsetFactor: -4 - zIndex,
            polygonOffsetUnits: -4 - zIndex
        });

        const executeApply = () => {
            // 1. Search for the visual OBJ mesh
            let visualMesh = null;
            parentMesh.traverse(c => { 
                if (c.isMesh && c.userData.isVisualMesh) visualMesh = c; 
            });

            if (visualMesh) {
                const shellGeom = visualMesh.geometry.clone();
                const shellMesh = new THREE.Mesh(shellGeom, decalMaterial);
                
                // Match the visual mesh exactly
                shellMesh.scale.copy(visualMesh.scale);
                shellMesh.rotation.copy(visualMesh.rotation);
                shellMesh.position.copy(visualMesh.position);
                
                // Scale slightly for layering/z-fighting
                shellMesh.scale.multiplyScalar(1.002 + (zIndex * 0.001)); 
                shellMesh.renderOrder = 20 + zIndex;
                shellMesh.userData.isDecal = true;

                visualMesh.parent.add(shellMesh);
                return true; // Success
            }

            // 2. HARD LOCK: If it's a SpecialMesh but not found, return false to trigger the listener
            if (parentMesh.userData.hasSpecialMesh) {
                return false; 
            }

            // 3. Handle Standard Bricks (Planes)
            const isBrick = parentMesh.geometry && (parentMesh.geometry.type === 'BoxGeometry' || parentMesh.geometry.type === 'BufferGeometry');
            if (isBrick) {
                const side = (props.Side || "front").toLowerCase();
                let faceW, faceH;
                if (side === "top" || side === "bottom") {
                    faceW = parentSize[0]; faceH = parentSize[2];
                } else if (side === "front" || side === "back") {
                    faceW = parentSize[0]; faceH = parentSize[1];
                } else {
                    faceW = parentSize[2]; faceH = parentSize[1];
                }

                const geometry = new THREE.PlaneGeometry(faceW, faceH);
                const decalMesh = new THREE.Mesh(geometry, decalMaterial);
                decalMesh.renderOrder = 10 + zIndex;
                const epsilon = 0.005 + (zIndex * 0.001);

                const invScaleX = 1 / parentSize[0];
                const invScaleY = 1 / parentSize[1];
                const invScaleZ = 1 / parentSize[2];

                if (side === "top") {
                    decalMesh.rotation.x = -Math.PI / 2;
                    decalMesh.position.y = 0.5 + epsilon;
                    decalMesh.scale.set(invScaleX, invScaleZ, 1);
                } else if (side === "bottom") {
                    decalMesh.rotation.x = Math.PI / 2;
                    decalMesh.position.y = -0.5 - epsilon;
                    decalMesh.scale.set(invScaleX, invScaleZ, 1);
                } else if (side === "front") {
                    decalMesh.position.z = 0.5 + epsilon;
                    decalMesh.scale.set(invScaleX, invScaleY, 1);
                } else if (side === "back") {
                    decalMesh.rotation.y = Math.PI;
                    decalMesh.position.z = -0.5 - epsilon;
                    decalMesh.scale.set(invScaleX, invScaleY, 1);
                } else if (side === "right") {
                    decalMesh.rotation.y = Math.PI / 2;
                    decalMesh.position.x = 0.5 + epsilon;
                    decalMesh.scale.set(invScaleZ, invScaleY, 1);
                } else if (side === "left") {
                    decalMesh.rotation.y = -Math.PI / 2;
                    decalMesh.position.x = -0.5 - epsilon;
                    decalMesh.scale.set(invScaleZ, invScaleY, 1);
                }

                parentMesh.add(decalMesh);
                return true;
            }

            // 4. Fallback Shell (Spheres, Cylinders)
            parentMesh.traverse((child) => {
                if (child.isMesh && !child.userData.isDecal && !child.userData.isVisualMesh) {
                    const shellGeom = child.geometry.clone();

                    // REMOVE TOP/BOTTOM CAPS FOR CYLINDERS
                    if (child.geometry.type === "CylinderGeometry") {
                        const sideGroup = child.geometry.groups[0];
                        if (sideGroup) {
                            shellGeom.setDrawRange(sideGroup.start, sideGroup.count);
                        }
                    }

                    const shellMesh = new THREE.Mesh(shellGeom, decalMaterial);
                    
                    shellMesh.scale.set(1.002 + (zIndex * 0.001), 1.002 + (zIndex * 0.001), 1.002 + (zIndex * 0.001)); 
                    shellMesh.renderOrder = 11 + zIndex;
                    shellMesh.userData.isDecal = true;
                    
                    child.add(shellMesh);
                }
            });
            return true;
        };

        // If it's a SpecialMesh and not ready yet, wait for the event.
        // Otherwise, run immediately.
        if (!executeApply() && parentMesh.userData.hasSpecialMesh) {
            parentMesh.addEventListener('MeshLoaded', () => {
                executeApply();
            }, { once: true });
        }
    });
}

function parseColor(str) {
    const parts = str.split(',').map(c => parseInt(c.trim()) / 255);
    return { r: parts[0], g: parts[1], b: parts[2] };
}