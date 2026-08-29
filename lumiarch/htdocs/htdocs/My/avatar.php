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

$sql = "SELECT username, avatar_data, owned_items FROM Users WHERE id = ?";
$stmt = $conn->prepare($sql);
$stmt->bind_param("i", $id);
$stmt->execute();
$user = $stmt->get_result()->fetch_assoc();

$current_data = json_decode($user['avatar_data'] ?? '', true) ?: [
    "head" => "229, 204, 135", "torso" => "13, 95, 151", "left_arm" => "229, 204, 135", 
    "right_arm" => "229, 204, 135", "left_leg" => "162, 173, 145", "right_leg" => "162, 173, 145",
    "shirtID" => "0", "pantsID" => "0", "tshirtID" => "0"
];

$owned_ids = json_decode($user['owned_items'] ?? '', true) ?: [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
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
    $upd_stmt->execute();
    
    if (!empty($_SERVER['HTTP_X_REQUESTED_WITH']) && strtolower($_SERVER['HTTP_X_REQUESTED_WITH']) == 'xmlhttprequest') {
        header('Content-Type: application/json');
        echo json_encode(['status' => 'success']);
        exit;
    }
}

if (isset($_GET['ajax_catalog'])) {
    $cat = $_GET['category'] ?? 'T-Shirt';
    $catalog_sql = "SELECT id, name, type FROM Catalog WHERE type = ?";
    $stmt = $conn->prepare($catalog_sql);
    $stmt->bind_param("s", $cat);
    $stmt->execute();
    $catalog_result = $stmt->get_result();

    $owned_count = 0;
    while($item = $catalog_result->fetch_assoc()): 
        if (in_array($item['id'], $owned_ids)): 
            $owned_count++;
            $folder = strtolower(str_replace('-', '', $item['type'])); 
            
            $isEquipped = false;
            if ($item['type'] == 'Shirt' && $current_data['shirtID'] == $item['id']) $isEquipped = true;
            if ($item['type'] == 'Pants' && $current_data['pantsID'] == $item['id']) $isEquipped = true;
            if ($item['type'] == 'T-Shirt' && $current_data['tshirtID'] == $item['id']) $isEquipped = true;
    ?>
            <div class="item-card" data-item-id="<?php echo $item['id']; ?>" data-item-type="<?php echo $item['type']; ?>">
                <a href="../Item.php?id=<?php echo $item['id']; ?>">
                    <img src="../avatar/catalog/<?php echo $folder; ?>/<?php echo $item['id']; ?>.png" alt="Item">
                </a>
                <div style="font-size:12px; height:30px; overflow:hidden;"><b><?php echo htmlspecialchars($item['name']); ?></b></div>
                <button class="btn-action <?php echo $isEquipped ? 'btn-unequip' : 'btn-equip'; ?>" 
                        onclick="handleItemAction(this, '<?php echo $item['id']; ?>', '<?php echo $item['type']; ?>')">
                    <?php echo $isEquipped ? 'Unequip' : 'Equip'; ?>
                </button>
            </div>
    <?php 
        endif; 
    endwhile; 

    if ($owned_count === 0) {
        echo "<p>You don't own any items in this category yet.</p>";
    }
    exit;
}

$pageTitle = "Edit Avatar";
include '../main/header.php';
?>

<div class="editor-container">
    <div class="preview-box">
        <p><b>Preview</b></p>
        <iframe id="avatar-preview" src="../thumbnails/Render.php?id=<?php echo $id; ?>" width="300" height="300" frameborder="0"></iframe>
    </div>

    <form method="POST" class="color-inputs" id="color-form">
        <div class="input-group"><label>Head</label><input type="color" name="head" value="<?php echo rgbStringToHex($current_data['head']); ?>"></div>
        <div class="input-group"><label>Torso</label><input type="color" name="torso" value="<?php echo rgbStringToHex($current_data['torso']); ?>"></div>
        <div class="input-group"><label>Left Arm</label><input type="color" name="left_arm" value="<?php echo rgbStringToHex($current_data['left_arm']); ?>"></div>
        <div class="input-group"><label>Right Arm</label><input type="color" name="right_arm" value="<?php echo rgbStringToHex($current_data['right_arm']); ?>"></div>
        <div class="input-group"><label>Left Leg</label><input type="color" name="left_leg" value="<?php echo rgbStringToHex($current_data['left_leg']); ?>"></div>
        <div class="input-group"><label>Right Leg</label><input type="color" name="right_leg" value="<?php echo rgbStringToHex($current_data['right_leg']); ?>"></div>
        <button type="submit" name="update_colors" class="save-btn">Save Body Colors</button>
    </form>
</div>

<div class="catalog-box">
    <div class="category-menu">
        <div onclick="switchCategory('T-Shirt')" class="category-link" id="cat-T-Shirt">T-Shirts</div>
        <div onclick="switchCategory('Shirt')" class="category-link" id="cat-Shirt">Shirts</div>
        <div onclick="switchCategory('Pants')" class="category-link" id="cat-Pants">Pants</div>
    </div>

    <div id="items-container" style="text-align:center;">
        </div>
</div>

<script>
function refreshPreview() {
    const iframe = document.getElementById('avatar-preview');
    iframe.src = iframe.src.split('&t=')[0] + '&t=' + new Date().getTime();
}

async function switchCategory(category) {
    document.querySelectorAll('.category-link').forEach(link => link.classList.remove('active'));
    document.getElementById('cat-' + category).classList.add('active');

    const container = document.getElementById('items-container');
    container.innerHTML = '<p>Loading...</p>';

    try {
        const response = await fetch(`?ajax_catalog=1&category=${category}`);
        if (response.ok) {
            const html = await response.text();
            container.innerHTML = html;
        }
    } catch (error) {
        console.error('Failed to load category:', error);
    }
}

async function handleItemAction(btn, itemId, itemType) {
    const isEquipping = btn.classList.contains('btn-equip');
    const action = isEquipping ? 'equip_item' : 'unequip_item';
    
    const formData = new FormData();
    formData.append(action, '1');
    formData.append('item_id', itemId);
    formData.append('item_type', itemType);

    try {
        const response = await fetch(window.location.href, {
            method: 'POST',
            body: formData,
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });

        if (response.ok) {
            document.querySelectorAll(`.item-card[data-item-type="${itemType}"] .btn-action`).forEach(b => {
                b.textContent = 'Equip';
                b.className = 'btn-action btn-equip';
            });

            if (isEquipping) {
                btn.textContent = 'Unequip';
                btn.className = 'btn-action btn-unequip';
            }

            refreshPreview();
        }
    } catch (error) {
        console.error('Action failed:', error);
    }
}

document.getElementById('color-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    formData.append('update_colors', '1');

    try {
        const response = await fetch(window.location.href, {
            method: 'POST',
            body: formData,
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });

        if (response.ok) {
            refreshPreview();
        }
    } catch (error) {
        console.error('Color update failed:', error);
    }
});

window.onload = () => switchCategory('T-Shirt');
</script>

<?php include '../main/footer.php'; ?>