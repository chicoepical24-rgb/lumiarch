<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

require_once('../main/database.php');

$id = isset($_GET['id']) ? intval($_GET['id']) : 3;

$sql = "SELECT avatar_data FROM Users WHERE id = ?";
$stmt = $conn->prepare($sql);
$stmt->bind_param("i", $id);
$stmt->execute();
$result = $stmt->get_result();
$user = $result->fetch_assoc();

$colors = json_decode($user['avatar_data'], true) ?: [
    "head" => "#E5CC87",
    "torso" => "#0D5F97",
    "left_arm" => "#E5CC87",
    "right_arm" => "#E5CC87",
    "left_leg" => "#A2AD91",
    "right_leg" => "#A2AD91"
];
?>
<!DOCTYPE html>
<html>
<head>
    <style>
        /* Fill the entire iframe area */
        html, body { 
            margin: 0; 
            padding: 0; 
            width: 100%; 
            height: 100%; 
            overflow: hidden; 
            background: transparent; 
        }
        
        .avatar-frame {
            position: relative;
            width: 100%;
            height: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
        }

        .part {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-repeat: no-repeat;
            background-size: contain; /* This makes parts scale with the div */
            background-position: center;
            -webkit-mask-size: contain;
            mask-size: contain;
            -webkit-mask-repeat: no-repeat;
            mask-position: center;
        }

        .l-leg { -webkit-mask-image: url('../avatar/leftleg.png'); background-color: <?php echo $colors['left_leg']; ?>; }
        .r-leg { -webkit-mask-image: url('../avatar/rightleg.png'); background-color: <?php echo $colors['right_leg']; ?>; }
        .l-arm { -webkit-mask-image: url('../avatar/leftarm.png'); background-color: <?php echo $colors['left_arm']; ?>; }
        .torso { -webkit-mask-image: url('../avatar/torso.png'); background-color: <?php echo $colors['torso']; ?>; }
        .r-arm { -webkit-mask-image: url('../avatar/rightarm.png'); background-color: <?php echo $colors['right_arm']; ?>; }
        .head  { -webkit-mask-image: url('../avatar/head.png'); background-color: <?php echo $colors['head']; ?>; }
    </style>
</head>
<body>
    <div class="avatar-frame">
        <div class="part l-leg"></div>
        <div class="part r-leg"></div>
        <div class="part l-arm"></div>
        <div class="part torso"></div>
        <div class="part r-arm"></div>
        <div class="part head"></div>
    </div>
</body>
</html>