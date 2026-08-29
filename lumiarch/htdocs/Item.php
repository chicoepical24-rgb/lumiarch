<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
session_start();

require_once('./main/database.php');

$itemId = isset($_GET['id']) ? intval($_GET['id']) : 0;

// Fetch item details
$stmt = $conn->prepare("SELECT id, name, description, price, type FROM Catalog WHERE id = ?");
$stmt->bind_param("i", $itemId);
$stmt->execute();
$item = $stmt->get_result()->fetch_assoc();

if (!$item) {
    die("Item not found.");
}

$user_id = $_SESSION['user_id'] ?? null;
$owned = false;
$user_coins = 0;

if ($user_id) {
    // Get user info for purchase logic
    $u_stmt = $conn->prepare("SELECT coins, owned_items FROM Users WHERE id = ?");
    $u_stmt->bind_param("i", $user_id);
    $u_stmt->execute();
    $userData = $u_stmt->get_result()->fetch_assoc();
    
    $user_coins = $userData['coins'];
    $owned_array = json_decode($userData['owned_items'] ?? '[]', true) ?: [];
    $owned = in_array($itemId, $owned_array);
}

// Handle Purchase
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['buy']) && $user_id && !$owned) {
    if ($user_coins >= $item['price']) {
        $user_coins -= $item['price'];
        $owned_array[] = $itemId;
        $new_owned_json = json_encode($owned_array);

        $update = $conn->prepare("UPDATE Users SET coins = ?, owned_items = ? WHERE id = ?");
        $update->bind_param("isi", $user_coins, $new_owned_json, $user_id);
        $update->execute();
        
        // Refresh to show "Owned" status
        header("Location: ./Item.php?id=" . $itemId);
        exit;
    } else {
        $error = "You do not have enough coins!";
    }
}

$pageTitle = htmlspecialchars($item['name']);
include './main/header.php';
?>

<link rel="stylesheet" href="/main/CSS/style.css">

<div class="content-wrapper">
    <div class="item-container">
        <div class="item-image">
            <?php 
                $folder = strtolower(str_replace('-', '', $item['type'])); 
            ?>
            <img src="./avatar/catalog/<?php echo $folder; ?>/<?php echo $item['id']; ?>.png" width="250">
        </div>

        <div class="item-info">
            <h1 style="text-align: left;"><?php echo htmlspecialchars($item['name']); ?></h1>
            <p><b>Type:</b> <?php echo htmlspecialchars($item['type']); ?></p>
            <p><?php echo htmlspecialchars($item['description']); ?></p>
            <hr>
            
            <p class="price-text">Price: <?php echo ($item['price'] == 0) ? "Free" : $item['price'] . " Coins"; ?></p>

            <?php if (!$user_id): ?>
                <p><i>Please log in to purchase this item.</i></p>
            <?php elseif ($owned): ?>
                <button class="buy-btn" disabled>Already Owned</button>
            <?php else: ?>
                <form method="POST">
                    <button type="submit" name="buy" class="buy-btn">Buy Now</button>
                </form>
                <?php if (isset($error)) echo "<p class='error-msg'>$error</p>"; ?>
            <?php endif; ?>
        </div>
    </div>
</div>

<?php include './main/footer.php'; ?>