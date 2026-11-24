<?php
// Простая форма обратной связи. Данные никуда не отправляются,
// а показываются прямо на этой странице — так удобно учиться.

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
        $errors[] = 'Напишите, как к вам обращаться.';
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $errors[] = 'Проверьте адрес почты — он выглядит не так.';
    }
    if ($message === '') {
        $errors[] = 'Добавьте пару слов о задаче.';
    }

    if (count($errors) === 0) {
        $sent = true;
    }
}
?>
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Обратная связь — PHP-форма</title>
    <link rel="stylesheet" href="style.css">
  </head>
  <body>
    <!-- Страница работает через PHP. Попробуйте отправить форму с пустыми полями. -->
    <main class="page">
      <p class="eyebrow">Пример на PHP</p>

      <?php if ($sent): ?>
        <section class="success">
          <h1>Спасибо, <?= htmlspecialchars($name, ENT_QUOTES, 'UTF-8') ?>!</h1>
          <p>Ваше сообщение получено:</p>
          <blockquote><?= nl2br(htmlspecialchars($message, ENT_QUOTES, 'UTF-8')) ?></blockquote>
          <p class="muted">Почта для ответа: <?= htmlspecialchars($email, ENT_QUOTES, 'UTF-8') ?></p>
          <a class="button" href="index.php">Написать ещё раз</a>
        </section>
      <?php else: ?>
        <h1>Напишите мне</h1>
        <p class="lead">Заполните поля ниже и нажмите «Отправить».</p>

        <?php if (count($errors) > 0): ?>
          <ul class="errors" role="alert">
            <?php foreach ($errors as $error): ?>
              <li><?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8') ?></li>
            <?php endforeach; ?>
          </ul>
        <?php endif; ?>

        <form action="index.php" method="post">
          <label for="name">Как вас зовут?</label>
          <input type="text" id="name" name="name" value="<?= htmlspecialchars($name, ENT_QUOTES, 'UTF-8') ?>" autocomplete="name">

          <label for="email">Электронная почта</label>
          <input type="email" id="email" name="email" value="<?= htmlspecialchars($email, ENT_QUOTES, 'UTF-8') ?>" autocomplete="email">

          <label for="message">Сообщение</label>
          <textarea id="message" name="message" rows="5"><?= htmlspecialchars($message, ENT_QUOTES, 'UTF-8') ?></textarea>

          <button type="submit">Отправить</button>
        </form>
      <?php endif; ?>
    </main>
  </body>
</html>
