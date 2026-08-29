// clothes.js
import * as THREE from 'three';

const TEMPLATE_SIZE = { width: 585, height: 559 };
const GAP = 2;

const UV_MAP = {
    Torso:    { x: 165, y: 8,   w: 128, h: 128, d: 64, type: 'torso' },
    LeftArm:  { x: 19,  y: 289, w: 64,  h: 128, d: 64, type: 'leftLimb' }, 
    RightArm: { x: 308, y: 289, w: 64,  h: 128, d: 64, type: 'rightLimb' },
    LeftLeg:  { x: 19,  y: 289, w: 64,  h: 128, d: 64, type: 'leftLimb' },
    RightLeg: { x: 308, y: 289, w: 64,  h: 128, d: 64, type: 'rightLimb' }
};

export function applyClothes(characterGroup, shirtID, pantsID) {
    const loader = new THREE.TextureLoader();

    const applyToPart = (partName, type, id) => {
        const path = `../avatar/catalog/${type}/${id}.png`;
        const data = UV_MAP[partName];
        if (!data) return;

        loader.load(path, (texture) => {
            texture.magFilter = THREE.NearestFilter;
            texture.minFilter = THREE.NearestFilter;

            characterGroup.traverse((child) => {
                if (child.isMesh && child.name === partName) {
                    const shellName = `${child.name}_${type}_Shell`;
                    let shell = characterGroup.getObjectByName(shellName);

                    if (!shell) {
                        const shellGeo = child.geometry.clone();
                        remapBoxUVs(shellGeo, data);

                        const shellMat = new THREE.MeshStandardMaterial({
                            map: texture,
                            transparent: true,
                            alphaTest: 0.1,
                            side: THREE.FrontSide
                        });

                        shell = new THREE.Mesh(shellGeo, shellMat);
                        shell.name = shellName;

                        const offset = type === 'shirt' ? 1.002 : 1.001;
                        shell.scale.set(offset, offset, offset);

                        child.add(shell); 
                    } else {
                        shell.material.map = texture;
                        shell.material.needsUpdate = true;
                    }
                }
            });
        });
    };

    if (shirtID && shirtID !== "0") {
        ["Torso", "LeftArm", "RightArm"].forEach(p => applyToPart(p, "shirt", shirtID));
    }
    if (pantsID && pantsID !== "0") {
        ["LeftLeg", "RightLeg", "Torso"].forEach(p => applyToPart(p, "pants", pantsID));
    }
}

function remapBoxUVs(geometry, c) {
    const uvAttr = geometry.attributes.uv;
    const w = TEMPLATE_SIZE.width;
    const h = TEMPLATE_SIZE.height;

    const getUV = (px, py, fw, fh, gx, gy) => {
        const x1 = (c.x + px + (gx * GAP)) / w;
        const y1 = 1 - ((c.y + py + (gy * GAP)) / h);
        const x2 = (c.x + px + fw + (gx * GAP)) / w;
        const y2 = 1 - ((c.y + py + fh + (gy * GAP)) / h);
        return { x1, y1, x2, y2 };
    };

    let faces = [];

    // Order must match THREE.BoxGeometry: Right, Left, Top, Bottom, Front, Back
    if (c.type === 'torso') {
        faces = [
            { ox: c.d + c.w,     oy: c.d,         fw: c.d, fh: c.h, gx: 2, gy: 1 }, // Right
            { ox: 0,             oy: c.d,         fw: c.d, fh: c.h, gx: 0, gy: 1 }, // Left
            { ox: c.d,           oy: 0,           fw: c.w, fh: c.d, gx: 1, gy: 0 }, // Top
            { ox: c.d,           oy: c.d + c.h,   fw: c.w, fh: c.d, gx: 1, gy: 2 }, // Bottom
            { ox: c.d,           oy: c.d,         fw: c.w, fh: c.h, gx: 1, gy: 1 }, // Front
            { ox: c.d + c.w + c.d, oy: c.d,       fw: c.w, fh: c.h, gx: 3, gy: 1 }  // Back
        ];
    } else if (c.type === 'leftLimb') {
        faces = [
            { ox: c.w + c.d,     oy: c.d,         fw: c.d, fh: c.h, gx: 2, gy: 1 }, // Right
            { ox: 0,             oy: c.d,         fw: c.d, fh: c.h, gx: 0, gy: 1 }, // Left
            { ox: c.w + c.d + c.d, oy: 0,         fw: c.w, fh: c.d, gx: 3, gy: 0 }, // Top
            { ox: c.w + c.d + c.d, oy: c.d + c.h, fw: c.w, fh: c.d, gx: 3, gy: 2 }, // Bottom
            { ox: c.w + c.d + c.d, oy: c.d,       fw: c.w, fh: c.h, gx: 3, gy: 1 }, // Front
            { ox: c.w,           oy: c.d,         fw: c.w, fh: c.h, gx: 1, gy: 1 }  // Back
        ];
    } else if (c.type === 'rightLimb') {
        faces = [
            { ox: c.w + c.d + c.d, oy: c.d,       fw: c.d, fh: c.h, gx: 3, gy: 1 }, // Right
            { ox: c.w,           oy: c.d,         fw: c.d, fh: c.h, gx: 1, gy: 1 }, // Left
            { ox: 0,             oy: 0,           fw: c.w, fh: c.d, gx: 0, gy: 0 }, // Top
            { ox: 0,             oy: c.d + c.h,   fw: c.w, fh: c.d, gx: 0, gy: 2 }, // Bottom
            { ox: 0,             oy: c.d,         fw: c.w, fh: c.h, gx: 0, gy: 1 }, // Front
            { ox: c.w + c.d,     oy: c.d,         fw: c.w, fh: c.h, gx: 2, gy: 1 }  // Back
        ];
    }

    for (let i = 0; i < 6; i++) {
        const f = faces[i];
        const coords = getUV(f.ox, f.oy, f.fw, f.fh, f.gx, f.gy);
        
        const idx = i * 4;
        // Face vertex order: TL, TR, BL, BR
        uvAttr.setXY(idx,     coords.x1, coords.y1); // Top Left
        uvAttr.setXY(idx + 1, coords.x2, coords.y1); // Top Right
        uvAttr.setXY(idx + 2, coords.x1, coords.y2); // Bottom Left
        uvAttr.setXY(idx + 3, coords.x2, coords.y2); // Bottom Right
    }
    uvAttr.needsUpdate = true;
}