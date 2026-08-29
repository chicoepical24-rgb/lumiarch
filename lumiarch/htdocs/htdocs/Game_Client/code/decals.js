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
    
    const targetR = color.r;
    const targetG = color.g;
    const targetB = color.b;

    for (let i = 0; i < data.length; i += 4) {
        data[i]     = Math.min(255, data[i] * targetR);
        data[i + 1] = Math.min(255, data[i + 1] * targetG);
        data[i + 2] = Math.min(255, data[i + 2] * targetB);
    }
    
    ctx.putImageData(imageData, 0, 0);
    return new THREE.CanvasTexture(canvas);
}

export function applyDecal(parentMesh, decalData, parentSize) {
    const props = decalData.properties;
    const rawPath = props.TexturePath || "";
    if (!rawPath || rawPath === "N/A") return;

    const texturePath = rawPath.startsWith("lumisle://") 
        ? rawPath.replace("lumisle://", "content/") 
        : rawPath;

    const color = parseColor(props.Color3 || "255, 255, 255");
    const transparency = parseFloat(props.Transparency || 0);
    const zIndex = parseInt(props.ZIndex || 1);
    const side = (props.Side || "front").toLowerCase();

    // Tiling Properties
    const canTile = props.CanTile === "true" || props.CanTile === true;
    const studsU = parseFloat(props.StudsPerTileU || 2);
    const studsV = parseFloat(props.StudsPerTileV || 2);
    const offsetU = parseFloat(props.OffsetStudsU || 0);
    const offsetV = parseFloat(props.OffsetStudsV || 0);

    textureLoader.load(texturePath, (texture) => {
        const tex = processDecalTexture(texture.image, color);
        
        if (canTile) {
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
        }
        
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
            let visualMesh = null;
            parentMesh.traverse(c => { 
                if (c.isMesh && c.userData.isVisualMesh) visualMesh = c; 
            });

            // 1. Logic for Visual Meshes (Character parts, etc.)
            if (visualMesh) {
                const shellGeom = visualMesh.geometry.clone();
                const shellMesh = new THREE.Mesh(shellGeom, decalMaterial);
                
                shellMesh.position.set(0, 0, 0);
                shellMesh.rotation.set(0, 0, 0);
                shellMesh.scale.set(1, 1, 1);
                
                shellMesh.scale.multiplyScalar(1.002 + (zIndex * 0.001)); 
                shellMesh.renderOrder = 20 + zIndex;
                shellMesh.userData.isDecal = true;

                visualMesh.add(shellMesh);
                return true;
            }

            // 2. Prevent modifying SpecialMeshes
            if (parentMesh.userData.hasSpecialMesh) return false; 

            const isBrick = parentMesh.geometry && (parentMesh.geometry.type === 'BoxGeometry' || parentMesh.geometry.type === 'BufferGeometry' && !parentMesh.userData.isCurved);
            
            // 3. Projection Logic for Curved Primitives (Spheres/Cylinders)
            if (parentMesh.isMesh && !isBrick) {
                const target = parentMesh;
                const shellGeom = target.geometry.clone();
                const uvAttr = shellGeom.attributes.uv;
                const posAttr = shellGeom.attributes.position;
                
                shellGeom.computeBoundingBox();
                const bbox = shellGeom.boundingBox;
                const size = new THREE.Vector3();
                bbox.getSize(size);

                for (let i = 0; i < posAttr.count; i++) {
                    const x = posAttr.getX(i);
                    const y = posAttr.getY(i);
                    const z = posAttr.getZ(i);

                    let u = 0, v = 0, isVisible = false;

                    // Planar Projection based on the 'Side' property
                    switch(side) {
                        case "front":
                            if (z > 0) {
                                u = (x / size.x) + 0.5;
                                v = (y / size.y) + 0.5;
                                isVisible = true;
                            }
                            break;
                        case "back":
                            if (z < 0) {
                                u = 1 - ((x / size.x) + 0.5);
                                v = (y / size.y) + 0.5;
                                isVisible = true;
                            }
                            break;
                        case "top":
                            if (y > 0) {
                                u = (x / size.x) + 0.5;
                                v = 1 - ((z / size.z) + 0.5);
                                isVisible = true;
                            }
                            break;
                        case "bottom":
                            if (y < 0) {
                                u = (x / size.x) + 0.5;
                                v = (z / size.z) + 0.5;
                                isVisible = true;
                            }
                            break;
                        case "right":
                            if (x > 0) {
                                u = 1 - ((z / size.z) + 0.5);
                                v = (y / size.y) + 0.5;
                                isVisible = true;
                            }
                            break;
                        case "left":
                            if (x < 0) {
                                u = (z / size.z) + 0.5;
                                v = (y / size.y) + 0.5;
                                isVisible = true;
                            }
                            break;
                    }

                    if (isVisible && u >= 0 && u <= 1 && v >= 0 && v <= 1) {
                        uvAttr.setXY(i, u, v);
                    } else {
                        uvAttr.setXY(i, -1, -1); // Clip out of view
                    }
                }
                uvAttr.needsUpdate = true;

                const shellMesh = new THREE.Mesh(shellGeom, decalMaterial);
                shellMesh.position.set(0, 0, 0);
                shellMesh.rotation.set(0, 0, 0);
                shellMesh.scale.set(1, 1, 1);
                
                shellMesh.scale.multiplyScalar(1.002 + (zIndex * 0.001)); 
                shellMesh.renderOrder = 20 + zIndex;
                shellMesh.userData.isDecal = true;

                target.add(shellMesh);
                return true;
            }

            // 4. Logic for standard Bricks (Planes)
            if (isBrick) {
                let faceW, faceH;
                const pX = Array.isArray(parentSize) ? parentSize[0] : parentSize.x;
                const pY = Array.isArray(parentSize) ? parentSize[1] : parentSize.y;
                const pZ = Array.isArray(parentSize) ? parentSize[2] : parentSize.z;

                if (side === "top" || side === "bottom") {
                    faceW = pX; faceH = pZ;
                } else if (side === "front" || side === "back") {
                    faceW = pX; faceH = pY;
                } else {
                    faceW = pZ; faceH = pY;
                }

                if (canTile) {
                    tex.repeat.set(faceW / studsU, faceH / studsV);
                    tex.offset.set(offsetU / studsU, offsetV / studsV);
                }

                const geometry = new THREE.PlaneGeometry(faceW, faceH);
                const decalMesh = new THREE.Mesh(geometry, decalMaterial);
                decalMesh.renderOrder = 10 + zIndex;
                const epsilon = 0.005 + (zIndex * 0.001);

                const invScaleX = 1 / pX;
                const invScaleY = 1 / pY;
                const invScaleZ = 1 / pZ;

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
            return false;
        };

        if (!executeApply() && parentMesh.userData.hasSpecialMesh) {
            parentMesh.addEventListener('MeshLoaded', () => {
                executeApply();
            }, { once: true });
        }
    });
}

function parseColor(str) {
    const parts = str.split(',').map(c => parseInt(c.trim()) / 255);
    return { r: parts[0] || 1, g: parts[1] || 1, b: parts[2] || 1 };
}