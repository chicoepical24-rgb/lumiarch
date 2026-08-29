<?php
    ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
$base_url = "/"; 
$pageTitle = "My Home Page (Direct Includes)"; 

include 'main/header.php';
require_once ('main/database.php');
if ($conn->connect_error) {
    die("<p class='error'>Connection failed: " . $conn->connect_error . "</p>");
}


$sql = "SELECT id, name, created, gamedata FROM Games ORDER BY id DESC";
$result = $conn->query($sql);

if ($result->num_rows > 0) {
    echo '<div>';

    while($row = $result->fetch_assoc()) {
        echo '<div class="game-item" style="display: inline-block; vertical-align: bottom; margin-right: 20px; text-align: center;">';
            echo "<img src='thumbnails/game.png' class='thumbnail-container' style='display: block; margin-bottom: 5px;'>";
            echo "<a class='normala game-text' href='Place?id=1'>" . $row["name"] . "</a>";
            echo "<span class='game-text'>" . $row["created"] . "</span>";
            echo "<a href='Legacy_Client/index.html?gameid=" . $row["id"] . "'><button type='button' class='button'>Play</button></a>";
        echo '</div>';
    }

    echo '</div>';
} else {
    echo "<p>no games</p>";
}

$conn->close();
?>

</body>
</html>

<?php
include 'main/footer.php';
?>