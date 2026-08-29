<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
session_start();

if (!isset($_SESSION['user_id'])) {
    header("Location: ../Login.php");
    exit;
}
require_once('../main/database.php');

$id = $_SESSION['user_id'];

// --- AJAX HANDLER ---
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_GET['ajax'])) {
    header('Content-Type: application/json');
    
    $sql = "SELECT avatar_data FROM Users WHERE id = ?";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param("i", $id);
    $stmt->execute();
    $user = $stmt->get_result()->fetch_assoc();
    
    $current_data = json_decode($user['avatar_data'] ?? '', true) ?: [
        "head" => "229, 204, 135", "torso" => "13, 95, 151", "left_arm" => "229, 204, 135", 
        "right_arm" => "229, 204, 135", "left_leg" => "162, 173, 145", "right_leg" => "162, 173, 145",
        "shirtID" => "0", "pantsID" => "0", "tshirtID" => "0"
    ];

    if (isset($_POST['update_colors'])) {
        $current_data["head"] = hexToRgbString($_POST['head']);
        $current_data["torso"] = hexToRgbString($_POST['torso']);
        $current_data["left_arm"] = hexToRgbString($_POST['left_arm']);
        $current_data["right_arm"] = hexToRgbString($_POST['right_arm']);
        $current_data["left_leg"] = hexToRgbString($_POST['left_leg']);
        $current_data["right_leg"] = hexToRgbString($_POST['right_leg']);
    } elseif (isset($_POST['equip_item'])) {
        $item_type = $_POST['item_type'];
        $item_id = $_POST['item_id'];
        if ($item_type == 'Shirt') $current_data["shirtID"] = $item_id;
        if ($item_type == 'Pants') $current_data["pantsID"] = $item_id;
        if ($item_type == 'T-Shirt') $current_data["tshirtID"] = $item_id;
    } elseif (isset($_POST['unequip_item'])) {
        $item_type = $_POST['item_type'];
        if ($item_type == 'Shirt') $current_data["shirtID"] = "0";
        if ($item_type == 'Pants') $current_data["pantsID"] = "0";
        if ($item_type == 'T-Shirt') $current_data["tshirtID"] = "0";
    }

    $updated_json = json_encode($current_data);
    $update_sql = "UPDATE Users SET avatar_data = ? WHERE id = ?";
    $upd_stmt = $conn->prepare($update_sql);
    $upd_stmt->bind_param("si", $updated_json, $id);
    
    if ($upd_stmt->execute()) {
        echo json_encode(['status' => 'success']);
    } else {
        echo json_encode(['status' => 'error']);
    }
    exit;
}

function rgbStringToHex($rgbStr) {
    $parts = explode(',', $rgbStr);
    if (count($parts) !== 3) return "#FFFFFF";
    return sprintf("#%02x%02x%02x", trim($parts[0]), trim($parts[1]), trim($parts[2]));
}

function hexToRgbString($hex) {
    $hex = str_replace("#", "", $hex);
    if (strlen($hex) == 3) {
        $r = hexdec(substr($hex, 0, 1) . substr($hex, 0, 1));
        $g = hexdec(substr($hex, 1, 1) . substr($hex, 1, 1));
        $b = hexdec(substr($hex, 2, 1) . substr($hex, 2, 1));
    } else {
        $r = hexdec(substr($hex, 0, 2));
        $g = hexdec(substr($hex, 2, 2));
        $b = hexdec(substr($hex, 4, 2));
    }
    return "$r, $g, $b";
}

$sql = "SELECT username, avatar_data, owned_items, coins FROM Users WHERE id = ?";
$stmt = $conn->prepare($sql);
$stmt->bind_param("i", $id);
$stmt->execute();
$user = $stmt->get_result()->fetch_assoc();

$user_coins = $user['coins'] ?? 0;
$current_data = json_decode($user['avatar_data'] ?? '', true) ?: [
    "head" => "229, 204, 135", "torso" => "13, 95, 151", "left_arm" => "229, 204, 135", 
    "right_arm" => "229, 204, 135", "left_leg" => "162, 173, 145", "right_leg" => "162, 173, 145",
    "shirtID" => "0", "pantsID" => "0", "tshirtID" => "0"
];

