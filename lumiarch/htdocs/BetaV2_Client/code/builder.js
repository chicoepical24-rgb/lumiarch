const textureLoader = new THREE.TextureLoader();
const texturePath = "content/textures/";

function getTexture(name, sx, sz, sy, index) {
    const type = (!name || name === "") ? "Smooth" : name;
    
    const fileName = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase() + ".png";
    const url = texturePath + fileName;
    
    const tex = textureLoader.load(url);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;

    if (index === 2 || index === 3) {
        tex.repeat.set(sx / 2, (sz / 2) * 0.5); 
    } else {
        tex.repeat.set(sx / 2, (sy / 2) * 0.5);
    }
    
    return tex;
}

function createPart(data) {
    const px = parseFloat(data.pos.x) || 0;
    const py = parseFloat(data.pos.y) || 0;
    const pz = parseFloat(data.pos.z) || 0;
    const sx = parseFloat(data.size.x) || 1;
    const sy = parseFloat(data.size.y) || 1;
    const sz = parseFloat(data.size.z) || 1;

    const geo = new THREE.BoxGeometry(sx, sy, sz);
    const rgb = data.color.split(",").map(c => parseInt(c.trim()) || 0);
    const baseColor = new THREE.Color(`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`);

    const surfaces = [
        data.surfaces?.right,  
        data.surfaces?.left,   
        data.surfaces?.top,    
        data.surfaces?.bottom, 
        data.surfaces?.front,  
        data.surfaces?.back    
    ];

    const materials = surfaces.map((type, index) => {
        const tex = getTexture(type, sx, sz, sy, index);
        return new THREE.MeshPhongMaterial({
            color: baseColor,
            map: tex,
            shininess: 30,
            specular: 0x222222, 
            combine: THREE.MultiplyOperation,
            emissive: baseColor,
            emissiveIntensity: 0.05 
        });
    });

    const mesh = new THREE.Mesh(geo, materials);
    mesh.name = data.name || "Part";
    mesh.userData.id = data.id;
    mesh.position.set(px, py, pz);
    
    const rx = (parseFloat(data.rot.x) || 0) * (Math.PI / 180);
    const ry = (parseFloat(data.rot.y) || 0) * (Math.PI / 180);
    const rz = (parseFloat(data.rot.z) || 0) * (Math.PI / 180);
    mesh.rotation.set(rx, ry, rz);
    mesh.updateMatrixWorld();

    scene.add(mesh);
    meshes.push(mesh);

    const isAnchored = data.anchored === true || data.anchored === "true";
    const body = new CANNON.Body({ 
        mass: isAnchored ? 0 : 1,
        type: isAnchored ? CANNON.Body.STATIC : CANNON.Body.DYNAMIC
    });
    
    if (data.canCollide !== false) {
        body.addShape(new CANNON.Box(new CANNON.Vec3(sx / 2, sy / 2, sz / 2)));
    }
    
    body.position.set(px, py, pz);
    body.quaternion.copy(mesh.quaternion);
    
    world.addBody(body);
    bodies.push(body);
}