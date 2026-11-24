<?php
// A small contact form. The data is not sent anywhere —
// it is displayed on the same page, which makes it easy to learn from.

$name = '';
$email = '';
$message = '';
$errors = [];
$sent = false;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $name = trim($_POST['name'] ?? '');
    $email = trim($_POST['email'] ?? '');
    $message = trim($_POST['message'] ?? '');

    if ($name === '') {
        $errors[] = 'Please tell me your name.';
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $errors[] = 'Please check the email address — it looks incorrect.';
    }
    if ($message === '') {
        $errors[] = 'Add a few words about your project.';
    }

    if (count($errors) === 0) {
        $sent = true;
    }
}
?>
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Contact — PHP form</title>
    <link rel="stylesheet" href="style.css">
  </head>
  <body>
    <!-- This page runs on PHP. Try submitting the form with empty fields. -->
    <main class="page">
      <p class="eyebrow">PHP example</p>

      <?php if ($sent): ?>
        <section class="success">
          <h1>Thank you, <?= htmlspecialchars($name, ENT_QUOTES, 'UTF-8') ?>!</h1>
          <p>Your message has been received:</p>
          <blockquote><?= nl2br(htmlspecialchars($message, ENT_QUOTES, 'UTF-8')) ?></blockquote>
          <p class="muted">Reply address: <?= htmlspecialchars($email, ENT_QUOTES, 'UTF-8') ?></p>
          <a class="button" href="index.php">Write again</a>
        </section>
      <?php else: ?>
        <h1>Write to me</h1>
        <p class="lead">Fill in the fields below and press "Send".</p>

        <?php if (count($errors) > 0): ?>
          <ul class="errors" role="alert">
            <?php foreach ($errors as $error): ?>
              <li><?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8') ?></li>
            <?php endforeach; ?>
          </ul>
        <?php endif; ?>

        <form action="index.php" method="post">
          <label for="name">What is your name?</label>
          <input type="text" id="name" name="name" value="<?= htmlspecialchars($name, ENT_QUOTES, 'UTF-8') ?>" autocomplete="name">

          <label for="email">Email address</label>
          <input type="email" id="email" name="email" value="<?= htmlspecialchars($email, ENT_QUOTES, 'UTF-8') ?>" autocomplete="email">

          <label for="message">Message</label>
          <textarea id="message" name="message" rows="5"><?= htmlspecialchars($message, ENT_QUOTES, 'UTF-8') ?></textarea>

          <button type="submit">Send</button>
        </form>
      <?php endif; ?>
    </main>
  </body>
</html>
