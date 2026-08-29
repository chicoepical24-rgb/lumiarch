const canvas = document.getElementById('templateCanvas');
const ctx = canvas.getContext('2d');

canvas.width = 585; 
canvas.height = 559;

ctx.fillStyle = '#1e1e1e';
ctx.fillRect(0, 0, canvas.width, canvas.height);

function drawPart(x, y, w, h, d, label, color, type) {
    ctx.font = 'bold 11px Inter, Arial';
    const gap = 2;

    let faces = [];

    const TORSO_FACES = [
        { n: 'Right',  ox: 0,         oy: d,     fw: d, fh: h, gx: 0, gy: 1 },
        { n: 'Top',    ox: d,         oy: 0,     fw: w, fh: d, gx: 1, gy: 0 },
        { n: 'Front',  ox: d,         oy: d,     fw: w, fh: h, gx: 1, gy: 1 },
        { n: 'Bottom', ox: d,         oy: d + h, fw: w, fh: d, gx: 1, gy: 2 },
        { n: 'Left',   ox: d + w,     oy: d,     fw: d, fh: h, gx: 2, gy: 1 },
        { n: 'Back',   ox: d + w + d, oy: d,     fw: w, fh: h, gx: 3, gy: 1 }
    ];

    const LEFT_LIMB_FACES = [
        { n: 'Left',   ox: 0,     oy: d,     fw: d, fh: h, gx: 0, gy: 1 },
        { n: 'Back',   ox: w,         oy: d,     fw: w, fh: h, gx: 1, gy: 1 },
        { n: 'Right',  ox: w + d,         oy: d,     fw: d, fh: h, gx: 2, gy: 1 },
        { n: 'Top',    ox: w + d + d, oy: 0,     fw: w, fh: d, gx: 3, gy: 0 },
        { n: 'Front',  ox: w + d + d, oy: d,     fw: w, fh: h, gx: 3, gy: 1 },
        { n: 'Bottom', ox: w + d + d, oy: d + h, fw: w, fh: d, gx: 3, gy: 2 }
    ];

    const RIGHT_LIMB_FACES = [
        { n: 'Top',    ox: 0,         		oy: 0,     fw: w, fh: d, gx: 0, gy: 0 },
        { n: 'Front',  ox: 0,        		 oy: d,     fw: w, fh: h, gx: 0, gy: 1 },
        { n: 'Bottom', ox: 0,         		oy: d + h, fw: w, fh: d, gx: 0, gy: 2 },
        { n: 'Left',   ox: w,     oy: d,     fw: d, fh: h, gx: 1, gy: 1 },
        { n: 'Back',   ox: w + d, 				oy: d,     fw: w, fh: h, gx: 2, gy: 1 },
        { n: 'Right',  ox: w + d + d,         oy: d,     fw: d, fh: h, gx: 3, gy: 1 }
    ];

    if (type === 'torso') faces = TORSO_FACES;
    else if (type === 'leftLimb') faces = LEFT_LIMB_FACES;
    else if (type === 'rightLimb') faces = RIGHT_LIMB_FACES;

    faces.forEach(f => {
        const px = x + f.ox + (f.gx * gap);
        const py = y + f.oy + (f.gy * gap);
        
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.4;
        ctx.fillRect(px, py, f.fw, f.fh);
        
        ctx.globalAlpha = 1.0;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`${label} ${f.n}`, px + 4, py + 14);
    });
}

drawPart(165, 8, 128, 128, 64, "Torso", "#ff4757", 'torso');


drawPart(19, 289, 64, 128, 64, "L-Leg", "#2ed573", 'leftLimb');

drawPart(308, 289, 64, 128, 64, "R-Leg", "#1e90ff", 'rightLimb');
