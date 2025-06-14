<?php
// server.php - Простий приклад сервера для прийому скріншотів

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Обробка preflight запитів
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Дозволено тільки POST запити']);
    exit();
}

try {
    // Перевіряємо чи є файл
    if (!isset($_FILES['screenshot'])) {
        throw new Exception('Файл скріншота не знайдено');
    }
    
    $uploadedFile = $_FILES['screenshot'];
    
    // Перевірки файлу
    if ($uploadedFile['error'] !== UPLOAD_ERR_OK) {
        throw new Exception('Помилка завантаження файлу: ' . $uploadedFile['error']);
    }
    
    // Перевіряємо тип файлу
    $allowedTypes = ['image/png', 'image/jpeg', 'image/gif'];
    if (!in_array($uploadedFile['type'], $allowedTypes)) {
        throw new Exception('Недозволений тип файлу. Дозволено: PNG, JPEG, GIF');
    }
    
    // Перевіряємо розмір файлу (максимум 10MB)
    $maxSize = 10 * 1024 * 1024; // 10MB
    if ($uploadedFile['size'] > $maxSize) {
        throw new Exception('Файл занадто великий. Максимум 10MB');
    }
    
    // Створюємо папку для збереження якщо її немає
    $uploadDir = 'screenshots/';
    if (!is_dir($uploadDir)) {
        if (!mkdir($uploadDir, 0755, true)) {
            throw new Exception('Не вдалося створити папку для збереження');
        }
    }
    
    // Генеруємо унікальне ім'я файлу
    $timestamp = $_POST['timestamp'] ?? date('Y-m-d_H-i-s');
    $extension = pathinfo($uploadedFile['name'], PATHINFO_EXTENSION);
    $filename = 'screenshot_' . date('Y-m-d_H-i-s') . '_' . uniqid() . '.' . $extension;
    $filepath = $uploadDir . $filename;
    
    // Переміщуємо файл
    if (!move_uploaded_file($uploadedFile['tmp_name'], $filepath)) {
        throw new Exception('Не вдалося зберегти файл');
    }
    
    // Логуємо інформацію
    $logData = [
        'timestamp' => date('Y-m-d H:i:s'),
        'filename' => $filename,
        'size' => $uploadedFile['size'],
        'type' => $uploadedFile['type'],
        'ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown',
        'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? 'unknown',
        'page_url' => $_POST['url'] ?? 'unknown',
        'page_title' => $_POST['title'] ?? 'unknown',
        'tab_id' => $_POST['tabId'] ?? 'unknown',
        'screenshot_type' => $_POST['type'] ?? 'manual' // auto або manual
    ];
    
    file_put_contents('screenshots/log.json', json_encode($logData) . "\n", FILE_APPEND | LOCK_EX);
    
    // Повертаємо успішну відповідь
    echo json_encode([
        'success' => true,
        'message' => 'Скріншот успішно збережено',
        'filename' => $filename,
        'size' => $uploadedFile['size'],
        'timestamp' => date('Y-m-d H:i:s')
    ]);
    
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
?>