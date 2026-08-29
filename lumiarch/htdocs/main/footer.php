</div>

    <?php if (isset($_SESSION['loggedin']) && $_SESSION['loggedin'] === true): ?>
<div id="footer">
   <?php else: ?>
    <div id="footer" style="width: 100%; margin-left: 0;">
    <?php endif; ?>
        <p>&copy; <?php echo date("Y"); ?> Lumisle. All rights reserved.</p>
<p>This uses galaxia.ct.ws content with permission</p>
    </div>
</body>
</html>