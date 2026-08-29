// builder.js
import * as THREE from 'three';
import { applyDecal } from './decals.js';
import { loadSpecialMesh } from './meshes.js';

const texLoader = new THREE.TextureLoader();

function fixPath(path) {
    return path.replace("lumisle://", "content/");
}

export function parseVector(str) {
    if (!str || typeof str !== 'string') return [0, 0, 0];
    return str.split(',').map(v => parseFloat(v.trim()) || 0);
}

export function parseColor(str) {
    if (!str || typeof str !== 'string') return { r: 1, g: 1, b: 1 };
    const parts = str.split(',').map(c => {
        const val = parseInt(c.trim());
        return isNaN(val) ? 255 : val; 
    });
    return { 
        r: (parts[0] !== undefined ? parts[0] : 255) / 255, 
        g: (parts[1] !== undefined ? parts[1] : 255) / 255, 
        b: (parts[2] !== undefined ? parts[2] : 255) / 255 
    };
}

export function updateObjectProperty(mesh, prop, value) {
    switch (prop) {
        case "Color":
        case "Color3": {
            const color = (typeof value === "string") ? parseColor(value) : value;
            const threeColor = new THREE.Color(color.r, color.g, color.b);
            mesh.userData.xmlColor = color; // Store for the loader callback

            const applyToMat = (m) => {
                if (!m) return;
                
                if (m.map && m.map.image) {
                    const newCanvasTex = processTexture(m.map.image, color);
                    
                    newCanvasTex.repeat.copy(m.map.repeat);
                    newCanvasTex.offset.copy(m.map.offset);
                    newCanvasTex.wrapS = m.map.wrapS;
                    newCanvasTex.wrapT = m.map.wrapT;
                    
                    m.map = newCanvasTex;
                    m.color.set(0xffffff); 
                } else {
                    m.color.copy(threeColor);
                }
                m.needsUpdate = true;
            };

            if (Array.isArray(mesh.material)) {
                mesh.material.forEach(applyToMat);
            } else {
                applyToMat(mesh.material);
            }

            mesh.traverse((child) => {
                if (child !== mesh && child.isMesh) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(applyToMat);
                    } else {
                        applyToMat(child.material);
                    }
                }
            });
            break;
        }

        case "Size": {
            const size = (typeof value === "string") ? parseVector(value) : value;
            mesh.scale.set(size[0], size[1], size[2]);
            break;
        }

        case "Position": {
            const pos = (typeof value === "string") ? parseVector(value) : value;
            mesh.position.set(pos[0], pos[1], pos[2]);
            break;
        }

        case "Orientation": {
            const rot = (typeof value === "string") ? parseVector(value) : value;
            const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(
                THREE.MathUtils.degToRad(rot[0]),
                THREE.MathUtils.degToRad(rot[1]),
                THREE.MathUtils.degToRad(rot[2]),
                'XYZ'
            ));
            mesh.quaternion.copy(q);
            break;
        }

        case "Transparency": {
            const t = parseFloat(value);
            const applyTrans = (m) => {
                if (!m) return;
                m.transparent = t > 0;
                m.opacity = 1 - t;
            };
            if (Array.isArray(mesh.material)) {
                mesh.material.forEach(applyTrans);
            } else {
                applyTrans(mesh.material);
            }
            break;
        }
    }
}

function applyRadialUVs(geometry, size, type) {
    const uvAttribute = geometry.attributes.uv;
    for (let i = 0; i < uvAttribute.count; i++) {
        let u = uvAttribute.getX(i);
        let v = uvAttribute.getY(i);
        if (type === "Sphere") {
            u *= (size[0] + size[2]) / 2; 
            v *= size[1];
        } else if (type === "Cylinder") {
            u *= Math.max(size[0], size[2]) * Math.PI;
            v *= size[1];
        }
        uvAttribute.setXY(i, u / 2, v / 4); 
    }
    uvAttribute.needsUpdate = true;
}

export function processTexture(image, color) {
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
        const texR = data[i];
        const texG = data[i + 1];
        const texB = data[i + 2];
        const luminance = 0.299 * texR + 0.587 * texG + 0.114 * texB;

        const blend = (c, t) => {
            if (t < 128) {
                let shadowRes = (2 * c * t) / 255;
                return Math.min(255, shadowRes + (c * 0.1));
            } else {
                return 255 - 2 * (255 - c) * (255 - t) / 255;
            }
        };
        
        data[i]     = blend(targetR, luminance);
        data[i + 1] = blend(targetG, luminance);
        data[i + 2] = blend(targetB, luminance);
    }
    
    ctx.putImageData(imageData, 0, 0);
    const newTex = new THREE.CanvasTexture(canvas);
    newTex.magFilter = THREE.LinearFilter;
    newTex.minFilter = THREE.LinearMipmapLinearFilter;
    newTex.generateMipmaps = true;
    newTex.wrapS = THREE.RepeatWrapping;
    newTex.wrapT = THREE.RepeatWrapping;
    return newTex;
}

export function buildWorkspace(scene, data) {
    data.forEach(item => {
        if (item.class === "Workspace") {
            item.children.forEach(child => {
                if (child.class === "Part" || child.class === "SpawnLocation") {
                    createObject(scene, child);
                }
            });
        } else if (item.class === "Lighting") {
            setupLighting(scene, item.properties);
        }
    });
}