$owned_ids = json_decode($user['owned_items'] ?? '', true) ?: [];
$catalog_sql = "SELECT id, name, type FROM Catalog WHERE type IN ('T-Shirt', 'Shirt', 'Pants')";
$catalog_result = $conn->query($catalog_sql);

$pageTitle = "Edit Avatar";
include '../main/header.php';
?>

<style>
    /* ORIGINAL CSS AS REQUESTED */
    html, body {
        height: 100%;
        margin: 0;
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }

    .avatar-editor-main {
        display: flex;
        flex-direction: column;
        flex: 1;
        overflow: hidden;
    }

    .top-section {
        flex: 0 0 auto;
        display: flex;
        gap: 10px;
        padding: 10px;
        background: #f8f9fa;
        border-bottom: 1px solid #ccc;
        justify-content: center;
        flex-wrap: wrap;
    }

    .preview-box {
        background: #eee;
        border: 1px solid #ccc;
        width: 140px;
        height: 140px;
    }

    .preview-box iframe {
        width: 100%;
        height: 100%;
    }

    .color-inputs {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 4px;
        flex: 1;
        max-width: 180px;
    }

    .input-group label { font-size: 9px; display: block; text-align: center; }
    .input-group input[type="color"] { width: 100%; height: 22px; border: none; padding: 0; cursor: pointer; }

    .save-btn {
        grid-column: span 3;
        padding: 4px;
        font-size: 10px;
        background: #007bff;
        color: white;
        border: none;
        font-weight: bold;
    }

    .catalog-section {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .category-menu {
        display: flex;
        background: #fff;
    }

    .category-link {
        flex: 1;
        padding: 10px;
        text-align: center;
        text-decoration: none;
        color: #666;
        font-weight: bold;
        font-size: 13px;
        cursor: pointer;
    }

    .category-link.active {
        color: #007bff;
        border-bottom: 3px solid #007bff;
    }

    .item-grid {
        flex: 1;
        overflow-y: auto;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
        gap: 8px;
        padding: 10px;
        background: #fff;
        -webkit-overflow-scrolling: touch;
    }

    .item-card {
        border: 1px solid #eee;
        padding: 5px;
        background: #fff;
        text-align: center;
    }

    .item-card img {
        width: 100%;
        aspect-ratio: 1/1;
        object-fit: contain;
    }

    .item-name {
        font-size: 10px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin: 4px 0;
    }

    .btn-action {
        width: 100%;
        padding: 5px;
        border: none;
        color: white;
        font-size: 10px;
        font-weight: bold;
    }
    .btn-equip { background: #28a745; }
    .btn-unequip { background: #dc3545; }

    /* For Money Display */
    .sidebaricon { width: 16px; height: 16px; display: inline-block; background-size: contain; background-repeat: no-repeat; margin-left: 5px; }
</style>

<div class="avatar-editor-main">
    <div class="btn-login" style="display: flex; align-items: center; padding: 5px 10px;">
        <?php echo number_format($user_coins); ?>
        <div class="sidebaricon" style="background-image: url(https://lumisle.rf.gd/images/icons/part.png);"></div>
    </div>

    <div class="top-section">
        <div class="preview-box">
            <iframe id="renderFrame" src="../thumbnails/Render.php?id=<?php echo $id; ?>" frameborder="0"></iframe>
        </div>

        <form id="colorForm" class="color-inputs">
            <input type="hidden" name="update_colors" value="1">
            <div class="input-group"><label>H</label><input type="color" name="head" value="<?php echo rgbStringToHex($current_data['head']); ?>"></div>
            <div class="input-group"><label>T</label><input type="color" name="torso" value="<?php echo rgbStringToHex($current_data['torso']); ?>"></div>
            <div class="input-group"><label>LA</label><input type="color" name="left_arm" value="<?php echo rgbStringToHex($current_data['left_arm']); ?>"></div>
            <div class="input-group"><label>RA</label><input type="color" name="right_arm" value="<?php echo rgbStringToHex($current_data['right_arm']); ?>"></div>
            <div class="input-group"><label>LL</label><input type="color" name="left_leg" value="<?php echo rgbStringToHex($current_data['left_leg']); ?>"></div>
            <div class="input-group"><label>RL</label><input type="color" name="right_leg" value="<?php echo rgbStringToHex($current_data['right_leg']); ?>"></div>
            <button type="submit" class="save-btn">Update Colors</button>
        </form>
    </div>

    <div class="catalog-section">
        <div class="category-menu">
            <div class="category-link active" data-cat="T-Shirt">T-Shirt</div>
            <div class="category-link" data-cat="Shirt">Shirt</div>
            <div class="category-link" data-cat="Pants">Pants</div>
        </div>

        <div class="item-grid" id="itemGrid">
            <?php 
            while($item = $catalog_result->fetch_assoc()): 
                if (in_array($item['id'], $owned_ids)): 
                    $folder = strtolower(str_replace('-', '', $item['type'])); 
                    $isEquipped = false;
                    if ($item['type'] == 'Shirt' && $current_data['shirtID'] == $item['id']) $isEquipped = true;
                    if ($item['type'] == 'Pants' && $current_data['pantsID'] == $item['id']) $isEquipped = true;
                    if ($item['type'] == 'T-Shirt' && $current_data['tshirtID'] == $item['id']) $isEquipped = true;
            ?>
                <div class="item-card" data-category="<?php echo $item['type']; ?>" style="<?php echo ($item['type'] == 'T-Shirt') ? '' : 'display:none;'; ?>">
                    <a href="../Item.php?id=<?php echo $item['id']; ?>">
                        <img src="../../avatar/catalog/<?php echo $folder; ?>/<?php echo $item['id']; ?>.png" alt="Item">
                    </a>
                    <div class="item-name"><b><?php echo htmlspecialchars($item['name']); ?></b></div>
                    <form class="equip-form">
                        <input type="hidden" name="item_id" value="<?php echo $item['id']; ?>">
                        <input type="hidden" name="item_type" value="<?php echo $item['type']; ?>">
                        <?php if ($isEquipped): ?>
                            <button class="btn-action btn-unequip" type="submit" name="unequip_item">Remove</button>
                        <?php else: ?>
                            <button class="btn-action btn-equip" type="submit" name="equip_item">Wear</button>
                        <?php endif; ?>
                    </form>
                </div>
            <?php 
                endif; 
            endwhile; 
            ?>
        </div>
    </div>
</div>

<script>
    const userId = "<?php echo $id; ?>";
    const iframe = document.getElementById('renderFrame');

    // 1. Handle Category Switching without Refresh
    document.querySelectorAll('.category-link').forEach(link => {
        link.addEventListener('click', function() {
            const cat = this.getAttribute('data-cat');
            
            // Update UI
            document.querySelectorAll('.category-link').forEach(l => l.classList.remove('active'));
            this.classList.add('active');
            
            // Filter Grid
            document.querySelectorAll('.item-card').forEach(card => {
                card.style.display = (card.getAttribute('data-category') === cat) ? '' : 'none';
            });
        });
    });

    // 2. AJAX Handlers
    async function handlePost(formData) {
        const response = await fetch('?ajax=1', { method: 'POST', body: formData });
        const data = await response.json();
        if (data.status === 'success') {
            iframe.src = "../thumbnails/Render.php?id=" + userId + "&t=" + new Date().getTime();
        }
    }

    document.getElementById('colorForm').addEventListener('submit', function(e) {
        e.preventDefault();
        handlePost(new FormData(this));
    });

    document.querySelectorAll('.equip-form').forEach(form => {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            const btn = this.querySelector('button');
            const formData = new FormData(this);
            formData.append(btn.name, '1');
            const type = formData.get('item_type');

            if (btn.name === 'equip_item') {
                document.querySelectorAll('.equip-form').forEach(f => {
                    const b = f.querySelector('button');
                    if (f.querySelector('input[name="item_type"]').value === type && b.classList.contains('btn-unequip')) {
                        b.className = 'btn-action btn-equip';
                        b.name = 'equip_item';
                        b.textContent = 'Wear';
                    }
                });
                btn.className = 'btn-action btn-unequip';
                btn.name = 'unequip_item';
                btn.textContent = 'Remove';
            } else {
                btn.className = 'btn-action btn-equip';
                btn.name = 'equip_item';
                btn.textContent = 'Wear';
            }
            handlePost(formData);
        });
    });
</script>

<?php include '../main/footer.php'; ?>