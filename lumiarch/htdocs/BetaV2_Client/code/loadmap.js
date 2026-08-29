(function() {
    const urlParams = new URLSearchParams(window.location.search);
    const gameId = urlParams.get('gameid');
    
    if (gameId) {
        fetch(`../get_game.php?id=${gameId}`)
            .then(response => response.ok ? response.text() : Promise.reject(response.status))
            .then(content => {
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(content, "text/xml");
                const rootNode = xmlDoc.getElementsByTagName("lumisle")[0] || 
                                 xmlDoc.getElementsByTagName("galaxia")[0] || 
                                 xmlDoc.documentElement;
                
                if (typeof meshes !== 'undefined' && typeof bodies !== 'undefined') {
                    for (let i = meshes.length - 1; i >= 0; i--) {
                        if (window.playerGroup?.children.includes(meshes[i])) continue; 
                        scene.remove(meshes[i]);
                        if (bodies[i]) world.removeBody(bodies[i]);
                        meshes.splice(i, 1);
                        bodies.splice(i, 1);
                    }
                }
                
                if (typeof processElements === "function") {
                    processElements(rootNode);
                    // Merge unanchored parts into compound bodies
                    optimizePhysicsAssemblies(); 
                }
                
                window.dispatchEvent(new CustomEvent('MapLoaded'));

                setTimeout(() => {
                    if (window.characterBody) {
                        window.characterBody.position.set(0, 100, 0); 
                        window.characterBody.velocity.set(0, 0, 0);
                    }
                }, 100); 
            });
    }

    function optimizePhysicsAssemblies() {
        if (!world || meshes.length < 1) return;

        // Group 1: Anchored parts stay as they are (STATIC)
        // Group 2: Unanchored parts get merged into a single DYNAMIC compound body
        
        const unanchoredIndices = [];
        bodies.forEach((body, index) => {
            if (body.mass > 0) unanchoredIndices.push(index);
        });

        if (unanchoredIndices.length === 0) return;

        // Create the one "Master Body" for all unanchored parts
        const compoundBody = new CANNON.Body({
            mass: unanchoredIndices.length, // Simple mass sum
            material: window.physicsMaterials.map
        });

        // We'll use the first unanchored part's position as the origin
        const originIndex = unanchoredIndices[0];
        const originPos = bodies[originIndex].position.clone();
        compoundBody.position.copy(originPos);

        unanchoredIndices.forEach(index => {
            const body = bodies[index];
            const mesh = meshes[index];
            
            // Calculate relative offset from the compound origin
            const offset = body.position.vsub(originPos);
            
            // Move shapes from the old body to the master body
            body.shapes.forEach((shape, i) => {
                const q = body.shapeOrientations[i];
                compoundBody.addShape(shape, offset, q);
            });

            // Clean up the old individual body
            world.removeBody(body);
            
            // Link the mesh to the master body instead
            // We store the offset so the animate loop can position it correctly
            mesh.userData.compoundOffset = offset;
            mesh.userData.masterBody = compoundBody;
            
            // Replace old reference so we don't try to sync it normally
            bodies[index] = null; 
        });

        world.addBody(compoundBody);
    }
})();