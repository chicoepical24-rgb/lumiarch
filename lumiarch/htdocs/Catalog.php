<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
session_start();

require_once('./main/database.php');

$owned_items = [];
$user_coins = 0;

if (isset($_SESSION['user_id'])) {
    $user_id = $_SESSION['user_id'];
    $u_sql = "SELECT coins, avatar_data FROM Users WHERE id = ?";
    $u_stmt = $conn->prepare($u_sql);
    $u_stmt->bind_param("i", $user_id);
    $u_stmt->execute();
    $u_res = $u_stmt->get_result()->fetch_assoc();
    
    $user_coins = $u_res['coins'] ?? 0;
}

$sql = "SELECT id, name, price, type FROM Catalog WHERE type IN ('T-Shirt', 'Shirt', 'Pants') ORDER BY id DESC";
$result = $conn->query($sql);

$pageTitle = "LUMISLE Catalog";
include './main/header.php';
?>

<link rel="stylesheet" href="/main/CSS/style.css">

<div class="content-wrapper">
    <div class="catalog-container">
        <h2 style="text-align: left;">Catalog</h2>
        <hr>

        <div class="catalog-grid">
            <?php if ($result && $result->num_rows > 0): ?>
                <?php while($item = $result->fetch_assoc()): ?>
                    <?php
                        $folder = strtolower(str_replace('-', '', $item['type'])); 
                    ?>
                    <a href="./Item.php?id=<?php echo $item['id']; ?>" class="item-card">
                        <img src="./avatar/catalog/<?php echo $folder; ?>/<?php echo $item['id']; ?>.png" alt="Item">
                        <span class="item-name"><?php echo htmlspecialchars($item['name']); ?></span>
                        <span class="item-price">
                            Price: <?php echo ($item['price'] == 0) ? "Free" : $item['price']; ?>
                        </span>
                    </a>
                <?php endwhile; ?>
            <?php else: ?>
                <p>No items found.</p>
            <?php endif; ?>
        </div>
    </div>
</div>

<?php include './main/footer.php'; ?>