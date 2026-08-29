// Importer.js
import * as THREE from 'three';
import { createObject, parseVector, parseColor } from './builder.js';

export function Importer(scene, data) {
    const modelGroup = new THREE.Group();
    
    const walkItems = (items) => {
        if (!items) return;
        const itemList = Array.isArray(items) ? items : [items];
        
        itemList.forEach(item => {
            // Call the exported builder function
            if (item.class === "Part" || item.class === "SpawnLocation") {
                // Pass modelGroup so createObject adds the mesh to the group
                createObject(scene, item, modelGroup);
            } else if (item.class === "Model" || item.children) {
                walkItems(item.children);
            }
        });
    };

    walkItems(data);
    scene.add(modelGroup);
    return modelGroup;
}

Importer.load = async function(input) {
    try {
        let text;

        // Check if the input is already XML data or a URL
        if (typeof input === 'string' && input.trim().startsWith('<')) {
            // It's XML data, no need to fetch!
            text = input;
        } else {
            // It's a URL, so we fetch it
            const response = await fetch(input);
            if (!response.ok) throw new Error(`Fetch failed with status ${response.status}`);
            text = await response.text();
        }
        
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "text/xml");

        // Check for parsing errors
        const parseError = xmlDoc.getElementsByTagName("parsererror");
        if (parseError.length > 0) {
            throw new Error("XML Parsing Error: " + parseError[0].textContent);
        }

        const parseItem = (node) => {
            const item = {
                class: node.getAttribute("class"),
                properties: {},
                children: []
            };

            const propsNode = Array.from(node.children).find(n => n.nodeName === "Properties");
            if (propsNode) {
                Array.from(propsNode.children).forEach(p => {
                    if (p.nodeName === "Surface") {
                        item.properties.Surface = {};
                        Array.from(p.attributes).forEach(attr => {
                            item.properties.Surface[attr.name] = attr.value;
                        });
                    } else if (p.nodeName === "StudsPerTile" || p.nodeName === "OffsetStuds") {
                        item.properties[p.nodeName] = { u: p.getAttribute("U"), v: p.getAttribute("V") };
                    } else {
                        item.properties[p.nodeName] = p.textContent.trim();
                    }
                });
            }

            Array.from(node.children).forEach(child => {
                if (child.nodeName === "Item") item.children.push(parseItem(child));
            });

            return item;
        };

        const rootItems = Array.from(xmlDoc.documentElement.children).filter(n => n.nodeName === "Item");
        return rootItems.length > 0 ? rootItems.map(parseItem) : [];
        
    } catch (err) {
        console.error("XML Importer Error:", err);
        return [];
    }
};