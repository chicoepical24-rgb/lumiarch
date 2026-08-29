<?php
ob_start();
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
session_start();

$base_url = "/"; 
require_once 'main/database.php';

$username = '';
$error_message = '';

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    
    $username = trim($_POST['username']);
    $password_input = $_POST['password'];
    
    if (empty($username) || empty($password_input)) {
        $error_message = "Please enter both username and password.";
    } else {
        
        $sql = "SELECT id, username, passwordhash FROM Users WHERE username = ?";
        $stmt = $conn->prepare($sql);
        $stmt->bind_param("s", $username);
        $stmt->execute();
        $result = $stmt->get_result();
        
        if ($result->num_rows === 1) {
            
            $user = $result->fetch_assoc();
            $stored_hash = $user['passwordhash'];
            
            if (password_verify($password_input, $stored_hash)) {
                
                $_SESSION['loggedin'] = true;
                $_SESSION['user_id'] = $user['id'];
                $_SESSION['username'] = $user['username'];
                
                // Clear the buffer and go to Home
                ob_end_clean(); 
                header("Location: Home.php");
                exit; 
            } else {
                $error_message = "Invalid username or password.";
            }
        } else {
            $error_message = "Invalid username or password.";
        }
        
        $stmt->close();
    }
}

// Header is included only if no redirect happened
include 'main/header.php'; 
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>User Login</title>
</head>
<body>
<div class="login-container">
    <h2>Login to Lumisle</h2>

    <?php if (!empty($error_message)): ?>
        <div class='error' style="color: red;"><?php echo htmlspecialchars($error_message); ?></div>
    <?php endif; ?>

    <form action="Login.php" method="post">
        
        <input class="input-login" type="text" id="username" name="username" placeholder="Username" required>
        
        <br><br>

        <input class="input-login" type="password" id="password" name="password" placeholder="Password" required>
        
        <br><br>

        <button class="btn-login" type="submit">Log In</button>
    </form>
    <div class="accounthave" style="text-align: center;">
        <p class="blackmenutext" >Dont have an account?   
    <a class="blackmenutext" style="font-weight: bold" href="<?php echo $base_url; ?>SignUp.php">Sign Up</a>!
        </p>
        </div>
</div>
</body>
</html>

<?php
include 'main/footer.php';
ob_end_flush();
?>