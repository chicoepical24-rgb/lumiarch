<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
$base_url = "/"; 
$pageTitle = "LUMISLE Games"; 

include 'main/header.php';
require_once ('main/database.php');

if ($conn->connect_error) {
    die("<p class='error'>Connection failed: " . $conn->connect_error . "</p>");
}

$sql = "SELECT id, name, creator_id, created FROM Games ORDER BY id DESC";
$result = $conn->query($sql);

if ($result->num_rows > 0) {
    echo '<div style="display: flex; flex-wrap: wrap;">';

    while($row = $result->fetch_assoc()) {
        echo '<div class="game-item" style="display: inline-block; vertical-align: bottom; margin-right: 20px; text-align: center; margin-bottom: 20px;">';
            
            // Using iframe to render the THREE.js scene
            echo "<iframe src='../thumbnails/Game.php?id=" . $row["id"] . "' 
                    style='width: 200px; height: 120px; border: 1px solid #000; display: block; margin-bottom: 5px;' 
                    scrolling='no' 
                    frameborder='0'>
                  </iframe>";

            echo "<a class='normala game-text' style='color: blue; ' href='Place?id=" . $row["id"] . "'>" . htmlspecialchars($row["name"]) . "</a>";
            echo "<span class='game-text' style='display:block; font-size: 12px;'>" . $row["created"] . "</span>";
        	echo "<span class='game-text' style='display:block; font-size: 12px;'>" . $row["creator_id"] . "</span>";
        echo '</div>';
    }

    echo '</div>';
} else {
    echo "<p>no games</p>";
}

$conn->close();
include 'main/footer.php';
?>