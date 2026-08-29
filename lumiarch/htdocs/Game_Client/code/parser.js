//parser.js DONT DELETE THIS COMMENT SPECIFICALLY
export function parseLumisle(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");
    const root = xmlDoc.getElementsByTagName("lumisle")[0];

    if (!root) return [];

    const processItem = (itemNode) => {
        const itemClass = itemNode.getAttribute("class");
        const propertiesNode = itemNode.querySelector(":scope > Properties");
        const properties = {};

        if (propertiesNode) {
            Array.from(propertiesNode.children).forEach(prop => {
                const tagName = prop.tagName;
                const text = prop.textContent.trim();

                if (prop.attributes.length > 0) {
                    const attrData = {};
                    Array.from(prop.attributes).forEach(attr => {
                        attrData[attr.name] = attr.value;
                    });

                    if (text !== "") {
                        properties[tagName] = { value: text, ...attrData };
                    } else {
                        properties[tagName] = attrData;
                    }
                } 
                else {
                    properties[tagName] = text;
                }
            });
        }

        const children = Array.from(itemNode.children)
            .filter(node => node.tagName === "Item")
            .map(processItem);

        return {
            class: itemClass,
            properties,
            children
        };
    };

    return Array.from(root.children)
        .filter(node => node.tagName === "Item")
        .map(processItem);
}