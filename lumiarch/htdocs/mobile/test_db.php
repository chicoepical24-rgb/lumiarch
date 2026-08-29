<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

include 'main/database.php';

$result = $conn->query("SHOW TABLES LIKE 'games'");
if ($result->num_rows == 0) {
    echo "ERROR: Table 'games' does not exist in database " . $dbname;
} else {
    echo "SUCCESS: Table 'games' found!";
    
    $check = $conn->query("SELECT id FROM games LIMIT 1");
    if($check) {
        echo "<br>Row check passed.";
    } else {
        echo "<br>Query failed: " . $conn->error;
    }
}
?>