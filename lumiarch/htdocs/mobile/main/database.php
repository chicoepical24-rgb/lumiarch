<?php
    
$servername = "sql301.infinityfree.com";
$username = "if0_41449071"; 
$password = "Si9q195TnIu4hl"; 
$dbname = "if0_41449071_lumisle";

$conn = new mysqli($servername, $username, $password, $dbname);

if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}

?>