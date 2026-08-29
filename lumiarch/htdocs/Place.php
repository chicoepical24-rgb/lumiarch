<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

// Ensure session is started to check for user_id
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$base_url = "/"; 
$pageTitle = "Game Details"; 

include 'main/header.php';
require_once ('main/database.php');

if ($conn->connect_error) {
    die("<p class='error'>Connection failed: " . $conn->connect_error . "</p>");
}

$gameId = isset($_GET['id']) ? intval($_GET['id']) : 0;
$loggedInUserId = isset($_SESSION['user_id']) ? intval($_SESSION['user_id']) : 0;

if ($gameId > 0) {
    $sql = "SELECT Games.id, Games.name, Games.bio, Games.created, Games.thumbnail, Games.creator_id, Users.username 
            FROM Games 
            LEFT JOIN Users ON Games.creator_id = Users.id 
            WHERE Games.id = ?";
            
    $stmt = $conn->prepare($sql);
    $stmt->bind_param("i", $gameId);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result->num_rows > 0) {
        $row = $result->fetch_assoc();
        $isOwner = ($loggedInUserId > 0 && $loggedInUserId === intval($row['creator_id']));
        
        echo '<div id="GameContainer" style="width: 900px; margin: 0 auto; font-family: Arial, sans-serif;">';
            echo '<h1 style="font-size: 28px; font-weight: bold; margin-bottom: 10px;">' . htmlspecialchars($row["name"]) . '</h1>';
            
            echo '<div style="display: flex; gap: 20px;">';
                
                // Left Column: Thumbnail and Bio
                echo '<div style="flex: 1;">';
                    echo "<iframe src='thumbnails/Game.php?id=" . $row["id"] . "' 
                            style='width: 600px; height: 360px; border: 1px solid #ccc; display: block;'
                            scrolling='no' 
                            frameborder='0'>
                          </iframe>";
                    
                    echo '<div style="margin-top: 15px;">';
                        echo "<p style='font-size: 14px;'>" . nl2br(htmlspecialchars($row["bio"])) . "</p>";
                    echo '</div>';
                echo '</div>';

                // Right Column: Sidebar
                echo '<div style="width: 250px;">';
                    echo '<div style="display: flex; align-items: center; gap: 10px; margin-bottom: 20px;">';
                        
                        // Integrated Render Iframe
                        echo '<iframe src="../thumbnails/Render.php?id=' . $row["creator_id"] . '" width="60" height="60" frameborder="0" style="border: 1px solid #ccc; overflow: hidden;" scrolling="no"></iframe>';
                        
                        echo '<div style="font-size: 13px;">';
                            echo '<span>Builder:</span><br>';
                            echo '<a href="User.php?id=' . $row["creator_id"] . '" style="color: #0055ff; text-decoration: none; font-weight: bold;">' . ($row["username"] ?? "Unknown") . '</a>';
                        echo '</div>';
                    echo '</div>';

                    // Play Button logic
                    if ($loggedInUserId > 0) {
                        echo "<a href='../Game_Client/index.html?gameid=" . $row["id"] . "' style='display: block; width: 100%; background: #008000; color: white; text-align: center; padding: 12px 0; text-decoration: none; font-size: 20px; font-weight: bold; margin-bottom: 10px;'>Play</a>";
                        
                        // --- EDIT BUTTON INJECTION ---
                        if ($isOwner) {
                            echo "<a href='My/edit_game.php?id=" . $row["id"] . "' style='display: block; width: 100%; background: #666; color: white; text-align: center; padding: 8px 0; text-decoration: none; font-size: 16px; font-weight: bold; margin-bottom: 20px;'>Configure</a>";
                        }
                    } else {
                        echo "<a href='login.php' style='display: block; width: 100%; background: #008000; color: white; text-align: center; padding: 12px 0; text-decoration: none; font-size: 18px; font-weight: bold;margin-bottom: 20px;'>Login to Play</a>";
                    }

                    echo '<div style="font-size: 12px; line-height: 1.6; border-top: 1px solid #eee; padding-top: 10px;">';
                        echo '<strong>Created:</strong> ' . date("m/d/Y", strtotime($row["created"])) . '<br>';
                    echo '</div>';
                echo '</div>';
                
            echo '</div>';
        echo '</div>';
    } else {
        echo "<p>Game not found.</p>";
    }
    $stmt->close();
} else {
    echo "<p>Invalid Game ID.</p>";
}

$conn->close();
include 'main/footer.php';
?>