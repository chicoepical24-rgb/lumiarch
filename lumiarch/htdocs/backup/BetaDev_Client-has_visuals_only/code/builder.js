// builder.js
import * as THREE from 'three';
import { applyDecal } from './decals.js';
import { loadSpecialMesh } from './meshes.js';

const textureLoader = new THREE.Loader(); // Using base loader for broad compatibility
const texLoader = new THREE.TextureLoader();

function fixPath(path) {
    return path.replace("lumisle://", "content/");
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

function processTexture(image, color) {
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
        const texG = data[i+1];
        const texB = data[i+2];

        const blend = (c, t) => {
            let res = t < 128 ? (2 * c * t) / 255 : 255 - 2 * (255 - c) * (255 - t) / 255;
            return Math.min(255, res * 1.1); 
        };

        data[i]     = blend(targetR, texR);
        data[i + 1] = blend(targetG, texG);
        data[i + 2] = blend(targetB, texB);
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

function createObject(scene, data) {
    const props = data.properties;
    if (!props.Size || !props.Position) return;

    const size = parseVector(props.Size);
    const pos = parseVector(props.Position);
    const rot = parseVector(props.Orientation || "0, 0, 0");
    const color = parseColor(props.Color3 || "255, 255, 255");
    const transparency = props.Transparency ? parseFloat(props.Transparency) : 0;
    const partType = props.PartType || "Brick";

    let geometry;
    let isPrimitive = false;

    if (partType === "Sphere") {
        geometry = new THREE.SphereGeometry(0.5, 32, 32);
        applyRadialUVs(geometry, size, "Sphere");
        isPrimitive = true;
    } else if (partType === "Cylinder") {
        geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
        applyRadialUVs(geometry, size, "Cylinder");
        isPrimitive = true;
    } else {
        geometry = new THREE.BoxGeometry(1, 1, 1);
    }

    let meshMaterial;

    if (partType === "Sphere") {
        // No surface texture for spheres to avoid the "pinch"
        meshMaterial = new THREE.MeshStandardMaterial({
            color: new THREE.Color(color.r, color.g, color.b),
            transparent: transparency > 0,
            opacity: 1 - transparency,
            roughness: 0.4,
            metalness: 0.0
        });
    } else if (partType === "Cylinder") {
        // Multi-material for Cylinder: [Side, Top, Bottom]
        const sideMat = new THREE.MeshStandardMaterial({
            transparent: transparency > 0,
            opacity: 1 - transparency,
            roughness: 0.4,
            metalness: 0.0
        });
        const capMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(color.r, color.g, color.b),
            transparent: transparency > 0,
            opacity: 1 - transparency,
            roughness: 0.4,
            metalness: 0.0
        });

        const sideSurface = (props.Surface && props.Surface.top) || 'Smooth';
        texLoader.load(fixPath(`lumisle://textures/${sideSurface}.png`), (texImage) => {
            const processedTex = processTexture(texImage.image, color);
            sideMat.map = processedTex;
            sideMat.needsUpdate = true;
        });

        meshMaterial = [sideMat, capMat, capMat];
    } else {
        // Box Multi-material
        meshMaterial = [];
        const faces = ['right', 'left', 'top', 'bottom', 'front', 'back'];
        const faceDims = [
            [size[2], size[1]], [size[2], size[1]], 
            [size[0], size[2]], [size[0], size[2]], 
            [size[0], size[1]], [size[0], size[1]]  
        ];

        faces.forEach((face, index) => {
            const mat = new THREE.MeshStandardMaterial({
                transparent: transparency > 0,
                opacity: 1 - transparency,
                roughness: 0.4,
                metalness: 0.0,
                polygonOffset: true,
                polygonOffsetFactor: 1, 
                polygonOffsetUnits: 1
            });
            const surfaceType = (props.Surface && props.Surface[face]) || 'Smooth';
            texLoader.load(fixPath(`lumisle://textures/${surfaceType}.png`), (texImage) => {
                const processedTex = processTexture(texImage.image, color);
                processedTex.repeat.set(faceDims[index][0] / 2, faceDims[index][1] / 4);
                mat.map = processedTex;
                mat.needsUpdate = true;
            });
            meshMaterial.push(mat);
        });
    }

    const mesh = new THREE.Mesh(geometry, meshMaterial);
    
    mesh.userData.xmlColor = color;
    mesh.userData.isSphere = (partType === "Sphere");
    mesh.userData.isCylinder = (partType === "Cylinder");
    
    mesh.scale.set(size[0], size[1], size[2]);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.rotation.set(
        THREE.MathUtils.degToRad(rot[0]),
        THREE.MathUtils.degToRad(rot[1]),
        THREE.MathUtils.degToRad(rot[2])
    );

    if (data.children) {
        data.children.forEach(child => {
            if (child.class === "Decal") {
                applyDecal(mesh, child, size);
            } else if (child.class === "SpecialMesh") {
                mesh.userData.hasSpecialMesh = true;
                loadSpecialMesh(mesh, child, fixPath);
            }
        });
    }

    mesh.castShadow = props.CastShadow === "true";
    mesh.receiveShadow = true;
    scene.add(mesh);
}

function setupLighting(scene, props) {
    const brightness = props.Brightness ? parseInt(props.Brightness) / 100 : 1;
    const ambColor = parseColor(props.Ambient || "255, 255, 255");
    const ambient = new THREE.AmbientLight(new THREE.Color(ambColor.r, ambColor.g, ambColor.b), brightness * 0.5);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, brightness * 1.2);
    sun.position.set(50, 100, 50);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    scene.add(sun);
}

function parseVector(str) {
    return str.split(',').map(v => parseFloat(v.trim()));
}

function parseColor(str) {
    const parts = str.split(',').map(c => parseInt(c.trim()) / 255);
    return { r: parts[0], g: parts[1], b: parts[2] };
}