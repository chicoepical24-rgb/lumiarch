<?php
$base_url = "/"; 
$pageTitle = "My Home Page (Direct Includes)"; 

include 'main/header.php';
?>

    <p class="bigtext">
    Error code <?php echo isset($_GET['code']) ? htmlspecialchars($_GET['code']) : ''; ?>
</p>
<p class="description">
    <?php 
    $code = isset($_GET['code']) ? $_GET['code'] : '';

    switch($code) {
        case '200':
        	echo "Everything works perfectly, why are you seeing this?";
        	break;
        case '404':
            echo "Whoops! This page dosen't exist.";
            break;
        case '403':
            echo "You are not allowed to access this page.";
            break;
        case '500':
            echo "The server couldn't find it.";
            break;
        default:
            echo "Error " . htmlspecialchars($code);
    }
    ?>
</p>

<?php
include 'main/footer.php';
?>