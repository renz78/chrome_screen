// background.js - Service Worker для розширення Chrome з використанням chrome.alarms

const ALARM_NAME = 'autoScreenshot';

// Ініціалізація при запуску
chrome.runtime.onStartup.addListener(initializeAutoScreenshot);
chrome.runtime.onInstalled.addListener(initializeAutoScreenshot);

async function initializeAutoScreenshot() {
    try {
        const result = await chrome.storage.sync.get(['autoCapture', 'captureInterval', 'uploadUrl']);
        
        console.log('Завантажені налаштування при ініціалізації:', result);
        
        // Перевіряємо чи потрібно запустити автоскріншоти
        if (result.autoCapture && result.uploadUrl) {
            await startAutoScreenshot(result.captureInterval || 60, result.uploadUrl);
        } else {
            // Якщо налаштування не активні, зупиняємо будь-які існуючі alarm'и
            await stopAutoScreenshot();
        }
    } catch (error) {
        console.error('Помилка ініціалізації:', error);
    }
}

// Функція для отримання поточних налаштувань
async function getCurrentSettings() {
    const result = await chrome.storage.sync.get(['autoCapture', 'captureInterval', 'uploadUrl']);
    return {
        enabled: result.autoCapture || false,
        interval: result.captureInterval || 60,
        uploadUrl: result.uploadUrl || ''
    };
}

// Обробник повідомлень
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Отримано повідомлення:', request);
    
    if (request.action === 'captureScreen') {
        captureAndUpload(request.uploadUrl)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({success: false, error: error.message}));
        return true;
    }
    
    if (request.action === 'toggleAutoCapture') {
        handleToggleAutoCapture(request)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({success: false, error: error.message}));
        return true;
    }
    
    if (request.action === 'updateInterval') {
        handleUpdateInterval(request)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({success: false, error: error.message}));
        return true;
    }
    
    if (request.action === 'quickScreenshot') {
        getCurrentSettings().then(settings => {
            if (settings.uploadUrl) {
                captureAndUpload(settings.uploadUrl)
                    .then(result => console.log('Швидкий скріншот:', result))
                    .catch(error => console.error('Помилка швидкого скріншота:', error));
            }
        });
        return true;
    }
    
    if (request.action === 'testAutoScreenshot') {
        chrome.alarms.get(ALARM_NAME, async (alarm) => {
            const settings = await getCurrentSettings();
            sendResponse({
                settings: settings,
                alarmActive: !!alarm,
                alarmInfo: alarm
            });
        });
        return true;
    }
});

async function handleToggleAutoCapture(request) {
    console.log('Перемикання автоскріншотів:', request);
    
    // Зберігаємо налаштування в chrome.storage
    await chrome.storage.sync.set({
        autoCapture: request.enabled,
        captureInterval: request.interval,
        uploadUrl: request.uploadUrl
    });
    
    console.log('Налаштування збережено в storage');
    
    if (request.enabled && request.uploadUrl) {
        await startAutoScreenshot(request.interval, request.uploadUrl);
        return {success: true, message: 'Автоматичні скріншоти увімкнено'};
    } else {
        await stopAutoScreenshot();
        return {success: true, message: 'Автоматичні скріншоти вимкнено'};
    }
}

async function handleUpdateInterval(request) {
    console.log('Оновлення інтервалу:', request.interval);
    
    // Зберігаємо новий інтервал
    await chrome.storage.sync.set({captureInterval: request.interval});
    
    const settings = await getCurrentSettings();
    if (settings.enabled && settings.uploadUrl) {
        await stopAutoScreenshot();
        await startAutoScreenshot(request.interval, settings.uploadUrl);
    }
    return {success: true};
}

async function startAutoScreenshot(interval, uploadUrl) {
    try {
        // Спочатку зупиняємо попередній alarm
        await stopAutoScreenshot();
        
        if (!uploadUrl) {
            console.error('URL для відправки не встановлено');
            return;
        }
        
        console.log(`Запуск автоматичних скріншотів кожні ${interval} секунд на URL: ${uploadUrl}`);
        
        // Створюємо alarm для періодичного виконання
        await chrome.alarms.create(ALARM_NAME, {
            delayInMinutes: interval / 60,
            periodInMinutes: interval / 60
        });
        
        console.log('Alarm створено успішно');
        
        // Створюємо перший скріншот відразу
        setTimeout(async () => {
            try {
                console.log('Створення початкового автоматичного скріншота...');
                await performAutoScreenshot();
            } catch (error) {
                console.error('Помилка початкового скріншота:', error);
            }
        }, 5000);
        
    } catch (error) {
        console.error('Помилка запуску автоскріншотів:', error);
    }
}

async function stopAutoScreenshot() {
    return new Promise((resolve) => {
        chrome.alarms.clear(ALARM_NAME, (wasCleared) => {
            if (wasCleared) {
                console.log('Автоматичні скріншоти зупинено');
            }
            resolve();
        });
    });
}

// Обробник alarm'ів
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === ALARM_NAME) {
        console.log('Alarm спрацював:', alarm);
        await performAutoScreenshot();
    }
});

