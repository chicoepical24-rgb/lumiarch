import * as THREE from 'three';

const TEMPLATE_SIZE = { width: 585, height: 559 };

const UV_MAP = {
    Torso:    { x: 175, y: 20,  w: 128, h: 128, d: 64 },
    LeftArm:  { x: 40,  y: 280, w: 64,  h: 128, d: 64 },
    RightArm: { x: 310, y: 280, w: 64,  h: 128, d: 64 },
    LeftLeg:  { x: 40,  y: 280, w: 64,  h: 128, d: 64 }, 
    RightLeg: { x: 310, y: 280, w: 64,  h: 128, d: 64 }
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
                // Find the original body part
                if (child.isMesh && child.name === partName) {
                    
                    // Check if a clothing shell already exists to avoid stacking shells
                    const shellName = `${child.name}_${type}_Shell`;
                    let shell = characterGroup.getObjectByName(shellName);

                    if (!shell) {
                        // 1. Create the Shell by cloning the original geometry
                        const shellGeo = child.geometry.clone();
                        remapBoxUVs(shellGeo, data);

                        const shellMat = new THREE.MeshStandardMaterial({
                            map: texture,
                            transparent: true,
                            alphaTest: 0.1, // Low alpha test allows for soft edges if needed
                            side: THREE.FrontSide
                        });

                        shell = new THREE.Mesh(shellGeo, shellMat);
                        shell.name = shellName;

                        // 2. Inflate the shell slightly to prevent Z-fighting (flickering)
                        // 1.01 is usually enough to wrap over the skin
                        shell.scale.set(1.01, 1.01, 1.01);

                        // 3. Attach shell to the body part so it moves with it
                        child.add(shell); 
                    } else {
                        // If shell exists, just update the texture
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

    const getUV = (px, py) => [px / w, 1 - (py / h)];

    const faces = [
        { x: c.x,                y: c.y + c.d, w: c.d, h: c.h }, // Right
        { x: c.x + c.d + c.w,        y: c.y + c.d, w: c.d, h: c.h }, // Left
        { x: c.x + c.d,              y: c.y,       w: c.w, h: c.d }, // Top
        { x: c.x + c.d,              y: c.y + c.d + c.h, w: c.w, h: c.d }, // Bottom
        { x: c.x + c.d,              y: c.y + c.d, w: c.w, h: c.h }, // Front
        { x: c.x + c.d + c.w + c.d, y: c.y + c.d, w: c.w, h: c.h }  // Back
    ];

    for (let i = 0; i < 6; i++) {
        const f = faces[i];
        const v1 = getUV(f.x, f.y + f.h);       
        const v2 = getUV(f.x + f.w, f.y + f.h);   
        const v3 = getUV(f.x, f.y);             
        const v4 = getUV(f.x + f.w, f.y);       

        const idx = i * 4;
        uvAttr.setXY(idx,     v3[0], v3[1]);
        uvAttr.setXY(idx + 1, v4[0], v4[1]);
        uvAttr.setXY(idx + 2, v1[0], v1[1]);
        uvAttr.setXY(idx + 3, v2[0], v2[1]);
    }
    uvAttr.needsUpdate = true;
}