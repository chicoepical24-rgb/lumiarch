<?php
// No spaces before this tag!
error_reporting(E_ALL);
ini_set('display_errors', 1);

echo "Step 1: PHP is alive.<br>";

$path = 'main/database.php';
if (file_exists($path)) {
    echo "Step 2: Database file found.<br>";
    include $path;
    echo "Step 3: Database file included.<br>";
} else {
    echo "Step 2 Failure: Cannot find $path<br>";
}

if (isset($conn)) {
    echo "Step 4: Connection variable exists.<br>";
    if ($conn->connect_error) {
        echo "Step 5: Connection failed: " . $conn->connect_error;
    } else {
        echo "Step 5: Connection successful!<br>";
    }
}
// No closing tag to prevent whitespace errors