export function createObject(scene, data, group = null) {
    const props = data.properties;
    if (!props.Size || !props.Position) return null;

    const size = parseVector(props.Size);
    const pos = parseVector(props.Position);
    const rot = parseVector(props.Orientation || "0, 0, 0");
    const color = parseColor(props.Color3 || "255, 255, 255");
    const transparency = props.Transparency ? parseFloat(props.Transparency) : 0;
    const partType = props.PartType || "Brick";

    let geometry;

    if (partType === "Sphere") {
        geometry = new THREE.SphereGeometry(0.5, 32, 32);
        applyRadialUVs(geometry, size, "Sphere");
    } else if (partType === "Cylinder") {
        geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
        applyRadialUVs(geometry, size, "Cylinder");
    } else {
        geometry = new THREE.BoxGeometry(1, 1, 1);
    }

    const threeColor = new THREE.Color(color.r, color.g, color.b);

    let materials;
    if (partType === "Sphere") {
        materials = new THREE.MeshStandardMaterial({
            color: threeColor,
            transparent: transparency > 0,
            opacity: 1 - transparency,
            roughness: 0.4,
            metalness: 0.0
        });
    } else if (partType === "Cylinder") {
        const sideMat = new THREE.MeshStandardMaterial({ color: threeColor, transparent: transparency > 0, opacity: 1 - transparency, roughness: 0.4, metalness: 0.0 });
        const capMat = new THREE.MeshStandardMaterial({ color: threeColor, transparent: transparency > 0, opacity: 1 - transparency, roughness: 0.4, metalness: 0.0 });
        const sideSurface = (props.Surface && props.Surface.top) || 'Smooth';
        if (sideSurface !== 'Smooth') {
            texLoader.load(fixPath(`lumisle://textures/${sideSurface}.png`), (texImage) => {
                const currentColor = mesh.userData.xmlColor || color;
                sideMat.map = processTexture(texImage.image, currentColor);
                sideMat.color.set(0xffffff); 
                sideMat.needsUpdate = true;
            });
        }
        materials = [sideMat, capMat, capMat];
    } else {
        materials = [];
        const faces = ['right', 'left', 'top', 'bottom', 'front', 'back'];
        const faceDims = [[size[2], size[1]], [size[2], size[1]], [size[0], size[2]], [size[0], size[2]], [size[0], size[1]], [size[0], size[1]]];
        faces.forEach((face, index) => {
            const mat = new THREE.MeshStandardMaterial({ 
                color: threeColor,
                transparent: transparency > 0, 
                opacity: 1 - transparency, 
                roughness: 0.4, 
                metalness: 0.0, 
                polygonOffset: true, 
                polygonOffsetFactor: 1, 
                polygonOffsetUnits: 1 
            });
            const surfaceType = (props.Surface && props.Surface[face]) || 'Smooth';
            if (surfaceType !== 'Smooth') {
                const [faceWidth, faceHeight] = faceDims[index];
                texLoader.load(fixPath(`lumisle://textures/${surfaceType}.png`), (texImage) => {
                    const currentColor = mesh.userData.xmlColor || color;
                    const tinted = processTexture(texImage.image, currentColor);
                    tinted.repeat.set(faceWidth / 2, faceHeight / 4);
                    mat.map = tinted;
                    mat.color.set(0xffffff); 
                    mat.userData.isSurfaceLoaded = true;
                    mat.needsUpdate = true;
                    mesh.dispatchEvent({ type: 'SurfaceLoaded' });
                });
            }
            materials.push(mat);
        });
    }

    const mesh = new THREE.Mesh(geometry, materials);
    mesh.name = props.Name || "Part";
    mesh.userData.xmlColor = color;
    mesh.userData.isCylinder = (partType === "Cylinder");
    mesh.scale.set(size[0], size[1], size[2]);
    mesh.position.set(pos[0], pos[1], pos[2]);
    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(rot[0]), THREE.MathUtils.degToRad(rot[1]), THREE.MathUtils.degToRad(rot[2]), 'XYZ'));
    mesh.quaternion.copy(quat);

    if (data.children) {
        data.children.forEach(child => {
            if (child.class === "Decal") applyDecal(mesh, child, size);
            else if (child.class === "SpecialMesh") {
                mesh.userData.hasSpecialMesh = true;
                loadSpecialMesh(mesh, child, fixPath);
            }
        });
    }

    mesh.castShadow = props.CastShadow !== "false"; 
    mesh.receiveShadow = true;
    
    if (group) group.add(mesh);
    else scene.add(mesh);

    return mesh;
}

export function setupLighting(scene, props) {
    const ambientLight = scene.children.find(c => c instanceof THREE.AmbientLight);
    const sunLight = scene.children.find(c => c instanceof THREE.DirectionalLight);

    const brightness = props.Brightness ? parseFloat(props.Brightness) : 1;
    const ambColor = parseColor(props.Ambient || "255, 255, 255");
    const sunColor = parseColor(props.Color || "255, 255, 255");

    if (ambientLight) {
        ambientLight.color.setRGB(ambColor.r, ambColor.g, ambColor.b);
        ambientLight.intensity = brightness * 0.5;
    }

    if (sunLight) {
        sunLight.color.setRGB(sunColor.r, sunColor.g, sunColor.b);
        sunLight.intensity = brightness * 1.2;
    }
}