async function loadXMLModel(path, isPlayer = false) {
    try {
        // Cache buster: forces browser to download fresh XML every reload
        const response = await fetch(`${path}?v=${Date.now()}`);
        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");

        const items = xmlDoc.getElementsByTagName("item");
        let modelParts = [];

        for (let i = 0; i < items.length; i++) {
            const itemClass = items[i].getAttribute("class");
            const props = items[i].getElementsByTagName("properties")[0];
            if (!props) continue;

            if (itemClass === "Humanoid") {
                window.humanoid = {
                    health: parseFloat(props.getElementsByTagName("health")[0]?.textContent || 100),
                    maxHealth: parseFloat(props.getElementsByTagName("maxhealth")[0]?.textContent || 100),
                    walkSpeed: parseFloat(props.getElementsByTagName("walkspeed")[0]?.textContent || 16),
                    jumpPower: parseFloat(props.getElementsByTagName("jumppower")[0]?.textContent || 50),
                    hipHeight: parseFloat(props.getElementsByTagName("hipheight")[0]?.textContent || 2.0),
                    state: parseInt(props.getElementsByTagName("state")[0]?.textContent || 0)
                };
                continue; 
            }

            if (itemClass === "Part") {
                const name = props.getElementsByTagName("name")[0]?.textContent || "Part";
                const getProp = (tagName) => props.getElementsByTagName(tagName)[0]?.textContent;

                const posStr = getProp("position") || "0,0,0";
                const sizeStr = getProp("size") || "1,1,1";
                const rotStr = getProp("rotation") || "0,0,0";
                const colorVal = getProp("color") || "163, 162, 165";

                const posArr = posStr.split(",").map(v => parseFloat(v.trim()));
                const sizeArr = sizeStr.split(",").map(v => parseFloat(v.trim()));
                const rotArr = rotStr.split(",").map(v => parseFloat(v.trim()));

                const surfaceTag = props.getElementsByTagName("surface")[0];

                const data = {
                    name: name,
                    pos: { x: posArr[0], y: posArr[1], z: posArr[2] },
                    size: { x: sizeArr[0], y: sizeArr[1], z: sizeArr[2] },
                    rot: { x: rotArr[0], y: rotArr[1], z: rotArr[2] },
                    color: colorVal,
                    surfaces: {
                        top: surfaceTag?.getAttribute("top") || "Smooth",
                        bottom: surfaceTag?.getAttribute("bottom") || "Smooth",
                        left: surfaceTag?.getAttribute("left") || "Smooth",
                        right: surfaceTag?.getAttribute("right") || "Smooth",
                        front: surfaceTag?.getAttribute("front") || "Smooth",
                        back: surfaceTag?.getAttribute("back") || "Smooth"
                    },
                    anchored: isPlayer ? false : (getProp("anchored") === "true"),
                    canCollide: getProp("cancollide") !== "false"
                };

                // Create the part normally
                createPart(data);
                
                const latestMesh = meshes[meshes.length - 1];
                if (isPlayer) {
                    latestMesh.name = name; 
                    modelParts.push(latestMesh);
                    if (name === "Torso") rootPart = latestMesh;
                }
            }
        }
        
        if (isPlayer) weldModel(modelParts);

    } catch (err) {
        console.error("Importer Error:", err);
    }
}

function weldModel(parts) {
    if (parts.length < 2) return;
    
    const torsoMesh = parts.find(p => p.name === "Torso");
    if (!torsoMesh) return;

    const torsoIndex = meshes.indexOf(torsoMesh);
    const torsoBody = bodies[torsoIndex];
    if (!torsoBody) return;

    parts.forEach(partMesh => {
        if (partMesh === torsoMesh) return;
        
        const partIndex = meshes.indexOf(partMesh);
        const limbBody = bodies[partIndex];
        
        if (limbBody) {
            const offset = new THREE.Vector3().subVectors(partMesh.position, torsoMesh.position);

            const shape = new CANNON.Box(new CANNON.Vec3(
                partMesh.geometry.parameters.width / 2,
                partMesh.geometry.parameters.height / 2,
                partMesh.geometry.parameters.depth / 2
            ));

            torsoBody.addShape(shape, new CANNON.Vec3(offset.x, offset.y, offset.z));

            partMesh.position.copy(offset);
            torsoMesh.add(partMesh);

            world.removeBody(limbBody);
            bodies[partIndex] = null;
            meshes[partIndex] = null; // prevents engine.js from syncing
        }
    });

    torsoBody.updateMassProperties();

    if (typeof finalizePlayer === "function") finalizePlayer(parts);
}