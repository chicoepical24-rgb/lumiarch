<?php
error_reporting(0);
ini_set('display_errors', 0);

include 'main/database.php';

if (isset($_GET['id'])) {
    $gameId = (int)$_GET['id'];
    
    // Updated table name to "Games" (Case-Sensitive)
    $sql = "SELECT gamedata FROM Games WHERE id = $gameId LIMIT 1";
    $result = $conn->query($sql);

    if ($result && $row = $result->fetch_assoc()) {
        if (ob_get_length()) ob_clean();
        header('Content-Type: text/xml; charset=utf-8');
        echo trim($row['gamedata']);
        exit;
    } else {
        echo "Error: Game ID $gameId not found in table 'Games'. Check your ID number in phpMyAdmin.";
    }
}
$conn->close();