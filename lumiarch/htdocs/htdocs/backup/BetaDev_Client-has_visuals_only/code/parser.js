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

                if (prop.attributes.length > 0 && prop.textContent.trim() === "") {
                    properties[tagName] = {};
                    Array.from(prop.attributes).forEach(attr => {
                        properties[tagName][attr.name] = attr.value;
                    });
                } else {
                    properties[tagName] = prop.textContent.trim();
                }
            });
        }

        const children = Array.from(itemNode.querySelectorAll(":scope > Item")).map(processItem);

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