async function performAutoScreenshot() {
    try {
        // ВАЖЛИВО: Завжди читаємо налаштування з storage, а не з змінних в пам'яті
        const settings = await getCurrentSettings();
        console.log('Поточні налаштування для автоскріншота:', settings);
        
        if (!settings.enabled) {
            console.log('Автоскріншоти вимкнені, зупиняємо alarm');
            await stopAutoScreenshot();
            return;
        }
        
        if (!settings.uploadUrl) {
            console.log('URL не встановлено, зупиняємо alarm');
            await stopAutoScreenshot();
            return;
        }
        
        console.log('Створення автоматичного скріншота...');
        const result = await captureAndUpload(settings.uploadUrl);
        
        if (result.success) {
            console.log('Автоматичний скріншот успішно відправлено');
            
            // Показуємо нотифікацію
            try {
                await chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
                    title: 'Screenshot Sender',
                    message: `Автоскріншот відправлено о ${new Date().toLocaleTimeString()}`
                });
            } catch (notifError) {
                console.log('Нотифікації недоступні:', notifError);
            }
        } else {
            console.error('Помилка автоматичного скріншота:', result.error);
            
            // При помилці показуємо нотифікацію з помилкою
            try {
                await chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
                    title: 'Screenshot Sender - Помилка',
                    message: `Помилка автоскріншота: ${result.error}`
                });
            } catch (notifError) {
                console.log('Нотифікації недоступні:', notifError);
            }
        }
    } catch (error) {
        console.error('Помилка при автоматичному скріншоті:', error);
    }
}

async function captureAndUpload(uploadUrl) {
    try {
        // Отримуємо всі вкладки поточного вікна
        const tabs = await chrome.tabs.query({currentWindow: true});
        
        if (tabs.length === 0) {
            throw new Error('Не вдалося знайти вкладки');
        }
        
        // Знаходимо активну вкладку або беремо першу доступну
        let activeTab = tabs.find(tab => tab.active);
        if (!activeTab) {
            activeTab = tabs.find(tab => tab.url && !tab.url.startsWith('chrome://'));
            if (!activeTab) {
                activeTab = tabs[0];
            }
        }
        
        console.log('Створення скріншота для вкладки:', activeTab.title);

        // Перевіряємо чи можемо зробити скріншот цієї вкладки
        if (activeTab.url && activeTab.url.startsWith('chrome://')) {
            throw new Error('Неможливо зробити скріншот системної сторінки Chrome');
        }

        // Робимо скріншот видимої області
        const dataUrl = await chrome.tabs.captureVisibleTab(activeTab.windowId, {
            format: 'png',
            quality: 90
        });

        if (!dataUrl) {
            throw new Error('Не вдалося створити скріншот');
        }

        // Конвертуємо dataUrl в blob
        const response = await fetch(dataUrl);
        const blob = await response.blob();

        if (blob.size === 0) {
            throw new Error('Створений скріншот порожній');
        }

        console.log('Розмір скріншота:', blob.size, 'байт');

        // Відправляємо на сервер
        const uploadResult = await uploadScreenshot(blob, uploadUrl, activeTab);
        
        return {success: true, data: uploadResult};
        
    } catch (error) {
        console.error('Помилка при створенні скріншота:', error);
        return {success: false, error: error.message};
    }
}

async function uploadScreenshot(blob, uploadUrl, tabInfo = null) {
    try {
        console.log('Відправка скріншота на:', uploadUrl);
        
        // Створюємо FormData
        const formData = new FormData();
        formData.append('screenshot', blob, `screenshot_${Date.now()}.png`);
        formData.append('timestamp', new Date().toISOString());
        
        // Додаємо інформацію про вкладку якщо є
        if (tabInfo) {
            formData.append('url', tabInfo.url || '');
            formData.append('title', tabInfo.title || '');
            formData.append('tabId', tabInfo.id ? tabInfo.id.toString() : '');
        }
        
        // Перевіряємо чи це автоскріншот
        const settings = await getCurrentSettings();
        formData.append('type', settings.enabled ? 'auto' : 'manual');
        
        formData.append('userAgent', navigator.userAgent);
        formData.append('extensionVersion', chrome.runtime.getManifest().version);

        // Відправляємо POST запит з timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(uploadUrl, {
            method: 'POST',
            body: formData,
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Невідома помилка сервера');
            throw new Error(`HTTP помилка! статус: ${response.status}, відповідь: ${errorText}`);
        }

        const result = await response.text();
        console.log('Скріншот успішно відправлено. Відповідь сервера:', result);
        
        return result;
        
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('Час очікування відповіді від сервера вичерпано');
        }
        console.error('Помилка відправки:', error);
        throw new Error(`Не вдалося відправити скріншот: ${error.message}`);
    }
}

// Слухач змін в storage для синхронізації налаштувань
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync') {
        console.log('Зміни в storage:', changes);
        
        if (changes.autoCapture || changes.uploadUrl || changes.captureInterval) {
            // Повторно ініціалізуємо при зміні налаштувань
            initializeAutoScreenshot();
        }
    }
});

// Обробка пробудження розширення
chrome.runtime.onConnect.addListener((port) => {
    console.log('Розширення підключено');
});

// Додаємо обробник для керування status життєвого циклу Service Worker
self.addEventListener('message', (event) => {
    console.log('Service Worker отримав повідомлення:', event.data);
});

// Функція для підтримки активності Service Worker
function keepServiceWorkerAlive() {
    setInterval(() => {
        chrome.runtime.getPlatformInfo(() => {
            // Просто викликаємо API щоб Service Worker не заснув
        });
    }, 20000); // Кожні 20 секунд
}

// Запускаємо підтримку активності
keepServiceWorkerAlive();

// Логування запуску
console.log('Background script завантажено, час:', new Date().toLocaleString());