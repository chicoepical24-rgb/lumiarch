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
    // Assuming owned_items is stored in your database; if it's in a separate column:
    // $owned_items = json_decode($u_res['owned_items'] ?? '[]', true) ?: [];
}

$sql = "SELECT id, name, price FROM Catalog WHERE type = 'T-Shirt' ORDER BY id DESC";
$result = $conn->query($sql);

$pageTitle = "LUMISLE Catalog";
include './main/header.php';
?>

<style>
    .catalog-container {
        padding: 20px;
    }
    .user-stats {
        margin-bottom: 20px;
        font-family: sans-serif;
        font-weight: bold;
    }
    .catalog-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 15px;
    }
    .item-card {
        border: 1px solid #ccc;
        padding: 10px;
        width: 130px;
        background: #fff;
        text-decoration: none;
        color: #000;
        text-align: center;
    }
    .item-card:hover {
        border-color: #666;
    }
    .item-card img {
        width: 110px;
        height: 110px;
        display: block;
        margin: 0 auto 10px;
    }
    .item-name {
        font-weight: bold;
        font-size: 13px;
        display: block;
        margin-bottom: 5px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .item-price {
        color: #008000;
        font-size: 12px;
        font-weight: bold;
    }
</style>

<div class="catalog-container">
    <h2>Catalog</h2>
    <hr>

    <div class="catalog-grid">
        <?php if ($result && $result->num_rows > 0): ?>
            <?php while($item = $result->fetch_assoc()): ?>
                <a href="./Item.php?id=<?php echo $item['id']; ?>" class="item-card">
                    <img src="../avatar/catalog/<?php echo $item['id']; ?>.png" alt="Item">
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

<?php include './main/footer.php'; ?>